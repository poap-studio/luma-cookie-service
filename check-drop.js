require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDrop() {
  const drop = await prisma.drop.findFirst({
    where: { platform: 'luma', isActive: true },
    include: { lumaGuests: { where: { checkedInAt: { not: null } } } }
  });
  
  console.log('Drop config:');
  console.log('- ID:', drop.id);
  console.log('- Delivery target:', drop.deliveryTarget);
  console.log('- Email subject:', drop.emailSubject);
  console.log('- Email body:', drop.emailBody ? 'Custom' : 'Default');
  console.log('- POAPs delivered:', drop.poapsDelivered);
  console.log('- Delivered at:', drop.deliveredAt);
  console.log('- Guests with check-in:', drop.lumaGuests.length);
  
  drop.lumaGuests.forEach(guest => {
    console.log(`  - ${guest.name}: email=${guest.email}, eth=${guest.ethAddress || 'none'}`);
  });
  
  await prisma.$disconnect();
}

checkDrop();