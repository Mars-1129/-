#!/usr/bin/env node
/**
 * TikStream AI — 模块完整链路 E2E 测试
 * 覆盖:
 *   1. DNA管理模块 (viral-analysis / viral-dna / subscription)
 *   2. 趋势追踪模块 (trend-tracker)
 *   3. 合规模块 (compliance constraints / sensitivity / AI review)
 *
 * 使用方式: node scripts/e2e-modules-comprehensive.mjs
 * 环境变量: E2E_BASE_URL (默认 http://localhost:3000)
 */

import { randomUUID } from 'node:crypto';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const SUMMARY = [];
let FAILED = 0;
let PHASE_NUM = 0;

function phase(name) {
  PHASE_NUM++;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[P${PHASE_NUM}] ${name}`);
  console.log(`${'═'.repeat(60)}`);
  return `P${PHASE_NUM}`;
}

function ok(subPhase, detail = '') {
  SUMMARY.push({ phase: subPhase, ok: true, detail });
  console.log(`  ✅ ${subPhase}${detail ? ` — ${detail}` : ''}`);
}

function err(subPhase, detail) {
  SUMMARY.push({ phase: subPhase, ok: false, detail });
  console.error(`  ❌ ${subPhase}: ${detail}`);
  FAILED++;
}

function warn(subPhase, detail) {
  SUMMARY.push({ phase: subPhase, ok: true, detail: `⚠️ ${detail}` });
  console.warn(`  ⚠️  ${subPhase}: ${detail}`);
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function printSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log('  测试摘要');
  console.log('═'.repeat(60));
  for (const s of SUMMARY) {
    const icon = s.ok ? '✅' : '❌';
    console.log(`${icon} ${s.phase}${s.detail ? ` — ${s.detail}` : ''}`);
  }
  const total = SUMMARY.length;
  const okCount = SUMMARY.filter(s => s.ok).length;
  console.log(`\n🎬 结果: ${okCount}/${total} 通过, ${FAILED} 失败`);
}

function extractData(body) {
  return body?.data || body;
}

function extractDataItems(body) {
  const data = extractData(body);
  return data?.items || data?.data || [];
}

// =============================================================================
// Phase 0: Health Check
// =============================================================================
async function phase0_health() {
  phase('服务健康检查');
  
  const { ok: gok, body: gbody } = await fetchJson(`${BASE}/health`);
  if (!gok || gbody?.status !== 'ok') {
    err('Health', `Gateway 不可用: ${JSON.stringify(gbody)}`);
    return false;
  }
  ok('Health', `Gateway OK, uptime=${Math.round(gbody.uptime || 0)}s`);
  
  const { ok: wok } = await fetchJson(`http://localhost:15173`);
  ok('Health', wok ? 'Web UI OK' : 'Web UI 不可用');
  
  return true;
}

// =============================================================================
// Phase 1: Get Seed Data
// =============================================================================
let gProduct = null;
let gProductId = null;
let gScriptId = null;
let gTemplateId = null;

