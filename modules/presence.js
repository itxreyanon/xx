const config = require('../config');
const helpers = require('../utils/helpers');

class PresenceModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'presence';
        this.metadata = {
            description: 'Advanced presence management with fake typing, recording, and online status',
            version: '1.0.0',
            author: 'HyperWa Team',
            category: 'utility',
            dependencies: ['@whiskeysockets/baileys']
        };
        
        this.commands = [
            {
                name: 'typing',
                description: 'Send fake typing indicator',
                usage: '.typing [duration] [jid]',
                permissions: 'public',
                ui: {
                    processingText: '⌨️ *Sending Typing Indicator...*',
                    errorText: '❌ *Failed to send typing*'
                },
                execute: this.sendTyping.bind(this)
            },
            {
                name: 'recording',
                description: 'Send fake recording indicator',
                usage: '.recording [duration] [jid]',
                permissions: 'public',
                ui: {
                    processingText: '🎤 *Sending Recording Indicator...*',
                    errorText: '❌ *Failed to send recording*'
                },
                execute: this.sendRecording.bind(this)
            },
            {
                name: 'online',
                description: 'Set online presence',
                usage: '.online [jid]',
                permissions: 'public',
                ui: {
                    processingText: '🟢 *Setting Online Status...*',
                    errorText: '❌ *Failed to set online*'
                },
                execute: this.setOnline.bind(this)
            },
            {
                name: 'offline',
                description: 'Set offline presence',
                usage: '.offline [jid]',
                permissions: 'public',
                ui: {
                    processingText: '⚫ *Setting Offline Status...*',
                    errorText: '❌ *Failed to set offline*'
                },
                execute: this.setOffline.bind(this)
            },
            {
                name: 'unavailable',
                description: 'Set unavailable presence',
                usage: '.unavailable [jid]',
                permissions: 'public',
                ui: {
                    processingText: '🔴 *Setting Unavailable Status...*',
                    errorText: '❌ *Failed to set unavailable*'
                },
                execute: this.setUnavailable.bind(this)
            },
            {
                name: 'faketype',
                description: 'Send message with typing simulation',
                usage: '.faketype <message> [delay]',
                permissions: 'public',
                ui: {
                    processingText: '⌨️ *Simulating Typing...*',
                    errorText: '❌ *Failed to simulate typing*'
                },
                execute: this.fakeTypeMessage.bind(this)
            },
            {
                name: 'presence',
                description: 'Get presence info for a chat',
                usage: '.presence [jid]',
                permissions: 'public',
                ui: {
                    processingText: '👁️ *Getting Presence Info...*',
                    errorText: '❌ *Failed to get presence*'
                },
                execute: this.getPresence.bind(this)
            },
            {
                name: 'subscribe',
                description: 'Subscribe to presence updates',
                usage: '.subscribe [jid]',
                permissions: 'public',
                ui: {
                    processingText: '📡 *Subscribing to Presence...*',
                    errorText: '❌ *Failed to subscribe*'
                },
                execute: this.subscribePresence.bind(this)
            }
        ];

        this.presenceStates = {
            'available': 'Available',
            'unavailable': 'Unavailable', 
            'composing': 'Typing...',
            'recording': 'Recording...',
            'paused': 'Online'
        };

        this.activeTyping = new Map();
        this.activeRecording = new Map();
    }

    async init() {
        // Set up presence monitoring
        this.setupPresenceMonitoring();
    }

    setupPresenceMonitoring() {
        if (this.bot.sock) {
            this.bot.sock.ev.on('presence.update', (update) => {
                this.handlePresenceUpdate(update);
            });
        }
    }

    handlePresenceUpdate(update) {
        const { id, presences } = update;
        
        if (this.bot.store) {
            this.bot.store.updatePresence(id, presences);
        }

        // Log presence changes if enabled
        if (config.get('features.logPresence', false)) {
            Object.entries(presences).forEach(([participant, presence]) => {
                const state = this.presenceStates[presence.lastKnownPresence] || presence.lastKnownPresence;
                console.log(`👁️ Presence Update: ${participant} is ${state} in ${id}`);
            });
        }
    }

    async sendTyping(msg, params, context) {
        const duration = parseInt(params[0]) || 3000; // Default 3 seconds
        const targetJid = params[1] || context.sender;

        if (duration > 30000) {
            return '⚠️ *Duration Limit*\n\nMaximum typing duration is 30 seconds.';
        }

        try {
            // Subscribe to presence first
            await context.bot.sock.presenceSubscribe(targetJid);
            
            // Send composing presence
            await context.bot.sock.sendPresenceUpdate('composing', targetJid);
            
            // Track active typing
            this.activeTyping.set(targetJid, Date.now());

            // Auto-stop after duration
            setTimeout(async () => {
                try {
                    await context.bot.sock.sendPresenceUpdate('paused', targetJid);
                    this.activeTyping.delete(targetJid);
                } catch (error) {
                    console.error('Error stopping typing:', error);
                }
            }, duration);

            return `⌨️ *Typing Indicator Sent*\n\n📱 Target: ${targetJid.split('@')[0]}\n⏱️ Duration: ${duration/1000}s\n🕐 Started: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to send typing indicator: ${error.message}`);
        }
    }

    async sendRecording(msg, params, context) {
        const duration = parseInt(params[0]) || 5000; // Default 5 seconds
        const targetJid = params[1] || context.sender;

        if (duration > 60000) {
            return '⚠️ *Duration Limit*\n\nMaximum recording duration is 60 seconds.';
        }

        try {
            // Subscribe to presence first
            await context.bot.sock.presenceSubscribe(targetJid);
            
            // Send recording presence
            await context.bot.sock.sendPresenceUpdate('recording', targetJid);
            
            // Track active recording
            this.activeRecording.set(targetJid, Date.now());

            // Auto-stop after duration
            setTimeout(async () => {
                try {
                    await context.bot.sock.sendPresenceUpdate('paused', targetJid);
                    this.activeRecording.delete(targetJid);
                } catch (error) {
                    console.error('Error stopping recording:', error);
                }
            }, duration);

            return `🎤 *Recording Indicator Sent*\n\n📱 Target: ${targetJid.split('@')[0]}\n⏱️ Duration: ${duration/1000}s\n🕐 Started: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to send recording indicator: ${error.message}`);
        }
    }

    async setOnline(msg, params, context) {
        const targetJid = params[0] || context.sender;

        try {
            await context.bot.sock.presenceSubscribe(targetJid);
            await context.bot.sock.sendPresenceUpdate('available', targetJid);

            return `🟢 *Online Status Set*\n\n📱 Target: ${targetJid.split('@')[0]}\n📊 Status: Available\n🕐 Time: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to set online status: ${error.message}`);
        }
    }

    async setOffline(msg, params, context) {
        const targetJid = params[0] || context.sender;

        try {
            await context.bot.sock.sendPresenceUpdate('unavailable', targetJid);

            return `⚫ *Offline Status Set*\n\n📱 Target: ${targetJid.split('@')[0]}\n📊 Status: Unavailable\n🕐 Time: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to set offline status: ${error.message}`);
        }
    }

    async setUnavailable(msg, params, context) {
        const targetJid = params[0] || context.sender;

        try {
            await context.bot.sock.sendPresenceUpdate('unavailable', targetJid);

            return `🔴 *Unavailable Status Set*\n\n📱 Target: ${targetJid.split('@')[0]}\n📊 Status: Unavailable\n🕐 Time: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to set unavailable status: ${error.message}`);
        }
    }

    async fakeTypeMessage(msg, params, context) {
        if (params.length === 0) {
            return '❌ *Fake Type Message*\n\nPlease provide a message to send.\n\n💡 Usage: `.faketype <message> [delay]`\n📝 Example: `.faketype Hello World! 2000`';
        }

        const delay = parseInt(params[params.length - 1]) || 2000;
        const message = params.slice(0, -1).join(' ');
        
        // If last param is not a number, include it in message
        if (isNaN(parseInt(params[params.length - 1]))) {
            const fullMessage = params.join(' ');
            return this.simulateTypingAndSend(context, fullMessage, 2000);
        }

        return this.simulateTypingAndSend(context, message, delay);
    }

    async simulateTypingAndSend(context, message, delay) {
        try {
            const targetJid = context.sender;

            // Subscribe to presence
            await context.bot.sock.presenceSubscribe(targetJid);
            
            // Start typing
            await context.bot.sock.sendPresenceUpdate('composing', targetJid);
            
            // Calculate typing duration based on message length
            const typingDuration = Math.min(Math.max(message.length * 50, delay), 10000);
            
            // Wait for typing simulation
            await new Promise(resolve => setTimeout(resolve, typingDuration));
            
            // Stop typing
            await context.bot.sock.sendPresenceUpdate('paused', targetJid);
            
            // Small pause before sending
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Send the message
            await context.bot.sendMessage(targetJid, { text: message });

            return `⌨️ *Message Sent with Typing Simulation*\n\n📝 Message: "${message}"\n⏱️ Typing Duration: ${typingDuration}ms\n🕐 Sent: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to simulate typing and send message: ${error.message}`);
        }
    }

    async getPresence(msg, params, context) {
        const targetJid = params[0] || context.sender;

        try {
            // Subscribe to get latest presence
            await context.bot.sock.presenceSubscribe(targetJid);
            
            // Get presence from store
            const presences = this.bot.store?.presences?.[targetJid] || {};
            
            let presenceText = `👁️ *Presence Information*\n\n📱 Chat: ${targetJid.split('@')[0]}\n\n`;

            if (Object.keys(presences).length === 0) {
                presenceText += '📊 No presence information available\n⚠️ Try subscribing first with `.subscribe`';
            } else {
                Object.entries(presences).forEach(([participant, presence]) => {
                    const state = this.presenceStates[presence.lastKnownPresence] || presence.lastKnownPresence || 'Unknown';
                    const lastSeen = presence.lastSeen ? new Date(presence.lastSeen * 1000).toLocaleString() : 'Unknown';
                    
                    presenceText += `👤 ${participant.split('@')[0]}\n`;
                    presenceText += `   📊 Status: ${state}\n`;
                    presenceText += `   🕐 Last Seen: ${lastSeen}\n\n`;
                });
            }

            // Add active typing/recording info
            if (this.activeTyping.has(targetJid)) {
                presenceText += `⌨️ Currently typing (started ${new Date(this.activeTyping.get(targetJid)).toLocaleTimeString()})\n`;
            }
            
            if (this.activeRecording.has(targetJid)) {
                presenceText += `🎤 Currently recording (started ${new Date(this.activeRecording.get(targetJid)).toLocaleTimeString()})\n`;
            }

            return presenceText.trim();

        } catch (error) {
            throw new Error(`Failed to get presence information: ${error.message}`);
        }
    }

    async subscribePresence(msg, params, context) {
        const targetJid = params[0] || context.sender;

        try {
            await context.bot.sock.presenceSubscribe(targetJid);

            return `📡 *Presence Subscription*\n\n📱 Target: ${targetJid.split('@')[0]}\n✅ Successfully subscribed to presence updates\n🕐 Time: ${new Date().toLocaleTimeString()}\n\n💡 Use \`.presence\` to view current status`;

        } catch (error) {
            throw new Error(`Failed to subscribe to presence: ${error.message}`);
        }
    }

    // Utility method for other modules to use
    async sendMessageWithTyping(jid, content, typingDuration = 2000) {
        try {
            await this.bot.sock.presenceSubscribe(jid);
            await this.bot.sock.sendPresenceUpdate('composing', jid);
            
            await new Promise(resolve => setTimeout(resolve, typingDuration));
            
            await this.bot.sock.sendPresenceUpdate('paused', jid);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            return await this.bot.sendMessage(jid, content);
        } catch (error) {
            console.error('Error sending message with typing:', error);
            // Fallback to normal send
            return await this.bot.sendMessage(jid, content);
        }
    }

    async destroy() {
        this.activeTyping.clear();
        this.activeRecording.clear();
        console.log('🛑 Presence module destroyed');
    }
}

module.exports = PresenceModule;
