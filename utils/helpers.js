const config = require('../config');

class Helpers {
    static async smartErrorRespond(bot, originalMsg, options = {}) {
    const {
      actionFn = () => { throw new Error('No action provided'); },
      processingText = '⏳ Processing...',
      errorText = '❌ Something went wrong.',
      autoReact = true,
    } = options;

    if (!bot?.sock?.sendMessage || !originalMsg?.key?.remoteJid) return;

    const jid = originalMsg.key.remoteJid;
    const isMe = originalMsg.key.fromMe === true;

    // 1. Spinner reaction
    if (autoReact) {
      await bot.sock.sendMessage(jid, {
        react: { key: originalMsg.key, text: '⏳' }
      });
    }

    // 2. Show processing message (edit if self, send if user)
    let procKey = originalMsg.key;

    if (isMe) {
      // Edit original bot message
      await bot.sock.sendMessage(jid, {
        text: processingText,
        edit: originalMsg.key
      });
    } else {
      // Send separate "Running..." message for user command
      const m = await bot.sock.sendMessage(jid, { text: processingText });
      procKey = m.key;
    }

    try {
      // 3. Run the command
      const result = await actionFn();

      // 4. Clear reaction (optional delay for UX)
      if (autoReact) {
        await this.sleep(300);
        await bot.sock.sendMessage(jid, {
          react: { key: originalMsg.key, text: '' }
        });
      }

      // 5. Edit the processing message with the result
      await bot.sock.sendMessage(jid, {
        text: typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2),
        edit: procKey
      });

      return result;

    } catch (error) {
      // 6. Show error result and react with ❌
      if (autoReact) {
        await bot.sock.sendMessage(jid, {
          react: { key: originalMsg.key, text: '❌' }
        });
      }

      await bot.sock.sendMessage(jid, {
        text: `${errorText}${error.message ? `\n\n🔍 ${error.message}` : ''}`,
        edit: procKey
      });

      error._handledBySmartError = true;
      throw error;
    }
  }




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
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    }
}

module.exports = Helpers;