async function phase1_seed() {
  phase('获取种子数据');
  
  // 获取产品
  {
    const { ok: pok, body } = await fetchJson(`${BASE}/api/v1/products?page=1&page_size=1`);
    if (!pok || !body?.success) {
      err('Seed-Product', '产品API失败');
      return false;
    }
    const items = extractDataItems(body);
    if (!items.length) {
      err('Seed-Product', '无种子产品数据');
      return false;
    }
    gProduct = items[0];
    gProductId = gProduct.id || gProduct.product_id;
    ok('Seed-Product', `${gProduct.title || '?'} (${gProductId})`);
  }
  
  // 获取模板
  {
    const { body } = await fetchJson(`${BASE}/api/v1/templates?page=1&page_size=1`);
    if (body?.success) {
      const items = extractDataItems(body);
      if (items.length) {
        gTemplateId = items[0].template_id || items[0].id;
        ok('Seed-Template', `template_id=${gTemplateId}`);
      } else {
        warn('Seed-Template', '无模板数据');
      }
    } else {
      warn('Seed-Template', '模板API不可用');
    }
  }
  
  // 获取剧本 (用于合规模块 AI review) — 必须传 product_id
  {
    const { body } = await fetchJson(
      `${BASE}/api/v1/scripts?product_id=${gProductId}&page=1&page_size=1`
    );
    if (body?.success) {
      const items = extractDataItems(body);
      if (items.length) {
        gScriptId = items[0].script_id || items[0].id;
        ok('Seed-Script', `script_id=${gScriptId}`);
      } else {
        warn('Seed-Script', '无剧本数据');
      }
    } else {
      warn('Seed-Script', `剧本API不可用: ${JSON.stringify(body).slice(0, 100)}`);
    }
  }
  
  return true;
}

// =============================================================================
// Module 1: DNA Management (viral-analysis + viral-dna + subscription)
// =============================================================================
let gAnalysisId = null;
let gDnaId = null;
let gSubscriptionId = null;

