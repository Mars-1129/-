#!/usr/bin/env node
/**
 * TikStream AI - Comprehensive E2E Test
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const GPU_BASE = process.env.E2E_GPU_URL || 'http://localhost:3101';
const REMOTION_BASE = process.env.E2E_REMOTION_URL || 'http://localhost:3102';
const VIDEO_FILE = path.join(ROOT, 'assets', 'videos', '04-scenic-landscape-5s.mp4');
const DEMO_PRODUCT_ID = 'ee605a50-9ced-4889-af50-ecc9adb25da3';

const results = [];

function log(phase, msg) { console.log(`[${phase}] ${msg}`); }
function pass(phase, detail = '') { results.push({ phase, ok: true, detail }); console.log(`PASS ${phase}` + (detail ? ': ' + detail : '')); }
function fail(phase, detail) { results.push({ phase, ok: false, detail }); console.error(`FAIL ${phase}: ${detail}`); }
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error.message };
  }
}

async function phase1_health() {
  const phase = 'P1-Health';
  log(phase, 'Checking services...');
  for (const [name, url] of [['Gateway', `${BASE}/health`], ['GPU', `${GPU_BASE}/health`], ['Remotion', `${REMOTION_BASE}/health`]]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) { fail(phase, `${name} HTTP ${res.status}`); return false; }
    } catch (error) {
      fail(phase, `${name} unreachable`); return false;
    }
  }
  pass(phase); return true;
}

async function phase2_upload() {
  const phase = 'P2-Upload';
  log(phase, 'Uploading video...');
  if (!fs.existsSync(VIDEO_FILE)) { fail(phase, 'File not found'); return null; }
  const buffer = fs.readFileSync(VIDEO_FILE);
  const blob = new Blob([buffer], { type: 'video/mp4' });
  const form = new FormData();
  form.append('file', blob, path.basename(VIDEO_FILE));
  form.append('product_id', DEMO_PRODUCT_ID);
  form.append('type', 'VIDEO');
  form.append('source_type', 'UPLOAD');
  const { ok, status, body } = await fetchJson(`${BASE}/api/v1/materials/upload`, { method: 'POST', body: form });
  const materialId = body?.material_id || body?.data?.material_id;
  if (!ok || !materialId) { fail(phase, `HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`); return null; }
  pass(phase, `material_id=${materialId}`); return materialId;
}

async function phase3_waitSlicing(materialId) {
  const phase = 'P3-Slicing';
  log(phase, 'Waiting for slicing...');
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);
    if (!ok) { await sleep(3000); continue; }
    const material = body?.material || body?.data?.material || body?.data || body;
    const status = material?.status;
    const slices = body?.slices || body?.data?.slices || [];
    log(phase, `status=${status}, slices=${slices.length}`);
    if (status === 'FAILED') { fail(phase, 'material FAILED'); return null; }
    if (status === 'COMPLETED') { pass(phase, `${slices.length} slices`); return { material, slices }; }
    await sleep(5000);
  }
  fail(phase, 'timeout'); return null;
}

async function phase4_scriptQuick() {
  const phase = 'P4-Script-Quick';
  log(phase, 'Quick script gen...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/quick`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, selling_points: ['高转化短视频', 'AI生成分镜', 'TikTok Shop适配'], style_vibe: 'clean-tech', aspect_ratio: '9:16', target_audience: '跨境电商运营' }),
    signal: AbortSignal.timeout(120000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const script = body.data || body;
  const scriptId = script?.id || script?.script_id;
  if (!scriptId) { fail(phase, 'no script_id'); return null; }
  pass(phase, `id=${scriptId}, shots=${(script?.shots || []).length}`); return scriptId;
}

async function phase4_scriptViral() {
  const phase = 'P4-Script-Viral';
  log(phase, 'Viral-rewrite script gen...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/viral-rewrite`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, viral_video_id: 'demo', style_vibe: 'trendy', aspect_ratio: '9:16', target_audience: '年轻消费者' }),
    signal: AbortSignal.timeout(120000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const script = body.data || body;
  const scriptId = script?.id || script?.script_id;
  if (!scriptId) { fail(phase, 'no script_id'); return null; }
  pass(phase, `id=${scriptId}`); return scriptId;
}

async function phase4_scriptTemplate() {
  const phase = 'P4-Script-Template';
  log(phase, 'Template script gen...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/template`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, template_id: 'demo', aspect_ratio: '9:16' }),
    signal: AbortSignal.timeout(120000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const script = body.data || body;
  const scriptId = script?.id || script?.script_id;
  if (!scriptId) { fail(phase, 'no script_id'); return null; }
  pass(phase, `id=${scriptId}`); return scriptId;
}

async function phase4_scriptComposed() {
  const phase = 'P4-Script-Composed';
  log(phase, 'Composed script gen...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/composed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, style_vibe: 'energetic', aspect_ratio: '9:16', selling_points: ['自动生成', '高效转化'], auto_match_viral: true }),
    signal: AbortSignal.timeout(120000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const script = body.data || body;
  const scriptId = script?.id || script?.script_id;
  if (!scriptId) { fail(phase, 'no script_id'); return null; }
  pass(phase, `id=${scriptId}`); return scriptId;
}

async function phase4_scriptHybrid() {
  const phase = 'P4-Script-Hybrid';
  log(phase, 'Hybrid script gen...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/hybrid`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, style_vibe: 'professional', aspect_ratio: '9:16', selling_points: ['AI驱动', '数据优化'] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const script = body.data || body;
  const scriptId = script?.id || script?.script_id;
  if (!scriptId) { fail(phase, 'no script_id'); return null; }
  pass(phase, `id=${scriptId}`); return scriptId;
}

async function phase4_scriptBatch() {
  const phase = 'P4-Script-Batch';
  log(phase, 'Batch script gen...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/batch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, batch_size: 2, style_variations: ['clean-tech', 'trendy'], aspect_ratio: '9:16' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const scripts = (body.data || body)?.scripts || [];
  if (scripts.length === 0) { fail(phase, 'no scripts'); return null; }
  pass(phase, `generated ${scripts.length} scripts`); return scripts[0]?.id || scripts[0]?.script_id;
}

async function phase5_create(scriptId) {
  const phase = 'P5-Creation-ScriptDriven';
  log(phase, 'Creating video (SCRIPT_DRIVEN)...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/creations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, script_id: scriptId, engine_mode: 'SCRIPT_DRIVEN', force_refresh: true }),
  });
  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  if (!ok || !creationId) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  pass(phase, `id=${creationId}`); return creationId;
}

async function phase5_createImageDriven(materialId) {
  const phase = 'P5-Creation-ImageDriven';
  log(phase, 'Creating video (IMAGE_DRIVEN)...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/creations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, engine_mode: 'IMAGE_DRIVEN', material_id: materialId, style_vibe: 'clean-tech', aspect_ratio: '9:16' }),
  });
  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  if (!ok || !creationId) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  pass(phase, `id=${creationId}`); return creationId;
}

async function phase5_createPromptDriven() {
  const phase = 'P5-Creation-PromptDriven';
  log(phase, 'Creating video (PROMPT_DRIVEN)...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/creations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, engine_mode: 'PROMPT_DRIVEN', product_title: 'TikStream演示商品', product_selling_points: ['AI驱动', '高效转化'], style_vibe: 'clean-tech', aspect_ratio: '9:16' }),
  });
  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  if (!ok || !creationId) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  pass(phase, `id=${creationId}`); return creationId;
}

async function phase6_waitCreation(creationId, maxMinutes = 30) {
  const phase = 'P6-WaitCreation';
  log(phase, `Polling creation ${creationId} (max ${maxMinutes}m)...`);
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
    const data = body?.data || body;
    const status = data?.status;
    log(phase, `status=${status}, stage=${data?.current_stage}, progress=${data?.progress ?? '?'}`);
    if (status === 'FAILED') { fail(phase, `FAILED: ${data?.error_message || JSON.stringify(body).slice(0, 200)}`); return null; }
    if (status === 'FINISHED') { pass(phase, `video ready`); return data; }
    await sleep(15000);
  }
  fail(phase, 'timeout'); return null;
}

async function phase7_analytics(creationId, creationImgId) {
  const ok = [];
  const phase = 'P7-Analytics';
  log(phase, 'Retention curve...');
  const r1 = await fetchJson(`${BASE}/api/v1/analytics/retention-curve?product_id=${DEMO_PRODUCT_ID}&creation_id=${creationId}`);
  ok.push(r1.ok); log(phase, `Retention: ${r1.ok ? 'OK' : 'FAIL'}`);

  log(phase, 'Heatmap...');
  const r2 = await fetchJson(`${BASE}/api/v1/analytics/style-factors?product_id=${DEMO_PRODUCT_ID}&x_dimension=NARRATIVE_STRATEGY&y_dimension=VISUAL_STYLE`);
  ok.push(r2.ok); log(phase, `Heatmap: ${r2.ok ? 'OK' : 'FAIL'}`);

  log(phase, 'Sankey...');
  const r3 = await fetchJson(`${BASE}/api/v1/analytics/audio-visual-sankey?product_id=${DEMO_PRODUCT_ID}&creation_id=${creationId}`);
  ok.push(r3.ok); log(phase, `Sankey: ${r3.ok ? 'OK' : 'FAIL'}`);

  log(phase, 'Self-heal...');
  const r4 = await fetchJson(`${BASE}/api/v1/analytics/self-heal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, creation_id: creationId, trigger_source: 'MANUAL', issue_type: 'HOOK_WEAK', strategy: 'REWRITE_ONLY', dry_run: true }),
  });
  ok.push(r4.ok); log(phase, `SelfHeal: ${r4.ok ? 'OK' : 'FAIL'}`);

  if (creationImgId) {
    log(phase, 'AB Compare...');
    const r5 = await fetchJson(`${BASE}/api/v1/analytics/ab-compare?product_id=${DEMO_PRODUCT_ID}&creation_id_a=${creationId}&creation_id_b=${creationImgId}`);
    ok.push(r5.ok); log(phase, `ABComp: ${r5.ok ? 'OK' : 'FAIL'}`);
  }

  const passed = ok.filter(Boolean).length;
  pass(phase, `${passed}/${ok.length} analytics passed`);
  return ok.filter(Boolean).length === ok.length;
}

async function phase8_singleAgent() {
  const phase = 'P8-Agent-Single';
  log(phase, 'Single agent...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/agent/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, selling_points: ['AI生成', '快速高效'], style_vibe: 'professional', aspect_ratio: '9:16' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const data = body.data || body;
  pass(phase, `score=${data?.quality_score}, iterations=${data?.iterations}`);
  return (data?.script)?.id || (data?.script)?.script_id;
}

async function phase8_multiAgent() {
  const phase = 'P8-Agent-Multi';
  log(phase, 'Multi-agent...');
  const { ok, body } = await fetchJson(`${BASE}/api/v1/agent/multi/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: DEMO_PRODUCT_ID, selling_points: ['多Agent协作', '质量保证'], style_vibe: 'trendy', aspect_ratio: '9:16' }),
    signal: AbortSignal.timeout(300000),
  });
  if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); return null; }
  const data = body.data || body;
  pass(phase, `agents=${(data?.agent_traces || []).length}`);
  return (data?.script)?.id || (data?.script)?.script_id;
}

async function phase9_feedback(scriptId, creationId) {
  if (scriptId) {
    const phase = 'P9-Feedback-Script';
    log(phase, 'Feedback regenerate...');
    const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/${scriptId}/regenerate/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback_text: '需要更强的开头吸引力' }),
      signal: AbortSignal.timeout(120000),
    });
    if (!ok || !body?.success) { fail(phase, JSON.stringify(body).slice(0, 300)); } else { pass(phase); }
  }
  if (creationId) {
    const phase = 'P9-Feedback-Restitch';
    log(phase, 'Restitch video...');
    const { ok, body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}/restitch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    });
    if (!ok) { fail(phase, JSON.stringify(body).slice(0, 200)); } else { pass(phase); }
  }
}

async function main() {
  console.log('=== TikStream Comprehensive E2E ===\n');

  if (!(await phase1_health())) { process.exit(1); }

  const materialId = await phase2_upload();
  if (!materialId) { process.exit(1); }

  const sliceResult = await phase3_waitSlicing(materialId);
  if (!sliceResult) { process.exit(1); }

  // All script modes
  const quickId = await phase4_scriptQuick();
  const viralId = await phase4_scriptViral();
  const templateId = await phase4_scriptTemplate();
  const composedId = await phase4_scriptComposed();
  const hybridId = await phase4_scriptHybrid();
  const batchId = await phase4_scriptBatch();
  const scriptOk = [quickId, viralId, templateId, composedId, hybridId, batchId].filter(Boolean).length;
  console.log(`\n=== Scripts: ${scriptOk}/6 modes passed ===\n`);

  if (!quickId) { console.error('Quick script failed - aborting'); process.exit(1); }

  // All creation modes (async fire-and-forget for img/prompt)
  const creationId = await phase5_create(quickId);
  const creationImgId = await phase5_createImageDriven(materialId);
  const creationPromptId = await phase5_createPromptDriven();

  // Wait for script-driven creation
  let creationData = null;
  if (creationId) { creationData = await phase6_waitCreation(creationId); }

  // Analytics
  if (creationId) { await phase7_analytics(creationId, creationImgId); }

  // Agent workflow
  await phase8_singleAgent();
  await phase8_multiAgent();

  // Feedback loop
  await phase9_feedback(quickId, creationId);

  // Summary
  console.log('\n=== Summary ===');
  for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.phase}${r.detail ? ' - ' + r.detail : ''}`); }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\nTotal: ${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });