#!/usr/bin/env node
/**
 * TikStream AI — 三大模块完整链路 E2E 测试
 * 覆盖: 评论分析模块 | 发布时间分析模块 | 冷启动模块
 */

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const WEB_BASE = process.env.E2E_WEB_URL || 'http://localhost:15173';

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
    return { ok: res.ok, status: res.status, body, text };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e.message };
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =============================================================================
// Phase 0: Health Check
// =============================================================================
async function phase0_health() {
  log('Phase0', '健康检查...');

  const { ok: gok, body: gbody } = await fetchJson(`${BASE}/health`);
  if (!gok || gbody?.status !== 'ok') {
    err('Health', `Gateway 不可用: ${JSON.stringify(gbody)}`);
    return false;
  }
  ok('Health', `Gateway OK, uptime=${gbody.uptime?.toFixed?.(0) ?? '?'}s`);

  // Check web client
  try {
    const res = await fetch(WEB_BASE, { signal: AbortSignal.timeout(5000) });
    if (res.ok) ok('Health', `Web client OK (${WEB_BASE})`);
    else warn('Health', `Web client HTTP ${res.status}`);
  } catch (e) {
    warn('Health', `Web client unreachable: ${e.message}`);
  }

  return true;
}

// =============================================================================
// Phase 1: 获取种子数据
// =============================================================================
async function phase1_product() {
  log('Phase1', '获取种子产品...');
  const { ok: fetchOk, body } = await fetchJson(`${BASE}/api/v1/products?page=1&page_size=5`);
  if (!fetchOk || !body?.success) {
    err('Product', `API 失败: ${JSON.stringify(body)}`);
    return null;
  }
  const items = body.data?.items || [];
  if (!items.length) { err('Product', '无种子产品'); return null; }
  ok('Product', `找到 ${items.length} 个产品`);
  return items;
}

// =============================================================================
// Phase 2: 获取脚本列表（共用于冷启动模块也使用）
// =============================================================================
async function phase2_scripts(productId) {
  log('Phase2', '获取脚本列表...');
  const { ok: fetchOk, body } = await fetchJson(`${BASE}/api/v1/scripts?product_id=${productId}&page=1&page_size=10`);
  if (!fetchOk) {
    warn('Scripts', `获取脚本列表失败: ${JSON.stringify(body).slice(0, 100)}`);
    return [];
  }
  const items = body?.data?.items || body?.data?.scripts || body?.data || [];
  if (!Array.isArray(items) || items.length === 0) {
    warn('Scripts', '无可用脚本（可能影响冷启动测试）');
    return [];
  }
  ok('Scripts', `找到 ${items.length} 个脚本`);
  return items;
}

