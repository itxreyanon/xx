const config = require('../config');

class Helpers {
    static async smartErrorRespond(bot, originalMsg, options = {}) {
  const {
    actionFn = () => { throw new Error('No action provided'); },
    errorText = '❌ Something went wrong.',
    autoReact = true,
    processingText,
  } = options;

  if (!bot?.sock?.sendMessage || !originalMsg?.key?.remoteJid) return;

  const jid = originalMsg.key.remoteJid;
  const isMe = originalMsg.key.fromMe === true;
  const cmdName = (originalMsg.message?.conversation || originalMsg.message?.extendedTextMessage?.text || '.')
                   .trim().split(/\s+/)[0];

  // 1) React if desired
  if (autoReact) {
    await bot.sock.sendMessage(jid, { react: { key: originalMsg.key, text: '⏳' } });
  }

  // 2) Show “processing…”
  const procText = processingText
    || (isMe ? '⏳ Processing...' : `⏳ Running *${cmdName}*...`);

  let procKey = originalMsg.key;
  if (isMe) {
    // edit original
    await bot.sock.sendMessage(jid, { text: procText, edit: originalMsg.key });
  } else {
    // send new
    const m = await bot.sock.sendMessage(jid, { text: procText });
    procKey = m.key;
  }

  try {
    // 3) Run the command
    const res = await actionFn();

    // 4) Clear react
    if (autoReact) {
      await bot.sock.sendMessage(jid, { react: { key: originalMsg.key, text: '' } });
    }

    // 5) Edit with result
    await bot.sock.sendMessage(jid, {
      text: typeof res === 'string' ? res : JSON.stringify(res, null, 2),
      edit: procKey
    });

    return res;

  } catch (err) {
    // on error
    if (autoReact) {
      await bot.sock.sendMessage(jid, { react: { key: originalMsg.key, text: '❌' } });
    }
    await bot.sock.sendMessage(jid, {
      text: `${errorText}${err.message ? `\n\n🔍 ${err.message}` : ''}`,
      edit: procKey
    });
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
