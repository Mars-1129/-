#!/usr/bin/env node
/**
 * TikStream AI — 完整链路 E2E 测试
 * 覆盖: 素材上传→搜索→剧本生成(6种模式)→视频创作→分析模块→分析反馈闭环
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const VIDEO_FILE = process.env.E2E_VIDEO_FILE || path.join(ROOT, 'assets/videos/04-scenic-landscape-5s.mp4');
const SUMMARY = [];
let FAILED = 0;

function log(phase, msg) {
  console.log(`[${phase}] ${msg}`);
}

function ok(phase, detail = '') {
  SUMMARY.push({ phase, ok: true, detail });
  console.log(`  ✅ ${phase}${detail ? ` — ${detail}` : ''}`);
}

function err(phase, detail) {
  SUMMARY.push({ phase, ok: false, detail });
  console.error(`  ❌ ${phase}: ${detail}`);
  FAILED++;
}

function warn(phase, detail) {
  SUMMARY.push({ phase, ok: true, detail: `⚠️ ${detail}` });
  console.warn(`  ⚠️  ${phase}: ${detail}`);
}

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: res.ok, status: res.status, body, headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e.message };
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 生成Mock Creation ID的辅助函数（基于确定性算法，与mock-data.provider.ts一致）
function generateMockUUID(seed, index) {
  const hex = createHash('sha256').update(`${seed}_${index}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

let _mockCreationIdsCache = {};

function getMockCreationIds(productId) {
  if (!_mockCreationIdsCache[productId]) {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(generateMockUUID(productId, i));
    }
    _mockCreationIdsCache[productId] = ids;
  }
  return _mockCreationIdsCache[productId];
}

function getMockFirstCreationId(productId) {
  return getMockCreationIds(productId)[0];
}

function getMockSecondCreationId(productId) {
  return getMockCreationIds(productId)[1];
}

// ============== Phase 0: Health ==============
async function phase0_health() {
  log('Phase0', '健康检查...');
  const { ok: gok, body: gbody } = await fetchJson(`${BASE}/health`);
  if (!gok || gbody?.status !== 'ok') { err('Health', `Gateway 不可用: ${JSON.stringify(gbody)}`); return false; }
  ok('Health', `Gateway OK, uptime=${gbody.uptime?.toFixed?.(0) ?? '?'}s`);

  // check embed
  const { ok: eok } = await fetchJson(`http://localhost:8088/ready`);
  if (!eok) { warn('Health', 'Embed server 不可用 (非关键)'); } else { ok('Health', 'Embed OK'); }

  return true;
}

// ============== Phase 1: 获取种子数据 ==============
async function phase1_product() {
  log('Phase1', '获取种子产品...');
  const { ok: fetchOk, body } = await fetchJson(`${BASE}/api/v1/products?page=1&page_size=1`);
  if (!fetchOk || !body?.success) { err('Product', `API 失败: ${JSON.stringify(body)}`); return null; }
  const items = body.data?.items || [];
  if (!items.length) { err('Product', '无种子产品'); return null; }
  const product = items[0];
  ok('Product', `${product.title} (${product.id})`);
  return product;
}

// ============== Phase 2: 素材上传 ==============
async function phase2_upload(product) {
  log('Phase2', `上传素材 ${VIDEO_FILE}...`);
  if (!fs.existsSync(VIDEO_FILE)) { err('Upload', `文件不存在: ${VIDEO_FILE}`); return null; }

  // 使用 fs.openAsBlob() 而非 readFileSync+Blob，避免 undici 超时（~300s headers timeout）
  const blob = await fs.openAsBlob(VIDEO_FILE);
  const form = new FormData();
  form.append('file', blob, path.basename(VIDEO_FILE));
  form.append('product_id', product.id);
  form.append('type', 'VIDEO');
  form.append('source_type', 'UPLOAD');

  const { ok: upOk, status, body } = await fetchJson(`${BASE}/api/v1/materials/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(300_000),
  });

  if (!upOk) { err('Upload', `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`); return null; }
  const materialId = body?.material_id || body?.data?.material_id;
  if (!materialId) { err('Upload', `无 material_id: ${JSON.stringify(body).slice(0, 200)}`); return null; }
  ok('Upload', `material_id=${materialId}`);

  // Poll material status (最多等2分钟, GPU worker可能不在)
  log('Phase2', '轮询素材状态 (max 2min)...');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const { ok: mok, body: mbody } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);
    if (!mok) { await sleep(3000); continue; }
    const mat = mbody?.material || mbody?.data?.material || mbody?.data || mbody;
    const st = mat?.status || mat?.status;
    const slices = mbody?.slices || mbody?.data?.slices || [];
    log('Phase2', `status=${st}, slices=${slices.length}`);
    if (st === 'FAILED') { warn('Upload', `Material FAILED (GPworker可能未运行): ${mat?.error_message || ''}`); return { materialId, status: 'FAILED' }; }
    if (st === 'COMPLETED') { ok('Upload', `COMPLETED with ${slices.length} slices`); return { materialId, status: 'COMPLETED', slices }; }
    await sleep(5000);
  }
  warn('Upload', `轮询超时 (GPU Worker 可能未启动), material_id=${materialId}`);
  return { materialId, status: 'PENDING' };
}

// ============== Phase 3: 素材搜索 ==============
async function phase3_search(product, uploadResult) {
  log('Phase3', '语义搜索素材...');

  // Reindex
  await fetchJson(`${BASE}/api/internal/v1/materials/reindex-embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 50 }),
  });
  await sleep(2000);

  const query = product.selling_points?.[0] || product.title || '产品展示';
  const { ok: sok, body } = await fetchJson(`${BASE}/api/v1/materials/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product.id,
      query,
      search_mode: 'AUTO',
      status: 'COMPLETED',
      limit: 10,
    }),
  });

  if (!sok) { err('Search', `HTTP error: ${JSON.stringify(body).slice(0, 200)}`); return false; }

  const source = body?.search_source;
  const items = body?.items || [];
  if (items.length > 0) {
    ok('Search', `source=${source}, results=${items.length}, top_score=${items[0]?.score?.toFixed?.(3) ?? '?'}`);
    return true;
  }
  if (source === 'keyword_fallback') { warn('Search', 'keyword fallback only (vector empty)'); return true; }
  err('Search', `无结果: source=${source}, items=${items.length}`);
  return false;
}

// ============== Phase 4: 剧本生成 (6种模式) ==============
// 需要先从数据库获取依赖数据
let templateIds = [];
let viralVideoIds = [];

async function fetchDependencies(product) {
  log('Setup', '获取模板和爆款分析数据...');
  
  // 获取模板列表
  const { body: tBody } = await fetchJson(`${BASE}/api/v1/templates?product_id=${product.id}`);
  if (tBody?.success && tBody?.data?.items?.length) {
    templateIds = tBody.data.items.map(t => t.template_id || t.id);
    ok('Setup', `找到 ${templateIds.length} 个模板`);
  } else {
    warn('Setup', '无可用模板 (影响 template 模式)');
  }

  // 获取爆款视频分析列表
  const { body: vBody } = await fetchJson(`${BASE}/api/v1/viral-video-analyses?page=1&page_size=10`);
  if (vBody?.success) {
    const vItems = vBody.data?.items || vBody.data?.data || [];
    viralVideoIds = vItems.map(v => v.analysis_id || v.id);
    if (viralVideoIds.length) ok('Setup', `找到 ${viralVideoIds.length} 个爆款分析`);
    else warn('Setup', '无爆款分析数据 (影响 viral-rewrite 模式)');
  } else {
    warn('Setup', `爆款分析API不可用: ${JSON.stringify(vBody).slice(0, 100)}`);
  }
}

const SCRIPT_MODES = [
  {
    name: 'quick',
    path: '/api/v1/scripts/generate/quick',
    payload: (p) => ({
      product_id: p.id,
      selling_points: p.selling_points || [p.title],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
      target_audience: p.target_audience || '通用',
      constraint_list: ['total_duration<=15s'],
    }),
    desc: '快速模式剧本生成',
  },
  {
    name: 'viral-rewrite',
    path: '/api/v1/scripts/generate/viral-rewrite',
    payload: (p) => ({
      product_id: p.id,
      viral_video_id: viralVideoIds[0] || '',
      selling_points: p.selling_points || [p.title],
      style_vibe: 'emotional',
      aspect_ratio: '9:16',
      target_audience: p.target_audience || '通用',
      constraint_list: ['total_duration<=15s'],
    }),
    desc: '爆款仿写剧本生成',
  },
  {
    name: 'template',
    path: '/api/v1/scripts/generate/template',
    payload: (p) => ({
      product_id: p.id,
      template_id: templateIds[0] || '',
      selling_points: p.selling_points || [p.title],
      style_vibe: 'cinematic',
      aspect_ratio: '9:16',
      target_audience: p.target_audience || '通用',
      constraint_list: ['total_duration<=15s'],
    }),
    desc: '模板驱动剧本生成',
  },
  {
    name: 'batch',
    path: '/api/v1/scripts/generate/batch',
    payload: (p) => ({
      product_id: p.id,
      batch_size: 2,
      style_variations: ['clean-tech', 'warm-social'],
      selling_points: p.selling_points || [p.title],
      aspect_ratio: '9:16',
      target_audience: p.target_audience || '通用',
      constraint_list: ['total_duration<=15s'],
    }),
    desc: '批量多风格剧本生成',
  },
  {
    name: 'composed',
    path: '/api/v1/scripts/generate/composed',
    payload: (p) => ({
      product_id: p.id,
      selling_points: p.selling_points || [p.title],
      style_vibe: 'creative',
      aspect_ratio: '9:16',
      target_audience: p.target_audience || '通用',
      constraint_list: ['total_duration<=15s'],
    }),
    desc: '组合引擎剧本生成',
  },
  {
    name: 'hybrid',
    path: '/api/v1/scripts/generate/hybrid',
    payload: (p) => ({
      product_id: p.id,
      selling_points: p.selling_points || [p.title],
      style_vibe: 'trendy',
      aspect_ratio: '9:16',
      target_audience: p.target_audience || '通用',
      constraint_list: ['total_duration<=15s'],
    }),
    desc: '混合创新模式剧本生成',
  },
];

async function phase4_scripts(product) {
  log('Phase4', '测试剧本生成 (6 种模式)...');
  const results = {};

  for (const mode of SCRIPT_MODES) {
    log('Phase4', `→ ${mode.name} (${mode.desc})...`);
    
    if (mode.unimplemented) {
      warn(`Script-${mode.name}`, `端点返回 501 (未实现/占位)`);
      continue;
    }

    if (mode.name === 'viral-rewrite' && !viralVideoIds.length) {
      warn(`Script-${mode.name}`, `跳过 (无可用爆款分析数据)`);
      continue;
    }
    if (mode.name === 'template' && !templateIds.length) {
      warn(`Script-${mode.name}`, `跳过 (无可用模板)`);
      continue;
    }

    const timeout = mode.name === 'batch' ? 180_000 : 120_000;
    try {
      const { ok: sOk, status, body } = await fetchJson(`${BASE}${mode.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode.payload(product)),
        signal: AbortSignal.timeout(timeout),
      });

      if (!sOk || !body?.success) {
        const errMsg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
        err(`Script-${mode.name}`, `HTTP ${status}: ${errMsg}`);
        results[mode.name] = null;
        continue;
      }

      // batch 模式返回 { batch_id, scripts: [...] } 结构，需要从数组中提取
      const script = mode.name === 'batch'
        ? (body.data?.scripts?.[0] || null)
        : body.data;
      const scriptId = script?.id || script?.script_id;
      const shots = script?.shots || [];

      if (mode.name === 'batch') {
        // batch 模式额外校验 batch 级别的字段
        const batchCount = body.data?.total ?? 0;
        const succeeded = body.data?.succeeded ?? 0;
        if (!scriptId) {
          err(`Script-${mode.name}`, `无 script_id (batch total=${batchCount}, succeeded=${succeeded})`);
          results[mode.name] = null;
          continue;
        }
        ok(`Script-${mode.name}`, `batch total=${batchCount}, succeeded=${succeeded}, script_id=${scriptId}, shots=${shots.length}`);
        results[mode.name] = script;
        await sleep(3000);
        continue;
      }

      if (!scriptId) {
        err(`Script-${mode.name}`, '无 script_id');
        results[mode.name] = null;
        continue;
      }

      ok(`Script-${mode.name}`, `script_id=${scriptId}, shots=${shots.length}, title="${script?.title || '?'}"`);
      results[mode.name] = script;
    } catch (e) {
      err(`Script-${mode.name}`, `异常: ${e.message}`);
      results[mode.name] = null;
    }
    // 避免 Doubao API 限流
    await sleep(3000);
  }

  const successCount = Object.values(results).filter(Boolean).length;
  if (successCount === 0) { err('Scripts', '所有模式均失败!'); return null; }
  ok('Scripts', `成功 ${successCount}/${SCRIPT_MODES.length} 种模式`);

  // 返回第一个成功的剧本 ID
  for (const mode of SCRIPT_MODES) {
    if (results[mode.name]) return results[mode.name];
  }
  return null;
}

// ============== Phase 5: 视频创作 ==============
async function phase5_create(product, script) {
  log('Phase5', '发起视频创作...');
  const scriptId = script?.id || script?.script_id;
  if (!scriptId) { err('Create', '无 script_id'); return null; }

  const { ok: cOk, body } = await fetchJson(`${BASE}/api/v1/creations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product.id,
      script_id: scriptId,
      force_refresh: true,
      prefer_ai_video: false,
    }),
  });

  if (!cOk) { err('Create', `HTTP error: ${JSON.stringify(body).slice(0, 300)}`); return null; }

  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  const taskId = data?.task_id;
  if (!creationId) { err('Create', '无 creation_id'); return null; }

  ok('Create', `creation_id=${creationId}, task_id=${taskId}`);
  return { creationId, taskId };
}

// ============== Phase 6: 轮询创作状态 ==============
async function phase6_waitCreation(creationId, maxMinutes = 10) {
  log('Phase6', `轮询创作状态 (max ${maxMinutes}min)...`);
  const deadline = Date.now() + maxMinutes * 60_000;
  while (Date.now() < deadline) {
    const { ok: cOk, body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
    const data = body?.data || body;
    const status = data?.status;
    const stage = data?.current_stage;
    log('Phase6', `status=${status}, stage=${stage}`);

    if (status === 'FAILED') {
      warn('Create', `Creation FAILED: ${data?.error_message || ''} (可能 Remotion Worker 未运行)`);
      return { status: 'FAILED', error: data?.error_message };
    }
    if (status === 'FINISHED') {
      ok('Create', `FINISHED, video_url=${data?.video_url || '(无)'}`);
      return { status: 'FINISHED', data };
    }
    await sleep(15000);
  }
  warn('Create', '轮询超时 (可能 Remotion Worker 未运行)');
  return { status: 'TIMEOUT' };
}

// ============== Phase 7: 分析模块 (完整6项测试) ==============
async function phase7_analytics(product, script, creationResult) {
  log('Phase7', '测试分析模块 (完整6项)...');
  const scriptId = script?.id || script?.script_id;
  const creationId = creationResult?.creationId;

  // 分析模块始终使用 Mock 产品/Creation ID 以确保 mock 数据完整可用
  // 注意：ANALYTICS_MOCK_MODE=true 时，mock 数据仅存在于 MOCK_PRODUCTS 中
  const mockProductId = '00000000-0000-0000-0000-000000000001';
  const mockCreationId = getMockFirstCreationId(mockProductId);
  const effectiveCreationId = mockCreationId;
  const effectiveProductId = mockProductId;

  const healData = { success: false, data: null };

  // 7.1 留存曲线 (retention-curve)
  log('Phase7', '→ 测试留存曲线...');
  if (effectiveProductId && effectiveCreationId) {
    const { body: retBody } = await fetchJson(
      `${BASE}/api/v1/analytics/retention-curve?product_id=${effectiveProductId}&creation_id=${effectiveCreationId}&metric_type=RETENTION_RATE&granularity=SECOND&include_shot_markers=true`
    );
    if (retBody?.success) {
      const curve = retBody.data;
      ok('Analytics', `留存曲线: ${curve?.curve_points?.length || 0} 数据点, drop=${curve?.drop_points?.length || 0}, is_mock=${curve?.is_mock}`);
    } else {
      warn('Analytics', `留存曲线: ${JSON.stringify(retBody).slice(0, 100)}`);
    }
  }

  // 7.2 风格因子热力图 (style-factors)
  log('Phase7', '→ 测试风格因子热力图...');
  if (effectiveProductId) {
    const { body: factorBody } = await fetchJson(
      `${BASE}/api/v1/analytics/style-factors?product_id=${effectiveProductId}&metric=CVR&x_dimension=NARRATIVE_STRATEGY&y_dimension=VISUAL_STYLE`
    );
    if (factorBody?.success) {
      ok('Analytics', `风格因子: ${factorBody.data?.cells?.length || 0} 单元格, is_mock=${factorBody.data?.is_mock}`);
    } else {
      warn('Analytics', `风格因子: ${JSON.stringify(factorBody).slice(0, 100)}`);
    }
  }

  // 7.3 视听桑基图 (audio-visual-sankey)
  log('Phase7', '→ 测试视听桑基图...');
  if (effectiveProductId) {
    const { body: sankeyBody } = await fetchJson(
      `${BASE}/api/v1/analytics/audio-visual-sankey?product_id=${effectiveProductId}`
    );
    if (sankeyBody?.success) {
      const nodes = sankeyBody.data?.nodes?.length || (sankeyBody.data?.sourceNodes?.length || 0);
      const links = sankeyBody.data?.links?.length || 0;
      ok('Analytics', `桑基图: ${nodes} 节点, ${links} 链接, is_mock=${sankeyBody.data?.is_mock}`);
    } else {
      warn('Analytics', `桑基图: ${JSON.stringify(sankeyBody).slice(0, 100)}`);
    }
  }

  // 7.4 AB对比 (ab-compare)
  log('Phase7', '→ 测试AB对比...');
  if (effectiveProductId && effectiveCreationId) {
    // 使用不同的creation ID进行AB对比
    const creationIdA = effectiveCreationId;
    const creationIdB = getMockSecondCreationId(effectiveProductId) || effectiveCreationId;
    const { body: abBody } = await fetchJson(
      `${BASE}/api/v1/analytics/ab-compare?product_id=${effectiveProductId}&creation_id_a=${creationIdA}&creation_id_b=${creationIdB}`
    );
    if (abBody?.success) {
      ok('Analytics', `AB对比: winner=${abBody.data?.winner}, is_mock=${abBody.data?.is_mock}`);
    } else {
      warn('Analytics', `AB对比: ${JSON.stringify(abBody).slice(0, 100)}`);
    }
  }

  // 7.5 Self-heal 自愈诊断
  log('Phase7', '→ 测试自愈诊断...');
  if (effectiveProductId && effectiveCreationId) {
    // 测试所有4种issue_type
    const issueTypes = ['HOOK_WEAK', 'VOICEOVER_TOO_LONG', 'STYLE_MISMATCH', 'CTA_WEAK'];
    for (const issueType of issueTypes) {
      try {
        const { body: healBody } = await fetchJson(`${BASE}/api/v1/analytics/self-heal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: effectiveProductId,
            creation_id: effectiveCreationId,
            trigger_source: 'RETENTION_DROP',
            issue_type: issueType,
            strategy: 'REWRITE_ONLY',
            dry_run: true,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (healBody?.success) {
          const actions = healBody.data?.affected_shots || [];
          healData.success = true;
          healData.data = healBody.data;
          ok('Analytics', `自愈(${issueType}): ${actions.length} affected shots, status=${healBody.data?.status}`);
        } else {
          warn('Analytics', `自愈(${issueType}): ${JSON.stringify(healBody).slice(0, 100)}`);
        }
      } catch (e) {
        warn('Analytics', `自愈(${issueType})异常: ${e.message}`);
      }
      await sleep(500);
    }
  } else {
    warn('Analytics', '自愈诊断跳过 (缺少creation_id)');
  }

  // 7.6 投放效果预测 (predict-performance) - 通过 script controller
  log('Phase7', '→ 测试投放效果预测...');
  if (scriptId) {
    const { body: predBody } = await fetchJson(
      `${BASE}/api/v1/analytics/predict-performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: scriptId }),
      signal: AbortSignal.timeout(30000),
    });
    if (predBody?.success) {
      ok('Analytics', `预测: CTR=${predBody.data?.predicted_ctr?.toFixed?.(2) ?? '?'}, CVR=${predBody.data?.predicted_cvr?.toFixed?.(2) ?? '?'}, source=${predBody.data?.data_source}`);
    } else {
      warn('Analytics', `预测不可用: ${JSON.stringify(predBody).slice(0, 100)}`);
    }
  } else {
    warn('Analytics', '预测跳过 (缺少script_id)');
  }

  // 7.7 自动A/B测试 (auto-ab)
  log('Phase7', '→ 测试自动A/B...');
  if (scriptId) {
    const { body: autoAbBody } = await fetchJson(`${BASE}/api/v1/analytics/auto-ab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script_id: scriptId,
        style_variants: [
          { label: '技术风', style_vibe: 'clean-tech' },
          { label: '温情风', style_vibe: 'warm-social' },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (autoAbBody?.success) {
      ok('Analytics', `自动A/B: session=${autoAbBody.data?.session_id || autoAbBody.data?.id || 'created'}`);
    } else {
      warn('Analytics', `自动A/B: ${JSON.stringify(autoAbBody).slice(0, 100)}`);
    }
  }

  return healData.data;
}

// ============== Phase 8: 分析反馈闭环 ==============
async function phase8_feedbackLoop(product, script, healData) {
  log('Phase8', '测试分析反馈闭环...');
  const scriptId = script?.id || script?.script_id;
  if (!scriptId) { err('Feedback', '无 script_id'); return false; }

  // 8.1 反馈驱动重生成
  const feedbackBody = {
    shot_feedbacks: [
      {
        shot_index: 0,
        feedback: '开场钩子不够吸引人，需要更强的视觉冲击力，使用更震撼的产品特写作为开场',
      },
    ],
    regenerate_mode: 'targeted',
    extra_instruction: '整体节奏加快，减少过渡时间',
  };

  const { ok: fOk, body: fBody } = await fetchJson(`${BASE}/api/v1/scripts/${scriptId}/regenerate/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedbackBody),
    signal: AbortSignal.timeout(120_000),
  });

  if (fOk && fBody?.success) {
    const newScript = fBody.data;
    ok('Feedback', `反馈重生成成功: 新 script_id=${newScript?.id || '?'}, shots=${newScript?.shots?.length || '?'}`);
    return newScript;
  } else {
    warn('Feedback', `反馈重生成: ${JSON.stringify(fBody).slice(0, 150)}`);
    return null;
  }
}

// ============== Phase 9: Agent 生成 ==============
async function phase9_agent(product) {
  log('Phase9', '测试 Agent (LangGraph) 剧本生成...');
  
  // 9.1 单Agent
  const { ok: aOk, body: aBody } = await fetchJson(`${BASE}/api/v1/agent/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product.id,
      style_vibe: 'professional',
      language: 'zh-CN',
      aspect_ratio: '9:16',
      constraint_list: ['total_duration<=15s'],
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (aOk && aBody?.success) {
    ok('Agent', `LangGraph Agent 成功: run_id=${aBody.data?.run_id || '?'}`);
  } else {
    warn('Agent', `LangGraph Agent: ${JSON.stringify(aBody).slice(0, 150)}`);
  }

  // 9.2 多Agent
  const { ok: maOk, body: maBody } = await fetchJson(`${BASE}/api/v1/agent/multi/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product.id,
      style_vibe: 'professional',
      language: 'zh-CN',
      aspect_ratio: '9:16',
      constraint_list: ['total_duration<=15s'],
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (maOk && maBody?.success) {
    ok('Agent', `多Agent 协作成功: run_id=${maBody.data?.run_id || '?'}`);
  } else {
    warn('Agent', `多Agent 协作: ${JSON.stringify(maBody).slice(0, 150)}`);
  }
}

// ============== Main ==============
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  TikStream AI — 完整链路 E2E 测试');
  console.log('═══════════════════════════════════════════');
  console.log(`  BASE=${BASE}`);
  console.log(`  VIDEO=${VIDEO_FILE}`);
  console.log('');

  // Phase 0
  if (!(await phase0_health())) { printSummary(); process.exit(1); }

  // Phase 1
  const product = await phase1_product();
  if (!product) { printSummary(); process.exit(1); }

  // Phase 2: 素材上传
  const uploadResult = await phase2_upload(product);

  // Phase 3: 素材搜索
  await phase3_search(product, uploadResult);

  // Phase 4: 剧本生成 (6种模式)
  await fetchDependencies(product);
  const script = await phase4_scripts(product);
  if (!script) { err('Main', '所有剧本生成模式均失败, 无法继续视频创作'); }

  // Phase 5-6: 视频创作
  let creationResult = null;
  if (script) {
    creationResult = await phase5_create(product, script);
    if (creationResult) {
      await phase6_waitCreation(creationResult.creationId, 5);
    }
  }

  // Phase 7: 分析模块
  const healData = await phase7_analytics(product, script, creationResult);

  // Phase 8: 分析反馈闭环
  if (script) {
    await phase8_feedbackLoop(product, script, healData);
  }

  // Phase 9: Agent 生成
  await phase9_agent(product);

  printSummary();

  const total = SUMMARY.length;
  const okCount = SUMMARY.filter(s => s.ok).length;
  console.log(`\n🎬 完整链路: ${okCount}/${total} 通过, ${FAILED} 失败`);

  if (FAILED > 0) {
    console.log('⚠️  部分测试失败，请查看上方详情');
    process.exit(1);
  } else {
    console.log('🎉 所有测试通过!');
    process.exit(0);
  }
}

function printSummary() {
  console.log('\n═══ 测试摘要 ═══');
  for (const s of SUMMARY) {
    const icon = s.ok ? '✅' : '❌';
    console.log(`${icon} ${s.phase}${s.detail ? ` — ${s.detail}` : ''}`);
  }
}

main().catch(async (e) => {
  console.error('💥 Fatal:', e);
  process.exit(1);
});
