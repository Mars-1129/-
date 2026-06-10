// Diagnose failing E2E endpoints
const BASE = 'http://localhost:3000';

async function getFirst(field) {
  const r = await fetch(BASE + field.url);
  const d = await r.json();
  const item = d?.data?.items?.[0];
  return { item, raw: d };
}

async function main() {
  // Get product
  const prodR = await fetch(BASE + '/api/v1/products?page=1&page_size=1');
  const prodD = await prodR.json();
  const product = prodD?.data?.items?.[0];
  if (!product) { console.log('No product!'); return; }
  const pid = product.id;
  console.log('Product:', pid, product.title);

  // Get viral - check actual API field names
  console.log('\n--- Viral API Response ---');
  const vr = await fetch(BASE + '/api/v1/viral-video-analyses?page=1&page_size=1');
  const vd = await vr.json();
  console.log('Status:', vr.status);
  const vItem = vd?.data?.items?.[0];
  if (vItem) {
    console.log('Keys:', Object.keys(vItem));
    console.log('analysis_id:', vItem.analysis_id);
    console.log('id:', vItem.id);
  }

  // Get template - check API field names
  console.log('\n--- Template API Response ---');
  const tr = await fetch(BASE + '/api/v1/templates?page=1&page_size=1');
  const td = await tr.json();
  console.log('Status:', tr.status);
  const tItem = td?.data?.items?.[0];
  if (tItem) {
    console.log('Keys:', Object.keys(tItem));
    console.log('template_id:', tItem.template_id);
    console.log('id:', tItem.id);
  }

  // Test viral-rewrite with correct field name
  if (vItem) {
    const vId = vItem.analysis_id || vItem.id;
    console.log('\n--- Test Viral Rewrite (viral_video_id) ---');
    const body = {
      product_id: pid,
      viral_video_id: vId,
      selling_points: product.selling_points || [product.title],
      style_vibe: 'emotional',
      aspect_ratio: '9:16',
      language: 'zh-CN',
    };
    console.log('Body:', JSON.stringify(body));
    const rr = await fetch(BASE + '/api/v1/scripts/generate/viral-rewrite', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const rd = await rr.json();
    console.log('Status:', rr.status);
    console.log('Response:', JSON.stringify(rd).substring(0, 400));
  }

  // Test template
  if (tItem) {
    const tId = tItem.template_id || tItem.id;
    console.log('\n--- Test Template (template_id) ---');
    const body = {
      product_id: pid,
      template_id: tId,
      selling_points: product.selling_points || [product.title],
      style_vibe: 'cinematic',
      aspect_ratio: '9:16',
      language: 'zh-CN',
    };
    console.log('Body:', JSON.stringify(body));
    const rr = await fetch(BASE + '/api/v1/scripts/generate/template', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const rd = await rr.json();
    console.log('Status:', rr.status);
    console.log('Response:', JSON.stringify(rd).substring(0, 400));
  }

  // Test batch with correct DTO
  console.log('\n--- Test Batch (batch_size + style_variations) ---');
  const bBody = {
    product_id: pid,
    batch_size: 2,
    style_variations: ['tech-minimal', 'warm-life'],
    selling_points: product.selling_points || [product.title],
    aspect_ratio: '9:16',
    language: 'zh-CN',
    max_concurrency: 1,
  };
  console.log('Body:', JSON.stringify(bBody));
  const br = await fetch(BASE + '/api/v1/scripts/generate/batch', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(bBody),
  });
  const bd = await br.json();
  console.log('Status:', br.status);
  console.log('Response:', JSON.stringify(bd).substring(0, 400));
}

main().catch(e => console.error(e));
