
const config = require('../../config');
const logger = require('../logger');

class ApiHelper {
    constructor() {
        this.apiKeys = new Map();
        this.loadApiKeys();
    }

    loadApiKeys() {
        // Load API keys from config or environment
        this.apiKeys.set('neoxr', process.env.API_KEY || config.get('api.neoxr'));
        this.apiKeys.set('openai', process.env.OPENAI_API_KEY || config.get('api.openai'));
        this.apiKeys.set('google', process.env.GOOGLE_API_KEY || config.get('api.google'));
    }

    getApiKey(service) {
        const key = this.apiKeys.get(service.toLowerCase());
        if (!key) {
            logger.warn(`⚠️ API key not found for service: ${service}`);
        }
        return key;
    }

    async makeApiRequest(url, options = {}) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            logger.error('API request failed:', error);
            throw error;
        }
    }

    // Neoxr API helper (compatible with original bot)
    async neoxrApi(endpoint, params = {}) {
        const apiKey = this.getApiKey('neoxr');
        if (!apiKey) {
            throw new Error('Neoxr API key not configured');
        }

        const baseUrl = 'https://api.neoxr.my.id/api';
        const queryParams = new URLSearchParams({
            ...params,
            apikey: apiKey
        });

        const url = `${baseUrl}${endpoint}?${queryParams}`;
        return await this.makeApiRequest(url);
    }

    // Global API object for compatibility
    static createGlobalApi() {
        const helper = new ApiHelper();
        return {
            neoxr: helper.neoxrApi.bind(helper)
        };
    }
}

// Create global Api object for compatibility with original plugins
global.Api = ApiHelper.createGlobalApi();

module.exports = new ApiHelper();
