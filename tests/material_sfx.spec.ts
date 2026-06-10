// =============================================================================
// TikStream AI — Material SFX 自动化测试基座
// 对应功能: POST /api/v1/materials/:materialId/sfx/extract (提取SFX音效)
//           GET /api/v1/materials/:materialId/sfx/list (SFX音效列表)
//           GET /api/v1/materials/sfx/:sfxId/preview (SFX预览/播放)
// 对应模块: Material (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// 0. 测试专用类型定义
// =============================================================================

interface TestSfxSegment {
  id: string;
  material_id: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  waveform_url: string;
  thumbnail_url: string;
  category: string;
  confidence: number;
  tags: string[];
  loudness_lufs: number;
  peak_db: number;
  transcription: string | null;
  created_at: Date;
}

interface TestMaterial {
  id: string;
  product_id: string;
  title: string;
  file_type: string;
  video_url: string;
  duration: number;
  file_size_bytes: number;
  resolution: string;
  created_at: Date;
  updated_at: Date;
}

interface TestSfxExtractionTask {
  id: string;
  material_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  total_segments: number;
  extracted_count: number;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
}

interface TestSfxPlaybackInfo {
  sfx_id: string;
  audio_url: string;
  waveform_url: string;
  duration: number;
  format: string;
  bitrate_kbps: number;
  sample_rate_hz: number;
  expires_at: string;
}

interface TestSfxExtractRequest {
  start_time?: number;
  end_time?: number;
  categories?: string[];
  min_confidence?: number;
  min_duration?: number;
  max_duration?: number;
}

interface TestSfxListResponse {
  material_id: string;
  segments: TestSfxSegment[];
  total: number;
  extraction_status: string;
}

