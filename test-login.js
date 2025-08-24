require('dotenv').config();
const { LumaCookieExtractor } = require('./src/services/cookie-extractor');

async function test() {
  const extractor = new LumaCookieExtractor({
    email: process.env.LUMA_EMAIL,
    password: process.env.LUMA_PASSWORD
  });

  try {
    console.log('Testing cookie extraction...');
    const result = await extractor.extractCookie();
    console.log('Success!', result);
  } catch (error) {
    console.error('Failed:', error.message);
  }
  process.exit();
}

test();