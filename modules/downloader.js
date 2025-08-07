/**
 * DownloaderModule
 *
 * This module provides functionality to download media from various social media platforms
 * using the delirius-apiofc API.
 */
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
                aliases: ['tt', 'tik'],
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
                aliases: ['ig', 'insta'],
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
                aliases: ['yta', 'ytaudio'],
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
                aliases: ['ytv', 'ytvideo'],
                ui: {
                    processingText: '⏳ *Processing YouTube MP4 Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *YouTube MP4 Download Failed*'
                },
                execute: this.downloadYouTubeMP4.bind(this)
            },
            {
                name: 'spotify',
                description: 'Downloads a song from Spotify.',
                usage: '.spotify <track_url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Spotify Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Spotify Download Failed*'
                },
                execute: this.downloadSpotify.bind(this)
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
                name: 'applemusic',
                description: 'Gets download link for an Apple Music track.',
                usage: '.applemusic <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Apple Music Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Apple Music Download Failed*'
                },
                execute: this.downloadAppleMusic.bind(this)
            },
            {
                name: 'xnxx',
                description: 'Downloads a video from XNXX.',
                usage: '.xnxx <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing XNXX Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *XNXX Download Failed*'
                },
                execute: this.downloadXnxx.bind(this)
            },
            {
                name: 'spotifyalbum',
                description: 'Lists tracks from a Spotify album.',
                usage: '.spotifyalbum <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Fetching Spotify Album...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Spotify Album Fetch Failed*'
                },
                execute: this.downloadSpotifyAlbum.bind(this)
            },
            {
                name: 'spotifyplaylist',
                description: 'Lists tracks from a Spotify playlist.',
                usage: '.spotifyplaylist <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Fetching Spotify Playlist...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Spotify Playlist Fetch Failed*'
                },
                execute: this.downloadSpotifyPlaylist.bind(this)
            },
            {
                name: 'threads',
                description: 'Downloads media from a Threads post.',
                usage: '.threads <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Threads Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Threads Download Failed*'
                },
                execute: this.downloadThreads.bind(this)
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
            },
            {
                name: 'pinterest',
                description: 'Downloads media from Pinterest.',
                usage: '.pinterest <url>',
                permissions: 'public',
                ui: {
                    processingText: '⏳ *Processing Pinterest Download...*\n\n🔄 Working on your request...',
                    errorText: '❌ *Pinterest Download Failed*'
                },
                execute: this.downloadPinterest.bind(this)
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
     * Executes the TikTok download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string.
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

        // Download and send the video
        const videoUrl = data.meta.media[0].hd || data.meta.media[0].org;
        await this._downloadAndSendMedia(videoUrl, 'video', caption, msg, this.bot);
        
        return null; // Don't return text since we're sending media
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

        const caption = `*亗 I N S T A G R A M*\n\n*Downloaded from Instagram*`;
        
        // Send each media item
        for (let i = 0; i < media.length; i++) {
            const item = media[i];
            const itemCaption = `${caption}\n*Media ${i + 1} of ${media.length}*`;
            await this._downloadAndSendMedia(item.url, item.type, itemCaption, msg, this.bot);
        }

        return null; // Don't return text since we're sending media
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

        const caption = `╭  ✦ YouTube MP3 Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.title}\n` +
               `*◦ Author:* ${data.author}\n` +
               `*◦ Duration:* ${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, '0')}\n` +
               `*◦ Quality:* ${data.download.quality}\n` +
               `*◦ Size:* ${data.download.size}`;

        // Download and send the audio
        await this._downloadAndSendMedia(data.download.url, 'audio', caption, msg, this.bot);
        
        return null; // Don't return text since we're sending media
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

        const caption = `╭  ✦ YouTube MP4 Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.title}\n` +
               `*◦ Author:* ${data.author}\n` +
               `*◦ Duration:* ${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, '0')}\n` +
               `*◦ Quality:* ${data.download.quality}\n` +
               `*◦ Size:* ${data.download.size}`;

        // Download and send the video
        await this._downloadAndSendMedia(data.download.url, 'video', caption, msg, this.bot);
        
        return null; // Don't return text since we're sending media
    }

    /**
     * Executes the Spotify download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string.
     */
    async downloadSpotify(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Spotify track URL.';

        const result = await this._fetchDownload('spotifydl', url);
        const data = result.data;

        return `╭  ✦ Spotify Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.title || "-"}\n` +
               `*◦ Artist:* ${data.author || "-"}\n` +
               `*◦ Type:* ${data.type || "-"}\n` +
               `*◦ Link:* ${url.trim()}\n\n` +
               `*Download URL:* ${data.url}`;
    }

    /**
     * Executes the SoundCloud download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string.
     */
    async downloadSoundCloud(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a SoundCloud URL.';

        const result = await this._fetchDownload('soundcloud', url);
        const res = result.data;

        return `╭  ✦ Soundcloud Download ✦  ╮\n\n` +
               `*◦ Title:* ${res.title}\n` +
               `*◦ Artist:* ${res.author}\n` +
               `*◦ Plays:* ${this._convertMiles(res.playbacks)}\n` +
               `*◦ Likes:* ${this._convertMiles(res.likes)}\n` +
               `*◦ Comments:* ${this._convertMiles(res.comments)}\n\n` +
               `*Download URL:* ${res.download}`;
    }

    /**
     * Executes the Facebook download command.
     * @param {object} msg - The message object from the bot.
     * @param {string[]} params - The parameters passed with the command.
     * @returns {Promise<string>} The formatted result string.
     */
    async downloadFacebook(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Facebook URL.';

        const result = await this._fetchDownload('facebook', url);

        return `╭  ✦ Facebook Download ✦  ╮\n\n` +
               `*◦ Title:* ${result.title}\n\n` +
               `*HD Video:* ${result.urls[0].hd}\n` +
               `*SD Video:* ${result.urls[1].sd}`;
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

    async downloadAppleMusic(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide an Apple Music URL.';
        const result = await this._fetchDownload('applemusicdl', url);
        const data = result.data;
        return `╭  ✦ Apple Music Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.name || "-"}\n` +
               `*◦ Artist(s):* ${data.artists || "-"}\n` +
               `*◦ Duration:* ${data.duration || "-"}\n\n` +
               `*Download URL:* ${data.download}`;
    }

    async downloadXnxx(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a URL.';
        const result = await this._fetchDownload('xnxxdl', url);
        const data = result.data;
        return `╭  ✦ XNXX Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.title}\n` +
               `*◦ Duration:* ${data.duration.trim()}\n` +
               `*◦ Quality:* ${data.quality}\n` +
               `*◦ Views:* ${data.views}\n\n` +
               `*Download (High Quality):* ${data.download.high}\n` +
               `*Download (Low Quality):* ${data.download.low}`;
    }

    async downloadSpotifyAlbum(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Spotify Album URL.';
        const result = await this._fetchDownload('spotifyalbum', url);
        const data = result.data;
        let responseText = `╭  ✦ Spotify Album: ${data.name} ✦  ╮\n\n` +
                           `*◦ Total Tracks:* ${data.total_tracks}\n` +
                           `*◦ Released:* ${data.publish}\n\n` +
                           `*Tracks:*\n`;
        
        result.tracks.forEach((track, index) => {
            responseText += `${index + 1}. ${track.title} - ${track.artist}\n`;
        });

        return responseText;
    }

    async downloadSpotifyPlaylist(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Spotify Playlist URL.';
        const result = await this._fetchDownload('spotifyplaylist', url);
        const data = result.data;
        let responseText = `╭  ✦ Spotify Playlist: ${data.name} ✦  ╮\n\n` +
                           `*◦ Description:* ${data.description}\n` +
                           `*◦ Followers:* ${this._convertMiles(data.followers)}\n\n` +
                           `*Tracks:*\n`;

        result.tracks.forEach((track, index) => {
            responseText += `${index + 1}. ${track.title} - ${track.artist}\n`;
        });

        return responseText;
    }

    async downloadThreads(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Threads URL.';
        const result = await this._fetchDownload('threads', url);
        const media = result.data;
        let responseText = `*✦ Threads Download ✦*\n\n`;
        media.forEach((item, index) => {
            responseText += `*› Media ${index + 1} [${item.type}]:* ${item.url}\n`;
        });
        return responseText;
    }

    async downloadPinterest(msg, params) {
        const url = params[0];
        if (!url) return 'Please provide a Pinterest URL.';
        const result = await this._fetchDownload('pinterestdl', url);
        const data = result.data;
        return `╭  ✦ Pinterest Download ✦  ╮\n\n` +
               `*◦ Title:* ${data.title}\n` +
               `*◦ Author:* ${data.author_name}\n` +
               `*◦ Username:* ${data.username}\n` +
               `*◦ Likes:* ${this._convertMiles(data.likes)}\n` +
               `*◦ Comments:* ${this._convertMiles(data.comments)}\n\n` +
               `*Download URL:* ${data.download.url}`;
    }
}

module.exports = DownloaderModule;
