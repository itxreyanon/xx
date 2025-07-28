const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, isJidNewsletter } = require('@whiskeysockets/baileys'); // Added imports
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const logger = require('./logger');
const MessageHandler = require('./message-handler');
const { connectDb } = require('../utils/db');
const ModuleLoader = require('./module-loader');
const { useMongoAuthState } = require('../utils/mongoAuthState');
const { makeInMemoryStore } = require('./store');
// --- Added imports for new features ---
const readline = require('readline');
const { proto } = require('@whiskeysockets/baileys'); // Needed for proto.HistorySyncType

// --- Pairing Code & Reply Flags ---
const usePairingCode = process.argv.includes('--use-pairing-code');
const doReplies = process.argv.includes('--do-reply');

class HyperWaBot {
    constructor() {
        this.sock = null;
        this.authPath = './auth_info';
        this.messageHandler = new MessageHandler(this);
        this.telegramBridge = null;
        this.isShuttingDown = false;
        this.db = null;
        this.moduleLoader = new ModuleLoader(this);
        this.qrCodeSent = false;
        this.useMongoAuth = config.get('auth.useMongoAuth', false);
        // Initialize store
        this.store = makeInMemoryStore({
            logger: logger.child({ module: 'store' }),
            filePath: './store.json',
            autoSaveInterval: 30000 // Auto-save every 30 seconds
        });
        // --- Removed stability improvements (reconnectAttempts, maxReconnectAttempts, etc.) ---
        this.connectionTimeout = null;
        this.isConnecting = false;
        // --- Removed messageQueue and isProcessingMessages as we'll use example's direct handling ---

        // Graceful shutdown handling
        this.setupGracefulShutdown();
        // Load existing store data
        this.store.loadFromFile();
    }

    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            logger.info(`🛑 Received ${signal}, initiating graceful shutdown...`);
            await this.shutdown();
            process.exit(0);
        };
        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGQUIT', gracefulShutdown);
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('❌ Uncaught Exception:', error);
            // Don't exit immediately, try to recover
            setTimeout(() => {
                if (!this.isShuttingDown) {
                    // Simplified error handling for connection
                    logger.warn('⚠️ Connection error (from uncaughtException), attempting restart...');
                    this.startWhatsApp().catch(err => logger.error('❌ Error restarting after uncaughtException:', err));
                }
            }, 1000);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            // Don't exit, just log and continue
        });
    }

    async initialize() {
        logger.info('🔧 Initializing HyperWa Userbot...');
        try {
            // Database connection with retry logic
            await this.initializeDatabase();
            // Initialize Telegram bridge if enabled
            await this.initializeTelegramBridge();
            // Load modules
            await this.moduleLoader.loadModules();
            // Start WhatsApp connection
            await this.startWhatsApp(); // This will now handle reconnection recursively
            // Removed success log here as connection open is handled in event handler
        } catch (error) {
            logger.error('❌ Failed to initialize bot:', error);
            throw error;
        }
    }

    async initializeDatabase() {
        let retries = 3;
        while (retries > 0) {
            try {
                this.db = await connectDb();
                logger.info('✅ Database connected successfully!');
                return;
            } catch (error) {
                retries--;
                logger.error(`❌ Database connection failed (${3 - retries}/3):`, error.message);
                if (retries === 0) {
                    throw new Error('Failed to connect to database after 3 attempts');
                }
                await this.sleep(2000);
            }
        }
    }

    async initializeTelegramBridge() {
        if (!config.get('telegram.enabled')) return;
        try {
            const TelegramBridge = require('../watg-bridge/bridge');
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

    async startWhatsApp() {
        if (this.isConnecting) {
            logger.warn('⚠️ Already attempting to connect, skipping...');
            return;
        }
        this.isConnecting = true;
        try {
            await this.cleanupExistingConnection();
            await this.initializeAuthState();
            await this.createSocket();
            // Removed waitForConnection as example doesn't use it
            this.isConnecting = false;
        } catch (error) {
            this.isConnecting = false;
            // Simplified error handling, let reconnection logic in event handler deal with it
            logger.error('❌ Error during startWhatsApp:', error);
            // The recursive reconnection is handled in the connection.update event now
        }
    }

    async cleanupExistingConnection() {
        if (this.sock) {
            logger.info('🧹 Cleaning up existing WhatsApp socket');
            try {
                // Remove all listeners to prevent memory leaks
                this.sock.ev.removeAllListeners();
                // Clear any existing timeout
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }
                // Close socket gracefully
                await this.sock.end();
            } catch (error) {
                logger.warn('⚠️ Error during socket cleanup:', error.message);
            } finally {
                this.sock = null;
            }
        }
    }

    async initializeAuthState() {
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
        this.authState = { state, saveCreds };
    }

    async createSocket() {
        const { version } = await fetchLatestBaileysVersion();
        this.sock = makeWASocket({
            version,
            logger: logger.child({ module: 'baileys' }),
            // --- Updated auth state to match example ---
            auth: {
                creds: this.authState.state.creds,
                keys: makeCacheableSignalKeyStore(this.authState.state.keys, logger.child({ module: 'baileys-keys' })),
            },
            // Removed printQRInTerminal as we handle QR manually
            // --- Updated getMessage function to be simpler, like example ---
            getMessage: async (key) => {
                // Try to get message from store first (as in your original)
                try {
                    const message = this.store.loadMessage(key.remoteJid, key.id);
                    if (message) {
                        return message.message || { conversation: 'Message found but content unavailable' };
                    }
                } catch (error) {
                    logger.warn('Error retrieving message from store in getMessage:', error);
                }
                // Fallback like example
                return proto.Message.fromObject({ conversation: 'Message not found in store or error occurred' });
            },
            browser: ['HyperWa', 'Chrome', '3.0'],
            // Add connection options for stability
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            // Enable message retry
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            // --- Added from example for potential features ---
            // msgRetryCounterCache: ..., // You might want to add this cache if needed
            generateHighQualityLinkPreview: true,
        });

        // Bind store to socket events
        this.store.bind(this.sock.ev);

        // --- Pairing Code Logic (from example) ---
        if (usePairingCode && !this.sock.authState.creds.registered) {
            const question = (text) => new Promise((resolve) => {
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question(text, (answer) => {
                    rl.close();
                    resolve(answer);
                });
            });

            (async () => {
                try {
                    const phoneNumber = await question('Please enter your phone number (with country code, no +):\n');
                    const code = await this.sock.requestPairingCode(phoneNumber);
                    logger.info(`📱 Pairing code requested: ${code}`);
                    // Optionally send to Telegram bridge if available
                    if (this.telegramBridge) {
                        try {
                            await this.telegramBridge.logToTelegram('📱 Pairing Code', `Your pairing code is: \`${code}\``);
                        } catch (err) {
                            logger.warn('⚠️ Failed to send pairing code via Telegram:', err.message);
                        }
                    }
                } catch (err) {
                    logger.error('❌ Error requesting pairing code:', err);
                }
            })();
        }

        // --- Use sock.ev.process like the example ---
        this.setupEventHandlers();
    }

    // --- Removed waitForConnection method ---

    setupEventHandlers() {
        // --- Replaced individual sock.ev.on listeners with sock.ev.process ---
        this.sock.ev.process(
            async (events) => {
                // --- Connection Update (from example, with your logging) ---
                if(events['connection.update']) {
                    const update = events['connection.update'];
                    const { connection, lastDisconnect, qr } = update;

                    if(qr) {
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

                    if(connection === 'close') {
                        // --- Simplified reconnection logic from example ---
                        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                        logger.warn(`🔌 Connection closed. Should reconnect: ${shouldReconnect}`);
                        if(shouldReconnect) {
                            logger.info('🔄 Attempting to reconnect...');
                            await this.startWhatsApp(); // Recursive call like example
                        } else {
                            logger.error('❌ Device logged out. Please delete auth_info and restart.');
                            await this.clearAuthState();
                            // Let graceful shutdown handle exit or keep trying?
                            // For now, exit as example suggests for logged out
                            process.exit(1);
                        }
                    } else if(connection === 'open') {
                         logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`);
                        // --- Call your onConnectionOpen logic ---
                        await this.onConnectionOpen();
                        // --- WAM Example (commented out like in example) ---
                        const sendWAMExample = false;
                        if(sendWAMExample) {
                            try {
                                // WARNING: THIS WILL SEND A WAM EXAMPLE AND THIS IS A ****CAPTURED MESSAGE.****
                                // DO NOT ACTUALLY ENABLE THIS UNLESS YOU MODIFIED THE FILE.JSON!!!!!
                                // THE ANALYTICS IN THE FILE ARE OLD. DO NOT USE THEM.
                                // YOUR APP SHOULD HAVE GLOBALS AND ANALYTICS ACCURATE TO TIME, DATE AND THE SESSION
                                // THIS FILE.JSON APPROACH IS JUST AN APPROACH I USED, BE FREE TO DO THIS IN ANOTHER WAY.
                                // THE FIRST EVENT CONTAINS THE CONSTANT GLOBALS, EXCEPT THE seqenceNumber(in the event) and commitTime
                                // THIS INCLUDES STUFF LIKE ocVersion WHICH IS CRUCIAL FOR THE PREVENTION OF THE WARNING
                                const fsPromises = require('fs').promises;
                                const { BinaryInfo, encodeWAM } = require('@whiskeysockets/baileys'); // Ensure these are imported if needed

                                const {
                                    header: {
                                        wamVersion,
                                        eventSequenceNumber,
                                    },
                                    events,
                                } = JSON.parse(await fsPromises.readFile("./boot_analytics_test.json", "utf-8"))

                                const binaryInfo = new BinaryInfo({
                                    protocolVersion: wamVersion,
                                    sequence: eventSequenceNumber,
                                    events: events
                                })

                                const buffer = encodeWAM(binaryInfo);
                                const result = await this.sock.sendWAMBuffer(buffer)
                                logger.info('WAM Buffer sent, result:', result);
                            } catch (err) {
                                logger.error('❌ Error sending WAM example:', err);
                            }
                        }
                    } else if(connection === 'connecting') {
                        logger.info('🔄 Connecting to WhatsApp...');
                    }
                }

                // --- Credentials Update (from example) ---
                if(events['creds.update']) {
                    try {
                        await this.authState.saveCreds();
                    } catch (error) {
                        logger.error('❌ Error saving credentials:', error);
                    }
                }

                // --- Other Events from Example ---
                if(events['labels.association']) {
                    logger.debug('🏷️ Labels association:', events['labels.association']);
                }

                if(events['labels.edit']) {
                    logger.debug('🏷️ Labels edit:', events['labels.edit']);
                }

                if(events.call) {
                    logger.info('📞 Received call event:', events.call);
                }

                // --- History Received (from example) ---
                if(events['messaging-history.set']) {
                    const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set'];
                    if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
                        logger.info('received on-demand history sync, messages=', messages.length);
                    }
                    logger.info(`📚 Received history: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`);
                }

                // --- Message Handling (adapted from example) ---
                if (events['messages.upsert']) {
                    const upsert = events['messages.upsert'];
                    logger.debug('📥 Received messages upsert:', JSON.stringify(upsert, null, 2));

                    if (!!upsert.requestId) {
                        logger.info("🔁 Placeholder message received for request of id=" + upsert.requestId, upsert);
                    }

                    if (upsert.type === 'notify') {
                        for (const msg of upsert.messages) {
                            const normalizedContent = msg.message && Object.values(msg.message)[0]; // Normalize message content
                            const text = (normalizedContent?.text || normalizedContent?.caption || msg.message?.conversation || '').trim();

                            // --- Placeholder & On-Demand Sync from example ---
                            if (text == "requestPlaceholder" && !upsert.requestId) {
                                try {
                                    const messageId = await this.sock.requestPlaceholderResend(msg.key);
                                    logger.info('🔁 Requested placeholder resync, id=', messageId);
                                } catch (err) {
                                    logger.error('❌ Error requesting placeholder resend:', err);
                                }
                            }

                            // go to an old chat and send this
                            if (text == "onDemandHistSync") {
                                try {
                                    const messageId = await this.sock.fetchMessageHistory(50, msg.key, msg.messageTimestamp);
                                    logger.info('🔁 Requested on-demand sync, id=', messageId);
                                } catch (err) {
                                    logger.error('❌ Error fetching on-demand history:', err);
                                }
                            }

                            // --- Reply Logic (adapted from example) ---
                            if (!msg.key.fromMe && doReplies && !isJidNewsletter(msg.key?.remoteJid)) {
                                logger.info('💬 Replying to', msg.key.remoteJid);
                                try {
                                    await this.sock.readMessages([msg.key]); // Mark as read
                                    // Simulate typing like in example helper
                                    await this.sock.presenceSubscribe(msg.key.remoteJid);
                                    await this.sleep(500);
                                    await this.sock.sendPresenceUpdate('composing', msg.key.remoteJid);
                                    await this.sleep(2000);
                                    await this.sock.sendPresenceUpdate('paused', msg.key.remoteJid);

                                    await this.sock.sendMessage(msg.key.remoteJid, { text: 'Hello there from HyperWa!' });
                                } catch (err) {
                                    logger.error('❌ Error replying:', err);
                                }
                            }

                            // --- Pass to your existing MessageHandler for other commands/modules ---
                            // This integrates the example's direct handling with your modular system
                            try {
                                await this.messageHandler.handleMessages({ messages: [msg] }); // Wrap single msg in array
                            } catch (handlerError) {
                                logger.error('❌ Error in MessageHandler:', handlerError);
                            }
                        }
                    }
                }

                // --- Messages Update (from example) ---
                if(events['messages.update']) {
                    logger.debug('📝 Message updates:', JSON.stringify(events['messages.update'], null, 2));
                    // Example includes poll update handling - you might want to adapt this
                    // for(const { key, update } of events['messages.update']) {
                    //     if(update.pollUpdates) {
                    //         // Handle poll updates if needed
                    //     }
                    // }
                }

                if(events['message-receipt.update']) {
                    logger.debug('📬 Message receipt update:', events['message-receipt.update']);
                }

                if(events['messages.reaction']) {
                    logger.debug('❤️ Message reaction:', events['messages.reaction']);
                }

                 if(events['presence.update']) {
                    logger.debug('👤 Presence update:', events['presence.update']);
                }

                if(events['chats.update']) {
                    logger.debug('💬 Chats update:', events['chats.update']);
                }

                if(events['contacts.update']) {
                    for(const contact of events['contacts.update']) {
                        if(typeof contact.imgUrl !== 'undefined') {
                            try {
                                const newUrl = contact.imgUrl === null
                                    ? null
                                    : await this.sock.profilePictureUrl(contact.id).catch(() => null);
                                logger.info(`🖼️ Contact ${contact.id} has a new profile pic: ${newUrl}`);
                            } catch (err) {
                                logger.warn(`⚠️ Error getting profile picture for ${contact.id}:`, err.message);
                            }
                        }
                    }
                }

                if(events['chats.delete']) {
                    logger.info('🗑️ Chats deleted:', events['chats.delete']);
                }
            }
        );
    }

    // --- Removed processMessageQueue method ---

    // --- Removed handleConnectionUpdate, handleConnectionClose, scheduleReconnect, handleConnectionError methods ---
    // Their logic is now incorporated into the sock.ev.process handler

    async clearAuthState() {
        if (this.useMongoAuth) {
            try {
                const db = await connectDb();
                const coll = db.collection("auth");
                await coll.deleteOne({ _id: "session" });
                logger.info('🗑️ MongoDB auth session cleared');
            } catch (error) {
                logger.error('❌ Failed to clear MongoDB auth session:', error);
            }
        } else {
            try {
                await fs.remove(this.authPath);
                logger.info('🗑️ File-based auth session cleared');
            } catch (error) {
                logger.error('❌ Failed to clear file-based auth session:', error);
            }
        }
    }

    async onConnectionOpen() {
        // logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`); // Moved to event handler
        // Save store after successful connection
        this.store.saveToFile();
        if (!config.get('bot.owner') && this.sock.user) {
            config.set('bot.owner', this.sock.user.id);
            logger.info(`👑 Owner set to: ${this.sock.user.id}`);
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
        if (!owner) return;
        const authMethod = this.useMongoAuth ? 'MongoDB' : 'File-based';
        const startupMessage = `🚀 *${config.get('bot.name')} v${config.get('bot.version')}* is now online!
` +
                              `🔥 *HyperWa Features Active:*
` +
                              `• 📱 Modular Architecture
` +
                              `• 🔐 Auth Method: ${authMethod}
` +
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}
` +
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}
` +
                              `Type *${config.get('bot.prefix')}help* for available commands!`;
        try {
            await this.sendMessage(owner, { text: startupMessage });
        } catch (error) {
            logger.warn('⚠️ Failed to send startup message:', error.message);
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

    async sendMessage(jid, content) {
        if (!this.sock) {
            throw new Error('WhatsApp socket not initialized');
        }
        try {
            return await this.sock.sendMessage(jid, content);
        } catch (error) {
            logger.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    async shutdown() {
        logger.info('🛑 Shutting down HyperWa Userbot...');
        this.isShuttingDown = true;
        // Clear any pending timeouts
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        // Shutdown Telegram bridge
        if (this.telegramBridge) {
            try {
                await this.telegramBridge.shutdown();
            } catch (err) {
                logger.warn('⚠️ Telegram shutdown error:', err.message);
            }
        }
        // Close WhatsApp socket
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                await this.sock.end();
            } catch (error) {
                logger.warn('⚠️ Error during socket shutdown:', error.message);
            }
        }
        // Close database connection
        if (this.db) {
            try {
                await this.db.close();
            } catch (error) {
                logger.warn('⚠️ Error closing database:', error.message);
            }
        }
        // Cleanup store
        if (this.store) {
            try {
                this.store.cleanup();
            } catch (error) {
                logger.warn('⚠️ Error during store cleanup:', error.message);
            }
        }
        logger.info('✅ HyperWa Userbot shutdown complete');
    }

    // Utility function for delays
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { HyperWaBot };
