const API_KEY = 'ark-0a0ae159-729d-4b5d-9c2d-a5bf04824ff5-d42e3';
const VIDEO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3';

async function testModel(model) {
  console.log(`\n--- Testing model: "${model}" ---`);
  try {
    const res = await fetch(VIDEO_API_URL + '/contents/generations/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
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
    console.log('Status:', res.status);
    if (res.ok) {
      console.log('✅ SUCCESS - Task:', data.id);
      console.log('Full:', JSON.stringify(data).substring(0, 400));
    } else {
      console.log('❌ Error:', JSON.stringify(data));
    }
  } catch (e) {
    console.log('❌ Connection error:', e.message);
  }
}

async function main() {
  console.log('=== Testing Video API with different model names ===');

  await testModel('doubao-seedance-1-5-pro');
  await testModel('doubao-seedance-1.5-pro');
  await testModel('ep-20260514120705-pqv86');
  await testModel('seedance-1.5-pro');
  await testModel('doubao-seedance');

  console.log('\n=== Done ===');
}

main().catch(console.error);
