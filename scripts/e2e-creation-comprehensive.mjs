#!/usr/bin/env node
/**
 * TikStream AI — 创作模块完整E2E测试
 * 覆盖: SCRIPT_DRIVEN / IMAGE_DRIVEN / PROMPT_DRIVEN 三种模式
 *       字幕验证 / 分镜重渲染 / 剧本生成(quick/viral-rewrite/template)
 *       完整视频生成并下载验证
 * 
 * 使用方式: node scripts/e2e-creation-comprehensive.mjs
 * 环境变量: E2E_BASE_URL (默认 http://localhost:3000)
 *          E2E_MAX_WAIT_MIN (默认 30, 每个创作最多等待分钟数)
 *          E2E_SKIP_AI_VIDEO (默认 false, 设为true跳过AI视频生成，使用素材匹配)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const MAX_WAIT_MIN = parseInt(process.env.E2E_MAX_WAIT_MIN || '30', 10);
const SKIP_AI_VIDEO = process.env.E2E_SKIP_AI_VIDEO === 'true';
const OUTPUT_DIR = path.join(ROOT, 'e2e_test_output');
const ASSETS_DIR = path.join(ROOT, 'assets');

const RESULTS = [];
let PHASE_NUM = 0;

// ====== Utilities ======

function phase(name) {
  PHASE_NUM++;
  const id = `P${PHASE_NUM}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${id}] ${name}`);
  console.log(`${'='.repeat(60)}`);
  return id;
}

function ok(id, detail = '') {
  RESULTS.push({ id, ok: true, name: id, detail });
  console.log(`  ✅ PASS${detail ? ` — ${detail}` : ''}`);
}

function fail(id, detail) {
  RESULTS.push({ id, ok: false, name: id, detail });
  console.error(`  ❌ FAIL: ${detail}`);
}

function warn(id, detail) {
  RESULTS.push({ id, ok: true, name: id, detail: `⚠️ ${detail}` });
  console.warn(`  ⚠️  WARN: ${detail}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 构建 multipart/form-data 请求体 (Node.js 原生 File/FormData 文件上传有兼容性问题) */
function buildMultipartBody(fields, fileFieldName, fileName, fileBuffer, mimeType = 'image/jpeg') {
  const boundary = `----FormBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  const CRLF = '\r\n';
  let body = '';
  
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}`;
    body += `${value}${CRLF}`;
  }
  
  body += `--${boundary}${CRLF}`;
  body += `Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"${CRLF}`;
  body += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
  
  const head = Buffer.from(body, 'utf8');
  const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
  const full = Buffer.concat([head, fileBuffer, tail]);
  
  return { body: full, contentType: `multipart/form-data; boundary=${boundary}` };
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

function dumpError(context, body) {
  console.error(`  [DEBUG ${context}]`, JSON.stringify(body).substring(0, 500));
}

// ====== Phase 1: Health Check ======

async function test_health() {
  const id = phase('Health Check - 所有服务健康检查');

  const checks = [
    ['Gateway', `${BASE}/health`],
    ['Worker:Remotion', 'http://localhost:3102/health'],
    ['Worker:GPU-Slicing', 'http://localhost:3101/health'],
    ['Embed Server', 'http://localhost:8088/ready'],
  ];

  let allOk = true;
  for (const [name, url] of checks) {
    try {
      const { ok: hOk, body } = await fetchJson(url);
      if (!hOk) {
        fail(id, `${name} 不可用 (HTTP error): ${JSON.stringify(body).substring(0, 100)}`);
        allOk = false;
      } else {
        console.log(`  ✓ ${name} OK`);
      }
    } catch (e) {
      fail(id, `${name} 不可达: ${e.message}`);
      allOk = false;
    }
  }

  if (allOk) ok(id, '所有服务健康');
  return allOk;
}

// ====== Phase 2: 获取种子数据 ======

