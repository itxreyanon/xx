const apiHelper = require('./helpers/api-helper');
const messageUtils = require('./helpers/message-utils');

class TextMakersModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'text-makers';
        this.metadata = {
            description: 'Text to image generators and stylized text creators',
            version: '1.0.0',
            author: 'Neoxr Bot Conversion',
            category: 'text maker'
        };
        this.commands = [
            // Single text commands
            {
                name: 'blackpink',
                description: 'Create Blackpink style text',
                usage: '.blackpink <text>',
                permissions: 'public',
                ui: {
                    processingText: '🎨 *Creating Blackpink Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'blood',
                description: 'Create blood style text',
                usage: '.blood <text>',
                permissions: 'public',
                ui: {
                    processingText: '🩸 *Creating Blood Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'breakwall',
                description: 'Create breakwall style text',
                usage: '.breakwall <text>',
                permissions: 'public',
                ui: {
                    processingText: '🧱 *Creating Breakwall Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'glow',
                description: 'Create glowing text',
                usage: '.glow <text>',
                permissions: 'public',
                ui: {
                    processingText: '✨ *Creating Glow Effect...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'joker',
                description: 'Create joker style text',
                usage: '.joker <text>',
                permissions: 'public',
                ui: {
                    processingText: '🃏 *Creating Joker Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'papercut',
                description: 'Create papercut style text',
                usage: '.papercut <text>',
                permissions: 'public',
                ui: {
                    processingText: '📄 *Creating Papercut Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'flames',
                description: 'Create flames style text',
                usage: '.flames <text>',
                permissions: 'public',
                ui: {
                    processingText: '🔥 *Creating Flames Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'matrix',
                description: 'Create matrix style text',
                usage: '.matrix <text>',
                permissions: 'public',
                ui: {
                    processingText: '🔢 *Creating Matrix Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'multicolor',
                description: 'Create multicolor text',
                usage: '.multicolor <text>',
                permissions: 'public',
                ui: {
                    processingText: '🌈 *Creating Multicolor Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            {
                name: 'neon',
                description: 'Create neon style text',
                usage: '.neon <text>',
                permissions: 'public',
                ui: {
                    processingText: '💡 *Creating Neon Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createSingleText.bind(this)
            },
            // Dual text commands
            {
                name: 'avenger',
                description: 'Create Avengers style text',
                usage: '.avenger <text1> | <text2>',
                permissions: 'public',
                ui: {
                    processingText: '🦸 *Creating Avengers Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createDualText.bind(this)
            },
            {
                name: 'marvel',
                description: 'Create Marvel style text',
                usage: '.marvel <text1> | <text2>',
                permissions: 'public',
                ui: {
                    processingText: '🦸‍♂️ *Creating Marvel Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createDualText.bind(this)
            },
            {
                name: 'pornhub',
                description: 'Create PornHub style text',
                usage: '.pornhub <text1> | <text2>',
                permissions: 'public',
                ui: {
                    processingText: '🎬 *Creating Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createDualText.bind(this)
            },
            {
                name: 'lifebuoys',
                description: 'Create lifebuoys style text',
                usage: '.lifebuoys <text1> | <text2>',
                permissions: 'public',
                ui: {
                    processingText: '🛟 *Creating Lifebuoys Style...*\n\n⏳ Generating stylized text...',
                    errorText: '❌ *Text Generation Failed*'
                },
                execute: this.createDualText.bind(this)
            }
        ];
    }

    async createSingleText(msg, params, context) {
        if (!params.length) {
            const commandName = context.command || 'textmaker';
            throw new Error(`Please provide text\nExample: ${commandName} neoxr bot`);
        }

        const text = params.join(' ');
        if (text.length > 10) {
            throw new Error('Text is too long. Maximum 10 characters.');
        }

        const commandName = context.command;
        const result = await apiHelper.neoxrApi(`/${commandName.toLowerCase()}`, { text });

        if (!result.status) {
            throw new Error(result.msg || 'Text generation failed');
        }

        await this.bot.sendMessage(context.sender, {
            image: { url: result.data.url },
            caption: `🎨 *${this.capitalizeFirst(commandName)} Style Text*\n📝 *Text*: ${text}`
        });

        return `✅ *${this.capitalizeFirst(commandName)} Text Created*`;
    }

    async createDualText(msg, params, context) {
        if (!params.length) {
            const commandName = context.command || 'textmaker';
            throw new Error(`Please provide two texts separated by |\nExample: ${commandName} neoxr | bot`);
        }

        const fullText = params.join(' ');
        const [text1, text2] = fullText.split('|').map(t => t.trim());
        
        if (!text1 || !text2) {
            const commandName = context.command || 'textmaker';
            throw new Error(`Please provide two texts separated by |\nExample: ${commandName} neoxr | bot`);
        }

        if (text1.length > 10 || text2.length > 10) {
            throw new Error('Text is too long. Maximum 10 characters per text.');
        }

        const commandName = context.command;
        const result = await apiHelper.neoxrApi(`/${commandName.toLowerCase()}`, { 
            text1, 
            text2 
        });

        if (!result.status) {
            throw new Error(result.msg || 'Text generation failed');
        }

        await this.bot.sendMessage(context.sender, {
            image: { url: result.data.url },
            caption: `🎨 *${this.capitalizeFirst(commandName)} Style Text*\n📝 *Text 1*: ${text1}\n📝 *Text 2*: ${text2}`
        });

        return `✅ *${this.capitalizeFirst(commandName)} Text Created*`;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

module.exports = TextMakersModule;
