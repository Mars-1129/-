import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const product = await p.product.findFirst();
  console.log('Product:', JSON.stringify({ id: product?.id, title: product?.title }));

  const template = await p.template.findFirst();
  console.log('Template:', JSON.stringify({ id: template?.id, name: template?.name, status: template?.status }));

  const viral = await p.viralVideoAnalysis.findFirst();
  console.log('Viral:', JSON.stringify({ id: viral?.id, title: viral?.title, hookType: viral?.hookType }));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
