import http from 'http';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'localhost';
const PORT = 3000;
const PRODUCT_ID = '5275abe4-d7d7-47d5-8f35-d5559ce44036';

function api(method, path_, data = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    let body;
    let headers = { ...extraHeaders };
    if (data instanceof Buffer) {
      body = data;
      headers['Content-Length'] = Buffer.byteLength(body);
    } else if (data) {
      body = JSON.stringify(data);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const opts = { hostname: BASE, port: PORT, path: path_, method, headers };
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

function buildMultipartBody(fields, fileName, fileBuffer, mimeType = 'image/jpeg') {
  const boundary = `----FormBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  const CRLF = '\r\n';
  let body = '';
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}`;
    body += `${value}${CRLF}`;
  }
  body += `--${boundary}${CRLF}`;
  body += `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}`;
  body += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const head = Buffer.from(body, 'utf8');
  const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
  return { body: Buffer.concat([head, fileBuffer, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function main() {
  console.log('=== IMAGE_DRIVEN 完整测试 ===\n');

  // 上传demo图片
  const imgPath = 'd:\\字节\\assets\\demo\\ecom-product-earbuds.jpg';
  console.log('1. 上传图片素材...');
  const buffer = fs.readFileSync(imgPath);
  const { body: mpBody, contentType } = buildMultipartBody(
    { product_id: PRODUCT_ID, type: 'IMAGE', source_type: 'UPLOAD' },
    'ecom-product-earbuds.jpg', buffer, 'image/jpeg'
  );
  const { body: upBody } = await api('POST', '/api/v1/materials/upload', mpBody, { 'Content-Type': contentType });
  console.log('   Upload response keys:', Object.keys(upBody).join(', '));
  
  // 等待素材处理
  console.log('   等待素材处理...');
  await new Promise(r => setTimeout(r, 8000));

  // 查找刚上传的素材
  console.log('\n2. 搜索IMAGE素材...');
  const { body: mBody } = await api('GET', `/api/v1/materials?product_id=${PRODUCT_ID}&type=IMAGE&page=1&page_size=5`);
  const images = mBody?.data?.items || mBody?.data?.data || [];
  console.log(`   找到 ${images.length} 个IMAGE素材`);
  
  if (images.length > 0) {
    for (const img of images.slice(0, 3)) {
      console.log(`     id: ${img.id || img.material_id}, status: ${img.status || img.processing_status}, type: ${img.type || img.material_type}`);
    }
    const materialId = images[0].id || images[0].material_id;
    
    console.log('\n3. 测试 IMAGE_DRIVEN 创建...');
    const { body: cBody } = await api('POST', '/api/v1/creations', {
      product_id: PRODUCT_ID,
      material_id: materialId,
      engine_mode: 'IMAGE_DRIVEN',
      prefer_ai_video: false,
    });
    
    if (cBody?.success) {
      console.log(`   IMAGE_DRIVEN创建成功! creation_id: ${cBody.data?.creation_id}`);
      console.log(`   task_id: ${cBody.data?.task_id}`);
      
      // 监控进度
      console.log('\n4. 监控创作进度(最多3分钟)...');
      const cid = cBody.data.creation_id;
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const { body: stBody } = await api('GET', `/api/v1/creations/${cid}`);
        const d = stBody?.data || stBody;
        console.log(`   status=${d.status}, stage=${d.current_stage}, progress=${d.progress}%`);
        if (d.status === 'FINISHED') {
          console.log('   ✅ IMAGE_DRIVEN 视频生成完成!');
          console.log(`   video_url: ${d.video_url}`);
          break;
        }
        if (d.status === 'FAILED') {
          console.log(`   ❌ 失败: ${d.error_message || d.error}`);
          break;
        }
        await new Promise(r => setTimeout(r, 10000));
      }
    } else {
      console.log(`   IMAGE_DRIVEN创建失败: ${JSON.stringify(cBody).substring(0, 500)}`);
    }
  } else {
    console.log('   仍然无IMAGE素材，可能上传未完成或类型不对');
  }
  
  console.log('\n=== 完成 ===');
}

main().catch(e => console.error('Error:', e));
