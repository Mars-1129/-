import fs from 'node:fs';
import http from 'node:http';

const BOUNDARY = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
const CRLF = '\r\n';

const filePath = '/assets/videos/04-scenic-landscape-5s.mp4';
const fileBuf = fs.readFileSync(filePath);
console.log('File size:', fileBuf.length, 'bytes');

// Build multipart body manually
const parts = [];

// text fields
const fields = {
  product_id: 'ee605a50-9ced-4889-af50-ecc9adb25da3',
  type: 'VIDEO',
  source_type: 'UPLOAD',
};

for (const [name, value] of Object.entries(fields)) {
  parts.push(Buffer.from(
    `--${BOUNDARY}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`
  ));
}

// file field
parts.push(Buffer.from(
  `--${BOUNDARY}${CRLF}Content-Disposition: form-data; name="file"; filename="test.mp4"${CRLF}Content-Type: video/mp4${CRLF}${CRLF}`
));
parts.push(fileBuf);
parts.push(Buffer.from(`${CRLF}--${BOUNDARY}--${CRLF}`));

const body = Buffer.concat(parts);
console.log('Total body size:', body.length, 'bytes');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/v1/materials/upload',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`,
    'Content-Length': body.length,
  },
  timeout: 120000,
};

console.log('Sending request...');
const start = Date.now();

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Elapsed:', (Date.now() - start) / 1000, 's');
    console.log('Response:', data.substring(0, 1000));
  });
});

req.on('error', (e) => {
  console.log('Elapsed:', (Date.now() - start) / 1000, 's');
  console.log('ERROR:', e.message);
});

req.on('timeout', () => {
  console.log('TIMEOUT after', (Date.now() - start) / 1000, 's');
  req.destroy();
});

req.write(body);
req.end();
