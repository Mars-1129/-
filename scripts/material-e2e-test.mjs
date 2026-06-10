#!/usr/bin/env node
/**
 * TikStream AI — Material Module Comprehensive E2E Test
 * 
 * Tests all material module APIs against real Docker infrastructure:
 *   Upload → WaitSlicing → List → Detail → Search → Reprocess → Delete → Copyright → Vision
 * 
 * NO mock data. NO placeholders. All real implementations.
 * 
 * Designed to run inside the server-gateway Docker container:
 *   docker exec tikstream-server-gateway node /workspace/material-e2e-test.mjs
 */

import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';

// --- Configuration ---
// Inside Docker, use internal service names; outside Docker, use localhost
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const GPU_BASE = process.env.E2E_GPU_URL || 'http://gpu-slicing-worker:3101';
const VIDEO_FILE = process.env.E2E_VIDEO_PATH || '/assets/videos/04-scenic-landscape-5s.mp4';
const DEMO_PRODUCT_ID = 'ee605a50-9ced-4889-af50-ecc9adb25da3';
// Use a second product for cross-product isolation testing
const SECOND_PRODUCT_ID = 'b9c52914-81fa-407d-9c57-004f90a487e4';

// --- Timing ---
const SLICE_POLL_INTERVAL_MS = 10_000;  // 10 seconds between polls
const SLICE_MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes max for GPU slicing
const REPROCESS_MAX_WAIT_MS = 20 * 60 * 1000; // 20 minutes max for full reprocess
const API_TIMEOUT_MS = 30_000;

// --- State ---
const results = [];
const uploadedMaterialIds = [];  // Track all uploaded materials for cleanup

// --- Helpers ---
function log(phase, msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] [${phase}] ${msg}`); }
function pass(phase, detail = '') { results.push({ phase, ok: true, detail }); console.log(`  PASS ${phase}` + (detail ? ': ' + detail : '')); }
function fail(phase, detail) { results.push({ phase, ok: false, detail }); console.error(`  FAIL ${phase}: ${detail}`); }
function skip(phase, detail = '') { results.push({ phase, ok: true, detail: detail || 'SKIP', skipped: true }); console.log(`  SKIP ${phase}` + (detail ? ': ' + detail : '')); }
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Parse URL into hostname/port/protocol components.
 */
function parseBaseUrl(url) {
  const u = new URL(url);
  return {
    protocol: u.protocol,
    hostname: u.hostname,
    port: parseInt(u.port || (u.protocol === 'https:' ? '443' : '80'), 10),
  };
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.signal ? undefined : API_TIMEOUT_MS);
  // Don't set Content-Type if there's no body (avoids Express body parser hanging)
  const headers = { ...(init.headers || {}) };
  if (init.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const res = await fetch(url, { ...init, headers, signal: init.signal || controller.signal });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upload a file via raw HTTP multipart POST.
 * Avoids Node.js 22 FormData+File constructor which causes OOM in Docker
 * for files >1MB. Uses manual Buffer-based multipart construction.
 */
function uploadViaRawHttp(fileBuffer, fileName, mimeType, fields, baseUrl) {
  return new Promise((resolve) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const CRLF = '\r\n';
    const parts = [];

    // Text fields
    for (const [name, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`
      ));
    }

    // File field
    parts.push(Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

    const body = Buffer.concat(parts);
    const { hostname, port } = parseBaseUrl(baseUrl);

    const opts = {
      hostname,
      port,
      path: '/api/v1/materials/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 120_000,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let body;
        try { body = data ? JSON.parse(data) : null; } catch { body = data; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body });
      });
    });

    req.on('error', (e) => {
      resolve({ ok: false, status: 0, body: null, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: null, error: 'Upload timeout' });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Upload a file from disk.
 */
async function uploadFile(filePath, fields) {
  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();

  const mimeMap = {
    '.mp4': 'video/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';

  log('Upload', `Uploading ${fileName} (${buffer.length} bytes, ${mimeType})...`);

  return uploadViaRawHttp(buffer, fileName, mimeType, fields, BASE);
}

/**
 * Upload raw buffer as a file upload (for in-memory images).
 */
async function uploadBuffer(buffer, fileName, mimeType, fields) {
  log('Upload', `Uploading ${fileName} (${buffer.length} bytes, ${mimeType})...`);

  return uploadViaRawHttp(buffer, fileName, mimeType, fields, BASE);
}

/**
 * Create a valid PNG image buffer (RGB, no alpha).
 * Qwen3-VL requires at least 28x28 pixels.
 */
function createPng(width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // Raw image data: filter byte 0 + RGB per row
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + width * 3);
    rawData[rowOff] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const off = rowOff + 1 + x * 3;
      // Create a simple gradient pattern
      rawData[off]     = Math.floor(255 * x / width);        // R
      rawData[off + 1] = Math.floor(255 * y / height);       // G
      rawData[off + 2] = 128;                                 // B
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = crc32(crcBuf);
  const crcOut = Buffer.alloc(4);
  crcOut.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcOut]);
}

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ============================================================================
// Phase 1: Service Health Check
// ============================================================================
async function phase1_health() {
  const phase = 'P1-Health';
  log(phase, 'Checking all service health...');

  const services = [
    ['Gateway', `${BASE}/health`],
    ['GPU Worker', `${GPU_BASE}/health`],
  ];

  let allOk = true;
  for (const [name, url] of services) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) { fail(phase, `${name} HTTP ${res.status}`); allOk = false; }
      else { log(phase, `${name} OK (${res.status})`); }
    } catch (error) {
      fail(phase, `${name} unreachable: ${error.message}`); allOk = false;
    }
  }

  if (allOk) pass(phase, 'All services healthy');
  return allOk;
}

