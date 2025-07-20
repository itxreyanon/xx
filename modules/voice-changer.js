const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Helpers = require('../utils/helpers');
const logger = require('../Core/logger');

class VoiceChangersModule {
    constructor(bot, messageHandler) {
        this.bot = bot;
        this.messageHandler = messageHandler;
        this.name = 'voice-changers';
        this.metadata = {
            description: 'Audio effects and voice changers',
            version: '1.0.0',
            author: 'Adapted for HyperWa Userbot',
            category: 'voice changer'
        };

        this.commands = [
            { name: 'bass', description: 'Add bass effect to audio', usage: '.bass (reply to audio)', permissions: 'public', ui: { processingText: '🎵 *Adding Bass Effect...*\n\n⏳ Processing audio...', errorText: '❌ *Bass Effect Failed*' } },
            { name: 'blown', description: 'Add blown effect to audio', usage: '.blown (reply to audio)', permissions: 'public', ui: { processingText: '💨 *Adding Blown Effect...*\n\n⏳ Processing audio...', errorText: '❌ *Blown Effect Failed*' } },
            { name: 'chipmunk', description: 'Add chipmunk effect to audio', usage: '.chipmunk (reply to audio)', permissions: 'public', ui: { processingText: '🐿️ *Adding Chipmunk Effect...*\n\n⏳ Processing audio...', errorText: '❌ *Chipmunk Effect Failed*' } },
            { name: 'deep', description: 'Add deep voice effect to audio', usage: '.deep (reply to audio)', permissions: 'public', ui: { processingText: '🎙️ *Adding Deep Voice...*\n\n⏳ Processing audio...', errorText: '❌ *Deep Voice Failed*' } },
            { name: 'earrape', description: 'Add earrape effect to audio', usage: '.earrape (reply to audio)', permissions: 'public', ui: { processingText: '📢 *Adding Earrape Effect...*\n\n⏳ Processing audio...', errorText: '❌ *Earrape Effect Failed*' } },
            { name: 'fast', description: 'Speed up audio', usage: '.fast (reply to audio)', permissions: 'public', ui: { processingText: '⚡ *Speeding Up Audio...*\n\n⏳ Processing audio...', errorText: '❌ *Fast Effect Failed*' } },
            { name: 'fat', description: 'Add fat voice effect to audio', usage: '.fat (reply to audio)', permissions: 'public', ui: { processingText: '🎭 *Adding Fat Voice...*\n\n⏳ Processing audio...', errorText: '❌ *Fat Voice Failed*' } },
            { name: 'nightcore', description: 'Add nightcore effect to audio', usage: '.nightcore (reply to audio)', permissions: 'public', ui: { processingText: '🌙 *Adding Nightcore Effect...*\n\n⏳ Processing audio...', errorText: '❌ *Nightcore Effect Failed*' } },
            { name: 'reverse', description: 'Reverse audio', usage: '.reverse (reply to audio)', permissions: 'public', ui: { processingText: '🔄 *Reversing Audio...*\n\n⏳ Processing audio...', errorText: '❌ *Reverse Effect Failed*' } },
            { name: 'robot', description: 'Add robot voice effect to audio', usage: '.robot (reply to audio)', permissions: 'public', ui: { processingText: '🤖 *Adding Robot Voice...*\n\n⏳ Processing audio...', errorText: '❌ *Robot Voice Failed*' } },
            { name: 'slow', description: 'Slow down audio', usage: '.slow (reply to audio)', permissions: 'public', ui: { processingText: '🐌 *Slowing Down Audio...*\n\n⏳ Processing audio...', errorText: '❌ *Slow Effect Failed*' } },
            { name: 'smooth', description: 'Add smooth effect to audio', usage: '.smooth (reply to audio)', permissions: 'public', ui: { processingText: '✨ *Adding Smooth Effect...*\n\n⏳ Processing audio...', errorText: '❌ *Smooth Effect Failed*' } }
        ];
    }

    async init() {
        if (!this.messageHandler || typeof this.messageHandler.registerCommandHandler !== 'function') {
            logger.error('MessageHandler is not properly initialized for VoiceChangersModule');
            throw new Error('Failed to initialize VoiceChangersModule: MessageHandler not provided');
        }

        // Register commands with MessageHandler
        this.commands.forEach(cmd => {
            this.messageHandler.registerCommandHandler(cmd.name, {
                execute: async (msg, params, context) => {
                    await this.applyVoiceEffect(msg, params, context, cmd);
                },
                permissions: cmd.permissions,
                ui: cmd.ui
            });
            logger.debug(`📝 Registered voice changer command: ${cmd.name}`);
        });

        logger.info('VoiceChangersModule initialized successfully');
    }

