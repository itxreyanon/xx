const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const { 
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const { makeInMemoryStore } = require('./store');

const config = require('../config');
const logger = require('./logger');
const MessageHandler = require('./message-handler');
const { connectDb } = require('../utils/db');
const ModuleLoader = require('./module-loader');
const { useMongoAuthState } = require('../utils/mongoAuthState');
const readline = require('readline');


class HyperWaBot {
    constructor() {
        this.sock = null;
        this.authPath = './auth_info';
        this.msgRetryCounterCache = new NodeCache();
        this.store = makeInMemoryStore({ 
            logger: logger.child({ module: 'store' }),
            filePath: config.get('store.path', './data/store.json'),
            maxMessagesPerChat: config.get('store.maxMessages', 1000)
        });
        this.messageHandler = new MessageHandler(this);
        this.telegramBridge = null;
        this.isShuttingDown = false;
        this.db = null;
        this.moduleLoader = new ModuleLoader(this);
        this.qrCodeSent = false;
        this.useMongoAuth = config.get('auth.useMongoAuth', false);
    }

    async initialize() {
        logger.info('🔧 Initializing HyperWa Userbot...');

        try {
            this.db = await connectDb();
            logger.info('✅ Database connected successfully!');
        } catch (error) {
            logger.error('❌ Failed to connect to database:', error);
            process.exit(1);
        }

        if (config.get('telegram.enabled')) {
            try {
                const TelegramBridge = require('../telegram/bridge');
                this.telegramBridge = new TelegramBridge(this);
                await this.telegramBridge.initialize();
                logger.info('✅ Telegram bridge initialized');
            } catch (error) {
                logger.warn('⚠️ Telegram bridge failed to initialize:', error.message);
                this.telegramBridge = null;
            }
        }

        await this.moduleLoader.loadModules();
        await this.startWhatsApp();

        logger.info('✅ HyperWa Userbot initialized successfully!');
    }

async startWhatsApp() {
    let state, saveCreds;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (text) => new Promise((resolve) => rl.question(text, resolve));

    if (this.sock) {
        logger.info('🧹 Cleaning up existing WhatsApp socket');
        this.sock.ev.removeAllListeners();
        await this.sock.end();
        this.sock = null;
    }

    if (this.useMongoAuth) {
        logger.info('🔧 Using MongoDB auth state...');
        try {
            ({ state, saveCreds } = await useMongoAuthState());
        } catch (error) {
            logger.error('❌ Failed to initialize MongoDB auth state:', error);
            logger.info('🔄 Falling back to file-based auth...');
            ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
        }
    } else {
        logger.info('🔧 Using file-based auth state...');
        ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
    }

    const { version } = await fetchLatestBaileysVersion();

    try {
        this.sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            version,
            printQRInTerminal: false,
            logger: logger.child({ module: 'baileys' }),
            getMessage: async (key) => ({ conversation: 'Message not found' }),
            browser: ['HyperWa', 'Chrome', '3.0'],
            msgRetryCounterCache: this.msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
        });

        this.store.bind(this.sock.ev);

        const connectionPromise = new Promise(async (resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                if (!this.sock.user) {
                    logger.warn('❌ Authentication timed out after 30 seconds');
                    reject(new Error('Authentication timed out'));
                }
            }, 30000);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, qr, lastDisconnect } = update;

                if (qr && config.get('auth.method') === 'qr') {
                    if (!this.qrCodeSent) {
                        this.qrCodeSent = true;
                        logger.info('📱 WhatsApp QR code generated');
                        qrcode.generate(qr, { small: true });

                        if (this.telegramBridge) {
                            try {
                                await this.telegramBridge.sendQRCode(qr);
                            } catch (error) {
                                logger.warn('⚠️ TelegramBridge failed to send QR:', error.message);
                            }
                        }
                    }
                }

                if (connection === 'connecting' && !this.sock.user && config.get('auth.method') === 'pairing') {
                    if (!this.qrCodeSent) {
                        this.qrCodeSent = true;

                        const phoneNumber = config.get('auth.phoneNumber');
                        if (!phoneNumber) {
                            logger.error('❌ No phone number provided for pairing code');
                            return reject(new Error('Phone number missing for pairing'));
                        }

                        const confirm = await question(`👉 Start pairing with ${phoneNumber}? (y/N): `);
                        if (confirm.toLowerCase() !== 'y') {
                            logger.info('❌ Pairing canceled by user');
                            return process.exit(1);
                        }

                        try {
                            logger.info(`📞 Requesting pairing code for ${phoneNumber}...`);
                            const code = await this.sock.requestPairingCode(phoneNumber);
                            logger.info(`🔑 Pairing Code: ${code}`);
                            if (this.telegramBridge) {
                                await this.telegramBridge.sendText(`🔑 *Pairing Code*: \`\`\`${code}\`\`\``, { parseMode: 'Markdown' });
                            }
                        } catch (err) {
                            logger.error('❌ Failed to request pairing code:', err.message);
                            logger.info('🔄 Falling back to QR code...');
                            config.set('auth.method', 'qr');
                            this.qrCodeSent = false;
                        }
                    }
                }

                if (connection === 'open') {
                    clearTimeout(connectionTimeout);
                    rl.close();
                    resolve();
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode || 0;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    if (shouldReconnect && !this.isShuttingDown) {
                        logger.warn('🔄 Connection closed, reconnecting...');
                        setTimeout(() => this.startWhatsApp(), 5000);
                    } else {
                        logger.error('❌ Connection closed permanently.');
                        process.exit(1);
                    }
                }
            });
        });

        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('messages.upsert', this.messageHandler.handleMessages.bind(this.messageHandler));
        await connectionPromise;
        await this.onConnectionOpen();

    } catch (error) {
        logger.error('❌ Failed to initialize WhatsApp socket:', error);
        setTimeout(() => this.startWhatsApp(), 5000);
    }
}

    async onConnectionOpen() {
        logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`);

        if (!config.get('bot.owner') && this.sock.user) {
            config.set('bot.owner', this.sock.user.id);
            logger.info(`👑 Owner set to: ${this.sock.user.id}`);
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.setupWhatsAppHandlers();
                await this.telegramBridge.syncWhatsAppConnection();
            } catch (err) {
                logger.warn('⚠️ Telegram setup error:', err.message);
            }
        }

        await this.sendStartupMessage();
    }

    async sendStartupMessage() {
        const owner = config.get('bot.owner');
        if (!owner) return;

        const authMethod = this.useMongoAuth ? 'MongoDB' : 'File-based';
        const startupMessage = `🚀 *${config.get('bot.name')} v${config.get('bot.version')}* is now online!\n\n` +
                              `🔥 *HyperWa Features Active:*\n` +
                              `• 📱 Modular Architecture\n` +
                              `• 🔐 Auth Method: ${authMethod}\n` +
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}\n` +
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}\n` +
                              `Type *${config.get('bot.prefix')}help* for available commands!`;

        try {
            await this.sock.sendMessage(owner, { text: startupMessage });
        } catch {}

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.logToTelegram('🚀 HyperWa Bot Started', startupMessage);
            } catch (err) {
                logger.warn('⚠️ Telegram log failed:', err.message);
            }
        }
    }

    async connect() {
        if (!this.sock) {
            await this.startWhatsApp();
        }
        return this.sock;
    }

    async sendMessage(jid, content) {
        if (!this.sock) {
            throw new Error('WhatsApp socket not initialized');
        }
        return await this.sock.sendMessage(jid, content);
    }

    async shutdown() {
        logger.info('🛑 Shutting down HyperWa Userbot...');
        this.isShuttingDown = true;

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.shutdown();
            } catch (err) {
                logger.warn('⚠️ Telegram shutdown error:', err.message);
            }
        }

        if (this.sock) {
            await this.sock.end();
        }

        // Cleanup store
        this.store.cleanup();

        logger.info('✅ HyperWa Userbot shutdown complete');
    }
}

module.exports = { HyperWaBot };