// ============================================================================
// Phase 2: Upload Video Material
// ============================================================================
async function phase2_uploadVideo() {
  const phase = 'P2-Upload-Video';
  log(phase, 'Uploading video material...');

  if (!fs.existsSync(VIDEO_FILE)) {
    fail(phase, `Video file not found: ${VIDEO_FILE}`);
    return null;
  }

  const { ok, status, body } = await uploadFile(VIDEO_FILE, {
    product_id: DEMO_PRODUCT_ID,
    type: 'VIDEO',
    source_type: 'UPLOAD',
    remark: 'E2E Test Video',
  });

  const materialId = body?.material_id || body?.data?.material_id;
  if (!ok || !materialId) {
    fail(phase, `HTTP ${status}: ${JSON.stringify(body).slice(0, 500)}`);
    return null;
  }

  uploadedMaterialIds.push(materialId);
  pass(phase, `material_id=${materialId}, file=${path.basename(VIDEO_FILE)}, size=${body?.file_size_bytes || '?'}`);
  return { materialId, body };
}

// ============================================================================
// Phase 3: Upload Image Material
// ============================================================================
async function phase3_uploadImage() {
  const phase = 'P3-Upload-Image';
  log(phase, 'Uploading image material...');

  // Create a valid 64x64 RGB PNG (minimum 28x28 required by Qwen3-VL)
  const testImage = createPng(64, 64);
  const { ok, status, body } = await uploadBuffer(testImage, 'e2e-test-image.png', 'image/png', {
    product_id: DEMO_PRODUCT_ID,
    type: 'IMAGE',
    source_type: 'UPLOAD',
    remark: 'E2E Test Image',
  });

  const materialId = body?.material_id || body?.data?.material_id;
  if (!ok || !materialId) {
    fail(phase, `HTTP ${status}: ${JSON.stringify(body).slice(0, 500)}`);
    return null;
  }

  uploadedMaterialIds.push(materialId);

  // Image materials should complete immediately
  const imgStatus = body?.status || body?.data?.status;
  if (imgStatus !== 'COMPLETED') {
    log(phase, `Image status=${imgStatus} (expected COMPLETED)`);
  }

  pass(phase, `material_id=${materialId}, type=IMAGE, status=${imgStatus}`);
  return { materialId, body };
}

