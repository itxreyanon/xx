const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    proto,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const NodeCache = require('node-cache'); // Install: npm install node-cache

const config = require('../config');
const logger = require('./logger');
const MessageHandler = require('./message-handler');
const { connectDb } = require('../utils/db');
const ModuleLoader = require('./module-loader');
const { useMongoAuthState } = require('../utils/mongoAuthState');

// --- Add Global Error Handlers (Place near the top) ---
process.on('unhandledRejection', (reason, promise) => {
    logger.error('🚨 Unhandled Rejection at:', { promise, reason: reason instanceof Error ? reason.stack : reason });
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason instanceof Error ? reason.stack : reason);
    // Don't exit immediately, log and investigate. Let main logic decide.
});

process.on('uncaughtException', (err) => {
    logger.error('🔥 Uncaught Exception:', { error: err.stack });
    console.error('🔥 Uncaught Exception:', err);
    // This is a serious error, exit the process after attempting cleanup
    // Ensure shutdown is called if bot instance is accessible globally
    // process.exit(1);
});
// --- End Global Error Handlers ---

class HyperWaBot {
    constructor() {
        this.sock = null;
        this.authPath = path.resolve('./auth_info');
        this.storePath = path.resolve('./baileys_store.json');
        this.messageHandler = new MessageHandler(this);
        this.telegramBridge = null;
        this.isShuttingDown = false;
        this.db = null;
        this.moduleLoader = new ModuleLoader(this);
        this.qrCodeSent = false;
        this.useMongoAuth = config.get('auth.useMongoAuth', false);
        this.usePairing = config.get('auth.usePairing', false);
        this.pairingPhoneNumber = config.get('auth.pairingPhoneNumber', null);
        this.reconnectTimeout = null; // Store reconnect timeout ID

        // --- Store Setup ---
        this.msgRetryCounterCache = new NodeCache({ stdTTL: 600 }); // 10 minutes TTL for retries
        this.keysBuffer = new NodeCache(); // For storing keys

        // In-Memory Store for chats, contacts, messages
        this.store = makeInMemoryStore({
            logger: logger.child({ module: 'baileys-store' })
        });
        // Load store from file if it exists
        if (fs.existsSync(this.storePath)) {
            logger.info(`📂 Loading Baileys store from ${this.storePath}`);
            try {
                this.store.readFromFile(this.storePath);
            } catch (err) {
                logger.warn(`⚠️ Failed to load store from ${this.storePath}:`, err.message);
            }
        }
        // Periodically save the store
        this.storeInterval = setInterval(() => {
            if (this.store) {
                try {
                    this.store.writeToFile(this.storePath);
                    // logger.debug(`💾 Baileys store saved to ${this.storePath}`);
                } catch (err) {
                    logger.warn('⚠️ Failed to save Baileys store:', err.message);
                }
            }
        }, 10_000); // Save every 10 seconds
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

                try {
                    await this.telegramBridge.sendStartMessage();
                } catch (err) {
                    logger.warn('⚠️ Failed to send start message via Telegram:', err.message);
                }
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
        logger.info('🚀 Starting WhatsApp connection...');

        // Clear any existing reconnect timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Clean up existing socket if present
        if (this.sock) {
            logger.info('🧹 Cleaning up existing WhatsApp socket');
            this.sock.ev.removeAllListeners();
            this.sock = null;
        }

        let state, saveCreds;

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

        // --- Create Socket with Full Store Integration ---
        this.sock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'baileys-keys' })),
            },
            logger: logger.child({ module: 'baileys' }),
            // --- Enhanced getMessage using Store ---
            getMessage: async (key) => {
                if (!this.store) return { conversation: 'Message not found (Store not initialized)' };

                try {
                    // Load message from store
                    const msg = await this.store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                } catch (err) {
                    logger.warn(`⚠️ Failed to load message ${key.id} from store:`, err.message);
                    return { conversation: 'Message not found (Store error)' };
                }
            },
            browser: Browsers.macOS('Chrome'), // Use standard browser string
            msgRetryCounterCache: this.msgRetryCounterCache,
            // Optional enhancements
            // generateHighQualityLinkPreview: true,
            // patchMessageBeforeSending: (message) => { ... } // For modifying outgoing messages
        });

        // Bind the store to the socket's event emitter
        // This automatically updates the store with new messages, contacts, etc.
        this.store?.bind(this.sock.ev);

        // --- Use sock.ev.process for event handling ---
        this.sock.ev.process(async (events) => {
            // Events are processed here by the store binding (chats, contacts, messages)
            // We still handle specific logic for connection, creds, and our message handler

            if (events['connection.update']) {
                const update = events['connection.update'];
                const { connection, lastDisconnect, qr } = update;

                if (qr && !this.qrCodeSent) {
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

                if (connection === 'close') {
                    const error = lastDisconnect?.error;
                    const statusCode = new Boom(error)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                                          statusCode !== DisconnectReason.badSession &&
                                          statusCode !== DisconnectReason.connectionClosed &&
                                          statusCode !== DisconnectReason.connectionLost; // Add more specific non-reconnect codes if needed

                    logger.warn(`🔄 Connection update: ${connection}, Status: ${statusCode}, Error: ${error?.message || 'N/A'}`);

                    if (shouldReconnect && !this.isShuttingDown) {
                        logger.warn(`🔄 Reconnecting in 5 seconds...`);
                        this.qrCodeSent = false; // Allow new QR on reconnect
                        this.reconnectTimeout = setTimeout(() => this.startWhatsApp(), 5000);
                    } else {
                        logger.error('❌ Connection closed permanently.', { statusCode, error: error?.message });
                        if (statusCode === DisconnectReason.loggedOut ||
                            statusCode === DisconnectReason.badSession) {
                            logger.info('🗑️ Session invalidated. Clearing session data.');
                            try {
                                if (this.useMongoAuth) {
                                    const db = this.db || (await connectDb());
                                    const coll = db.collection("auth");
                                    await coll.deleteOne({ _id: "session" });
                                    logger.info('🗑️ MongoDB auth session cleared');
                                } else {
                                    await fs.remove(this.authPath);
                                    logger.info(`🗑️ File-based auth directory (${this.authPath}) cleared`);
                                }
                            } catch (clearError) {
                                logger.error('❌ Failed to clear auth session:', clearError);
                            }
                        }
                        if (!this.isShuttingDown) {
                            // Delay exit slightly to allow logs to flush
                            setTimeout(() => process.exit(1), 1000);
                        }
                    }
                } else if (connection === 'open') {
                    logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`);
                    this.qrCodeSent = false;
                    await this.onConnectionOpen();
                }
            }

            if (events['creds.update']) {
                try {
                    await saveCreds();
                } catch (err) {
                    logger.error('❌ Failed to save credentials:', err);
                }
            }

            // Messages are handled by the store binding, but we still pass them to our handler
            // for custom logic (commands, modules, etc.)
            if (events['messages.upsert']) {
                const upsert = events['messages.upsert'];
                try {
                    await this.messageHandler.handleMessages(upsert);
                } catch (handlerError) {
                    logger.error('❌ Error in message handler:', handlerError);
                }
            }
        });

        // --- Pairing Logic ---
        if (this.usePairing && this.pairingPhoneNumber && !state.creds.me?.id) {
            logger.info(`🔐 Requesting pairing code for number: ${this.pairingPhoneNumber}`);
            try {
                const code = await this.sock.requestPairingCode(this.pairingPhoneNumber);
                logger.info(`🔐 Pairing code requested: ${code}`);
                const pairingMessage = `\`\`\`\n🔐 *Pairing Code for ${config.get('bot.name')}*\n\nYour code: ${code}\n\nEnter it in WhatsApp.\`\`\``;

                console.log(pairingMessage);
                if (this.telegramBridge) {
                    try {
                        await this.telegramBridge.logToTelegram('🔐 Pairing Code', pairingMessage);
                    } catch (err) {
                        logger.warn('⚠️ Failed to send pairing code via Telegram:', err.message);
                    }
                }
            } catch (pairingError) {
                logger.error('❌ Failed to request pairing code:', pairingError);
                logger.info('🔄 Falling back to QR code...');
            }
        }
    }

    async onConnectionOpen() {
        logger.info(`✅ WhatsApp connection opened! User: ${this.sock.user?.id || 'Unknown'}`);
        const fullUserId = this.sock.user?.id;
        const jid = fullUserId ? `${fullUserId.split(':')[0]}@s.whatsapp.net` : null;

        if (!config.get('bot.owner') && jid) {
            config.set('bot.owner', jid);
            logger.info(`👑 Owner set to: ${jid}`);
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.setupWhatsAppHandlers();
            } catch (err) {
                logger.warn('⚠️ Failed to setup Telegram WhatsApp handlers:', err.message);
            }
        }

        await this.sendStartupMessage();

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.syncWhatsAppConnection();
            } catch (err) {
                logger.warn('⚠️ Telegram sync error:', err.message);
            }
        }
    }

    async sendStartupMessage() {
        const owner = config.get('bot.owner');
        if (!owner) {
            logger.warn("No owner configured, skipping startup message.");
            return;
        }

        const authMethod = this.useMongoAuth ? 'MongoDB' : 'File-based';
        const startupMessage = `🚀 *${config.get('bot.name')} v${config.get('bot.version')}* is now online!\n\n` +
                              `🔥 *Features:*\n` +
                              `• 📱 Modular Architecture\n` +
                              `• 🔐 Auth: ${authMethod}\n` +
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}\n` +
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}\n` +
                              `Type *${config.get('bot.prefix')}help* for commands!`;

        try {
            await this.sock.sendMessage(owner, { text: startupMessage });
        } catch (sendError) {
            logger.error(`❌ Failed to send startup message to owner (${owner}):`, sendError);
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.logToTelegram('🚀 Bot Started', startupMessage);
            } catch (err) {
                logger.warn('⚠️ Telegram startup log failed:', err.message);
            }
        }
    }

    async connect() {
        if (!this.sock) {
            await this.startWhatsApp();
        }
        return this.sock;
    }

    async sendMessage(jid, content, options = {}) {
        if (!this.sock) {
            const error = new Error('WhatsApp socket not initialized');
            logger.error('❌ sendMessage error:', error.message);
            throw error;
        }
        if (this.sock.ws.readyState !== this.sock.ws.OPEN) {
             const error = new Error('WhatsApp socket is not open');
             logger.error('❌ sendMessage error:', error.message);
             throw error;
        }
        try {
            return await this.sock.sendMessage(jid, content, options);
        } catch (error) {
            logger.error(`❌ Failed to send message to ${jid}:`, error);
            throw error;
        }
    }

    async shutdown() {
        if (this.isShuttingDown) {
            return; // Prevent multiple shutdown calls
        }
        logger.info('🛑 Shutting down HyperWa Userbot...');
        this.isShuttingDown = true;

        // Clear reconnect timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Clear store save interval
        if (this.storeInterval) {
            clearInterval(this.storeInterval);
            this.storeInterval = null;
        }

        // Save store one final time
        if (this.store) {
            try {
                this.store.writeToFile(this.storePath);
                logger.info(`💾 Final Baileys store saved to ${this.storePath}`);
            } catch (err) {
                logger.warn('⚠️ Failed to save Baileys store on shutdown:', err.message);
            }
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.shutdown();
            } catch (err) {
                logger.warn('⚠️ Telegram shutdown error:', err.message);
            }
        }

        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                if (this.sock.ws && this.sock.ws.readyState === this.sock.ws.OPEN) {
                    this.sock.ws.close();
                }
                logger.info('🔌 WhatsApp socket closed');
            } catch (closeError) {
                logger.warn('⚠️ Error closing WhatsApp socket:', closeError.message);
            }
            this.sock = null;
        }

        logger.info('✅ HyperWa Userbot shutdown complete');
    }
}

module.exports = { HyperWaBot };

// --- Signal Handlers (Place this in your main app file where you instantiate HyperWaBot) ---
/*
let botInstance; // Make sure this is accessible

process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    if (botInstance) await botInstance.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    if (botInstance) await botInstance.shutdown();
    process.exit(0);
});

// Example instantiation in main app file (e.g., index.js)
// const { HyperWaBot } = require('./path/to/bot');
// (async () => {
//     botInstance = new HyperWaBot();
//     try {
//         await botInstance.initialize();
// // Make sure botInstance is accessible for signal handlers
//     } catch (initError) {
//         logger.error('❌ Fatal error during initialization:', initError);
//         process.exit(1);
//     }
// })();
*/
