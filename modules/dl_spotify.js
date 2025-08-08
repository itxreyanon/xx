class SpotifyModule {
    /**
     * Constructor for the SpotifyModule.
     * @param {object} bot - The main bot instance.
     */
    constructor(bot) {
        this.bot = bot;
        this.name = 'spotify';
        this.metadata = {
            description: 'Downloads Spotify tracks using advanced API',
            version: '1.0.0',
            author: 'Arshman',
            category: 'utility'
        };

        // Base URL for the Spotify downloader API
        this.apiBaseUrl = 'https://api.nekorinn.my.id/downloader/spotify';

        // All the commands supported by this module
        this.commands = [
            {
                name: 'spotify',
                description: 'Downloads a Spotify track as MP3 audio file.',
                usage: '.spotify <url>',
                aliases: ['sp', 'spotdl'],
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Spotify Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Spotify Download Failed*'
                },
                execute: this.downloadTrack.bind(this)
            }
        ];
    }

    /**
     * A helper function to validate Spotify URLs.
     * @param {string} url - The URL to validate.
     * @returns {boolean} True if valid Spotify URL.
     */
    _isValidSpotifyUrl(url) {
        const spotifyRegex = /^https?:\/\/(open\.)?spotify\.com\/(track|album|playlist|artist)\/[a-zA-Z0-9]+(\?.*)?$/;
        return spotifyRegex.test(url);
    }

    /**
     * Generic fetch handler to get data from the Spotify API.
     * @param {string} url - The Spotify URL.
     * @returns {Promise<object>} The JSON response from the API.
     */
    async _fetchSpotifyData(url) {
        const apiUrl = `${this.apiBaseUrl}?url=${encodeURIComponent(url)}`;
        
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
     * @returns {Promise<string>} Fallback message if sending fails.
     */
    async _downloadAndSendAudio(msg, mediaUrl, caption) {
        try {
            console.log('Downloading audio from:', mediaUrl); // Debug log
            
            const response = await fetch(mediaUrl);
            if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
            
            const buffer = await response.arrayBuffer();
            const bufferData = Buffer.from(buffer);

            const message = {
                audio: bufferData,
                caption: caption,
                mimetype: 'audio/mpeg',
                ptt: false // Set to true if you want it as voice note
            };

            await this.bot.sendMessage(msg.key.remoteJid, message);
            return ''; // No text response needed since media is sent
        } catch (error) {
            console.error('Error sending audio:', error);
            return `${caption}\n\n*Failed to send audio, here's the URL instead:* ${mediaUrl}`;
        }
    }

    /**
     * Executes the Spotify track download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string or empty if media is sent.
     */
    async downloadTrack(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Spotify URL.';

        if (!this._isValidSpotifyUrl(url)) {
            return '❌ Please provide a valid Spotify URL.';
        }

        try {
            const result = await this._fetchSpotifyData(url);
            
            if (!result.status || !result.result) {
                throw new Error('Invalid API response');
            }

            const data = result.result;
            
            const caption = `╭  ✦ Spotify Download ✦  ╮\n\n` +
                           `*◦ Title:* ${data.title || 'Unknown Title'}\n` +
                           `*◦ Artist:* ${data.artist || 'Unknown Artist'}\n` +
                           `*◦ Duration:* ${data.duration || 'Unknown'}\n` +
                           `*◦ Quality:* MP3\n\n` +
                           `*Downloaded from Spotify* 🎵`;

            if (data.downloadUrl) {
                return this._downloadAndSendAudio(msg, data.downloadUrl, caption);
            } else {
                throw new Error('No download URL provided by API');
            }
        } catch (error) {
            console.error('Spotify download error:', error);
            return `❌ Failed to download Spotify track: ${error.message}`;
        }
    }
}

module.exports = SpotifyModule;
