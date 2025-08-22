const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');

class WebhookServer {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Webhook endpoint
    this.app.post('/webhook', (req, res) => {
      logger.info('Received webhook request');
      
      // Verify webhook signature if secret is configured
      if (this.config.webhook?.secret) {
        const signature = req.headers['x-webhook-signature'];
        const expectedSignature = crypto
          .createHmac('sha256', this.config.webhook.secret)
          .update(JSON.stringify(req.body))
          .digest('hex');
        
        if (signature !== expectedSignature) {
          logger.warn('Invalid webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
      
      logger.info('Webhook received:', req.body);
      res.json({ received: true });
    });
  }

  start(port = 3001) {
    this.server = this.app.listen(port, () => {
      logger.info(`Webhook server listening on port ${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = { WebhookServer };