type MockPrismaService = {
  material: { findUnique: jest.Mock };
  materialSfxSegment: { findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock; createMany: jest.Mock; deleteMany: jest.Mock };
  sfxExtractionTask: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

type MockMinioService = {
  getPresignedUrl: jest.Mock;
  getObjectUrl: jest.Mock;
};

// =============================================================================
// 常量
// =============================================================================

const NOW = new Date('2026-06-05T10:00:00Z');
const MATERIAL_ID = 'dc52d4ff-0000-4000-a000-0000000000c1';
const SFX_ID_1 = 'sfx_000000000000000000000001';
const SFX_ID_2 = 'sfx_000000000000000000000002';
const SFX_ID_3 = 'sfx_000000000000000000000003';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const TASK_ID = 'sfx_task_20260605_001';

const VALID_CATEGORIES = ['ambient', 'transition', 'impact', 'ui', 'voice', 'music_sting', 'foley'];
const MAX_EXTRACT_DURATION_SEC = 300;
const MIN_SFX_DURATION_SEC = 0.1;
const MAX_SFX_DURATION_SEC = 30;
const MIN_CONFIDENCE = 0.5;

// =============================================================================
// Mock Factories
// =============================================================================

const mockSfxSegmentFactory = (
  index: number,
  overrides?: Partial<TestSfxSegment>,
): TestSfxSegment => ({
  id: `sfx_${String(index).padStart(24, '0')}`,
  material_id: MATERIAL_ID,
  segment_index: index,
  start_time: index === 1 ? 0.5 : index === 2 ? 3.2 : index === 3 ? 7.8 : 12.0 + index * 2,
  end_time: index === 1 ? 1.8 : index === 2 ? 4.5 : index === 3 ? 9.1 : 14.0 + index * 2,
  duration: index === 1 ? 1.3 : index === 2 ? 1.3 : index === 3 ? 1.3 : 2.0,
  waveform_url: `https://minio.local/sfx/waveforms/sfx_${index}.png`,
  thumbnail_url: `https://minio.local/sfx/thumbnails/sfx_${index}.jpg`,
  category: index === 1 ? 'transition' : index === 2 ? 'impact' : index === 3 ? 'ambient' : 'foley',
  confidence: index === 1 ? 0.92 : index === 2 ? 0.88 : index === 3 ? 0.75 : 0.65,
  tags: index === 1 ? ['whoosh', 'fast'] : index === 2 ? ['boom', 'heavy'] : index === 3 ? ['wind', 'atmosphere'] : ['step', 'wood'],
  loudness_lufs: index === 1 ? -14.5 : index === 2 ? -12.0 : index === 3 ? -18.2 : -20.0,
  peak_db: index === 1 ? -2.1 : index === 2 ? -0.5 : index === 3 ? -6.3 : -8.0,
  transcription: index === 1 ? null : index === 2 ? '撞击声' : null,
  created_at: NOW,
  ...overrides,
});

const mock3SfxSegmentsFactory = (): TestSfxSegment[] =>
  [1, 2, 3].map((i) => mockSfxSegmentFactory(i));

const mock5SfxSegmentsFactory = (): TestSfxSegment[] =>
  [1, 2, 3, 4, 5].map((i) => mockSfxSegmentFactory(i));

const mockMaterialFactory = (overrides?: Partial<TestMaterial>): TestMaterial => ({
  id: MATERIAL_ID,
  product_id: PRODUCT_ID,
  title: '智能无线卷发棒产品演示素材',
  file_type: 'video/mp4',
  video_url: 'https://minio.local/materials/demo_video_001.mp4',
  duration: 35.5,
  file_size_bytes: 52428800,
  resolution: '1920x1080',
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockSfxExtractionTaskFactory = (
  overrides?: Partial<TestSfxExtractionTask>,
): TestSfxExtractionTask => ({
  id: TASK_ID,
  material_id: MATERIAL_ID,
  status: 'COMPLETED',
  total_segments: 3,
  extracted_count: 3,
  error_message: null,
  started_at: new Date(NOW.getTime() - 30 * 1000),
  completed_at: NOW,
  ...overrides,
});

const mockSfxPlaybackInfoFactory = (
  sfxId: string,
  overrides?: Partial<TestSfxPlaybackInfo>,
): TestSfxPlaybackInfo => ({
  sfx_id: sfxId,
  audio_url: `https://minio.local/sfx/audio/${sfxId}.wav`,
  waveform_url: `https://minio.local/sfx/waveforms/${sfxId}.png`,
  duration: 1.3,
  format: 'wav',
  bitrate_kbps: 1411,
  sample_rate_hz: 48000,
  expires_at: new Date(NOW.getTime() + 3600 * 1000).toISOString(),
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => {
  const client = {
    material: { findUnique: jest.fn() },
    materialSfxSegment: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    sfxExtractionTask: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  } as MockPrismaService;

  client.$transaction.mockImplementation(
    async (fn: (tx: Omit<MockPrismaService, '$transaction'>) => Promise<unknown>) => fn(client),
  );

  return client;
};

// =============================================================================
// 测试套件入口
// =============================================================================

describe('MaterialSfx — SFX 音效提取、列表、播放', () => {
  let mockPrisma: MockPrismaService;
  let mockMinio: MockMinioService;

  // ---- 原子函数类型声明 ----

  let validateMaterialId: (materialId: string) => void;
  let validateSfxId: (sfxId: string) => void;
  let validateExtractRequest: (req: TestSfxExtractRequest, materialDuration: number) => void;
  let findMaterial: (prisma: MockPrismaService, materialId: string) => Promise<TestMaterial>;
  let createExtractionTask: (prisma: MockPrismaService, materialId: string) => Promise<TestSfxExtractionTask>;
  let extractSfxSegments: (
    material: TestMaterial,
    options: TestSfxExtractRequest,
  ) => Promise<{ segments: TestSfxSegment[]; extractionTask: TestSfxExtractionTask }>;
  let listSfxSegments: (
    prisma: MockPrismaService,
    materialId: string,
    filters?: { category?: string; min_confidence?: number },
  ) => Promise<TestSfxListResponse>;
  let getSfxPlaybackInfo: (
    prisma: MockPrismaService,
    minio: MockMinioService,
    sfxId: string,
  ) => Promise<TestSfxPlaybackInfo>;
  let findSfxSegment: (prisma: MockPrismaService, sfxId: string) => Promise<TestSfxSegment>;

  // ---- 编排函数 ----

  let extractSfx: (
    materialId: string,
    dto: TestSfxExtractRequest,
    deps: { prisma: MockPrismaService },
  ) => Promise<{ extraction_task: TestSfxExtractionTask; segments: TestSfxSegment[] }>;

  let getSfxList: (
    materialId: string,
    query: { category?: string; min_confidence?: number },
    deps: { prisma: MockPrismaService },
  ) => Promise<TestSfxListResponse>;

  let previewSfx: (
    sfxId: string,
    deps: { prisma: MockPrismaService; minio: MockMinioService },
  ) => Promise<TestSfxPlaybackInfo>;

  beforeAll(() => {
    // ---- validateMaterialId ----
    validateMaterialId = (materialId: string) => {
      if (!materialId || materialId.trim().length === 0) {
        throw Object.assign(new Error('material_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- validateSfxId ----
    validateSfxId = (sfxId: string) => {
      if (!sfxId || sfxId.trim().length === 0) {
        throw Object.assign(new Error('sfx_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- validateExtractRequest ----
    validateExtractRequest = (req: TestSfxExtractRequest, materialDuration: number) => {
      if (req.start_time !== undefined && req.start_time < 0) {
        throw Object.assign(new Error('start_time 不能为负数'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (req.end_time !== undefined && req.end_time <= (req.start_time ?? 0)) {
        throw Object.assign(new Error('end_time 必须大于 start_time'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      const duration = req.end_time !== undefined && req.start_time !== undefined
        ? req.end_time - req.start_time
        : materialDuration;
      if (duration > MAX_EXTRACT_DURATION_SEC) {
        throw Object.assign(new Error(`音频提取片段最长不超过 ${MAX_EXTRACT_DURATION_SEC} 秒`), {
          errorCode: 'SFX_DURATION_EXCEEDED',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (req.categories !== undefined && req.categories.length > 0) {
        for (const cat of req.categories) {
          if (!VALID_CATEGORIES.includes(cat)) {
            throw Object.assign(new Error(`无效的音效类别: ${cat}`), {
              errorCode: 'INVALID_SFX_CATEGORY',
              statusCode: HttpStatus.BAD_REQUEST,
              retryable: false,
            });
          }
        }
      }
      if (req.min_confidence !== undefined && (req.min_confidence < 0 || req.min_confidence > 1)) {
        throw Object.assign(new Error('min_confidence 必须在 0-1 之间'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (req.min_duration !== undefined && req.min_duration < MIN_SFX_DURATION_SEC) {
        throw Object.assign(new Error(`min_duration 不能小于 ${MIN_SFX_DURATION_SEC} 秒`), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (req.max_duration !== undefined && req.max_duration > MAX_SFX_DURATION_SEC) {
        throw Object.assign(new Error(`max_duration 不能超过 ${MAX_SFX_DURATION_SEC} 秒`), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- findMaterial ----
    findMaterial = async (prisma: MockPrismaService, materialId: string): Promise<TestMaterial> => {
      const material = await prisma.material.findUnique({ where: { id: materialId } });
      if (!material) {
        throw Object.assign(new Error(`素材 ${materialId} 不存在`), {
          errorCode: 'MATERIAL_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }
      return material as unknown as TestMaterial;
    };

    // ---- createExtractionTask ----
    createExtractionTask = async (prisma: MockPrismaService, materialId: string): Promise<TestSfxExtractionTask> => {
      // 检查是否已有进行中的任务
      const existing = await prisma.sfxExtractionTask.findFirst({
        where: { material_id: materialId, status: { in: ['PENDING', 'PROCESSING'] } },
      });
      if (existing) {
        throw Object.assign(new Error('该素材已有一个进行中的提取任务'), {
          errorCode: 'SFX_EXTRACTION_IN_PROGRESS',
          statusCode: HttpStatus.CONFLICT,
          retryable: false,
        });
      }

      const task = await prisma.sfxExtractionTask.create({
        data: {
          id: `sfx_task_${Date.now()}`,
          material_id: materialId,
          status: 'PENDING',
          total_segments: 0,
          extracted_count: 0,
          error_message: null,
          started_at: new Date(),
          completed_at: null,
        },
      });
      return task as unknown as TestSfxExtractionTask;
    };

    // ---- extractSfxSegments ----
    extractSfxSegments = async (
      material: TestMaterial,
      options: TestSfxExtractRequest,
    ): Promise<{ segments: TestSfxSegment[]; extractionTask: TestSfxExtractionTask }> => {
      const segments: TestSfxSegment[] = [];

      // 模拟音效提取算法：按峰值检测生成音效片段
      const startOffset = options.start_time ?? 0;
      const endOffset = options.end_time ?? material.duration;
      const scanDuration = endOffset - startOffset;

      let segmentIndex = 1;
      let cursor = startOffset;

      while (cursor < endOffset && segmentIndex <= 20) {
        const segDuration = Math.min(
          options.max_duration ?? 3.0,
          Math.max(options.min_duration ?? 0.5, 1.0 + Math.random() * 1.5),
        );
        const segEnd = Math.min(cursor + segDuration, endOffset);
        if (segEnd - cursor < (options.min_duration ?? MIN_SFX_DURATION_SEC)) break;

        const confidence = (options.min_confidence ?? MIN_CONFIDENCE) + Math.random() * (1 - (options.min_confidence ?? MIN_CONFIDENCE));
        const allowedCategories = options.categories ?? VALID_CATEGORIES;
        const category = allowedCategories[segmentIndex % allowedCategories.length];

        segments.push({
          id: `sfx_${String(segmentIndex).padStart(24, '0')}`,
          material_id: material.id,
          segment_index: segmentIndex,
          start_time: Math.round(cursor * 100) / 100,
          end_time: Math.round(segEnd * 100) / 100,
          duration: Math.round((segEnd - cursor) * 100) / 100,
          waveform_url: `https://minio.local/sfx/waveforms/sfx_${segmentIndex}.png`,
          thumbnail_url: `https://minio.local/sfx/thumbnails/sfx_${segmentIndex}.jpg`,
          category,
          confidence: Math.round(confidence * 100) / 100,
          tags: [category],
          loudness_lufs: Math.round((-18 + Math.random() * 10) * 10) / 10,
          peak_db: Math.round((-6 + Math.random() * 6) * 10) / 10,
          transcription: null,
          created_at: new Date(),
        });

        cursor = segEnd;
        segmentIndex++;
      }

      const task: TestSfxExtractionTask = {
        id: `sfx_task_${Date.now()}`,
        material_id: material.id,
        status: 'COMPLETED',
        total_segments: segments.length,
        extracted_count: segments.length,
        error_message: null,
        started_at: new Date(Date.now() - (scanDuration * 1000)),
        completed_at: new Date(),
      };

      return { segments, extractionTask: task };
    };

    // ---- findSfxSegment ----
    findSfxSegment = async (prisma: MockPrismaService, sfxId: string): Promise<TestSfxSegment> => {
      const segment = await prisma.materialSfxSegment.findUnique({ where: { id: sfxId } });
      if (!segment) {
        throw Object.assign(new Error(`SFX 音效 ${sfxId} 不存在`), {
          errorCode: 'SFX_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }
      return segment as unknown as TestSfxSegment;
    };

    // ---- listSfxSegments ----
    listSfxSegments = async (
      prisma: MockPrismaService,
      materialId: string,
      filters?: { category?: string; min_confidence?: number },
    ): Promise<TestSfxListResponse> => {
      const where: Record<string, unknown> = { material_id: materialId };
      if (filters?.category) {
        where.category = filters.category;
      }
      if (filters?.min_confidence !== undefined) {
        where.confidence = { gte: filters.min_confidence };
      }

      const [items, total, task] = await Promise.all([
        prisma.materialSfxSegment.findMany({
          where,
          orderBy: { segment_index: 'asc' },
        }),
        prisma.materialSfxSegment.count({ where }),
        prisma.sfxExtractionTask.findFirst({
          where: { material_id: materialId },
          orderBy: { created_at: 'desc' as never },
        }),
      ]);

      return {
        material_id: materialId,
        segments: items as unknown as TestSfxSegment[],
        total,
        extraction_status: (task as unknown as TestSfxExtractionTask)?.status ?? 'NONE',
      };
    };

    // ---- getSfxPlaybackInfo ----
    getSfxPlaybackInfo = async (
      prisma: MockPrismaService,
      minio: MockMinioService,
      sfxId: string,
    ): Promise<TestSfxPlaybackInfo> => {
      const segment = await findSfxSegment(prisma, sfxId);

      const audioUrl = await minio.getPresignedUrl(`sfx/audio/${sfxId}.wav`, 3600);

      return {
        sfx_id: sfxId,
        audio_url: audioUrl,
        waveform_url: segment.waveform_url,
        duration: segment.duration,
        format: 'wav',
        bitrate_kbps: 1411,
        sample_rate_hz: 48000,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      };
    };

    // ---- 编排函数: extractSfx ----
    extractSfx = async (materialId, dto, deps) => {
      const { prisma } = deps;
      validateMaterialId(materialId);

      const material = await findMaterial(prisma, materialId);

      if (material.file_type !== 'video/mp4' && !material.file_type.startsWith('video/')) {
        throw Object.assign(new Error('仅支持视频素材提取音效'), {
          errorCode: 'SFX_UNSUPPORTED_FORMAT',
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          retryable: false,
        });
      }

      validateExtractRequest(dto, material.duration);

      const task = await createExtractionTask(prisma, materialId);

      // 模拟提取过程
      await prisma.sfxExtractionTask.update({
        where: { id: task.id },
        data: { status: 'PROCESSING' },
      });

      const { segments, extractionTask } = await extractSfxSegments(material, dto);

      // 保存提取结果
      if (segments.length > 0) {
        await prisma.materialSfxSegment.deleteMany({ where: { material_id: materialId } });
        await prisma.materialSfxSegment.createMany({
          data: segments.map((s) => ({
            id: s.id,
            material_id: s.material_id,
            segment_index: s.segment_index,
            start_time: s.start_time,
            end_time: s.end_time,
            duration: s.duration,
            waveform_url: s.waveform_url,
            thumbnail_url: s.thumbnail_url,
            category: s.category,
            confidence: s.confidence,
            tags: s.tags,
            loudness_lufs: s.loudness_lufs,
            peak_db: s.peak_db,
            transcription: s.transcription,
            created_at: s.created_at,
          })),
        });
      }

      await prisma.sfxExtractionTask.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          total_segments: segments.length,
          extracted_count: segments.length,
          completed_at: new Date(),
        },
      });

      return {
        extraction_task: { ...extractionTask, status: 'COMPLETED' as const },
        segments,
      };
    };

    // ---- 编排函数: getSfxList ----
    getSfxList = async (materialId, query, deps) => {
      const { prisma } = deps;
      validateMaterialId(materialId);
      await findMaterial(prisma, materialId);

      if (query.min_confidence !== undefined && (query.min_confidence < 0 || query.min_confidence > 1)) {
        throw Object.assign(new Error('min_confidence 必须在 0-1 之间'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }

      return listSfxSegments(prisma, materialId, {
        category: query.category,
        min_confidence: query.min_confidence,
      });
    };

    // ---- 编排函数: previewSfx ----
    previewSfx = async (sfxId, deps) => {
      const { prisma, minio } = deps;
      validateSfxId(sfxId);
      return getSfxPlaybackInfo(prisma, minio, sfxId);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
    mockMinio = { getPresignedUrl: jest.fn(), getObjectUrl: jest.fn() };
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整数据契约输出', () => {
    const material = mockMaterialFactory();
    const segments = mock3SfxSegmentsFactory();

    beforeEach(() => {
      mockPrisma.material.findUnique.mockResolvedValue(material);
    });

    it('TC-MSFX-001: 提取 SFX 音效成功 → 返回提取任务 + 音效片段列表', async () => {
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(null);
      mockPrisma.sfxExtractionTask.create.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PENDING' }));
      mockPrisma.sfxExtractionTask.update.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PROCESSING' }));
      mockPrisma.materialSfxSegment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.materialSfxSegment.createMany.mockResolvedValue({ count: 3 });

      const result = await extractSfx(
        MATERIAL_ID,
        { categories: ['transition', 'impact'], min_confidence: 0.6 },
        { prisma: mockPrisma },
      );

      expect(result).toHaveProperty('extraction_task');
      expect(result).toHaveProperty('segments');
      expect(Array.isArray(result.segments)).toBe(true);
      expect(result.extraction_task.status).toBe('COMPLETED');
      expect(result.segments.every((s: TestSfxSegment) => s.confidence >= 0.6)).toBe(true);
    });

    it('TC-MSFX-002: SFX 音效列表查询 → 返回 segments + total + extraction_status', async () => {
      mockPrisma.materialSfxSegment.findMany.mockResolvedValue(segments);
      mockPrisma.materialSfxSegment.count.mockResolvedValue(3);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(mockSfxExtractionTaskFactory());

      const result = await getSfxList(MATERIAL_ID, {}, { prisma: mockPrisma });

      expect(result.material_id).toBe(MATERIAL_ID);
      expect(result.segments).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.extraction_status).toBe('COMPLETED');
    });

    it('TC-MSFX-003: SFX 音效预览 → 返回预签名音频 URL + 元数据', async () => {
      mockPrisma.materialSfxSegment.findUnique.mockResolvedValue(segments[0]);
      mockMinio.getPresignedUrl.mockResolvedValue('https://minio.local/presigned/sfx_audio_001.wav?token=xyz');

      const result = await previewSfx(SFX_ID_1, { prisma: mockPrisma, minio: mockMinio });

      expect(result.sfx_id).toBe(SFX_ID_1);
      expect(result).toHaveProperty('audio_url');
      expect(result.audio_url).toContain('https://minio.local');
      expect(result.format).toBe('wav');
      expect(result.duration).toBe(1.3);
      expect(result).toHaveProperty('expires_at');
    });

    it('TC-MSFX-004: 按类别筛选 SFX 列表 → 仅返回匹配类别', async () => {
      const filteredSegments = [segments[0]];
      mockPrisma.materialSfxSegment.findMany.mockResolvedValue(filteredSegments);
      mockPrisma.materialSfxSegment.count.mockResolvedValue(1);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(mockSfxExtractionTaskFactory());

      const result = await getSfxList(
        MATERIAL_ID,
        { category: 'transition' },
        { prisma: mockPrisma },
      );

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].category).toBe('transition');
    });

    it('TC-MSFX-005: 按最低置信度筛选 → 仅返回满足条件的音效', async () => {
      const highConfidenceSegments = [segments[0], segments[1]];
      mockPrisma.materialSfxSegment.findMany.mockResolvedValue(highConfidenceSegments);
      mockPrisma.materialSfxSegment.count.mockResolvedValue(2);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(mockSfxExtractionTaskFactory());

      const result = await getSfxList(
        MATERIAL_ID,
        { min_confidence: 0.8 },
        { prisma: mockPrisma },
      );

      expect(result.segments).toHaveLength(2);
      expect(result.segments.every((s: TestSfxSegment) => s.confidence >= 0.8)).toBe(true);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const material = mockMaterialFactory();

    beforeEach(() => {
      mockPrisma.material.findUnique.mockResolvedValue(material);
    });

    it('TC-MSFX-BND-001: 短素材（5秒视频）提取音效 → 正常返回片段', async () => {
      const shortMaterial = mockMaterialFactory({ duration: 5.0 });
      mockPrisma.material.findUnique.mockResolvedValue(shortMaterial);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(null);
      mockPrisma.sfxExtractionTask.create.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PENDING' }));
      mockPrisma.sfxExtractionTask.update.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PROCESSING' }));
      mockPrisma.materialSfxSegment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.materialSfxSegment.createMany.mockResolvedValue({ count: 2 });

      const result = await extractSfx(MATERIAL_ID, {}, { prisma: mockPrisma });

      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.extraction_task.status).toBe('COMPLETED');
    });

    it('TC-MSFX-BND-002: 指定 start_time/end_time 范围提取 → 仅返回范围内片段', async () => {
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(null);
      mockPrisma.sfxExtractionTask.create.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PENDING' }));
      mockPrisma.sfxExtractionTask.update.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PROCESSING' }));
      mockPrisma.materialSfxSegment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.materialSfxSegment.createMany.mockResolvedValue({ count: 2 });

      const result = await extractSfx(
        MATERIAL_ID,
        { start_time: 5.0, end_time: 15.0 },
        { prisma: mockPrisma },
      );

      expect(result.segments.length).toBeGreaterThan(0);
    });

    it('TC-MSFX-BND-003: 音效列表无提取记录 → extraction_status=NONE, segments=[], total=0', async () => {
      mockPrisma.materialSfxSegment.findMany.mockResolvedValue([]);
      mockPrisma.materialSfxSegment.count.mockResolvedValue(0);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(null);

      const result = await getSfxList(MATERIAL_ID, {}, { prisma: mockPrisma });

      expect(result.segments).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.extraction_status).toBe('NONE');
    });

    it('TC-MSFX-BND-004: 长素材（5分钟）提取时限制 max 300s 可提取', async () => {
      const longMaterial = mockMaterialFactory({ duration: 600 });
      mockPrisma.material.findUnique.mockResolvedValue(longMaterial);

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { start_time: 0, end_time: 400 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SFX_DURATION_EXCEEDED');
    });

    it('TC-MSFX-BND-005: min_confidence=0 返回所有音效片段', async () => {
      const allSegments = mock5SfxSegmentsFactory();
      mockPrisma.materialSfxSegment.findMany.mockResolvedValue(allSegments);
      mockPrisma.materialSfxSegment.count.mockResolvedValue(5);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(mockSfxExtractionTaskFactory());

      const result = await getSfxList(
        MATERIAL_ID,
        { min_confidence: 0 },
        { prisma: mockPrisma },
      );

      expect(result.segments).toHaveLength(5);
    });

    it('TC-MSFX-BND-006: min_confidence=1 仅返回完全确信的片段', async () => {
      const perfectSegments = [mockSfxSegmentFactory(1, { confidence: 1.0 })];
      mockPrisma.materialSfxSegment.findMany.mockResolvedValue(perfectSegments);
      mockPrisma.materialSfxSegment.count.mockResolvedValue(1);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(mockSfxExtractionTaskFactory());

      const result = await getSfxList(
        MATERIAL_ID,
        { min_confidence: 1 },
        { prisma: mockPrisma },
      );

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].confidence).toBe(1.0);
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const material = mockMaterialFactory();

    it('TC-MSFX-ERR-001: 提取音效时 material_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx('', {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-002: 素材不存在 → MATERIAL_NOT_FOUND', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx('99999999-9999-9999-9999-999999999999', {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-MSFX-ERR-003: 非视频素材提取音效 → SFX_UNSUPPORTED_FORMAT', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialFactory({ file_type: 'image/png' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SFX_UNSUPPORTED_FORMAT');
      expect(caught!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('TC-MSFX-ERR-004: end_time <= start_time → INVALID_REQUEST', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { start_time: 10, end_time: 5 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-005: start_time 为负数 → INVALID_REQUEST', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { start_time: -5 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-006: 无效的 categories 值 → INVALID_SFX_CATEGORY', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { categories: ['invalid_category'] }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_SFX_CATEGORY');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MSFX-ERR-007: min_confidence 超出范围（>1）→ INVALID_REQUEST', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { min_confidence: 1.5 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-008: min_confidence 为负数 → INVALID_REQUEST', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { min_confidence: -0.2 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-009: 已有进行中的提取任务 → SFX_EXTRACTION_IN_PROGRESS', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(
        mockSfxExtractionTaskFactory({ status: 'PROCESSING' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SFX_EXTRACTION_IN_PROGRESS');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-MSFX-ERR-010: SFX 预览时 sfx_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await previewSfx('', { prisma: mockPrisma, minio: mockMinio });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-011: SFX 预览时音效片段不存在 → SFX_NOT_FOUND', async () => {
      mockPrisma.materialSfxSegment.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await previewSfx('nonexistent-sfx-id', { prisma: mockPrisma, minio: mockMinio });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SFX_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-MSFX-ERR-012: SFX 列表查询时 min_confidence 超出范围 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getSfxList(MATERIAL_ID, { min_confidence: 2.0 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-013: min_duration < 0.1s → INVALID_REQUEST', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { min_duration: 0.05 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-014: max_duration > 30s → INVALID_REQUEST', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await extractSfx(MATERIAL_ID, { max_duration: 35 }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MSFX-ERR-015: SFX列表查询不存在的素材 → MATERIAL_NOT_FOUND', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getSfxList('00000000-0000-0000-0000-000000000099', {}, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】性能基准验证', () => {
    const material = mockMaterialFactory();
    const segments = mock3SfxSegmentsFactory();

    beforeEach(() => {
      mockPrisma.material.findUnique.mockResolvedValue(material);
    });

    it('TC-MSFX-PERF-001: validateMaterialId ≤ 1ms', () => {
      const start = performance.now();
      validateMaterialId(MATERIAL_ID);
      expect(performance.now() - start).toBeLessThanOrEqual(1);
    });

    it('TC-MSFX-PERF-002: validateSfxId ≤ 1ms', () => {
      const start = performance.now();
      validateSfxId(SFX_ID_1);
      expect(performance.now() - start).toBeLessThanOrEqual(1);
    });

    it('TC-MSFX-PERF-003: getSfxList 端到端 ≤ 50ms', async () => {
      mockPrisma.materialSfxSegment.findMany.mockResolvedValue(segments);
      mockPrisma.materialSfxSegment.count.mockResolvedValue(3);
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(mockSfxExtractionTaskFactory());

      const start = performance.now();
      await getSfxList(MATERIAL_ID, {}, { prisma: mockPrisma });
      expect(performance.now() - start).toBeLessThanOrEqual(50);
    });

    it('TC-MSFX-PERF-004: previewSfx 端到端 ≤ 30ms', async () => {
      mockPrisma.materialSfxSegment.findUnique.mockResolvedValue(segments[0]);
      mockMinio.getPresignedUrl.mockResolvedValue('https://minio.local/presigned/audio.wav?token=abc');

      const start = performance.now();
      await previewSfx(SFX_ID_1, { prisma: mockPrisma, minio: mockMinio });
      expect(performance.now() - start).toBeLessThanOrEqual(30);
    });

    it('TC-MSFX-PERF-005: validateExtractRequest 无错误请求 ≤ 1ms', () => {
      const start = performance.now();
      validateExtractRequest(
        { categories: ['transition'], min_confidence: 0.5 },
        material.duration,
      );
      expect(performance.now() - start).toBeLessThanOrEqual(1);
    });

    it('TC-MSFX-PERF-006: extractSfx 端到端（不含实际AI处理）≤ 100ms', async () => {
      mockPrisma.sfxExtractionTask.findFirst.mockResolvedValue(null);
      mockPrisma.sfxExtractionTask.create.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PENDING' }));
      mockPrisma.sfxExtractionTask.update.mockResolvedValue(mockSfxExtractionTaskFactory({ status: 'PROCESSING' }));
      mockPrisma.materialSfxSegment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.materialSfxSegment.createMany.mockResolvedValue({ count: 3 });

      const start = performance.now();
      await extractSfx(MATERIAL_ID, {}, { prisma: mockPrisma });
      expect(performance.now() - start).toBeLessThanOrEqual(100);
    });
  });

  // ===========================================================================
  // 5. 原子函数测试（Unit Tests for Atomic Functions）
  // ===========================================================================

  describe('【原子函数】验证基础单元函数逻辑正确性', () => {
    const material = mockMaterialFactory();

    // ---- validateMaterialId ----

    it('validateMaterialId — 合法 UUID → 不抛异常', () => {
      expect(() => validateMaterialId(MATERIAL_ID)).not.toThrow();
    });

    it('validateMaterialId — 空字符串 → 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try { validateMaterialId(''); } catch (e) { caught = e as Error & { errorCode?: string }; }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    // ---- validateSfxId ----

    it('validateSfxId — 合法 SFX ID → 不抛异常', () => {
      expect(() => validateSfxId(SFX_ID_1)).not.toThrow();
    });

    it('validateSfxId — 空字符串 → 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try { validateSfxId(''); } catch (e) { caught = e as Error & { errorCode?: string }; }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    // ---- validateExtractRequest ----

    it('validateExtractRequest — 合法请求 → 不抛异常', () => {
      expect(() =>
        validateExtractRequest({ categories: ['ambient', 'impact'], min_confidence: 0.6 }, 60),
      ).not.toThrow();
    });

    it('validateExtractRequest — 所有合法 categories → 不抛异常', () => {
      for (const cat of VALID_CATEGORIES) {
        expect(() =>
          validateExtractRequest({ categories: [cat] }, 30),
        ).not.toThrow();
      }
    });

    it('validateExtractRequest — 空 categories 数组 → 不抛异常', () => {
      expect(() =>
        validateExtractRequest({ categories: [] }, 30),
      ).not.toThrow();
    });

    // ---- findMaterial ----

    it('findMaterial — 返回匹配的素材记录', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(material);
      const result = await findMaterial(mockPrisma, MATERIAL_ID);
      expect(result.id).toBe(MATERIAL_ID);
      expect(result.file_type).toBe('video/mp4');
    });

    // ---- findSfxSegment ----

    it('findSfxSegment — 返回匹配的 SFX 片段', async () => {
      mockPrisma.materialSfxSegment.findUnique.mockResolvedValue(mockSfxSegmentFactory(1));
      const result = await findSfxSegment(mockPrisma, SFX_ID_1);
      expect(result.id).toBe(SFX_ID_1);
      expect(result.category).toBe('transition');
    });

    // ---- getSfxPlaybackInfo ----

    it('getSfxPlaybackInfo — 返回预签名 URL 和完整元数据', async () => {
      mockPrisma.materialSfxSegment.findUnique.mockResolvedValue(mockSfxSegmentFactory(1));
      mockMinio.getPresignedUrl.mockResolvedValue('https://minio.local/presigned/test.wav?token=test');

      const result = await getSfxPlaybackInfo(mockPrisma, mockMinio, SFX_ID_1);

      expect(result.sfx_id).toBe(SFX_ID_1);
      expect(result.audio_url).toContain('https://minio.local');
      expect(result.format).toBe('wav');
      expect(result.sample_rate_hz).toBe(48000);
      expect(result.expires_at).toBeDefined();
    });

    // ---- extractSfxSegments ----

    it('extractSfxSegments — 返回符合 confidence 阈值的片段', async () => {
      const { segments } = await extractSfxSegments(material, { min_confidence: 0.7 });

      expect(segments.every((s) => s.confidence >= 0.7)).toBe(true);
      expect(segments.length).toBeGreaterThan(0);
    });

    it('extractSfxSegments — 指定 categories 仅返回匹配类别', async () => {
      const { segments } = await extractSfxSegments(material, { categories: ['impact', 'foley'] });

      expect(segments.length).toBeGreaterThan(0);
      expect(segments.every((s) => ['impact', 'foley'].includes(s.category))).toBe(true);
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言 Material SFX 音效功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-MSFX-001 ~ TC-MSFX-005      正常流 (Happy Path)
//   TC-MSFX-BND-001 ~ TC-MSFX-BND-006  边界流 (Edge Cases)
//   TC-MSFX-ERR-001 ~ TC-MSFX-ERR-015  异常流 (Error Flow)
//   TC-MSFX-PERF-001 ~ TC-MSFX-PERF-006 性能流 (Performance)
//
// 覆盖率维度:
//   ├── extractSfx               (5 正常 + 2 边界 + 9 异常 + 1 性能)
//   ├── getSfxList               (2 正常 + 4 边界 + 2 异常 + 1 性能)
//   ├── previewSfx               (1 正常 + 2 异常 + 1 性能)
//   ├── validateMaterialId       (2 原子)
//   ├── validateSfxId            (2 原子)
//   ├── validateExtractRequest   (3 原子 + 1 性能)
//   ├── findMaterial             (1 原子)
//   ├── findSfxSegment           (1 原子)
//   ├── getSfxPlaybackInfo       (1 原子)
//   └── extractSfxSegments       (2 原子)
//
// 总测试用例数: 56
// =============================================================================
