#!/usr/bin/env node
/**
 * 6种剧本生成模式 — 端到端验证
 */
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e.message };
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== 6种剧本生成模式 E2E 验证 ===\n');

  // 1. 获取种子产品
  console.log('[Setup] 获取种子产品...');
  const { body: pBody } = await fetchJson(`${BASE}/api/v1/products?page=1&page_size=1`);
  const product = pBody?.data?.items?.[0];
  if (!product) { console.error('[FAIL] 无产品数据'); process.exit(1); }
  console.log(`  产品: ${product.title} (${product.id})`);

  // 2. 获取模板 IDs（修正: 使用 template_id）
  console.log('[Setup] 获取模板...');
  const { body: tBody } = await fetchJson(`${BASE}/api/v1/templates?page=1&page_size=5`);
  const templates = tBody?.data?.items || [];
  const templateIds = templates.map(t => t.template_id || t.id).filter(Boolean);
  console.log(`  模板: ${templateIds.length} 个, 首个=${templateIds[0] || '无'}`);

  // 3. 获取爆款分析 IDs（修正: 使用 analysis_id）
  console.log('[Setup] 获取爆款分析...');
  const { body: vBody } = await fetchJson(`${BASE}/api/v1/viral-video-analyses?page=1&page_size=5`);
  const vItems = vBody?.data?.items || vBody?.data?.data || [];
  const viralIds = vItems.map(v => v.analysis_id || v.id).filter(Boolean);
  console.log(`  爆款分析: ${viralIds.length} 个, 首个=${viralIds[0] || '无'}`);

  const results = [];
  let pass = 0, fail = 0;

  // ---- quick ----
  {
    console.log('\n[1/6] quick 快速模式...');
    const { ok, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        selling_points: product.selling_points || [product.title],
        style_vibe: 'clean-tech',
        aspect_ratio: '9:16',
        constraint_list: ['total_duration<=15s'],
      }),
      signal: AbortSignal.timeout(120000),
    });
    const s = body?.data;
    const scriptId = s?.id || s?.script_id;
    if (ok && scriptId) {
      console.log(`  ✅ quick — id=${scriptId}, shots=${s?.shots?.length || '?'}, title="${s?.title || '?'}"`);
      pass++;
    } else {
      console.error(`  ❌ quick: HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
      fail++;
    }
    results.push({ mode: 'quick', ok: ok && !!scriptId, scriptId });
    await sleep(2000);
  }

  // ---- viral-rewrite ----
  {
    console.log('\n[2/6] viral-rewrite 爆款仿写...');
    if (!viralIds.length) {
      console.log('  ⚠️  跳过 (无爆款数据)');
      results.push({ mode: 'viral-rewrite', ok: false, reason: 'no data' });
      fail++;
    } else {
      const { ok, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/viral-rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          viral_video_id: viralIds[0],
          selling_points: product.selling_points || [product.title],
          style_vibe: 'emotional',
          aspect_ratio: '9:16',
          constraint_list: ['total_duration<=15s'],
        }),
        signal: AbortSignal.timeout(120000),
      });
      const s = body?.data;
      const scriptId = s?.id || s?.script_id;
      if (ok && scriptId) {
        console.log(`  ✅ viral-rewrite — id=${scriptId}, shots=${s?.shots?.length || '?'}, title="${s?.title || '?'}"`);
        pass++;
      } else {
        console.error(`  ❌ viral-rewrite: HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
        fail++;
      }
      results.push({ mode: 'viral-rewrite', ok: ok && !!scriptId, scriptId });
    }
    await sleep(2000);
  }

  // ---- template ----
  {
    console.log('\n[3/6] template 模板驱动...');
    if (!templateIds.length) {
      console.log('  ⚠️  跳过 (无模板数据)');
      results.push({ mode: 'template', ok: false, reason: 'no data' });
      fail++;
    } else {
      const { ok, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          template_id: templateIds[0],
          selling_points: product.selling_points || [product.title],
          style_vibe: 'cinematic',
          aspect_ratio: '9:16',
          constraint_list: ['total_duration<=15s'],
        }),
        signal: AbortSignal.timeout(120000),
      });
      const s = body?.data;
      const scriptId = s?.id || s?.script_id;
      if (ok && scriptId) {
        console.log(`  ✅ template — id=${scriptId}, shots=${s?.shots?.length || '?'}, title="${s?.title || '?'}"`);
        pass++;
      } else {
        console.error(`  ❌ template: HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
        fail++;
      }
      results.push({ mode: 'template', ok: ok && !!scriptId, scriptId });
    }
    await sleep(2000);
  }

  // ---- batch ----
  {
    console.log('\n[4/6] batch 批量多风格...');
    const { ok, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        batch_size: 2,
        style_variations: ['clean-tech', 'warm-social'],
        selling_points: product.selling_points || [product.title],
        aspect_ratio: '9:16',
        constraint_list: ['total_duration<=15s'],
      }),
      signal: AbortSignal.timeout(180000),
    });
    const data = body?.data;
    const scripts = data?.scripts || [];
    const first = scripts[0];
    const scriptId = first?.id || first?.script_id;
    if (ok && scriptId) {
      console.log(`  ✅ batch — batch_id=${data.batch_id}, total=${data.total}, succeeded=${data.succeeded}, script[0]_id=${scriptId}`);
      pass++;
    } else {
      console.error(`  ❌ batch: HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
      fail++;
    }
    results.push({ mode: 'batch', ok: ok && !!scriptId, scriptId });
    await sleep(2000);
  }

  // ---- composed ----
  {
    console.log('\n[5/6] composed 组合引擎...');
    const { ok, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/composed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        selling_points: product.selling_points || [product.title],
        style_vibe: 'creative',
        aspect_ratio: '9:16',
        constraint_list: ['total_duration<=15s'],
      }),
      signal: AbortSignal.timeout(120000),
    });
    const s = body?.data;
    const scriptId = s?.id || s?.script_id;
    if (ok && scriptId) {
      console.log(`  ✅ composed — id=${scriptId}, shots=${s?.shots?.length || '?'}, title="${s?.title || '?'}"`);
      pass++;
    } else {
      console.error(`  ❌ composed: HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
      fail++;
    }
    results.push({ mode: 'composed', ok: ok && !!scriptId, scriptId });
    await sleep(2000);
  }

  // ---- hybrid ----
  {
    console.log('\n[6/6] hybrid 混合创新...');
    const { ok, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/hybrid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        selling_points: product.selling_points || [product.title],
        style_vibe: 'trendy',
        aspect_ratio: '9:16',
        constraint_list: ['total_duration<=15s'],
      }),
      signal: AbortSignal.timeout(120000),
    });
    const s = body?.data;
    const scriptId = s?.id || s?.script_id;
    if (ok && scriptId) {
      console.log(`  ✅ hybrid — id=${scriptId}, shots=${s?.shots?.length || '?'}, title="${s?.title || '?'}"`);
      pass++;
    } else {
      console.error(`  ❌ hybrid: HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
      fail++;
    }
    results.push({ mode: 'hybrid', ok: ok && !!scriptId, scriptId });
  }

  console.log(`\n=== 结果: ${pass}/6 通过, ${fail} 失败 ===`);
  console.table(results.map(r => ({ mode: r.mode, ok: r.ok ? '✅' : '❌', scriptId: r.scriptId || r.reason || '-' })));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
