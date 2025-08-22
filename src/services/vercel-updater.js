const axios = require('axios');
const logger = require('../utils/logger');

class VercelUpdater {
  constructor(config) {
    this.token = config.token;
    this.projectId = config.projectId;
    this.envId = config.envId;
  }

  async updateCookie(cookieValue) {
    try {
      logger.info('Updating cookie in Vercel...');
      
      // First, try to update existing environment variable
      if (this.envId) {
        try {
          const response = await axios.patch(
            `https://api.vercel.com/v9/projects/${this.projectId}/env/${this.envId}`,
            {
              value: cookieValue,
              target: ['production', 'preview', 'development']
            },
            {
              headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          logger.info('Successfully updated existing environment variable');
          return response.data;
          
        } catch (error) {
          if (error.response?.status === 404) {
            logger.warn('Environment variable not found, creating new one...');
            return await this.createEnvVariable(cookieValue);
          }
          throw error;
        }
      } else {
        // If no envId provided, create new variable
        return await this.createEnvVariable(cookieValue);
      }
      
    } catch (error) {
      logger.error('Failed to update cookie in Vercel:', error.response?.data || error.message);
      throw error;
    }
  }

  async createEnvVariable(cookieValue) {
    try {
      const response = await axios.post(
        `https://api.vercel.com/v9/projects/${this.projectId}/env`,
        {
          key: 'LUMA_SESSION_COOKIE',
          value: cookieValue,
          type: 'encrypted',
          target: ['production', 'preview', 'development']
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      logger.info('Successfully created new environment variable');
      return response.data;
      
    } catch (error) {
      logger.error('Failed to create environment variable:', error.response?.data || error.message);
      throw error;
    }
  }

  async notifyWebhook(cookieData, webhookConfig) {
    if (!webhookConfig?.url) {
      logger.info('No webhook URL configured, skipping notification');
      return;
    }

    try {
      logger.info('Notifying webhook...');
      
      const payload = {
        status: 'success',
        timestamp: new Date().toISOString(),
        cookie: cookieData.cookie,
        expiresAt: cookieData.expiresAt,
        message: 'Cookie updated successfully'
      };

      if (webhookConfig.secret) {
        payload.secret = webhookConfig.secret;
      }

      await axios.post(webhookConfig.url, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      logger.info('Webhook notification sent successfully');
      
    } catch (error) {
      logger.error('Failed to notify webhook:', error.message);
      // Don't throw here, webhook failure shouldn't stop the process
    }
  }
}

module.exports = { VercelUpdater };