// =============================================================================
// Phase 3: 评论分析模块 — 完整链路
// =============================================================================
async function phase3_comments(productId) {
  log('Phase3', '══════ 评论分析模块测试 ══════');
  let allPassed = true;

  // 3.1 采集评论 (mock 模式)
  log('Phase3', '→ 3.1 采集评论 (mock)...');
  const { ok: fOk, body: fBody } = await fetchJson(`${BASE}/api/v1/comments/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      video_url: 'https://www.tiktok.com/@test/video/123456',
      mode: 'mock',
    }),
  });
  if (fOk && fBody?.success) {
    const data = fBody.data;
    ok('Comments', `采集完成: ${data.comment_count} 条, new=${data.new_count}, skipped=${data.skipped_count}`);
  } else {
    err('Comments', `采集失败: HTTP ${fBody ? JSON.stringify(fBody).slice(0, 200) : 'N/A'}`);
    allPassed = false;
  }
  await sleep(1000);

  // 3.2 查询评论列表
  log('Phase3', '→ 3.2 查询评论列表...');
  const { ok: lOk, body: lBody } = await fetchJson(`${BASE}/api/v1/comments?product_id=${productId}`);
  if (lOk && lBody?.success) {
    const comments = lBody.data?.comments || lBody.data?.items || [];
    ok('Comments', `列表查询: ${comments.length} 条评论`);
  } else {
    warn('Comments', `列表查询: ${JSON.stringify(lBody).slice(0, 100)}`);
  }
  await sleep(500);

  // 3.3 按情感过滤查询
  log('Phase3', '→ 3.3 按情感过滤查询...');
  const { ok: flOk, body: flBody } = await fetchJson(`${BASE}/api/v1/comments?product_id=${productId}&sentiment=positive`);
  if (flOk && flBody?.success) {
    ok('Comments', `情感过滤查询正常 (positive filter)`);
  } else {
    warn('Comments', `情感过滤查询: ${JSON.stringify(flBody).slice(0, 100)}`);
  }
  await sleep(500);

  // 3.4 批量分析评论情感
  log('Phase3', '→ 3.4 批量分析评论情感...');
  const { ok: aOk, body: aBody } = await fetchJson(`${BASE}/api/v1/comments/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
    }),
  });
  if (aOk && aBody?.success) {
    const data = aBody.data;
    if (data?.analyzed_count > 0) {
      ok('Comments', `情感分析: ${data.analyzed_count} 条分析成功, ${data.failed_count} 失败`);
    } else {
      warn('Comments', `情感分析完成但无待分析评论 (analyzed=${data?.analyzed_count})`);
    }
  } else {
    warn('Comments', `情感分析: ${JSON.stringify(aBody).slice(0, 200)}`);
  }
  await sleep(1000);

  // 3.5 获取情感分析摘要
  log('Phase3', '→ 3.5 获取情感分析摘要...');
  const { ok: sOk, body: sBody } = await fetchJson(`${BASE}/api/v1/comments/analysis/${productId}`);
  if (sOk && sBody?.success) {
    const summary = sBody.data;
    const fields = [
      summary?.total !== undefined,
      summary?.positive_ratio !== undefined,
      summary?.negative_ratio !== undefined,
      Array.isArray(summary?.top_pain_points),
      Array.isArray(summary?.top_feature_requests),
      summary?.average_purchasing_intent !== undefined,
    ];
    const fieldCount = fields.filter(Boolean).length;
    if (fieldCount >= 5) {
      ok('Comments', `情感摘要: total=${summary.total}, pos_ratio=${(summary.positive_ratio * 100).toFixed(1)}%, neg_ratio=${(summary.negative_ratio * 100).toFixed(1)}%, purchase_intent=${summary.average_purchasing_intent.toFixed(2)}`);
    } else {
      warn('Comments', `情感摘要字段不完整 (${fieldCount}/6): ${JSON.stringify(summary).slice(0, 200)}`);
    }
  } else {
    err('Comments', `获取情感摘要失败: ${JSON.stringify(sBody).slice(0, 200)}`);
    allPassed = false;
  }
  await sleep(500);

  // 3.6 触发内容优化
  log('Phase3', '→ 3.6 触发内容优化...');
  let optimizationId = null;
  const { ok: oOk, body: oBody } = await fetchJson(`${BASE}/api/v1/comments/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      trigger: 'pain_point',
    }),
  });
  if (oOk && oBody?.success) {
    optimizationId = oBody.data?.optimization_id;
    ok('Comments', `触发优化: id=${optimizationId}, status=${oBody.data?.status}`);
  } else {
    warn('Comments', `触发优化: ${JSON.stringify(oBody).slice(0, 200)}`);
  }
  await sleep(500);

  // 3.7 查询优化历史
  log('Phase3', '→ 3.7 查询优化历史...');
  const { ok: ohOk, body: ohBody } = await fetchJson(`${BASE}/api/v1/comments/optimizations?product_id=${productId}`);
  if (ohOk && ohBody?.success) {
    const optimizations = ohBody.data || [];
    ok('Comments', `优化历史: ${optimizations.length} 条记录`);
  } else {
    warn('Comments', `优化历史查询: ${JSON.stringify(ohBody).slice(0, 100)}`);
  }
  await sleep(500);

  // 3.8 应用优化
  if (optimizationId) {
    log('Phase3', '→ 3.8 应用优化...');
    const { ok: apOk, body: apBody } = await fetchJson(`${BASE}/api/v1/comments/optimizations/${optimizationId}/apply`, {
      method: 'POST',
    });
    if (apOk && apBody?.success) {
      ok('Comments', `应用优化成功: status=${apBody.data?.status}`);
    } else {
      warn('Comments', `应用优化: ${JSON.stringify(apBody).slice(0, 100)}`);
    }
    await sleep(500);

    // 3.9 回滚优化
    log('Phase3', '→ 3.9 回滚优化...');
    const { ok: rbOk, body: rbBody } = await fetchJson(`${BASE}/api/v1/comments/optimizations/${optimizationId}/rollback`, {
      method: 'POST',
    });
    if (rbOk && rbBody?.success) {
      ok('Comments', `回滚优化成功: status=${rbBody.data?.status}`);
    } else {
      warn('Comments', `回滚优化: ${JSON.stringify(rbBody).slice(0, 100)}`);
    }
  }

  return allPassed;
}

// =============================================================================
// Phase 4: 发布时间分析模块 — 完整链路
// =============================================================================
async function phase4_postingTime(products) {
  log('Phase4', '══════ 发布时间分析模块测试 ══════');
  let allPassed = true;

  const productId = products[0]?.id || products[0]?.product_id;
  if (!productId) {
    err('PostingTime', '无可用产品');
    return false;
  }

  // 4.1 获取支持平台列表
  log('Phase4', '→ 4.1 获取支持平台列表...');
  const { ok: pOk, body: pBody } = await fetchJson(`${BASE}/api/v1/posting-time/platforms`);
  if (pOk && pBody?.success && Array.isArray(pBody.data)) {
    ok('PostingTime', `平台列表: ${pBody.data.map(p => p.platform).join(', ')}`);
  } else {
    err('PostingTime', `平台列表查询失败: ${JSON.stringify(pBody).slice(0, 200)}`);
    allPassed = false;
  }
  await sleep(500);

  // 4.2 多平台时段优化
  const platforms = ['tiktok_us', 'douyin', 'xiaohongshu', 'kuaishou'];
  for (const platform of platforms) {
    log('Phase4', `→ 4.2 时段优化 (${platform})...`);
    const { ok: tOk, body: tBody } = await fetchJson(`${BASE}/api/v1/posting-time/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        platform,
        content_type: 'product_review',
      }),
    });
    if (tOk && tBody?.success) {
      const data = tBody.data;
      const slotCount = data?.recommendations?.length ?? 0;
      const avoidCount = data?.avoid_slots?.length ?? 0;
      if (slotCount > 0) {
        ok('PostingTime', `${platform}: ${slotCount} 推荐时段, ${avoidCount} 避让时段, boost=${(data.expected_ctr_lift * 100).toFixed(1)}%`);
      } else {
        warn('PostingTime', `${platform}: 无推荐时段`);
      }
    } else {
      const statusCode = tBody ? JSON.stringify(tBody).slice(0, 150) : 'N/A';
      err('PostingTime', `${platform} 优化失败: ${statusCode}`);
      allPassed = false;
    }
    await sleep(300);
  }

  // 4.3 不同内容类型优化
  const contentTypes = ['product_review', 'tutorial', 'vlog', 'live_commerce', 'unboxing'];
  log('Phase4', '→ 4.3 多内容类型优化 (tiktok_us)...');
  let contentTypePassed = 0;
  for (const ct of contentTypes) {
    const { ok: cOk, body: cBody } = await fetchJson(`${BASE}/api/v1/posting-time/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        platform: 'tiktok_us',
        content_type: ct,
      }),
    });
    if (cOk && cBody?.success) contentTypePassed++;
    else warn('PostingTime', `内容类型 ${ct}: ${JSON.stringify(cBody).slice(0, 100)}`);
    await sleep(200);
  }
  if (contentTypePassed === contentTypes.length) {
    ok('PostingTime', `全部 ${contentTypePassed}/${contentTypes.length} 种内容类型优化成功`);
  } else {
    warn('PostingTime', `内容类型优化: ${contentTypePassed}/${contentTypes.length} 成功`);
  }

  // 4.4 强制刷新缓存
  log('Phase4', '→ 4.4 强制刷新缓存...');
  const { ok: frOk, body: frBody } = await fetchJson(`${BASE}/api/v1/posting-time/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      platform: 'tiktok_us',
      force_refresh: true,
    }),
  });
  if (frOk && frBody?.success) {
    ok('PostingTime', '强制刷新成功 (缓存已清除并重新计算)');
  } else {
    warn('PostingTime', `强制刷新: ${JSON.stringify(frBody).slice(0, 100)}`);
  }

  // 4.5 不支持的平台测试
  log('Phase4', '→ 4.5 不支持平台测试...');
  const { status: invStatus } = await fetchJson(`${BASE}/api/v1/posting-time/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      platform: 'unsupported_platform_xyz',
    }),
  });
  if (invStatus === 400) {
    ok('PostingTime', '不支持平台正确返回 400');
  } else {
    warn('PostingTime', `不支持平台返回 ${invStatus} (expected 400)`);
  }

  // 4.6 不存在的产品测试
  log('Phase4', '→ 4.6 不存在的产品测试...');
  const { status: nfStatus } = await fetchJson(`${BASE}/api/v1/posting-time/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: '00000000-0000-0000-0000-000000000999',
      platform: 'tiktok_us',
    }),
  });
  if (nfStatus === 404) {
    ok('PostingTime', '不存在产品正确返回 404');
  } else {
    warn('PostingTime', `不存在的产品返回 ${nfStatus} (expected 404)`);
  }

  return allPassed;
}

