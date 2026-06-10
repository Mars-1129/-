import fs from 'node:fs';
const buf = fs.readFileSync('/assets/videos/04-scenic-landscape-5s.mp4');
console.log('Size:', buf.length, 'bytes');
const fd = new FormData();
fd.append('file', new File([buf], 'test.mp4', { type: 'video/mp4' }));
fd.append('product_id', 'ee605a50-9ced-4889-af50-ecc9adb25da3');
fd.append('type', 'VIDEO');
fd.append('source_type', 'UPLOAD');
console.log('Created FormData, sending...');
const start = Date.now();
try {
  const r = await fetch('http://127.0.0.1:3000/api/v1/materials/upload', {
    method: 'POST',
    body: fd,
    signal: AbortSignal.timeout(120000),
  });
  console.log('Status:', r.status);
  const text = await r.text();
  console.log('Elapsed:', (Date.now()-start)/1000, 's');
  console.log('Response:', text.substring(0, 500));
} catch(e) {
  console.log('Elapsed:', (Date.now()-start)/1000, 's');
  console.log('ERROR:', e.name, e.message);
}
