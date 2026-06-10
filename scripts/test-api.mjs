// Quick API connectivity test
const url = 'https://api.siliconflow.cn/v1/chat/completions';
const key = 'sk-pencaimaptytbfxwgxhsysgrurvofgreblvgbcaxqtyfwxki';

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages: [{ role: 'user', content: 'Say hi' }],
      max_tokens: 10,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data).substring(0, 300));
} catch (e) {
  console.error('Error:', e.message);
  console.error('Cause:', e.cause);
}
