import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 兼容性 AbortSignal.timeout polyfill（Node.js < 18 不支持静态方法） */
function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  return controller.signal;
}

const minioEndpoint = process.env.MINIO_ENDPOINT || 'minio';
const minioPort = process.env.MINIO_PORT || '9000';
const minioPublicEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000').replace(/\/$/, '');
const gatewayBaseUrl = (process.env.GATEWAY_BASE_URL || 'http://server-gateway:3000').replace(/\/$/, '');
const mediaCacheDir = process.env.REMOTION_MEDIA_CACHE_DIR || '/tmp/tikstream-media-cache';
const ffprobePath = process.env.FFPROBE_BINARY || 'ffprobe';
const ffmpegPath = process.env.FFMPEG_BINARY || 'ffmpeg';

function isLocalFilesystemPath(value: string): boolean {
  if (value.startsWith('./') || /^[a-zA-Z]:[\\/]/.test(value)) {
    return true;
  }

  // Web/API paths are not local files
  if (
    value.startsWith('/api/')
    || value.startsWith('/artifacts/')
    || value.startsWith('/internal/')
  ) {
    return false;
  }

  // Typical container temp/output paths
  if (value.startsWith('/tmp/') || value.startsWith('/workspace/') || value.startsWith('/var/')) {
    return true;
  }

  return false;
}

function rewriteLoopbackGatewayUrl(url: string): string {
  return url
    .replace(/http:\/\/localhost:3000/gi, gatewayBaseUrl)
    .replace(/https:\/\/localhost:3000/gi, gatewayBaseUrl)
    .replace(/http:\/\/127\.0\.0\.1:3000/gi, gatewayBaseUrl)
    .replace(/https:\/\/127\.0\.0\.1:3000/gi, gatewayBaseUrl);
}

export function resolveFetchUrl(url: string): string {
  if (url.startsWith('data:')) {
    return url;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return rewriteLoopbackGatewayUrl(url);
  }

  if (url.startsWith('/')) {
    return `${gatewayBaseUrl}${url}`;
  }

  return url;
}

export function toInternalStorageUrl(url: string): string {
  if (isLocalFilesystemPath(url)) {
    return url;
  }

  const resolved = resolveFetchUrl(url);

  return resolved
    .replace(`${minioPublicEndpoint}/`, `http://${minioEndpoint}:${minioPort}/`)
    .replace('http://localhost:9000/', `http://${minioEndpoint}:${minioPort}/`)
    .replace('https://localhost:9000/', `http://${minioEndpoint}:${minioPort}/`)
    .replace('http://minio:9000/', `http://${minioEndpoint}:${minioPort}/`)
    .replace('https://minio:9000/', `http://${minioEndpoint}:${minioPort}/`);
}

function detectMimeTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) {
    return 'image/png';
  }
  if (lower.includes('.webp')) {
    return 'image/webp';
  }
  if (lower.includes('.gif')) {
    return 'image/gif';
  }
  return 'image/jpeg';
}

