var fs = require('fs');
var p = '/workspace/workers/remotion-render-worker/dist/index.js';
var c = fs.readFileSync(p, 'utf8');
c = c.replace(
  "headers: { 'Content-Type': 'application/json' },",
  "headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_TOKEN || 'tikstream-internal-dev-token' },"
);
fs.writeFileSync(p, c);
console.log('OK');
