// Test internet connectivity from GPU worker
const urls = [
  'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  'https://www.google.com',
  'https://registry.npmjs.org',
];

for (const url of urls) {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    console.log('OK:', url, r.status);
  } catch (e) {
    console.log('FAIL:', url, e.message);
  }
}
