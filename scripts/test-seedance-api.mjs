#!/usr/bin/env node
/**
 * Standalone Seedance (Doubao i2v) API verification
 * Usage: node scripts/test-seedance-api.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp/seedance-api-test');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const API_KEY = process.env.VOLC_ARK_VIDEO_API_KEY || process.env.VOLC_ARK_API_KEY || '';
const API_URL = (process.env.VOLC_ARK_SEEDANCE_API_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
const MODEL = process.env.VOLC_ARK_DOUBAO_VIDEO_ENDPOINT || 'ep-20260514120705-pqv86';
const GATEWAY = process.env.E2E_BASE_URL || 'http://localhost:3000';
const IMAGE_URL = process.env.SEEDANCE_TEST_IMAGE_URL || `${GATEWAY}/api/v1/demo/ecom-product-skincare.jpg`;

const POLL_INTERVAL_MS = Number(process.env.SEEDANCE_POLL_INTERVAL_MS || 5000);
const POLL_MAX = Number(process.env.SEEDANCE_POLL_MAX_ATTEMPTS || 60);

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Image fetch HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || 'image/jpeg';
  return `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`;
}

async function createTask(imageDataUrl) {
  const body = {
    model: MODEL,
    content: [
      { type: 'text', text: 'Smooth product showcase motion, clean e-commerce style' },
      { type: 'image_url', image_url: { url: imageDataUrl }, role: 'first_frame' },
    ],
    resolution: '720p',
    ratio: '9:16',
    duration: 5,
  };

  console.log(`POST ${API_URL}/contents/generations/tasks`);
  console.log(`  model=${MODEL}, ratio=9:16, duration=5, resolution=720p`);

  const res = await fetch(`${API_URL}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Create task HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  if (!data.id) throw new Error(`No task id: ${JSON.stringify(data)}`);
  return data.id;
}

async function pollTask(taskId) {
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${API_URL}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    console.log(`  poll ${i + 1}/${POLL_MAX}: status=${data.status}`);

    if (data.status === 'succeeded') {
      const videoUrl = data.content?.video_url;
      if (!videoUrl) throw new Error('succeeded but no video_url');
      return videoUrl;
    }
    if (data.status === 'failed') {
      throw new Error(`Task failed: ${JSON.stringify(data.error || data)}`);
    }
  }
  throw new Error(`Task ${taskId} timed out after ${POLL_MAX * POLL_INTERVAL_MS / 1000}s`);
}

async function downloadVideo(url, outPath) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

function ffprobe(filePath) {
  try {
    const json = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of json "${filePath}"`,
      { encoding: 'utf8' },
    );
    const parsed = JSON.parse(json);
    const stream = parsed.streams?.[0] || {};
    const hasAudio = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8' },
    ).trim().length > 0;
    return {
      width: stream.width,
      height: stream.height,
      fps: stream.r_frame_rate,
      duration: parsed.format?.duration,
      hasAudio,
      sizeBytes: fs.statSync(filePath).size,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  console.log('=== Seedance API Test ===');
  if (!API_KEY) {
    console.error('FAIL: VOLC_ARK_VIDEO_API_KEY not set');
    process.exit(1);
  }

  console.log(`Image source: ${IMAGE_URL}`);
  const imageDataUrl = await fetchImageAsDataUrl(IMAGE_URL);
  console.log(`Image loaded (${Math.round(imageDataUrl.length / 1024)} KB base64)`);

  const taskId = await createTask(imageDataUrl);
  console.log(`Task created: ${taskId}`);

  const videoUrl = await pollTask(taskId);
  console.log(`Video URL: ${videoUrl}`);

  const outPath = path.join(OUT_DIR, `seedance-${taskId}.mp4`);
  await downloadVideo(videoUrl, outPath);
  console.log(`Saved: ${outPath}`);

  const probe = ffprobe(outPath);
  console.log('Probe:', probe);

  if (probe.error || !probe.width || probe.sizeBytes < 50 * 1024) {
    console.error('FAIL: invalid output video');
    process.exit(1);
  }

  console.log('\n✅ Seedance API test PASSED');
}

main().catch((error) => {
  console.error('FAIL:', error.message);
  process.exit(1);
});
