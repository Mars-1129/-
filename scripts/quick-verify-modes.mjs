import http from 'http';

const BASE = 'localhost';
const PORT = 3000;

function api(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: BASE, port: PORT, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
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
  console.log('=== 快速验证三种创作模式创建API ===\n');

  // 1. 获取商品
  console.log('1. 获取种子商品...');
  const { body: pBody } = await api('GET', '/api/v1/products?page=1&page_size=1');
  const product = pBody?.data?.items?.[0];
  if (!product) { console.error('无商品数据'); return; }
  console.log(`   商品: ${product.title} (${product.id})`);

  // 2. 测试 SCRIPT_DRIVEN
  console.log('\n2. 测试 SCRIPT_DRIVEN...');
  // 先用quick生成script
  const { body: sBody } = await api('POST', '/api/v1/scripts/generate/quick', {
    product_id: product.id,
    selling_points: product.selling_points || [product.title],
    style_vibe: 'clean-tech',
    aspect_ratio: '9:16',
    language: 'zh-CN',
    constraint_list: ['total_duration<=15s'],
  });
  if (sBody?.success) {
    const scriptId = sBody.data?.id || sBody.data?.script_id;
    console.log(`   剧本生成成功: ${scriptId}`);
    
    const { body: cBody } = await api('POST', '/api/v1/creations', {
      product_id: product.id,
      script_id: scriptId,
      engine_mode: 'SCRIPT_DRIVEN',
      prefer_ai_video: false,
    });
    if (cBody?.success) {
      console.log(`   SCRIPT_DRIVEN创建成功: ${cBody.data?.creation_id}`);
    } else {
      console.log(`   SCRIPT_DRIVEN创建失败: ${JSON.stringify(cBody).substring(0, 300)}`);
    }
  } else {
    console.log(`   剧本生成失败: ${JSON.stringify(sBody).substring(0, 200)}`);
  }

  // 3. 测试 IMAGE_DRIVEN
  console.log('\n3. 测试 IMAGE_DRIVEN...');
  // 搜索已有图片素材
  const { body: mBody } = await api('GET', `/api/v1/materials?product_id=${product.id}&type=IMAGE&page=1&page_size=3`);
  const images = mBody?.data?.items || mBody?.data?.data || [];
  if (images.length > 0) {
    const materialId = images[0].id || images[0].material_id;
    console.log(`   找到素材: ${materialId}`);
    const { body: cBody } = await api('POST', '/api/v1/creations', {
      product_id: product.id,
      material_id: materialId,
      engine_mode: 'IMAGE_DRIVEN',
      prefer_ai_video: false,
    });
    if (cBody?.success) {
      console.log(`   IMAGE_DRIVEN创建成功: ${cBody.data?.creation_id}`);
    } else {
      console.log(`   IMAGE_DRIVEN创建失败: ${JSON.stringify(cBody).substring(0, 300)}`);
    }
  } else {
    console.log('   无可用图片素材，跳过');
  }

  // 4. 测试 PROMPT_DRIVEN
  console.log('\n4. 测试 PROMPT_DRIVEN...');
  const { body: cBody } = await api('POST', '/api/v1/creations', {
    product_id: product.id,
    engine_mode: 'PROMPT_DRIVEN',
    prefer_ai_video: false,
  });
  if (cBody?.success) {
    console.log(`   PROMPT_DRIVEN创建成功: ${cBody.data?.creation_id}`);
  } else {
    console.log(`   PROMPT_DRIVEN创建失败: ${JSON.stringify(cBody).substring(0, 300)}`);
  }

  console.log('\n=== 验证完成 ===');
}

main().catch(e => console.error(e));