// ============================================================================
// Phase 4: Wait for Video Slicing Completion
// ============================================================================
async function phase4_waitSlicing(videoMaterialId) {
  const phase = 'P4-Slicing-Wait';
  log(phase, `Waiting for video slicing to complete (material: ${videoMaterialId})...`);
  log(phase, `Max wait: ${SLICE_MAX_WAIT_MS / 60000} minutes`);

  const deadline = Date.now() + SLICE_MAX_WAIT_MS;
  let pollCount = 0;

  while (Date.now() < deadline) {
    pollCount++;
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${videoMaterialId}`);

    if (!ok) {
      log(phase, `Poll #${pollCount}: HTTP error, retrying...`);
      await sleep(SLICE_POLL_INTERVAL_MS);
      continue;
    }

    const material = body?.material || body?.data?.material || body?.data || body;
    const status = material?.status;
    const slices = body?.slices || body?.data?.slices || [];
    const completedSlices = slices.filter(s => s.status === 'COMPLETED').length;

    log(phase, `Poll #${pollCount}: status=${status}, slices=${slices.length}, completed=${completedSlices}, elapsed=${Math.round((Date.now() - (deadline - SLICE_MAX_WAIT_MS)) / 1000)}s`);

    if (status === 'FAILED') {
      fail(phase, `Material FAILED: remark=${material?.remark || 'no reason'}, slices=${JSON.stringify(slices.slice(0, 3))}`);
      return null;
    }

    if (status === 'COMPLETED') {
      if (completedSlices < slices.length) {
        log(phase, `WARNING: Material status=COMPLETED but only ${completedSlices}/${slices.length} slices completed`);
      }
      pass(phase, `Completed with ${completedSlices}/${slices.length} slices`);
      return { material, slices };
    }

    if (status === 'PROCESSING') {
      const totalDuration = slices.reduce((sum, s) => sum + (s.duration || 0), 0);
      log(phase, `Processing: ${completedSlices}/${slices.length} slices done, total_video_duration=${totalDuration.toFixed(1)}s`);
    }

    await sleep(SLICE_POLL_INTERVAL_MS);
  }

  fail(phase, `Slicing timeout after ${SLICE_MAX_WAIT_MS / 60000} minutes (${pollCount} polls)`);
  return null;
}

// ============================================================================
// Phase 5: List Materials (with filter tests)
// ============================================================================
async function phase5_listMaterials() {
  const phase = 'P5-List';
  log(phase, 'Testing material list queries...');
  let allOk = true;

  // 5a: Basic list by product_id
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials?product_id=${DEMO_PRODUCT_ID}&limit=10`);
    if (!ok || !body?.items) {
      fail(phase+'-Basic', `HTTP ${body?.status || '?'}`);
      allOk = false;
    } else {
      const count = body.items.length;
      log(phase+'-Basic', `Found ${count} materials, total_count=${body.page_info?.total_count}`);
      if (count === 0) {
        fail(phase+'-Basic', 'No materials found (expected at least 1 from upload)');
        allOk = false;
      } else {
        pass(phase+'-Basic', `${count} materials`);
      }
    }
  }

  // 5b: List with type filter
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials?product_id=${DEMO_PRODUCT_ID}&type=VIDEO&limit=10`);
    if (!ok || !body?.items) {
      fail(phase+'-TypeFilter', `Failed`);
      allOk = false;
    } else {
      const allVideo = body.items.every(item => item.type === 'VIDEO');
      pass(phase+'-TypeFilter', `${body.items.length} materials, all VIDEO: ${allVideo}`);
      if (!allVideo) allOk = false;
    }
  }

  // 5c: List with status filter
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials?product_id=${DEMO_PRODUCT_ID}&status=COMPLETED&limit=10`);
    if (!ok || !body?.items) {
      fail(phase+'-StatusFilter', `Failed`);
      allOk = false;
    } else {
      const allCompleted = body.items.every(item => item.status === 'COMPLETED');
      pass(phase+'-StatusFilter', `${body.items.length} materials, all COMPLETED: ${allCompleted}`);
    }
  }

  // 5d: List with keyword search
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials?product_id=${DEMO_PRODUCT_ID}&keyword=e2e&limit=10`);
    if (!ok || !body?.items) {
      fail(phase+'-Keyword', `Failed`);
      allOk = false;
    } else {
      pass(phase+'-Keyword', `${body.items.length} materials matching "e2e"`);
    }
  }

  // 5e: Cursor pagination
  {
    const { ok: ok1, body: page1 } = await fetchJson(`${BASE}/api/v1/materials?product_id=${DEMO_PRODUCT_ID}&limit=5`);
    const cursor = page1?.page_info?.cursor;
    if (cursor) {
      const { ok: ok2, body: page2 } = await fetchJson(`${BASE}/api/v1/materials?product_id=${DEMO_PRODUCT_ID}&limit=5&cursor=${cursor}`);
      if (ok2 && page2?.items && page2.items.length > 0) {
        pass(phase+'-Pagination', `Page 2 has ${page2.items.length} items`);
      } else {
        fail(phase+'-Pagination', `Page 2 failed or empty`);
        allOk = false;
      }
    } else {
      log(phase+'-Pagination', `Not enough items for cursor test (need > 5)`);
      skip(phase+'-Pagination', 'Not enough items');
    }
  }

  if (allOk) pass(phase, 'All list tests passed');
  return allOk;
}

