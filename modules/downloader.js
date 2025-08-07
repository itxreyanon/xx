class DownloaderModule {
    /**
     * Constructor for the DownloaderModule.
     * @param {object} bot - The main bot instance.
     */
    constructor(bot) {
        this.bot = bot;
        this.name = 'downloader';
        this.metadata = {
            description: 'Downloads media from various platforms like TikTok, Instagram, YouTube, etc.',
            version: '1.0.0',
            author: 'Arshman', 
            category: 'utility'
        };

        // Base URL for the downloader API
        this.apiBaseUrl = 'https://delirius-apiofc.vercel.app/download';

        // All the commands supported by this module
        this.commands = [
            {
                name: 'tiktok',
                description: 'Downloads a TikTok video.',
                usage: '.tiktok <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing TikTok Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *TikTok Download Failed*'
                },
                execute: this.downloadTikTok.bind(this)
            },
            {
                name: 'instagram',
                description: 'Downloads Instagram content (post or story).',
                usage: '.instagram <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Instagram Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Instagram Download Failed*'
                },
                execute: this.downloadInstagram.bind(this)
            },
            {
                name: 'ytmp3',
                description: 'Downloads a YouTube video as an MP3 audio file.',
                usage: '.ytmp3 <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing YouTube MP3 Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *YouTube MP3 Download Failed*'
                },
                execute: this.downloadYouTubeMP3.bind(this)
            },
            {
                name: 'ytmp4',
                description: 'Downloads a YouTube video as an MP4 file.',
                usage: '.ytmp4 <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing YouTube MP4 Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *YouTube MP4 Download Failed*'
                },
                execute: this.downloadYouTubeMP4.bind(this)
            },
            {
                name: 'soundcloud',
                description: 'Downloads a track from SoundCloud.',
                usage: '.soundcloud <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing SoundCloud Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *SoundCloud Download Failed*'
                },
                execute: this.downloadSoundCloud.bind(this)
            },
            {
                name: 'twitter',
                description: 'Downloads a video from Twitter / X.com.',
                usage: '.twitter <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Twitter Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Twitter Download Failed*'
                },
                execute: this.downloadTwitter.bind(this)
            },

            {
                name: 'facebook',
                description: 'Downloads a video from Facebook.',
                usage: '.facebook <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Facebook Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Facebook Download Failed*'
                },
                execute: this.downloadFacebook.bind(this)
            }

        ];
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
     * Generic download handler to fetch data from the API.
     * @param {string} endpoint - The API endpoint for the specific download.
     * @param {string} url - The URL of the media to download.
     * @returns {Promise<object>} The JSON response from the API.
     */
    async _fetchDownload(endpoint, url) {
        const apiUrl = `${this.apiBaseUrl}/${endpoint}?url=${encodeURIComponent(url)}`;
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
     * @param {string} type - The type of media ('video', 'audio', 'image').
     * @returns {Promise<string>} Fallback message if sending fails.
     */
    async _downloadAndSendMedia(msg, mediaUrl, caption, type) {
        try {
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
            } else if (type === 'image') {
                message = {
                    image: bufferData,
                    caption: caption,
                    mimetype: 'image/jpeg'
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
     * Executes the TikTok download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string or empty if media is sent.
     */
    async downloadTikTok(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a TikTok URL.';

        const result = await this._fetchDownload('tiktok', url);
        const data = result.data;

        const caption = `╭  ✦ TikTok Download ✦  ╮\n\n` +
                       `*◦ Name:* ${data.author.nickname}\n` +
                       `*◦ Username:* ${data.author.username}\n` +
                       `*◦ Duration:* ${data.duration}s\n` +
                       `*◦ Plays:* ${this._convertMiles(data.repro)}\n` +
                       `*◦ Likes:* ${this._convertMiles(data.like)}\n` +
                       `*◦ Shares:* ${this._convertMiles(data.share)}\n` +
                       `*◦ Comments:* ${this._convertMiles(data.comment)}\n` +
                       `*◦ Downloads:* ${this._convertMiles(data.download)}\n\n` +
                       `╭  ✦ Music Info ✦  ╮\n\n` +
                       `*◦ Music:* ${data.music.title}\n` +
                       `*◦ Author:* ${data.music.author}\n` +
                       `*◦ Duration:* ${data.music.duration}s`;

        const mediaUrl = data.meta.media[0].hd || data.meta.media[0].org;
        return this._downloadAndSendMedia(msg, mediaUrl, caption, 'video');
    }

    /**
     * Executes the Instagram download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string.
     */
    async downloadInstagram(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide an Instagram URL.';

        const endpoint = url.includes('/stories/') ? 'igstories' : 'instagram';
        const result = await this._fetchDownload(endpoint, url);
        const media = result.data;

        let responseText = `*亗 I N S T A G R A M*\n\n`;
        media.forEach((item, index) => {
            responseText += `*› Media ${index + 1} [${item.type}]:* ${item.url}\n`;
        });

        return responseText;
    }

    /**
     * Executes the YouTube MP3 download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string.
     */
    async downloadYouTubeMP3(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a YouTube URL.';

        const result = await this._fetchDownload('ytmp3', url);
        const data = result.data;

        return `╭  ✦ YouTube MP3 Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.title}\n` +
               `*◦ Author:* ${data.author}\n` +
               `*◦ Duration:* ${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, '0')}\n` +
               `*◦ Quality:* ${data.download.quality}\n` +
               `*◦ Size:* ${data.download.size}\n\n` +
               `*Download URL:* ${data.download.url}`;
    }

    /**
     * Executes the YouTube MP4 download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string.
     */
    async downloadYouTubeMP4(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a YouTube URL.';

        const result = await this._fetchDownload('ytmp4', url);
        const data = result.data;

        return `╭  ✦ YouTube MP4 Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.title}\n` +
               `*◦ Author:* ${data.author}\n` +
               `*◦ Duration:* ${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, '0')}\n` +
               `*◦ Quality:* ${data.download.quality}\n` +
               `*◦ Size:* ${data.download.size}\n\n` +
               `*Download URL:* ${data.download.url}`;
    }


async downloadSoundCloud(msg, params) {
  const url = params[0];
  if (!url) return 'Please provide a SoundCloud URL.';

  const result = await this._fetchDownload('soundcloud', url);
  const res = result.data;

  const caption = `╭  ✦ Soundcloud Download ✦  ╮\n\n` +
                  `*◦ Title:* ${res.title}\n` +
                  `*◦ Artist:* ${res.author}\n` +
                  `*◦ Plays:* ${this._convertMiles(res.playbacks)}\n` +
                  `*◦ Likes:* ${this._convertMiles(res.likes)}\n` +
                  `*◦ Comments:* ${this._convertMiles(res.comments)}`;

  const response = await fetch(res.download);
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    caption,
    media: {
      audio: buffer,
      mimetype: 'audio/mpeg'
    }
  };
}


    /**
     * Executes the Facebook download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string or empty if media is sent.
     */
    async downloadFacebook(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Facebook URL.';

        try {
            const result = await this._fetchDownload('facebook', url);
            if (!result.urls || !Array.isArray(result.urls) || result.urls.length === 0) {
                throw new Error('Invalid API response: No media URLs found');
            }

            const caption = `╭  ✦ Facebook video Download ✦  ╮\n\n` +
                           `*◦ Title:* ${result.title || 'No title available'}`;

            // Prefer HD video if available
            const mediaUrl = result.urls[0].hd || result.urls[1]?.sd;
            if (!mediaUrl) {
                throw new Error('No valid media URL found in API response');
            }

            return this._downloadAndSendMedia(msg, mediaUrl, caption, 'video');
        } catch (error) {
            return `❌ Failed to download Facebook video: ${error.message}`;
        }
    }
    async downloadTwitter(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Twitter/X URL.';
        const result = await this._fetchDownload('twitterv2', url);
        const data = result.data;

        // Check if media exists and if it's a video before trying to get the URL
        if (!data.media || !data.media[0] || !data.media[0].videos || data.media[0].videos.length === 0) {
            return 'This tweet does not contain a video.';
        }

        const bestVideo = data.media[0].videos.pop();
        return `╭  ✦ Twitter Download ✦  ╮\n\n` +
               `*◦ Author:* @${data.author.username}\n` +
               `*◦ Description:* ${data.description.split('https://')[0]}\n` +
               `*◦ Views:* ${this._convertMiles(data.view)}\n` +
               `*◦ Likes:* ${this._convertMiles(data.favorite)}\n` +
               `*◦ Retweets:* ${this._convertMiles(data.retweet)}\n\n` +
               `*Download URL (${bestVideo.quality}):* ${bestVideo.url}`;
    }


    /**
     * Executes the Twitter download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string or empty if media is sent.
     */
    async downloadTwitter(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Twitter/X URL.';

        try {
            const result = await this._fetchDownload('twitterv2', url);
            const data = result.data;

            if (!data.media || !data.media[0] || !data.media[0].videos || data.media[0].videos.length === 0) {
                return 'This tweet does not contain a video.';
            }

            const bestVideo = data.media[0].videos.pop();
            const caption = `╭  ✦ Twitter Download ✦  ╮\n\n` +
                           `*◦ Author:* @${data.author.username}\n` +
                           `*◦ Description:* ${data.description.split('https://')[0]}\n` +
                           `*◦ Views:* ${this._convertMiles(data.view)}\n` +
                           `*◦ Likes:* ${this._convertMiles(data.favorite)}\n` +
                           `*◦ Retweets:* ${this._convertMiles(data.retweet)}`;

            return this._downloadAndSendMedia(msg, bestVideo.url, caption, 'video');
        } catch (error) {
            return `❌ Failed to download Twitter video: ${error.message}`;
        }
    }



}

module.exports = DownloaderModule;
