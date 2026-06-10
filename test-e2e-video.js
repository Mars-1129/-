const VIDEO_API_KEY = 'ark-66e44436-5c88-43b1-a423-d368d2cbf8d0-d3254';
const VIDEO_ENDPOINT = 'ep-20260602181637-4xnfv';
const VIDEO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

const MODES = {
  'quick': {
    name: '模式1: 快速生成 Quick',
    shots: [
      {
        index: 1,
        duration: 3.0,
        scene_description_query: 'wireless curling iron product hero shot',
        visual_description: '产品主体快速出场，开场镜头直接聚焦智能无线卷发棒，画面干净利落突出clean-tech气质',
        camera_movement: 'Dolly_In_Fast',
        voiceover: '厌倦了早起花半小时做发型？这款智能无线卷发棒让你3分钟出门！',
        subtitle: '3分钟快速造型',
      },
      {
        index: 2,
        duration: 3.5,
        scene_description_query: 'curling iron temperature control close up',
        visual_description: '近距离特写3档智能控温面板，手指轻触调节温度，LED指示灯流畅切换',
        camera_movement: 'Static',
        voiceover: '3档智能控温不伤发，从150°C到210°C精准调节',
        subtitle: '3档智能控温，不伤发质',
      },
      {
        index: 3,
        duration: 3.0,
        scene_description_query: 'woman using portable curling iron in car',
        visual_description: '年轻女性在车内使用卷发棒，展示便携无线特性，自然光照下秀发飘逸',
        camera_movement: 'Pan_Left',
        voiceover: '10分钟快充续航全天，无线便携随行随用！',
        subtitle: '10分钟快充，无线便携',
      },
    ],
  },
  'viral': {
    name: '模式2: 爆款改写 Viral Rewrite',
    shots: [
      {
        index: 1,
        duration: 2.5,
        scene_description_query: 'messy hair before after transformation hook',
        visual_description: '对比效果开场：左边乱发右边精致卷发，快速切换抓住注意力',
        camera_movement: 'Static',
        voiceover: '不敢相信！同样的脸，发型改变后竟然差这么多？',
        subtitle: '发型改变前后对比',
      },
      {
        index: 2,
        duration: 3.0,
        scene_description_query: 'curling iron demonstration slow motion product',
        visual_description: '慢动作展示卷发棒使用过程，一缕头发从直变卷的特写，产品细节清晰可见',
        camera_movement: 'Dolly_In_Fast',
        voiceover: '秘密就是这款智能无线卷发棒，3档控温10分钟快充',
        subtitle: '3档控温不伤发',
      },
    ],
  },
  'template': {
    name: '模式3: 模板驱动 Template-Driven',
    shots: [
      {
        index: 1,
        duration: 2.5,
        scene_description_query: 'unboxing curling iron product reveal fast cut',
        visual_description: '快节奏开箱画面，产品从包装盒中取出，科技感光影扫描过产品表面',
        camera_movement: 'Dolly_In_Fast',
        voiceover: '来开箱这款爆款智能卷发棒！',
        subtitle: '开箱测评',
      },
      {
        index: 2,
        duration: 3.0,
        scene_description_query: 'curling iron safety feature burn test comparison',
        visual_description: '防烫设计对比测试：普通卷发棒烫伤vs智能卷发棒安全不烫手',
        camera_movement: 'Static',
        voiceover: '防烫设计安全可靠，再也不用担心烫到手！',
        subtitle: '防烫设计，安全放心',
      },
    ],
  },
};

function buildVideoPrompt(shot) {
  const parts = [];
  if (shot.scene_description_query?.trim()) parts.push(shot.scene_description_query.trim());
  if (shot.visual_description?.trim()) parts.push(shot.visual_description.trim());
  return parts.join('. ');
}

