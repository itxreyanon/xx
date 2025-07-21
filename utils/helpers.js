const config = require('../config');

class Helpers {
    static async smartErrorRespond(bot, originalMsg, options = {}) {
        const {
            actionFn = () => { throw new Error('No action provided'); },
            processingText, // Passed by ModuleLoader, or can be undefined/null/empty for manual calls
            errorText,      // Passed by ModuleLoader
            autoReact = true,
        } = options;

        if (!bot?.sock?.sendMessage || !originalMsg?.key?.remoteJid) return;

        const jid = originalMsg.key.remoteJid;
        const isFromBot = originalMsg.key.fromMe === true;
        let procKey = null; // Will store the key of the message managed by smartErrorRespond

        // Determine if smartErrorRespond should send/manage a message for this operation
        const shouldManageMessage = typeof processingText === 'string' && processingText.length > 0;

        // Store the actual processing text used, for later subtle edits
        const actualProcessingText = shouldManageMessage ? processingText : '';

        // 1. React to original message
        if (autoReact) {
            await bot.sock.sendMessage(jid, {
                react: { key: originalMsg.key, text: '⏳' }
            });
        }

        // 2. Conditionally send or edit the initial processing message
        if (shouldManageMessage) {
            if (isFromBot) {
                await bot.sock.sendMessage(jid, {
                    text: actualProcessingText,
                    edit: originalMsg.key
                });
                procKey = originalMsg.key;
            } else {
                const sent = await bot.sock.sendMessage(jid, {
                    text: actualProcessingText
                });
                procKey = sent.key;
            }
        }
        // If !shouldManageMessage, procKey remains null, and smartErrorRespond will not send/edit messages.

        try {
            // 3. Execute the action function (your command's `execute` method)
            const result = await actionFn();

            // 4. Clean up initial reaction
            if (autoReact) {
                await this.sleep(200);
                await bot.sock.sendMessage(jid, {
                    react: { key: originalMsg.key, text: '' }
                });
            }

            // 5. Conditionally edit the message with the final result (ONLY if smartErrorRespond managed a message)
            if (procKey) {
                let finalResultText;
                if (typeof result === 'string' && result.length > 0) {
                    finalResultText = result; // Use the direct string result
                } else if (result !== undefined && result !== null) {
                    try {
                        finalResultText = JSON.stringify(result, null, 2);
                        // If JSON.stringify gives empty structures, subtly indicate success
                        if (finalResultText === '{}' || finalResultText === '[]' || finalResultText.trim() === '') {
                            finalResultText = actualProcessingText.replace('⏳', '✅'); // Change emoji, keep original text
                        }
                    } catch (jsonError) {
                        finalResultText = `Command completed, but result could not be formatted.`;
                    }
                } else {
                    // If actionFn returns undefined/null/empty, subtly indicate success
                    finalResultText = actualProcessingText.replace('⏳', '✅'); // Change emoji, keep original text
                }

                // Final safeguard: ensure final text is a non-empty string
                if (typeof finalResultText !== 'string' || finalResultText.length === 0) {
                    finalResultText = '✅ Task completed.'; // Absolute fallback
                }

                await bot.sock.sendMessage(jid, {
                    text: finalResultText,
                    edit: procKey
                });
            }

            return result;

        } catch (error) {
            // Error path
            if (autoReact) {
                await bot.sock.sendMessage(jid, {
                    react: { key: originalMsg.key, text: '❌' }
                });
            }

            // 6. Conditionally edit the message with the error (ONLY if smartErrorRespond managed a message)
            if (procKey) {
                const baseErrorText = typeof errorText === 'string' && errorText.length > 0
                    ? errorText
                    : `❌ ${actualProcessingText.replace('⏳', '')} failed.`; // Use base error or modify processing text

                const finalErrorText = `${baseErrorText}${error.message ? `\n\n🔍 ${error.message}` : ''}`;

                // Final safeguard: ensure final text is a non-empty string
                if (typeof finalErrorText !== 'string' || finalErrorText.length === 0) {
                    finalErrorText = '❌ An unexpected error occurred.';
                }

                await bot.sock.sendMessage(jid, {
                    text: finalErrorText,
                    edit: procKey
                });
            }

            error._handledBySmartError = true;
            throw error; // Re-throw error so calling code can catch if needed
        }
    }

    // This remains unchanged, it correctly uses smartErrorRespond with explicit text
    static async sendCommandResponse(bot, originalMsg, responseText) {
        await this.smartErrorRespond(bot, originalMsg, {
            processingText: '⏳ Checking command...',
            errorText: responseText,
            actionFn: async () => {
                throw new Error(responseText);
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
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms))); // Added missing ')'
    }
}

module.exports = Helpers;
