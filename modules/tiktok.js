const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class TikTokModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'tiktok';
        this.metadata = {
            description: 'Download TikTok videos without watermark',
            version: '1.0.0',
            author: 'HyperWa Team',
            category: 'downloader',
            dependencies: ['axios', 'fs-extra']
        };
        this.commands = [
            {
                name: 'tiktok',
                description: 'Download TikTok video',
                usage: '.tiktok <tiktok_url>',
                permissions: 'public',
                ui: {
                    processingText: '📱 *TikTok Downloader*\n\n⏳ Fetching video information...\n🔄 Please wait while I process the video...',
                    errorText: '❌ *TikTok Download Failed*'
                },
                execute: this.downloadTikTok.bind(this)
            },
            {
                name: 'tt',
                description: 'Download TikTok video (short alias)',
                usage: '.tt <tiktok_url>',
                permissions: 'public',
                ui: {
                    processingText: '📱 *TikTok Downloader*\n\n⏳ Fetching video information...\n🔄 Please wait while I process the video...',
                    errorText: '❌ *TikTok Download Failed*'
                },
                execute: this.downloadTikTok.bind(this)
            },
            {
                name: 'tiktokinfo',
                description: 'Get TikTok video information without downloading',
                usage: '.tiktokinfo <tiktok_url>',
                permissions: 'public',
                ui: {
                    processingText: '📊 *TikTok Info*\n\n⏳ Fetching video details...',
                    errorText: '❌ *TikTok Info Fetch Failed*'
                },
                execute: this.getTikTokInfo.bind(this)
            }
        ];
        this.apiBaseUrl = 'https://delirius-apiofc.vercel.app/download/tiktok';
        this.tempDir = path.join(__dirname, '../temp');
    }

    async init() {
        await fs.ensureDir(this.tempDir);
        console.log('✅ TikTok module initialized');
    }

    async downloadTikTok(msg, params, context) {
        if (params.length === 0) {
            return '❌ *TikTok Downloader*\n\nPlease provide a TikTok URL.\n\n💡 Usage: `.tiktok <url>`\n📝 Example: `.tiktok https://vt.tiktok.com/ZSB2HNoKR/`';
        }

        const url = params[0];
        
        if (!this.isValidTikTokUrl(url)) {
            return '❌ *Invalid TikTok URL*\n\nPlease provide a valid TikTok URL.\n\n✅ Supported formats:\n• https://www.tiktok.com/@username/video/...\n• https://vt.tiktok.com/...\n• https://vm.tiktok.com/...';
        }

        try {
            // Fetch video information
            const response = await axios.get(this.apiBaseUrl, {
                params: { url },
                timeout: 30000
            });

            const data = response.data;

            if (!data.status) {
                throw new Error('API returned error status');
            }

            const videoData = data.data;
            const mediaInfo = videoData.meta.media[0];

            // Prepare video info text
            let infoText = `📱 *TikTok Video Downloaded*\n\n`;
            infoText += `🎬 **Title:** ${videoData.title}\n`;
            infoText += `👤 **Author:** ${videoData.author.nickname} (@${videoData.author.username.replace('@', '')})\n`;
            infoText += `⏱️ **Duration:** ${videoData.duration}s\n`;
            infoText += `❤️ **Likes:** ${videoData.like}\n`;
            infoText += `💬 **Comments:** ${videoData.comment}\n`;
            infoText += `🔄 **Shares:** ${videoData.share}\n`;
            infoText += `📥 **Downloads:** ${videoData.download}\n`;
            infoText += `📅 **Published:** ${videoData.published}\n`;
            
            if (videoData.music && videoData.music.title) {
                infoText += `🎵 **Music:** ${videoData.music.title}\n`;
                infoText += `🎤 **Artist:** ${videoData.music.author}\n`;
            }
            
            infoText += `📊 **Size:** ${mediaInfo.size_org}\n`;
            infoText += `🌍 **Region:** ${videoData.region}\n\n`;
            infoText += `✨ *Downloaded without watermark*`;

            // Download the video
            const videoUrl = mediaInfo.org; // Original without watermark
            const videoResponse = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 60000
            });

            const videoBuffer = Buffer.from(videoResponse.data);

            // Send the video
            await context.bot.sendMessage(context.sender, {
                video: videoBuffer,
                caption: infoText,
                mimetype: 'video/mp4'
            });

            return `✅ *TikTok Video Sent*\n\n📱 Successfully downloaded and sent TikTok video\n⏰ ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new Error('Download timeout - the video might be too large or server is slow');
            }
            if (error.response?.status === 404) {
                throw new Error('Video not found - the TikTok URL might be invalid or the video was deleted');
            }
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded - please try again later');
            }
            throw new Error(`Download failed: ${error.message}`);
        }
    }

    async getTikTokInfo(msg, params, context) {
        if (params.length === 0) {
            return '❌ *TikTok Info*\n\nPlease provide a TikTok URL.\n\n💡 Usage: `.tiktokinfo <url>`\n📝 Example: `.tiktokinfo https://vt.tiktok.com/ZSB2HNoKR/`';
        }

        const url = params[0];
        
        if (!this.isValidTikTokUrl(url)) {
            return '❌ *Invalid TikTok URL*\n\nPlease provide a valid TikTok URL.';
        }

        try {
            const response = await axios.get(this.apiBaseUrl, {
                params: { url },
                timeout: 15000
            });

            const data = response.data;

            if (!data.status) {
                throw new Error('API returned error status');
            }

            const videoData = data.data;
            const mediaInfo = videoData.meta.media[0];

            let infoText = `📊 *TikTok Video Information*\n\n`;
            infoText += `🆔 **Video ID:** ${videoData.id}\n`;
            infoText += `🎬 **Title:** ${videoData.title}\n`;
            infoText += `👤 **Author:** ${videoData.author.nickname}\n`;
            infoText += `📱 **Username:** @${videoData.author.username.replace('@', '')}\n`;
            infoText += `👤 **Author ID:** ${videoData.author.id}\n\n`;
            
            infoText += `📈 **Statistics:**\n`;
            infoText += `  • ❤️ Likes: ${videoData.like}\n`;
            infoText += `  • 💬 Comments: ${videoData.comment}\n`;
            infoText += `  • 🔄 Shares: ${videoData.share}\n`;
            infoText += `  • 📥 Downloads: ${videoData.download}\n`;
            infoText += `  • 👀 Views: ${videoData.repro}\n\n`;
            
            infoText += `⏱️ **Duration:** ${videoData.duration} seconds\n`;
            infoText += `📅 **Published:** ${videoData.published}\n`;
            infoText += `🌍 **Region:** ${videoData.region}\n\n`;
            
            if (videoData.music && videoData.music.title) {
                infoText += `🎵 **Music Information:**\n`;
                infoText += `  • Title: ${videoData.music.title}\n`;
                infoText += `  • Artist: ${videoData.music.author}\n`;
                infoText += `  • Duration: ${videoData.music.duration}s\n\n`;
            }
            
            infoText += `📊 **File Information:**\n`;
            infoText += `  • Original Size: ${mediaInfo.size_org}\n`;
            infoText += `  • HD Size: ${mediaInfo.size_hd}\n`;
            infoText += `  • Type: ${mediaInfo.type}\n\n`;
            
            infoText += `🔗 **Download Links:**\n`;
            infoText += `  • [Original Quality](${mediaInfo.org})\n`;
            infoText += `  • [HD Quality](${mediaInfo.hd})\n`;
            if (mediaInfo.wm && mediaInfo.wm !== mediaInfo.org) {
                infoText += `  • [With Watermark](${mediaInfo.wm})\n`;
            }
            
            infoText += `\n⏰ Fetched at ${new Date().toLocaleTimeString()}`;

            return infoText;

        } catch (error) {
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new Error('Request timeout - please try again');
            }
            if (error.response?.status === 404) {
                throw new Error('Video not found - the TikTok URL might be invalid');
            }
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded - please try again later');
            }
            throw new Error(`Info fetch failed: ${error.message}`);
        }
    }

    isValidTikTokUrl(url) {
        const tikTokPatterns = [
            /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
            /^https?:\/\/vt\.tiktok\.com\/[\w-]+/,
            /^https?:\/\/vm\.tiktok\.com\/[\w-]+/,
            /^https?:\/\/m\.tiktok\.com\/v\/\d+/,
            /^https?:\/\/(www\.)?tiktok\.com\/t\/[\w-]+/
        ];

        return tikTokPatterns.some(pattern => pattern.test(url));
    }

    formatNumber(num) {
        if (!num) return '0';
        const number = parseFloat(num.toString().replace(/[^\d.]/g, ''));
        if (number >= 1000000) {
            return (number / 1000000).toFixed(1) + 'M';
        }
        if (number >= 1000) {
            return (number / 1000).toFixed(1) + 'K';
        }
        return number.toString();
    }

    async destroy() {
        await fs.remove(this.tempDir);
        console.log('🛑 TikTok module destroyed');
    }
}

module.exports = TikTokModule;