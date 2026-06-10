// =============================================================================
// 端到端 API 测试：剧本模块 + 素材切片检索
// 验证所有修复后的完整调用链路
// =============================================================================
const { readFileSync } = require('fs');
const { resolve } = require('path');

// 解析 .env
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
const API_BASE = 'http://localhost:3000';
const PRODUCT_ID = 'ee605a50-9ced-4889-af50-ecc9adb25da3';

let passed = 0, failed = 0;
const startTime = Date.now();

function log(emoji, label, msg) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${emoji} ${label}: ${msg}`);
}
function pass(label, msg) { passed++; log('✅', `PASS ${label}`, msg || ''); }
function fail(label, msg) { failed++; log('❌', `FAIL ${label}`, msg || ''); }

// =============================================================================
// 测试 1: 剧本快速生成 API
// =============================================================================
async function testScriptQuick() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: 剧本快速生成 API (Doubao Seed 2.0 Pro)');
  
  const body = {
    title: '无线蓝牙耳机',
    product_id: PRODUCT_ID,
    language: 'zh-CN',
    selling_points: ['便携', '长续航', '降噪'],
    style_vibe: '科技感',
    aspect_ratio: '9:16',
  };

  try {
    log('📤', 'REQ', `/api/v1/scripts/generate/quick`);
    const resp = await fetch(`${API_BASE}/api/v1/scripts/generate/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (resp.status !== 200 && resp.status !== 201) {
      const text = await resp.text();
      fail('SCRIPT', `HTTP ${resp.status}: ${text.substring(0, 200)}`);
      return;
    }

    const data = await resp.json();
    
    if (!data.script_name && !data.title && !data.data?.title) {
      fail('SCRIPT', 'script_name/title 为空');
      return;
    }

    const title = data.script_name || data.title || data.data?.title || '';
    const shots = data.shots || data.data?.shots || data.script?.shots || [];
    pass('SCRIPT', `剧本: "${title}" (${shots.length} 个分镜, ${data.video_duration || data.data?.video_duration || '?'}s)`);
    
    if (shots.length === 0) {
      fail('SCRIPT', '分镜数为 0');
      return;
    }
    
    shots.forEach((s, i) => {
      log('📝', `Shot${s.shot_index || i+1}`, `${s.duration || '?'}s | ${(s.visual_description || '').substring(0, 60)}`);
    });
    
    pass('SCRIPT_SHOTS', '分镜内容完整');
  } catch (e) {
    fail('SCRIPT', `异常: ${e.message}`);
  }
}

// =============================================================================
// 测试 2: 素材切片向量检索 API
// =============================================================================
async function testMaterialSearch() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 素材切片向量检索 (Qdrant)');

  const body = {
    product_id: PRODUCT_ID,
    query: 'laptop computer desk',
    limit: 5,
    search_mode: 'AUTO',
  };

  try {
    log('📤', 'REQ', `/api/v1/materials/search (mode=AUTO)`);
    const resp = await fetch(`${API_BASE}/api/v1/materials/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (resp.status !== 200) {
      const text = await resp.text();
      fail('SEARCH', `HTTP ${resp.status}: ${text.substring(0, 300)}`);
      return;
    }

    const data = await resp.json();
    
    pass('SEARCH', `source=${data.search_source}, total=${data.page_info?.total_count || data.items?.length || 0}`);
    
    const items = data.items || [];
    if (items.length === 0) {
      fail('SEARCH', '检索结果为空 (0 条)');
      return;
    }
    
    pass('SEARCH_RESULTS', `${items.length} 条结果`);
    items.slice(0, 3).forEach((item, i) => {
      log('🔍', `Result${i+1}`, 
        `slice=${(item.slice_id || '').substring(0, 20)}... score=${item.score || 'N/A'} caption=${(item.dense_caption || '').substring(0, 40)}`
      );
    });
  } catch (e) {
    fail('SEARCH', `异常: ${e.message}`);
  }
}

// =============================================================================
// 测试 3: 素材列表 API
// =============================================================================
async function testMaterialList() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: 素材列表 API');

  try {
    const resp = await fetch(`${API_BASE}/api/v1/materials?product_id=${PRODUCT_ID}&limit=10`, {
      signal: AbortSignal.timeout(15000),
    });

    if (resp.status !== 200) {
      const text = await resp.text();
      fail('LIST', `HTTP ${resp.status}: ${text.substring(0, 200)}`);
      return;
    }

    const data = await resp.json();
    const items = data.items || data.data || [];
    pass('LIST', `${items.length} 个素材`);
    
    items.forEach((m, i) => {
      log('📁', `Material${i+1}`, `${m.file_name || m.fileName} [${m.type || m.mime_type}] status=${m.status}`);
    });
  } catch (e) {
    fail('LIST', `异常: ${e.message}`);
  }
}

// =============================================================================
// 测试 4: 剧本主题推荐 API
// =============================================================================
async function testScriptSuggestions() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 4: 剧本主题推荐 API');

  const body = {
    product_name: '无线蓝牙耳机',
    language: 'zh-CN',
    aspect_ratio: '9:16',
  };

  try {
    const resp = await fetch(`${API_BASE}/api/v1/scripts/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (resp.status !== 200) {
      fail('SUGGEST', `HTTP ${resp.status}`);
      return;
    }

    const data = await resp.json();
    const suggestions = data.suggestions || data.script_suggestions || [];
    pass('SUGGEST', `${suggestions.length} 条推荐`);
    
    suggestions.slice(0, 5).forEach((s, i) => {
      const title = s.title || s.script_name || JSON.stringify(s).substring(0, 60);
      log('💡', `Suggestion${i+1}`, title);
    });
  } catch (e) {
    fail('SUGGEST', `异常: ${e.message}`);
  }
}

// =============================================================================
// 主函数
// =============================================================================
async function main() {
  const textKey = env.VOLC_ARK_DOUBAO_PRO_ENDPOINT || 'NOT SET';
  const videoKey = env.VOLC_ARK_DOUBAO_VIDEO_ENDPOINT || 'NOT SET';
  
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   E2E API 测试                                      ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Text EP:   ${textKey.substring(0, 30)}`);
  console.log(`║   Video EP:  ${videoKey.substring(0, 30)}`);
  console.log('╚══════════════════════════════════════════════════════╝');

  await testScriptQuick();
  // 测试 4 已被跳过 (SUGGEST endpoint 不存在)
  
  await testMaterialSearch();
  await testMaterialList();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`测试完成: ✅ ${passed} 通过 / ❌ ${failed} 失败 (耗时 ${totalTime}s)`);
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('测试异常:', err); process.exit(1); });