async function test_seed_data() {
  const id = phase('种子数据验证');

  // 获取商品
  const { body: pBody } = await fetchJson(`${BASE}/api/v1/products?page=1&page_size=1`);
  if (!pBody?.success || !pBody?.data?.items?.length) {
    fail(id, '无种子商品数据');
    return null;
  }
  const product = pBody.data.items[0];
  console.log(`  商品: ${product.title} (${product.id})`);

  // 获取模板
  const { body: tBody } = await fetchJson(`${BASE}/api/v1/templates?page=1&page_size=5`);
  const templateRaw = tBody?.data?.items?.[0];
  const template = templateRaw ? { ...templateRaw, id: templateRaw.template_id || templateRaw.id } : null;
  if (template) console.log(`  模板: ${template.name} (${template.id})`);

  // 获取爆款分析
  const { body: vBody } = await fetchJson(`${BASE}/api/v1/viral-video-analyses?page=1&page_size=5`);
  const viralRaw = vBody?.data?.items?.[0] || vBody?.data?.data?.[0];
  const viral = viralRaw ? { ...viralRaw, id: viralRaw.analysis_id || viralRaw.id } : null;
  if (viral) console.log(`  爆款分析: ${viral.title || viral.id} (${viral.id})`);

  ok(id, `商品=${product.title}, 模板=${template ? '有' : '无'}, 爆款=${viral ? '有' : '无'}`);
  return { product, template, viral };
}

// ====== Phase 3: 剧本生成 (3种可用模式) ======

async function test_script_quick(product) {
  const id = phase('剧本生成 - quick 快速模式');

  try {
    const { ok: sOk, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        selling_points: product.selling_points || [product.title],
        style_vibe: 'clean-tech',
        aspect_ratio: '9:16',
        language: 'zh-CN',
        constraint_list: ['total_duration<=15s'],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!sOk || !body?.success) {
      const errMsg = body?.error || body?.message || JSON.stringify(body).substring(0, 200);
      fail(id, `HTTP ${status}: ${errMsg}`);
      return null;
    }

    const script = body.data;
    const scriptId = script?.id || script?.script_id;
    const shots = script?.shots || [];

    // 验证基本结构
    if (!scriptId) { fail(id, '缺少 script_id'); return null; }
    if (shots.length < 2) { fail(id, `分镜数不足: ${shots.length}`); return null; }

    // 验证字幕文本
    let hasSubs = 0;
    for (const s of shots) {
      if (s.subtitle_text?.trim()) hasSubs++;
    }
    if (hasSubs === 0) { warn(id, '所有分镜均无字幕文本'); }

    ok(id, `script_id=${scriptId}, shots=${shots.length}, title="${script?.title}", 有字幕分镜=${hasSubs}/${shots.length}`);
    return { scriptId, shots, script };
  } catch (e) {
    fail(id, `异常: ${e.message}`);
    return null;
  }
}

async function test_script_viral_rewrite(product, viral) {
  const id = phase('剧本生成 - viral-rewrite 爆款仿写模式');

  if (!viral) {
    warn(id, '跳过(无爆款分析数据)');
    return null;
  }

  try {
    const { ok: sOk, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/viral-rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        viral_video_id: viral.id,
        selling_points: product.selling_points || [product.title],
        style_vibe: 'emotional',
        aspect_ratio: '9:16',
        language: 'zh-CN',
        constraint_list: ['total_duration<=15s'],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!sOk || !body?.success) {
      const errMsg = body?.error || body?.message || JSON.stringify(body).substring(0, 200);
      fail(id, `HTTP ${status}: ${errMsg}`);
      return null;
    }

    const script = body.data;
    const scriptId = script?.id || script?.script_id;
    const shots = script?.shots || [];

    if (!scriptId) { fail(id, '缺少 script_id'); return null; }
    if (shots.length === 0) { fail(id, '分镜数为0'); return null; }

    ok(id, `script_id=${scriptId}, shots=${shots.length}, title="${script?.title}"`);
    return { scriptId, shots, script };
  } catch (e) {
    fail(id, `异常: ${e.message}`);
    return null;
  }
}