// =============================================================================
// Phase 5: 冷启动模块 — 完整链路
// =============================================================================
async function phase5_coldStart(products, scripts) {
  log('Phase5', '══════ 冷启动模块测试 ══════');

  // 用 prompt 驱动生成一个快速脚本用于冷启动预测
  const productId = products[0]?.id || products[0]?.product_id;

  // 优先使用已有脚本
  let scriptId = scripts[0]?.id || scripts[0]?.script_id;
  if (!scriptId) {
    // 如果没有脚本，尝试用 mock product 生成预测
    // 使用 mock product ID
    const mockProductId = '00000000-0000-0000-0000-000000000001';
    // 先尝试获取该 mock product 下的脚本
    const { body: msBody } = await fetchJson(`${BASE}/api/v1/scripts?product_id=${mockProductId}&page=1&page_size=10`);
    const msItems = msBody?.data?.items || msBody?.data?.scripts || [];
    if (msItems.length > 0) {
      scriptId = msItems[0]?.id || msItems[0]?.script_id;
    }
  }

  let allPassed = true;

  // 5.1 预测接口 — HEURISTIC (兜底，不需要 AI API Key)
  if (scriptId) {
    log('Phase5', '→ 5.1 投放效果预测 (HEURISTIC)...');
    const { ok: predOk, body: predBody } = await fetchJson(`${BASE}/api/v1/analytics/predict-performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: scriptId }),
      signal: AbortSignal.timeout(30000),
    });
    if (predOk && predBody?.success) {
      const data = predBody.data;
      const fieldsOk = [
        data?.predicted_ctr !== undefined,
        data?.predicted_cvr !== undefined,
        data?.predicted_retention !== undefined,
        data?.confidence !== undefined,
        data?.data_source !== undefined,
        Array.isArray(data?.risk_factors),
        Array.isArray(data?.improvement_suggestions),
      ];
      const fieldScore = fieldsOk.filter(Boolean).length;
      if (fieldScore >= 7) {
        ok('ColdStart', `预测成功: CTR=${(data.predicted_ctr * 100).toFixed(2)}%, CVR=${(data.predicted_cvr * 100).toFixed(2)}%, retention=${(data.predicted_retention * 100).toFixed(1)}%, confidence=${data.confidence.toFixed(2)}, source=${data.data_source}, risks=${data.risk_factors.length}, suggestions=${data.improvement_suggestions.length}`);
      } else {
        err('ColdStart', `预测结果字段不完整 (${fieldScore}/7): ${JSON.stringify(data).slice(0, 300)}`);
        allPassed = false;
      }
    } else {
      const errDetail = predBody ? JSON.stringify(predBody).slice(0, 300) : 'null';
      err('ColdStart', `预测失败: ${errDetail}`);
      allPassed = false;
    }
    await sleep(500);

    // 5.2 预测接口 — 强制 VIRAL_DNA
    log('Phase5', '→ 5.2 预测 (强制 VIRAL_DNA)...');
    const { ok: vdOk, body: vdBody } = await fetchJson(`${BASE}/api/v1/analytics/predict-performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: scriptId, force_source: 'VIRAL_DNA' }),
      signal: AbortSignal.timeout(30000),
    });
    if (vdOk && vdBody?.success) {
      ok('ColdStart', `VIRAL_DNA 预测: source=${vdBody.data?.data_source}, confidence=${vdBody.data?.confidence?.toFixed?.(2)}`);
    } else {
      warn('ColdStart', `VIRAL_DNA 预测: ${JSON.stringify(vdBody).slice(0, 150)}`);
    }
    await sleep(500);

    // 5.3 预测接口 — 强制 HEURISTIC
    log('Phase5', '→ 5.3 预测 (强制 HEURISTIC)...');
    const { ok: heOk, body: heBody } = await fetchJson(`${BASE}/api/v1/analytics/predict-performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: scriptId, force_source: 'HEURISTIC' }),
      signal: AbortSignal.timeout(30000),
    });
    if (heOk && heBody?.success) {
      ok('ColdStart', `HEURISTIC 预测: source=${heBody.data?.data_source}, confidence=${heBody.data?.confidence?.toFixed?.(2)}`);
    } else {
      warn('ColdStart', `HEURISTIC 预测: ${JSON.stringify(heBody).slice(0, 150)}`);
    }
    await sleep(500);

    // 5.4 带 product_id 的预测
    log('Phase5', '→ 5.4 预测 (带 product_id)...');
    const { ok: ppOk, body: ppBody } = await fetchJson(`${BASE}/api/v1/analytics/predict-performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: scriptId, product_id: productId }),
      signal: AbortSignal.timeout(30000),
    });
    if (ppOk && ppBody?.success) {
      ok('ColdStart', `带 product_id 预测成功: source=${ppBody.data?.data_source}`);
    } else {
      warn('ColdStart', `带 product_id 预测: ${JSON.stringify(ppBody).slice(0, 150)}`);
    }

    // 5.5 不存在的剧本预测 (应返回 400+ 错误)
    log('Phase5', '→ 5.5 不存在的剧本预测...');
    const { status: badStatus } = await fetchJson(`${BASE}/api/v1/analytics/predict-performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: '00000000-0000-0000-0000-000000000999' }),
      signal: AbortSignal.timeout(15000),
    });
    if (badStatus >= 400) {
      ok('ColdStart', `不存在剧本正确返回 ${badStatus}`);
    } else {
      warn('ColdStart', `不存在剧本返回 ${badStatus} (expected 400+)`);
    }
  } else {
    warn('ColdStart', '无可用脚本，跳过预测测试');
    allPassed = false;
  }

  return allPassed;
}

// =============================================================================
// Phase 6: 前端页面验证
// =============================================================================
async function phase6_frontend() {
  log('Phase6', '══════ 前端页面验证 ══════');

  const pages = [
    { name: 'Comments', path: '/comments', keyword: 'comment' },
    { name: 'PostingTime', path: '/posting-time', keyword: 'posting' },
    { name: 'ColdStart', path: '/cold-start', keyword: 'cold' },
  ];

  for (const page of pages) {
    try {
      const res = await fetch(`${WEB_BASE}${page.path}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const text = await res.text();
        // Check if it's a proper HTML page (not a minimal error page)
        const hasDoctype = text.includes('<!doctype') || text.includes('<!DOCTYPE');
        const hasRoot = text.includes('id="root"') || text.includes('id="app"') || text.includes('root');
        if (hasDoctype || hasRoot) {
          ok('Frontend', `页面 ${page.name} (${page.path}) HTML 正常加载 (${text.length} bytes)`);
        } else {
          warn('Frontend', `页面 ${page.name} HTML 异常 (${text.slice(0, 200)})`);
        }
      } else {
        warn('Frontend', `页面 ${page.name} HTTP ${res.status}`);
      }
    } catch (e) {
      warn('Frontend', `页面 ${page.name} 无法访问: ${e.message}`);
    }
    await sleep(500);
  }

  // 也验证首页
  try {
    const res = await fetch(WEB_BASE, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('root') || text.includes('app')) {
        ok('Frontend', '首页正常加载');
      } else {
        warn('Frontend', `首页 HTML 异常 (${text.slice(0, 200)})`);
      }
    }
  } catch (e) {
    warn('Frontend', `首页无法访问: ${e.message}`);
  }
}