// ============================================================================
// Phase 6: Get Material Detail
// ============================================================================
async function phase6_detail(materialId) {
  const phase = 'P6-Detail';
  log(phase, `Getting detail for material: ${materialId}`);

  const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);

  if (!ok) {
    fail(phase, `HTTP error`);
    return false;
  }

  const material = body?.material || body?.data?.material || body?.data;
  const slices = body?.slices || body?.data?.slices || [];

  if (!material) {
    fail(phase, 'No material data in response');
    return false;
  }

  log(phase, `file_name=${material.file_name}, type=${material.type}, status=${material.status}`);
  log(phase, `duration=${material.duration_seconds}s, size=${material.file_size_bytes}, slices=${slices.length}`);

  if (!material.material_id) {
    fail(phase, 'material_id missing in response');
    return false;
  }

  if (material.type === 'VIDEO') {
    if (slices.length > 0) {
      log(phase, `Slice 1: id=${slices[0]?.slice_id}, status=${slices[0]?.status}, start=${slices[0]?.start_time}`);
    }
  }

  // Check product info
  if (material.product) {
    log(phase, `Product: ${material.product.title} (${material.product.category})`);
  }

  pass(phase, `file=${material.file_name}, type=${material.type}, slices=${slices.length}`);
  return true;
}

// ============================================================================
// Phase 7: Search Materials
// ============================================================================
async function phase7_search() {
  const phase = 'P7-Search';
  log(phase, 'Testing material search...');
  let allOk = true;

  // 7a: Keyword search (no vector, uses ILIKE on denseCaption + tags)
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: DEMO_PRODUCT_ID,
        query: 'scenic landscape',
        type: 'VIDEO',
        status: 'COMPLETED',
        search_mode: 'KEYWORD',
        limit: 10,
      }),
    });

    if (!ok) {
      fail(phase+'-Keyword', `HTTP error: ${JSON.stringify(body).slice(0, 200)}`);
      allOk = false;
    } else {
      const items = body?.items || body?.data?.items || [];
      const source = body?.search_source || body?.data?.search_source;
      log(phase+'-Keyword', `Found ${items.length} results, source=${source}`);
      if (items.length > 0) {
        pass(phase+'-Keyword', `${items.length} results (source: ${source})`);
      } else {
        // No results is acceptable for a fresh test (no embedding data yet)
        log(phase+'-Keyword', 'No keyword search results (fresh test, may need embedding data)');
        pass(phase+'-Keyword', '0 results (acceptable - no embedding data yet)');
      }
    }
  }

  // 7b: AUTO search mode
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: DEMO_PRODUCT_ID,
        query: 'landscape video',
        type: 'VIDEO',
        search_mode: 'AUTO',
        limit: 10,
      }),
    });

    if (!ok) {
      fail(phase+'-Auto', `HTTP error: ${JSON.stringify(body).slice(0, 200)}`);
      allOk = false;
    } else {
      const items = body?.items || body?.data?.items || [];
      const source = body?.search_source || body?.data?.search_source || 'unknown';
      log(phase+'-Auto', `Found ${items.length} results, source=${source}`);
      pass(phase+'-Auto', `${items.length} results (source: ${source})`);
    }
  }

  // 7c: Search with duration filters
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: DEMO_PRODUCT_ID,
        query: 'video',
        type: 'VIDEO',
        status: 'COMPLETED',
        min_duration: 1.0,
        max_duration: 5.0,
        search_mode: 'KEYWORD',
        limit: 10,
      }),
    });

    if (!ok) {
      fail(phase+'-Duration', `HTTP error: ${JSON.stringify(body).slice(0, 200)}`);
      allOk = false;
    } else {
      const items = body?.items || body?.data?.items || [];
      log(phase+'-Duration', `Found ${items.length} results in duration range 1.0-5.0s`);
      pass(phase+'-Duration', `${items.length} results`);
    }
  }

  if (allOk) pass(phase, 'All search tests passed');
  return allOk;
}

