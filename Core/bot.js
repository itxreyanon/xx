const { Boom } = require('@hapi/boom')
const NodeCache = require('node-cache')
const { 
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadAndProcessHistorySyncNotification,
    getAggregateVotesInPollMessage,
    isJidNewsletter,
    encodeWAM,
    BinaryInfo,
    proto,
    isJidBroadcast,
    isJidGroup,
    delay
} = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs-extra')
const path = require('path')
const readline = require('readline')

const config = require('../config')
const logger = require('./logger')
const MessageHandler = require('./message-handler')
const { connectDb } = require('../utils/db')
const ModuleLoader = require('./module-loader')
const { useMongoAuthState } = require('../utils/mongoAuthState')
const { makeInMemoryStore } = require('./store')

// Readline interface for pairing code
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))

class HyperWaBot {
    constructor() {
        this.sock = null
        this.authPath = './auth_info'
        this.msgRetryCounterCache = new NodeCache()
        this.onDemandMap = new Map()
        this.store = makeInMemoryStore({ 
            logger: logger.child({ module: 'store' }),
            filePath: config.get('store.path', './data/store.json'),
            maxMessagesPerChat: config.get('store.maxMessages', 1000)
        })
        this.messageHandler = new MessageHandler(this)
        this.telegramBridge = null
        this.isShuttingDown = false
        this.db = null
        this.moduleLoader = new ModuleLoader(this)
        this.qrCodeSent = false
        this.useMongoAuth = config.get('auth.useMongoAuth', false)
        this.usePairingCode = config.get('auth.usePairingCode', false)
        this.doReplies = config.get('features.doReplies', false)
    }

    async initialize() {
        logger.info('🔧 Initializing HyperWa Userbot...')

        try {
            this.db = await connectDb()
            logger.info('✅ Database connected successfully!')
        } catch (error) {
            logger.error('❌ Failed to connect to database:', error)
            process.exit(1)
        }

        if (config.get('telegram.enabled')) {
            try {
                const TelegramBridge = require('../telegram/bridge')
                this.telegramBridge = new TelegramBridge(this)
                await this.telegramBridge.initialize()
                logger.info('✅ Telegram bridge initialized')
            } catch (error) {
                logger.warn('⚠️ Telegram bridge failed to initialize:', error.message)
                this.telegramBridge = null
            }
        }

        await this.moduleLoader.loadModules()
        await this.startWhatsApp()

        logger.info('✅ HyperWa Userbot initialized successfully!')
    }

   async startWhatsApp() {
    let state, saveCreds;

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
            logger.error('❌ Failed to initialize MongoDB auth state:', error.stack || error);
            logger.info('🔄 Falling back to file-based auth...');
            try {
                ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
            } catch (fileAuthError) {
                logger.error('❌ Failed to initialize file-based auth state:', fileAuthError.stack || fileAuthError);
                throw fileAuthError; // Rethrow to be caught by the outer try-catch
            }
        }
    } else {
        logger.info('🔧 Using file-based auth state...');
        try {
            ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
        } catch (fileAuthError) {
            logger.error('❌ Failed to initialize file-based auth state:', fileAuthError.stack || fileAuthError);
            throw fileAuthError; // Rethrow to be caught by the outer try-catch
        }
    }

    let version;
    try {
        ({ version } = await fetchLatestBaileysVersion());
        logger.info(`Fetched Baileys version: ${version.join('.')}`);
    } catch (error) {
        logger.error('❌ Failed to fetch latest Baileys version:', error.stack || error);
        throw error;
    }

    try {
        this.sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            msgRetryCounterCache: this.msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
            logger: logger.child({ module: 'baileys' }),
            getMessage: this.getMessage.bind(this),
            browser: ['HyperWa', 'Chrome', '3.0'],
            shouldSyncHistoryMessage: () => true,
            printQRInTerminal: false
        });

        // Bind store to socket events
        this.store.bind(this.sock.ev);

        // Pairing code support
