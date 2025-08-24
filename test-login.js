require('dotenv').config();
const { LumaCookieExtractor } = require('./src/services/cookie-extractor');

async function testLogin() {
  console.log('Testing Luma login with browser visible...');
  console.log('Email:', process.env.LUMA_EMAIL);
  console.log('Password:', process.env.LUMA_PASSWORD ? '***' : 'NOT SET');
  
  const extractor = new LumaCookieExtractor({
    email: process.env.LUMA_EMAIL,
    password: process.env.LUMA_PASSWORD
  });
  
  try {
    const result = await extractor.extractCookie();
    console.log('Success! Cookie extracted:', result.cookie.substring(0, 50) + '...');
    console.log('Expires at:', result.expiresAt);
  } catch (error) {
    console.error('Error extracting cookie:', error.message);
    process.exit(1);
  }
}

testLogin();