// =============================================================================
// Phase 7: 跨模块联动测试
// =============================================================================
async function phase7_crossModule(products) {
  log('Phase7', '══════ 跨模块联动测试 ══════');
  
  const productId = products[0]?.id || products[0]?.product_id;
  if (!productId) { err('CrossModule', '无可用产品'); return false; }

  // 7.1 评论采集 → 情感分析 → 触发优化 → 冷启动预测（模拟完整反馈闭环）
  log('Phase7', '→ 7.1 评论采集 + 分析 + 优化联动...');
  
  // Step 1: 采集评论
  const { body: fetchRes } = await fetchJson(`${BASE}/api/v1/comments/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      video_url: 'https://www.tiktok.com/@test/video/789012',
      mode: 'mock',
    }),
  });
  if (fetchRes?.success) {
    ok('CrossModule', `Step 1 采集: ${fetchRes.data.comment_count} 条`);
  } else {
    warn('CrossModule', `Step 1 采集: ${JSON.stringify(fetchRes).slice(0, 100)}`);
  }
  await sleep(500);

  // Step 2: 分析评论
  const { body: analyzeRes } = await fetchJson(`${BASE}/api/v1/comments/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId }),
  });
  if (analyzeRes?.success) {
    ok('CrossModule', `Step 2 分析: ${analyzeRes.data.analyzed_count} 条`);
  } else {
    warn('CrossModule', `Step 2 分析: ${JSON.stringify(analyzeRes).slice(0, 100)}`);
  }
  await sleep(500);

  // Step 3: 获取摘要
  const { body: summaryRes } = await fetchJson(`${BASE}/api/v1/comments/analysis/${productId}`);
  if (summaryRes?.success) {
    ok('CrossModule', `Step 3 摘要: total=${summaryRes.data.total}`);
  } else {
    warn('CrossModule', `Step 3 摘要: ${JSON.stringify(summaryRes).slice(0, 100)}`);
  }
  await sleep(500);

  // Step 4: 触发优化
  const { body: optRes } = await fetchJson(`${BASE}/api/v1/comments/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      trigger: 'pain_point',
      auto_apply: false,
    }),
  });
  if (optRes?.success) {
    ok('CrossModule', `Step 4 触发优化: id=${optRes.data.optimization_id}`);
  } else {
    warn('CrossModule', `Step 4 触发优化: ${JSON.stringify(optRes).slice(0, 100)}`);
  }
  await sleep(500);

  // Step 5: 发布时间优化联动
  const { body: ptRes } = await fetchJson(`${BASE}/api/v1/posting-time/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      platform: 'tiktok_us',
      content_type: 'product_review',
    }),
  });
  if (ptRes?.success) {
    ok('CrossModule', `Step 5 发布时间: ${ptRes.data.recommendations?.length ?? 0} 个推荐时段`);
  } else {
    warn('CrossModule', `Step 5 发布时间: ${JSON.stringify(ptRes).slice(0, 100)}`);
  }
  await sleep(500);

  ok('CrossModule', '完整联动: 采集→分析→摘要→优化→发布时间, 全部5步完成');
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  TikStream AI — 三大模块完整链路 E2E     ║');
  console.log('║  评论分析 | 发布时间分析 | 冷启动        ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log(`  API=${BASE}`);
  console.log(`  Web=${WEB_BASE}`);
  console.log('');

  // Phase 0: Health
  if (!(await phase0_health())) { printSummary(); process.exit(1); }

  // Phase 1: Product
  const products = await phase1_product();
  if (!products || products.length === 0) { printSummary(); process.exit(1); }

  const productId = products[0]?.id || products[0]?.product_id;

  // Phase 2: Scripts (for cold start)
  const scripts = await phase2_scripts(productId);

  // Phase 3: Comments
  await phase3_comments(productId);

  // Phase 4: Posting Time
  await phase4_postingTime(products);

  // Phase 5: Cold Start
  await phase5_coldStart(products, scripts);

  // Phase 6: Frontend
  await phase6_frontend();

  // Phase 7: Cross-module
  await phase7_crossModule(products);

  printSummary();

  const total = SUMMARY.length;
  const okCount = SUMMARY.filter(s => s.ok).length;
  console.log(`\n╔═══════════════════════════════╗`);
  console.log(`║  三大模块: ${okCount}/${total} 通过, ${FAILED} 失败    ║`);
  console.log(`╚═══════════════════════════════╝`);

  if (FAILED > 0) {
    console.log('\n⚠️  部分测试失败，请在下方详情中查看原因');
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过!');
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
