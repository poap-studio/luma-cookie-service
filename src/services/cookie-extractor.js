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
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
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
          
          // Wait for navigation away from signin page
          try {
            await page.waitForFunction(
              () => !window.location.href.includes('/signin'),
              { timeout: 15000 }
            );
          } catch (e) {
            logger.warn('Navigation timeout - checking cookies anyway');
          }
          
          await this.delay(2000);
          
          // Get current URL to verify login
          const currentUrl = page.url();
          logger.info(`Current URL after login: ${currentUrl}`);
          
          // Get all cookies
          const cookies = await page.cookies();
          logger.info(`Found ${cookies.length} cookies`);
          
          // Log all cookie names for debugging
          cookies.forEach(cookie => {
            logger.info(`Cookie found: ${cookie.name} (domain: ${cookie.domain})`);
          });
          
          // Look for the luma-specific cookie
          let sessionCookie = cookies.find(cookie => 
            cookie.domain === '.lu.ma' && cookie.value && cookie.value.length > 20
          );
          
          if (!sessionCookie) {
            // Try different possible cookie names
            const possibleNames = ['luma.auth-session-key', 'auth-session-key', '__Secure-next-auth.session-token', 'next-auth.session-token'];
            
            for (const name of possibleNames) {
              sessionCookie = cookies.find(cookie => cookie.name === name);
              if (sessionCookie) {
                logger.info(`Found session cookie with name: ${name}`);
                break;
              }
            }
          }
          
          // If no specific cookie found, look for any cookie with 'session' or 'auth' in the name
          if (!sessionCookie) {
            sessionCookie = cookies.find(cookie => 
              (cookie.name.toLowerCase().includes('session') || 
               cookie.name.toLowerCase().includes('auth')) &&
              cookie.value && cookie.value.length > 20
            );
            if (sessionCookie) {
              logger.info(`Found potential session cookie: ${sessionCookie.name}`);
            }
          }
          
          if (sessionCookie) {
            const cookieString = `${sessionCookie.name}=${sessionCookie.value}`;
            logger.info(`Successfully extracted cookie: ${sessionCookie.name}`);
            
            await browser.close();
            return {
              cookie: cookieString,
              expiresAt: sessionCookie.expires ? new Date(sessionCookie.expires * 1000) : null,
              obtainedAt: new Date()
            };
          } else {
            throw new Error('Could not find session cookie. Available cookies: ' + cookies.map(c => c.name).join(', '));
          }
          
        } finally {
          await browser.close();
        }
        
      } catch (error) {
        retries++;
        logger.error(`Attempt ${retries} failed:`, error.message);
        logger.error(`Full error:`, error);
        
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