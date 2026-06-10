const http = require('http');
console.log("Starting vision-analyze at", new Date().toISOString());
const start = Date.now();
const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/v1/materials/397db83d-6271-4204-a512-7536d3ec4a7b/vision-analyze',
  method: 'POST',
  timeout: 60000
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    console.log("Elapsed:", Date.now()-start, "ms");
    console.log("Body:", data.substring(0, 3000));
  });
});
req.on('timeout', () => { console.log("TIMEOUT after", Date.now()-start, "ms"); req.destroy(); });
req.on('error', e => { console.error("Error:", e.message, 'after', Date.now()-start, 'ms'); });
req.end();
