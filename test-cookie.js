require('dotenv').config();
const { LumaCookieExtractor } = require('./src/services/cookie-extractor');
const axios = require('axios');

async function testCookie() {
  console.log('Extracting cookie...');
  
  const extractor = new LumaCookieExtractor({
    email: process.env.LUMA_EMAIL,
    password: process.env.LUMA_PASSWORD
  });
  
  try {
    const result = await extractor.extractCookie();
    console.log('Cookie extracted:', result.cookie.substring(0, 50) + '...');
    
    // Test the cookie
    console.log('\nTesting cookie with Luma API...');
    const testEventId = 'evt-dFABGoCDVLecXHG';
    
    const response = await axios.get(
      `https://api.lu.ma/event/admin/get?event_api_id=${testEventId}`,
      {
        headers: {
          'Cookie': result.cookie,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        }
      }
    );
    
    console.log('API Response status:', response.status);
    console.log('Event data:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
    console.log('\n✅ Cookie is working correctly!');
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testCookie();