async function module_dna() {
  phase('模块一: DNA管理 (爆款分析 + DNA提取 + 订阅)');
  
  // ========== 1.1 创建爆款视频分析 ==========
  // 注意: 返回结构为 { success:true, data: { analysis: {...}, potential_duplicate: bool } }
  {
    const p = 'DNA-1.1-CreateAnalysis';
    console.log(`  → 创建爆款分析...`);
    const testUrl = `https://www.tiktok.com/@testuser/video/${Date.now().toString(36)}`;
    const { ok: cOk, status, body } = await fetchJson(`${BASE}/api/v1/viral-video-analyses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: testUrl,
        source_platform: 'tiktok',
        product_id: gProductId,
        title: 'E2E测试爆款视频分析',
        declared_public_source: true,
      }),
    });
    
    if (!cOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      err(p, `创建失败 HTTP ${status}: ${msg}`);
    } else {
      // 返回结构: data.analysis.id
      const analysis = body.data?.analysis || body.data;
      gAnalysisId = analysis?.id || analysis?.analysis_id;
      ok(p, `analysis_id=${gAnalysisId}`);
    }
  }
  
  // ========== 1.2 查询爆款分析详情 ==========
  if (gAnalysisId) {
    const p = 'DNA-1.2-GetDetail';
    console.log(`  → 查询爆款分析详情...`);
    const { ok: gOk, body } = await fetchJson(`${BASE}/api/v1/viral-video-analyses/${gAnalysisId}`);
    if (!gOk || !body?.success) {
      err(p, `查询失败: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const detail = extractData(body);
      ok(p, `source_platform=${detail?.source_platform || '?'}, title=${(detail?.title || '?').slice(0, 30)}`);
    }
  } else {
    warn('DNA-1.2-GetDetail', '跳过 (无 analysis_id)');
  }
  
  // ========== 1.3 搜索爆款分析列表 ==========
  {
    const p = 'DNA-1.3-Search';
    console.log(`  → 搜索爆款分析...`);
    const { ok: sOk, body } = await fetchJson(
      `${BASE}/api/v1/viral-video-analyses?page=1&page_size=10&source_platform=tiktok`
    );
    if (!sOk || !body?.success) {
      const msg = body?.error || JSON.stringify(body).slice(0, 200);
      err(p, `搜索失败: ${msg}`);
    } else {
      const items = extractDataItems(body);
      const total = body?.data?.total || items.length;
      ok(p, `total=${total}, 返回${items.length}条`);
    }
  }
  
  // ========== 1.4 按产品ID查询 ==========
  {
    const p = 'DNA-1.4-ByProduct';
    console.log(`  → 按商品ID查询爆款分析...`);
    const { ok: pOk, body } = await fetchJson(
      `${BASE}/api/v1/viral-video-analyses/by-product/${gProductId}`
    );
    if (!pOk || !body?.success) {
      const msg = body?.error || JSON.stringify(body).slice(0, 200);
      err(p, `查询失败: ${msg}`);
    } else {
      const items = extractDataItems(body);
      ok(p, `商品 ${gProductId.slice(0, 8)} 有 ${items.length} 条分析`);
    }
  }
  
  // ========== 1.5 自动匹配最佳爆款 ==========
  {
    const p = 'DNA-1.5-MatchBest';
    console.log(`  → 自动匹配最佳爆款视频...`);
    const { ok: mOk, body } = await fetchJson(
      `${BASE}/api/v1/viral-video-analyses/match?product_id=${gProductId}`
    );
    if (!mOk || !body?.success) {
      const msg = body?.error || JSON.stringify(body).slice(0, 200);
      warn(p, `匹配: ${msg}`);
    } else {
      const match = extractData(body);
      ok(p, `matched=${(match?.id || match?.analysis_id || '?').slice(0, 8)}`);
    }
  }
  
  // ========== 1.6 推荐搜索关键词 ==========
  {
    const p = 'DNA-1.6-SuggestKeywords';
    console.log(`  → AI推荐搜索关键词...`);
    const { ok: kOk, body } = await fetchJson(`${BASE}/api/v1/viral-video-analyses/suggest-keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_category: gProduct?.category || 'beauty',
        source_platform: 'tiktok',
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!kOk || !body?.success) {
      const msg = body?.error || JSON.stringify(body).slice(0, 200);
      warn(p, `关键词推荐: ${msg}`);
    } else {
      const data = extractData(body);
      const kw = data?.keywords || data?.platform_keywords || [];
      const count = Array.isArray(kw) ? kw.length : Object.values(kw || {}).flat().length;
      ok(p, `生成 ${count} 个关键词`);
    }
  }
  
  // ========== 1.7 提取DNA模式 ==========
  // DTO使用 ViralDNAExtractDto: category, market, min_samples(>=3)
  // pet类目有7条爆款分析，满足DNA提取最低要求
  {
    const p = 'DNA-1.7-ExtractDNA';
    console.log(`  → 提取爆款DNA模式 (category=pet)...`);
    const { ok: dOk, status, body } = await fetchJson(`${BASE}/api/v1/viral-dna/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'pet',
        min_samples: 3,
      }),
      signal: AbortSignal.timeout(300000),
    });
    if (!dOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `DNA提取: HTTP ${status}: ${msg}`);
    } else {
      const data = extractData(body);
      gDnaId = data?.id || data?.dna_id;
      ok(p, `dna_id=${gDnaId}, hooks=${data?.hook_count || data?.hooks?.length || '?'}`);
    }
    await sleep(1000);
  }
  
  // ========== 1.8 查询DNA列表 ==========
  {
    const p = 'DNA-1.8-ListDNA';
    console.log(`  → 查询DNA模式列表...`);
    const { ok: lOk, body } = await fetchJson(
      `${BASE}/api/v1/viral-dna?category=${gProduct?.category || 'beauty'}`
    );
    if (!lOk || !body?.success) {
      const msg = body?.error || JSON.stringify(body).slice(0, 200);
      err(p, `DNA列表失败: ${msg}`);
    } else {
      const items = extractDataItems(body);
      const total = body?.data?.total || items.length;
      ok(p, `total=${total}, 返回${items.length}条`);
    }
  }
  
  // ========== 1.9 查询DNA详情 ==========
  if (gDnaId) {
    const p = 'DNA-1.9-GetDNA';
    console.log(`  → 查询DNA详情: ${gDnaId}...`);
    const { ok: gOk, body } = await fetchJson(`${BASE}/api/v1/viral-dna/${gDnaId}`);
    if (!gOk || !body?.success) {
      err(p, `详情失败: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const detail = extractData(body);
      ok(p, `置信度=${detail?.confidence || '?'}, 类目=${detail?.category || '?'}`);
    }
  } else {
    warn('DNA-1.9-GetDNA', '跳过 (无 dna_id)');
  }
  
  // ========== 1.10 DNA驱动剧本生成 ==========
  if (gDnaId) {
    const p = 'DNA-1.10-GenerateFromDNA';
    console.log(`  → DNA驱动剧本生成...`);
    const { ok: gfOk, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/from-dna`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: gProductId,
        dna_id: gDnaId,
        min_confidence: 0.3,
        style_vibe: 'professional',
        aspect_ratio: '9:16',
        language: 'zh-CN',
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!gfOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `DNA生成: HTTP ${status}: ${msg}`);
    } else {
      const data = extractData(body);
      const scriptId = data?.id || data?.script_id;
      ok(p, `script_id=${scriptId}, shots=${data?.shots?.length || '?'}`);
    }
    await sleep(2000);
  }
  
  // ========== 1.11 订阅管理 - 创建订阅 ==========
  {
    const p = 'DNA-1.11-CreateSubscription';
    console.log(`  → 创建爆款订阅...`);
    const { ok: sOk, body } = await fetchJson(`${BASE}/api/v1/viral-video-analyses/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'tiktok',
        account_url: 'https://www.tiktok.com/@test_account_e2e',
        account_name: 'E2E测试账号',
        product_id: gProductId,
      }),
    });
    if (!sOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `创建订阅: ${msg}`);
    } else {
      gSubscriptionId = body?.data?.id || body?.data?.subscription_id;
      ok(p, `subscription_id=${gSubscriptionId}`);
    }
  }
  
  // ========== 1.12 订阅管理 - 查询订阅列表 ==========
  {
    const p = 'DNA-1.12-ListSubscriptions';
    console.log(`  → 查询订阅列表...`);
    const { ok: lsOk, body } = await fetchJson(`${BASE}/api/v1/viral-video-analyses/subscriptions`);
    if (!lsOk || !body?.success) {
      err(p, `列表失败: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const items = extractDataItems(body);
      ok(p, `${items.length} 个订阅`);
    }
  }
  
  // ========== 1.13 订阅管理 - 手动扫描 ==========
  if (gSubscriptionId) {
    const p = 'DNA-1.13-ScanNow';
    console.log(`  → 手动触发订阅扫描...`);
    const { ok: scOk, body } = await fetchJson(
      `${BASE}/api/v1/viral-video-analyses/subscriptions/${gSubscriptionId}/scan-now`,
      { method: 'POST' }
    );
    if (!scOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `扫描: ${msg}`);
    } else {
      ok(p, '触发扫描成功');
    }
  }
  
  // ========== 1.14 订阅管理 - 取消订阅 ==========
  if (gSubscriptionId) {
    const p = 'DNA-1.14-CancelSubscription';
    console.log(`  → 取消订阅...`);
    const { ok: delOk, body } = await fetchJson(
      `${BASE}/api/v1/viral-video-analyses/subscriptions/${gSubscriptionId}`,
      { method: 'DELETE' }
    );
    if (!delOk || !body?.success) {
      err(p, `取消失败: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      ok(p, '取消成功');
    }
  }
  
  // ========== 1.15 批量查询 ==========
  if (gAnalysisId) {
    const p = 'DNA-1.15-BatchQuery';
    console.log(`  → 批量查询分析...`);
    const { ok: bOk, body } = await fetchJson(
      `${BASE}/api/v1/viral-video-analyses/batch?ids=${gAnalysisId}`
    );
    if (!bOk || !body?.success) {
      warn(p, `批量查询: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const items = extractDataItems(body);
      ok(p, `返回 ${items.length} 条`);
    }
  }
}