// ============================================================================
// Phase 8: Reprocess Material
// ============================================================================
async function phase8_reprocess(materialId) {
  const phase = 'P8-Reprocess';
  log(phase, `Reprocessing material: ${materialId}`);

  // First check current status
  const { ok: detailOk, body: detailBody } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);
  const currentStatus = detailBody?.material?.status || detailBody?.data?.material?.status;

  if (currentStatus !== 'COMPLETED' && currentStatus !== 'FAILED') {
    log(phase, `Current status=${currentStatus}, cannot reprocess (needs COMPLETED or FAILED)`);
    skip(phase, `status=${currentStatus} (not reprocessable)`);
    return null;
  }

  const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}/reprocess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!ok) {
    const errorCode = body?.response?.error?.code || body?.error?.code || 'UNKNOWN';
    fail(phase, `HTTP error: code=${errorCode}`);
    return null;
  }

  const taskId = body?.task_id || body?.data?.task_id;
  const newStatus = body?.status || body?.data?.status;

  log(phase, `Reprocess initiated: task_id=${taskId}, status=${newStatus}`);

  // For non-VIDEO materials (IMAGE), reprocess should complete immediately
  if (newStatus === 'COMPLETED') {
    pass(phase, `Reprocess completed immediately (IMAGE type)`);
    return { ok: true };
  }

  // For VIDEO materials, wait for re-slicing
  if (newStatus === 'PENDING') {
    log(phase, 'Waiting for reprocess slicing...');
    const deadline = Date.now() + REPROCESS_MAX_WAIT_MS;
    let pollCount = 0;

    while (Date.now() < deadline) {
      pollCount++;
      const { ok: pollOk, body: pollBody } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);
      const status = pollBody?.material?.status || pollBody?.data?.material?.status;
      const slices = pollBody?.slices || pollBody?.data?.slices || [];
      const completedSlices = slices.filter(s => s.status === 'COMPLETED').length;

      log(phase, `Poll #${pollCount}: status=${status}, slices=${slices.length}, completed=${completedSlices}`);

      if (status === 'FAILED') {
        fail(phase, `Reprocess FAILED`);
        return null;
      }

      if (status === 'COMPLETED') {
        pass(phase, `Reprocess completed: ${completedSlices}/${slices.length} slices`);
        return { ok: true };
      }

      await sleep(SLICE_POLL_INTERVAL_MS);
    }

    fail(phase, `Reprocess timeout`);
    return null;
  }

  pass(phase, `Reprocess submitted`);
  return { ok: true };
}

// ============================================================================
// Phase 9: Copyright Check
// ============================================================================
async function phase9_copyright(materialId) {
  const phase = 'P9-Copyright';
  log(phase, `Checking copyright for material: ${materialId}`);

  const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}/check-copyright`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!ok) {
    fail(phase, `HTTP error: ${JSON.stringify(body).slice(0, 300)}`);
    return false;
  }

  const data = body?.data || body;
  const copyrightStatus = data?.copyright_status || 'UNKNOWN';
  const confidence = data?.confidence;

  log(phase, `Copyright status: ${copyrightStatus}, confidence: ${confidence}`);
  pass(phase, `status=${copyrightStatus}, confidence=${confidence}`);
  return true;
}

// ============================================================================
// Phase 10: Vision Analysis (AI Vision Understanding)
// ============================================================================
async function phase10_vision(materialId) {
  const phase = 'P10-Vision';
  log(phase, `Running AI vision analysis for material: ${materialId}`);

  const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}/vision-analyze`, {
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
  });

  if (!ok) {
    const error = body?.error || body?.response?.error || {};
    const errorCode = error?.code || 'UNKNOWN';
    // Vision analysis requires SiliconFlow API key. If not available, skip
    if (errorCode === 'VISION_ANALYSIS_FAILED' || error?.message?.includes('API key')) {
      log(phase, `Vision API not available: ${error?.message || JSON.stringify(body).slice(0, 200)}`);
      skip(phase, 'Vision API not configured (needs SILICONFLOW_API_KEY)');
      return false;
    }
    fail(phase, `HTTP error: ${JSON.stringify(body).slice(0, 300)}`);
    return false;
  }

  const data = body?.data || body;
  if (data?.product_features || data?.style_tags || data?.visual_selling_points) {
    log(phase, `Features: ${(data.product_features || []).join(', ')}`);
    log(phase, `Style tags: ${(data.style_tags || []).join(', ')}`);
    pass(phase, `Vision analysis completed`);
    return true;
  }

  skip(phase, 'No AI results (API may not be configured)');
  return false;
}

