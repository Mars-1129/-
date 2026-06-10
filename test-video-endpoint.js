const API_KEY = 'ark-66e44436-5c88-43b1-a423-d368d2cbf8d0-d3254';
const ENDPOINT_ID = 'ep-20260602181637-4xnfv';
const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

async function checkTask(taskId, label) {
  console.log(`\n检查任务: ${taskId} (${label})`);
  const res = await fetch(`${BASE_URL}/contents/generations/tasks/${taskId}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  console.log(`状态: ${data.status}`);
  if (data.status === 'succeeded') {
    console.log(`Video URL: ${data.content?.video_url || 'N/A'}`);
    return true;
  }
  if (data.status === 'failed') {
    console.log(`失败: ${JSON.stringify(data.error || data).substring(0, 500)}`);
    return false;
  }
  return data.status;
}

async function createTask(body, label) {
  console.log(`\n创建任务: ${label}`);
  const res = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  console.log(`HTTP ${res.status}`);
  if (res.ok && data.id) {
    console.log(`任务ID: ${data.id}`);
    return data.id;
  }
  console.log(`响应: ${JSON.stringify(data).substring(0, 500)}`);
  return null;
}

async function pollUntilDone(taskId, label, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const res = await fetch(`${BASE_URL}/contents/generations/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      const elapsed = ((i + 1) * 10);
      console.log(`  [${elapsed}s] ${data.status}`);
      if (data.status === 'succeeded') {
        console.log(` Video URL: ${data.content?.video_url || 'N/A'}`);
        return data;
      }
      if (data.status === 'failed') {
        console.log(` 错误: ${JSON.stringify(data.error || data).substring(0, 300)}`);
        return data;
      }
    } catch (e) {
      console.log(`  轮询错误: ${e.message}, 重试...`);
    }
  }
  return null;
}

async function main() {
  console.log('火山引擎 Seedance 视频生成 API 测试');
  console.log(`接入点: ${ENDPOINT_ID}`);
  console.log(`API Key: ${API_KEY.substring(0, 20)}...\n`);

  // === 测试1: 文字生成视频 ===
  console.log('══════ 测试1: 文字生成视频 (Text-to-Video) ══════');

  const t2vTaskId = await createTask({
    model: ENDPOINT_ID,
    content: [
      { type: 'text', text: '一只可爱的橘猫在阳光明媚的窗台上伸懒腰，毛发在阳光下闪闪发光，温馨治愈的画面' },
    ],
    resolution: '720p',
    ratio: '9:16',
    duration: 4,
  }, '文字生成视频');

  if (t2vTaskId) {
    const t2vResult = await pollUntilDone(t2vTaskId, '文字生成视频', 20);
    if (t2vResult?.status === 'succeeded') {
      console.log('\n文字生成视频: ✅ 支持！');
    } else if (t2vResult?.status === 'failed') {
      console.log('\n文字生成视频: ❌ 失败，可能该接入点不支持T2V');
    } else {
      console.log('\n文字生成视频: ⏳ 仍在处理中');
    }
  } else {
    console.log('\n文字生成视频: ❌ 创建任务失败，可能该接入点不支持T2V');
  }

  // === 测试2: 图生视频 ===
  console.log('\n══════ 测试2: 图生视频 (Image-to-Video) ══════');

  const i2vTaskId = await createTask({
    model: ENDPOINT_ID,
    content: [
      { type: 'text', text: '产品缓缓旋转展示，灯光优雅扫过产品表面，科技感十足，专业电商风格' },
      { type: 'image_url', image_url: { url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&h=1920&fit=crop' }, role: 'first_frame' },
    ],
    resolution: '720p',
    ratio: '9:16',
    duration: 4,
  }, '图生视频(首帧)');

  if (i2vTaskId) {
    const i2vResult = await pollUntilDone(i2vTaskId, '图生视频', 20);
    if (i2vResult?.status === 'succeeded') {
      console.log('\n图生视频: ✅ 支持！');
    } else if (i2vResult?.status === 'failed') {
      console.log('\n图生视频: ❌ 失败');
    } else {
      console.log('\n图生视频: ⏳ 仍在处理中');
    }
  } else {
    console.log('\n图生视频: ❌ 创建任务失败，可能该接入点不支持I2V');
  }

  console.log('\n══════ 测试完成 ══════');
}

main().catch(e => console.error('FATAL:', e.message));
