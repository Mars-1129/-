const BASE = 'http://localhost:3000';

async function main() {
  // Check products
  const pRes = await fetch(`${BASE}/api/v1/products?page=1&page_size=1`);
  const pBody = await pRes.json();
  const product = pBody.data?.items?.[0];
  console.log('Product:', product?.id, product?.title);

  // Check scripts
  const sRes = await fetch(`${BASE}/api/v1/scripts?page=1&page_size=10`);
  const sBody = await sRes.json();
  const scripts = sBody.data?.items || [];
  console.log('Scripts count:', scripts.length);
  scripts.forEach(s => console.log('  Script:', s.id, '"' + (s.title || '').slice(0, 50) + '"', (s.shots?.length || 0) + ' shots'));

  // Try script generation
  if (product) {
    console.log('\nTrying script generation...');
    try {
      const genRes = await fetch(`${BASE}/api/v1/scripts/generate/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          selling_points: ['AI自动生成短视频'],
          style_vibe: 'clean-tech',
          aspect_ratio: '9:16',
          language: 'zh-CN',
          constraint_list: ['total_duration<=15s'],
        }),
        signal: AbortSignal.timeout(120000),
      });
      const genBody = await genRes.json();
      console.log('Generation result:', genBody.success ? 'SUCCESS' : 'FAILED', genBody.error || genBody.message || '');
      if (genBody.success) {
        const script = genBody.data;
        console.log('  Script ID:', script.id || script.script_id);
        console.log('  Shots:', (script.shots || []).length);
      }
    } catch (e) {
      console.log('Generation error:', e.message);
    }
  }
}

main().catch(e => console.error('Fatal:', e.message));
