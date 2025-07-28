const logger = require('./logger');
const { delay, proto, getAggregateVotesInPollMessage } = require('@whiskeysockets/baileys');

class AdvancedFeatures {
    constructor(bot) {
        this.bot = bot;
        this.pollCache = new Map();
        this.messageCache = new Map();
    }

    // Enhanced message processing with normalization
    normalizeMessage(message) {
        try {
            const { normalizeMessageContent } = require('@whiskeysockets/baileys');
            return normalizeMessageContent(message);
        } catch (error) {
            logger.warn('⚠️ Failed to normalize message:', error);
            return message;
        }
    }

    // JID utilities
    decodeJid(jid) {
        try {
            const { jidDecode } = require('@whiskeysockets/baileys');
            return jidDecode(jid);
        } catch (error) {
            logger.warn('⚠️ Failed to decode JID:', error);
            return null;
        }
    }

    isNewsletterJid(jid) {
        try {
            const { isJidNewsletter } = require('@whiskeysockets/baileys');
            return isJidNewsletter(jid);
        } catch (error) {
            return false;
        }
    }

    // Poll management
    async createPoll(jid, question, options, settings = {}) {
        try {
            const pollMessage = {
                poll: {
                    name: question,
                    values: options,
                    selectableCount: settings.selectableCount || 1
                }
            };

            const result = await this.bot.sendMessage(jid, pollMessage);
            
            if (result?.key) {
                this.pollCache.set(result.key.id, {
                    question,
                    options,
                    votes: new Map(),
                    createdAt: Date.now()
                });
            }

            return result;
        } catch (error) {
            logger.error('❌ Failed to create poll:', error);
            throw error;
        }
    }

    // Handle poll updates
    handlePollUpdate(messageKey, pollUpdates) {
        try {
            const pollData = this.pollCache.get(messageKey.id);
            if (!pollData) {
                logger.warn('⚠️ Poll data not found for update');
                return null;
            }

            // Get poll creation message from store
            const pollCreation = this.bot.store.loadMessage(messageKey.remoteJid, messageKey.id);
            if (!pollCreation) {
                logger.warn('⚠️ Poll creation message not found');
                return null;
            }

            const aggregation = getAggregateVotesInPollMessage({
                message: pollCreation,
                pollUpdates: pollUpdates,
            });

            logger.info('📊 Poll aggregation:', aggregation);
            return aggregation;
        } catch (error) {
            logger.error('❌ Failed to handle poll update:', error);
            return null;
        }
    }

    // Message history utilities
    async downloadHistorySync(notification) {
        try {
            const { downloadAndProcessHistorySyncNotification } = require('@whiskeysockets/baileys');
            return await downloadAndProcessHistorySyncNotification(notification);
        } catch (error) {
            logger.error('❌ Failed to download history sync:', error);
            throw error;
        }
    }

    // Presence management
    async setPresence(jid, presence, participant) {
        try {
            await this.bot.sock.sendPresenceUpdate(presence, jid);
            logger.debug(`👤 Set presence ${presence} for ${jid}`);
        } catch (error) {
            logger.error('❌ Failed to set presence:', error);
            throw error;
        }
    }

    async subscribeToPresence(jid) {
        try {
            await this.bot.sock.presenceSubscribe(jid);
            logger.debug(`👤 Subscribed to presence for ${jid}`);
        } catch (error) {
            logger.error('❌ Failed to subscribe to presence:', error);
            throw error;
        }
    }

    // Message utilities
    async forwardMessage(fromJid, toJid, messageKey) {
        try {
            const message = this.bot.store.loadMessage(fromJid, messageKey.id);
            if (!message) {
                throw new Error('Message not found in store');
            }

            return await this.bot.sendMessage(toJid, { forward: message });
        } catch (error) {
            logger.error('❌ Failed to forward message:', error);
            throw error;
        }
    }

    async reactToMessage(jid, messageKey, emoji) {
        try {
            return await this.bot.sock.sendMessage(jid, {
                react: { key: messageKey, text: emoji }
            });
        } catch (error) {
            logger.error('❌ Failed to react to message:', error);
            throw error;
        }
    }

    // Profile utilities
    async getProfilePicture(jid, highRes = false) {
        try {
            return await this.bot.sock.profilePictureUrl(jid, highRes ? 'image' : 'preview');
        } catch (error) {
            logger.warn('⚠️ Failed to get profile picture:', error);
            return null;
        }
    }

    async updateProfilePicture(jid, imageBuffer) {
        try {
            return await this.bot.sock.updateProfilePicture(jid, imageBuffer);
        } catch (error) {
            logger.error('❌ Failed to update profile picture:', error);
            throw error;
        }
    }

    // Group utilities
    async getGroupMetadata(jid) {
        try {
            return await this.bot.sock.groupMetadata(jid);
        } catch (error) {
            logger.error('❌ Failed to get group metadata:', error);
            throw error;
        }
    }

    async updateGroupSubject(jid, subject) {
        try {
            return await this.bot.sock.groupUpdateSubject(jid, subject);
        } catch (error) {
            logger.error('❌ Failed to update group subject:', error);
            throw error;
        }
    }

    async updateGroupDescription(jid, description) {
        try {
            return await this.bot.sock.groupUpdateDescription(jid, description);
        } catch (error) {
            logger.error('❌ Failed to update group description:', error);
            throw error;
        }
    }

    // Cleanup old data
    cleanup() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        // Clean old polls
        for (const [key, poll] of this.pollCache.entries()) {
            if (now - poll.createdAt > maxAge) {
                this.pollCache.delete(key);
            }
        }

        // Clean old messages
        for (const [key, message] of this.messageCache.entries()) {
            if (now - message.timestamp > maxAge) {
                this.messageCache.delete(key);
            }
        }

        logger.debug('🧹 Advanced features cleanup completed');
    }
}

module.exports = AdvancedFeatures;