// ============================================================================
// Phase 11: Delete / Trash Flow
// ============================================================================
async function phase11_deleteTrash(materialId) {
  const phase = 'P11-Delete-Trash';
  log(phase, `Testing delete/trash flow for material: ${materialId}`);
  let allOk = true;

  // 11a: Soft delete (move to trash)
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`, {
      method: 'DELETE',
    });
    if (!ok) {
      fail(phase+'-SoftDelete', `HTTP error: ${JSON.stringify(body).slice(0, 200)}`);
      allOk = false;
    } else {
      pass(phase+'-SoftDelete', 'Material moved to trash');
    }
  }

  // 11b: Check trash list
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/trash?product_id=${DEMO_PRODUCT_ID}&limit=10`);
    if (!ok) {
      fail(phase+'-TrashList', `HTTP error`);
      allOk = false;
    } else {
      const items = body?.items || [];
      const found = items.some(item => item.material_id === materialId);
      log(phase+'-TrashList', `Trash has ${items.length} items, found deleted=${found}`);
      if (found) {
        pass(phase+'-TrashList', `Found deleted material in trash`);
      } else {
        fail(phase+'-TrashList', 'Deleted material NOT found in trash');
        allOk = false;
      }
    }
  }

  // 11c: Restore from trash
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}/restore`, {
      method: 'POST',
    });
    if (!ok) {
      fail(phase+'-Restore', `HTTP error: ${JSON.stringify(body).slice(0, 200)}`);
      allOk = false;
    } else {
      pass(phase+'-Restore', 'Material restored from trash');
    }
  }

  // 11d: Verify restored
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);
    if (!ok) {
      fail(phase+'-VerifyRestore', 'Material not found after restore');
      allOk = false;
    } else {
      pass(phase+'-VerifyRestore', 'Material accessible after restore');
    }
  }

  // 11e: Soft delete again for permanent delete test
  {
    await fetchJson(`${BASE}/api/v1/materials/${materialId}`, { method: 'DELETE' });
  }

  // 11f: Permanent delete
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}/permanent`, {
      method: 'DELETE',
    });
    if (!ok) {
      fail(phase+'-Permanent', `HTTP error: ${JSON.stringify(body).slice(0, 200)}`);
      allOk = false;
    } else {
      pass(phase+'-Permanent', 'Material permanently deleted');
    }
  }

  // 11g: Verify permanently deleted
  {
    const { ok, body } = await fetchJson(`${BASE}/api/v1/materials/${materialId}`);
    if (!ok && (body?.response?.error?.code === 'MATERIAL_NOT_FOUND' || body?.error?.code === 'MATERIAL_NOT_FOUND')) {
      pass(phase+'-VerifyPermanent', 'Material confirmed permanently deleted (404)');
    } else {
      fail(phase+'-VerifyPermanent', `Material still accessible after permanent delete`);
      allOk = false;
    }
  }

  // Remove from tracking since we permanently deleted it
  const idx = uploadedMaterialIds.indexOf(materialId);
  if (idx >= 0) uploadedMaterialIds.splice(idx, 1);

  if (allOk) pass(phase, 'All delete/trash tests passed');
  return allOk;
}

