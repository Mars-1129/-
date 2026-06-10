const API_KEY = 'ark-0a0ae159-729d-4b5d-9c2d-a5bf04824ff5-d42e3';
const VIDEO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const MODEL = 'ep-20260514120705-pqv86';

const testImages = [
  'https://picsum.photos/1080/1920',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&h=1920&fit=crop',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/A_white_flower.jpg/480px-A_white_flower.jpg',
];

async function testWithImage(imageUrl, label) {
  console.log(`\n--- Testing with image: ${label} ---`);
  try {
    const res = await fetch(VIDEO_API_URL + '/contents/generations/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        content: [
          { type: 'text', text: 'A product display video with smooth rotation' },
          { type: 'image_url', image_url: { url: imageUrl }, role: 'first_frame' },
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
      console.log('✅ VIDEO API OK - Task:', data.id);
      console.log('Full:', JSON.stringify(data).substring(0, 400));
      return data.id;
    } else {
      console.log('❌ Error:', JSON.stringify(data));
    }
  } catch (e) {
    console.log('❌ Connection error:', e.message);
  }
  return null;
}

async function main() {
  console.log('=== Testing Video API with real images ===');
  console.log('Model:', MODEL);

  for (const [i, img] of testImages.entries()) {
    const taskId = await testWithImage(img, `Image ${i+1}`);
    if (taskId) {
      console.log('\n=== SUCCESS! Task ID:', taskId, '===');
      break;
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
