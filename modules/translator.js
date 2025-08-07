const { translate } = require('@vitalets/google-translate-api');

class TranslateModule {
    /**
     * Constructor for the TranslateModule.
     * @param {object} bot - The main bot instance.
     */
    constructor(bot) {
        this.bot = bot;
        this.name = 'translate';
        this.metadata = {
            description: 'Translates text to a specified language. Supports direct and reply-to-translate.',
            version: '1.2.2',
            author: 'Gemini',
            category: 'utility'
        };
        this.commands = [
            {
                name: 'tr',
                description: 'Translates text. Can be used directly or by replying to a message.',
                usage: '.tr <to_lang> <text> OR reply with .tr [to_lang]',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Translating...*',
                    errorText: '❌ *Translation Failed*'
                },
                // Bind the execute function to the current class instance
                execute: this.translateCommand.bind(this)
            }
        ];
    }

    /**
     * Executes the translate command.
     * Handles both direct translation and reply-to-translate functionality.
     * @param {object} msg - The message object from the chat, which may contain a reply.
     * @param {string[]} params - The parameters passed to the command.
     * @param {object} context - The context of the command execution.
     * @returns {string} The result of the translation or an error message.
     */
    async translateCommand(msg, params, context) {
        let targetLanguage;
        let textToTranslate;

        // --- Reply Logic ---
        // First, check if the command is a reply to another message.
        if (msg.reply_to_message) {
            // If it's a reply, check if the replied-to message has text.
            if (msg.reply_to_message.text) {
                textToTranslate = msg.reply_to_message.text;
                targetLanguage = params[0] || 'en'; // Default to 'en' if no lang is given
            } else {
                // If it's a reply to something without text (image, sticker), return an error.
                return `❌ *Reply Error*\n\nI can only translate messages that contain text.`;
            }
        }
        // --- Direct Command Logic ---
        // If it's not a reply, treat it as a direct command.
        else if (params.length >= 2) {
            targetLanguage = params.shift();
            textToTranslate = params.join(' ');
        }
        // --- Invalid Usage ---
        // If neither of the above conditions are met, the usage is incorrect.
        else {
            return `❌ *Invalid Usage*\n\n*Reply:* \`.tr [lang]\`\n*Direct:* \`.tr <lang> <text>\``;
        }

        // --- Perform Translation ---
        // This part only runs if textToTranslate and targetLanguage were successfully set.
        try {
            const translationResult = await translate(textToTranslate, { to: targetLanguage });
            const result = `*Tr*: ${translationResult.text}`;
            return result;
        } catch (error) {
            console.error('Translation module error:', error);
            return `❌ *Translation Failed*\n\nAn error occurred. Please ensure the language code \`${targetLanguage}\` is valid and try again.`;
        }
    }


}

// Export the class so it can be loaded by the main bot file
module.exports = TranslateModule;
