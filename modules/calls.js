const config = require('../config');
const helpers = require('../utils/helpers');

class CallsModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'calls';
        this.metadata = {
            description: 'Advanced call management with auto-reject, call logs, and fake calls',
            version: '1.0.0',
            author: 'HyperWa Team',
            category: 'communication',
            dependencies: ['@whiskeysockets/baileys']
        };
        
        this.commands = [
            {
                name: 'calllog',
                description: 'View recent call history',
                usage: '.calllog [limit]',
                permissions: 'public',
                ui: {
                    processingText: '📞 *Getting Call Log...*',
                    errorText: '❌ *Failed to get call log*'
                },
                execute: this.getCallLog.bind(this)
            },
            {
                name: 'autoreject',
                description: 'Toggle auto-reject calls',
                usage: '.autoreject [on/off]',
                permissions: 'owner',
                ui: {
                    processingText: '🚫 *Configuring Auto-Reject...*',
                    errorText: '❌ *Auto-reject config failed*'
                },
                execute: this.toggleAutoReject.bind(this)
            },
            {
                name: 'blockcaller',
                description: 'Block calls from specific number',
                usage: '.blockcaller <number>',
                permissions: 'owner',
                ui: {
                    processingText: '🚫 *Blocking Caller...*',
                    errorText: '❌ *Failed to block caller*'
                },
                execute: this.blockCaller.bind(this)
            },
            {
                name: 'unblockcaller',
                description: 'Unblock calls from specific number',
                usage: '.unblockcaller <number>',
                permissions: 'owner',
                ui: {
                    processingText: '✅ *Unblocking Caller...*',
                    errorText: '❌ *Failed to unblock caller*'
                },
                execute: this.unblockCaller.bind(this)
            },
            {
                name: 'callstats',
                description: 'Get call statistics',
                usage: '.callstats',
                permissions: 'public',
                ui: {
                    processingText: '📊 *Analyzing Call Data...*',
                    errorText: '❌ *Failed to get call stats*'
                },
                execute: this.getCallStats.bind(this)
            },
            {
                name: 'fakecall',
                description: 'Simulate incoming call notification',
                usage: '.fakecall <number> [type]',
                permissions: 'owner',
                ui: {
                    processingText: '📱 *Simulating Call...*',
                    errorText: '❌ *Fake call failed*'
                },
                execute: this.simulateFakeCall.bind(this)
            },
            {
                name: 'callwhitelist',
                description: 'Manage call whitelist',
                usage: '.callwhitelist [add/remove] [number]',
                permissions: 'owner',
                ui: {
                    processingText: '📋 *Managing Whitelist...*',
                    errorText: '❌ *Whitelist management failed*'
                },
                execute: this.manageWhitelist.bind(this)
            }
        ];

        this.callHistory = [];
        this.blockedCallers = new Set();
        this.whitelistedCallers = new Set();
        this.callStats = {
            totalCalls: 0,
            acceptedCalls: 0,
            rejectedCalls: 0,
            missedCalls: 0,
            videoCalls: 0,
            voiceCalls: 0
        };
        
        this.autoRejectEnabled = false;
        this.callTypes = {
            'offer': 'Incoming',
            'accept': 'Accepted',
            'reject': 'Rejected',
            'timeout': 'Missed'
        };
    }

    async init() {
        // Set up call monitoring
        this.setupCallMonitoring();
        // Load settings
        this.loadSettings();
        console.log('✅ Calls module initialized');
    }

    setupCallMonitoring() {
        if (this.bot.sock) {
            this.bot.sock.ev.on('call', (calls) => {
                this.handleIncomingCalls(calls);
            });
        }
    }

    loadSettings() {
        // Load settings from config
        this.autoRejectEnabled = config.get('calls.autoReject', false);
        const blocked = config.get('calls.blockedCallers', []);
        const whitelisted = config.get('calls.whitelistedCallers', []);
        
        this.blockedCallers = new Set(blocked);
        this.whitelistedCallers = new Set(whitelisted);
    }

    saveSettings() {
        config.set('calls.autoReject', this.autoRejectEnabled);
        config.set('calls.blockedCallers', Array.from(this.blockedCallers));
        config.set('calls.whitelistedCallers', Array.from(this.whitelistedCallers));
    }

    async handleIncomingCalls(calls) {
        for (const call of calls) {
            await this.processCall(call);
        }
    }

    async processCall(call) {
        const { from, id, status, isVideo, isGroup } = call;
        const callerId = from.split('@')[0];
        
        // Log the call
        const callRecord = {
            id,
            from,
            callerId,
            status,
            isVideo: isVideo || false,
            isGroup: isGroup || false,
            timestamp: Date.now(),
            action: 'none'
        };

        this.callHistory.unshift(callRecord);
        
        // Keep only last 100 calls
        if (this.callHistory.length > 100) {
            this.callHistory = this.callHistory.slice(0, 100);
        }

        // Update statistics
        this.updateCallStats(callRecord);

        // Handle call based on status
        if (status === 'offer') {
            await this.handleIncomingCall(call, callRecord);
        }

        // Store call in enhanced store if available
        if (this.bot.store) {
            this.bot.store.callOffer[from] = call;
        }

        console.log(`📞 Call ${status}: ${callerId} (${isVideo ? 'Video' : 'Voice'})`);
    }

    async handleIncomingCall(call, callRecord) {
        const { from, id, isVideo } = call;
        const callerId = from.split('@')[0];

        // Check if caller is blocked
        if (this.blockedCallers.has(callerId)) {
            await this.rejectCall(call, 'blocked');
            callRecord.action = 'rejected_blocked';
            return;
        }

        // Check whitelist (if auto-reject is enabled)
        if (this.autoRejectEnabled) {
            if (!this.whitelistedCallers.has(callerId)) {
                await this.rejectCall(call, 'auto_reject');
                callRecord.action = 'rejected_auto';
                return;
            }
        }

        // Notify about incoming call
        await this.notifyIncomingCall(call);
        callRecord.action = 'notified';
    }

    async rejectCall(call, reason) {
        try {
            await this.bot.sock.rejectCall(call.id, call.from);
            console.log(`🚫 Call rejected: ${call.from.split('@')[0]} (${reason})`);
        } catch (error) {
            console.error('Failed to reject call:', error);
        }
    }

    async notifyIncomingCall(call) {
        const { from, isVideo, isGroup } = call;
        const callerId = from.split('@')[0];
        const callType = isVideo ? '📹 Video Call' : '📞 Voice Call';
        const chatType = isGroup ? 'Group' : 'Private';

        const notificationText = `📱 *Incoming Call*\n\n` +
                               `${callType}\n` +
                               `👤 From: ${callerId}\n` +
                               `📊 Type: ${chatType}\n` +
                               `🕐 Time: ${new Date().toLocaleTimeString()}\n\n` +
                               `⚠️ Call will be handled automatically based on your settings.`;

        try {
            const owner = config.get('bot.owner');
            if (owner) {
                await this.bot.sendMessage(owner, { text: notificationText });
            }
        } catch (error) {
            console.error('Failed to send call notification:', error);
        }
    }

    updateCallStats(callRecord) {
        this.callStats.totalCalls++;
        
        if (callRecord.isVideo) {
            this.callStats.videoCalls++;
        } else {
            this.callStats.voiceCalls++;
        }

        switch (callRecord.status) {
            case 'accept':
                this.callStats.acceptedCalls++;
                break;
            case 'reject':
                this.callStats.rejectedCalls++;
                break;
            case 'timeout':
                this.callStats.missedCalls++;
                break;
        }
    }

    async getCallLog(msg, params, context) {
        const limit = Math.min(parseInt(params[0]) || 20, 50);
        
        if (this.callHistory.length === 0) {
            return '📞 *Call Log*\n\nNo call history available.\n\n💡 Call logs will appear here when you receive calls.';
        }

        const recentCalls = this.callHistory.slice(0, limit);
        
        let logText = `📞 *Call Log (${recentCalls.length}/${this.callHistory.length})*\n\n`;

        recentCalls.forEach((call, index) => {
            const callType = call.isVideo ? '📹' : '📞';
            const statusIcon = this.getStatusIcon(call.status, call.action);
            const duration = this.formatDuration(Date.now() - call.timestamp);
            
            logText += `${index + 1}. ${callType} ${statusIcon} ${call.callerId}\n`;
            logText += `   ${this.getCallDescription(call)} • ${duration} ago\n\n`;
        });

        return logText.trim();
    }

    getStatusIcon(status, action) {
        if (action === 'rejected_blocked') return '🚫';
        if (action === 'rejected_auto') return '🤖';
        
        switch (status) {
            case 'offer': return '📥';
            case 'accept': return '✅';
            case 'reject': return '❌';
            case 'timeout': return '⏰';
            default: return '❓';
        }
    }

    getCallDescription(call) {
        if (call.action === 'rejected_blocked') return 'Blocked caller';
        if (call.action === 'rejected_auto') return 'Auto-rejected';
        
        switch (call.status) {
            case 'offer': return 'Incoming call';
            case 'accept': return 'Call accepted';
            case 'reject': return 'Call rejected';
            case 'timeout': return 'Missed call';
            default: return 'Unknown status';
        }
    }

    async toggleAutoReject(msg, params, context) {
        if (params.length === 0) {
            return `🚫 *Auto-Reject Status*\n\nCurrent Status: ${this.autoRejectEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n💡 Usage: \`.autoreject on\` or \`.autoreject off\`\n\n📋 Whitelisted: ${this.whitelistedCallers.size} numbers\n🚫 Blocked: ${this.blockedCallers.size} numbers`;
        }

        const action = params[0].toLowerCase();
        
        if (action === 'on' || action === 'enable') {
            this.autoRejectEnabled = true;
            this.saveSettings();
            return `✅ *Auto-Reject Enabled*\n\nAll calls will be automatically rejected except:\n• Whitelisted numbers (${this.whitelistedCallers.size})\n• Owner calls\n\n💡 Use \`.callwhitelist add <number>\` to whitelist callers`;
        } else if (action === 'off' || action === 'disable') {
            this.autoRejectEnabled = false;
            this.saveSettings();
            return `❌ *Auto-Reject Disabled*\n\nCalls will only be rejected if:\n• Caller is blocked (${this.blockedCallers.size} numbers)\n• Manual rejection`;
        } else {
            return `❌ *Invalid Option*\n\nUse: \`.autoreject on\` or \`.autoreject off\``;
        }
    }

    async blockCaller(msg, params, context) {
        if (params.length === 0) {
            return `🚫 *Block Caller*\n\nPlease provide a phone number to block.\n\n💡 Usage: \`.blockcaller <number>\`\n📝 Example: \`.blockcaller 1234567890\`\n\n📋 Currently blocked: ${this.blockedCallers.size} numbers`;
        }

        const number = params[0].replace(/[^\d]/g, '');
        
        if (number.length < 10) {
            return '❌ *Invalid Number*\n\nPlease provide a valid phone number (minimum 10 digits).';
        }

        if (this.blockedCallers.has(number)) {
            return `❌ *Already Blocked*\n\nNumber ${number} is already in the blocked list.`;
        }

        this.blockedCallers.add(number);
        this.saveSettings();

        return `🚫 *Caller Blocked*\n\n📱 Number: ${number}\n📊 Total Blocked: ${this.blockedCallers.size}\n🕐 Blocked: ${new Date().toLocaleTimeString()}\n\n✅ All future calls from this number will be automatically rejected.`;
    }

    async unblockCaller(msg, params, context) {
        if (params.length === 0) {
            const blockedList = Array.from(this.blockedCallers).slice(0, 10);
            let listText = `🚫 *Blocked Callers*\n\n📊 Total: ${this.blockedCallers.size}\n\n`;
            
            if (blockedList.length > 0) {
                listText += `📋 Recent blocked numbers:\n`;
                blockedList.forEach((number, index) => {
                    listText += `${index + 1}. ${number}\n`;
                });
                listText += `\n💡 Usage: \`.unblockcaller <number>\``;
            } else {
                listText += `📋 No blocked callers`;
            }
            
            return listText;
        }

        const number = params[0].replace(/[^\d]/g, '');
        
        if (!this.blockedCallers.has(number)) {
            return `❌ *Not Blocked*\n\nNumber ${number} is not in the blocked list.`;
        }

        this.blockedCallers.delete(number);
        this.saveSettings();

        return `✅ *Caller Unblocked*\n\n📱 Number: ${number}\n📊 Total Blocked: ${this.blockedCallers.size}\n🕐 Unblocked: ${new Date().toLocaleTimeString()}\n\n📞 This number can now call you again.`;
    }

    async getCallStats(msg, params, context) {
        const stats = this.callStats;
        const acceptRate = stats.totalCalls > 0 ? Math.round((stats.acceptedCalls / stats.totalCalls) * 100) : 0;
        const rejectRate = stats.totalCalls > 0 ? Math.round((stats.rejectedCalls / stats.totalCalls) * 100) : 0;

        let statsText = `📊 *Call Statistics*\n\n`;
        statsText += `📞 **Total Calls:** ${stats.totalCalls}\n\n`;
        
        statsText += `📈 **Call Status:**\n`;
        statsText += `• ✅ Accepted: ${stats.acceptedCalls} (${acceptRate}%)\n`;
        statsText += `• ❌ Rejected: ${stats.rejectedCalls} (${rejectRate}%)\n`;
        statsText += `• ⏰ Missed: ${stats.missedCalls}\n\n`;
        
        statsText += `📱 **Call Types:**\n`;
        statsText += `• 📞 Voice: ${stats.voiceCalls}\n`;
        statsText += `• 📹 Video: ${stats.videoCalls}\n\n`;
        
        statsText += `⚙️ **Settings:**\n`;
        statsText += `• 🚫 Auto-Reject: ${this.autoRejectEnabled ? 'Enabled' : 'Disabled'}\n`;
        statsText += `• 📋 Whitelisted: ${this.whitelistedCallers.size}\n`;
        statsText += `• 🚫 Blocked: ${this.blockedCallers.size}\n\n`;
        
        statsText += `📅 **Recent Activity:**\n`;
        if (this.callHistory.length > 0) {
            const lastCall = this.callHistory[0];
            const timeSince = this.formatDuration(Date.now() - lastCall.timestamp);
            statsText += `• Last Call: ${timeSince} ago from ${lastCall.callerId}`;
        } else {
            statsText += `• No recent calls`;
        }

        return statsText;
    }

    async simulateFakeCall(msg, params, context) {
        if (params.length === 0) {
            return '📱 *Fake Call Simulator*\n\nPlease provide a phone number.\n\n💡 Usage: `.fakecall <number> [voice/video]`\n📝 Example: `.fakecall 1234567890 video`';
        }

        const number = params[0].replace(/[^\d]/g, '');
        const callType = params[1]?.toLowerCase() === 'video' ? 'video' : 'voice';
        
        if (number.length < 10) {
            return '❌ *Invalid Number*\n\nPlease provide a valid phone number (minimum 10 digits).';
        }

        // Create fake call object
        const fakeCall = {
            id: 'fake_' + Date.now(),
            from: number + '@s.whatsapp.net',
            status: 'offer',
            isVideo: callType === 'video',
            isGroup: false,
            timestamp: Date.now()
        };

        // Process the fake call
        await this.processCall(fakeCall);

        const callTypeIcon = callType === 'video' ? '📹' : '📞';
        
        return `📱 *Fake Call Simulated*\n\n${callTypeIcon} **Call Type:** ${callType.charAt(0).toUpperCase() + callType.slice(1)}\n📱 **From:** ${number}\n🕐 **Time:** ${new Date().toLocaleTimeString()}\n\n✅ Call has been logged and processed according to your settings.`;
    }

    async manageWhitelist(msg, params, context) {
        if (params.length === 0) {
            const whitelistedList = Array.from(this.whitelistedCallers).slice(0, 10);
            let listText = `📋 *Call Whitelist*\n\n📊 Total: ${this.whitelistedCallers.size}\n\n`;
            
            if (whitelistedList.length > 0) {
                listText += `✅ Whitelisted numbers:\n`;
                whitelistedList.forEach((number, index) => {
                    listText += `${index + 1}. ${number}\n`;
                });
                if (this.whitelistedCallers.size > 10) {
                    listText += `... and ${this.whitelistedCallers.size - 10} more\n`;
                }
                listText += `\n💡 Usage: \`.callwhitelist add/remove <number>\``;
            } else {
                listText += `📋 No whitelisted callers\n\n💡 Usage: \`.callwhitelist add <number>\``;
            }
            
            return listText;
        }

        const action = params[0]?.toLowerCase();
        const number = params[1]?.replace(/[^\d]/g, '');

        if (!['add', 'remove'].includes(action)) {
            return '❌ *Invalid Action*\n\nUse: `.callwhitelist add <number>` or `.callwhitelist remove <number>`';
        }

        if (!number || number.length < 10) {
            return '❌ *Invalid Number*\n\nPlease provide a valid phone number (minimum 10 digits).';
        }

        if (action === 'add') {
            if (this.whitelistedCallers.has(number)) {
                return `❌ *Already Whitelisted*\n\nNumber ${number} is already in the whitelist.`;
            }

            this.whitelistedCallers.add(number);
            this.saveSettings();

            return `✅ *Number Whitelisted*\n\n📱 Number: ${number}\n📊 Total Whitelisted: ${this.whitelistedCallers.size}\n🕐 Added: ${new Date().toLocaleTimeString()}\n\n📞 This number can now call you even with auto-reject enabled.`;

        } else if (action === 'remove') {
            if (!this.whitelistedCallers.has(number)) {
                return `❌ *Not Whitelisted*\n\nNumber ${number} is not in the whitelist.`;
            }

            this.whitelistedCallers.delete(number);
            this.saveSettings();

            return `🗑️ *Number Removed from Whitelist*\n\n📱 Number: ${number}\n📊 Total Whitelisted: ${this.whitelistedCallers.size}\n🕐 Removed: ${new Date().toLocaleTimeString()}\n\n⚠️ This number will be subject to auto-reject if enabled.`;
        }
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    }

    async destroy() {
        this.saveSettings();
        this.callHistory = [];
        this.blockedCallers.clear();
        this.whitelistedCallers.clear();
        console.log('🛑 Calls module destroyed');
    }
}

module.exports = CallsModule;
