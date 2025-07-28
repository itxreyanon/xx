const config = require('../config');
const helpers = require('../utils/helpers');

class ReactionsModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'reactions';
        this.metadata = {
            description: 'Advanced message reaction system with auto-reactions and reaction analytics',
            version: '1.0.0',
            author: 'HyperWa Team',
            category: 'interactive',
            dependencies: ['@whiskeysockets/baileys']
        };
        
        this.commands = [
            {
                name: 'react',
                description: 'React to a message',
                usage: '.react <emoji> (reply to message)',
                permissions: 'public',
                ui: {
                    processingText: '😊 *Adding Reaction...*',
                    errorText: '❌ *Reaction Failed*'
                },
                execute: this.reactToMessage.bind(this)
            },
            {
                name: 'unreact',
                description: 'Remove reaction from message',
                usage: '.unreact (reply to message)',
                permissions: 'public',
                ui: {
                    processingText: '🚫 *Removing Reaction...*',
                    errorText: '❌ *Failed to remove reaction*'
                },
                execute: this.removeReaction.bind(this)
            },
            {
                name: 'autoreact',
                description: 'Toggle auto-reactions for keywords',
                usage: '.autoreact <keyword> <emoji>',
                permissions: 'admin',
                ui: {
                    processingText: '🤖 *Setting Auto-Reaction...*',
                    errorText: '❌ *Auto-reaction setup failed*'
                },
                execute: this.setupAutoReaction.bind(this)
            },
            {
                name: 'reactions',
                description: 'Get reaction statistics',
                usage: '.reactions (reply to message)',
                permissions: 'public',
                ui: {
                    processingText: '📊 *Getting Reaction Stats...*',
                    errorText: '❌ *Failed to get stats*'
                },
                execute: this.getReactionStats.bind(this)
            },
            {
                name: 'topreactions',
                description: 'Get most reacted messages',
                usage: '.topreactions [limit]',
                permissions: 'public',
                ui: {
                    processingText: '🏆 *Getting Top Reactions...*',
                    errorText: '❌ *Failed to get top reactions*'
                },
                execute: this.getTopReactions.bind(this)
            },
            {
                name: 'reactspam',
                description: 'Spam reactions on a message (owner only)',
                usage: '.reactspam <emojis> (reply to message)',
                permissions: 'owner',
                ui: {
                    processingText: '💥 *Spamming Reactions...*',
                    errorText: '❌ *Reaction spam failed*'
                },
                execute: this.spamReactions.bind(this)
            },
            {
                name: 'randomreact',
                description: 'Add random reaction to message',
                usage: '.randomreact (reply to message)',
                permissions: 'public',
                ui: {
                    processingText: '🎲 *Adding Random Reaction...*',
                    errorText: '❌ *Random reaction failed*'
                },
                execute: this.randomReaction.bind(this)
            }
        ];

        this.reactionStats = new Map(); // Track reaction statistics
        this.autoReactions = new Map(); // Auto-reaction rules
        this.reactionHistory = new Map(); // Track reaction history
        
        this.popularEmojis = [
            '😂', '❤️', '😍', '🤣', '😊', '🙏', '💕', '😭', '😘', '👍',
            '😅', '👏', '😁', '🔥', '🥰', '💔', '💖', '💙', '😢', '🤔',
            '😆', '🙄', '💪', '😉', '👌', '🤗', '💜', '😔', '😎', '😇',
            '🌹', '🤦', '🎉', '💚', '✨', '🤷', '😴', '🤤', '😜', '🙈',
            '💯', '🌸', '😋', '💘', '💝', '🖤', '😐', '😑', '🙃', '🤪'
        ];
    }

    async init() {
        // Set up reaction monitoring
        this.setupReactionMonitoring();
        // Set up auto-reaction system
        this.setupAutoReactionSystem();
    }

    setupReactionMonitoring() {
        if (this.bot.sock) {
            this.bot.sock.ev.on('messages.reaction', (reactions) => {
                this.handleReactionUpdates(reactions);
            });
        }
    }

    setupAutoReactionSystem() {
        // Set up message hook for auto-reactions
        if (this.bot.messageHandler) {
            this.bot.messageHandler.registerMessageHook('post_process', async (msg, text) => {
                await this.processAutoReactions(msg, text);
            });
        }
    }

    handleReactionUpdates(reactions) {
        reactions.forEach(reaction => {
            const { key, reaction: reactionData } = reaction;
            const messageId = key.id;
            const chatId = key.remoteJid;
            
            // Update reaction statistics
            if (!this.reactionStats.has(messageId)) {
                this.reactionStats.set(messageId, {
                    messageKey: key,
                    reactions: {},
                    totalReactions: 0,
                    timestamp: Date.now()
                });
            }

            const stats = this.reactionStats.get(messageId);
            const emoji = reactionData.text;
            
            if (emoji) {
                stats.reactions[emoji] = (stats.reactions[emoji] || 0) + 1;
                stats.totalReactions++;
            }

            // Track reaction history
            const historyKey = `${chatId}-${messageId}`;
            if (!this.reactionHistory.has(historyKey)) {
                this.reactionHistory.set(historyKey, []);
            }
            
            this.reactionHistory.get(historyKey).push({
                emoji,
                timestamp: Date.now(),
                user: reaction.key.participant || reaction.key.remoteJid
            });

            console.log(`😊 Reaction Update: ${emoji} on message ${messageId.substring(0, 8)}...`);
        });
    }

    async processAutoReactions(msg, text) {
        if (!text || msg.key.fromMe) return; // Don't auto-react to own messages

        const chatId = msg.key.remoteJid;
        const chatRules = this.autoReactions.get(chatId) || [];

        for (const rule of chatRules) {
            if (text.toLowerCase().includes(rule.keyword.toLowerCase())) {
                try {
                    await this.bot.sock.sendMessage(chatId, {
                        react: { key: msg.key, text: rule.emoji }
                    });
                    
                    console.log(`🤖 Auto-reacted with ${rule.emoji} for keyword "${rule.keyword}"`);
                    break; // Only one auto-reaction per message
                } catch (error) {
                    console.error('Auto-reaction failed:', error);
                }
            }
        }
    }

    async reactToMessage(msg, params, context) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        
        if (!quotedMsg) {
            return '❌ *React to Message*\n\nPlease reply to a message to react to it.\n\n💡 Usage: Reply to a message and type `.react <emoji>`\n📝 Example: `.react ❤️`';
        }

        if (params.length === 0) {
            return '❌ *Missing Emoji*\n\nPlease provide an emoji to react with.\n\n💡 Usage: `.react <emoji>`\n📝 Examples: `.react 😂`, `.react ❤️`, `.react 👍`';
        }

        const emoji = params[0];

        // Validate emoji (basic check)
        if (emoji.length > 4) {
            return '❌ *Invalid Emoji*\n\nPlease provide a single emoji character.\n\n💡 Examples: 😂, ❤️, 👍, 🔥';
        }

        try {
            await context.bot.sock.sendMessage(context.sender, {
                react: { key: quotedMsg.stanzaId ? { ...quotedMsg, id: quotedMsg.stanzaId } : quotedMsg, text: emoji }
            });

            return `😊 *Reaction Added*\n\n${emoji} Reacted to message\n🕐 Time: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to add reaction: ${error.message}`);
        }
    }

    async removeReaction(msg, params, context) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        
        if (!quotedMsg) {
            return '❌ *Remove Reaction*\n\nPlease reply to a message to remove your reaction.\n\n💡 Usage: Reply to a message and type `.unreact`';
        }

        try {
            await context.bot.sock.sendMessage(context.sender, {
                react: { key: quotedMsg.stanzaId ? { ...quotedMsg, id: quotedMsg.stanzaId } : quotedMsg, text: '' }
            });

            return `🚫 *Reaction Removed*\n\nRemoved your reaction from the message\n🕐 Time: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Failed to remove reaction: ${error.message}`);
        }
    }

    async setupAutoReaction(msg, params, context) {
        if (params.length < 2) {
            return '❌ *Auto-Reaction Setup*\n\nPlease provide both keyword and emoji.\n\n💡 Usage: `.autoreact <keyword> <emoji>`\n📝 Example: `.autoreact hello 👋`\n\n🔧 To remove: `.autoreact <keyword> remove`';
        }

        const keyword = params[0].toLowerCase();
        const emoji = params[1];
        const chatId = context.sender;

        if (!this.autoReactions.has(chatId)) {
            this.autoReactions.set(chatId, []);
        }

        const chatRules = this.autoReactions.get(chatId);

        if (emoji === 'remove') {
            // Remove auto-reaction rule
            const index = chatRules.findIndex(rule => rule.keyword === keyword);
            if (index !== -1) {
                chatRules.splice(index, 1);
                return `🗑️ *Auto-Reaction Removed*\n\nKeyword: "${keyword}"\n🕐 Time: ${new Date().toLocaleTimeString()}`;
            } else {
                return `❌ *Rule Not Found*\n\nNo auto-reaction rule found for keyword: "${keyword}"`;
            }
        }

        // Check if rule already exists
        const existingRule = chatRules.find(rule => rule.keyword === keyword);
        if (existingRule) {
            existingRule.emoji = emoji;
            return `✅ *Auto-Reaction Updated*\n\nKeyword: "${keyword}"\nEmoji: ${emoji}\n🕐 Updated: ${new Date().toLocaleTimeString()}`;
        }

        // Add new rule
        chatRules.push({
            keyword,
            emoji,
            created: Date.now(),
            creator: context.participant
        });

        return `🤖 *Auto-Reaction Added*\n\nKeyword: "${keyword}"\nEmoji: ${emoji}\n📊 Total Rules: ${chatRules.length}\n🕐 Created: ${new Date().toLocaleTimeString()}`;
    }

    async getReactionStats(msg, params, context) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        
        if (!quotedMsg) {
            return '❌ *Reaction Statistics*\n\nPlease reply to a message to get its reaction stats.\n\n💡 Usage: Reply to a message and type `.reactions`';
        }

        const messageId = quotedMsg.stanzaId || quotedMsg.id;
        const stats = this.reactionStats.get(messageId);

        if (!stats || stats.totalReactions === 0) {
            return '📊 *Reaction Statistics*\n\nThis message has no reactions yet.\n\n💡 Be the first to react with `.react <emoji>`!';
        }

        let statsText = `📊 *Reaction Statistics*\n\n`;
        statsText += `📈 Total Reactions: ${stats.totalReactions}\n\n`;
        statsText += `🎭 **Reaction Breakdown:**\n`;

        // Sort reactions by count
        const sortedReactions = Object.entries(stats.reactions)
            .sort(([,a], [,b]) => b - a);

        sortedReactions.forEach(([emoji, count], index) => {
            const percentage = Math.round((count / stats.totalReactions) * 100);
            const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
            statsText += `${index + 1}. ${emoji} ${bar} ${percentage}% (${count})\n`;
        });

        statsText += `\n🕐 First Reaction: ${new Date(stats.timestamp).toLocaleString()}`;

        return statsText;
    }

    async getTopReactions(msg, params, context) {
        const limit = parseInt(params[0]) || 10;
        
        if (limit > 50) {
            return '❌ *Limit Too High*\n\nMaximum limit is 50 messages.\nRequested: ' + limit;
        }

        // Get top reacted messages
        const topMessages = Array.from(this.reactionStats.values())
            .sort((a, b) => b.totalReactions - a.totalReactions)
            .slice(0, limit);

        if (topMessages.length === 0) {
            return '📊 *Top Reactions*\n\nNo reaction data available yet.\n\n💡 Start reacting to messages to see statistics!';
        }

        let topText = `🏆 *Top ${topMessages.length} Most Reacted Messages*\n\n`;

        topMessages.forEach((stats, index) => {
            const topEmoji = Object.entries(stats.reactions)
                .sort(([,a], [,b]) => b - a)[0];
            
            const messagePreview = stats.messageKey.id.substring(0, 8) + '...';
            const age = this.formatDuration(Date.now() - stats.timestamp);
            
            topText += `${index + 1}. 📨 ${messagePreview}\n`;
            topText += `   📊 ${stats.totalReactions} reactions • Top: ${topEmoji[0]} (${topEmoji[1]})\n`;
            topText += `   🕐 ${age} ago\n\n`;
        });

        return topText;
    }

    async spamReactions(msg, params, context) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        
        if (!quotedMsg) {
            return '❌ *Reaction Spam*\n\nPlease reply to a message to spam reactions.\n\n💡 Usage: Reply to a message and type `.reactspam <emojis>`\n📝 Example: `.reactspam 😂❤️🔥👍`';
        }

        if (params.length === 0) {
            return '❌ *Missing Emojis*\n\nPlease provide emojis to spam.\n\n💡 Usage: `.reactspam <emojis>`\n📝 Example: `.reactspam 😂❤️🔥👍🎉`';
        }

        const emojis = params.join('').match(/[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]/gu) || [];

        if (emojis.length === 0) {
            return '❌ *No Valid Emojis*\n\nNo valid emojis found in your input.\n\n💡 Try: `.reactspam 😂❤️🔥`';
        }

        if (emojis.length > 10) {
            return '❌ *Too Many Emojis*\n\nMaximum 10 emojis allowed for spam.\nFound: ' + emojis.length + ' emojis';
        }

        try {
            let spammedCount = 0;
            
            for (const emoji of emojis) {
                await context.bot.sock.sendMessage(context.sender, {
                    react: { key: quotedMsg.stanzaId ? { ...quotedMsg, id: quotedMsg.stanzaId } : quotedMsg, text: emoji }
                });
                
                spammedCount++;
                
                // Small delay between reactions
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            return `💥 *Reaction Spam Complete*\n\n🎭 Emojis Used: ${emojis.join('')}\n📊 Total Reactions: ${spammedCount}\n🕐 Completed: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Reaction spam failed: ${error.message}`);
        }
    }

    async randomReaction(msg, params, context) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        
        if (!quotedMsg) {
            return '❌ *Random Reaction*\n\nPlease reply to a message to add a random reaction.\n\n💡 Usage: Reply to a message and type `.randomreact`';
        }

        try {
            const randomEmoji = this.popularEmojis[Math.floor(Math.random() * this.popularEmojis.length)];
            
            await context.bot.sock.sendMessage(context.sender, {
                react: { key: quotedMsg.stanzaId ? { ...quotedMsg, id: quotedMsg.stanzaId } : quotedMsg, text: randomEmoji }
            });

            return `🎲 *Random Reaction Added*\n\n${randomEmoji} Lucky emoji selected!\n🎯 From ${this.popularEmojis.length} popular emojis\n🕐 Time: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            throw new Error(`Random reaction failed: ${error.message}`);
        }
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d`;
        if (hours > 0) return `${hours}h`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    }

    async destroy() {
        this.reactionStats.clear();
        this.autoReactions.clear();
        this.reactionHistory.clear();
        console.log('🛑 Reactions module destroyed');
    }
}

module.exports = ReactionsModule;
