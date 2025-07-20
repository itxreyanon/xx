const messageUtils = require('../../utils/helpers');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class VoiceChangersModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'voice-changers';
        this.metadata = {
            description: 'Audio effects and voice changers',
            version: '1.0.0',
            author: 'Neoxr Bot Conversion',
            category: 'voice changer'
        };
        this.commands = [
            {
                name: 'bass',
                description: 'Add bass effect to audio',
                usage: '.bass (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🎵 *Adding Bass Effect...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Bass Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'blown',
                description: 'Add blown effect to audio',
                usage: '.blown (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '💨 *Adding Blown Effect...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Blown Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'chipmunk',
                description: 'Add chipmunk effect to audio',
                usage: '.chipmunk (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🐿️ *Adding Chipmunk Effect...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Chipmunk Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'deep',
                description: 'Add deep voice effect to audio',
                usage: '.deep (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🎙️ *Adding Deep Voice...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Deep Voice Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'earrape',
                description: 'Add earrape effect to audio',
                usage: '.earrape (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '📢 *Adding Earrape Effect...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Earrape Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'fast',
                description: 'Speed up audio',
                usage: '.fast (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '⚡ *Speeding Up Audio...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Fast Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'fat',
                description: 'Add fat voice effect to audio',
                usage: '.fat (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🎭 *Adding Fat Voice...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Fat Voice Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'nightcore',
                description: 'Add nightcore effect to audio',
                usage: '.nightcore (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🌙 *Adding Nightcore Effect...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Nightcore Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'reverse',
                description: 'Reverse audio',
                usage: '.reverse (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🔄 *Reversing Audio...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Reverse Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'robot',
                description: 'Add robot voice effect to audio',
                usage: '.robot (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🤖 *Adding Robot Voice...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Robot Voice Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'slow',
                description: 'Slow down audio',
                usage: '.slow (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '🐌 *Slowing Down Audio...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Slow Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            },
            {
                name: 'smooth',
                description: 'Add smooth effect to audio',
                usage: '.smooth (reply to audio)',
                permissions: 'public',
                ui: {
                    processingText: '✨ *Adding Smooth Effect...*\n\n⏳ Processing audio...',
                    errorText: '❌ *Smooth Effect Failed*'
                },
                execute: this.applyVoiceEffect.bind(this)
            }
        ];
    }

    async applyVoiceEffect(msg, params, context) {
    const audioMessage = msg.message?.audioMessage || context.quotedMessage?.audioMessage;
    if (!audioMessage) {
        throw new Error('Please reply to an audio message to apply voice effects');
    }

    const command = context.command;
    const messageToDownload = msg.message?.audioMessage ? msg : { message: context.quotedMessage };
    const audioBuffer = await messageUtils.downloadMedia(messageToDownload, this.bot);
    
    const filter = this.getAudioFilter(command);
    if (!filter) {
        throw new Error(`Unknown voice effect: ${command}`);
    }

    const processedAudio = await this.processAudioWithFFmpeg(audioBuffer, filter);
    const isVoiceNote = audioMessage.ptt;

    await this.bot.sendMessage(context.sender, {
        audio: processedAudio,
        mimetype: 'audio/mpeg',
        ptt: isVoiceNote,
        caption: `🎵 *${this.capitalizeFirst(command)} Effect Applied*`
    });

    return `✅ *${this.capitalizeFirst(command)} Effect Applied Successfully*`;
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
            const inputPath = path.join(os.tmpdir(), `input_${Date.now()}.mp3`);
            const outputPath = path.join(os.tmpdir(), `output_${Date.now()}.mp3`);

            // Write input audio to temp file
            fs.writeFileSync(inputPath, audioBuffer);

            // Apply FFmpeg filter
            const command = `ffmpeg -i ${inputPath} ${filter} ${outputPath}`;

            exec(command, (error, stdout, stderr) => {
                // Clean up input file
                fs.unlinkSync(inputPath);

                if (error) {
                    reject(new Error(`Audio processing failed: ${error.message}`));
                    return;
                }

                try {
                    // Read processed audio
                    const processedBuffer = fs.readFileSync(outputPath);
                    
                    // Clean up output file
                    fs.unlinkSync(outputPath);
                    
                    resolve(processedBuffer);
                } catch (readError) {
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
