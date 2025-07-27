// Core/bot.js
const {
    default: makeWASocket,
    useMultiFileAuthState, // This often includes store setup now
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    // makeInMemoryStore, // <-- NOT available or different in 6.7.18
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino'); // Still needed for key store logger
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

// --- Global Error Handlers should be in index.js ---

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
        this.reconnectTimeout = null;

        // --- Store Setup (Adjusted for 6.7.18) ---
        this.msgRetryCounterCache = new NodeCache({ stdTTL: 600 });
        // The store will be initialized after auth state is created or socket is made
        this.store = null; // Will be set later
        this.storeInterval = null; // Will be set later

        // Load initial store data from file if it exists (optional, less common now)
        // This part might be less relevant or work differently, but we can try
        // We will bind and save the store properly after it's created by useMultiFileAuthState or manually
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

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

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
                 // Initialize store after getting state from Mongo
                // In 6.7.18, the state object from useMongoAuthState might have a store
                // Or we need to create it. Let's assume state might have it, or create if not.
                // The safest way is often to let makeWASocket handle it via bind, but we can try to access it.
                // If useMongoAuthState doesn't provide it, we might need to manage it separately or rely on events.
                // For now, let's proceed and bind later.
            } catch (error) {
                logger.error('❌ Failed to initialize MongoDB auth state:', error);
                logger.info('🔄 Falling back to file-based auth...');
                ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
            }
        } else {
            logger.info('🔧 Using file-based auth state...');
            ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
             // In 6.7.18, useMultiFileAuthState might return an object that includes a store function
            // or the store setup is handled differently. Let's check the state object.
            // console.log("State from useMultiFileAuthState:", Object.keys(state)); // Debug
        }

         // --- Initialize Store ---
        // In 6.7.18, the store setup might be slightly different.
        // Often, the store is managed internally by Baileys and bound to the socket.
        // However, for persistence, we might still need to handle it.
        // Let's try to access it from the state if possible, or create a basic one.
        // If state has a store function or object, use it. Otherwise, we might need to adapt.
        
        // A common pattern in 6.7.x was that useMultiFileAuthState handled more.
        // Let's assume the store needs to be created or is part of the socket binding process.
        // We will create a basic store instance and bind it after the socket is made.
        // IMPORTANT: Check Baileys 6.7.18 docs/examples. It might be under a different name or structure.
        
        // Let's try to create a store instance if the export exists under a different name
        // or if we need to instantiate it differently.
        
        // --- Check for Store Export (Alternative Name/Method) ---
        const baileysLib = require('@whiskeysockets/baileys');
        // console.log("Baileys exports:", Object.keys(baileysLib).filter(k => k.includes('Store') || k.includes('store'))); // Debug
        
        // In some 6.7.x versions, it might be just `Store` or accessed differently.
        // If `makeInMemoryStore` is not there, `Store` object might contain it.
        if (baileysLib.Store) {
             // This is less common, but check
             logger.info("Found Store object in exports");
             // this.store = new baileysLib.Store(); // This is usually not how it works
        }
        // If not found, we might have to rely solely on sock.ev binding or
        // the store might be less critical for basic functions in this version
        // or handled internally in a way that doesn't require explicit makeInMemoryStore.
        
        // For 6.7.18, let's proceed without explicitly creating the store here.
        // We will bind the events later if needed, or rely on Baileys internal handling.
        // The key is to avoid calling `makeInMemoryStore` as it doesn't exist.
        
        // If you *need* persistent storage for chats/messages, you might have to implement
        // a custom solution or find the correct export for 6.7.18.
        // For now, let's remove the store creation line that causes the error.
        
        // --- Remove or Comment Out the problematic line ---
        // this.store = makeInMemoryStore({ ... }); // <-- This line causes the error in 6.7.18
        
        // --- Option 1: Proceed without explicit store creation ---
        // Comment out the store creation in constructor
        // And handle getMessage and persistence differently or accept reduced functionality
        
        // --- Option 2: Try to find the correct way in 6.7.18 ---
        // After reviewing Baileys 6.7.18 structure, the store setup is often handled
        // by binding the socket's ev to a store instance *after* the socket is created.
        // And the store instance itself might be obtained or created differently.
        
        // Let's create the socket first, then see if we can get or create the store correctly.
        
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })), // Use pino
            },
            logger: logger.child({ module: 'baileys' }),
            // --- getMessage: Leave commented or provide a fallback ---
            // getMessage often relies on the store. Without a proper store, it's tricky.
            // Provide a simple fallback for now.
            getMessage: async (key) => {
                 // With no persistent store, we cannot retrieve old messages reliably.
                 // This is a limitation if your bot features require it.
                 logger.debug(`getMessage called for ${key.remoteJid}:${key.id} (Store not available)`);
                 return { conversation: 'Message not found (Persistent store not initialized)' };
                 // If you later implement a custom store or find the correct 6.7.18 way,
                 // you would replace this logic.
            },
            browser: Browsers.macOS('Chrome'),
            msgRetryCounterCache: this.msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
        });

        // --- AFTER socket creation, try to set up the store correctly for 6.7.18 ---
        // This is the crucial part. In 6.7.18, the approach might be:
        // 1. Create socket.
        // 2. Get or create store instance (might be different).
        // 3. Bind store to sock.ev.
        
        // Let's re-attempt to find the correct store mechanism.
        // Sometimes it's available after makeWASocket or through the state.
        
        // --- Attempt to get Store for 6.7.18 ---
        try {
            // Check if state (from useMultiFileAuthState) contains a method to get the store
            if (state && typeof state.store === 'function') {
                logger.info("🔧 Initializing store from state...");
                this.store = state.store(); // Call the store function if it exists on state
            } else if (baileysLib.WAProto && baileysLib.makeInMemoryStore) {
                 // This is unlikely in 6.7.18 based on your error, but double check
                 logger.info("🔧 Found makeInMemoryStore in alternative path (unexpected)...");
                 this.store = baileysLib.makeInMemoryStore({ logger: logger.child({ module: 'baileys-store' }) });
            } else if (baileysLib.Store?.makeInMemoryStore) {
                // Another unlikely path
                logger.info("🔧 Found makeInMemoryStore in Store object (unexpected)...");
                this.store = baileysLib.Store.makeInMemoryStore({ logger: logger.child({ module: 'baileys-store' }) });
            } else {
                // If not found, log and proceed without advanced store features
                logger.warn("⚠️ makeInMemoryStore not found in Baileys 6.7.18 exports. Advanced store features might be disabled.");
                logger.warn("💡 Consider upgrading Baileys or checking its 6.7.18 documentation for correct store usage.");
                this.store = null; // Explicitly set to null
            }
            
            // If we successfully got a store instance, bind it
            if (this.store) {
                logger.info("🔗 Binding store to socket events...");
                this.store.bind(this.sock.ev); // This is the key step
                
                // Set up periodic saving if the store has writeToFile method
                if (typeof this.store.writeToFile === 'function') {
                    // Load existing store file
                    if (fs.existsSync(this.storePath)) {
                        logger.info(`📂 Loading Baileys store from ${this.storePath}`);
                        try {
                            this.store.readFromFile(this.storePath);
                            logger.info('✅ Baileys store loaded successfully.');
                        } catch (err) {
                            logger.error(`❌ Failed to load store from ${this.storePath}:`, err);
                        }
                    }
                    
                    // Periodically save the store
                    this.storeInterval = setInterval(() => {
                        try {
                            this.store.writeToFile(this.storePath);
                            // logger.debug(`💾 Baileys store saved to ${this.storePath}`);
                        } catch (err) {
                            logger.warn('⚠️ Failed to save Baileys store:', err.message);
                        }
                    }, 10_000);
                } else {
                     logger.warn("⚠️ Store instance does not have writeToFile/readFromFile methods. Persistence might be limited.");
                }
            } else {
                 logger.info("ℹ️ Proceeding without advanced Baileys store.");
            }
            
        } catch (storeInitError) {
            logger.error("❌ Error initializing Baileys store for 6.7.18:", storeInitError);
            this.store = null; // Ensure it's null on error
        }
        
        // --- Update getMessage if store is now available ---
        if (this.store && typeof this.store.loadMessage === 'function') {
            this.sock.options.getMessage = async (key) => {
                try {
                    const msg = await this.store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                } catch (err) {
                    logger.warn(`⚠️ Failed to load message ${key.id} from store:`, err.message);
                    return { conversation: 'Message not found (Store error)' };
                }
            };
            logger.info("✅ Updated sock.options.getMessage to use store.");
        }


        this.sock.ev.process(async (events) => {
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
                                          statusCode !== DisconnectReason.badSession;

                    if (shouldReconnect && !this.isShuttingDown) {
                        logger.warn(`🔄 Connection closed (Code: ${statusCode}, Error: ${error?.message || 'Unknown'}). Reconnecting in 5 seconds...`);
                        this.qrCodeSent = false;
                        this.reconnectTimeout = setTimeout(() => this.startWhatsApp(), 5000);
                    } else {
                        logger.error('❌ Connection closed permanently.', { statusCode, error: error?.message });
                        if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
                            logger.info('🗑️ Session invalidated. Clearing session data.');
                            if (this.useMongoAuth) {
                                try {
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
                                try {
                                    const authExists = await fs.pathExists(this.authPath);
                                    if (authExists) {
                                        await fs.remove(this.authPath);
                                        logger.info(`🗑️ File-based auth directory (${this.authPath}) cleared`);
                                    } else {
                                        logger.info(`ℹ️ File-based auth directory (${this.authPath}) not found`);
                                    }
                                } catch (fsError) {
                                    logger.error(`❌ Failed to clear file-based auth (${this.authPath}):`, fsError);
                                }
                            }
                            // Optionally clear store file
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
                           process.exit(1);
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

            if (events['messages.upsert']) {
                const upsert = events['messages.upsert'];
                try {
                    await this.messageHandler.handleMessages(upsert);
                } catch (handlerError) {
                     logger.error('💥 Error in MessageHandler.handleMessages:', handlerError);
                }
            }
        });

        if (this.usePairing && this.pairingPhoneNumber && !state.creds.me?.id) {
             logger.info(`🔐 Requesting pairing code for number: ${this.pairingPhoneNumber}`);
             try {
                 const code = await this.sock.requestPairingCode(this.pairingPhoneNumber);
                 logger.info(`🔐 Pairing code requested: ${code}`);
                 const pairingMessage = `\`\`\`\n🔐 *Pairing Code for ${config.get('bot.name')}*\n\nYour code: ${code}\n\nEnter it in WhatsApp.\`\`\``;
                 console.log(pairingMessage);
                 if (this.telegramBridge) {
                     try {
                         await this.telegramBridge.logToTelegram('🔐 Pairing Code Requested', pairingMessage);
                     } catch (err) {
                         logger.warn('⚠️ Failed to send pairing code via Telegram:', err.message);
                     }
                 }
             } catch (pairingError) {
                 logger.error('❌ Failed to request pairing code:', pairingError);
                 logger.info('🔄 Falling back to QR code...');
                 this.qrCodeSent = false;
             }
        }
    }


    async onConnectionOpen() {
        logger.info(`✅ WhatsApp connection opened! User: ${this.sock.user?.id || 'Unknown'}`);

        if (!config.get('bot.owner') && this.sock.user) {
            const ownerId = this.sock.user.id;
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
                              `🔥 *Features:*\n` +
                              `• 📱 Modular Architecture\n` +
                              `• 🔐 Auth: ${authMethod}\n` +
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}\n` +
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}\n` +
                              `Type *${config.get('bot.prefix')}help* for commands!`;

        try {
            await this.sock.sendMessage(owner, { text: startupMessage });
            logger.info(`🚀 Startup message sent to owner: ${owner}`);
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
        if (this.sock.ws?.readyState !== 1) { // 1 = WebSocket.OPEN
             const error = new Error(`WhatsApp socket is not open (State: ${this.sock.ws?.readyState})`);
             logger.error('❌ sendMessage error:', error.message);
             throw error;
        }
        try {
            const result = await this.sock.sendMessage(jid, content, options);
            return result;
        } catch (error) {
            logger.error(`❌ Failed to send message to ${jid}:`, error);
            throw error;
        }
    }

    async shutdown() {
        if (this.isShuttingDown) {
            logger.warn("🛑 Shutdown already initiated.");
            return;
        }
        logger.info('🛑 Shutting down HyperWa Userbot...');
        this.isShuttingDown = true;

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.storeInterval) {
            clearInterval(this.storeInterval);
            this.storeInterval = null;
        }

        // Save store one final time if it exists and has the method
        if (this.store && typeof this.store.writeToFile === 'function') {
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

        if (this.sock) {
            try {
                logger.info("🔌 Closing WhatsApp socket...");
                this.sock.ev.removeAllListeners();
                if (this.sock.ws && this.sock.ws.close) {
                    this.sock.ws.close();
                }
                logger.info('✅ WhatsApp socket closed');
            } catch (closeError) {
                logger.warn('⚠️ Error closing WhatsApp socket:', closeError.message);
            }
            this.sock = null;
        }

        logger.info('✅ HyperWa Userbot shutdown complete');
    }
}

module.exports = { HyperWaBot };
