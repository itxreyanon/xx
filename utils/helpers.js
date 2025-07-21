const config = require('../config');

class Helpers {
    static async smartErrorRespond(bot, originalMsg, options = {}) {
        const {
            actionFn = () => { throw new Error('No action provided'); },
            // processingText and errorText are now passed directly from ModuleLoader,
            // so we don't need redundant defaults here unless you want absolute fallbacks
            // that override ModuleLoader's specific ones if they are somehow empty.
            // For this scenario, we assume ModuleLoader provides them or their defaults.
            processingText, // This will be the initial message, e.g., "⏳ Running *command*..."
            errorText,      // This will be the base for error messages
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
        // Ensure processingText is always a string before sending
        const initialProcessingText = typeof processingText === 'string' && processingText.length > 0
            ? processingText
            : '⏳ Processing...'; // Absolute fallback if somehow empty from ModuleLoader

        if (isFromBot) {
            // Edit bot's original message
            await bot.sock.sendMessage(jid, {
                text: initialProcessingText,
                edit: originalMsg.key
            });
            procKey = originalMsg.key;
        } else {
            // Send new "Running..." message and track that
            const sent = await bot.sock.sendMessage(jid, {
                text: initialProcessingText
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
            if (typeof result === 'string' && result.length > 0) {
                finalResultText = result;
            } else if (result !== undefined && result !== null) {
                // Try to stringify non-string, non-null/undefined results
                try {
                    finalResultText = JSON.stringify(result, null, 2);
                } catch (jsonError) {
                    // Fallback if JSON.stringify fails on a weird object, append error
                    finalResultText = `Command completed, but result could not be displayed. Error: ${jsonError.message}`;
                }
            } else {
                // If result is undefined, null, or an empty string, just indicate success with the original processing text,
                // perhaps slightly modified, or a generic success message if the command produced nothing.
                // Given the requirement "no extra message," if the actionFn returns nothing useful,
                // we should perhaps just keep the 'processingText' or a minimalist success.
                // For 'ping' specifically, if it returns nothing, maybe "Ping successful."
                // Since `ping` is likely to return *something*, an empty or undefined return is probably an oversight.
                finalResultText = initialProcessingText.replace('⏳ Processing...', '✅ Processed.').replace('⏳ Running', '✅ Executed');
                if (finalResultText === initialProcessingText) { // If replace didn't change it, add a generic success
                    finalResultText = `✅ ${initialProcessingText} - Completed.`;
                }
            }
            
            // Ensure finalResultText is never empty or null before sending
            if (typeof finalResultText !== 'string' || finalResultText.length === 0) {
                finalResultText = '✅ Operation completed successfully.'; // Final safeguard
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

            // Ensure errorText is always a string before concatenating
            const baseErrorText = typeof errorText === 'string' && errorText.length > 0
                ? errorText
                : '❌ Command failed.'; // Absolute fallback

            const finalErrorText = `${baseErrorText}${error.message ? `\n\n🔍 ${error.message}` : ''}`;
            
            // Ensure finalErrorText is never empty or null before sending
            if (typeof finalErrorText !== 'string' || finalErrorText.length === 0) {
                finalErrorText = '❌ An unexpected error occurred.'; // Final safeguard
            }

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
        // It's used for scenarios where you just want to send a pre-determined error message
        await this.smartErrorRespond(bot, originalMsg, {
            processingText: '⏳ Checking command...',
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