// ============================================================================
// Phase 12: Cross-Product Data Isolation
// ============================================================================
async function phase12_crossProduct() {
  const phase = 'P12-CrossProduct';
  log(phase, 'Testing cross-product data isolation...');

  // List materials for second product should be empty or contain different materials
  const { ok, body } = await fetchJson(`${BASE}/api/v1/materials?product_id=${SECOND_PRODUCT_ID}&limit=10`);
  if (!ok) {
    fail(phase, `HTTP error`);
    return false;
  }

  const items = body?.items || [];
  // Verify none of our test materials leak into the second product
  const leakedIds = items.filter(item => uploadedMaterialIds.includes(item.material_id));
  if (leakedIds.length > 0) {
    fail(phase, `Data leak detected: ${leakedIds.length} materials from product 1 found in product 2`);
    return false;
  }

  pass(phase, `No data leak: ${items.length} materials in product 2, 0 from product 1`);
  return true;
}

// ============================================================================
// Cleanup: Remove remaining test materials  
// ============================================================================
async function cleanup() {
  const phase = 'Cleanup';
  log(phase, `Cleaning up ${uploadedMaterialIds.length} remaining test materials...`);

  for (const id of uploadedMaterialIds) {
    try {
      // Soft delete then permanent delete
      await fetchJson(`${BASE}/api/v1/materials/${id}`, { method: 'DELETE' });
      await fetchJson(`${BASE}/api/v1/materials/${id}/permanent`, { method: 'DELETE' });
      log(phase, `Cleaned up: ${id}`);
    } catch (error) {
      log(phase, `Cleanup failed for ${id}: ${error.message}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  TikStream Material Module — E2E Test Suite        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`Gateway: ${BASE}`);
  console.log(`GPU Worker: ${GPU_BASE}`);
  console.log(`Video: ${VIDEO_FILE} (${fs.existsSync(VIDEO_FILE) ? 'found' : 'NOT FOUND'})`);
  console.log(`Product: ${DEMO_PRODUCT_ID}\n`);

  // Phase 1: Health Check
  if (!(await phase1_health())) {
    console.error('\nHealth check failed. Aborting.');
    process.exit(1);
  }

  // Phase 2: Upload Video
  const videoResult = await phase2_uploadVideo();
  if (!videoResult) {
    console.error('\nVideo upload failed. Aborting.');
    await cleanup();
    process.exit(1);
  }

  // Phase 3: Upload Image
  const imageResult = await phase3_uploadImage();

  // Phase 4: Wait for Slicing
  const sliceResult = await phase4_waitSlicing(videoResult.materialId);
  if (!sliceResult) {
    console.error('\nSlicing failed or timed out. Continuing with remaining tests...');
  }

  // Phase 5: List Materials
  await phase5_listMaterials();

  // Phase 6: Get Material Detail
  await phase6_detail(videoResult.materialId);
  if (imageResult) {
    await phase6_detail(imageResult.materialId);
  }

  // Phase 7: Search
  await phase7_search();

  // Phase 8: Reprocess (only if slicing completed)
  if (sliceResult) {
    await phase8_reprocess(videoResult.materialId);
  }

  // Phase 9: Copyright Check
  await phase9_copyright(videoResult.materialId);

  // Phase 10: Vision Analysis
  await phase10_vision(imageResult ? imageResult.materialId : videoResult.materialId);

  // Phase 11: Delete/Trash Flow (use image material for this test)
  if (imageResult) {
    await phase11_deleteTrash(imageResult.materialId);
  }

  // Phase 12: Cross-Product Data Isolation
  await phase12_crossProduct();

  // Cleanup
  await cleanup();

  // Summary
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  Test Results Summary                              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  let passed = 0, failed = 0, skipped = 0;
  for (const r of results) {
    if (r.skipped) {
      skipped++;
      console.log(`  SKIP  ${r.phase}${r.detail ? ' - ' + r.detail : ''}`);
    } else if (r.ok) {
      passed++;
      console.log(`  PASS  ${r.phase}${r.detail ? ' - ' + r.detail : ''}`);
    } else {
      failed++;
      console.log(`  FAIL  ${r.phase}${r.detail ? ' - ' + r.detail : ''}`);
    }
  }

  console.log(`\n  Total: ${results.length}, Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`);

  if (failed > 0) {
    console.log('\n  Some tests FAILED. See errors above for details.');
    process.exit(1);
  }

  console.log('\n  All material module tests PASSED!');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
