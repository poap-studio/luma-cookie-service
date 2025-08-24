require('dotenv').config();
const puppeteer = require('puppeteer');

async function debugLogin() {
  console.log('Starting debug login test...');
  console.log('Platform:', process.platform);
  console.log('Node version:', process.version);
  console.log('Environment:', process.env.NODE_ENV);
  
  const browser = await puppeteer.launch({
    headless: process.env.NODE_ENV === 'production' ? 'new' : false,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'darwin' ? undefined : '/usr/bin/google-chrome'),
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
  
  try {
    console.log('Navigating to login page...');
    await page.goto('https://lu.ma/signin', { waitUntil: 'networkidle2' });
    
    // Wait a bit to ensure page is loaded
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Debug: Get all input fields
    const inputs = await page.$$eval('input', elements => 
      elements.map(el => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        value: el.value,
        visible: el.offsetParent !== null
      }))
    );
    console.log('Input fields found:', JSON.stringify(inputs, null, 2));
    
    // Check for email field
    const emailField = await page.$('input[type="email"]');
    if (emailField) {
      console.log('Email field found');
      const isVisible = await emailField.isIntersectingViewport();
      console.log('Email field visible:', isVisible);
      
      if (isVisible) {
        console.log('Clicking email field...');
        await emailField.click();
        
        // Clear field completely
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Delete');
        
        console.log('Typing email...');
        await emailField.type(process.env.LUMA_EMAIL, { delay: 50 });
        
        // Take screenshot
        await page.screenshot({ path: '/tmp/debug-after-email.png' });
        console.log('Screenshot saved: /tmp/debug-after-email.png');
        
        // Submit
        console.log('Submitting email...');
        await page.keyboard.press('Enter');
        
        // Wait for page to change
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Check for password field
    const passwordField = await page.$('input[type="password"]');
    if (passwordField) {
      console.log('Password field found');
      const isVisible = await passwordField.isIntersectingViewport();
      console.log('Password field visible:', isVisible);
      
      if (isVisible) {
        console.log('Getting password field value before typing...');
        const valueBefore = await passwordField.evaluate(el => el.value);
        console.log('Value before:', valueBefore ? `${valueBefore.length} chars` : 'empty');
        
        console.log('Clicking password field...');
        await passwordField.click();
        
        // Clear using multiple methods
        console.log('Clearing password field...');
        await passwordField.click({ clickCount: 3 });
        await page.keyboard.press('Delete');
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Delete');
        
        // Also try to set value directly
        await passwordField.evaluate(el => el.value = '');
        
        const valueAfterClear = await passwordField.evaluate(el => el.value);
        console.log('Value after clear:', valueAfterClear ? `${valueAfterClear.length} chars` : 'empty');
        
        console.log('Typing password...');
        await passwordField.type(process.env.LUMA_PASSWORD, { delay: 50 });
        
        const valueAfterType = await passwordField.evaluate(el => el.value);
        console.log('Value after typing:', valueAfterType ? `${valueAfterType.length} chars` : 'empty');
        console.log('Expected password length:', process.env.LUMA_PASSWORD.length);
        console.log('Password matches expected:', valueAfterType === process.env.LUMA_PASSWORD);
        
        // Debug character by character
        if (valueAfterType && valueAfterType !== process.env.LUMA_PASSWORD) {
          console.log('Password mismatch detected!');
          console.log('Expected:', process.env.LUMA_PASSWORD);
          console.log('Got:', valueAfterType);
          console.log('Character codes expected:', [...process.env.LUMA_PASSWORD].map(c => c.charCodeAt(0)));
          console.log('Character codes got:', [...valueAfterType].map(c => c.charCodeAt(0)));
        }
        
        // Take screenshot
        await page.screenshot({ path: '/tmp/debug-after-password.png' });
        console.log('Screenshot saved: /tmp/debug-after-password.png');
      }
    }
    
    // Get current URL
    console.log('Current URL:', page.url());
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

debugLogin().catch(console.error);