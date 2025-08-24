require('dotenv').config();
const { DropProcessor } = require('./src/services/drop-processor');

async function testDropProcessor() {
  console.log('Testing Drop Processor...');
  console.log('Environment check:');
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
  console.log('- SMTP_USER:', process.env.SMTP_USER || 'Not set');
  console.log('- POAP_API_KEY:', process.env.POAP_API_KEY ? 'Set' : 'Not set');
  
  const processor = new DropProcessor();
  
  try {
    // Test database connection
    console.log('\nTesting database connection...');
    const cookie = await processor.getLumaCookie();
    console.log('Luma cookie found:', cookie ? 'Yes' : 'No');
    
    // Test drop fetching
    console.log('\nFetching Luma drops...');
    const drops = await processor.prisma.drop.findMany({
      where: {
        platform: 'luma',
        isActive: true,
        lumaEventId: { not: null }
      }
    });
    console.log('Found drops:', drops.length);
    
    drops.forEach(drop => {
      console.log(`- Drop ${drop.id}: Event ${drop.lumaEventId}, Delivery: ${drop.deliveryTarget}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await processor.disconnect();
  }
}

testDropProcessor();