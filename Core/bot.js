const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const readline = require('readline');
const { 
    makeWASocket, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    makeInMemoryStore
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const P = require('pino');

// Initialize logger
const logger = P({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
}, P.destination('./wa-logs.txt'));
logger.level = 'trace';

// Create readline interface for pairing code
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

class WhatsAppBot {
    constructor() {
        this.msgRetryCounterCache = new NodeCache();
        this.store = makeInMemoryStore({ logger });
        this.sock = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.usePairingCode = process.argv.includes('--use-pairing-code');
    }

    async initialize() {
        try {
            // Load authentication state
            const { state, saveCreds } = await useMultiFileAuthState(
                path.join(__dirname, 'auth_info')
            );

            // Fetch latest version
            const { version } = await fetchLatestBaileysVersion();
            logger.info(`Using WA v${version.join('.')}`);

            // Create socket connection
            this.sock = makeWASocket({
                version,
                logger,
                auth: {
                    creds: state.creds,
                    keys: state.keys,
                },
                msgRetryCounterCache: this.msgRetryCounterCache,
                generateHighQualityLinkPreview: true,
                getMessage: this.getMessage.bind(this)
            });

            // Handle pairing code if needed
            if (this.usePairingCode && !this.sock.authState.creds.registered) {
                await this.handlePairingCode();
            }

            // Bind store to socket events
            this.store.bind(this.sock.ev);

            // Setup event handlers
            this.setupEventHandlers(saveCreds);

            return this.sock;
        } catch (error) {
            logger.error('Initialization failed:', error);
            this.handleConnectionError(error);
        }
    }

    async handlePairingCode() {
        try {
            const phoneNumber = await question('Please enter your phone number:\n');
            const code = await this.sock.requestPairingCode(phoneNumber);
            console.log(`Pairing code: ${code}`);
            rl.close();
        } catch (error) {
            logger.error('Pairing failed:', error);
            rl.close();
            throw error;
        }
    }

    setupEventHandlers(saveCreds) {
        this.sock.ev.process(async (events) => {
            // Connection updates
            if (events['connection.update']) {
                await this.handleConnectionUpdate(events['connection.update']);
            }

            // Credentials updates
            if (events['creds.update']) {
                await saveCreds();
            }

            // Messages
            if (events['messages.upsert']) {
                await this.handleMessages(events['messages.upsert']);
            }

            // Message updates (deletes, reactions, etc)
            if (events['messages.update']) {
                logger.debug('Messages updated:', events['messages.update']);
            }

            // Message receipts (read, delivered, etc)
            if (events['message-receipt.update']) {
                logger.debug('Receipts updated:', events['message-receipt.update']);
            }

            // Presence updates
            if (events['presence.update']) {
                logger.debug('Presence updated:', events['presence.update']);
            }
        });
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect } = update;
        logger.info(`Connection update: ${connection}`);

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode 
                !== DisconnectReason.loggedOut;

            if (shouldReconnect && this.retryCount < this.maxRetries) {
                const delay = Math.min(5000 * Math.pow(2, this.retryCount), 30000);
                this.retryCount++;
                logger.info(`Reconnecting in ${delay}ms...`);
                setTimeout(() => this.initialize(), delay);
            } else {
                logger.error('Connection closed permanently');
                process.exit(1);
            }
        } else if (connection === 'open') {
            this.retryCount = 0; // Reset retry counter on successful connection
            logger.info('Successfully connected to WhatsApp');
        }
    }

    async handleMessages(upsert) {
        const { messages, type } = upsert;
        logger.debug(`Received ${messages.length} messages (type: ${type})`);

        if (type === 'notify') {
            for (const msg of messages) {
                try {
                    // Store the message
                    if (!this.store.messages[msg.key.remoteJid]) {
                        this.store.messages[msg.key.remoteJid] = {};
                    }
                    this.store.messages[msg.key.remoteJid][msg.key.id] = msg;

                    // Process the message
                    await this.processMessage(msg);
                } catch (error) {
                    logger.error('Error processing message:', error);
                }
            }
        }
    }

    async processMessage(msg) {
        const content = msg.message || msg.messageStubParameters;
        const text = content?.conversation || 
                     content?.extendedTextMessage?.text || 
                     content?.stubType;

        if (!text) return;

        logger.info(`Processing message from ${msg.key.remoteJid}: ${text}`);

        // Example: Echo back messages
        if (!msg.key.fromMe && text.toLowerCase() === 'ping') {
            await this.sendMessage(msg.key.remoteJid, { text: 'Pong!' });
        }
    }

    getMessage(key) {
        return this.store.messages[key.remoteJid]?.[key.id] || null;
    }

    async sendMessage(jid, content) {
        try {
            await this.sock.sendMessage(jid, content);
            logger.info(`Message sent to ${jid}`);
        } catch (error) {
            logger.error('Failed to send message:', error);
        }
    }

    async shutdown() {
        try {
            if (this.sock) {
                await this.sock.end();
                logger.info('WhatsApp connection closed');
            }
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Start the bot
const startBot = async () => {
    const bot = new WhatsAppBot();
    await bot.initialize();

    // Handle shutdown signals
    process.on('SIGINT', () => bot.shutdown());
    process.on('SIGTERM', () => bot.shutdown());
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        bot.shutdown();
    });
};

startBot().catch(error => {
    logger.error('Bot startup failed:', error);
    process.exit(1);
});