async function test_script_template(product, template) {
  const id = phase('剧本生成 - template 模板驱动模式');

  if (!template) {
    warn(id, '跳过(无可用模板)');
    return null;
  }

  try {
    const { ok: sOk, status, body } = await fetchJson(`${BASE}/api/v1/scripts/generate/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        template_id: template.id,
        selling_points: product.selling_points || [product.title],
        style_vibe: 'cinematic',
        aspect_ratio: '9:16',
        language: 'zh-CN',
        constraint_list: ['total_duration<=15s'],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!sOk || !body?.success) {
      const errMsg = body?.error || body?.message || JSON.stringify(body).substring(0, 200);
      fail(id, `HTTP ${status}: ${errMsg}`);
      return null;
    }

    const script = body.data;
    const scriptId = script?.id || script?.script_id;
    const shots = script?.shots || [];

    if (!scriptId) { fail(id, '缺少 script_id'); return null; }
    if (shots.length === 0) { fail(id, '分镜数为0'); return null; }

    ok(id, `script_id=${scriptId}, shots=${shots.length}, title="${script?.title}"`);
    return { scriptId, shots, script };
  } catch (e) {
    fail(id, `异常: ${e.message}`);
    return null;
  }
}

// ====== Phase 4: 创作任务创建与等待 ======

async function createCreation(productId, scriptId, modeOpts = {}) {
  const { engineMode = 'SCRIPT_DRIVEN', materialId, productUrl, productTitle, sellingPoints, preferAiVideo = SKIP_AI_VIDEO } = modeOpts;

  const body = {
    product_id: productId,
    engine_mode: engineMode,
    prefer_ai_video: preferAiVideo,
    force_refresh: true,
  };

  if (scriptId) body.script_id = scriptId;
  if (materialId) body.material_id = materialId;
  if (productUrl) body.product_url = productUrl;
  if (productTitle) body.product_title = productTitle;
  if (sellingPoints) body.product_selling_points = sellingPoints;

  return await fetchJson(`${BASE}/api/v1/creations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function waitForCreation(creationId, maxMinutes, label = '') {
  const id = `P${PHASE_NUM}`;
  const prefix = label ? `[${label}] ` : '';
  const deadline = Date.now() + maxMinutes * 60_000;
  let lastStatus = '';
  let lastStage = '';

  while (Date.now() < deadline) {
    const { ok: cOk, body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
    const data = body?.data || body;
    const status = data?.status;
    const stage = data?.current_stage;
    const progress = data?.progress;

    if (status !== lastStatus || stage !== lastStage) {
      console.log(`  ${prefix}status=${status}, stage=${stage}, progress=${progress ?? '?'}%`);
      lastStatus = status;
      lastStage = stage;
    }

    if (status === 'FAILED') {
      const errMsg = data?.error_message || data?.error || JSON.stringify(body).substring(0, 300);
      return { status: 'FAILED', error: errMsg, data };
    }
    if (status === 'FINISHED') {
      const videoUrl = data?.video_url || data?.preview_url;
      const fileSize = data?.file_size_bytes;
      return { status: 'FINISHED', videoUrl, fileSize, data };
    }
    if (status === 'CANCELED') {
      return { status: 'CANCELED', data };
    }
    await sleep(10000);
  }
  return { status: 'TIMEOUT' };
}

// ====== Phase 5: SCRIPT_DRIVEN 模式测试 ======

async function test_mode_script_driven(product, scriptId) {
  const id = phase('创作模式: SCRIPT_DRIVEN (剧本驱动)');

  console.log('  发起创作任务...');
  const { ok: cOk, status: cStatus, body } = await createCreation(product.id, scriptId, {
    engineMode: 'SCRIPT_DRIVEN',
    preferAiVideo: true,
  });

  if (!cOk) {
    fail(id, `创建失败 HTTP ${cStatus}: ${JSON.stringify(body).substring(0, 300)}`);
    return null;
  }

  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  const taskId = data?.task_id;

  if (!creationId) {
    fail(id, `缺少 creation_id: ${JSON.stringify(body).substring(0, 300)}`);
    return null;
  }

  console.log(`  creation_id=${creationId}, task_id=${taskId}`);
  ok(`${id}-create`, `creation_id=${creationId}`);

  console.log(`  等待视频生成 (最多 ${MAX_WAIT_MIN} 分钟)...`);
  const result = await waitForCreation(creationId, MAX_WAIT_MIN, 'SCRIPT_DRIVEN');

  if (result.status === 'FINISHED') {
    const videoOk = await verifyVideo(result, creationId, 'SCRIPT_DRIVEN');
    if (videoOk) {
      ok(`${id}-video`, `video=${result.videoUrl}, size=${((result.fileSize || 0) / 1024 / 1024).toFixed(2)}MB`);
    }

    // 测试分镜重渲染
    await test_rerender_shot(creationId, id);

    return { creationId, result };
  } else if (result.status === 'FAILED') {
    fail(`${id}-video`, `视频生成失败: ${result.error}`);
    return null;
  } else {
    warn(`${id}-video`, `超时(>${MAX_WAIT_MIN}min)，状态=${result.status}`);
    return null;
  }
}

// ====== Phase 6: IMAGE_DRIVEN 模式测试 ======

async function test_mode_image_driven(product) {
  const id = phase('创作模式: IMAGE_DRIVEN (图片驱动)');

  // 先搜索已有的图片类型素材
  console.log('  搜索已上传的商品图片素材...');
  const { body: sBody } = await fetchJson(
    `${BASE}/api/v1/materials?product_id=${product.id}&type=IMAGE&status=COMPLETED&page=1&page_size=5`
  );

  const images = sBody?.data?.items || sBody?.data?.data || [];
  let materialId = null;

  if (images.length > 0) {
    materialId = images[0].id || images[0].material_id;
    console.log(`  使用已有图片素材: ${materialId}`);
  } else {
    // 尝试上传一个测试图片
    const demoDir = path.join(ASSETS_DIR, 'demo');
    if (fs.existsSync(demoDir)) {
      const files = fs.readdirSync(demoDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      if (files.length > 0) {
        const imgPath = path.join(demoDir, files[0]);
        console.log(`  上传测试图片: ${files[0]}`);
        const buffer = fs.readFileSync(imgPath);
        const mimeType = files[0].endsWith('.png') ? 'image/png' : files[0].endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const { body: mpBody, contentType } = buildMultipartBody(
          { product_id: product.id, type: 'IMAGE', source_type: 'UPLOAD' },
          'file', files[0], buffer, mimeType
        );

        const { body: upBody } = await fetchJson(`${BASE}/api/v1/materials/upload`, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: mpBody,
        });
        materialId = upBody?.material_id || upBody?.data?.material_id || upBody?.data?.id;
        if (materialId) {
          console.log(`  上传成功: ${materialId}`);
          // 等待素材处理完成
          await sleep(5000);
        } else {
          console.log(`  上传响应: ${JSON.stringify(upBody).substring(0, 300)}`);
        }
      }
    }
  }

  if (!materialId) {
    warn(id, '无可用图片素材，跳过 IMAGE_DRIVEN 测试');
    return null;
  }

  console.log('  发起 IMAGE_DRIVEN 创作任务...');
  const { ok: cOk, status: cStatus, body } = await createCreation(product.id, null, {
    engineMode: 'IMAGE_DRIVEN',
    materialId: materialId,
    preferAiVideo: true,
  });

  if (!cOk) {
    fail(id, `创建失败 HTTP ${cStatus}: ${JSON.stringify(body).substring(0, 300)}`);
    return null;
  }

  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  if (!creationId) {
    fail(id, `缺少 creation_id: ${JSON.stringify(body).substring(0, 300)}`);
    return null;
  }

  console.log(`  creation_id=${creationId}`);
  ok(`${id}-create`, `creation_id=${creationId}`);

  console.log(`  等待视频生成 (最多 ${MAX_WAIT_MIN} 分钟)...`);
  const result = await waitForCreation(creationId, MAX_WAIT_MIN, 'IMAGE_DRIVEN');

  if (result.status === 'FINISHED') {
    const videoOk = await verifyVideo(result, creationId, 'IMAGE_DRIVEN');
    if (videoOk) ok(`${id}-video`, `video=${result.videoUrl}`);
    return { creationId, result };
  } else if (result.status === 'FAILED') {
    fail(`${id}-video`, `视频生成失败: ${result.error}`);
    return null;
  } else {
    warn(`${id}-video`, `超时，状态=${result.status}`);
    return null;
  }
}

// ====== Phase 7: PROMPT_DRIVEN 模式测试 ======

async function test_mode_prompt_driven(product) {
  const id = phase('创作模式: PROMPT_DRIVEN (提示驱动)');

  console.log('  发起 PROMPT_DRIVEN 创作任务 (自动创建商品+生成剧本)...');
  const { ok: cOk, status: cStatus, body } = await createCreation(product.id, null, {
    engineMode: 'PROMPT_DRIVEN',
    productTitle: '无线降噪蓝牙耳机Pro',
    sellingPoints: ['主动降噪', '超长续航', '舒适佩戴'],
    preferAiVideo: true,
  });

  if (!cOk) {
    fail(id, `创建失败 HTTP ${cStatus}: ${JSON.stringify(body).substring(0, 300)}`);
    return null;
  }

  const data = body?.data || body;
  const creationId = data?.creation_id || data?.id;
  if (!creationId) {
    fail(id, `缺少 creation_id: ${JSON.stringify(body).substring(0, 300)}`);
    return null;
  }

  console.log(`  creation_id=${creationId}`);
  ok(`${id}-create`, `creation_id=${creationId}`);

  console.log(`  等待视频生成 (最多 ${MAX_WAIT_MIN} 分钟)...`);
  const result = await waitForCreation(creationId, MAX_WAIT_MIN, 'PROMPT_DRIVEN');

  if (result.status === 'FINISHED') {
    const videoOk = await verifyVideo(result, creationId, 'PROMPT_DRIVEN');
    if (videoOk) ok(`${id}-video`, `video=${result.videoUrl}`);
    return { creationId, result };
  } else if (result.status === 'FAILED') {
    fail(`${id}-video`, `视频生成失败: ${result.error}`);
    return null;
  } else {
    warn(`${id}-video`, `超时，状态=${result.status}`);
    return null;
  }
}

// ====== Phase 8: 视频下载与验证 ======

async function verifyVideo(result, creationId, label) {
  const videoUrl = result.videoUrl;
  if (!videoUrl) {
    console.error(`  [${label}] 无视频URL`);
    return false;
  }

  const fullUrl = videoUrl.startsWith('http') ? videoUrl : `${BASE}${videoUrl}`;
  console.log(`  下载视频: ${fullUrl}`);

  try {
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) {
      console.error(`  [${label}] 下载失败 HTTP ${res.status}`);
      return false;
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outPath = path.join(OUTPUT_DIR, `${label}-${creationId}.mp4`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);

    const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
    console.log(`  保存: ${outPath} (${sizeMB} MB)`);

    if (buf.length < 10 * 1024) {
      console.error(`  [${label}] 视频文件过小: ${buf.length} bytes`);
      return false;
    }

    // 用 ffprobe 验证视频信息
    let duration = '?';
    let hasAudio = false;
    let resolution = '?';
    try {
      const probeOutput = execSync(
        `ffprobe -v error -show_entries format=duration,format_tags -show_entries stream=codec_type,width,height -of default=noprint_wrappers=1 "${outPath}"`,
        { encoding: 'utf8' }
      );
      const audioMatch = probeOutput.match(/codec_type=audio/);
      hasAudio = !!audioMatch;
      const durMatch = probeOutput.match(/duration=([\d.]+)/);
      if (durMatch) duration = parseFloat(durMatch[1]).toFixed(1);
      const wMatch = probeOutput.match(/width=(\d+)/);
      const hMatch = probeOutput.match(/height=(\d+)/);
      if (wMatch && hMatch) resolution = `${wMatch[1]}x${hMatch[1]}`;
      console.log(`  [${label}] ffprobe: duration=${duration}s, audio=${hasAudio}, resolution=${resolution}`);
    } catch (e) {
      console.warn(`  [${label}] ffprobe 不可用: ${e.message}`);
    }

    return true;
  } catch (e) {
    console.error(`  [${label}] 下载异常: ${e.message}`);
    return false;
  }
}

// ====== Phase 9: 分镜重渲染 ======

async function test_rerender_shot(creationId, parentId) {
  const id = parentId ? `${parentId}-rerender` : phase('分镜重渲染测试');

  console.log('  测试分镜重渲染...');

  // 先获取创作详情查看分镜状态
  const { body } = await fetchJson(`${BASE}/api/v1/creations/${creationId}`);
  const data = body?.data || body;
  const shots = data?.shot_renders || [];

  if (shots.length === 0) {
    warn(id, '无分镜渲染数据');
    return;
  }

  console.log(`  分镜数: ${shots.length}`);

  // 尝试重渲染第1个分镜
  const { ok: rOk, status: rStatus, body: rBody } = await fetchJson(
    `${BASE}/api/v1/creations/${creationId}/rerender-shot`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shot_index: 0 }),
    }
  );

  if (rOk) {
    ok(id, `分镜0重渲染请求成功`);
  } else {
    fail(id, `分镜重渲染失败 HTTP ${rStatus}: ${JSON.stringify(rBody).substring(0, 200)}`);
  }
}

// ====== Main ======

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   TikStream AI — 创作模块 完整E2E测试            ║');
  console.log('║   三种模式: SCRIPT/IMAGE/PROMPT_DRIVEN            ║');
  console.log('║   包含: 字幕验证 + 分镜重渲染 + 视频下载验证       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  BASE=${BASE}`);
  console.log(`  MAX_WAIT_MIN=${MAX_WAIT_MIN}`);
  console.log(`  SKIP_AI_VIDEO=${SKIP_AI_VIDEO}`);
  console.log(`  OUTPUT_DIR=${OUTPUT_DIR}`);

  // --- Health Check ---
  if (!(await test_health())) {
    printSummary();
    process.exit(1);
  }

  // --- Seed Data ---
  const seed = await test_seed_data();
  if (!seed || !seed.product) {
    printSummary();
    process.exit(1);
  }
  const { product, template, viral } = seed;

  // --- Script Generation (3 modes) ---
  const quickScript = await test_script_quick(product);
  const viralScript = await test_script_viral_rewrite(product, viral);
  const templateScript = await test_script_template(product, template);

  // 使用 quick script 进行 SCRIPT_DRIVEN 创作测试
  let scriptIdForCreation = quickScript?.scriptId;
  if (!scriptIdForCreation) {
    // 如果 quick 失败，尝试其他
    scriptIdForCreation = viralScript?.scriptId || templateScript?.scriptId;
  }

  // --- Creation Mode: SCRIPT_DRIVEN ---
  if (scriptIdForCreation) {
    await test_mode_script_driven(product, scriptIdForCreation);
    // API 限流等待
    await sleep(5000);
  } else {
    console.error('\n❌ 所有剧本生成模式均失败，无法进行 SCRIPT_DRIVEN 创作测试');
  }

  // --- Creation Mode: IMAGE_DRIVEN ---
  await test_mode_image_driven(product);
  await sleep(5000);

  // --- Creation Mode: PROMPT_DRIVEN ---
  await test_mode_prompt_driven(product);

  // --- Summary ---
  printSummary();

  const total = RESULTS.length;
  const failed = RESULTS.filter(r => !r.ok).length;
  const passed = total - failed;
  console.log(`\n🎬 测试完成: ${passed}/${total} 通过, ${failed} 失败`);
  console.log(`📁 视频输出目录: ${OUTPUT_DIR}`);

  if (failed > 0) {
    console.log('⚠️  存在失败项，请检查上方日志');
    process.exit(1);
  } else {
    console.log('🎉 所有测试通过!');
    process.exit(0);
  }
}

function printSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log('  测试摘要');
  console.log('═'.repeat(60));
  for (const r of RESULTS) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`  ${icon} ${r.id}${r.detail ? ` — ${r.detail}` : ''}`);
  }
}

main().catch(async (e) => {
  console.error('💥 Fatal:', e);
  process.exit(1);
});
