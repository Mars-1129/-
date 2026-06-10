// =============================================================================
// TikStream AI — Mock Data Provider
// 当 ANALYTICS_MOCK_MODE=true 时，提供完整的模拟数据
//
// 命名约定说明
// ==============================
// 本文件包含两套命名体系，分别模拟不同的数据层:
//   1. API 层 (MockCreationEntry / MockProductEntry) — snake_case
//      匹配 @tikstream/shared-types (ApiRouteMap 请求/响应契约)
//   2. Prisma 层 (MockCreationRecord / MockScriptRecord / MockShotRecord) — camelCase
//      匹配 Prisma TypeScript 客户端自动生成的类型
//   analytics.service.ts 通过 `as unknown as` 桥接两个体系
// =============================================================================

import type { Creation, Product } from '@tikstream/shared-types';
import { createHash } from 'node:crypto';

/** 判断当前是否为 Mock 模式 */
export function isMockMode(): boolean {
  return process.env.ANALYTICS_MOCK_MODE === 'true';
}

// ===========================================================================
// 确定性哈希工具
// ===========================================================================

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(id.length, 8); i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

function u32ToFloat(u32: number): number {
  return (u32 & 0x7fffffff) / 0x7fffffff;
}

// ===========================================================================
// Mock Products — 与数据库 Product 表字段完全一致
// ===========================================================================

const MOCK_PRODUCTS: Product[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    title: '智能蓝牙耳机 Pro Max',
    sku_code: 'SKU-BT-001',
    category: '电子数码',
    selling_points: [
      '主动降噪深度达48dB',
      '续航长达40小时',
      '支持LDAC高清音频编码',
      'IPX5级防水防汗',
      '双设备无缝切换',
    ],
    target_audience: '18-35岁都市白领、学生群体、运动爱好者',
    scenario_tags: ['通勤', '运动', '办公', '游戏'],
    text_features: {
      tone: '科技感、专业',
      keywords: ['降噪', '续航', '音质', '蓝牙5.3'],
      style: '产品参数导向',
    },
    cover_image_url: undefined,
    rich_features: {},
    created_at: '2025-11-15T08:00:00.000Z',
    updated_at: '2026-05-20T10:30:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    title: '天然植萃护肤精华液',
    sku_code: 'SKU-SK-002',
    category: '美妆护肤',
    selling_points: [
      '含5%烟酰胺+玻尿酸双重精华',
      '28天焕亮肤色',
      '敏感肌可用零刺激配方',
      '日本医药部外品认证',
      '真空按压瓶设计锁鲜',
    ],
    target_audience: '22-45岁女性，关注护肤、成分党',
    scenario_tags: ['护肤', '美白', '抗老', '送礼'],
    text_features: {
      tone: '温和、专业、信赖感',
      keywords: ['烟酰胺', '玻尿酸', '敏感肌', '焕亮'],
      style: '成分科普+效果展示',
    },
    cover_image_url: undefined,
    rich_features: {},
    created_at: '2025-12-01T08:00:00.000Z',
    updated_at: '2026-05-18T14:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    title: '便携式折叠露营椅',
    sku_code: 'SKU-OC-003',
    category: '户外运动',
    selling_points: [
      '仅重1.2kg，一秒速开',
      '承重150kg，7075铝合金骨架',
      '透气网布+人体工学设计',
      '附赠收纳袋占地仅40cm',
      '三年质保终身售后',
    ],
    target_audience: '25-50岁户外爱好者、露营新手、家庭出游',
    scenario_tags: ['露营', '钓鱼', '野餐', '音乐节'],
    text_features: {
      tone: '轻松、活力、生活化',
      keywords: ['轻量', '折叠', '承重', '户外'],
      style: '场景展示+痛点解决',
    },
    cover_image_url: undefined,
    rich_features: {},
    created_at: '2026-01-10T08:00:00.000Z',
    updated_at: '2026-05-22T09:00:00.000Z',
  },
];

// ===========================================================================
// Mock Creations — 与数据库 Creation 表字段完全一致
// 每个 Product 下面有 3 个不同状态的 Creation
// ===========================================================================