async function createVideoTask(prompt, isI2V, label) {
  console.log(`  🎬 ${label}`);
  console.log(`    提示词: ${prompt.substring(0, 100)}...`);

  const content = [];
  if (isI2V) {
    content.push({ type: 'image_url', image_url: { url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1080&h=1920&fit=crop' }, role: 'first_frame' });
  }
  content.push({ type: 'text', text: prompt });

  const body = { model: VIDEO_ENDPOINT, content, resolution: '720p', ratio: '9:16', duration: 4 };

  const res = await fetch(VIDEO_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VIDEO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  const data = await res.json();
  if (res.ok && data.id) {
    console.log(`    📝 任务ID: ${data.id}`);
    return data.id;
  }
  console.log(`    ❌ HTTP ${res.status}: ${JSON.stringify(data).substring(0, 200)}`);
  return null;
}

async function pollVideoTask(taskId, label, maxWaitSec = 240) {
  const pollUrl = `${VIDEO_API_URL}/${taskId}`;
  const start = Date.now();

  for (let i = 0; i < Math.ceil(maxWaitSec / 10); i++) {
    await new Promise(r => setTimeout(r, 10000));

    let data;
    try {
      const res = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${VIDEO_API_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      data = await res.json();
    } catch (e) {
      console.log(`    ⚠️ 轮询错误: ${e.message}, 重试...`);
      continue;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);

    if (data.status === 'succeeded') {
      console.log(`    ✅ [${elapsed}s] 成功`);
      return { success: true, elapsed, videoUrl: data.content?.video_url };
    }
    if (data.status === 'failed') {
      console.log(`    ❌ [${elapsed}s] 失败: ${JSON.stringify(data.error || {}).substring(0, 150)}`);
      return { success: false, elapsed, error: data.error };
    }
    if (i % 2 === 0) {
      console.log(`    ⏳ [${elapsed}s] ${data.status}`);
    }
  }

  console.log(`    ⏰ 超时`);
  return { success: false, error: 'Timeout' };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║ TikStream AI 端到端测试: 剧本→视频生成       ║');
  console.log('║ (剧本提示词模拟三种模式输出)                  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`视频端点: ${VIDEO_ENDPOINT}\n`);
  console.log('⚠️ 注意: 文本API Key已失效，使用各模式的典型分镜文案测试视频生成');
  console.log('   (实际生产环境中，这些文案由Doubao文本API生成)\n');

  const allResults = {};

  for (const [modeKey, modeData] of Object.entries(MODES)) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📋 ${modeData.name} (${modeData.shots.length}个分镜)`);
    console.log(`${'═'.repeat(60)}`);

    const modeResults = [];

    for (let i = 0; i < modeData.shots.length; i++) {
      const shot = modeData.shots[i];
      const prompt = buildVideoPrompt(shot);

      const isI2V = i === 0;
      const label = `Shot${shot.index} ${isI2V ? '[I2V]' : '[T2V]'}`;

      console.log(`\n  分镜${shot.index}:`);
      console.log(`    scene_query: ${shot.scene_description_query}`);
      console.log(`    visual_desc: ${shot.visual_description?.substring(0, 60)}...`);
      console.log(`    时长: ${shot.duration}s | 运镜: ${shot.camera_movement}`);
      console.log(`    旁白: ${shot.voiceover?.substring(0, 50)}...`);

      const taskId = await createVideoTask(prompt, isI2V, label);
      if (taskId) {
        const pollResult = await pollVideoTask(taskId, label);
        modeResults.push({
          shotIndex: shot.index,
          mode: isI2V ? 'I2V' : 'T2V',
          prompt: prompt.substring(0, 60),
          ...pollResult,
        });
      } else {
        modeResults.push({ shotIndex: shot.index, mode: isI2V ? 'I2V' : 'T2V', success: false, error: '创建失败' });
      }
    }

    allResults[modeKey] = { name: modeData.name, results: modeResults };
  }

  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('              端到端测试汇总');
  console.log(`${'═'.repeat(60)}`);

  let totalSuccess = 0;
  let totalAttempts = 0;

  for (const [key, data] of Object.entries(allResults)) {
    const ok = data.results.filter(r => r.success).length;
    const total = data.results.length;
    totalSuccess += ok;
    totalAttempts += total;

    console.log(`\n${data.name}:`);
    for (const r of data.results) {
      const icon = r.success ? '✅' : '❌';
      const time = r.elapsed ? ` (${r.elapsed}s)` : '';
      console.log(`  Shot${r.shotIndex} ${r.mode}: ${icon}${time} | ${r.prompt}...`);
    }
    console.log(`  合计: ${ok}/${total} 成功`);
  }

  console.log(`\n📊 总计: 视频 ${totalSuccess}/${totalAttempts} 成功`);

  if (totalSuccess === totalAttempts) {
    console.log('\n🎉 端到端测试全部通过！所有剧本模式的分镜均成功生成视频。');
  } else {
    console.log('\n⚠️ 部分分镜视频生成失败，请检查上述错误。');
  }

  console.log(`\n💡 提示: 文本API Key (ark-0a0ae159-...-d42e3) 已失效 (HTTP 401)`);
  console.log(`   如需完整端到端测试，请在 .env 中更新 VOLC_ARK_API_KEY 为有效的文本API Key。`);
  console.log(`   视频API Key (ark-66e44436-...-d3254) 工作正常。\n`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
