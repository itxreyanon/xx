const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'rvo',
  metadata: {
    description: 'Reveal view-once media (image/video/audio) by replying to it.',
    version: '1.0.1',
    author: 'HyperWaBot',
    category: 'media',
  },
  commands: [
    {
      name: 'rvo',
      description: 'Reveal view-once media',
      usage: '🪄 | reveal | 🔓',
      permissions: 'public',
      aliases: ['🪄', 'reveal', '🔓'],
      prefixes: [],
      silent: true,

      async execute(msg, args, { bot }) {
        const sock = bot.sock;
        const participant = msg.key.participant || msg.key.remoteJid;

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = contextInfo?.quotedMessage;

        if (!quoted) {
          return sock.sendMessage(participant, {
            text: '⚠️ Please *reply* to a view-once image, video, or audio message to use this command.'
          });
        }

        try {
          const rawType = Object.keys(quoted)[0];
          const content = quoted[rawType];

          const typeMap = {
            imageMessage: 'image',
            videoMessage: 'video',
            audioMessage: 'audio'
          };

          const mappedType = typeMap[rawType];
          if (!mappedType) {
            return sock.sendMessage(participant, {
              text: '❌ Unsupported media type. Only image, video, or audio are supported.'
            });
          }

          const buffer = await downloadMediaMessage(
            { key: contextInfo, message: quoted },
            'buffer',
            {}
          );

          if (mappedType === 'audio') {
            const inputPath = path.join(tmpdir(), `input-${Date.now()}.mp3`);
            const outputPath = path.join(tmpdir(), `output-${Date.now()}.mp3`);
            fs.writeFileSync(inputPath, buffer);

            exec(`ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 128k "${outputPath}"`, async (err) => {
              fs.unlinkSync(inputPath);
              if (err) {
                return sock.sendMessage(participant, {
                  text: '❌ Audio conversion failed.'
                });
              }

              const outBuffer = fs.readFileSync(outputPath);
              fs.unlinkSync(outputPath);

              await sock.sendMessage(participant, {
                audio: outBuffer,
                mimetype: 'audio/mp4'
              });
            });
          } else {
            await sock.sendMessage(participant, {
              [mappedType]: buffer,
              caption: content?.caption || ''
            });
          }

        } catch (error) {
          console.error('RVO Error:', error);
          await sock.sendMessage(participant, {
            text: `❌ Failed to reveal media.\n\nError: ${error.message}`
          });
        }
      }
    }
  ]
};
