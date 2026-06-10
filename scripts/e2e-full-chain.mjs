#!/usr/bin/env node
/**
 * TikStream AI — Full-chain E2E verification
 * Usage:
 *   node scripts/e2e-full-chain.mjs
 *   node scripts/e2e-full-chain.mjs --skip-creation
 *   node scripts/e2e-full-chain.mjs --seedance-only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const SKIP_CREATION = args.has('--skip-creation');
const SEEDANCE_ONLY = args.has('--seedance-only');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const EMBED_BASE = process.env.E2E_EMBED_URL || 'http://localhost:8088';
const GPU_BASE = process.env.E2E_GPU_URL || 'http://localhost:3101';
const REMOTION_BASE = process.env.E2E_REMOTION_URL || 'http://localhost:3102';
const WEB_BASE = process.env.E2E_WEB_URL || 'http://localhost:5173';
const VIDEO_FILE = process.env.E2E_VIDEO_FILE || path.join(ROOT, 'assets/videos/04-scenic-landscape-5s.mp4');
const OUTPUT_DIR = path.join(ROOT, 'tmp/e2e-output');

const results = [];

function log(phase, msg) {
  console.log(`[${phase}] ${msg}`);
}

function pass(phase, detail = '') {
  results.push({ phase, ok: true, detail });
  console.log(`✅ ${phase} PASS${detail ? `: ${detail}` : ''}`);
}

function fail(phase, detail) {
  results.push({ phase, ok: false, detail });
  console.error(`❌ ${phase} FAIL: ${detail}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function tailDockerLogs() {
  const containers = [
    'tikstream-text-embed-server',
    'tikstream-gpu-slicing-worker',
    'tikstream-remotion-render-worker',
    'tikstream-server-gateway',
  ];
  for (const name of containers) {
    try {
      const { execSync } = await import('node:child_process');
      console.log(`\n--- docker logs ${name} (tail 30) ---`);
      console.log(execSync(`docker logs ${name} --tail 30 2>&1`, { encoding: 'utf8' }));
    } catch {
      // ignore
    }
  }
}

async function phase0_health() {
  const phase = 'Phase0';
  log(phase, 'Checking service health...');

  const checks = [
    ['Gateway', `${BASE}/health`],
    ['Embed /ready', `${EMBED_BASE}/ready`],
    ['GPU worker', `${GPU_BASE}/health`],
    ['Remotion worker', `${REMOTION_BASE}/health`],
    ['Web client', WEB_BASE],
  ];

  for (const [name, url] of checks) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        fail(phase, `${name} HTTP ${res.status}`);
        return false;
      }
    } catch (error) {
      fail(phase, `${name} unreachable: ${error.message}`);
      return false;
    }
  }

  pass(phase, 'all services healthy');
  return true;
}

async function phase1_product() {
  const phase = 'Phase1';
  log(phase, 'Fetching seed product...');

  const { ok, body } = await fetchJson(`${BASE}/api/v1/products?page=1&page_size=1`);
  if (!ok || !body?.success) {
    fail(phase, `products API failed: ${JSON.stringify(body).slice(0, 200)}`);
    return null;
  }

  const items = body.data?.items || body.data?.data || [];
  const product = Array.isArray(items) ? items[0] : null;
  const productId = product?.id || product?.product_id;

  if (!productId) {
    fail(phase, 'no product found — run prisma seed');
    return null;
  }

  pass(phase, `product_id=${productId}`);
  return productId;
}

async function phase2_upload(productId) {
  const phase = 'Phase2';
  log(phase, `Uploading ${VIDEO_FILE}...`);

  if (!fs.existsSync(VIDEO_FILE)) {
    fail(phase, `video file not found: ${VIDEO_FILE}`);
    return null;
  }

  const buffer = fs.readFileSync(VIDEO_FILE);
  const blob = new Blob([buffer], { type: 'video/mp4' });
  const form = new FormData();
  form.append('file', blob, path.basename(VIDEO_FILE));
  form.append('product_id', productId);
  form.append('type', 'VIDEO');
  form.append('source_type', 'UPLOAD');

  const { ok, status, body } = await fetchJson(`${BASE}/api/v1/materials/upload`, {
    method: 'POST',
    body: form,
  });

  const materialId = body?.material_id || body?.data?.material_id;
  if (!ok || !materialId) {
    fail(phase, `upload HTTP ${status}: ${JSON.stringify(body).slice(0, 300)}`);
    return null;
  }

  pass(phase, `material_id=${materialId}`);
  return materialId;
}

async function phase3_waitSlicing(materialId) {
  const phase = 'Phase3';
  log(phase, 'Polling material until COMPLETED (max 10min)...');

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);
    if (!ok) {
      await sleep(5000);
      continue;
    }

    const material = body?.material || body?.data?.material || body?.data || body;
    const status = material?.status;
    const slices = body?.slices || body?.data?.slices || [];
    const captions = slices.filter((s) => s.dense_caption?.trim()).length;

    log(phase, `status=${status}, slices=${slices.length}, with_caption=${captions}`);

    if (status === 'FAILED') {
      fail(phase, `material FAILED: ${material?.error_message || JSON.stringify(body).slice(0, 200)}`);
      return null;
    }

    if (status === 'COMPLETED' && captions > 0) {
      pass(phase, `${slices.length} slices, ${captions} with dense_caption`);
      return body;
    }

    await sleep(8000);
  }

  fail(phase, 'timeout waiting for COMPLETED');
  return null;
}

async function phase4_search(productId, materialDetail) {
  const phase = 'Phase4';
  log(phase, 'Reindex embeddings + vector search...');

  await fetchJson(`${BASE}/api/internal/v1/materials/reindex-embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 50 }),
  });

  const firstCaption = (materialDetail?.slices || materialDetail?.data?.slices || [])
    .find((s) => s.dense_caption?.trim())?.dense_caption?.split(/[，。,\s]/)[0] || '风景';

  const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      query: firstCaption,
      search_mode: 'AUTO',
      status: 'COMPLETED',
      limit: 10,
    }),
  });

  const source = body?.search_source;
  const items = body?.items || [];
  const topScore = items[0]?.score;

  if (!ok) {
    fail(phase, `search HTTP error: ${JSON.stringify(body).slice(0, 200)}`);
    return false;
  }

  if (source === 'vector' && items.length > 0) {
    pass(phase, `search_source=vector, top_score=${topScore?.toFixed?.(3) ?? topScore}`);
    return true;
  }

  if (source === 'keyword_fallback' && items.length > 0) {
    pass(phase, `search_source=keyword_fallback (embed may be warming), items=${items.length}`);
    return true;
  }

  fail(phase, `no results: source=${source}, items=${items.length}`);
  return false;
}

async function phase5_script(productId) {
  const phase = 'Phase5';
  log(phase, 'Generating quick script (max 2min)...');

  const { ok, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      selling_points: ['15秒高转化短视频', 'AI自动生成分镜', '适配TikTok Shop'],
      style_vibe: 'clean-tech',
      aspect_ratio: '9:16',
      target_audience: '跨境电商运营团队',
      constraint_list: ['total_duration<=15s'],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!ok || !body?.success) {
    fail(phase, JSON.stringify(body?.error || body).slice(0, 300));
    return null;
  }

  const script = body.data;
  const scriptId = script?.id || script?.script_id;
  const shots = script?.shots || [];

  if (!scriptId || shots.length < 3) {
    fail(phase, `invalid script: id=${scriptId}, shots=${shots.length}`);
    return null;
  }

  pass(phase, `script_id=${scriptId}, shots=${shots.length}`);
  return scriptId;
}

async function phase6_create(productId, scriptId, { preferAiVideo = false } = {}) {
  const phase = 'Phase6';
  log(phase, preferAiVideo ? 'Creating Seedance-only video task...' : 'Creating video task...');

  const { ok, body } = await fetchJson(`${BASE}/api/v1/creations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      script_id: scriptId,
      force_refresh: true,
      prefer_ai_video: preferAiVideo,
    }),
  });

  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  const taskId = data?.task_id;

  if (!ok || !creationId) {
    fail(phase, JSON.stringify(body).slice(0, 300));
    return null;
  }

  pass(phase, `creation_id=${creationId}, task_id=${taskId}`);
  return creationId;
}

async function phase7_waitCreation(creationId, maxMinutes = 45) {
  const phase = 'Phase7';
  log(phase, `Polling creation until FINISHED (max ${maxMinutes}min)...`);

  const deadline = Date.now() + maxMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
    const data = body?.data || body;
    const status = data?.status;
    const stage = data?.current_stage;
    const progress = data?.progress;
    const error = data?.error_message || data?.error;

    log(phase, `status=${status}, stage=${stage}, progress=${progress ?? '?'}`);

    if (status === 'FAILED') {
      fail(phase, error || 'creation FAILED');
      return null;
    }

    if (status === 'FINISHED') {
      pass(phase, `video_url=${data?.video_url || data?.preview_url || '(see export)'}`);
      return data;
    }

    await sleep(15000);
  }

  fail(phase, 'timeout waiting for FINISHED');
  return null;
}

async function phase8_export(creationId, creationData) {
  const phase = 'Phase8';
  log(phase, 'Export + download MP4...');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let videoUrl = creationData?.video_url || creationData?.preview_url;

  if (!videoUrl) {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}/export`, {
      method: 'POST',
    });
    const data = body?.data || body;
    videoUrl = data?.video_url || data?.export_url;
    if (!ok && !videoUrl) {
      fail(phase, `export failed: ${JSON.stringify(body).slice(0, 200)}`);
      return false;
    }
  }

  if (!videoUrl) {
    const { body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
    const data = body?.data || body;
    videoUrl = data?.video_url || data?.preview_url;
  }

  if (!videoUrl) {
    fail(phase, 'no video_url available');
    return false;
  }

  log(phase, `Downloading from ${videoUrl}`);
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) {
    fail(phase, `download HTTP ${res.status}`);
    return false;
  }

  const outPath = path.join(OUTPUT_DIR, `creation-${creationId}.mp4`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);

  if (buf.length < 100 * 1024) {
    fail(phase, `file too small: ${buf.length} bytes`);
    return false;
  }

  let durationHint = '';
  try {
    const { execSync } = await import('node:child_process');
    durationHint = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outPath}"`,
      { encoding: 'utf8' },
    ).trim();
  } catch {
    durationHint = 'ffprobe unavailable';
  }

  pass(phase, `${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB, duration=${durationHint}s)`);
  return true;
}

async function main() {
  console.log('=== TikStream Full-Chain E2E ===');
  console.log(`BASE=${BASE}, skip_creation=${SKIP_CREATION}, seedance_only=${SEEDANCE_ONLY}\n`);

  if (!(await phase0_health())) {
    await tailDockerLogs();
    process.exit(1);
  }

  const productId = await phase1_product();
  if (!productId) {
    await tailDockerLogs();
    process.exit(1);
  }

  if (!SEEDANCE_ONLY) {
    const materialId = await phase2_upload(productId);
    if (!materialId) {
      await tailDockerLogs();
      process.exit(1);
    }

    const materialDetail = await phase3_waitSlicing(materialId);
    if (!materialDetail) {
      await tailDockerLogs();
      process.exit(1);
    }

    if (!(await phase4_search(productId, materialDetail))) {
      await tailDockerLogs();
      process.exit(1);
    }
  } else {
    log('Main', 'Skipping material upload/search (--seedance-only)');
  }

  if (SKIP_CREATION) {
    console.log('\n--skip-creation: stopping after material/search phases');
    printSummary();
    process.exit(0);
  }

  const scriptId = await phase5_script(productId);
  if (!scriptId) {
    await tailDockerLogs();
    process.exit(1);
  }

  const creationId = await phase6_create(productId, scriptId, { preferAiVideo: SEEDANCE_ONLY });
  if (!creationId) {
    await tailDockerLogs();
    process.exit(1);
  }

  const creationData = await phase7_waitCreation(creationId, SEEDANCE_ONLY ? 60 : 45);
  if (!creationData) {
    await tailDockerLogs();
    process.exit(1);
  }

  if (!(await phase8_export(creationId, creationData))) {
    await tailDockerLogs();
    process.exit(1);
  }

  printSummary();
  console.log('\n🎬 E2E complete. UI: http://localhost:5173');
}

function printSummary() {
  console.log('\n=== Summary ===');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.phase}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nTotal: ${results.length - failed}/${results.length} passed`);
}

main().catch(async (error) => {
  console.error('Fatal:', error);
  await tailDockerLogs();
  process.exit(1);
});
