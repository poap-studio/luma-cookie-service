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
        
        const launchOptions = {
          headless: process.env.NODE_ENV === 'production' ? 'new' : false,
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
        };
        
        // Only set executablePath in production (Linux)
        if (process.env.NODE_ENV === 'production' || process.platform === 'linux') {
          launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome';
        }
        
        const browser = await puppeteer.launch(launchOptions);
        
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
          
          // Check what's currently on the page
          const emailField = await page.$('input[type="email"]');
          const passwordField = await page.$('input[type="password"]');
          
          // Check if email field is visible
          if (emailField && await emailField.isIntersectingViewport()) {
            // Email field is visible, enter email
            logger.info('Email field detected, entering email...');
            await emailField.click();
            await emailField.type('', { delay: 10 }); // Clear any existing content
            await page.keyboard.down('Control');
            await page.keyboard.press('A');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            await emailField.type(this.email, { delay: 100 });
            
            // Submit email
            logger.info('Submitting email...');
            await page.click('button[type="submit"]');
            
            // Wait for password field
            await this.delay(3000);
          }
          
          // Now handle password - but only if password field is visible
          try {
            logger.info('Looking for password field...');
            const passwordFieldAfter = await page.waitForSelector('input[type="password"]', { visible: true, timeout: 5000 });
            
            // IMPORTANT: Check if email field is still visible
            // If it is, we're still on email step, not password step
            const emailFieldStillVisible = await page.$('input[type="email"]');
            if (emailFieldStillVisible && await emailFieldStillVisible.isIntersectingViewport()) {
              logger.error('Email field is still visible - we are not on password step yet!');
              throw new Error('Login flow did not progress to password step');
            }
            
            // Clear the field completely before typing
            logger.info('Clearing password field...');
            await passwordFieldAfter.click();
            await passwordFieldAfter.focus();
            
            // Use keyboard shortcuts to select all and delete
            await page.keyboard.down('Control');
            await page.keyboard.press('A');
            await page.keyboard.up('Control');
            await page.keyboard.press('Delete');
            
            // Also try triple click and backspace as backup
            await passwordFieldAfter.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            
            // Verify field is empty
            const fieldValue = await passwordFieldAfter.evaluate(el => el.value);
            if (fieldValue && fieldValue.length > 0) {
              logger.warn(`Field still has content: ${fieldValue.length} chars`);
              // Try one more time to clear
              await passwordFieldAfter.evaluate(el => el.value = '');
            }
            
            logger.info('Entering password...');
            await passwordFieldAfter.type(this.password, { delay: 100 });
            
            // Take screenshot after entering password
            try {
              await page.screenshot({ path: '/tmp/luma-password-entered.png', fullPage: true });
              logger.info('Screenshot saved after entering password');
            } catch (e) {
              // Ignore screenshot errors
            }
            
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
              const timestamp = Date.now();
              await page.screenshot({ path: `/tmp/luma-login-final-${timestamp}.png`, fullPage: true });
              logger.info(`Final screenshot saved to /tmp/luma-login-final-${timestamp}.png`);
              
              // Also log the page content for debugging
              const pageContent = await page.content();
              if (pageContent.includes('incorrect') || pageContent.includes('invalid')) {
                logger.error('Page contains error keywords - login may have failed');
              }
              
              // Log current URL
              const finalUrl = page.url();
              logger.info(`Final URL: ${finalUrl}`);
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
          
          // First priority: try specific cookie names we know Luma uses
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
          
          if (!sessionCookie) {
            // If no specific name found, look for JWT-like tokens
            // but exclude common non-session cookies like __cf_bm
            sessionCookie = cookies.find(cookie => {
              // Skip known non-session cookies
              if (cookie.name.startsWith('__cf_') || 
                  cookie.name === 'luma.did' || 
                  cookie.name === 'luma.first-page') {
                return false;
              }
              
              // JWT tokens typically start with 'ey' and are long
              if (cookie.value && (cookie.value.startsWith('ey') || cookie.value.length > 100)) {
                logger.info(`Found potential JWT/session cookie: ${cookie.name}`);
                return true;
              }
              return false;
            });
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