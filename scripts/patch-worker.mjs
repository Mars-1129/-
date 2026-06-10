import fs from 'fs';

const p = '/workspace/workers/remotion-render-worker/dist/index.js';
let code = fs.readFileSync(p, 'utf8');

const oldHeaders = "headers: { 'Content-Type': 'application/json' },";
const newHeaders = "headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_TOKEN || 'tikstream-internal-dev-token' },";
code = code.replace(oldHeaders, newHeaders);

fs.writeFileSync(p, code);
console.log('Patched postCallback with x-internal-token header');
