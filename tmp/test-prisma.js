const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
console.log('DATABASE_URL env:', process.env.DATABASE_URL);
p.$connect()
  .then(() => {
    console.log('OK - Prisma connected');
    return p.$queryRaw`SELECT 1 as test`;
  })
  .then(r => {
    console.log('Query result:', r);
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e.message);
    console.error('Error code:', e.code);
    process.exit(1);
  });