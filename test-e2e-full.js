const fs = require('fs');
const path = require('path');

const API_KEY = 'ark-973d982f-14a0-467b-822f-94292c1184bc-4f013';
const TEXT_EP = 'ep-20260514115629-vhldw';
const VIDEO_EP = 'ep-20260514120705-pqv86';
const TEXT_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const VIDEO_TASK_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

const OUTPUT_DIR = path.join(__dirname, 'e2e_test_output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const PRODUCT = {
  name: '智能无线卷发棒 Pro',
  selling_points: ['3档智能控温不伤发', '10分钟快充续航全天', '便携无线随行随用', '防烫设计安全可靠'],
  target_audience: '北美年轻女性,25-35岁,追求高效造型',
  style_vibe: 'clean-tech',
  aspect_ratio: '9:16',
  language: 'zh-CN',
};

const SCRIPT_CONSTANTS = { MAX_VIDEO_DURATION_SECONDS: 15, MIN_SHOT_DURATION_SECONDS: 1.5, MAX_SHOT_DURATION_SECONDS: 5, MIN_SHOTS_COUNT: 4, MAX_SHOTS_COUNT: 6 };

function buildQuickPrompt() {
  const system = [
    '你是一名专业的 TikTok Shop 短视频脚本创作专家。',
    `输出语言: ${PRODUCT.language}。画面比例: ${PRODUCT.aspect_ratio}。`,
    '你必须严格按照以下 JSON Schema 格式输出脚本:',
    '{',
    '  "title": "脚本标题",',
    '  "video_duration": 14.5,',
    '  "style_vibe": "风格描述",',
    '  "shots": [{',
    '      "shot_index": 1,',
    '      "duration": 3.0,',
    '      "scene_description_query": "英文搜索查询词",',
    '      "visual_description": "中文视觉描述",',
    '      "camera_movement": "Static/Dolly_In_Fast/Dolly_Out/Pan_Left/Tilt_Up",',
    '      "transition_type": "None/Fade_In/Dissolve/Wipe",',
    '      "voiceover_text": "旁白文字",',
    '      "subtitle_text": "字幕文字",',
    '      "safe_zone_bounding_box": [0.1, 0.7, 0.9, 0.9]',
    '  }]',
    '}',
    `规则: 总时长≤${SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS}s, 分镜${SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS}-${SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS}s, ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT}-${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT}个分镜, 禁止绝对化用语, 输出纯JSON`,
  ].join('\n');
  const user = `商品名称: ${PRODUCT.name}\n商品卖点: ${PRODUCT.selling_points.join('; ')}\n风格氛围: ${PRODUCT.style_vibe}\n目标受众: ${PRODUCT.target_audience}\n生成 ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT}-${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT} 个分镜。输出 ONLY valid JSON。`;
  return { system, user };
}

function buildViralRewritePrompt() {
  const system = [
    '你是一名专业的 TikTok Shop 爆款短视频脚本改写专家。参考爆款视频策略为商品生成TikTok分镜脚本。',
    `输出语言: ${PRODUCT.language}。画面比例: ${PRODUCT.aspect_ratio}。`,
    '爆款视频核心策略: 强情感共鸣+前后对比钩子, 3秒抓注意力, 中间展示核心功能, 结尾行动号召, 热门BGM+ASMR产品音效, 近景产品特写+使用场景快切, 问题→解决方案→产品展示→效果对比',
    '你必须严格按照JSON Schema输出:',
    '{"title":"","video_duration":14.5,"style_vibe":"","shots":[{"shot_index":1,"duration":3,"scene_description_query":"","visual_description":"","camera_movement":"","transition_type":"","voiceover_text":"","subtitle_text":"","safe_zone_bounding_box":[0.1,0.7,0.9,0.9]}]}',
    `规则: 总时长≤${SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS}s, 分镜${SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS}-${SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS}s, ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT}-${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT}个, 模仿爆款结构节奏, 输出纯JSON`,
  ].join('\n');
  const user = `商品: ${PRODUCT.name}\n卖点: ${PRODUCT.selling_points.join('; ')}\n风格: ${PRODUCT.style_vibe}\n受众: ${PRODUCT.target_audience}\n请基于爆款策略改写适合该商品的爆款短视频脚本。输出ONLY valid JSON。`;
  return { system, user };
}

