// bot.js (Updated with Configurable Pairing Logic)
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys'); // Added makeCacheableSignalKeyStore
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
// --- Added imports for pairing code ---
const readline = require('readline');

// --- Determine pairing mode ---
// Priority: CLI flag > Config file > Default (QR)
const cliUsePairingCode = process.argv.includes('--use-pairing-code');
const configUsePairingCode = config.get('auth.usePairingCode', false); // Add this to your config
const usePairingCode = cliUsePairingCode || configUsePairingCode;
// --- Reply flag from example (optional) ---
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
        // Stability improvements
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.connectionTimeout = null;
        this.isConnecting = false;
        this.messageQueue = [];
        this.isProcessingMessages = false;
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
                    this.handleConnectionError(error);
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
            await this.startWhatsApp();
            logger.info('✅ HyperWa Userbot initialized successfully!');
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
            await this.waitForConnection();
            this.reconnectAttempts = 0; // Reset on successful connection
            this.isConnecting = false;
        } catch (error) {
            this.isConnecting = false;
            await this.handleConnectionError(error);
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
                /** caching makes the store faster to send/recv messages */
                keys: makeCacheableSignalKeyStore(this.authState.state.keys, logger.child({ module: 'baileys-keys' })), // Added from example
            },
            printQRInTerminal: false, // We handle QR manually
            // --- Updated getMessage function (kept mostly original, simplified fallback) ---
            getMessage: async (key) => {
                // Try to get message from store first
                try {
                    const message = this.store.loadMessage(key.remoteJid, key.id);
                    if (message) {
                        return message.message || { conversation: 'Message found but content unavailable' };
                    }
                    // Simplified fallback like example
                    return { conversation: 'Message not found in store' };
                } catch (error) {
                    logger.warn('Error retrieving message from store in getMessage:', error);
                    // Simplified fallback like example
                    return { conversation: 'Error retrieving message' };
                }
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
            generateHighQualityLinkPreview: true,
        });

        // Bind store to socket events
        this.store.bind(this.sock.ev);

        // --- Pairing Code Logic Setup ---
        // The actual request will happen in handleConnectionUpdate when connection is 'connecting'
        // and the session is not registered.
        if (usePairingCode) {
             logger.info('📱 Pairing code mode enabled (via CLI flag or config). Will request after connection starts if needed.');
        } else {
             logger.info('📱 QR code mode enabled (default or via config/CLI).');
        }

        this.setupEventHandlers();
    }

    async waitForConnection() {
        return new Promise((resolve, reject) => {
            this.connectionTimeout = setTimeout(() => {
                if (!this.sock?.user) {
                    logger.warn('❌ Connection timed out after 60 seconds');
                    reject(new Error('Connection timeout'));
                }
            }, 60000);
            const connectionHandler = (update) => {
                if (update.connection === 'open') {
                    if (this.connectionTimeout) {
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                    }
                    this.sock.ev.off('connection.update', connectionHandler);
                    resolve();
                }
            };
            this.sock.ev.on('connection.update', connectionHandler);
        });
    }

    setupEventHandlers() {
        // Connection update handler with better error handling
        this.sock.ev.on('connection.update', async (update) => {
            try {
                await this.handleConnectionUpdate(update);
            } catch (error) {
                logger.error('❌ Error in connection update handler:', error);
            }
        });
        // Credentials update handler with error handling
        this.sock.ev.on('creds.update', async () => {
            try {
                await this.authState.saveCreds();
            } catch (error) {
                logger.error('❌ Error saving credentials:', error);
            }
        });
        // Message handler with queue system
        this.sock.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                // Add messages to queue for processing
                this.messageQueue.push(messageUpdate);
                await this.processMessageQueue();
            } catch (error) {
                logger.error('❌ Error handling message upsert:', error);
            }
        });
        // Add other event handlers with error wrapping
        this.sock.ev.on('messages.update', async (updates) => {
            try {
                // Handle message updates (read receipts, etc.)
                logger.debug('📝 Message updates received:', updates.length);
            } catch (error) {
                logger.error('❌ Error handling message updates:', error);
            }
        });
        this.sock.ev.on('presence.update', async (update) => {
            try {
                // Handle presence updates
                logger.debug('👤 Presence update:', update.id);
            } catch (error) {
                logger.error('❌ Error handling presence update:', error);
            }
        });
    }

    async processMessageQueue() {
        if (this.isProcessingMessages || this.messageQueue.length === 0) {
            return;
        }
        this.isProcessingMessages = true;
        try {
            while (this.messageQueue.length > 0) {
                const messageUpdate = this.messageQueue.shift();
                await this.messageHandler.handleMessages(messageUpdate);
                // Small delay to prevent overwhelming the system
                await this.sleep(10);
            }
        } catch (error) {
            logger.error('❌ Error processing message queue:', error);
        } finally {
            this.isProcessingMessages = false;
        }
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        // --- Handle Pairing Code Request ---
        // This is the key part: request pairing code when connecting and not registered
        if (usePairingCode && connection === 'connecting' && this.sock && !this.sock.authState?.creds?.registered) {
            // Check if we haven't already requested for this session attempt
            // A simple way is to check if qr was ever generated/sent in this session
            if (!this.qrCodeSent) {
                logger.info('🔐 Requesting pairing code...');
                const question = (text) => new Promise((resolve) => {
                    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                    rl.question(text, (answer) => {
                        rl.close();
                        resolve(answer.trim()); // Trim whitespace
                    });
                });

                try {
                    // Ensure the phone number format is correct (no leading +, just digits)
                    let phoneNumber = await question('Please enter your phone number (with country code, e.g., 1234567890):\n');
                    // Basic sanitization: remove any non-digit characters (like +)
                    phoneNumber = phoneNumber.replace(/\D/g, '');
                    if (!phoneNumber) {
                        throw new Error("Invalid phone number entered.");
                    }
                    const code = await this.sock.requestPairingCode(phoneNumber);
                    logger.info(`📱 Pairing code requested for ${phoneNumber}: ${code}`);
                    // Optionally send to Telegram bridge if available
                    if (this.telegramBridge) {
                        try {
                            await this.telegramBridge.logToTelegram('📱 Pairing Code', `Your pairing code for ${phoneNumber} is: \`${code}\``);
                        } catch (err) {
                            logger.warn('⚠️ Failed to send pairing code via Telegram:', err.message);
                        }
                    }
                    // Mark that we've handled pairing for this connection attempt
                    // We use qrCodeSent as a flag even though we're not using QR, to prevent re-requesting
                    this.qrCodeSent = true;
                } catch (err) {
                    logger.error('❌ Error requesting pairing code:', err.message || err);
                    // Don't exit, let the connection attempt continue or fail naturally
                    // Maybe it will fall back to QR if pairing fails?
                }
            }
        }

        if (qr && !usePairingCode) { // Only show QR if not using pairing code
            logger.info('📱 WhatsApp QR code generated');
            qrcode.generate(qr, { small: true });
            if (this.telegramBridge) {
                try {
                    await this.telegramBridge.sendQRCode(qr);
                } catch (error) {
                    logger.warn('⚠️ TelegramBridge failed to send QR:', error.message);
                }
            }
            this.qrCodeSent = true; // Mark QR as sent
        }

        if (connection === 'close') {
            // Reset the flag on connection close to allow new pairing/QR on reconnect
            this.qrCodeSent = false;
            await this.handleConnectionClose(lastDisconnect);
        } else if (connection === 'open') {
            // Reset the flag on successful connection
            this.qrCodeSent = false;
            await this.onConnectionOpen();
        } else if (connection === 'connecting') {
            logger.info('🔄 Connecting to WhatsApp...');
            // Reset the flag at the start of a new connection attempt
            // It will be set again if pairing code is requested or QR is generated
            // this.qrCodeSent = false; // Actually, better to set it just before requesting pairing/QR
        }
    }

    async handleConnectionClose(lastDisconnect) {
        const statusCode = lastDisconnect?.error?.output?.statusCode || 0;
        const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
        logger.warn(`🔌 Connection closed. Status: ${statusCode}, Error: ${errorMessage}`);
        // Handle different disconnect reasons
        switch (statusCode) {
            case DisconnectReason.loggedOut:
                logger.error('❌ Device logged out. Please delete auth_info and restart.');
                await this.clearAuthState();
                process.exit(1);
                break;
            case DisconnectReason.deviceLoggedOut:
                logger.error('❌ Device logged out from another location.');
                await this.clearAuthState();
                process.exit(1);
                break;
            case DisconnectReason.connectionClosed:
            case DisconnectReason.connectionLost:
            case DisconnectReason.connectionReplaced:
            case DisconnectReason.timedOut:
                if (!this.isShuttingDown) {
                    await this.scheduleReconnect();
                }
                break;
            case DisconnectReason.restartRequired:
                logger.info('🔄 Restart required, restarting...');
                if (!this.isShuttingDown) {
                    await this.scheduleReconnect();
                }
                break;
            default:
                if (!this.isShuttingDown) {
                    await this.scheduleReconnect();
                }
        }
    }

    async scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Exiting.`);
            process.exit(1);
        }
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000); // Max 30 seconds
        logger.warn(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        setTimeout(async () => {
            if (!this.isShuttingDown) {
                try {
                    await this.startWhatsApp();
                } catch (error) {
                    logger.error('❌ Reconnection failed:', error);
                }
            }
        }, delay);
    }

    async handleConnectionError(error) {
        logger.error('❌ Connection error:', error);
        if (!this.isShuttingDown) {
            await this.scheduleReconnect();
        }
    }

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
        logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`);
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
        const startupMessage = `🚀 *${config.get('bot.name')} v${config.get('bot.version')}* is now online!\n` +
                              `🔥 *HyperWa Features Active:*\n` +
                              `• 📱 Modular Architecture\n` +
                              `• 🔐 Auth Method: ${authMethod}\n` +
                              `• 🔐 Login Mode: ${usePairingCode ? '🔢 Pairing Code' : '📱 QR Code'}\n` + // Added login mode info
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}\n` +
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}\n` +
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
