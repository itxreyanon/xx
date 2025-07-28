const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const {
    isJidBroadcast,
    isJidGroup,
    isJidStatusBroadcast,
    isJidNewsletter,
    downloadAndProcessHistorySyncNotification,
    getAggregateVotesInPollMessage,
    proto
} = require("@whiskeysockets/baileys");

class InMemoryStore extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Core Data Structures
        this.chats = {};
        this.contacts = {};
        this.messages = {};
        this.presences = {};
        this.groupMetadata = {};
        this.broadcastListInfo = {};
        this.callOffer = {};
        this.stickerPacks = {};
        this.authState = {};
        this.syncedHistory = {};
        this.pollMessages = {};
        this.newsletterMetadata = {};
        this.labels = {};
        this.chatLabels = {};
        
        // Enhanced Message Indexing
        this.messageIndex = {
            byId: {},
            byRemoteJid: {},
            byParticipant: {},
            byPollId: {}
        };

        // Configuration
        this.logger = options.logger || pino({ level: "silent" });
        this.filePath = options.filePath || "./store.json";
        this.autoSaveInterval = options.autoSaveInterval || 30000;
        this.maxMessagesPerChat = options.maxMessagesPerChat || 1000;
        this.autoSaveTimer = null;

        // Initialize
        if (fs.existsSync(this.filePath)) {
            this.loadFromFile();
        }

        if (this.autoSaveInterval > 0) {
            this.startAutoSave();
        }
    }

    /* ==================== CORE STORE METHODS ==================== */

    startAutoSave() {
        this.stopAutoSave(); // Clear existing timer
        this.autoSaveTimer = setInterval(() => this.saveToFile(), this.autoSaveInterval);
        this.logger.info(`Auto-save enabled (${this.autoSaveInterval}ms interval)`);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    save() {
        return {
            version: 3,
            chats: this.chats,
            contacts: this.contacts,
            messages: this.messages,
            presences: this.presences,
            groupMetadata: this.groupMetadata,
            broadcastListInfo: this.broadcastListInfo,
            callOffer: this.callOffer,
            stickerPacks: this.stickerPacks,
            authState: this.authState,
            syncedHistory: this.syncedHistory,
            pollMessages: this.pollMessages,
            newsletterMetadata: this.newsletterMetadata,
            labels: this.labels,
            chatLabels: this.chatLabels,
            messageIndex: this.messageIndex,
            timestamp: Date.now()
        };
    }

    load(state = {}) {
        try {
            this.chats = state.chats || {};
            this.contacts = state.contacts || {};
            this.messages = state.messages || {};
            this.presences = state.presences || {};
            this.groupMetadata = state.groupMetadata || {};
            this.broadcastListInfo = state.broadcastListInfo || {};
            this.callOffer = state.callOffer || {};
            this.stickerPacks = state.stickerPacks || {};
            this.authState = state.authState || {};
            this.syncedHistory = state.syncedHistory || {};
            this.pollMessages = state.pollMessages || {};
            this.newsletterMetadata = state.newsletterMetadata || {};
            this.labels = state.labels || {};
            this.chatLabels = state.chatLabels || {};
            this.messageIndex = state.messageIndex || {
                byId: {},
                byRemoteJid: {},
                byParticipant: {},
                byPollId: {}
            };
            this.logger.info(`Store loaded (v${state.version || 1})`);
        } catch (error) {
            this.logger.error("Failed to load store:", error);
        }
    }

    saveToFile() {
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(this.save(), null, 2));
            this.logger.trace("Store saved to file");
        } catch (error) {
            this.logger.error("Failed to save store:", error);
        }
    }

    loadFromFile() {
        try {
            const data = fs.readFileSync(this.filePath, "utf-8");
            this.load(JSON.parse(data));
        } catch (error) {
            this.logger.error("Failed to load store from file:", error);
        }
    }

    clear() {
        this.chats = {};
        this.contacts = {};
        this.messages = {};
        this.presences = {};
        this.groupMetadata = {};
        this.broadcastListInfo = {};
        this.callOffer = {};
        this.stickerPacks = {};
        this.authState = {};
        this.syncedHistory = {};
        this.pollMessages = {};
        this.newsletterMetadata = {};
        this.labels = {};
        this.chatLabels = {};
        this.messageIndex = {
            byId: {},
            byRemoteJid: {},
            byParticipant: {},
            byPollId: {}
        };
        this.logger.info("Store cleared");
    }

    /* ==================== MESSAGE HANDLING ==================== */

    _indexMessage(msg) {
        if (!msg?.key) return;

        const { id, remoteJid, participant } = msg.key;
        const pollId = msg.message?.pollCreationMessage?.pollCreationKey?.id;

        // Index by message ID
        this.messageIndex.byId[id] = { 
            remoteJid, 
            timestamp: msg.messageTimestamp,
            participant
        };

        // Index by chat
        if (remoteJid) {
            this.messageIndex.byRemoteJid[remoteJid] = this.messageIndex.byRemoteJid[remoteJid] || [];
            this.messageIndex.byRemoteJid[remoteJid].push(id);
            
            // Maintain message limit per chat
            if (this.messageIndex.byRemoteJid[remoteJid].length > this.maxMessagesPerChat) {
                const oldestId = this.messageIndex.byRemoteJid[remoteJid].shift();
                delete this.messageIndex.byId[oldestId];
                if (this.messages[remoteJid]) {
                    delete this.messages[remoteJid][oldestId];
                }
            }
        }

        // Index by participant
        if (participant) {
            this.messageIndex.byParticipant[participant] = this.messageIndex.byParticipant[participant] || [];
            this.messageIndex.byParticipant[participant].push(id);
        }

        // Index by poll ID
        if (pollId) {
            this.messageIndex.byPollId[pollId] = id;
            this.pollMessages[pollId] = msg;
        }
    }

    upsertMessage(message, type = "append") {
        const chatId = message?.key?.remoteJid;
        if (!chatId || !message?.key?.id) return;

        if (!this.messages[chatId]) this.messages[chatId] = {};

        if (type === "replace") {
            this.messages[chatId] = { [message.key.id]: message };
        } else {
            this.messages[chatId][message.key.id] = message;
        }

        this._indexMessage(message);
        this.emit("messages.upsert", { messages: [message], type });
    }

    loadMessage(jid, id) {
        // Check indexed message first
        const indexed = this.messageIndex.byId[id];
        if (indexed && this.messages[indexed.remoteJid]?.[id]) {
            return this.messages[indexed.remoteJid][id];
        }

        // Fallback to direct lookup
        return this.messages[jid]?.[id];
    }

    getMessagesByParticipant(jid, participant) {
        const messageIds = this.messageIndex.byParticipant[participant] || [];
        return messageIds
            .map(id => this.loadMessage(jid, id))
            .filter(Boolean);
    }

    getPollMessage(pollId) {
        const messageId = this.messageIndex.byPollId[pollId];
        return messageId ? this.loadMessage(null, messageId) : null;
    }

    /* ==================== EVENT BINDING ==================== */

    bind(ev) {
        if (!ev?.on) throw new Error("Event emitter required for binding");

        const safeEmit = (event, handler) => {
            ev.on(event, (...args) => {
                try {
                    handler.call(this, ...args);
                    this.emit(event, ...args);
                } catch (error) {
                    this.logger.error(`Error in ${event} handler:`, error);
                }
            });
        };

        // Core Events
        safeEmit("contacts.set", this.setContacts);
        safeEmit("contacts.upsert", this.upsertContact);
        safeEmit("contacts.update", this.updateContact);
        safeEmit("contacts.delete", this.deleteContact);

        safeEmit("chats.set", this.setChats);
        safeEmit("chats.upsert", this.upsertChat);
        safeEmit("chats.update", this.updateChat);
        safeEmit("chats.delete", this.deleteChat);

        safeEmit("messages.set", ({ messages, jid }) => this.setMessages(jid, messages));
        safeEmit("messages.upsert", ({ messages, type }) => {
            messages.forEach(msg => this.upsertMessage(msg, type));
        });
        safeEmit("messages.update", this.updateMessage);
        safeEmit("messages.delete", this.deleteMessage);

        // Presence
        safeEmit("presence.update", ({ id, presences }) => {
            Object.entries(presences).forEach(([participant, presence]) => {
                this.updatePresence(id, { participant, ...presence });
            });
        });

        // Groups
        safeEmit("groups.update", this.updateGroupMetadata);
        safeEmit("groups.upsert", (groups) => {
            groups.forEach(group => this.setGroupMetadata(group.id, group));
        });

        // Calls
        safeEmit("call", (calls) => {
            calls.forEach(call => {
                if (call.offer) {
                    this.setCallOffer(call.from, call);
                } else if (["timeout", "reject"].includes(call.status)) {
                    this.clearCallOffer(call.from);
                }
            });
        });

        // History Sync
        safeEmit("messaging-history.set", async (history) => {
            if (history.syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
                this.onDemandMap.set(history.messages[0].key.id, history.syncType);
            }
            await downloadAndProcessHistorySyncNotification(history, {
                downloadHistory: true,
                shouldProcessHistoryMsg: () => true
            });
        });

        // Poll Updates
        safeEmit("messages.update", (updates) => {
            updates.forEach(({ key, update }) => {
                if (update.pollUpdates) {
                    const pollMsg = this.getPollMessage(key.id);
                    if (pollMsg) {
                        const votes = getAggregateVotesInPollMessage({
                            message: pollMsg,
                            pollUpdates: update.pollUpdates
                        });
                        this.emit("poll.update", { key, votes });
                    }
                }
            });
        });

        // Newsletters
        safeEmit("newsletter.join", (update) => {
            this.newsletterMetadata[update.id] = update;
        });

        // Labels
        safeEmit("labels.edit", (edit) => {
            this.labels[edit.label.id] = edit.label;
        });

        safeEmit("labels.association", (association) => {
            this.chatLabels[association.chatJid] = association.labels;
        });

        this.logger.info("All store events bound successfully");
    }

    /* ==================== CLEANUP ==================== */

    cleanup() {
        this.stopAutoSave();
        this.saveToFile();
        this.logger.info("Store cleanup completed");
    }

    /* ==================== HELPER METHODS ==================== */

    isBroadcast(jid) { return isJidBroadcast(jid); }
    isGroup(jid) { return isJidGroup(jid); }
    isNewsletter(jid) { return isJidNewsletter(jid); }
    isStatusBroadcast(jid) { return isJidStatusBroadcast(jid); }
}

function makeInMemoryStore(options = {}) {
    return new InMemoryStore(options);
}

module.exports = {
    makeInMemoryStore,
    InMemoryStore
};
