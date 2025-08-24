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
            
            // Wait a bit before submitting
            await this.delay(1000);
            
            // Submit password - look for the Continue button
            logger.info('Submitting login form...');
            
            // Try multiple selectors for the submit button
            const buttonSelectors = [
              'button',
              'button[type="submit"]',
              'button.primary'
            ];
            
            let clicked = false;
            for (const selector of buttonSelectors) {
              try {
                const button = await page.$(selector);
                if (button) {
                  const text = await button.evaluate(el => el.textContent);
                  if (text && text.toLowerCase().includes('continue')) {
                    logger.info(`Clicking button with text: ${text}`);
                    await button.click();
                    clicked = true;
                    break;
                  }
                }
              } catch (e) {
                // Continue trying other selectors
              }
            }
            
            if (!clicked) {
              // If no button found, try pressing Enter
              logger.info('No Continue button found, pressing Enter');
              await page.keyboard.press('Enter');
            }
            
            // Wait for potential error messages or navigation
            await this.delay(3000);
            
            // Check for error messages
            try {
              const errorElement = await page.$('[role="alert"], .error, .error-message, [class*="error"]');
              if (errorElement) {
                const errorText = await errorElement.evaluate(el => el.textContent);
                logger.error(`Login error detected: ${errorText}`);
              }
            } catch (e) {
              // No error element found
            }
            
          } catch (e) {
            logger.warn('No password field found, might be using different auth method');
          }
          
          // Wait for navigation to complete
          logger.info('Waiting for login to complete...');
          
          // Wait for navigation away from signin page or for session cookie to appear
          try {
            await Promise.race([
              page.waitForFunction(
                () => !window.location.href.includes('/signin'),
                { timeout: 20000 }
              ),
              page.waitForFunction(
                () => {
                  const cookies = document.cookie.split(';');
                  return cookies.some(c => 
                    c.includes('auth') || 
                    c.includes('session') || 
                    c.includes('token')
                  );
                },
                { timeout: 20000 }
              )
            ]);
            logger.info('Login appears successful');
          } catch (e) {
            logger.warn('Navigation timeout - checking cookies anyway');
            // Take a screenshot for debugging
            try {
              await page.screenshot({ path: '/tmp/luma-login-debug.png', fullPage: true });
              logger.info('Debug screenshot saved to /tmp/luma-login-debug.png');
              
              // Also log the page content for debugging
              const pageContent = await page.content();
              if (pageContent.includes('incorrect') || pageContent.includes('invalid')) {
                logger.error('Page contains error keywords - login may have failed');
              }
            } catch (screenshotError) {
              logger.error('Failed to take screenshot:', screenshotError.message);
            }
          }
          
          await this.delay(2000);
          
          // Get current URL to verify login
          const currentUrl = page.url();
          logger.info(`Current URL after login: ${currentUrl}`);
          
          // Get all cookies from all domains
          const client = await page.target().createCDPSession();
          const { cookies: allCookies } = await client.send('Network.getAllCookies');
          
          // Filter cookies related to luma
          const cookies = allCookies.filter(cookie => 
            cookie.domain.includes('lu.ma') || 
            cookie.domain.includes('luma')
          );
          
          logger.info(`Found ${cookies.length} Luma-related cookies (${allCookies.length} total)`);
          
          // Log all cookie names for debugging
          cookies.forEach(cookie => {
            logger.info(`Cookie found: ${cookie.name} (domain: ${cookie.domain}, ${cookie.value.length} chars)`);
          });
          
          // Look for cookies that might be the session cookie
          // Luma might use a different cookie name now
          let sessionCookie = null;
          
          // First, try to find any cookie that looks like a JWT or session token
          sessionCookie = cookies.find(cookie => {
            // JWT tokens typically start with 'ey' and are long
            if (cookie.value && (cookie.value.startsWith('ey') || cookie.value.length > 100)) {
              logger.info(`Found potential JWT/session cookie: ${cookie.name}`);
              return true;
            }
            return false;
          });
          
          if (!sessionCookie) {
            // Try specific cookie names
            const possibleNames = [
              'luma.auth-session-key', 
              'auth-session-key', 
              '__Secure-next-auth.session-token', 
              'next-auth.session-token',
              'luma-auth-token',
              'session',
              'auth-token'
            ];
            
            for (const name of possibleNames) {
              sessionCookie = cookies.find(cookie => cookie.name === name);
              if (sessionCookie) {
                logger.info(`Found session cookie with name: ${name}`);
                break;
              }
            }
          }
          
          // If still no cookie, check if we're actually logged in by looking at the URL
          if (!sessionCookie && currentUrl && !currentUrl.includes('/signin')) {
            // We might be logged in but the cookie name is different
            // Use the longest cookie value as it's likely the session
            sessionCookie = cookies.reduce((prev, current) => {
              if (!prev) return current;
              return current.value.length > prev.value.length ? current : prev;
            }, null);
            
            if (sessionCookie) {
              logger.info(`Using longest cookie as session: ${sessionCookie.name} (${sessionCookie.value.length} chars)`);
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