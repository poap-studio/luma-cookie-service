const cron = require('node-cron');
const { DropProcessor } = require('./drop-processor');
const logger = require('../utils/logger');

class DropScheduler {
  constructor() {
    this.processor = new DropProcessor();
    this.isRunning = false;
  }

  async processDrops() {
    if (this.isRunning) {
      logger.warn('Drop processing already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    
    try {
      await this.processor.processDrops();
    } catch (error) {
      logger.error('Drop processing failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    logger.info('Starting Drop Scheduler...');
    
    // Run immediately on startup
    logger.info('Running initial drop processing...');
    this.processDrops().catch(error => {
      logger.error('Initial drop processing failed:', error);
    });
    
    // Schedule to run every minute
    const schedule = '* * * * *';
    cron.schedule(schedule, () => {
      logger.info('Scheduled drop processing triggered');
      this.processDrops().catch(error => {
        logger.error('Scheduled drop processing failed:', error);
      });
    });
    
    logger.info(`Drop scheduler started - will run every minute (cron: ${schedule})`);
    
    // Also allow manual trigger via process signal
    process.on('SIGUSR1', () => {
      logger.info('Manual drop processing triggered via SIGUSR1');
      this.processDrops().catch(error => {
        logger.error('Manual drop processing failed:', error);
      });
    });
  }

  stop() {
    logger.info('Stopping Drop Scheduler...');
    this.isRunning = false;
  }
}

module.exports = { DropScheduler };