interface MockCreationEntry {
  creation_id: string;
  product_id: string;
  script_id: string;
  task_id: string;
  engine_mode: 'SCRIPT_DRIVEN';
  target_resolution: string;
  export_format: string;
  status: 'FINISHED' | 'PROCESSING' | 'FAILED';
  progress: number;
  current_stage: string;
  video_url: string | null;
  file_size_bytes: number | null;
  trace_id: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  shot_renders: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

function generateMockUUID(seed: string, index: number): string {
  // 基于 seed + index 确定性生成类 UUID v4（便于测试复现）
  const hex = createHash('sha256').update(`${seed}_${index}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function generateMockCreations(productId: string): MockCreationEntry[] {
  const creationIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    // 基于 productId + index 确定性生成合法 UUID（替代 padStart 补零）
    creationIds.push(generateMockUUID(productId, i));
  }

  const baseDate = new Date('2026-05-01T00:00:00.000Z');

  return [
    {
      creation_id: creationIds[0],
      product_id: productId,
      script_id: creationIds[0].replace(/.{12}$/, 'script-001'),
      task_id: `tsk_20260520_${creationIds[0].slice(0, 8)}`,
      engine_mode: 'SCRIPT_DRIVEN',
      target_resolution: '1080x1920',
      export_format: 'MP4',
      status: 'FINISHED',
      progress: 100,
      current_stage: 'FINISHED',
      video_url: 'https://assets.tikstream.ai/demo/output_v1.mp4',
      file_size_bytes: 15420000,
      trace_id: `trc_${creationIds[0].slice(0, 8)}_a1`,
      error_code: null,
      error_message: null,
      started_at: new Date(baseDate.getTime() + 3600000).toISOString(),
      finished_at: new Date(baseDate.getTime() + 7200000).toISOString(),
      shot_renders: [],
      created_at: baseDate.toISOString(),
      updated_at: new Date(baseDate.getTime() + 7200000).toISOString(),
    },
    {
      creation_id: creationIds[1],
      product_id: productId,
      script_id: creationIds[1].replace(/.{12}$/, 'script-002'),
      task_id: `tsk_20260521_${creationIds[1].slice(0, 8)}`,
      engine_mode: 'SCRIPT_DRIVEN',
      target_resolution: '1080x1920',
      export_format: 'MP4',
      status: 'PROCESSING',
      progress: 65,
      current_stage: 'TTS_GENERATING',
      video_url: null,
      file_size_bytes: null,
      trace_id: `trc_${creationIds[1].slice(0, 8)}_b2`,
      error_code: null,
      error_message: null,
      started_at: new Date(baseDate.getTime() + 86400000 + 3600000).toISOString(),
      finished_at: null,
      shot_renders: [],
      created_at: new Date(baseDate.getTime() + 86400000).toISOString(),
      updated_at: new Date(baseDate.getTime() + 86400000 + 7200000).toISOString(),
    },
    {
      creation_id: creationIds[2],
      product_id: productId,
      script_id: creationIds[2].replace(/.{12}$/, 'script-003'),
      task_id: `tsk_20260522_${creationIds[2].slice(0, 8)}`,
      engine_mode: 'SCRIPT_DRIVEN',
      target_resolution: '1080x1920',
      export_format: 'MP4',
      status: 'FINISHED',
      progress: 100,
      current_stage: 'FINISHED',
      video_url: 'https://assets.tikstream.ai/demo/output_v3.mp4',
      file_size_bytes: 18850000,
      trace_id: `trc_${creationIds[2].slice(0, 8)}_c3`,
      error_code: null,
      error_message: null,
      started_at: new Date(baseDate.getTime() + 172800000 + 3600000).toISOString(),
      finished_at: new Date(baseDate.getTime() + 172800000 + 7200000).toISOString(),
      shot_renders: [],
      created_at: new Date(baseDate.getTime() + 172800000).toISOString(),
      updated_at: new Date(baseDate.getTime() + 172800000 + 7200000).toISOString(),
    },
  ];
}

// ===========================================================================
// Mock 数据库记录 — 用于 Analytics 内部验证 (完整的 Creation + Script + Shots)
// ===========================================================================

export interface MockShotRecord {
  id: string;
  scriptId: string;
  shotId: string | null;
  shotIndex: number;
  duration: number;
  sceneDescriptionQuery: string;
  visualDescription: string;
  cameraMovement: string;
  transitionType: string;
  voiceoverText: string;
  subtitleText: string;
  safeZoneBoundingBox: unknown;
  selectedSliceId: string | null;
  renderPrompt: string | null;
  localFactorPatch: unknown;
  complianceStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockScriptRecord {
  id: string;
  productId: string;
  title: string | null;
  language: string;
  targetAudience: string | null;
  videoDuration: number;
  aspectRatio: string;
  styleVibe: string;
  generationMode: string;
  templateId: string | null;
  viralVideoId: string | null;
  constraintList: unknown;
  rawJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  shots: MockShotRecord[];
}

export interface MockCreationRecord {
  id: string;
  productId: string;
  scriptId: string;
  taskId: string;
  engineMode: string;
  targetResolution: string;
  exportFormat: string;
  status: string;
  progress: number;
  currentStage: string;
  videoUrl: string | null;
  fileSizeBytes: bigint | null;
  traceId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  script: MockScriptRecord | null;
}

const SHOT_CONFIGS = [
  { duration: 3.0, camera: 'Zoom In', transition: 'Cut', subtitle: '你还在为这些问题烦恼吗？' },
  { duration: 2.5, camera: 'Static', transition: 'Dissolve', subtitle: '传统耳机降噪差、续航短' },
  { duration: 3.5, camera: 'Pan Right', transition: 'Cut', subtitle: '全新降噪技术，48dB深度降噪' },
  { duration: 4.0, camera: 'Zoom Out', transition: 'Wipe', subtitle: '40小时超长续航，随时随地享受音乐' },
  { duration: 3.0, camera: 'Tilt Up', transition: 'Cut', subtitle: 'LDAC高清音质，听见每一个细节' },
  { duration: 2.5, camera: 'Static', transition: 'Dissolve', subtitle: '现在下单立享首发优惠' },
];

function generateMockShots(scriptId: string, seed: number): MockShotRecord[] {
  let s = seed;
  const baseDate = new Date('2026-05-20T10:00:00.000Z');
  const shots: MockShotRecord[] = [];

  for (let i = 0; i < SHOT_CONFIGS.length; i++) {
    const cfg = SHOT_CONFIGS[i];
    const shotIndex = i + 1;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const durNoise = (u32ToFloat(s) - 0.5) * 0.4;
    const duration = Math.round((cfg.duration + durNoise) * 100) / 100;

    const shotId = `${scriptId}-shot-${String(shotIndex).padStart(3, '0')}`;

    shots.push({
      id: shotId,
      scriptId,
      shotId: `asset_slice_${shotId.slice(0, 8)}_${shotIndex}`,
      shotIndex,
      duration,
      sceneDescriptionQuery: `分镜${shotIndex}场景描述查询`,
      visualDescription: cfg.subtitle,
      cameraMovement: cfg.camera,
      transitionType: cfg.transition,
      voiceoverText: `这是第${shotIndex}个镜头的旁白配音文本内容，用于TTS语音合成`,
      subtitleText: cfg.subtitle,
      safeZoneBoundingBox: { x: 0, y: 0, w: 1080, h: 1920 },
      selectedSliceId: null,
      renderPrompt: `生成分镜${shotIndex}的视频渲染prompt`,
      localFactorPatch: null,
      complianceStatus: 'COMPLIANT',
      createdAt: new Date(baseDate.getTime() + i * 60000),
      updatedAt: new Date(baseDate.getTime() + i * 60000),
    });
  }

  return shots;
}

function generateMockCreationRecord(creationId: string, productId: string, index: number): MockCreationRecord {
  const seed = hashId(creationId);
  const baseDate = new Date('2026-05-20T10:00:00.000Z');
  const scriptId = `${creationId.slice(0, 8)}-script-${String(index + 1).padStart(3, '0')}`;

  const generationModes = ['PROMPT_DRIVEN', 'VIRAL_REWRITE', 'TEMPLATE_DRIVEN'];
  const styleVibes = ['科技冷峻', '温暖生活', '潮流炫酷', '简约商务', '自然清新'];
  const titles = ['问题前置+痛点导向版', '悬念递进+场景展示版', '对比反差+视觉冲击版'];

  const shots = generateMockShots(scriptId, seed);
  const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);

  const script: MockScriptRecord = {
    id: scriptId,
    productId,
    title: titles[index % titles.length],
    language: 'zh-CN',
    targetAudience: '18-35岁年轻消费者',
    videoDuration: totalDuration,
    aspectRatio: '9:16',
    styleVibe: styleVibes[index % styleVibes.length],
    generationMode: generationModes[index % generationModes.length],
    templateId: null,
    viralVideoId: null,
    constraintList: { max_shots: 8, min_duration: 2, max_duration: 5 },
    rawJson: { version: '1.0', source: 'mock' },
    createdAt: baseDate,
    updatedAt: baseDate,
    shots,
  };

  const statuses = ['FINISHED', 'PROCESSING', 'FINISHED'];
  const stages = ['FINISHED', 'TTS_GENERATING', 'FINISHED'];
  const progresses = [100, 65, 100];

  return {
    id: creationId,
    productId,
    scriptId,
    taskId: `tsk_mock_${creationId.slice(0, 8)}`,
    engineMode: 'SCRIPT_DRIVEN',
    targetResolution: '1080x1920',
    exportFormat: 'MP4',
    status: statuses[index % statuses.length],
    progress: progresses[index % progresses.length],
    currentStage: stages[index % stages.length],
    videoUrl: index % 2 === 0 ? 'https://assets.tikstream.ai/demo/output.mp4' : null,
    fileSizeBytes: index % 2 === 0 ? BigInt(15000000 + index * 3000000) : null,
    traceId: `trc_mock_${creationId.slice(0, 8)}`,
    errorCode: null,
    errorMessage: null,
    startedAt: new Date(baseDate.getTime() + 3600000),
    finishedAt: index % 2 === 0 ? new Date(baseDate.getTime() + 7200000) : null,
    createdAt: baseDate,
    updatedAt: new Date(baseDate.getTime() + 7200000),
    script,
  };
}

// ===========================================================================
// 公开 API
// ===========================================================================

let _cachedProducts: Product[] | null = null;
const _creationCache = new Map<string, MockCreationEntry[]>();
const _creationRecordCache = new Map<string, MockCreationRecord>();

/**
 * 为任意 creationId 生成兜底 Mock Creation Record
 * 当 getMockCreationRecord 通过精确 ID 查找失败时调用
 * （例如前端从真实 DB 获取的创作任务 UUID 与 SHA256 确定性 ID 不匹配）
 */
export function generateFallbackMockCreationRecord(creationId: string, productId: string): MockCreationRecord {
  // 使用 creationId 的 hash 作为种子，保证同一 ID 返回一致数据
  const seed = hashId(creationId);
  const index = seed % 3;
  return generateMockCreationRecord(creationId, productId, index);
}

/** 获取所有 Mock Products */
export function getMockProducts(): Product[] {
  if (!_cachedProducts) {
    _cachedProducts = [...MOCK_PRODUCTS];
  }
  return _cachedProducts;
}

/** 根据 productId 查找 Mock Product */
export function findMockProductById(productId: string): Product | null {
  return getMockProducts().find((p) => p.id === productId) ?? null;
}

/** 获取某个 Product 下的 Mock Creations 列表（用于 CreationList API） */
export function getMockCreations(productId: string): MockCreationEntry[] {
  if (!_creationCache.has(productId)) {
    _creationCache.set(productId, generateMockCreations(productId));
  }
  return _creationCache.get(productId)!;
}

/**
 * 获取完整的 Mock Creation Record（含 Script + Shots）
 * 用于 Analytics 模块内部验证
 *
 * 智能回退: 如果传入的 creationId 实际是一个已知的 productId
 * （例如前端传入 '00000000-0000-0000-0000-000000000001' 作为默认 ID），
 * 则自动返回该产品的第一个 Mock Creation。
 */
export function getMockCreationRecord(creationId: string, productId: string): MockCreationRecord | null {
  const cacheKey = `${productId}:${creationId}`;
  if (_creationRecordCache.has(cacheKey)) {
    return _creationRecordCache.get(cacheKey)!;
  }

  const creations = getMockCreations(productId);
  let idx = creations.findIndex((c) => c.creation_id === creationId);

  // 智能回退: 如果 creationId 实际上是已知的 productId，使用第一个 creation
  if (idx < 0) {
    const knownProductIds = getMockProducts().map((p) => p.id);
    if (knownProductIds.includes(creationId)) {
      idx = 0;
    }
  }

  if (idx < 0) {
    return null;
  }
  _creationRecordCache.set(cacheKey, generateMockCreationRecord(creationId, productId, idx));
  return _creationRecordCache.get(cacheKey)!;
}

/** 获取所有 Creation IDs（用于前端初始化默认值） */
export function getMockCreationIds(productId: string): string[] {
  return getMockCreations(productId).map((c) => c.creation_id);
}
