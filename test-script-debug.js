const http = require('http');

const data = JSON.stringify({
  title: 'test',
  product_id: 'ee605a50-9ced-4889-af50-ecc9adb25da3',
  language: 'zh-CN',
  selling_points: ['便携'],
  style_vibe: '科技',
  aspect_ratio: '9:16',
});

const startTime = Date.now();
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/scripts/generate/quick',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
  timeout: 120000,
}, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`HTTP ${res.statusCode} (${elapsed}s)`);
    
    if (body.length > 0) {
      try {
        const json = JSON.parse(body);
        console.log('title:', json.title || json.script_name || '(none)');
        console.log('shots:', (json.shots || []).length);
        console.log('video_duration:', json.video_duration);
        if (json.error) console.log('error:', json.error);
      } catch (e) {
        console.log('RAW:', body.substring(0, 500));
      }
    } else {
      console.log('(empty body)');
    }
  });
});

req.on('error', e => console.error('NETWORK ERROR:', e.message));
req.on('timeout', () => { console.error('TIMEOUT (120s)'); req.destroy(); });
req.write(data);
req.end();
