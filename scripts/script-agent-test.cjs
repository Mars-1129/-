const BASE = 'http://127.0.0.1:3000';

async function testScriptQuick() {
  console.log('=== TEST: Script Quick Generate ===');
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/v1/scripts/generate/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: '5275abe4-d7d7-47d5-8f35-d5559ce44036',
        selling_points: ['0添加剂', '深海鱼配方', '挑嘴猫也爱吃', '12罐装超值'],
        style_vibe: 'pet-friendly',
        aspect_ratio: '9:16',
        title: '猫罐头推广脚本',
        target_audience: '养猫人群',
        language: 'zh-CN'
      }),
      signal: AbortSignal.timeout(60000)
    });
    const body = await res.text();
    console.log('Status:', res.status, 'Elapsed:', Date.now()-start, 'ms');
    console.log('Response:', body.substring(0, 2000));
    if (res.status === 200) {
      const data = JSON.parse(body);
      if (data.success) console.log('SCRIPT GENERATION SUCCESS');
      else console.log('SCRIPT GENERATION FAILED:', data.message);
    }
  } catch(e) {
    console.error('Error:', e.message, 'Elapsed:', Date.now()-start, 'ms');
  }
}

async function testAgentGenerate() {
  console.log('\n=== TEST: Agent Generate ===');
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/v1/agent/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: '5275abe4-d7d7-47d5-8f35-d5559ce44036',
        style_vibe: 'pet-friendly',
        aspect_ratio: '9:16',
        language: 'zh-CN'
      }),
      signal: AbortSignal.timeout(180000)
    });
    const body = await res.text();
    console.log('Status:', res.status, 'Elapsed:', Date.now()-start, 'ms');
    console.log('Response:', body.substring(0, 3000));
    if (res.status === 200) {
      const data = JSON.parse(body);
      if (data.success) console.log('AGENT GENERATION SUCCESS, status:', data.data?.status);
      else console.log('AGENT GENERATION FAILED:', data.message);
    }
  } catch(e) {
    console.error('Error:', e.message, 'Elapsed:', Date.now()-start, 'ms');
  }
}

// Run tests sequentially
(async () => {
  await testScriptQuick();
  await testAgentGenerate();
  console.log('\n=== All tests completed ===');
})();
