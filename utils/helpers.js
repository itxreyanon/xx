const config = require('../config');

class Helpers {
    static async smartErrorRespond(bot, originalMsg, options = {}) {
        const {
            actionFn = () => { throw new Error('No action provided'); },
            processingText = '⏳ Processing...', // This will be overridden by ModuleLoader's specific text if provided
            errorText = '❌ Something went wrong.', // This will be overridden by ModuleLoader's specific text if provided
            autoReact = true,
        } = options;

        if (!bot?.sock?.sendMessage || !originalMsg?.key?.remoteJid) return;

        const jid = originalMsg.key.remoteJid;
        const isFromBot = originalMsg.key.fromMe === true;
        let procKey;

        // 1. React to original message (original logic)
        if (autoReact) {
            await bot.sock.sendMessage(jid, {
                react: { key: originalMsg.key, text: '⏳' }
            });
        }

        // 2. Send or edit a processing message
        if (isFromBot) {
            // Edit bot's original message
            await bot.sock.sendMessage(jid, {
                text: processingText,
                edit: originalMsg.key
            });
            procKey = originalMsg.key;
        } else {
            // Send new "Running..." message and track that
            const sent = await bot.sock.sendMessage(jid, {
                text: processingText
            });
            procKey = sent.key;
        }

        try {
            // 3. Execute action
            const result = await actionFn();

            if (autoReact) {
                await this.sleep(200); // Keep sleep for smooth reaction removal
                await bot.sock.sendMessage(jid, {
                    react: { key: originalMsg.key, text: '' } // Original logic: remove reaction
                });
            }

            // 4. Edit processing message with result
            let finalResultText;
            if (typeof result === 'string') {
                finalResultText = result;
            } else if (result !== undefined && result !== null) {
                try {
                    finalResultText = JSON.stringify(result, null, 2);
                } catch (jsonError) {
                    // Fallback if JSON.stringify somehow fails on a weird object
                    finalResultText = `Operation completed. (Result could not be formatted: ${jsonError.message})`;
                }
            } else {
                // Explicit fallback for undefined or null results
                finalResultText = '✅ Command executed successfully.';
            }

            await bot.sock.sendMessage(jid, {
                text: finalResultText,
                edit: procKey
            });

            return result;

        } catch (error) {
            if (autoReact) {
                await bot.sock.sendMessage(jid, {
                    react: { key: originalMsg.key, text: '❌' } // Original logic: error reaction
                });
            }

            const finalErrorText = `${errorText}${error.message ? `\n\n🔍 ${error.message}` : ''}`;

            await bot.sock.sendMessage(jid, {
                text: finalErrorText,
                edit: procKey
            });

            error._handledBySmartError = true;
            throw error;
        }
    }


    static async sendCommandResponse(bot, originalMsg, responseText) {
        // This function intentionally throws an error to use the smartErrorRespond's error path
        await this.smartErrorRespond(bot, originalMsg, {
            processingText: '⏳ Checking command...', // Can be customized
            errorText: responseText, // This becomes the primary error message
            actionFn: async () => {
                throw new Error(responseText); // The error message is the responseText
            }
        });
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

    static isOwner(participant) {
        const owner = config.get('bot.owner');
        return participant === owner;
    }

    static generateRandomString(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    }
}

module.exports = Helpers;