if (this.usePairingCode && !state.creds.registered) {
    try {
        const phoneNumber = await question('📞 Enter WhatsApp number (e.g., +1234567890): ')
        const cleanedNumber = phoneNumber.trim()

        if (!/^\+\d{10,15}$/.test(cleanedNumber)) {
            throw new Error('Invalid phone number format')
        }

        logger.info(`📲 Requesting pairing code for ${cleanedNumber}...`)
        const code = await this.sock.requestPairingCode(cleanedNumber)

        console.log(`\n🔑 YOUR PAIRING CODE: ${code} 🔑\n`)
        logger.info(`✅ Pairing code generated: ${code}`)

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.sendMessage(`🔑 Code: \`${code}\``, { parse_mode: 'Markdown' })
            } catch (err) {
                logger.warn('⚠️ Failed to send code to Telegram:', err.message)
            }
        }
    } catch (err) {
        logger.error('❌ Failed to request pairing code:', {
            message: err.message,
            stack: err.stack
        })
        setTimeout(() => this.startWhatsApp(), 5000)
        return // prevent continuing if pairing failed
    }
}

        // Process all events
        this.sock.ev.process(async (events) => {
            logger.debug('Processing Baileys events:', Object.keys(events));
            // Connection updates
            if (events['connection.update']) {
                const update = events['connection.update'];
                const { connection, lastDisconnect } = update;
                
                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect && !this.isShuttingDown) {
                        logger.warn('🔄 Connection closed, reconnecting...', {
                            statusCode: lastDisconnect?.error?.output?.statusCode,
                            error: lastDisconnect?.error?.message
                        });
                        setTimeout(() => this.startWhatsApp(), 5000);
                    } else {
                        logger.error('❌ Connection closed without reconnect:', {
                            statusCode: lastDisconnect?.error?.output?.statusCode,
                            error: lastDisconnect?.error?.message
                        });
                    }
                } else if (connection === 'open') {
                    await this.onConnectionOpen();
                }
            }

            // Credentials update
            if (events['creds.update']) {
                try {
                    await saveCreds();
                } catch (saveCredsError) {
                    logger.error('❌ Failed to save credentials:', saveCredsError.stack || saveCredsError);
                }
            }

            // History sync
            if (events['messaging-history.set']) {
                const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set'];
                logger.info(`History sync: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs`);
                
                if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
                    this.onDemandMap.set(messages[0].key.id, syncType);
                }
            }

            // Message updates (deletions, reactions, etc)
            if (events['messages.update']) {
                for (const { key, update } of events['messages.update']) {
                    if (update.pollUpdates) {
                        const pollCreation = await this.getMessage(key);
                        if (pollCreation) {
                            const votes = getAggregateVotesInPollMessage({
                                message: pollCreation,
                                pollUpdates: update.pollUpdates,
                            });
                            logger.debug('Poll votes updated:', votes);
                        }
                    }
                }
            }

            // Call events
            if (events.call) {
                logger.debug('Call event:', events.call);
            }

            // Label events
            if (events['labels.association']) {
                logger.debug('Label association:', events['labels.association']);
            }

            if (events['labels.edit']) {
                logger.debug('Label edit:', events['labels.edit']);
            }

            // Newsletter events
            if (events['newsletter.join']) {
                logger.debug('Newsletter join:', events['newsletter.join']);
            }
        });

        await new Promise((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                if (!this.sock.user) {
                    logger.warn('❌ QR code scan timed out after 30 seconds');
                    reject(new Error('QR code scan timed out'));
                }
            }, 30000);

            this.sock.ev.on('connection.update', update => {
                if (update.connection === 'open') {
                    clearTimeout(connectionTimeout);
                    resolve();
                } else if (update.lastDisconnect?.error) {
                    clearTimeout(connectionTimeout);
                    reject(new Error(`Connection failed: ${update.lastDisconnect.error.message}`));
                }
            });
        });

    } catch (error) {
        logger.error('❌ Failed to initialize WhatsApp socket:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        setTimeout(() => this.startWhatsApp(), 5000);
        throw error; // Rethrow to allow main.js to catch and log
    }
}

    async getMessage(key) {
        // Try to get message from store first
        const message = this.store.loadMessage(key.remoteJid, key.id)
        if (message) return message

        // Fallback to default behavior
        return { conversation: 'Message not found' }
    }

    async sendMessageWTyping(jid, content) {
        await this.sock.presenceSubscribe(jid)
        await delay(500)

        await this.sock.sendPresenceUpdate('composing', jid)
        await delay(2000)

        await this.sock.sendPresenceUpdate('paused', jid)

        return this.sock.sendMessage(jid, content)
    }

    async onConnectionOpen() {
        logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`)

        if (!config.get('bot.owner') && this.sock.user) {
            config.set('bot.owner', this.sock.user.id)
            logger.info(`👑 Owner set to: ${this.sock.user.id}`)
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.setupWhatsAppHandlers()
                await this.telegramBridge.syncWhatsAppConnection()
            } catch (err) {
                logger.warn('⚠️ Telegram setup error:', err.message)
            }
        }

        await this.sendStartupMessage()
    }

    async sendStartupMessage() {
        const owner = config.get('bot.owner')
        if (!owner) return

        const startupMessage = `🚀 *${config.get('bot.name')} v${config.get('bot.version')}* is now online!\n\n` +
                              `📊 *Store Stats:*\n` +
                              `• Chats: ${Object.keys(this.store.chats).length}\n` +
                              `• Contacts: ${Object.keys(this.store.contacts).length}\n` +
                              `• Messages: ${Object.keys(this.store.messageIndex.byId).length}\n\n` +
                              `Type *${config.get('bot.prefix')}help* for commands`

        try {
            await this.sock.sendMessage(owner, { text: startupMessage })
        } catch (error) {
            logger.warn('Failed to send startup message:', error)
        }
    }

    async connect() {
        if (!this.sock) {
            await this.startWhatsApp()
        }
        return this.sock
    }

    async sendMessage(jid, content) {
        if (!this.sock) {
            throw new Error('WhatsApp socket not initialized')
        }
        return await this.sock.sendMessage(jid, content)
    }

    async shutdown() {
        logger.info('🛑 Shutting down HyperWa Userbot...')
        this.isShuttingDown = true

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.shutdown()
            } catch (err) {
                logger.warn('⚠️ Telegram shutdown error:', err.message)
            }
        }

        if (this.sock) {
            await this.sock.end()
        }

        // Cleanup store
        this.store.cleanup()

        logger.info('✅ HyperWa Userbot shutdown complete')
        process.exit(0)
    }
}

module.exports = { HyperWaBot }
