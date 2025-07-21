const config = require('../config');

class Helpers {
   static async smartErrorRespond(bot, originalMsg, options = {}) {
  const {
    actionFn = () => { throw new Error('No action provided'); },
    errorText     = '❌ Something went wrong.',
    processingText,                // ← always comes from your loader now
    autoReact     = true,
    // note: we’re ignoring selfEdit/editMessages flags here
  } = options;

  if (!bot?.sock?.sendMessage || !originalMsg?.key?.remoteJid) return;

  const jid  = originalMsg.key.remoteJid;
  const isMe = originalMsg.key.fromMe === true;

  // 1) spinner react
  if (autoReact) {
    await bot.sock.sendMessage(jid, {
      react: { key: originalMsg.key, text: '⏳' }
    });
  }

  // 2) show processingText (no fallback needed)
  let procKey = originalMsg.key;
  if (isMe) {
    // edit the bot’s own message
    await bot.sock.sendMessage(jid, {
      text: processingText,
      edit: originalMsg.key
    });
  } else {
    // send a new message for users
    const m = await bot.sock.sendMessage(jid, { text: processingText });
    procKey = m.key;
  }

  try {
    // 3) run the command
    const res = await actionFn();

    // 4) clear spinner
    if (autoReact) {
      await this.sleep(500);
      await bot.sock.sendMessage(jid, {
        react: { key: originalMsg.key, text: '' }
      });
    }

    // 5) edit with the result
    await bot.sock.sendMessage(jid, {
      text: typeof res === 'string' ? res : JSON.stringify(res, null, 2),
      edit: procKey
    });

    return res;

  } catch (err) {
    // on error: edit in your errorText
    if (autoReact) {
      await bot.sock.sendMessage(jid, {
        react: { key: originalMsg.key, text: '❌' }
      });
    }
    await bot.sock.sendMessage(jid, {
      text: `${errorText}${err.message ? `\n\n🔍 ${err.message}` : ''}`,
      edit: procKey
    });
err._handledBySmartError = true;
throw err;


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
