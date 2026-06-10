async function testCorrectEndpoint() {
  const apiKey = 'ark-0a0ae159-729d-4b5d-9c2d-a5bf04824ff5-d42e3';
  const model = 'ep-20260514120705-pqv86';

  // Step 1: Create video generation task
  console.log('=== Step 1: 创建视频生成任务 ===');
  const createResp = await fetch('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      content: [
        { type: 'text', text: 'A beautiful sunset over calm ocean water, cinematic, 4K' },
      ],
      resolution: '720p',
      ratio: '9:16',
      duration: 5,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const createBody = await createResp.text();
  console.log(`HTTP ${createResp.status}: ${createBody.substring(0, 500)}`);

  if (createResp.status !== 200) {
    console.log('❌ 创建任务失败');
    return;
  }

  const task = JSON.parse(createBody);
  const taskId = task.id;
  console.log(`✅ 任务已创建, ID: ${taskId}`);

  // Step 2: Poll for completion
  console.log('\n=== Step 2: 轮询任务状态 ===');
  const url = `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`;
  for (let i = 0; i < 30; i++) {
    const pollResp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const pollBody = await pollResp.text();
    const poll = JSON.parse(pollBody);

    if (poll.status === 'succeeded') {
      console.log(`✅ 视频生成成功！`);
      console.log(`Video URL: ${poll.content?.video_url || 'N/A'}`);
      return;
    } else if (poll.status === 'failed') {
      console.log(`❌ 视频生成失败: ${JSON.stringify(poll.error)}`);
      return;
    }
    console.log(`  [${i + 1}/30] 状态: ${poll.status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log('⚠️ 轮询超时，任务可能仍在处理中');
}

testCorrectEndpoint();
