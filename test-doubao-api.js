// =============================================================================
// Doubao API 端到端测试
// 验证 .env 修改后的 API 密钥和端点配置是否正确
// =============================================================================

const { resolve } = require('path');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');

// 手动解析 .env (无需安装 dotenv)
function parseEnv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = parseEnv(resolve(__dirname, '.env'));

const API_KEY = env.VOLC_ARK_API_KEY;
const TEXT_ENDPOINT = env.VOLC_ARK_DOUBAO_PRO_ENDPOINT;
const VIDEO_ENDPOINT = env.VOLC_ARK_DOUBAO_VIDEO_ENDPOINT;
const TEXT_API_URL = env.VOLC_ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const VIDEO_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

const OUTPUT_DIR = resolve(__dirname, 'test-output');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR);

let passed = 0;
let failed = 0;
let startTime = Date.now();

function log(emoji, label, msg) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${emoji} ${label}: ${msg}`);
}

function pass(label) { passed++; log('✅', 'PASS', label); }
function fail(label, msg) { failed++; log('❌', 'FAIL', `${label} — ${msg}`); }

// =============================================================================
// 测试 1: 文本生成 API (Doubao Seed 2.0 Pro)
// =============================================================================
async function testTextGeneration() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: Doubao Seed 2.0 Pro 文本生成 (剧本模块用)');
  console.log('='.repeat(60));
  
  log('🔍', 'CONFIG', `API Key: ${API_KEY?.substring(0, 20)}...`);
  log('🔍', 'CONFIG', `Endpoint: ${TEXT_ENDPOINT}`);
  log('🔍', 'CONFIG', `API URL: ${TEXT_API_URL}`);

  if (!API_KEY) {
    fail('TEXT_CONFIG', 'API Key 未配置');
    return;
  }
  if (!TEXT_ENDPOINT) {
    fail('TEXT_CONFIG', 'Endpoint ID 未配置');
    return;
  }

  pass('TEXT_CONFIG', '配置项均已设置');

  const systemPrompt = '你是一个TikTok短视频剧本生成助手。返回严格的JSON格式，不要有任何额外文字。';
  const userPrompt = '为"无线蓝牙耳机"生成一个包含2个分镜的短剧本。JSON结构: {"script_name":"string","shots":[{"shot_index":1,"duration":3.0,"visual_description":"string","voiceover_text":"string"}]}';

  try {
    const body = JSON.stringify({
      model: TEXT_ENDPOINT,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.9,
    });

    log('📤', 'TEXT_REQ', `发送文本请求 (endpoint=${TEXT_ENDPOINT})...`);

    const response = await fetch(TEXT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body,
      signal: AbortSignal.timeout(60000),
    });

    log('📥', 'TEXT_RES', `HTTP ${response.status}`);

    if (response.status === 401 || response.status === 403) {
      const text = await response.text();
      fail('TEXT_AUTH', `认证失败 HTTP ${response.status}: ${text.substring(0, 200)}`);
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      fail('TEXT_API', `HTTP ${response.status}: ${text.substring(0, 300)}`);
      return;
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content;
      log('📝', 'TEXT_OUTPUT', `响应内容长度: ${content.length} 字符`);
      log('📝', 'TEXT_OUTPUT', `前200字符: ${content.substring(0, 200)}`);
      pass('TEXT_API', '文本生成 API 调用成功');
    } else {
      fail('TEXT_API', `响应缺少 choices: ${JSON.stringify(data).substring(0, 300)}`);
    }
  } catch (error) {
    fail('TEXT_API', `请求异常: ${error.message}`);
  }
}

// =============================================================================
// 测试 2: 视频生成 API (Doubao Seedance 1.5 Pro)
// =============================================================================
async function testVideoGeneration() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: Doubao Seedance 1.5 Pro 视频生成 (创作模块用)');
  console.log('='.repeat(60));

  const VIDEO_API_URL = `${VIDEO_API_BASE}/contents/generations/tasks`;
  
  log('🔍', 'CONFIG', `API Key: ${API_KEY?.substring(0, 20)}...`);
  log('🔍', 'CONFIG', `Endpoint: ${VIDEO_ENDPOINT}`);
  log('🔍', 'CONFIG', `API URL: ${VIDEO_API_URL}`);

  if (!VIDEO_ENDPOINT) {
    fail('VIDEO_CONFIG', 'Seedance Endpoint ID 未配置');
    return;
  }

  pass('VIDEO_CONFIG', '配置项均已设置');

  // 测试 T2V（文本生成视频）
  try {
    const taskBody = JSON.stringify({
      model: VIDEO_ENDPOINT,
      content: [
        { type: 'text', text: 'a product showcase video showing wireless earbuds on a white background, smooth camera pan, cinematic lighting' },
      ],
      resolution: '720p',
      ratio: '9:16',
      duration: 5,
    });

    log('📤', 'VIDEO_REQ', '提交 Seedance T2V 任务...');

    const taskResponse = await fetch(VIDEO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: taskBody,
      signal: AbortSignal.timeout(30000),
    });

    log('📥', 'VIDEO_RES', `HTTP ${taskResponse.status}`);

    if (taskResponse.status === 401 || taskResponse.status === 403) {
      const text = await taskResponse.text();
      fail('VIDEO_AUTH', `认证失败 HTTP ${taskResponse.status}: ${text.substring(0, 200)}`);
      return;
    }

    const taskData = await taskResponse.json();

    if (!taskResponse.ok) {
      fail('VIDEO_API', `HTTP ${taskResponse.status}: ${JSON.stringify(taskData).substring(0, 300)}`);
      return;
    }

    const taskId = taskData.id || taskData.data?.id;
    if (!taskId) {
      fail('VIDEO_API', `响应缺少 task id: ${JSON.stringify(taskData).substring(0, 300)}`);
      return;
    }

    pass('VIDEO_API', `任务创建成功 (task id: ${taskId})`);

    // 轮询任务状态
    const queryUrl = `${VIDEO_API_BASE}/contents/generations/tasks/${taskId}`;
    log('🔍', 'VIDEO_POLL', `开始轮询 Seedance 任务: ${taskId}`);

    let videoUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const queryResponse = await fetch(queryUrl, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      const queryData = await queryResponse.json();
      const status = queryData.status || queryData.data?.status || 'unknown';
      
      log('🔍', 'VIDEO_POLL', `轮询 ${i + 1}/30: status=${status}`);

      if (status === 'succeeded' || status === 'done' || status === 'completed') {
        videoUrl = queryData.content?.video_url || queryData.data?.content?.video_url || queryData.output?.video_url;
        if (videoUrl) {
          pass('VIDEO_POLL', `视频就绪: ${videoUrl.substring(0, 80)}`);
          break;
        }
        fail('VIDEO_POLL', `任务完成但无视频 URL: ${JSON.stringify(queryData).substring(0, 300)}`);
        break;
      }

      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        fail('VIDEO_POLL', `任务失败: ${queryData.error?.message || JSON.stringify(queryData).substring(0, 200)}`);
        break;
      }
    }

    if (!videoUrl) {
      fail('VIDEO_POLL', '轮询超时，任务未能在 150 秒内完成');
      return;
    }

    // 下载视频
    log('📥', 'VIDEO_DL', `下载视频: ${videoUrl.substring(0, 80)}`);
    
    try {
      const dlResponse = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
      if (!dlResponse.ok) {
        fail('VIDEO_DL', `下载失败: HTTP ${dlResponse.status}`);
        return;
      }
      
      const buffer = Buffer.from(await dlResponse.arrayBuffer());
      const outPath = resolve(OUTPUT_DIR, `seedance-t2v-${Date.now()}.mp4`);
      writeFileSync(outPath, buffer);
      
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      pass('VIDEO_DL', `视频保存: ${outPath} (${sizeMB} MB)`);
    } catch (error) {
      // 下载失败不算整体失败，视频生成本身成功了
      log('⚠️', 'VIDEO_DL', `下载异常 (非致命): ${error.message}`);
    }
  } catch (error) {
    fail('VIDEO_API', `请求异常: ${error.message}`);
  }
}

// =============================================================================
// 测试 3: I2V 图生视频 (使用测试图片)
// =============================================================================
async function testImageToVideo() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: Doubao Seedance 1.5 Pro 图生视频 (I2V)');
  console.log('='.repeat(60));

  const VIDEO_API_URL = `${VIDEO_API_BASE}/contents/generations/tasks`;

  // 使用一个公开的测试图片 URL
  const testImageUrl = 'https://picsum.photos/1080/1920'; // 竖版 9:16 测试图片

  try {
    const taskBody = JSON.stringify({
      model: VIDEO_ENDPOINT,
      content: [
        { type: 'text', text: 'product showcase video, smooth camera pan with depth of field, cinematic lighting' },
        { type: 'image_url', image_url: { url: testImageUrl }, role: 'first_frame' },
      ],
      resolution: '720p',
      ratio: 'adaptive',
      duration: 5,
    });

    log('📤', 'I2V_REQ', '提交 Seedance I2V 任务...');

    const taskResponse = await fetch(VIDEO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: taskBody,
      signal: AbortSignal.timeout(30000),
    });

    log('📥', 'I2V_RES', `HTTP ${taskResponse.status}`);

    if (taskResponse.status === 401 || taskResponse.status === 403) {
      const text = await taskResponse.text();
      fail('I2V_AUTH', `认证失败 HTTP ${taskResponse.status}: ${text.substring(0, 200)}`);
      return;
    }

    const taskData = await taskResponse.json();

    if (!taskResponse.ok) {
      fail('I2V_API', `HTTP ${taskResponse.status}: ${JSON.stringify(taskData).substring(0, 300)}`);
      return;
    }

    const taskId = taskData.id || taskData.data?.id;
    if (!taskId) {
      fail('I2V_API', `响应缺少 task id: ${JSON.stringify(taskData).substring(0, 300)}`);
      return;
    }

    pass('I2V_API', `I2V 任务创建成功 (task id: ${taskId})`);

    // 轮询
    const queryUrl = `${VIDEO_API_BASE}/contents/generations/tasks/${taskId}`;
    let videoUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const queryResponse = await fetch(queryUrl, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      const queryData = await queryResponse.json();
      const status = queryData.status || queryData.data?.status || 'unknown';
      
      log('🔍', 'I2V_POLL', `轮询 ${i + 1}/30: status=${status}`);

      if (status === 'succeeded' || status === 'done' || status === 'completed') {
        videoUrl = queryData.content?.video_url || queryData.data?.content?.video_url || queryData.output?.video_url;
        if (videoUrl) {
          pass('I2V_POLL', `I2V 视频就绪`);
          break;
        }
        fail('I2V_POLL', '任务完成但无视频 URL');
        break;
      }

      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        fail('I2V_POLL', `任务失败: ${queryData.error?.message || JSON.stringify(queryData).substring(0, 200)}`);
        break;
      }
    }

    if (!videoUrl) {
      fail('I2V_POLL', 'I2V 轮询超时');
      return;
    }

    // 下载
    try {
      const dlResponse = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
      if (!dlResponse.ok) {
        fail('I2V_DL', `下载失败: HTTP ${dlResponse.status}`);
        return;
      }
      const buffer = Buffer.from(await dlResponse.arrayBuffer());
      const outPath = resolve(OUTPUT_DIR, `seedance-i2v-${Date.now()}.mp4`);
      writeFileSync(outPath, buffer);
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      pass('I2V_DL', `视频保存: ${outPath} (${sizeMB} MB)`);
    } catch (error) {
      log('⚠️', 'I2V_DL', `下载异常 (非致命): ${error.message}`);
    }
  } catch (error) {
    fail('I2V_API', `请求异常: ${error.message}`);
  }
}

// =============================================================================
// 主函数
// =============================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Doubao API 配置验证测试                            ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Text API:  ${TEXT_ENDPOINT || 'NOT SET'}`);
  console.log(`║   Video API: ${VIDEO_ENDPOINT || 'NOT SET'}`);
  console.log(`║   API Key:   ${API_KEY ? API_KEY.substring(0, 20) + '...' : 'NOT SET'}`);
  console.log('╚══════════════════════════════════════════════════════╝');

  await testTextGeneration();
  await testVideoGeneration();
  await testImageToVideo();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`测试完成: ✅ ${passed} 通过 / ❌ ${failed} 失败 (耗时 ${totalTime}s)`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
