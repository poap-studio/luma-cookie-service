const cron = require('node-cron');
const { LumaCookieExtractor } = require('./cookie-extractor');
const { DatabaseUpdater } = require('./database-updater');
const logger = require('../utils/logger');

class CookieScheduler {
  constructor(config) {
    this.config = config;
    this.extractor = new LumaCookieExtractor(config.luma);
    this.updater = new DatabaseUpdater();
    this.isRunning = false;
  }

  async updateCookie() {
    if (this.isRunning) {
      logger.warn('Update already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    logger.info(`[${new Date().toISOString()}] Starting cookie update process...`);
    
    try {
      // 1. Extract new cookie
      logger.info('Step 1: Extracting cookie from Luma...');
      const cookieData = await this.extractor.extractCookie();
      logger.info('Cookie extracted successfully');
      
      // 2. Test the cookie
      logger.info('Step 2: Validating cookie...');
      const isValid = await this.extractor.testCookie(cookieData.cookie);
      
      if (!isValid) {
        throw new Error('Extracted cookie failed validation');
      }
      
      // 3. Update in database
      logger.info('Step 3: Updating cookie in database...');
      await this.updater.updateCookie(cookieData);
      logger.info('Database updated successfully');
      
      // 4. Cleanup old cookies
      logger.info('Step 4: Cleaning up old cookies...');
      await this.updater.cleanupOldCookies();
      
      // 5. Log success
      const duration = Date.now() - startTime;
      logger.info(`Cookie update completed successfully in ${duration}ms`);
      logger.info(`Cookie will expire at: ${cookieData.expiresAt || 'Unknown'}`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Cookie update failed after ${duration}ms:`, error);
      
      // Log error details
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    logger.info('Starting Cookie Scheduler...');
    
    // Run immediately on startup
    logger.info('Running initial cookie update...');
    this.updateCookie().catch(error => {
      logger.error('Initial cookie update failed:', error);
    });
    
    // Schedule to run every 4 hours
    const schedule = '0 */4 * * *';
    cron.schedule(schedule, () => {
      logger.info('Scheduled cookie update triggered');
      this.updateCookie().catch(error => {
        logger.error('Scheduled cookie update failed:', error);
      });
    });
    
    logger.info(`Cookie scheduler started - will run every 4 hours (cron: ${schedule})`);
    
    // Also allow manual trigger via process signal
    process.on('SIGUSR2', () => {
      logger.info('Manual cookie update triggered via SIGUSR2');
      this.updateCookie().catch(error => {
        logger.error('Manual cookie update failed:', error);
      });
    });
  }

  stop() {
    logger.info('Stopping Cookie Scheduler...');
    // Node-cron doesn't provide a stop method, but we can use the isRunning flag
    this.isRunning = false;
  }
}

module.exports = { CookieScheduler };