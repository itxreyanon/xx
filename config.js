require('dotenv').config();
class Config {
    constructor() {
        this.defaultConfig = {
            bot: {
                name: 'HyperWa',
                company: 'Dawium Technologies',
                prefix: '.',
                version: '2.0.0',
                owner: process.env.BOT_OWNER || '923417033005@s.whatsapp.net',
                clearAuthOnStart: false
            },

            auth: {
                useMongoAuth: true
            },

            admins: this.parseEnvArray('ADMINS', [
                '923075417411',
                '923334445555'
            ]),

            features: {
                mode: 'public',
                customModules: true,
                rateLimiting: true,
                telegramBridge: true,
                respondToUnknownCommands: false,
                sendPermissionError: false
            },

            mongo: {
                uri: process.env.MONGO_URI || '',
                dbName: process.env.MONGO_DB_NAME || ''
            },

            telegram: {
                enabled: true,
                botToken: process.env.TG_BOT_TOKEN || '',
                botPassword: process.env.TG_BOT_PASSWORD || '',
                chatId: process.env.TG_CHAT_ID || '',
                logChannel: '-100000000000',
                features: {
                    topics: true,
                    mediaSync: true,
                    profilePicSync: false,
                    callLogs: true,
                    statusSync: true,
                    biDirectional: true,
                    welcomeMessage: false,
                    sendOutgoingMessages: false,
                    presenceUpdates: true,
                    readReceipts: false,
                    animatedStickers: true
                }
            },

            help: {
                defaultStyle: 1,
                defaultShow: 'description'
            },

            logging: {
                level: 'info',
                saveToFile: true,
                maxFileSize: '10MB',
                maxFiles: 5
            }
        };

        this.load();
    }

    // Load config object
    load() {
        this.config = { ...this.defaultConfig };
        console.log('✅ Configuration loaded');
    }

    get(key) {
        return key.split('.').reduce((o, k) => o && o[k], this.config);
    }

    set(key, value) {
        const keys = key.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((o, k) => {
            if (typeof o[k] === 'undefined') o[k] = {};
            return o[k];
        }, this.config);
        target[lastKey] = value;
        console.warn(`⚠️ Config key '${key}' was set to '${value}' (in-memory only).`);
    }

    update(updates) {
        this.config = { ...this.config, ...updates };
        console.warn('⚠️ Config was updated in memory. Not persistent.');
    }

    parseEnvArray(key, fallback = []) {
        const val = process.env[key];
        return val ? val.split(',').map(item => item.trim()) : fallback;
    }
}

module.exports = new Config();