function buildTemplatePrompt() {
  const system = [
    '你是TikTok Shop短视频脚本创作专家。基于创作模板为商品生成分镜脚本。',
    `输出语言: ${PRODUCT.language}。画面比例: ${PRODUCT.aspect_ratio}。`,
    '模板策略: 快节奏产品测评 - 3-5个分镜快速展示核心卖点, 节奏紧凑, 适合电商信息流广告。模板因子: pacing=fast, shot_count=4-5, transition=dynamic, voice=enthusiastic, cta=last_2s',
    '必须按JSON Schema输出:',
    '{"title":"","video_duration":14.5,"style_vibe":"","shots":[{"shot_index":1,"duration":3,"scene_description_query":"","visual_description":"","camera_movement":"","transition_type":"","voiceover_text":"","subtitle_text":"","safe_zone_bounding_box":[0.1,0.7,0.9,0.9]}]}',
    `规则: 总时长≤${SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS}s, 分镜${SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS}-${SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS}s, ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT}-${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT}个, 严格按模板策略设计节奏, 输出纯JSON`,
  ].join('\n');
  const user = `商品: ${PRODUCT.name}\n卖点: ${PRODUCT.selling_points.join('; ')}\n风格: ${PRODUCT.style_vibe}\n受众: ${PRODUCT.target_audience}\n按模板策略生成快节奏测评风格脚本。输出ONLY valid JSON。`;
  return { system, user };
}

async function callTextAPI(systemPrompt, userPrompt, mode) {
  console.log(`  🧠 调用 Doubao Seed 2.0 Pro...`);
  const res = await fetch(TEXT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TEXT_EP, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 2048, temperature: 0.7, top_p: 0.9 }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json();
  if (!res.ok) { console.log(`  ❌ HTTP ${res.status}: ${JSON.stringify(data).substring(0, 200)}`); return null; }
  let content = data.choices?.[0]?.message?.content;
  if (!content) { console.log(`  ❌ 无内容`); return null; }
  let cleaned = content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { console.log(`  ❌ JSON解析失败: ${content.substring(0, 150)}`); return null; }
}

