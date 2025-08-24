const dotenv = require('dotenv');
const { CookieScheduler } = require('./services/scheduler');
const { DropScheduler } = require('./services/drop-scheduler');
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
      }
    };

    // Start the cookie scheduler
    const cookieScheduler = new CookieScheduler(config);
    cookieScheduler.start();
    
    // Start the drop processor scheduler
    const dropScheduler = new DropScheduler();
    dropScheduler.start();
    
    logger.info('Luma Cookie Service started successfully');
    
    // Send ready signal to PM2
    if (process.send) {
      process.send('ready');
    }
    
    // Handle graceful shutdown
    const shutdown = () => {
      logger.info('Shutting down gracefully...');
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