require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateDrop() {
  const result = await prisma.drop.update({
    where: { id: 'cmeoqvpmt0002jp04jdhkg7w2' },
    data: { deliveryTarget: 'email' }
  });
  console.log('Drop updated to email delivery');
  await prisma.$disconnect();
}

updateDrop();