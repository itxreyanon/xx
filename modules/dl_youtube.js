class YouTubeModule {
    /**
     * Constructor for the YouTubeModule.
     * @param {object} bot - The main bot instance.
     */
    constructor(bot) {
        this.bot = bot;
        this.name = 'youtube';
        this.metadata = {
            description: 'Downloads YouTube videos and audio using advanced API',
            version: '1.0.0',
            author: 'Arshman',
            category: 'utility'
        };

        // Base URL for the YouTube downloader API
        this.apiBaseUrl = 'https://api.nekorinn.my.id/downloader/youtube';

        // All the commands supported by this module
        this.commands = [
            {
                name: 'yt-mp3',
                description: 'Downloads a YouTube video as MP3 audio file.',
                usage: '.ytmp3 <url>',
                aliases: ['ytmp3'],
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing YouTube MP3 Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *YouTube MP3 Download Failed*'
                },
                execute: this.downloadMP3.bind(this)
            },
            {
                name: 'yt-mp4',
                description: 'Downloads a YouTube video as MP4 video file.',
                usage: '.yt <url>',
                aliases: ['yt'],
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing YouTube MP4 Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *YouTube MP4 Download Failed*'
                },
                execute: this.downloadMP4.bind(this)
            },
            {
                name: 'yt-info',
                description: 'Gets information about a YouTube video.',
                usage: '.ytinfo <url>',
                aliases: ['ytinfo'],
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Fetching YouTube Video Info...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Failed to fetch video info*'
                },
                execute: this.getVideoInfo.bind(this)
            }
        ];
    }

    /**
     * A helper function to convert duration from seconds to MM:SS format.
     * @param {number} seconds - Duration in seconds.
     * @returns {string} The formatted duration.
     */
    _formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return 'Unknown';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * A helper function to convert numbers into a more readable format (e.g., 1000 -> 1k).
     * @param {number|string} num - The number to convert.
     * @returns {string} The formatted number.
     */
    _convertMiles(num) {
        const number = Number(num);
        if (isNaN(number)) return num; // Return original if not a number
        if (number < 1000) return number.toString();
        if (number < 1000000) return (number / 1000).toFixed(1) + 'k';
        return (number / 1000000).toFixed(1) + 'M';
    }

    /**
     * Generic download handler to fetch data from the YouTube API.
     * @param {string} url - The YouTube URL.
     * @param {string} format - The format/quality (720, 480, 360, etc. for video; 128, 320 for audio).
     * @param {string} type - The type (audio or video).
     * @returns {Promise<object>} The JSON response from the API.
     */
    async _fetchYouTubeData(url, format, type) {
        const apiUrl = `${this.apiBaseUrl}?url=${encodeURIComponent(url)}&format=${format}&type=${type}`;
        
        console.log('API URL:', apiUrl); // Debug log
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
    }

    /**
     * Helper function to download media from a URL and send it via Baileys.
     * @param {object} msg - The message object from the bot.
     * @param {string} mediaUrl - The URL of the media to download.
     * @param {string} caption - The caption to send with the media.
     * @param {string} type - The type of media ('video', 'audio').
     * @returns {Promise<string>} Fallback message if sending fails.
     */
    async _downloadAndSendMedia(msg, mediaUrl, caption, type) {
        try {
            console.log(`Downloading ${type} from:`, mediaUrl); // Debug log
            
            const response = await fetch(mediaUrl);
            if (!response.ok) throw new Error(`Failed to fetch media: ${response.status}`);
            
            const buffer = await response.arrayBuffer();
            const bufferData = Buffer.from(buffer);

            let message;
            if (type === 'video') {
                message = {
                    video: bufferData,
                    caption: caption,
                    mimetype: 'video/mp4'
                };
            } else if (type === 'audio') {
                message = {
                    audio: bufferData,
                    caption: caption,
                    mimetype: 'audio/mpeg'
                };
            } else {
                throw new Error('Unsupported media type');
            }

            await this.bot.sendMessage(msg.key.remoteJid, message);
            return ''; // No text response needed since media is sent
        } catch (error) {
            console.error(`Error sending ${type}:`, error);
            return `${caption}\n\n*Failed to send media, here's the URL instead:* ${mediaUrl}`;
        }
    }

    /**
     * Executes the YouTube MP3 download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string or empty if media is sent.
     */
    async downloadMP3(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a YouTube URL.';

        try {
            // Use audio quality format (128kbps or 320kbps)
            const result = await this._fetchYouTubeData(url, '128', 'audio');
            
            if (!result.status || !result.result) {
                throw new Error('Invalid API response');
            }

            const data = result.result;
            
            const caption = `╭  ✦ YouTube MP3 Download ✦  ╮\n\n` +
                           `*◦ Title:* ${data.title || 'Unknown Title'}\n` +
                           `*◦ Quality:* ${data.format || '128kbps'}\n` +
                           `*◦ Type:* ${data.type || 'audio'}`;

            if (data.downloadUrl) {
                return this._downloadAndSendMedia(msg, data.downloadUrl, caption, 'audio');
            } else {
                throw new Error('No download URL provided by API');
            }
        } catch (error) {
            console.error('YouTube MP3 download error:', error);
            return `❌ Failed to download YouTube MP3: ${error.message}`;
        }
    }

    /**
     * Executes the YouTube MP4 download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string or empty if media is sent.
     */
    async downloadMP4(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a YouTube URL.';

        try {
            // Use video quality format (720p, 480p, 360p, etc.)
            const result = await this._fetchYouTubeData(url, '480', 'video');
            
            if (!result.status || !result.result) {
                throw new Error('Invalid API response');
            }

            const data = result.result;
            
            const caption = `╭  ✦ YouTube MP4 Download ✦  ╮\n\n` +
                           `*◦ Title:* ${data.title || 'Unknown Title'}\n` +
                           `*◦ Quality:* ${data.format || '480p'}\n` +
                           `*◦ Type:* ${data.type || 'video'}`;

            if (data.downloadUrl) {
                return this._downloadAndSendMedia(msg, data.downloadUrl, caption, 'video');
            } else {
                throw new Error('No download URL provided by API');
            }
        } catch (error) {
            console.error('YouTube MP4 download error:', error);
            return `❌ Failed to download YouTube MP4: ${error.message}`;
        }
    }

    /**
     * Gets information about a YouTube video without downloading.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted video information.
     */
    async getVideoInfo(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a YouTube URL.';

        try {
            // Try to get info using mp3 format first (usually faster)
            const result = await this._fetchYouTubeData(url, 'mp3', 'audio');
            
            if (!result.status || !result.result) {
                throw new Error('Invalid API response');
            }

            const data = result.result;
            
            let response = `╭  ✦ YouTube Video Info ✦  ╮\n\n` +
                          `*◦ Title:* ${data.title || 'Unknown Title'}\n` +
                          `*◦ Type:* ${data.type || 'Unknown'}\n` +
                          `*◦ Format:* ${data.format || 'Standard'}`;
            
            // Add thumbnail if available
            if (data.cover) {
                response += `\n*◦ Thumbnail:* ${data.cover}`;
            }
            
            response += `\n\n*Use .ytmp3 or .yt to download this video.*`;
            
            return response;
        } catch (error) {
            console.error('YouTube info fetch error:', error);
            return `❌ Failed to fetch video information: ${error.message}`;
        }
    }
}

module.exports = YouTubeModule;
