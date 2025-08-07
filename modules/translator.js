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

        // Check if replying to a message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMsg) {
            // Extract text from quoted message
            textToTranslate = quotedMsg.conversation || 
                            quotedMsg.extendedTextMessage?.text || 
                            quotedMsg.imageMessage?.caption ||
                            quotedMsg.videoMessage?.caption || 
                            quotedMsg.documentMessage?.caption;
            
            if (!textToTranslate) {
                return `❌ *Reply Error*\n\nThe replied message doesn't contain any text to translate.`;
            }
            
            // Use provided language or chat default
            const chatSettings = this.getChatSettings(context.sender);
            targetLanguage = params[0] || chatSettings.targetLanguage;
        }
        // Direct command logic
        else if (params.length >= 2) {
            targetLanguage = params.shift();
            textToTranslate = params.join(' ');
        }
        // Invalid usage
        else {
            return `❌ *Invalid Usage*\n\n*Reply:* \`.tr [lang]\`\n*Direct:* \`.tr <lang> <text>\``;
        }

        try {
            const translationResult = await translate(textToTranslate, { to: targetLanguage });
            const result = `🌐 *Translation (${translationResult.from.language.iso} → ${targetLanguage})*\n\n${translationResult.text}`;
            return result;
        } catch (error) {
            console.error('Translation module error:', error);
            return `❌ *Translation Failed*\n\nAn error occurred. Please ensure the language code \`${targetLanguage}\` is valid and try again.`;
        }
    }

    async setLanguage(msg, params, context) {
        if (params.length === 0) {
            const chatSettings = this.getChatSettings(context.sender);
            return `🌐 *Current Language Setting*\n\nDefault language: **${chatSettings.targetLanguage}**\nAuto-translate: **${chatSettings.autoTranslate ? 'ON' : 'OFF'}**\n\n💡 Usage: \`.setlang <language_code>\`\n📝 Example: \`.setlang ru\` (Russian)`;
        }

        const langCode = params[0].toLowerCase();
        
        // Validate language code by attempting a test translation
        try {
            await translate('test', { to: langCode });
            
            const chatSettings = this.getChatSettings(context.sender);
            chatSettings.targetLanguage = langCode;
            
            return `✅ *Language Set Successfully*\n\nDefault translation language for this chat: **${langCode}**\n\n💡 Use \`.lang on\` to enable auto-translation`;
        } catch (error) {
            return `❌ *Invalid Language Code*\n\nThe language code \`${langCode}\` is not supported.\n\n💡 Common codes: en, es, fr, de, ru, ar, hi, zh, ja, ko`;
        }
    }

    async toggleAutoTranslate(msg, params, context) {
        const chatSettings = this.getChatSettings(context.sender);
        
        if (params.length === 0) {
            return `🔄 *Auto-Translation Status*\n\nStatus: **${chatSettings.autoTranslate ? 'ON' : 'OFF'}**\nTarget Language: **${chatSettings.targetLanguage}**\n\n💡 Usage: \`.lang on\` or \`.lang off\``;
        }

        const action = params[0].toLowerCase();
        
        if (action === 'on' || action === 'enable') {
            chatSettings.autoTranslate = true;
            return `✅ *Auto-Translation Enabled*\n\nYour messages will be automatically translated to **${chatSettings.targetLanguage}** and edited in place.\n\n⚠️ Note: Only your own messages will be auto-translated.`;
        } else if (action === 'off' || action === 'disable') {
            chatSettings.autoTranslate = false;
            return `❌ *Auto-Translation Disabled*\n\nMessages will no longer be automatically translated.`;
        } else {
            return `❌ *Invalid Option*\n\nUse \`.lang on\` or \`.lang off\``;
        }
    }

    async handleAutoTranslate(msg, text, bot) {
        // Only process messages from the bot user (outgoing messages)
        if (!msg.key.fromMe || !text || text.startsWith('.')) return;
        
        const chatSettings = this.getChatSettings(msg.key.remoteJid);
        if (!chatSettings.autoTranslate) return;
        
        try {
            const translationResult = await translate(text, { to: chatSettings.targetLanguage });
            
            // Only edit if translation is different from original
            if (translationResult.text.toLowerCase() !== text.toLowerCase()) {
                await bot.sock.sendMessage(msg.key.remoteJid, {
                    text: `${translationResult.text}\n\n_🌐 Auto-translated from ${translationResult.from.language.iso}_`,
                    edit: msg.key
                });
            }
        } catch (error) {
            console.error('Auto-translation error:', error);
        }
    }

    async transcribeMedia(msg, params, context) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            return '❌ *Transcription*\n\nPlease reply to an audio or video message to transcribe it.\n\n💡 Usage: Reply to audio/video and type `.transcribe`';
        }

        let mediaMessage, mediaType;
        if (quotedMsg.audioMessage) {
            mediaMessage = quotedMsg.audioMessage;
            mediaType = 'audio';
        } else if (quotedMsg.videoMessage) {
            mediaMessage = quotedMsg.videoMessage;
            mediaType = 'video';
        } else {
            return '❌ *Unsupported Media*\n\nPlease reply to an audio or video message.';
        }

        try {
            // Download media
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            
            // Save to temp file
            const fileName = `transcribe_${Date.now()}.${mediaType === 'audio' ? 'mp3' : 'mp4'}`;
            const filePath = path.join(this.tempDir, fileName);
            await fs.writeFile(filePath, buffer);
            
            // Use a speech-to-text service (placeholder - you'd integrate with actual STT service)
            const transcription = await this.performSpeechToText(filePath, mediaType);
            
            // Clean up
            await fs.remove(filePath);
            
            let result = `🎤 *Transcription Result*\n\n${transcription}`;
            
            // Auto-translate if requested
            if (params.length > 0) {
                const targetLang = params[0];
                try {
                    const translation = await translate(transcription, { to: targetLang });
                    result += `\n\n🌐 *Translation (${targetLang})*\n\n${translation.text}`;
                } catch (error) {
                    result += `\n\n❌ Translation to ${targetLang} failed`;
                }
            }
            
            return result;
            
        } catch (error) {
            throw new Error(`Transcription failed: ${error.message}`);
        }
    }

    async textToSpeech(msg, params, context) {
        let textToSpeak;
        
        // Check if replying to a message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMsg) {
            textToSpeak = quotedMsg.conversation || 
                        quotedMsg.extendedTextMessage?.text || 
                        quotedMsg.imageMessage?.caption ||
                        quotedMsg.videoMessage?.caption;
        } else if (params.length > 0) {
            textToSpeak = params.join(' ');
        }
        
        if (!textToSpeak) {
            return '❌ *Text-to-Speech*\n\nPlease provide text or reply to a message.\n\n💡 Usage: `.tts <text>` or reply to message with `.tts`';
        }
        
        if (textToSpeak.length > 500) {
            return '❌ *Text Too Long*\n\nMaximum text length is 500 characters.\nCurrent length: ' + textToSpeak.length;
        }
        
        try {
            // Generate TTS audio (placeholder - you'd integrate with actual TTS service)
            const audioBuffer = await this.performTextToSpeech(textToSpeak);
            
            await context.bot.sendMessage(context.sender, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                caption: `🔊 *Text-to-Speech*\n\n"${textToSpeak}"`
            });
            
            return null; // Don't return text since we're sending audio
            
        } catch (error) {
            throw new Error(`Text-to-speech failed: ${error.message}`);
        }
    }

    // Placeholder for actual STT implementation
    async performSpeechToText(filePath, mediaType) {
        // This is a placeholder. In a real implementation, you would:
        // 1. Use Google Speech-to-Text API
        // 2. Use OpenAI Whisper API
        // 3. Use other STT services
        
        // For now, return a placeholder message
        return "Speech-to-text transcription would appear here. Please integrate with an actual STT service like Google Speech-to-Text or OpenAI Whisper.";
    }

    // Placeholder for actual TTS implementation
    async performTextToSpeech(text) {
        // This is a placeholder. In a real implementation, you would:
        // 1. Use Google Text-to-Speech API
        // 2. Use Amazon Polly
        // 3. Use other TTS services
        
        // For now, return a placeholder buffer
        throw new Error("Text-to-speech requires integration with an actual TTS service like Google TTS or Amazon Polly");
    }

    async destroy() {
        await fs.remove(this.tempDir);
        console.log('🛑 Advanced translator module destroyed');
    }


}

module.exports = TranslateModule;