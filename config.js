class Config {
    constructor() {
        this.defaultConfig = {
            bot: {
                name: 'HyperWa',
                company: 'Dawium Technologies',
                prefix: '.',
                version: '2.0.0',
                owner: '923075417411@s.whatsapp.net',
                clearAuthOnStart: false
            },

            auth: {
                method: 'pairing',              // 'pairing' or 'qr'
                usePairingCode: true,
                phoneNumber: '923075417411'     // Just number (no + or @)
            },

            admins: [
                '923075417411',
                '923334445555'
            ],

            features: {
                mode: 'public',
                customModules: true,
                rateLimiting: true,
                telegramBridge: true,
                respondToUnknownCommands: false,
                sendPermissionError: false
            },

            mongo: {
                uri: 'mongodb+srv://itxelijah07:ivp8FYGsbVfjQOkj@cluster0.wh25x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
                dbName: 'HyperArshman'
            },

            telegram: {
                enabled: true,
                botToken: '8340169817:AAE3p5yc0uSg-FOZMirWVu9sj9x4Jp8CCug',
                botPassword: '1122',
                chatId: '-1002846269080',
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
}

module.exports = new Config();
