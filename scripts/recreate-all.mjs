import http from 'http';

const PORT = 3000;
const PRODUCT_ID = '5275abe4-d7d7-47d5-8f35-d5559ce44036';
const MATERIAL_ID = 'da12a806-8269-46d8-b21b-17879367eef1'; // uploaded image

function api(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = { hostname: 'localhost', port: PORT, path, method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', e => reject(e));
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== 重新创建三种模式创作任务 ===\n');

  // 1. SCRIPT_DRIVEN: generate script first
  console.log('1. SCRIPT_DRIVEN: 生成剧本...');
  const { body: sBody } = await api('POST', '/api/v1/scripts/generate/quick', {
    product_id: PRODUCT_ID,
    selling_points: ['0添加剂', '深海鱼配方', '挑嘴猫也爱吃'],
    style_vibe: 'clean-tech',
    aspect_ratio: '9:16',
    language: 'zh-CN',
    constraint_list: ['total_duration<=15s'],
  });
  
  if (sBody?.success) {
    const scriptId = sBody.data?.id || sBody.data?.script_id;
    console.log(`   剧本: ${scriptId}`);
    
    const { body: cBody } = await api('POST', '/api/v1/creations', {
      product_id: PRODUCT_ID,
      script_id: scriptId,
      engine_mode: 'SCRIPT_DRIVEN',
      prefer_ai_video: false,
    });
    if (cBody?.success) {
      console.log(`   ✅ 创建成功: ${cBody.data?.creation_id} (task: ${cBody.data?.task_id})`);
    } else {
      console.log(`   ❌ 失败: ${JSON.stringify(cBody).substring(0, 300)}`);
    }
  } else {
    console.log(`   ❌ 剧本生成失败: ${JSON.stringify(sBody).substring(0, 200)}`);
  }

  // brief delay for rate limiting
  await new Promise(r => setTimeout(r, 3000));

  // 2. IMAGE_DRIVEN
  console.log('\n2. IMAGE_DRIVEN...');
  const { body: iBody } = await api('POST', '/api/v1/creations', {
    product_id: PRODUCT_ID,
    material_id: MATERIAL_ID,
    engine_mode: 'IMAGE_DRIVEN',
    prefer_ai_video: false,
  });
  if (iBody?.success) {
    console.log(`   ✅ 创建成功: ${iBody.data?.creation_id} (task: ${iBody.data?.task_id})`);
  } else {
    console.log(`   ❌ 失败: ${JSON.stringify(iBody).substring(0, 300)}`);
  }

  await new Promise(r => setTimeout(r, 3000));

  // 3. PROMPT_DRIVEN
  console.log('\n3. PROMPT_DRIVEN...');
  const { body: pBody } = await api('POST', '/api/v1/creations', {
    product_id: PRODUCT_ID,
    engine_mode: 'PROMPT_DRIVEN',
    prefer_ai_video: false,
  });
  if (pBody?.success) {
    console.log(`   ✅ 创建成功: ${pBody.data?.creation_id} (task: ${pBody.data?.task_id})`);
  } else {
    console.log(`   ❌ 失败: ${JSON.stringify(pBody).substring(0, 300)}`);
  }

  console.log('\n=== 完成 ===');
}

main().catch(e => console.error(e));
