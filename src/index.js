const dotenv = require('dotenv');
const { CookieScheduler } = require('./services/scheduler');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Initialize and start the scheduler
async function main() {
  try {
    logger.info('Starting Luma Cookie Service...');
    
    const scheduler = new CookieScheduler({
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
    });

    // Start the scheduler
    scheduler.start();
    
    logger.info('Luma Cookie Service started successfully');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

main();