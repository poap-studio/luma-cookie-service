const cron = require('node-cron');
const { LumaCookieExtractor } = require('./cookie-extractor');
const { VercelUpdater } = require('./vercel-updater');
const logger = require('../utils/logger');

class CookieScheduler {
  constructor(config) {
    this.config = config;
    this.extractor = new LumaCookieExtractor(config.luma);
    this.updater = new VercelUpdater(config.vercel);
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
      
      // 3. Update in Vercel
      logger.info('Step 3: Updating cookie in Vercel...');
      await this.updater.updateCookie(cookieData.cookie);
      logger.info('Vercel updated successfully');
      
      // 4. Notify webhook if configured
      logger.info('Step 4: Sending webhook notification...');
      await this.updater.notifyWebhook(cookieData, this.config.webhook);
      
      // 5. Log success
      const duration = Date.now() - startTime;
      logger.info(`Cookie update completed successfully in ${duration}ms`);
      logger.info(`Cookie will expire at: ${cookieData.expiresAt || 'Unknown'}`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Cookie update failed after ${duration}ms:`, error);
      
      // Send error notification if webhook configured
      if (this.config.webhook?.url) {
        try {
          await this.updater.notifyWebhook({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
          }, this.config.webhook);
        } catch (webhookError) {
          logger.error('Failed to send error webhook:', webhookError.message);
        }
      }
      
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
    
    // Schedule to run every 24 hours at 2 AM
    const schedule = '0 2 * * *';
    cron.schedule(schedule, () => {
      logger.info('Scheduled cookie update triggered');
      this.updateCookie().catch(error => {
        logger.error('Scheduled cookie update failed:', error);
      });
    });
    
    logger.info(`Cookie scheduler started - will run daily at 2 AM (cron: ${schedule})`);
    
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