    async destroy() {
        this.commands.forEach(cmd => {
            this.messageHandler.unregisterCommandHandler(cmd.name);
            logger.debug(`🗑️ Unregistered voice changer command: ${cmd.name}`);
        });
        logger.info('VoiceChangersModule destroyed');
    }

    async applyVoiceEffect(msg, params, context, command) {
        return await Helpers.smartErrorRespond(this.bot, msg, {
            processingText: command.ui.processingText,
            errorText: command.ui.errorText,
            actionFn: async () => {
                // Check for audio message
                const audioMessage = msg.message?.audioMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
                if (!audioMessage) {
                    throw new Error('Please reply to an audio message to apply voice effects');
                }

                // Download audio
                const audioBuffer = await this.downloadMedia(audioMessage, msg);
                
                // Get FFmpeg filter
                const filter = this.getAudioFilter(command.name);
                if (!filter) {
                    throw new Error(`Unknown voice effect: ${command.name}`);
                }

                // Process audio
                const processedAudio = await this.processAudioWithFFmpeg(audioBuffer, filter);
                
                // Check if original was a voice note
                const isVoiceNote = audioMessage.ptt;

                // Send processed audio
                await this.bot.sock.sendMessage(context.sender, {
                    audio: processedAudio,
                    mimetype: 'audio/mpeg',
                    ptt: isVoiceNote,
                    caption: `🎵 *${this.capitalizeFirst(command.name)} Effect Applied*`
                });

                return `✅ *${this.capitalizeFirst(command.name)} Effect Applied Successfully*`;
            }
        });
    }

    async downloadMedia(audioMessage, msg) {
        if (!audioMessage) {
            throw new Error('No audio message found');
        }

        try {
            const messageToDownload = audioMessage.contextInfo?.quotedMessage || msg;
            const stream = await this.bot.sock.downloadMediaMessage(messageToDownload, 'buffer');
            return stream;
        } catch (error) {
            logger.error('Failed to download media:', error);
            throw new Error(`Failed to download audio: ${error.message}`);
        }
    }

    getAudioFilter(command) {
        const filters = {
            'bass': '-af equalizer=f=94:width_type=o:width=2:g=30',
            'blown': '-af acrusher=.1:1:64:0:log',
            'deep': '-af atempo=4/4,asetrate=44500*2/3',
            'earrape': '-af volume=12',
            'fast': '-filter:a "atempo=1.63,asetrate=44100"',
            'fat': '-filter:a "atempo=1.6,asetrate=22100"',
            'nightcore': '-filter:a atempo=1.06,asetrate=44100*1.25',
            'reverse': '-filter_complex "areverse"',
            'robot': '-filter_complex "afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75"',
            'slow': '-filter:a "atempo=0.7,asetrate=44100"',
            'smooth': '-filter:v "minterpolate=\'mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120\'"',
            'chipmunk': '-filter:a "atempo=0.5,asetrate=65100"'
        };
        return filters[command];
    }

    async processAudioWithFFmpeg(audioBuffer, filter) {
        return new Promise((resolve, reject) => {
            const inputPath = path.join(os.tmpdir(), `input_${Helpers.generateRandomString()}.mp3`);
            const outputPath = path.join(os.tmpdir(), `output_${Helpers.generateRandomString()}.mp3`);

            // Write input audio to temp file
            fs.writeFileSync(inputPath, audioBuffer);

            // Apply FFmpeg filter
            const command = `ffmpeg -i ${inputPath} ${filter} ${outputPath}`;

            exec(command, async (error, stdout, stderr) => {
                // Clean up input file
                try {
                    if (fs.existsSync(inputPath)) {
                        fs.unlinkSync(inputPath);
                    }
                } catch (cleanupError) {
                    logger.error('Error cleaning up input file:', cleanupError);
                }

                if (error) {
                    logger.error('FFmpeg processing failed:', error);
                    reject(new Error(`Audio processing failed: ${error.message}`));
                    return;
                }

                try {
                    // Read processed audio
                    const processedBuffer = fs.readFileSync(outputPath);
                    
                    // Clean up output file
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                    
                    resolve(processedBuffer);
                } catch (readError) {
                    logger.error('Failed to read processed audio:', readError);
                    reject(new Error(`Failed to read processed audio: ${readError.message}`));
                }
            });
        });
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

module.exports = VoiceChangersModule;
