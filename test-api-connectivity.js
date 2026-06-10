const API_KEY = 'ark-0a0ae159-729d-4b5d-9c2d-a5bf04824ff5-d42e3';
const TEXT_EP = 'ep-20260514115629-vhldw';
const VIDEO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const VIDEO_MODEL = 'ep-20260514120705-pqv86';

async function testTextApi() {
  console.log('\n=== Testing Doubao-Seed-2.0-pro (Text API) ===');
  try {
    const res = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: TEXT_EP,
        messages: [{ role: 'user', content: 'Say hello in one word' }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (res.ok) {
      console.log('✅ TEXT API OK - Status:', res.status);
      console.log('   Response:', data.choices?.[0]?.message?.content || JSON.stringify(data));
    } else {
      console.log('❌ TEXT API Error - Status:', res.status);
      console.log('   Body:', JSON.stringify(data));
    }
  } catch (e) {
    console.log('❌ TEXT API Connection Error:', e.message);
  }
}

async function testVideoApi() {
  console.log('\n=== Testing Doubao-Seedance-1.5-pro (Video API) ===');
  try {
    const res = await fetch(VIDEO_API_URL + '/contents/generations/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VIDEO_MODEL,
        content: [
          { type: 'text', text: 'A simple rotating product display video' },
          { type: 'image_url', image_url: { url: 'https://ark-public.bytedance.com/example.jpg' }, role: 'first_frame' },
        ],
        resolution: '720p',
        ratio: '9:16',
        duration: 5,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    if (res.ok) {
      console.log('✅ VIDEO API OK - Task created:', data.id);
      console.log('   Full response:', JSON.stringify(data).substring(0, 300));
    } else {
      console.log('❌ VIDEO API Error - Status:', res.status);
      console.log('   Body:', JSON.stringify(data));
    }
  } catch (e) {
    console.log('❌ VIDEO API Connection Error:', e.message);
  }
}

async function main() {
  console.log('=== TikStream API Connectivity Test ===');
  console.log('API Key:', API_KEY.substring(0, 12) + '...');
  console.log('Text EP:', TEXT_EP);
  console.log('Video Model:', VIDEO_MODEL);

  await testTextApi();
  await testVideoApi();

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
