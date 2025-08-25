require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateDrop() {
  const dropId = 'cmeoqvpmt0002jp04jdhkg7w2';
  
  // Get drop with guests and deliveries
  const drop = await prisma.drop.findUnique({
    where: { id: dropId },
    include: {
      lumaGuests: { where: { checkedInAt: { not: null } } },
      lumaDeliveries: true
    }
  });
  
  console.log('Drop:', drop.id);
  console.log('Checked-in guests:', drop.lumaGuests.length);
  console.log('Deliveries:', drop.lumaDeliveries.length);
  console.log('Currently marked as delivered:', drop.poapsDelivered);
  
  // Check if all checked-in guests have deliveries
  const allDelivered = drop.lumaGuests.every(guest => 
    drop.lumaDeliveries.some(delivery => delivery.guestId === guest.guestId)
  );
  
  console.log('All guests have POAPs:', allDelivered);
  
  if (allDelivered && !drop.poapsDelivered) {
    const updated = await prisma.drop.update({
      where: { id: dropId },
      data: {
        poapsDelivered: true,
        deliveredAt: new Date()
      }
    });
    console.log('Drop marked as delivered!');
    console.log('Updated at:', updated.deliveredAt);
  } else if (drop.poapsDelivered) {
    console.log('Drop already marked as delivered');
  } else {
    console.log('Not all guests have POAPs yet');
  }
  
  await prisma.$disconnect();
}

updateDrop();