export async function resolveMediaToLocalPath(sourceUrl: string, extension: string): Promise<string> {
  if (isLocalFilesystemPath(sourceUrl)) {
    return sourceUrl;
  }

  await mkdir(mediaCacheDir, { recursive: true });
  const filePath = join(mediaCacheDir, `${randomUUID().substring(0, 8)}.${extension}`);
  const internalUrl = toInternalStorageUrl(resolveFetchUrl(sourceUrl));

  const response = await fetch(internalUrl, { signal: createTimeoutSignal(120000) });
  if (!response.ok) {
    throw new Error(`Failed to download media (${response.status}): ${internalUrl}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
  return filePath;
}

export async function resolveImageForSeedance(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  let buffer: Buffer;
  let mimeType: string;

  if (isLocalFilesystemPath(imageUrl)) {
    buffer = await readFile(imageUrl);
    mimeType = detectMimeTypeFromUrl(imageUrl);
  } else {
    const fetchUrl = resolveFetchUrl(imageUrl);
    const internalUrl = toInternalStorageUrl(fetchUrl);
    const response = await fetch(internalUrl, { signal: createTimeoutSignal(120000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch image for Seedance (${response.status}): ${internalUrl}`);
    }
    const contentType = response.headers.get('content-type') || detectMimeTypeFromUrl(imageUrl);
    mimeType = contentType.split(';')[0];
    buffer = Buffer.from(await response.arrayBuffer());
  }

  // Check image dimensions; Seedance I2V requires min 300px width
  const SEEDANCE_MIN_WIDTH = 300;
  const tmpFile = join(mediaCacheDir, `seedance_input_${randomUUID().substring(0, 8)}.${mimeType.replace('image/', '') || 'jpg'}`);
  await mkdir(mediaCacheDir, { recursive: true });
  const tmpResized = join(mediaCacheDir, `seedance_resized_${randomUUID().substring(0, 8)}.jpg`);

  try {
    await writeFile(tmpFile, buffer);

    // Probes image dimensions via ffprobe
    try {
      const { stdout } = await execFileAsync(ffprobePath, [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0', tmpFile,
      ], { timeout: 10000 });
      const dims = stdout.trim().split(',');
      const width = parseInt(dims[0], 10);
      const height = parseInt(dims[1], 10);

      if (!isNaN(width) && !isNaN(height) && width < SEEDANCE_MIN_WIDTH) {
        console.log(
          `[MediaResolver] Image ${width}x${height} below Seedance minimum ${SEEDANCE_MIN_WIDTH}px, resizing to 720p...`,
        );
        await execFileAsync(ffmpegPath, [
          '-y', '-i', tmpFile,
          '-vf', `scale=720:1280:force_original_aspect_ratio=decrease`,
          tmpResized,
        ], { timeout: 30000 });
        buffer = await readFile(tmpResized);
        mimeType = 'image/jpeg';
      }
    } catch (probeErr) {
      // ffprobe failed — skip resize, use original image (Seedance may reject it)
      console.warn(`[MediaResolver] ffprobe dimension check failed, using original image:`, probeErr);
    }

    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } finally {
    // Cleanup temp files
    try { await execFileAsync('rm', ['-f', tmpFile, tmpResized], { timeout: 5000 }); } catch { /* ignore */ }
  }
}

const VIDEO_EXTENSIONS = new Set([
  'webm', 'mp4', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'ts', 'm2ts', 'ogv', 'm4v',
]);

function extractVideoExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const dotIndex = pathname.lastIndexOf('.');
    if (dotIndex === -1) return 'mp4';
    const ext = pathname.slice(dotIndex + 1).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext) ? ext : 'mp4';
  } catch {
    const clean = url.split('?')[0].split('#')[0];
    const dotIndex = clean.lastIndexOf('.');
    if (dotIndex === -1) return 'mp4';
    const ext = clean.slice(dotIndex + 1).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext) ? ext : 'mp4';
  }
}

export async function resolveVideoToLocalPath(videoUrl: string): Promise<string> {
  // Handle builtin:// protocol — generate a local fallback test pattern video
  if (videoUrl.startsWith('builtin://')) {
    return generateFallbackVideoLocal('640x360');
  }

  if (isLocalFilesystemPath(videoUrl)) {
    return videoUrl;
  }

  if (videoUrl.startsWith('data:')) {
    throw new Error('Data URL videos are not supported for stitching');
  }

  const extension = extractVideoExtension(videoUrl);
  return resolveMediaToLocalPath(videoUrl, extension);
}

/** Generate a local fallback test-pattern video for builtin:// paths */
export async function generateFallbackVideoLocal(resolution: string): Promise<string> {
  await mkdir(mediaCacheDir, { recursive: true });
  const [width, height] = resolution.split('x').map(Number);
  const filePath = join(mediaCacheDir, `fallback_${randomUUID().substring(0, 8)}.mp4`);
  await execFileAsync('ffmpeg', [
    '-y', '-f', 'lavfi',
    '-i', `testsrc2=size=${width || 640}x${height || 360}:rate=30:duration=3`,
    '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
    filePath,
  ], { timeout: 30000 });
  return filePath;
}

/** Trim a local video file to target duration (seconds) for stitch alignment. */
export async function trimVideoToDuration(inputPath: string, targetSeconds: number): Promise<string> {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
    console.warn(
      `[trimVideoToDuration] Invalid targetSeconds=${targetSeconds} for input=${inputPath}, ` +
      `skipping trim — this may cause incorrect final video duration. ` +
      `Expected valid positive number. Returning original video without trimming.`,
    );
    return inputPath;
  }

  await mkdir(mediaCacheDir, { recursive: true });
  const outputPath = join(mediaCacheDir, `trim_${randomUUID().substring(0, 8)}.mp4`);

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', inputPath,
      '-t', String(targetSeconds),
      '-an',
      '-c:v', 'libx264',
      '-crf', '23',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ],
    { timeout: 120000 },
  );

  return outputPath;
}
