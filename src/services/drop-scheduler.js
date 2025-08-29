const cron = require('node-cron');
const { DropProcessor } = require('./drop-processor');
const { RealTimeProcessor } = require('./real-time-processor');
const logger = require('../utils/logger');

class DropScheduler {
  constructor() {
    this.processor = new DropProcessor();
    this.realTimeProcessor = new RealTimeProcessor();
    this.isRunning = false;
    this.isRealTimeRunning = false;
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

  async processRealTimeDrops() {
    if (this.isRealTimeRunning) {
      logger.warn('Real-time processing already in progress, skipping...');
      return;
    }

    this.isRealTimeRunning = true;
    
    try {
      await this.realTimeProcessor.processRealTimeDrops();
    } catch (error) {
      logger.error('Real-time processing failed:', error);
    } finally {
      this.isRealTimeRunning = false;
    }
  }

  start() {
    logger.info('Starting Drop Scheduler...');
    
    // Run immediately on startup
    logger.info('Running initial drop processing...');
    this.processDrops().catch(error => {
      logger.error('Initial drop processing failed:', error);
    });
    
    // Run real-time processing immediately on startup
    logger.info('Running initial real-time processing...');
    this.processRealTimeDrops().catch(error => {
      logger.error('Initial real-time processing failed:', error);
    });
    
    // Schedule automatic drops to run every minute
    const schedule = '* * * * *';
    cron.schedule(schedule, () => {
      logger.info('Scheduled drop processing triggered');
      this.processDrops().catch(error => {
        logger.error('Scheduled drop processing failed:', error);
      });
    });
    
    logger.info(`Drop scheduler started - will run every minute (cron: ${schedule})`);
    
    // Schedule real-time processing every 15 seconds
    setInterval(() => {
      logger.debug('Real-time processing triggered');
      this.processRealTimeDrops().catch(error => {
        logger.error('Real-time processing failed:', error);
      });
    }, 15000); // 15 seconds
    
    logger.info('Real-time scheduler started - will run every 15 seconds');
    
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