async function createVideoTask(prompt, isI2V) {
  const content = [];
  if (isI2V) content.push({ type: 'image_url', image_url: { url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1080&h=1920&fit=crop' }, role: 'first_frame' });
  content.push({ type: 'text', text: prompt });
  const res = await fetch(VIDEO_TASK_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: VIDEO_EP, content, resolution: '720p', ratio: '9:16', duration: 4 }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (res.ok && data.id) return data.id;
  console.log(`    ❌ 创建失败: ${JSON.stringify(data).substring(0, 200)}`);
  return null;
}

async function pollAndDownload(taskId, label, savePath) {
  const pollUrl = `${VIDEO_TASK_URL}/${taskId}`;
  const start = Date.now();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 10000));
    let data;
    try {
      const res = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${API_KEY}` }, signal: AbortSignal.timeout(15000) });
      data = await res.json();
    } catch (e) { console.log(`    ⚠️ 轮询错误, 重试...`); continue; }
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (data.status === 'succeeded' && data.content?.video_url) {
      console.log(`    ✅ [${elapsed}s] 下载中...`);
      try {
        const videoRes = await fetch(data.content.video_url, { signal: AbortSignal.timeout(60000) });
        const buffer = Buffer.from(await videoRes.arrayBuffer());
        fs.writeFileSync(savePath, buffer);
        const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
        console.log(`    📁 已保存: ${savePath} (${sizeMB}MB, ${elapsed}s)`);
        return { success: true, path: savePath, sizeMB, elapsed };
      } catch (e) { console.log(`    ❌ 下载失败: ${e.message}`); return { success: false, error: 'download failed' }; }
    }
    if (data.status === 'failed') { console.log(`    ❌ [${elapsed}s] 失败: ${JSON.stringify(data.error || {}).substring(0, 150)}`); return { success: false, error: data.error }; }
    if (i % 3 === 0) console.log(`    ⏳ [${elapsed}s] ${data.status}`);
  }
  console.log(`    ⏰ 超时`); return { success: false, error: 'Timeout' };
}

async function testMode(modeKey, modeName, promptBuilder, shotCount) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📋 ${modeName}`);
  console.log(`${'═'.repeat(70)}`);

  const modeDir = path.join(OUTPUT_DIR, modeKey);
  if (!fs.existsSync(modeDir)) fs.mkdirSync(modeDir, { recursive: true });

  const prompts = promptBuilder();

  console.log(`\n📝 === 阶段1: AI剧本生成 ===`);
  const script = await callTextAPI(prompts.system, prompts.user, modeName);
  if (!script || !script.shots?.length) {
    console.log(`❌ 剧本生成失败\n`);
    return { mode: modeName, scriptSuccess: false, shots: 0, videoResults: [] };
  }

  fs.writeFileSync(path.join(modeDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');
  console.log(`  ✅ 剧本已保存: ${path.join(modeDir, 'script.json')}`);
  console.log(`  标题: "${script.title}" | ${script.shots.length}分镜 | ${script.video_duration}s`);
  for (const s of script.shots) {
    console.log(`    Shot${s.shot_index}: ${s.duration}s | ${s.camera_movement} | ${(s.subtitle_text||'').substring(0, 35)}`);
    console.log(`      query: ${(s.scene_description_query||'').substring(0, 60)}`);
    console.log(`      visual: ${(s.visual_description||'').substring(0, 60)}`);
  }

  const toGenerate = Math.min(shotCount, script.shots.length);
  console.log(`\n🎬 === 阶段2: 视频生成 (${toGenerate}/${script.shots.length}个分镜) ===`);

  const videoResults = [];
  for (let i = 0; i < toGenerate; i++) {
    const shot = script.shots[i];
    const prompt = [shot.scene_description_query, shot.visual_description].filter(Boolean).join('. ');
    const isI2V = i === 0;
    const label = `${modeKey}-Shot${shot.shot_index}-${isI2V ? 'I2V' : 'T2V'}`;
    const savePath = path.join(modeDir, `${label}.mp4`);

    console.log(`\n  🎯 Shot${shot.shot_index} (${isI2V ? 'I2V' : 'T2V'})`);
    console.log(`     提示词: ${prompt.substring(0, 100)}...`);

    const taskId = await createVideoTask(prompt, isI2V);
    if (taskId) {
      console.log(`     任务ID: ${taskId}`);
      const result = await pollAndDownload(taskId, label, savePath);
      videoResults.push({ shotIndex: shot.shot_index, mode: isI2V ? 'I2V' : 'T2V', ...result });
    } else {
      videoResults.push({ shotIndex: shot.shot_index, mode: isI2V ? 'I2V' : 'T2V', success: false, error: 'create failed' });
    }
  }

  return { mode: modeName, scriptSuccess: true, shots: script.shots.length, videoResults };
}

async function main() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TikStream AI 端到端测试: 剧本(三模式) → 视频 → 本地保存 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`商品: ${PRODUCT.name}`);
  console.log(`文本EP: ${TEXT_EP}`);
  console.log(`视频EP: ${VIDEO_EP}`);
  console.log(`输出目录: ${OUTPUT_DIR}\n`);

  const results = [];

  results.push(await testMode('quick', '模式1: 快速生成 Quick', buildQuickPrompt, 2));
  results.push(await testMode('viral', '模式2: 爆款改写 Viral Rewrite', buildViralRewritePrompt, 2));
  results.push(await testMode('template', '模式3: 模板驱动 Template-Driven', buildTemplatePrompt, 2));

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('                    端到端测试汇总');
  console.log(`${'═'.repeat(70)}`);

  let totalVideoOk = 0, totalVideoN = 0;

  for (const r of results) {
    const ok = r.videoResults.filter(v => v.success).length;
    const n = r.videoResults.length;
    totalVideoOk += ok; totalVideoN += n;
    console.log(`\n${r.mode}:`);
    console.log(`  剧本: ${r.scriptSuccess ? '✅' : '❌'} | ${r.shots}分镜`);
    console.log(`  视频: ${ok}/${n} 成功`);
    for (const vr of r.videoResults) {
      const icon = vr.success ? '✅' : '❌';
      const info = vr.success ? ` ${vr.sizeMB}MB ${vr.elapsed}s → ${vr.path}` : ` ${vr.error||''}`;
      console.log(`    Shot${vr.shotIndex} ${vr.mode}: ${icon}${info}`);
    }
  }

  console.log(`\n📊 总计: 视频 ${totalVideoOk}/${totalVideoN} 成功 | 耗时 ${mins}分${secs}秒`);
  console.log(`📁 所有文件已保存至: ${OUTPUT_DIR}`);
  
  const dirs = fs.readdirSync(OUTPUT_DIR);
  for (const d of dirs) {
    const files = fs.readdirSync(path.join(OUTPUT_DIR, d));
    console.log(`   ${OUTPUT_DIR}/${d}/: ${files.join(', ')}`);
  }

  if (results.every(r => r.scriptSuccess) && totalVideoOk === totalVideoN) {
    console.log('\n🎉 端到端测试全部通过！');
  } else {
    console.log('\n⚠️ 部分测试未通过');
  }
  console.log('');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
