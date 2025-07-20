const logger = require('../Core/logger');
const config = require('../config');

class Helpers {
    // ──────────── General Utilities ────────────

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    }

    static formatUptime(startTime) {
        if (typeof startTime !== 'number') return '0s';
        const seconds = Math.floor((Date.now() - startTime) / 1000);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const parts = [];
        if (days) parts.push(`${days}d`);
        if (hours) parts.push(`${hours}h`);
        if (minutes) parts.push(`${minutes}m`);
        if (secs || parts.length === 0) parts.push(`${secs}s`);
        return parts.join(' ');
    }

    static formatFileSize(bytes) {
        if (typeof bytes !== 'number' || bytes <= 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    static cleanPhoneNumber(phone) {
        return typeof phone === 'string' ? phone.replace(/[^\d]/g, '') : '';
    }

    static generateRandomString(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    static generateRandomId(length = 8) {
        return this.generateRandomString(length);
    }

    static isOwner(participant) {
        const owner = config.get('bot.owner');
        return participant === owner;
    }

    static isUrl(str) {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    }

    static extractUrls(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex) || [];
    }

    static formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    }

    static toTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    static example(prefix, command, example) {
        return `❌ *Usage Example*\n\n${prefix}${command} ${example}`;
    }

    static texted(style, text) {
        switch (style) {
            case 'bold': return `*${text}*`;
            case 'italic': return `_${text}_`;
            case 'monospace': return `\`\`\`${text}\`\`\``;
            default: return text;
        }
    }

    static jsonFormat(obj) {
        return '```json\n' + JSON.stringify(obj, null, 2) + '\n```';
    }

    static filename(ext) {
        return `file_${Date.now()}.${ext}`;
    }

    static parseSize(sizeStr) {
        const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(MB|KB|GB)/i);
        if (!match) return 0;
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        switch (unit) {
            case 'KB': return value / 1024;
            case 'MB': return value;
            case 'GB': return value * 1024;
            default: return value;
        }
    }

    static sizeLimit(size, maxSize) {
        const sizeInMB = this.parseSize(size);
        const maxSizeInMB = parseInt(maxSize);
        return {
            oversize: sizeInMB > maxSizeInMB,
            size: sizeInMB,
            maxSize: maxSizeInMB
        };
    }

    static async fetchBuffer(url) {
        try {
            const response = await fetch(url);
            return await response.buffer();
        } catch (error) {
            throw new Error(`Failed to fetch buffer: ${error.message}`);
        }
    }

    static async getFile(url) {
        try {
            const response = await fetch(url);
            const buffer = await response.buffer();
            return {
                status: true,
                file: buffer,
                extension: url.split('.').pop() || 'bin',
                mime: response.headers.get('content-type') || 'application/octet-stream'
            };
        } catch (error) {
            return {
                status: false,
                error: error.message
            };
        }
    }

    // ──────────── Media / Message Utilities ────────────

    static extractText(msg) {
        return msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            msg.message?.documentMessage?.caption ||
            msg.message?.audioMessage?.caption ||
            '';
    }

    static hasMedia(msg) {
        return !!(
            msg.message?.imageMessage ||
            msg.message?.videoMessage ||
            msg.message?.audioMessage ||
            msg.message?.documentMessage ||
            msg.message?.stickerMessage ||
            msg.message?.locationMessage ||
            msg.message?.contactMessage
        );
    }

    static getMediaType(msg) {
        if (msg.message?.imageMessage) return 'image';
        if (msg.message?.videoMessage) return 'video';
        if (msg.message?.audioMessage) return 'audio';
        if (msg.message?.documentMessage) return 'document';
        if (msg.message?.stickerMessage) return 'sticker';
        if (msg.message?.locationMessage) return 'location';
        if (msg.message?.contactMessage) return 'contact';
        return 'unknown';
    }

    static async downloadMedia(msg, bot) {
        try {
            if (!this.hasMedia(msg)) {
                throw new Error('No media found in message');
            }
            return await bot.sock.downloadMediaMessage(msg);
        } catch (error) {
            logger.error('Failed to download media:', error);
            throw error;
        }
    }

    // ──────────── Bot Error Wrapper ────────────

    static async smartErrorRespond(bot, originalMsg, options = {}) {
        let {
            processingText,
            errorText = '❌ Something went wrong.',
            actionFn = () => { throw new Error('No action provided'); },
            autoReact = config.get('features.autoReact', true),
            editMessages = config.get('features.messageEdit', true),
            smartProcessing = config.get('features.smartProcessing', false),
            selfEdit = config.get('features.selfEditCommands', true)
        } = options;

        if (!bot?.sock?.sendMessage || !originalMsg?.key?.remoteJid) return;

        const sender = originalMsg.key.remoteJid;
        const isFromSelf = originalMsg.key.fromMe === true;
        const originalPassedText = processingText;
        let processingMsgKey = null;

        if (!processingText) {
            const cmdText =
                originalMsg?.message?.conversation ||
                originalMsg?.message?.extendedTextMessage?.text ||
                '.';
            const cmdName = cmdText.trim().split(/\s+/)[0];
            processingText = isFromSelf
                ? '⏳ Processing...'
                : `⏳ Running *${cmdName}*...`;
        }

        const isStructured = !!originalPassedText;

        try {
            if (autoReact) {
                await bot.sock.sendMessage(sender, {
                    react: { key: originalMsg.key, text: '⏳' }
                });
            }

            if (isStructured && selfEdit && isFromSelf) {
                await bot.sock.sendMessage(sender, {
                    text: processingText,
                    edit: originalMsg.key
                });
                processingMsgKey = originalMsg.key;
            } else if (editMessages) {
                const processingMsg = await bot.sendMessage(sender, { text: processingText });
                processingMsgKey = processingMsg.key;
            }

            const result = await actionFn();

            if (autoReact) {
                await Helpers.sleep(1000);
                await bot.sock.sendMessage(sender, {
                    react: { key: originalMsg.key, text: '' }
                });
            }

            if (processingMsgKey && typeof result === 'string') {
                await bot.sock.sendMessage(sender, {
                    text: result,
                    edit: processingMsgKey
                });
            } else if (typeof result === 'string') {
                await bot.sendMessage(sender, { text: result });
            }

            return result;

        } catch (error) {
            if (autoReact) {
                await Helpers.sleep(1500);
                await bot.sock.sendMessage(sender, {
                    react: { key: originalMsg.key, text: '❌' }
                });
            }

            const finalErrorText = smartProcessing
                ? `${errorText}\n\n🔍 Error: ${error.message}`
                : errorText;

            if (processingMsgKey) {
                await bot.sock.sendMessage(sender, {
                    text: finalErrorText,
                    edit: processingMsgKey
                });
            } else {
                await bot.sendMessage(sender, { text: finalErrorText });
            }

            throw error;
        }
    }

    static async sendCommandResponse(bot, originalMsg, responseText) {
        return this.smartErrorRespond(bot, originalMsg, {
            processingText: '⏳ Checking command...',
            errorText: responseText,
            actionFn: async () => {
                throw new Error(responseText);
            }
        });
    }
}

module.exports = Helpers;
