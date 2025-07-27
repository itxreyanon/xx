// Core/bot.js
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeInMemoryStore, // <-- Ensure this is imported
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino'); // <-- Import pino for key store logger
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

// --- Add Global Error Handlers (Place near the top of your main app file, e.g., index.js, not here) ---
// --- End Global Error Handlers ---

class HyperWaBot {
    constructor() {
        this.sock = null;
        this.authPath = path.resolve('./auth_info');
        this.storePath = path.resolve('./baileys_store.json'); // Ensure absolute path
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
        // In-Memory Store for chats, contacts, messages
        this.store = makeInMemoryStore({
            logger: logger.child({ module: 'baileys-store' }) // Use your logger with child
        });

        // Load store from file if it exists
        if (fs.existsSync(this.storePath)) {
            logger.info(`📂 Loading Baileys store from ${this.storePath}`);
            try {
                this.store.readFromFile(this.storePath);
                logger.info('✅ Baileys store loaded successfully.');
            } catch (err) {
                logger.error(`❌ Failed to load store from ${this.storePath}:`, err);
                // Optionally, remove the corrupted file?
                // try { fs.removeSync(this.storePath); } catch (rmErr) { logger.warn('⚠️ Could not remove corrupted store file:', rmErr); }
            }
        } else {
             logger.info(`ℹ️ No existing Baileys store file found at ${this.storePath}. Will create a new one.`);
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
        await this.startWhatsApp(); // Initial start

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
            // Note: sock.end() might not always be a promise or might behave differently
            // It's generally handled by the connection.update event
            this.sock = null;
        }

        let state, saveCreds;

        // Choose auth method based on configuration
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
            printQRInTerminal: false, // We handle QR display ourselves
            auth: {
                creds: state.creds,
                // Use makeCacheableSignalKeyStore for better performance and handling
                // Pass a pino logger instance to it
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })), // Use pino logger here
            },
            logger: logger.child({ module: 'baileys' }), // Use your logger with child
            // --- Enhanced getMessage using Store ---
            getMessage: async (key) => {
                if (!this.store) return { conversation: 'Message not found (Store not initialized)' };

                try {
                    // Load message from store (ensure correct parameters)
                    const msg = await this.store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                } catch (err) {
                    logger.warn(`⚠️ Failed to load message ${key.id} for ${key.remoteJid} from store:`, err.message);
                    return { conversation: 'Message not found (Store error)' };
                }
            },
            browser: Browsers.macOS('Chrome'), // Use standard browser string
            msgRetryCounterCache: this.msgRetryCounterCache, // Add retry cache
            generateHighQualityLinkPreview: true, // Optional, often useful
            // patchMessageBeforeSending: (message) => { ... } // Optional
        });

        // --- Bind the store to the socket's event emitter ---
        // This automatically updates the store with new messages, contacts, etc.
        this.store?.bind(this.sock.ev);

        // --- Use sock.ev.process for event handling ---
        this.sock.ev.process(async (events) => {
            // --- Connection Update ---
            if (events['connection.update']) {
                const update = events['connection.update'];
                const { connection, lastDisconnect, qr } = update;

                if (qr && !this.qrCodeSent) { // Only generate QR once per session attempt
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
                    // Define clear reconnect conditions
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                                          statusCode !== DisconnectReason.badSession;

                    if (shouldReconnect && !this.isShuttingDown) {
                        logger.warn(`🔄 Connection closed (Code: ${statusCode}, Error: ${error?.message || 'Unknown'}). Reconnecting in 5 seconds...`);
                        // Reset QR flag to allow new QR on reconnect
                        this.qrCodeSent = false;
                        this.reconnectTimeout = setTimeout(() => this.startWhatsApp(), 5000); // Reconnect with delay
                    } else {
                        logger.error('❌ Connection closed permanently.', { statusCode, error: error?.message });
                        if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                            logger.info('🗑️ Session invalidated. Clearing session data.');
                            // Clear session data
                            if (this.useMongoAuth) {
                                try {
                                    // Pass DB instance or reconnect if needed
                                    const db = this.db || (await connectDb());
                                    const coll = db.collection("auth");
                                    const deleteResult = await coll.deleteOne({ _id: "session" });
                                    if (deleteResult.deletedCount > 0) {
                                        logger.info('🗑️ MongoDB auth session cleared');
                                    } else {
                                        logger.info('ℹ️ No MongoDB auth session found to clear');
                                    }
                                } catch (clearError) {
                                    logger.error('❌ Failed to clear MongoDB auth session:', clearError);
                                }
                            } else {
                                // Clear file-based auth
                                try {
                                    const authExists = await fs.pathExists(this.authPath);
                                    if (authExists) {
                                        await fs.remove(this.authPath);
                                        logger.info(`🗑️ File-based auth directory (${this.authPath}) cleared`);
                                    } else {
                                        logger.info(`ℹ️ File-based auth directory (${this.authPath}) not found, nothing to clear`);
                                    }
                                } catch (fsError) {
                                    logger.error(`❌ Failed to clear file-based auth (${this.authPath}):`, fsError);
                                }
                            }
                            // Optionally clear the store file on logout/bad session
                            try {
                                const storeExists = await fs.pathExists(this.storePath);
                                if (storeExists) {
                                    await fs.remove(this.storePath);
                                    logger.info(`🗑️ Baileys store file (${this.storePath}) cleared`);
                                }
                            } catch (storeError) {
                                 logger.warn(`⚠️ Failed to clear Baileys store file (${this.storePath}):`, storeError.message);
                            }
                        }
                        if (!this.isShuttingDown) {
                           process.exit(1); // Exit if not shutting down intentionally
                        }
                    }
                } else if (connection === 'open') {
                    logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`);
                    this.qrCodeSent = false; // Reset on successful connect
                    await this.onConnectionOpen();
                }
            }

            // --- Creds Update ---
            if (events['creds.update']) {
                try {
                    await saveCreds();
                } catch (err) {
                    logger.error('❌ Failed to save credentials:', err);
                }
            }

            // --- Messages Upsert ---
            // The store.binding handles storing messages. We handle custom logic.
            if (events['messages.upsert']) {
                const upsert = events['messages.upsert'];
                // Delegate to your handler
                try {
                    await this.messageHandler.handleMessages(upsert);
                } catch (handlerError) {
                     // Catch errors specifically from your message handler
                     logger.error('💥 Error in MessageHandler.handleMessages:', handlerError);
                     // Optionally, send an alert message to the owner or log to Telegram
                }
            }
            // --- Add handlers for other relevant events if needed ---
            // e.g., messages.update, groups.update, contacts.upsert, presence.update etc.
        });

        // --- Pairing Logic ---
        // This runs *after* the socket is created but before the connection is fully open
        // It requests the pairing code if enabled and credentials are not already present
        if (this.usePairing && this.pairingPhoneNumber && !state.creds.me?.id) {
             logger.info(`🔐 Requesting pairing code for number: ${this.pairingPhoneNumber}`);
             try {
                 // Ensure phoneNumber is a string without +
                 const code = await this.sock.requestPairingCode(this.pairingPhoneNumber);
                 logger.info(`🔐 Pairing code requested: ${code}`);
                 const pairingMessage = `\`\`\`\n🔐 *Pairing Code for ${config.get('bot.name')}*\n\nYour code: ${code}\n\nEnter it in WhatsApp.\`\`\``;

                 // Log to console
                 console.log(pairingMessage);

                 // Send via Telegram if bridge is active
                 if (this.telegramBridge) {
                     try {
                         await this.telegramBridge.logToTelegram('🔐 Pairing Code Requested', pairingMessage);
                     } catch (err) {
                         logger.warn('⚠️ Failed to send pairing code via Telegram:', err.message);
                     }
                 }
                 // The QR code generation should still happen via the connection.update event listener if pairing fails or times out.

             } catch (pairingError) {
                 logger.error('❌ Failed to request pairing code:', pairingError);
                 logger.info('🔄 Falling back to QR code...');
                 // The QR code generation should still happen via the connection.update event listener.
                 this.qrCodeSent = false; // Allow QR generation if pairing fails
             }
        }
    }


    async onConnectionOpen() {
        logger.info(`✅ WhatsApp connection opened! User: ${this.sock.user?.id || 'Unknown'}`);

        if (!config.get('bot.owner') && this.sock.user) {
            const ownerId = this.sock.user.id; // Baileys usually provides the full JID correctly now
            config.set('bot.owner', ownerId);
            logger.info(`👑 Owner set to: ${ownerId}`);
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
                              `🔥 *HyperWa Features Active:*\n` +
                              `• 📱 Modular Architecture\n` +
                              `• 🔐 Auth Method: ${authMethod}\n` +
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}\n` +
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}\n` +
                              `Type *${config.get('bot.prefix')}help* for available commands!`;

        try {
            await this.sock.sendMessage(owner, { text: startupMessage });
            logger.info(`🚀 Startup message sent to owner: ${owner}`);
        } catch (sendError) {
            logger.error(`❌ Failed to send startup message to owner (${owner}):`, sendError);
        }

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

    async sendMessage(jid, content, options = {}) {
        if (!this.sock) {
            const error = new Error('WhatsApp socket not initialized');
            logger.error('❌ sendMessage error:', error.message);
            throw error;
        }
        // Check if the websocket is actually open
        if (this.sock.ws?.readyState !== 1) { // 1 = WebSocket.OPEN
             const error = new Error(`WhatsApp socket is not open (State: ${this.sock.ws?.readyState})`);
             logger.error('❌ sendMessage error:', error.message);
             throw error;
        }
        try {
            const result = await this.sock.sendMessage(jid, content, options);
            // logger.debug(`✅ Message sent to ${jid}`); // Optional debug log
            return result;
        } catch (error) {
            logger.error(`❌ Failed to send message to ${jid}:`, error);
            throw error; // Re-throw to let caller handle
        }
    }

    async shutdown() {
        if (this.isShuttingDown) {
            logger.warn("🛑 Shutdown already initiated.");
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
                logger.info("🔌 Shutting down Telegram bridge...");
                await this.telegramBridge.shutdown();
                logger.info("✅ Telegram bridge shutdown complete.");
            } catch (err) {
                logger.warn('⚠️ Telegram shutdown error:', err.message);
            }
        }

        // Gracefully end the Baileys socket if it exists
        if (this.sock) {
            try {
                logger.info("🔌 Closing WhatsApp socket...");
                this.sock.ev.removeAllListeners();
                // sock.end() might not be fully async or reliable in all cases
                // The connection.update close event should handle cleanup mostly
                // But calling it is still good practice
                if (this.sock.ws && this.sock.ws.close) {
                    this.sock.ws.close(); // Close the underlying websocket
                }
                logger.info('✅ WhatsApp socket closed');
            } catch (closeError) {
                logger.warn('⚠️ Error closing WhatsApp socket:', closeError.message);
            }
            this.sock = null;
        }

        logger.info('✅ HyperWa Userbot shutdown complete');
        // Optionally, close DB connection if needed globally
        // if (this.db) { await this.db.close(); }
    }
}

module.exports = { HyperWaBot };
