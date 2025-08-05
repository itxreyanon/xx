const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class DownloaderModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'downloader';
        this.metadata = {
            description: 'Download media from various social platforms',
            version: '1.0.0',
            author: 'HyperWa Team',
            category: 'media',
            dependencies: ['axios']
        };
        this.commands = [
            {
                name: 'tiktok',
                description: 'Download TikTok video',
                usage: '.tiktok <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing TikTok download...',
                    errorText: 'TikTok download failed'
                },
                execute: this.downloadTikTok.bind(this)
            },
            {
                name: 'tt',
                description: 'Download TikTok video (alias)',
                usage: '.tt <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing TikTok download...',
                    errorText: 'TikTok download failed'
                },
                execute: this.downloadTikTok.bind(this)
            },
            {
                name: 'instagram',
                description: 'Download Instagram media',
                usage: '.instagram <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Instagram download...',
                    errorText: 'Instagram download failed'
                },
                execute: this.downloadInstagram.bind(this)
            },
            {
                name: 'ig',
                description: 'Download Instagram media (alias)',
                usage: '.ig <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Instagram download...',
                    errorText: 'Instagram download failed'
                },
                execute: this.downloadInstagram.bind(this)
            },
            {
                name: 'pinterest',
                description: 'Download Pinterest media',
                usage: '.pinterest <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Pinterest download...',
                    errorText: 'Pinterest download failed'
                },
                execute: this.downloadPinterest.bind(this)
            },
            {
                name: 'pin',
                description: 'Download Pinterest media (alias)',
                usage: '.pin <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Pinterest download...',
                    errorText: 'Pinterest download failed'
                },
                execute: this.downloadPinterest.bind(this)
            },
            {
                name: 'spotify',
                description: 'Download Spotify track',
                usage: '.spotify <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Spotify download...',
                    errorText: 'Spotify download failed'
                },
                execute: this.downloadSpotify.bind(this)
            },
            {
                name: 'applemusic',
                description: 'Download Apple Music track',
                usage: '.applemusic <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Apple Music download...',
                    errorText: 'Apple Music download failed'
                },
                execute: this.downloadAppleMusic.bind(this)
            },
            {
                name: 'soundcloud',
                description: 'Download SoundCloud track',
                usage: '.soundcloud <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing SoundCloud download...',
                    errorText: 'SoundCloud download failed'
                },
                execute: this.downloadSoundCloud.bind(this)
            },
            {
                name: 'sc',
                description: 'Download SoundCloud track (alias)',
                usage: '.sc <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing SoundCloud download...',
                    errorText: 'SoundCloud download failed'
                },
                execute: this.downloadSoundCloud.bind(this)
            },
            {
                name: 'youtube',
                description: 'Download YouTube video',
                usage: '.youtube <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing YouTube download...',
                    errorText: 'YouTube download failed'
                },
                execute: this.downloadYouTube.bind(this)
            },
            {
                name: 'yt',
                description: 'Download YouTube video (alias)',
                usage: '.yt <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing YouTube download...',
                    errorText: 'YouTube download failed'
                },
                execute: this.downloadYouTube.bind(this)
            },
            {
                name: 'ytmp3',
                description: 'Download YouTube audio',
                usage: '.ytmp3 <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing YouTube audio download...',
                    errorText: 'YouTube audio download failed'
                },
                execute: this.downloadYouTubeAudio.bind(this)
            },
            {
                name: 'facebook',
                description: 'Download Facebook video',
                usage: '.facebook <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Facebook download...',
                    errorText: 'Facebook download failed'
                },
                execute: this.downloadFacebook.bind(this)
            },
            {
                name: 'fb',
                description: 'Download Facebook video (alias)',
                usage: '.fb <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Facebook download...',
                    errorText: 'Facebook download failed'
                },
                execute: this.downloadFacebook.bind(this)
            },
            {
                name: 'twitter',
                description: 'Download Twitter media',
                usage: '.twitter <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Twitter download...',
                    errorText: 'Twitter download failed'
                },
                execute: this.downloadTwitter.bind(this)
            },
            {
                name: 'x',
                description: 'Download Twitter/X media (alias)',
                usage: '.x <url>',
                permissions: 'public',
                ui: {
                    processingText: 'Processing Twitter download...',
                    errorText: 'Twitter download failed'
                },
                execute: this.downloadTwitter.bind(this)
            }
        ];
        this.baseUrl = 'https://delirius-apiofc.vercel.app';
        this.tempDir = path.join(__dirname, '../temp');
    }

    async init() {
        await fs.ensureDir(this.tempDir);
        console.log('Downloader module initialized');
    }

    ConvertMiles(num) {
        if (!num) return '0';
        const number = parseInt(num.toString().replace(/[^\d]/g, ''));
        if (number >= 1000000) {
            return (number / 1000000).toFixed(1) + 'M';
        } else if (number >= 1000) {
            return (number / 1000).toFixed(1) + 'K';
        }
        return number.toString();
    }

    validateUrl(url, platform) {
        const patterns = {
            tiktok: /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?(?:tiktok\.com|tiktok\.com\/t)/,
            instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com/,
            pinterest: /(?:https?:\/\/)?(?:www\.)?pinterest\.com/,
            spotify: /(?:https?:\/\/)?(?:open\.)?spotify\.com/,
            applemusic: /(?:https?:\/\/)?music\.apple\.com/,
            soundcloud: /(?:https?:\/\/)?(?:www\.)?soundcloud\.com/,
            youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)/,
            facebook: /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch)/,
            twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)/
        };
        return patterns[platform]?.test(url) || false;
    }

    async downloadMedia(url, filename) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const filePath = path.join(this.tempDir, filename);
            await fs.writeFile(filePath, response.data);
            return filePath;
        } catch (error) {
            throw new Error(`Media download failed: ${error.message}`);
        }
    }

    async downloadTikTok(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .tiktok <url>\nExample: .tiktok https://vt.tiktok.com/ZSB2HNoKR/';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'tiktok')) {
            return 'Invalid TikTok URL. Please provide a valid TikTok link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/tiktok`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch TikTok data');
            }

            const videoData = data.data;
            const videoUrl = videoData.meta.media[0].org;

            // Download video
            const filename = `tiktok_${videoData.id}.mp4`;
            const filePath = await this.downloadMedia(videoUrl, filename);
            const videoBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ TikTok Download ✦  ╮\n` +
                `*◦ Nombre :* ${videoData.author.nickname}\n` +
                `*◦ Usuario :* ${videoData.author.username}\n` +
                `*◦ Duracion :* ${videoData.duration}s\n` +
                `*◦ Reproducido :* ${this.ConvertMiles(videoData.repro)}\n` +
                `*◦ Likes :* ${this.ConvertMiles(videoData.like)}\n` +
                `*◦ Compartido :* ${this.ConvertMiles(videoData.share)}\n` +
                `*◦ Comentarios :* ${this.ConvertMiles(videoData.comment)}\n` +
                `*◦ Descargas :* ${this.ConvertMiles(videoData.download)}\n` +
                `	╭  ✦ Music Info ✦  ╮\n` +
                `*◦ Musica :* ${videoData.music.title}\n` +
                `*◦ Autor :* ${videoData.music.author}\n` +
                `*◦ Duracion :* ${videoData.music.duration}`;

            await context.bot.sendMessage(context.sender, {
                video: videoBuffer,
                caption: caption
            });

            return 'TikTok video downloaded successfully';

        } catch (error) {
            throw new Error(`TikTok download failed: ${error.message}`);
        }
    }

    async downloadInstagram(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .instagram <url>\nExample: .instagram https://www.instagram.com/p/ABC123/';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'instagram')) {
            return 'Invalid Instagram URL. Please provide a valid Instagram link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/instagram`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch Instagram data');
            }

            const result = data.data;
            const mediaUrl = result.media[0].url;

            // Download media
            const isVideo = result.media[0].type === 'video';
            const filename = `instagram_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
            const filePath = await this.downloadMedia(mediaUrl, filename);
            const mediaBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `*亗 I N S T A G R A M*\n\n` +
                `*› Usuario:* ${result.username || "-"}\n` +
                `*› Fullname :* ${result.fullname || "-"}\n` +
                `*› Likes :* ${this.ConvertMiles(result.likes) || "-"}\n` +
                `*› Comentarios :* ${this.ConvertMiles(result.comments) || "-"}\n` +
                `*› Publicado :* ${result.published || "-"}\n` +
                `*› Follows :* ${this.ConvertMiles(result.followed) || "-"}\n` +
                `*› Verificado :* ${result.is_verified ? "×" : "√"}\n` +
                `*› Private :* ${result.is_private ? "×" : "√"}`;

            if (isVideo) {
                await context.bot.sendMessage(context.sender, {
                    video: mediaBuffer,
                    caption: caption
                });
            } else {
                await context.bot.sendMessage(context.sender, {
                    image: mediaBuffer,
                    caption: caption
                });
            }

            return 'Instagram media downloaded successfully';

        } catch (error) {
            throw new Error(`Instagram download failed: ${error.message}`);
        }
    }

    async downloadPinterest(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .pinterest <url>\nExample: .pinterest https://www.pinterest.com/pin/123456789/';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'pinterest')) {
            return 'Invalid Pinterest URL. Please provide a valid Pinterest link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/pinterest`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch Pinterest data');
            }

            const result = data.data;
            const mediaUrl = result.media;

            // Download media
            const isVideo = mediaUrl.includes('.mp4');
            const filename = `pinterest_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
            const filePath = await this.downloadMedia(mediaUrl, filename);
            const mediaBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `*亗 P I N T E R E S T — D O W N L O A D*\n\n` +
                `*› Titulo :* ${result.title}\n` +
                `*› Comentarios:* ${result.comments}\n` +
                `*› Likes :* ${result.likes}\n` +
                `*› Autor :* ${result.author_name}\n` +
                `*› Usuario :* ${result.username}\n` +
                `*› Seguidores :* ${result.followers}\n` +
                `*› Publicado :* ${result.upload}\n` +
                `*› Profile :* ${result.author_url}`;

            if (isVideo) {
                await context.bot.sendMessage(context.sender, {
                    video: mediaBuffer,
                    caption: caption
                });
            } else {
                await context.bot.sendMessage(context.sender, {
                    image: mediaBuffer,
                    caption: caption
                });
            }

            return 'Pinterest media downloaded successfully';

        } catch (error) {
            throw new Error(`Pinterest download failed: ${error.message}`);
        }
    }

    async downloadSpotify(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .spotify <url>\nExample: .spotify https://open.spotify.com/track/...';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'spotify')) {
            return 'Invalid Spotify URL. Please provide a valid Spotify link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/spotify`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch Spotify data');
            }

            const result = data.data;
            const audioUrl = result.download;

            // Download audio
            const filename = `spotify_${Date.now()}.mp3`;
            const filePath = await this.downloadMedia(audioUrl, filename);
            const audioBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ Spotify Download ✦  ╮\n` +
                `*◦ Titulo :* ${result.title || "-"}\n` +
                `*◦ Artista :* ${result.author || "-"}\n` +
                `*◦ Type :* ${result.type || "-"}\n` +
                `*◦ Enlace :* ${url.trim()}`;

            await context.bot.sendMessage(context.sender, {
                audio: audioBuffer,
                mimetype: 'audio/mp4',
                caption: caption
            });

            return 'Spotify track downloaded successfully';

        } catch (error) {
            throw new Error(`Spotify download failed: ${error.message}`);
        }
    }

    async downloadAppleMusic(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .applemusic <url>\nExample: .applemusic https://music.apple.com/...';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'applemusic')) {
            return 'Invalid Apple Music URL. Please provide a valid Apple Music link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/applemusic`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch Apple Music data');
            }

            const result = data.data;
            const audioUrl = result.download;

            // Download audio
            const filename = `applemusic_${Date.now()}.mp3`;
            const filePath = await this.downloadMedia(audioUrl, filename);
            const audioBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ Apple Music Download ✦  ╮\n` +
                `*◦ Titulo :* ${result.name || "-"}\n` +
                `*◦ Artista :* ${result.artists || "-"}\n` +
                `*◦ Duracion :* ${result.type || "-"}\n` +
                `*◦ Duracion :* ${result.duration || "-"}\n` +
                `*◦ Enlace :* ${url.trim()}`;

            await context.bot.sendMessage(context.sender, {
                audio: audioBuffer,
                mimetype: 'audio/mp4',
                caption: caption
            });

            return 'Apple Music track downloaded successfully';

        } catch (error) {
            throw new Error(`Apple Music download failed: ${error.message}`);
        }
    }

    async downloadSoundCloud(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .soundcloud <url>\nExample: .soundcloud https://soundcloud.com/...';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'soundcloud')) {
            return 'Invalid SoundCloud URL. Please provide a valid SoundCloud link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/soundcloud`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch SoundCloud data');
            }

            const result = data.data;
            const audioUrl = result.download;

            // Download audio
            const filename = `soundcloud_${Date.now()}.mp3`;
            const filePath = await this.downloadMedia(audioUrl, filename);
            const audioBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ Soundcloud Download ✦  ╮\n\n` +
                `*◦ Titulo :* ${result.title}\n` +
                `*◦ Artista :* ${result.artist}\n` +
                `*◦ Genero :* ${result.genre}\n` +
                `*◦ Album :* ${result.album}\n` +
                `*◦ Play :* ${result.play}\n` +
                `*◦ Likes :* ${result.likes}\n` +
                `*◦ Comentarios :* ${result.comments}`;

            await context.bot.sendMessage(context.sender, {
                audio: audioBuffer,
                mimetype: 'audio/mp4',
                caption: caption
            });

            return 'SoundCloud track downloaded successfully';

        } catch (error) {
            throw new Error(`SoundCloud download failed: ${error.message}`);
        }
    }

    async downloadYouTube(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .youtube <url>\nExample: .youtube https://www.youtube.com/watch?v=...';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'youtube')) {
            return 'Invalid YouTube URL. Please provide a valid YouTube link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/youtube`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch YouTube data');
            }

            const result = data.data;
            const videoUrl = result.video;

            // Download video
            const filename = `youtube_${Date.now()}.mp4`;
            const filePath = await this.downloadMedia(videoUrl, filename);
            const videoBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ YouTube Download ✦  ╮\n` +
                `*◦ Titulo :* ${result.title}\n` +
                `*◦ Canal :* ${result.channel}\n` +
                `*◦ Duracion :* ${result.duration}\n` +
                `*◦ Vistas :* ${this.ConvertMiles(result.views)}\n` +
                `*◦ Publicado :* ${result.published}`;

            await context.bot.sendMessage(context.sender, {
                video: videoBuffer,
                caption: caption
            });

            return 'YouTube video downloaded successfully';

        } catch (error) {
            throw new Error(`YouTube download failed: ${error.message}`);
        }
    }

    async downloadYouTubeAudio(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .ytmp3 <url>\nExample: .ytmp3 https://www.youtube.com/watch?v=...';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'youtube')) {
            return 'Invalid YouTube URL. Please provide a valid YouTube link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/ytmp3`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch YouTube audio data');
            }

            const result = data.data;
            const audioUrl = result.audio;

            // Download audio
            const filename = `youtube_audio_${Date.now()}.mp3`;
            const filePath = await this.downloadMedia(audioUrl, filename);
            const audioBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ YouTube Audio Download ✦  ╮\n` +
                `*◦ Titulo :* ${result.title}\n` +
                `*◦ Canal :* ${result.channel}\n` +
                `*◦ Duracion :* ${result.duration}\n` +
                `*◦ Vistas :* ${this.ConvertMiles(result.views)}\n` +
                `*◦ Publicado :* ${result.published}`;

            await context.bot.sendMessage(context.sender, {
                audio: audioBuffer,
                mimetype: 'audio/mp4',
                caption: caption
            });

            return 'YouTube audio downloaded successfully';

        } catch (error) {
            throw new Error(`YouTube audio download failed: ${error.message}`);
        }
    }

    async downloadFacebook(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .facebook <url>\nExample: .facebook https://www.facebook.com/...';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'facebook')) {
            return 'Invalid Facebook URL. Please provide a valid Facebook link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/facebook`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch Facebook data');
            }

            const result = data.data;
            const videoUrl = result.video;

            // Download video
            const filename = `facebook_${Date.now()}.mp4`;
            const filePath = await this.downloadMedia(videoUrl, filename);
            const videoBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ Facebook Download ✦  ╮\n` +
                `*◦ Titulo :* ${result.title || "Facebook Video"}\n` +
                `*◦ Duracion :* ${result.duration || "-"}\n` +
                `*◦ Calidad :* ${result.quality || "HD"}`;

            await context.bot.sendMessage(context.sender, {
                video: videoBuffer,
                caption: caption
            });

            return 'Facebook video downloaded successfully';

        } catch (error) {
            throw new Error(`Facebook download failed: ${error.message}`);
        }
    }

    async downloadTwitter(msg, params, context) {
        if (params.length === 0) {
            return 'Usage: .twitter <url>\nExample: .twitter https://twitter.com/...';
        }

        const url = params[0];
        if (!this.validateUrl(url, 'twitter')) {
            return 'Invalid Twitter URL. Please provide a valid Twitter/X link.';
        }

        try {
            const response = await axios.get(`${this.baseUrl}/download/twitter`, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;
            if (!data.status) {
                throw new Error('Failed to fetch Twitter data');
            }

            const result = data.data;
            const mediaUrl = result.media[0].url;
            const isVideo = result.media[0].type === 'video';

            // Download media
            const filename = `twitter_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
            const filePath = await this.downloadMedia(mediaUrl, filename);
            const mediaBuffer = await fs.readFile(filePath);

            // Clean up temp file
            await fs.remove(filePath);

            const caption = `	╭  ✦ Twitter Download ✦  ╮\n` +
                `*◦ Usuario :* ${result.username}\n` +
                `*◦ Nombre :* ${result.name}\n` +
                `*◦ Texto :* ${result.text}\n` +
                `*◦ Fecha :* ${result.date}\n` +
                `*◦ Likes :* ${this.ConvertMiles(result.likes)}\n` +
                `*◦ Retweets :* ${this.ConvertMiles(result.retweets)}`;

            if (isVideo) {
                await context.bot.sendMessage(context.sender, {
                    video: mediaBuffer,
                    caption: caption
                });
            } else {
                await context.bot.sendMessage(context.sender, {
                    image: mediaBuffer,
                    caption: caption
                });
            }

            return 'Twitter media downloaded successfully';

        } catch (error) {
            throw new Error(`Twitter download failed: ${error.message}`);
        }
    }

    async destroy() {
        await fs.remove(this.tempDir);
        console.log('Downloader module destroyed');
    }
}

module.exports = DownloaderModule;