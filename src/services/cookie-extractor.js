const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class LumaCookieExtractor {
  constructor(config) {
    this.email = config.email;
    this.password = config.password;
    this.maxRetries = 3;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async extractCookie() {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        logger.info(`Attempting to extract cookie (attempt ${retries + 1}/${this.maxRetries})`);
        
        const browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
          ]
        });
        
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        try {
          // Navigate to login page
          logger.info('Navigating to Luma login page...');
          await page.goto('https://lu.ma/signin', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });
          
          // Enter email
          logger.info('Entering email...');
          await page.waitForSelector('input[type="email"]', { visible: true });
          await page.type('input[type="email"]', this.email, { delay: 100 });
          
          // Click continue
          logger.info('Submitting email...');
          await page.click('button[type="submit"]');
          
          // Wait for password field or navigation
          await this.delay(3000);
          
          // Enter password if field is present
          try {
            logger.info('Looking for password field...');
            await page.waitForSelector('input[type="password"]', { visible: true, timeout: 5000 });
            
            logger.info('Entering password...');
            await page.type('input[type="password"]', this.password, { delay: 100 });
            
            // Submit password
            logger.info('Submitting login form...');
            await page.click('button[type="submit"]');
            
          } catch (e) {
            logger.warn('No password field found, might be using different auth method');
          }
          
          // Wait for navigation to complete
          logger.info('Waiting for login to complete...');
          await this.delay(5000);
          
          // Get current URL to verify login
          const currentUrl = page.url();
          logger.info(`Current URL after login: ${currentUrl}`);
          
          // Get all cookies
          const cookies = await page.cookies();
          logger.info(`Found ${cookies.length} cookies`);
          
          // Find the auth session cookie
          const sessionCookie = cookies.find(cookie => 
            cookie.name === 'luma.auth-session-key'
          );
          
          if (sessionCookie) {
            const cookieString = `${sessionCookie.name}=${sessionCookie.value}`;
            logger.info('Successfully extracted luma.auth-session-key');
            
            await browser.close();
            return {
              cookie: cookieString,
              expiresAt: sessionCookie.expires ? new Date(sessionCookie.expires * 1000) : null,
              obtainedAt: new Date()
            };
          } else {
            throw new Error('Could not find luma.auth-session-key cookie');
          }
          
        } finally {
          await browser.close();
        }
        
      } catch (error) {
        retries++;
        logger.error(`Attempt ${retries} failed:`, error.message);
        
        if (retries < this.maxRetries) {
          logger.info(`Waiting 5 seconds before retry...`);
          await this.delay(5000);
        }
      }
    }
    
    throw new Error('Failed to extract cookie after max retries');
  }

  async testCookie(cookieString) {
    logger.info('Testing extracted cookie...');
    
    try {
      const axios = require('axios');
      
      // Test with a known event
      const testEventId = 'evt-dFABGoCDVLecXHG';
      const response = await axios.get(
        `https://api.lu.ma/event/admin/get?event_api_id=${testEventId}`,
        {
          headers: {
            'Cookie': cookieString,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
          }
        }
      );
      
      if (response.status === 200) {
        logger.info('Cookie validation successful');
        return true;
      }
    } catch (error) {
      logger.error('Cookie validation failed:', error.message);
      return false;
    }
    
    return false;
  }
}

module.exports = { LumaCookieExtractor };