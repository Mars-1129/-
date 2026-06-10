import http from 'http';

const data = JSON.stringify({
  product_id: '5275abe4-d7d7-47d5-8f35-d5559ce44036',
  engine_mode: 'PROMPT_DRIVEN'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/creations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
