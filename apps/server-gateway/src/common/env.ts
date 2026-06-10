/**
 * 环境变量读取工具 — 统一命名规范与向后兼容
 *
 * 新规范前缀体系：
 *   ARK_*     — 火山方舟 Ark Platform
 *   REDIS_*   — Redis
 *   MINIO_*   — MinIO 对象存储
 *   QDRANT_*  — Qdrant 向量数据库
 *   DB_*      — DuckDB / 分析数据库
 *   ANALYTICS_* — 分析模块
 */

const DEPRECATION_WARNED = new Set<string>();

function emitDeprecation(oldName: string, newName: string): void {
  const key = `${oldName}→${newName}`;
  if (!DEPRECATION_WARNED.has(key)) {
    DEPRECATION_WARNED.add(key);
    console.warn(`[ENV] ⚠️  ${oldName} 已废弃，请改用 ${newName}`);
  }
}

/**
 * 读取环境变量，支持旧名 fallback
 * @param name 新变量名
 * @param legacyName 已废弃的旧变量名（可选）
 * @param defaultValue 默认值（可选）
 */
export function env(name: string, legacyName?: string, defaultValue?: string): string {
  if (process.env[name]) {
    return process.env[name]!;
  }
  if (legacyName && process.env[legacyName]) {
    emitDeprecation(legacyName, name);
    return process.env[legacyName]!;
  }
  return defaultValue ?? '';
}

/**
 * Ark API Key（原 VOLC_ARK_API_KEY / DOUBAO_API_KEY）
 */
export function arkApiKey(): string {
  return env('ARK_API_KEY', 'VOLC_ARK_API_KEY')
    || env('ARK_API_KEY', 'DOUBAO_API_KEY');
}

/**
 * Ark Base URL（原 VOLC_ARK_API_URL / DOUBAO_API_URL）
 */
export function arkBaseUrl(): string {
  return env('ARK_BASE_URL', 'VOLC_ARK_API_URL', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions')
    || env('ARK_BASE_URL', 'DOUBAO_API_URL', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
}

/**
 * Ark Seedance Base URL（原 VOLC_ARK_SEEDANCE_API_URL）
 */
export function arkSeedanceBaseUrl(): string {
  return env('ARK_SEEDANCE_BASE_URL', 'VOLC_ARK_SEEDANCE_API_URL', 'https://ark.cn-beijing.volces.com/api/v3');
}

/**
 * Ark 视频 API Key（原 VOLC_ARK_VIDEO_API_KEY）
 */
export function arkVideoApiKey(): string {
  return env('ARK_VIDEO_API_KEY', 'VOLC_ARK_VIDEO_API_KEY')
    || arkApiKey(); // fallback to main API key
}

/**
 * Ark TTS API Key（原 VOLC_TTS_API_KEY / TTS_API_KEY）
 */
export function arkTtsApiKey(): string {
  return env('ARK_TTS_API_KEY', 'VOLC_TTS_API_KEY')
    || env('ARK_TTS_API_KEY', 'TTS_API_KEY');
}

/**
 * Ark TTS API URL（原 VOLC_TTS_API_URL）
 */
export function arkTtsApiUrl(): string {
  return env('ARK_TTS_API_URL', 'VOLC_TTS_API_URL', 'https://openspeech.bytedance.com/api/v1/tts');
}

/**
 * Ark TTS App ID（原 VOLC_TTS_APP_ID）
 */
export function arkTtsAppId(): string {
  return env('ARK_TTS_APP_ID', 'VOLC_TTS_APP_ID');
}

/**
 * SiliconFlow (硅基流动) API Key
 */
export function siliconflowApiKey(): string {
  return env('SILICONFLOW_API_KEY');
}
