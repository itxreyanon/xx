const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, delay, downloadAndProcessHistorySyncNotification, getAggregateVotesInPollMessage, proto } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const NodeCache = require('@cacheable/node-cache');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

const config = require('../config');
const logger = require('./logger');
const MessageHandler = require('./message-handler');
const { connectDb } = require('../utils/db');
const ModuleLoader = require('./module-loader');
const { useMongoAuthState } = require('../utils/mongoAuthState');
const { makeInMemoryStore } = require('./store');

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
        this.usePairingCode = config.get('auth.usePairingCode', false);
        
        // Initialize store
        this.store = makeInMemoryStore({
            logger: logger.child({ module: 'store' }),
            filePath: './store.json',
            autoSaveInterval: 30000 // Auto-save every 30 seconds
        });
        
        // External cache for message retry counts (Baileys pattern)
        this.msgRetryCounterCache = new NodeCache();
        
        // On-demand message map for history sync
        this.onDemandMap = new Map();
        
        // Stability improvements
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.connectionTimeout = null;
        this.isConnecting = false;
        this.messageQueue = [];
        this.isProcessingMessages = false;
        
        // Readline interface for pairing code
        this.rl = null;
        if (this.usePairingCode) {
            this.rl = readline.createInterface({ 
                input: process.stdin, 
                output: process.stdout 
            });
        }
        
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
            setTimeout(() => {
                if (!this.isShuttingDown) {
                    this.handleConnectionError(error);
                }
            }, 1000);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
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
            logger.warn('⚠️ Telegram bridge failed to initialize:', {
  message: error.message,
  stack: error.stack,
  error,
});

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
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`🔧 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        this.sock = makeWASocket({
            version,
            auth: {
                creds: this.authState.state.creds,
                // Caching makes the store faster to send/recv messages (Baileys pattern)
                keys: makeCacheableSignalKeyStore(this.authState.state.keys, logger.child({ module: 'signal-keys' })),
            },
            logger: logger.child({ module: 'baileys' }),
            msgRetryCounterCache: this.msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
            getMessage: this.getMessage.bind(this),
            browser: ['HyperWa', 'Chrome', '3.0'],
            // Connection options for stability
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
        });

        // Bind store to socket events
        this.store.bind(this.sock.ev);
        
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
        // Use Baileys event processing pattern for better performance
        this.sock.ev.process(async (events) => {
            try {
                // Connection updates
                if (events['connection.update']) {
                    await this.handleConnectionUpdate(events['connection.update']);
                }

                // Credentials update
                if (events['creds.update']) {
                    await this.authState.saveCreds();
                }

                // Message events
                if (events['messages.upsert']) {
                    await this.handleMessagesUpsert(events['messages.upsert']);
                }

                if (events['messages.update']) {
                    await this.handleMessagesUpdate(events['messages.update']);
                }

                if (events['messages.reaction']) {
                    logger.debug('📝 Message reaction:', events['messages.reaction']);
                }

                if (events['message-receipt.update']) {
                    logger.debug('📧 Message receipt update:', events['message-receipt.update']);
                }

                // Presence updates
                if (events['presence.update']) {
                    logger.debug('👤 Presence update:', events['presence.update']);
                }

                // Chat updates
                if (events['chats.update']) {
                    logger.debug('💬 Chats update:', events['chats.update']);
                }

                if (events['chats.delete']) {
                    logger.debug('🗑️ Chats deleted:', events['chats.delete']);
                }

                // Contact updates
                if (events['contacts.update']) {
                    await this.handleContactsUpdate(events['contacts.update']);
                }

                // History sync
                if (events['messaging-history.set']) {
                    await this.handleHistorySync(events['messaging-history.set']);
                }

                // Call events
                if (events.call) {
                    logger.debug('📞 Call event:', events.call);
                }

                // Label events
                if (events['labels.association']) {
                    logger.debug('🏷️ Label association:', events['labels.association']);
                }

                if (events['labels.edit']) {
                    logger.debug('🏷️ Label edit:', events['labels.edit']);
                }

            } catch (error) {
                logger.error('❌ Error processing events:', error);
            }
        });
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            await this.handleQRCode(qr);
        }

        if (connection === 'close') {
            await this.handleConnectionClose(lastDisconnect);
        } else if (connection === 'open') {
            await this.onConnectionOpen();
        } else if (connection === 'connecting') {
            logger.info('🔄 Connecting to WhatsApp...');
        }

        logger.debug('🔌 Connection update:', update);
    }

    async handleQRCode(qr) {
        if (this.usePairingCode && !this.sock.authState.creds.registered) {
            try {
                const phoneNumber = await this.question('Please enter your phone number:\n');
                const code = await this.sock.requestPairingCode(phoneNumber);
                logger.info(`📱 Pairing code: ${code}`);
                
                if (this.telegramBridge) {
                    try {
                        await this.telegramBridge.sendMessage(`🔐 Pairing Code: \`${code}\``);
                    } catch (error) {
                        logger.warn('⚠️ Failed to send pairing code via Telegram:', error.message);
                    }
                }
            } catch (error) {
                logger.error('❌ Failed to get pairing code:', error);
                // Fall back to QR code
                await this.displayQRCode(qr);
            }
        } else {
            await this.displayQRCode(qr);
        }
    }

    async displayQRCode(qr) {
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

    async handleMessagesUpsert(upsert) {
        logger.debug('📨 Messages upsert:', JSON.stringify(upsert, null, 2));

        if (upsert.requestId) {
            logger.info('📝 Placeholder message received for request ID:', upsert.requestId);
        }

        // Add to message queue for processing
        this.messageQueue.push(upsert);
        await this.processMessageQueue();

        // Handle special message types
        if (upsert.type === 'notify') {
            for (const msg of upsert.messages) {
                await this.handleSpecialMessages(msg);
            }
        }
    }

    async handleSpecialMessages(msg) {
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        
        if (!text) return;

        try {
            // Handle placeholder resend request
            if (text === "requestPlaceholder" && !msg.requestId) {
                const messageId = await this.sock.requestPlaceholderResend(msg.key);
                logger.info('📝 Requested placeholder resync, ID:', messageId);
            }

            // Handle on-demand history sync
            if (text === "onDemandHistSync") {
                const messageId = await this.sock.fetchMessageHistory(50, msg.key, msg.messageTimestamp);
                logger.info('📚 Requested on-demand sync, ID:', messageId);
            }
        } catch (error) {
            logger.error('❌ Error handling special message:', error);
        }
    }

    async handleMessagesUpdate(updates) {
        logger.debug('📝 Messages update:', JSON.stringify(updates, null, 2));

        for (const { key, update } of updates) {
            if (update.pollUpdates) {
                try {
                    // Handle poll updates
                    const pollCreation = this.store.loadMessage(key.remoteJid, key.id);
                    if (pollCreation?.message) {
                        const aggregation = getAggregateVotesInPollMessage({
                            message: pollCreation.message,
                            pollUpdates: update.pollUpdates,
                        });
                        logger.info('📊 Poll update aggregation:', aggregation);
                    }
                } catch (error) {
                    logger.error('❌ Error processing poll update:', error);
                }
            }
        }
    }

    async handleContactsUpdate(contacts) {
        for (const contact of contacts) {
            if (typeof contact.imgUrl !== 'undefined') {
                try {
                    const newUrl = contact.imgUrl === null
                        ? null
                        : await this.sock.profilePictureUrl(contact.id).catch(() => null);
                    logger.debug(`👤 Contact ${contact.id} has new profile pic: ${newUrl}`);
                } catch (error) {
                    logger.warn('⚠️ Error updating contact profile pic:', error);
                }
            }
        }
    }

    async handleHistorySync(historySet) {
        const { chats, contacts, messages, isLatest, progress, syncType } = historySet;
        
        if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
            logger.info('📚 Received on-demand history sync, messages:', messages.length);
        }
        
        logger.info(`📚 History sync: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages (latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`);

        // Process history sync notification if needed
        try {
            if (historySet.notification) {
                await downloadAndProcessHistorySyncNotification(historySet.notification);
            }
        } catch (error) {
            logger.warn('⚠️ Error processing history sync notification:', error);
        }
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

    async handleConnectionClose(lastDisconnect) {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode || 0;
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
        const connectionMethod = this.usePairingCode ? 'Pairing Code' : 'QR Code';
        const startupMessage = `🚀 *${config.get('bot.name')} v${config.get('bot.version')}* is now online!\n\n` +
                              `🔥 *HyperWa Features Active:*\n` +
                              `• 📱 Modular Architecture\n` +
                              `• 🔐 Auth Method: ${authMethod}\n` +
                              `• 📲 Connection: ${connectionMethod}\n` +
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}\n` +
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}\n` +
                              `• 💾 Persistent Store: ✅\n` +
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

    // Enhanced getMessage function using store (Baileys pattern)
    async getMessage(key) {
        try {
            // Try to get message from store first
            const message = this.store.loadMessage(key.remoteJid, key.id);
            if (message?.message) {
                return message.message;
            }

            // Fallback for missing messages
            logger.debug('📝 Message not found in store for key:', key);
            return proto.Message.fromObject({ conversation: 'Message not available' });
        } catch (error) {
            logger.warn('⚠️ Error retrieving message:', error);
            return proto.Message.fromObject({ conversation: 'Error retrieving message' });
        }
    }

    // Utility function for readline questions
    async question(text) {
        if (!this.rl) {
            throw new Error('Readline interface not initialized');
        }
        return new Promise((resolve) => this.rl.question(text, resolve));
    }

    // Enhanced message sending with typing indicator
    async sendMessageWithTyping(jid, content) {
        if (!this.sock) {
            throw new Error('WhatsApp socket not initialized');
        }

        try {
            await this.sock.presenceSubscribe(jid);
            await delay(500);

            await this.sock.sendPresenceUpdate('composing', jid);
            await delay(2000);

            await this.sock.sendPresenceUpdate('paused', jid);

            return await this.sock.sendMessage(jid, content);
        } catch (error) {
            logger.error('❌ Failed to send message with typing:', error);
            throw error;
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

        // Close readline interface
        if (this.rl) {
            this.rl.close();
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
