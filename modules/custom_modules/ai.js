const apiHelper = require('../../utils/api-helper');
const messageUtils = require('../../utils/helpers');

class AIUtilitiesModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'ai';
        this.metadata = {
            description: 'AI-powered utilities and tools',
            version: '1.0.0',
            author: 'Neoxr Bot Conversion',
            category: 'utilities'
        };
        this.commands = [
            {
                name: 'ai',
                description: 'Chat with AI (GPT)',
                usage: '.ai <your_question>',
                permissions: 'public',
                ui: {
                    processingText: '🤖 *AI Thinking...*\n\n⏳ Processing your question...',
                    errorText: '❌ *AI Service Failed*'
                },
                execute: this.chatGPT.bind(this)
            },
            {
                name: 'gemini',
                description: 'Chat with Google Gemini',
                usage: '.gemini <your_question>',
                permissions: 'public',
                ui: {
                    processingText: '💎 *Gemini Processing...*\n\n⏳ Analyzing your request...',
                    errorText: '❌ *Gemini Service Failed*'
                },
                execute: this.chatGemini.bind(this)
            },
            {
                name: 'bard',
                description: 'Chat with Google Bard',
                usage: '.bard <your_question>',
                permissions: 'public',
                ui: {
                    processingText: '🎭 *Bard Consulting...*\n\n⏳ Generating response...',
                    errorText: '❌ *Bard Service Failed*'
                },
                execute: this.chatBard.bind(this)
            },
            {
                name: 'bing',
                description: 'Chat with Bing AI',
                usage: '.bing <your_question>',
                permissions: 'public',
                ui: {
                    processingText: '🔍 *Bing Searching...*\n\n⏳ Finding information...',
                    errorText: '❌ *Bing Service Failed*'
                },
                execute: this.chatBing.bind(this)
            },
            {
                name: 'translate',
                description: 'Translate text',
                usage: '.translate <lang_code> <text>',
                permissions: 'public',
                ui: {
                    processingText: '🌐 *Translating...*\n\n⏳ Converting language...',
                    errorText: '❌ *Translation Failed*'
                },
                execute: this.translateText.bind(this)
            },
            {
                name: 'ocr',
                description: 'Extract text from image',
                usage: '.ocr (reply to image)',
                permissions: 'public',
                ui: {
                    processingText: '🔍 *Extracting Text...*\n\n⏳ Analyzing image...',
                    errorText: '❌ *Text Extraction Failed*'
                },
                execute: this.extractTextFromImage.bind(this)
            },
            {
                name: 'identify',
                description: 'Identify objects in image',
                usage: '.identify (reply to image)',
                permissions: 'public',
                ui: {
                    processingText: '🔍 *Analyzing Image...*\n\n⏳ Identifying objects...',
                    errorText: '❌ *Image Analysis Failed*'
                },
                execute: this.identifyImage.bind(this)
            },
            {
                name: 'remini',
                description: 'Enhance image quality',
                usage: '.remini (reply to image)',
                permissions: 'public',
                ui: {
                    processingText: '✨ *Enhancing Image...*\n\n⏳ Improving quality...',
                    errorText: '❌ *Image Enhancement Failed*'
                },
                execute: this.enhanceImage.bind(this)
            },
            {
                name: 'removebg',
                description: 'Remove background from image',
                usage: '.removebg (reply to image)',
                permissions: 'public',
                ui: {
                    processingText: '🎨 *Removing Background...*\n\n⏳ Processing image...',
                    errorText: '❌ *Background Removal Failed*'
                },
                execute: this.removeBackground.bind(this)
            },
            {
                name: 'google',
                description: 'Search Google',
                usage: '.google <query>',
                permissions: 'public',
                ui: {
                    processingText: '🔍 *Searching Google...*\n\n⏳ Finding results...',
                    errorText: '❌ *Google Search Failed*'
                },
                execute: this.googleSearch.bind(this)
            },
            {
                name: 'pinterest',
                description: 'Search Pinterest images',
                usage: '.pinterest <query>',
                permissions: 'public',
                ui: {
                    processingText: '📌 *Searching Pinterest...*\n\n⏳ Finding images...',
                    errorText: '❌ *Pinterest Search Failed*'
                },
                execute: this.pinterestSearch.bind(this)
            }
        ];
    }

    async chatGPT(msg, params, context) {
        if (!params.length) {
            throw new Error('Please provide a question\nExample: ai What is artificial intelligence?');
        }

        const question = params.join(' ');
        const result = await apiHelper.neoxrApi('/gpt-pro', { q: question });

        if (!result.status) {
            throw new Error(result.msg || 'AI service unavailable');
        }

        return `🤖 *AI Response*\n\n${result.data.message}`;
    }

    async chatGemini(msg, params, context) {
        if (!params.length) {
            throw new Error('Please provide a question\nExample: gemini What is quantum computing?');
        }

        const question = params.join(' ');
        const result = await apiHelper.neoxrApi('/gemini-chat', { q: question });

        if (!result.status) {
            throw new Error(result.msg || 'Gemini service unavailable');
        }

        return `💎 *Gemini Response*\n\n${result.data.message}`;
    }

    async chatBard(msg, params, context) {
        if (!params.length) {
            throw new Error('Please provide a question\nExample: bard Explain machine learning');
        }

        const question = params.join(' ');
        const result = await apiHelper.neoxrApi('/bard', { q: question });

        if (!result.status) {
            throw new Error(result.msg || 'Bard service unavailable');
        }

        return `🎭 *Bard Response*\n\n${result.data.message}`;
    }

    async chatBing(msg, params, context) {
        if (!params.length) {
            throw new Error('Please provide a question\nExample: bing What is the weather like?');
        }

        const question = params.join(' ');
        const result = await apiHelper.neoxrApi('/bing-chat', { q: question });

        if (!result.status) {
            throw new Error(result.msg || 'Bing service unavailable');
        }

        return `🔍 *Bing Response*\n\n${result.data.message}`;
    }

    async translateText(msg, params, context) {
        if (params.length < 2) {
            throw new Error('Please provide language code and text\nExample: translate id Hello world');
        }

        const langCode = params[0];
        const text = params.slice(1).join(' ');

        const translate = require('translate-google-api');
        const result = await translate(text, { to: langCode });

        return `🌐 *Translation*\n\n📝 *Original*: ${text}\n🔄 *Translated*: ${result[0]}`;
    }

    async extractTextFromImage(msg, params, context) {
        if (!msg.message?.imageMessage && !context.quotedMessage?.imageMessage) {
            throw new Error('Please reply to an image to extract text');
        }

        const imageBuffer = await helpers.downloadMedia(msg, this.bot);
        const imageUrl = await this.uploadImageToService(imageBuffer);

        const result = await apiHelper.neoxrApi('/ocr', { image: imageUrl });

        if (!result.status) {
            throw new Error(result.msg || 'OCR failed');
        }

        return `📝 *Extracted Text*\n\n${result.data.text}`;
    }

    async identifyImage(msg, params, context) {
        if (!msg.message?.imageMessage && !context.quotedMessage?.imageMessage) {
            throw new Error('Please reply to an image to identify objects');
        }

        const imageBuffer = await helpers.downloadMedia(msg, this.bot);
        const imageUrl = await this.uploadImageToService(imageBuffer);

        const result = await apiHelper.neoxrApi('/gemini-vision', { 
            image: imageUrl,
            lang: 'en'
        });

        if (!result.status) {
            throw new Error(result.msg || 'Image analysis failed');
        }

        return `🔍 *Image Analysis*\n\n${result.data.description}`;
    }

    async enhanceImage(msg, params, context) {
        if (!msg.message?.imageMessage && !context.quotedMessage?.imageMessage) {
            throw new Error('Please reply to an image to enhance');
        }

        const imageBuffer = await helpers.downloadMedia(msg, this.bot);
        const imageUrl = await this.uploadImageToService(imageBuffer);

        const result = await apiHelper.neoxrApi('/remini', { image: imageUrl });

        if (!result.status) {
            throw new Error(result.msg || 'Image enhancement failed');
        }

        await this.bot.sendMessage(context.sender, {
            image: { url: result.data.url },
            caption: '✨ *Enhanced Image*'
        });

        return '✅ *Image Enhanced Successfully*';
    }

    async removeBackground(msg, params, context) {
        if (!msg.message?.imageMessage && !context.quotedMessage?.imageMessage) {
            throw new Error('Please reply to an image to remove background');
        }

        const imageBuffer = await messageUtils.downloadMedia(msg, this.bot);
        const imageUrl = await this.uploadImageToService(imageBuffer);

        const result = await apiHelper.neoxrApi('/nobg', { image: imageUrl });

        if (!result.status) {
            throw new Error(result.msg || 'Background removal failed');
        }

        await this.bot.sendMessage(context.sender, {
            image: { url: result.data.no_background },
            caption: '🎨 *Background Removed*'
        });

        return '✅ *Background Removed Successfully*';
    }

    async googleSearch(msg, params, context) {
        if (!params.length) {
            throw new Error('Please provide a search query\nExample: google artificial intelligence');
        }

        const query = params.join(' ');
        const result = await apiHelper.neoxrApi('/google', { q: query });

        if (!result.status) {
            throw new Error(result.msg || 'Google search failed');
        }

        let response = `🔍 *Google Search Results*\n\n`;
        result.data.slice(0, 5).forEach((item, index) => {
            response += `*${index + 1}. ${item.title}*\n`;
            response += `📝 ${item.description}\n`;
            response += `🔗 ${item.url}\n\n`;
        });

        return response;
    }

    async pinterestSearch(msg, params, context) {
        if (!params.length) {
            throw new Error('Please provide a search query\nExample: pinterest cute cats');
        }

        const query = params.join(' ');
        const result = await apiHelper.neoxrApi('/pinterest', { q: query });

        if (!result.status) {
            throw new Error(result.msg || 'Pinterest search failed');
        }

        // Send 3 random images
        for (let i = 0; i < 3; i++) {
            const randomIndex = Math.floor(Math.random() * result.data.length);
            await this.bot.sendMessage(context.sender, {
                image: { url: result.data[randomIndex] },
                caption: `📌 *Pinterest Image ${i + 1}*`
            });
            await messageUtils.delay(1000);
        }

        return `✅ *Pinterest Images Sent*\n📌 *Query*: ${query}`;
    }

    async uploadImageToService(imageBuffer) {
        // This is a placeholder - you'll need to implement actual image upload
        // For now, we'll use a mock URL
        throw new Error('Image upload service not implemented - please implement uploadImageToService method');
    }
}

module.exports = AIUtilitiesModule;