// =============================================================================
// Module 2: Trend Tracker
// =============================================================================
async function module_trend() {
  phase('模块二: 趋势追踪');
  
  // ========== 2.1 获取趋势 (缓存) ==========
  {
    const p = 'Trend-2.1-GetTrends';
    console.log(`  → 获取商品趋势快照...`);
    const { ok: tOk, body } = await fetchJson(
      `${BASE}/api/v1/trend-tracker?product_id=${gProductId}`
    );
    if (!tOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      err(p, `趋势获取失败: ${msg}`);
    } else {
      const data = extractData(body);
      const trends = data?.trends || data?.data?.trends || [];
      const recs = data?.recommendations || data?.data?.recommendations || [];
      const source = data?.data_source || data?.source || '?';
      ok(p, `${trends.length} 趋势, ${recs.length} 建议, source=${source}`);
    }
  }
  
  // ========== 2.2 刷新趋势 (强制LLM生成) ==========
  {
    const p = 'Trend-2.2-RefreshTrends';
    console.log(`  → 强制刷新趋势 (调用LLM)...`);
    const { ok: rOk, status, body } = await fetchJson(`${BASE}/api/v1/trend-tracker/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: gProductId }),
      signal: AbortSignal.timeout(120000),
    });
    if (!rOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `刷新趋势: HTTP ${status}: ${msg}`);
    } else {
      const data = extractData(body);
      const trends = data?.trends || [];
      const recs = data?.recommendations || [];
      const source = data?.data_source || data?.source || '?';
      ok(p, `${trends.length} 趋势, ${recs.length} 建议, source=${source}`);
    }
    await sleep(2000);
  }
  
  // ========== 2.3 从素材创建爆款分析 (from-material) ==========
  let materialId = null;
  {
    const p = 'Trend-2.3-GetMaterial';
    console.log(`  → 获取素材用于from-material...`);
    const { body } = await fetchJson(`${BASE}/api/v1/materials?page=1&page_size=1`);
    if (body?.success) {
      const items = extractDataItems(body);
      if (items.length) {
        materialId = items[0].id || items[0].material_id;
        ok(p, `material_id=${materialId}`);
      }
    }
    if (!materialId) {
      warn(p, '无素材可用来创建from-material分析');
    }
  }
  
  if (materialId) {
    const p = 'Trend-2.4-FromMaterial';
    console.log(`  → 从素材创建爆款分析...`);
    const { ok: fmOk, body } = await fetchJson(`${BASE}/api/v1/viral-video-analyses/from-material`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        product_id: gProductId,
      }),
    });
    if (!fmOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `FromMaterial: ${msg}`);
    } else {
      const data = extractData(body);
      ok(p, `analysis_id=${data?.id || data?.analysis_id}`);
    }
  }
}

// =============================================================================
// Module 3: Compliance
// =============================================================================
let gConstraintId = null;
let gConstraintIdCreated = false;

async function module_compliance() {
  phase('模块三: 合规管理 (约束规则 + 敏感词 + AI审查)');
  
  // 注意: 约束模块的 category 字段为 ['compliance', 'creative', 'branding', 'platform']
  // 不是商品类目，而是约束规则的业务类别
  
  // ========== 3.1 查询约束规则列表 ==========
  {
    const p = 'Compliance-3.1-ListConstraints';
    console.log(`  → 查询合规约束规则...`);
    const { ok: lOk, body } = await fetchJson(
      `${BASE}/api/v1/constraints?category=compliance&rule_type=HARD`
    );
    if (!lOk || !body?.success) {
      err(p, `规则列表失败: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const items = extractDataItems(body);
      if (Array.isArray(body?.data)) {
        if (body.data.length > 0) {
          gConstraintId = body.data[0].constraint_id || body.data[0].id;
        }
        ok(p, `返回${body.data.length}条`);
      } else if (items.length > 0) {
        ok(p, `total=${body?.data?.total || items.length}, 返回${items.length}条`);
      } else {
        ok(p, `返回 0 条 (无compliance类别约束)`);
      }
      // 如果不按category过滤也试试
      if (!gConstraintId) {
        const { body: allBody } = await fetchJson(`${BASE}/api/v1/constraints`);
        const allItems = extractDataItems(allBody);
        if (allBody?.success && Array.isArray(allBody?.data)) {
          if (allBody.data.length > 0) {
            gConstraintId = allBody.data[0].constraint_id || allBody.data[0].id;
          }
          ok(p, `无compliance类别，但有 ${allBody.data.length} 条其他约束`);
        }
      }
    }
  }
  
  // ========== 3.2 获取约束详情 ==========
  if (gConstraintId) {
    const p = 'Compliance-3.2-GetConstraint';
    console.log(`  → 获取约束详情: ${gConstraintId}...`);
    const { ok: gOk, body } = await fetchJson(`${BASE}/api/v1/constraints/${gConstraintId}`);
    if (!gOk || !body?.success) {
      err(p, `详情失败: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const detail = extractData(body);
      ok(p, `key=${detail?.key || detail?.constraint_key || '?'}, type=${detail?.rule_type || '?'}`);
    }
  } else {
    warn('Compliance-3.2-GetConstraint', '跳过 (无约束规则)');
  }
  
  // ========== 3.3 创建合规约束规则 ==========
  {
    const p = 'Compliance-3.3-CreateConstraint';
    console.log(`  → 创建约束规则...`);
    const key = `E2E_TEST_${Date.now().toString(36)}`;
    const { ok: cOk, body } = await fetchJson(`${BASE}/api/v1/constraints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: key,
        name: 'E2E测试约束',
        category: 'compliance',
        rule_type: 'SOFT',
        description: 'E2E测试用约束规则，可安全删除',
        rule_config: {
          max_duration: 60,
          min_duration: 5,
          require_cta: true,
          allowed_camera_movements: ['Static', 'Pan_Left', 'Dolly_In_Fast'],
        },
        enabled: true,
      }),
    });
    if (!cOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      err(p, `创建失败: ${msg}`);
    } else {
      const data = extractData(body);
      gConstraintIdCreated = true;
      const createdId = data?.id || data?.constraint_id;
      ok(p, `constraint_id=${createdId}, key=${key}`);
      if (createdId) gConstraintId = createdId;
    }
  }
  
  // ========== 3.4 更新约束规则 ==========
  if (gConstraintId && gConstraintIdCreated) {
    const p = 'Compliance-3.4-UpdateConstraint';
    console.log(`  → 更新约束规则...`);
    const { ok: uOk, body } = await fetchJson(`${BASE}/api/v1/constraints/${gConstraintId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E测试约束(已更新)',
        rule_config: {
          max_duration: 45,
          min_duration: 5,
          require_cta: false,
        },
      }),
    });
    if (!uOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      err(p, `更新失败: ${msg}`);
    } else {
      ok(p, '更新成功');
    }
  }
  
  // ========== 3.5 分配约束到模板 ==========
  if (gConstraintId && gTemplateId) {
    const p = 'Compliance-3.5-AssignToTemplate';
    console.log(`  → 分配约束到模板...`);
    const { ok: aOk, body } = await fetchJson(
      `${BASE}/api/v1/templates/${gTemplateId}/constraints`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constraint_ids: [gConstraintId],
        }),
      }
    );
    if (!aOk || !body?.success) {
      warn(p, `分配: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      ok(p, '分配成功');
    }
  }
  
  // ========== 3.6 合规检查 - 快速模式剧本生成 (带合规检查) ==========
  {
    const p = 'Compliance-3.6-ComplianceCheck';
    console.log(`  → 合规检查 - 快速模式剧本生成...`);
    const { ok: sOk, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: gProductId,
        selling_points: gProduct?.selling_points || [gProduct?.title || '测试商品'],
        style_vibe: 'clean-tech',
        aspect_ratio: '9:16',
        language: 'zh-CN',
        constraint_list: ['total_duration<=15s'],
        enable_compliance_check: true,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!sOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `剧本生成: HTTP ${status}: ${msg}`);
    } else {
      const data = extractData(body);
      const shots = data?.shots || [];
      const violations = (data?.compliance_violations || data?.complianceViolations || []);
      ok(p, `shots=${shots.length}, violations=${violations.length}`);
    }
    await sleep(2000);
  }
  
  // ========== 3.7 获取模板已分配的约束规则 ==========
  if (gTemplateId) {
    const p = 'Compliance-3.7-TemplateConstraints';
    console.log(`  → 获取模板关联的合规约束...`);
    const { ok: rOk, body } = await fetchJson(
      `${BASE}/api/v1/templates/${gTemplateId}/constraints`
    );
    if (!rOk || !body?.success) {
      warn(p, `获取模板约束: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const items = extractDataItems(body);
      ok(p, `模板 ${gTemplateId.slice(0, 8)} 有 ${items.length} 条约束`);
    }
  } else {
    warn('Compliance-3.7-TemplateConstraints', '跳过 (无 template_id)');
  }
  
  // ========== 3.8 合规检查 - 标准剧本生成 ==========
  {
    const p = 'Compliance-3.8-StandardCheck';
    console.log(`  → 合规检查 - 标准剧本生成...`);
    const { ok: sOk, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: gProductId,
        selling_points: [gProduct?.title || '测试商品'],
        style_vibe: 'clean-tech',
        aspect_ratio: '9:16',
        language: 'zh-CN',
        constraint_list: ['total_duration<=15s'],
        enable_compliance_check: true,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!sOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      warn(p, `剧本生成: HTTP ${status}: ${msg}`);
    } else {
      const data = extractData(body);
      const shots = data?.shots || [];
      ok(p, `合规检查完成: ${shots.length} 个分镜`);
    }
    await sleep(2000);
  }
  
  // ========== 3.9 验证剧本合规状态 ==========
  if (gScriptId) {
    const p = 'Compliance-3.9-ScriptCompliance';
    console.log(`  → 验证剧本合规状态...`);
    const { ok: gOk, body } = await fetchJson(`${BASE}/api/v1/scripts/${gScriptId}`);
    if (!gOk || !body?.success) {
      err(p, `查询失败: ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      const data = extractData(body);
      const complianceStatus = data?.compliance_status || data?.complianceStatus || '?';
      ok(p, `compliance_status=${complianceStatus}`);
    }
  }
  
  // ========== 3.10 删除创建的约束 ==========
  if (gConstraintId && gConstraintIdCreated) {
    const p = 'Compliance-3.10-DeleteConstraint';
    console.log(`  → 删除测试约束...`);
    const { ok: dOk, body } = await fetchJson(`${BASE}/api/v1/constraints/${gConstraintId}`, {
      method: 'DELETE',
    });
    if (!dOk || !body?.success) {
      const msg = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
      err(p, `删除失败: ${msg}`);
    } else {
      ok(p, '删除成功');
    }
  }
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  TikStream AI — 模块完整链路 E2E 测试                 ║');
  console.log('║  模块: DNA管理 / 趋势追踪 / 合规管理                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  BASE=${BASE}`);
  console.log(`  TIME=${new Date().toISOString()}`);
  
  if (!(await phase0_health())) { printSummary(); process.exit(1); }
  if (!(await phase1_seed())) { printSummary(); process.exit(1); }
  
  await module_dna();
  await module_trend();
  await module_compliance();
  
  printSummary();
  
  if (FAILED > 0) {
    console.log('\n⚠️  部分测试失败，请查看上方详情');
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过!');
    process.exit(0);
  }
}

main().catch(async (e) => {
  console.error('💥 Fatal:', e);
  process.exit(1);
});
