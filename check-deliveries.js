require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDeliveries() {
  const deliveries = await prisma.lumaDelivery.findMany({
    where: { dropId: 'cmeoqvpmt0002jp04jdhkg7w2' }
  });
  
  console.log('Deliveries found:', deliveries.length);
  deliveries.forEach(d => {
    console.log(`- ${d.name}: ${d.email} at ${d.sentAt}`);
  });
  
  await prisma.$disconnect();
}

checkDeliveries();