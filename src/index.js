const dotenv = require('dotenv');
const { CookieScheduler } = require('./services/scheduler');
const { WebhookServer } = require('./services/webhook-server');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Initialize and start the services
async function main() {
  try {
    logger.info('Starting Luma Cookie Service...');
    
    const config = {
      luma: {
        email: process.env.LUMA_EMAIL || 'admin@poap.fr',
        password: process.env.LUMA_PASSWORD || '!q*g%@TP7w^q'
      },
      vercel: {
        token: process.env.VERCEL_TOKEN,
        projectId: process.env.VERCEL_PROJECT_ID,
        envId: process.env.VERCEL_ENV_ID
      },
      webhook: {
        url: process.env.WEBHOOK_URL,
        secret: process.env.WEBHOOK_SECRET
      }
    };

    // Start the scheduler
    const scheduler = new CookieScheduler(config);
    scheduler.start();
    
    // Start the webhook server
    const webhookServer = new WebhookServer(config);
    webhookServer.start(3001);
    
    logger.info('Luma Cookie Service started successfully');
    
    // Send ready signal to PM2
    if (process.send) {
      process.send('ready');
    }
    
    // Handle graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down gracefully...');
      webhookServer.stop();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Start the service
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});