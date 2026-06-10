const BASE = 'http://localhost:3000';
const PRODUCT_ID = '5275abe4-d7d7-47d5-8f35-d5559ce44036';
const SCRIPT_ID = '0134afb6-d6fc-4398-a0d5-8c3b8cf73dc5';
const MAX_WAIT_MIN = 60;
const OUTPUT = 'd:/字节/tmp/script_to_video_test';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

async function main() {
  console.log('=== Script-to-Video AI Generation Test ===\n');

  // Step 1: Create creation
  console.log('[1/4] Creating creation task (prefer_ai_video=true)...');
  const { ok, status, body } = await fetchJson(`${BASE}/api/v1/creations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: PRODUCT_ID,
      script_id: SCRIPT_ID,
      force_refresh: true,
      prefer_ai_video: true,
    }),
  });

  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  if (!ok || !creationId) {
    console.error('FAIL: Create creation failed HTTP', status, JSON.stringify(body).slice(0, 500));
    process.exit(1);
  }
  console.log(`  creation_id=${creationId}, task_id=${data?.task_id}`);

  // Step 2: Wait for video generation
  console.log(`\n[2/4] Waiting for video generation (max ${MAX_WAIT_MIN}min)...`);
  const deadline = Date.now() + MAX_WAIT_MIN * 60_000;
  let lastStatus = '', lastStage = '';

  let result = null;
  while (Date.now() < deadline) {
    const { body: cBody } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
    const cData = cBody?.data || cBody;
    const status = cData?.status;
    const stage = cData?.current_stage;
    const progress = cData?.progress;

    if (status !== lastStatus || stage !== lastStage) {
      console.log(`  status=${status}, stage=${stage}, progress=${progress ?? '?'}%`);
      lastStatus = status;
      lastStage = stage;
    }

    if (status === 'FAILED') {
      const err = cData?.error_message || cData?.error;
      console.error(`  FAILED: ${err}`);
      result = { ok: false, error: err };
      break;
    }
    if (status === 'FINISHED') {
      const videoUrl = cData?.video_url || cData?.preview_url;
      console.log(`  FINISHED: video_url=${videoUrl}`);
      result = { ok: true, videoUrl, data: cData };
      break;
    }
    if (status === 'CANCELED') {
      console.log('  CANCELED');
      result = { ok: false, error: 'Canceled' };
      break;
    }
    await sleep(15000);
  }

  if (!result) {
    console.error('  TIMEOUT');
    process.exit(1);
  }

  if (!result.ok) {
    console.error('\nFAIL: Video generation failed:', result.error);
    process.exit(1);
  }

  // Step 3: Get creation detail for metadata
  console.log('\n[3/4] Fetching creation detail...');
  const { body: detailBody } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
  const detail = detailBody?.data || detailBody;
  console.log(`  status=${detail?.status}, stage=${detail?.current_stage}`);
  console.log(`  shots=${(detail?.shot_renders || []).length}`);
  (detail?.shot_renders || []).forEach((sr, i) => {
    const source = sr.render_path ? 'RENDERED' : 'PENDING';
    console.log(`  shot[${i}]: source=${source}, status=${sr.status}`);
  });

  // Step 4: Download and verify video
  console.log('\n[4/4] Downloading and verifying video...');
  const videoUrl = result.videoUrl;
  if (!videoUrl) {
    console.error('FAIL: No video URL');
    process.exit(1);
  }

  const fullUrl = videoUrl.startsWith('http') ? videoUrl : `${BASE}${videoUrl}`;
  console.log(`  URL: ${fullUrl}`);

  const dRes = await fetch(fullUrl, { signal: AbortSignal.timeout(120000) });
  if (!dRes.ok) {
    console.error(`FAIL: Download HTTP ${dRes.status}`);
    process.exit(1);
  }

  const buf = Buffer.from(await dRes.arrayBuffer());
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(OUTPUT, { recursive: true });
  const outPath = `${OUTPUT}/creation-${creationId}.mp4`;
  writeFileSync(outPath, buf);

  const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
  console.log(`  Saved: ${outPath} (${sizeMB} MB)`);

  if (buf.length < 100 * 1024) {
    console.error(`FAIL: Video file too small: ${buf.length} bytes`);
    process.exit(1);
  }

  // ffprobe
  let probeInfo = '';
  try {
    const { execSync } = await import('node:child_process');
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,width,height -of default=noprint_wrappers=1 "${outPath}"`,
      { encoding: 'utf8' }
    );
    const hasAudio = /codec_type=audio/.test(probe);
    const durMatch = probe.match(/duration=([\d.]+)/);
    const wMatch = probe.match(/width=(\d+)/);
    const hMatch = probe.match(/height=(\d+)/);
    probeInfo = `duration=${durMatch?.[1] || '?'}s, resolution=${wMatch?.[1] || '?'}x${hMatch?.[1] || '?'}, audio=${hasAudio}`;
    console.log(`  ffprobe: ${probeInfo}`);
  } catch (e) {
    console.warn('  ffprobe unavailable:', e.message);
  }

  console.log('\n=== TEST PASSED ===');
  console.log(`Creation: ${creationId}`);
  console.log(`Video: ${outPath} (${sizeMB} MB) ${probeInfo}`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
