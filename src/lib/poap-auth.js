const axios = require('axios');
const logger = require('../utils/logger');

class POAPAuthManager {
  constructor(clientId, clientSecret, audience = 'https://api.poap.tech') {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.audience = audience;
    this.currentToken = null;
    this.tokenExpiresAt = null;
    this.refreshPromise = null;
  }

  async refreshToken() {
    logger.info('Refreshing POAP access token...');
    
    try {
      const response = await axios.post('https://auth.accounts.poap.xyz/oauth/token', {
        audience: this.audience,
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const tokenData = response.data;
      
      // Calculate expiry time with 5-minute buffer
      this.tokenExpiresAt = Date.now() + (tokenData.expires_in - 300) * 1000;
      this.currentToken = tokenData.access_token;
      
      logger.info('POAP token refreshed successfully');
      return this.currentToken;
      
    } catch (error) {
      logger.error('Failed to refresh POAP token:', error.message);
      throw error;
    }
  }

  async getValidToken() {
    // Check if current token is still valid
    if (this.currentToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.currentToken;
    }

    // If there's already a refresh in progress, wait for it
    if (this.refreshPromise) {
      return await this.refreshPromise;
    }

    // Start a new refresh
    this.refreshPromise = this.refreshToken();
    
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async makeAuthenticatedRequest(url, options = {}, retryOnAuth = true) {
    const token = await this.getValidToken();
    
    const config = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    };

    try {
      const response = await axios(url, config);
      return response;
    } catch (error) {
      // If we get a 401/403 and haven't retried yet, refresh token and retry
      if ((error.response?.status === 401 || error.response?.status === 403) && retryOnAuth) {
        logger.info('Authentication failed, refreshing token and retrying...');
        
        // Clear current token
        this.currentToken = null;
        this.tokenExpiresAt = null;
        
        // Get new token and retry
        const newToken = await this.getValidToken();
        
        const retryConfig = {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`
          }
        };
        
        return await axios(url, retryConfig);
      }
      
      throw error;
    }
  }
}

// Singleton instance
let authManager = null;

function getPOAPAuthManager() {
  if (!authManager) {
    const clientId = process.env.POAP_CLIENT_ID;
    const clientSecret = process.env.POAP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('POAP_CLIENT_ID and POAP_CLIENT_SECRET environment variables are required');
    }

    authManager = new POAPAuthManager(clientId, clientSecret);
  }

  return authManager;
}

module.exports = { getPOAPAuthManager, POAPAuthManager };