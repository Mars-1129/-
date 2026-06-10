// =============================================================================
// TikStream AI — Creation Detail 自动化测试基座
// 对应功能: GET /api/v1/creations/:creation_id (创作任务详情查询)
// 对应模块: Creation (人员A) | 测试类型: 单元测试 (Service 层 + Repository 层)
// 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// ============================================================
// 0. 测试专用类型定义
// ============================================================

type CreationStatus = 'PENDING' | 'PROCESSING' | 'FINISHED' | 'FAILED' | 'CANCELED';
type CreationStage =
  | 'QUEUE_ALLOCATION'
  | 'ASSET_MATCHING'
  | 'AI_VIDEO_GENERATING'
  | 'TTS_GENERATING'
  | 'FFMPEG_STITCHING'
  | 'LOUDNORM_COMPLIANCE'
  | 'FINISHED'
  | 'FAILED';
type EngineMode = 'SCRIPT_DRIVEN';
type ShotRenderStatus = 'PENDING' | 'PROCESSING' | 'FINISHED' | 'FAILED';

interface TestCreationRecord {
  id: string;
  product_id: string;
  script_id: string;
  task_id: string;
  engine_mode: string;
  target_resolution: string;
  export_format: string;
  status: CreationStatus;
  progress: number;
  current_stage: CreationStage;
  video_url: string | null;
  file_size_bytes: bigint | null;
  trace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
  shot_renders: TestShotRenderRecord[];
}

interface TestShotRenderRecord {
  id: string;
  creation_id: string;
  script_shot_id: string;
  shot_id: string | null;
  shot_index: number;
  cache_hash: string | null;
  slice_id: string | null;
  render_path: string | null;
  render_duration_ms: number | null;
  retry_count: number;
  status: ShotRenderStatus;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TestCreationDetailResponse {
  creation_id: string;
  product_id: string;
  script_id: string;
  task_id: string;
  engine_mode: EngineMode;
  target_resolution: string;
  export_format: string;
  status: CreationStatus;
  progress: number;
  current_stage: CreationStage;
  video_url: string | null;
  file_size_bytes: number | null;
  trace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  shot_renders: TestShotRenderResponse[];
  created_at: string;
  updated_at: string;
}

interface TestShotRenderResponse {
  shot_render_id: string;
  creation_id: string;
  script_shot_id: string;
  shot_id: string | null;
  shot_index: number;
  cache_hash: string | null;
  slice_id: string | null;
  render_path: string | null;
  render_duration_ms: number | null;
  retry_count: number;
  status: ShotRenderStatus;
  error_message: string | null;
  updated_at: string;
}

type MockPrismaClient = {
  creation: {
    findUnique: jest.Mock;
  };
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-27T12:00:00Z');
const CREATION_ID = '00000000-0000-4000-a000-000000000100';
const PRODUCT_ID = '00000000-0000-4000-a000-000000000001';
const SCRIPT_ID = '00000000-0000-4000-a000-000000000050';
const SCRIPT_SHOT_ID_0 = 'shot-uuid-000';
const SCRIPT_SHOT_ID_1 = 'shot-uuid-001';
const SCRIPT_SHOT_ID_2 = 'shot-uuid-002';
const SCRIPT_SHOT_ID_3 = 'shot-uuid-003';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_ID_PATTERN = /^tsk_\d{8}_[0-9a-z]{6,10}$/;
const TRACE_ID_PATTERN = /^trc_\d{8}_creation_[a-f0-9]{8}$/;
const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const VALID_CREATION_STATUSES: CreationStatus[] = ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED'];
const VALID_CREATION_STAGES: CreationStage[] = [
  'QUEUE_ALLOCATION',
  'ASSET_MATCHING',
  'AI_VIDEO_GENERATING',
  'TTS_GENERATING',
  'FFMPEG_STITCHING',
  'LOUDNORM_COMPLIANCE',
  'FINISHED',
  'FAILED',
];
const VALID_ENGINE_MODES: EngineMode[] = ['SCRIPT_DRIVEN'];
const VALID_RESOLUTIONS = ['1080x1920', '1920x1080', '720x1280'];
const VALID_EXPORT_FORMATS = ['MP4', 'MOV', 'WEBM'];
const VALID_SHOT_RENDER_STATUSES: ShotRenderStatus[] = ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED'];

const DEFAULT_TARGET_RESOLUTION = '1080x1920';
const DEFAULT_EXPORT_FORMAT = 'MP4';
const DEFAULT_ENGINE_MODE: EngineMode = 'SCRIPT_DRIVEN';

// ============================================================
// Mock Factories
// ============================================================

const mockShotRenderRecordFactory = (
  index: number,
  creationId: string,
  overrides?: Partial<TestShotRenderRecord>,
): TestShotRenderRecord => ({
  id: `render-uuid-${String(index).padStart(3, '0')}`,
  creation_id: creationId,
  script_shot_id: [SCRIPT_SHOT_ID_0, SCRIPT_SHOT_ID_1, SCRIPT_SHOT_ID_2, SCRIPT_SHOT_ID_3][index] || `shot-uuid-${String(index).padStart(3, '0')}`,
  shot_id: `shot_${String(index + 1).padStart(2, '0')}`,
  shot_index: index,
  cache_hash: index < 3 ? `sha256_abc${String(index).padStart(4, '0')}` : null,
  slice_id: index < 3 ? `slc_test_${String(index).padStart(3, '0')}` : null,
  render_path: index < 2 ? `s3://tikstream/renders/${creationId}/shot_${index}.mp4` : null,
  render_duration_ms: index < 2 ? 12500 + index * 1500 : null,
  retry_count: index === 0 ? 0 : (index === 3 ? 2 : 0),
  status: index < 2 ? 'FINISHED' : (index === 2 ? 'PROCESSING' : (index === 3 ? 'FAILED' : 'PENDING')),
  error_message: index === 3 ? 'Seedance generation timeout after 3 retries' : null,
  created_at: new Date(NOW.getTime() + index * 60000),
  updated_at: new Date(NOW.getTime() + index * 30000),
  ...overrides,
});

const mockCreationRecordFactory = (overrides?: Partial<TestCreationRecord>): TestCreationRecord => ({
  id: CREATION_ID,
  product_id: PRODUCT_ID,
  script_id: SCRIPT_ID,
  task_id: 'tsk_20260527_000001',
  engine_mode: 'SCRIPT_DRIVEN',
  target_resolution: '1080x1920',
  export_format: 'MP4',
  status: 'PROCESSING',
  progress: 65,
  current_stage: 'TTS_GENERATING',
  video_url: null,
  file_size_bytes: null,
  trace_id: 'trc_20260527_creation_00000000',
  error_code: null,
  error_message: null,
  started_at: new Date(NOW.getTime() - 3600000),
  finished_at: null,
  created_at: NOW,
  updated_at: NOW,
  shot_renders: [
    mockShotRenderRecordFactory(0, CREATION_ID),
    mockShotRenderRecordFactory(1, CREATION_ID),
    mockShotRenderRecordFactory(2, CREATION_ID),
    mockShotRenderRecordFactory(3, CREATION_ID),
  ],
  ...overrides,
});

const mockCreationRecordFinishedFactory = (): TestCreationRecord => ({
  id: CREATION_ID,
  product_id: PRODUCT_ID,
  script_id: SCRIPT_ID,
  task_id: 'tsk_20260527_000001',
  engine_mode: 'SCRIPT_DRIVEN',
  target_resolution: '1080x1920',
  export_format: 'MP4',
  status: 'FINISHED',
  progress: 100,
  current_stage: 'FINISHED',
  video_url: 's3://tikstream/exports/tsk_20260527_000001.mp4',
  file_size_bytes: BigInt(25 * 1024 * 1024),
  trace_id: 'trc_20260527_creation_00000000',
  error_code: null,
  error_message: null,
  started_at: new Date(NOW.getTime() - 3600000),
  finished_at: NOW,
  created_at: NOW,
  updated_at: NOW,
  shot_renders: [
    mockShotRenderRecordFactory(0, CREATION_ID, { status: 'FINISHED', render_path: 's3://tikstream/renders/00000000-0000-4000-a000-000000000100/shot_0.mp4', render_duration_ms: 12500 }),
    mockShotRenderRecordFactory(1, CREATION_ID, { status: 'FINISHED', render_path: 's3://tikstream/renders/00000000-0000-4000-a000-000000000100/shot_1.mp4', render_duration_ms: 14000 }),
    mockShotRenderRecordFactory(2, CREATION_ID, { status: 'FINISHED', render_path: 's3://tikstream/renders/00000000-0000-4000-a000-000000000100/shot_2.mp4', render_duration_ms: 13800 }),
    mockShotRenderRecordFactory(3, CREATION_ID, { status: 'FINISHED', render_path: 's3://tikstream/renders/00000000-0000-4000-a000-000000000100/shot_3.mp4', render_duration_ms: 16000 }),
  ],
});

const mockCreationRecordFailedFactory = (): TestCreationRecord => ({
  id: CREATION_ID,
  product_id: PRODUCT_ID,
  script_id: SCRIPT_ID,
  task_id: 'tsk_20260527_000001',
  engine_mode: 'SCRIPT_DRIVEN',
  target_resolution: '1080x1920',
  export_format: 'MP4',
  status: 'FAILED',
  progress: 45,
  current_stage: 'FAILED',
  video_url: null,
  file_size_bytes: null,
  trace_id: 'trc_20260527_creation_00000000',
  error_code: 'GPU_SLICING_DECORD_FAILED',
  error_message: 'Decord failed to load video: corrupted header at frame 120',
  started_at: new Date(NOW.getTime() - 3600000),
  finished_at: new Date(NOW.getTime() - 1800000),
  created_at: NOW,
  updated_at: NOW,
  shot_renders: [
    mockShotRenderRecordFactory(0, CREATION_ID, { status: 'FINISHED', render_path: 's3://tikstream/renders/00000000-0000-4000-a000-000000000100/shot_0.mp4', render_duration_ms: 12500 }),
    mockShotRenderRecordFactory(1, CREATION_ID, { status: 'FAILED', error_message: 'Decord frame decode error' }),
  ],
});

const mockPrismaClientFactory = (): MockPrismaClient => ({
  creation: {
    findUnique: jest.fn(),
  },
});

// ============================================================
// 测试套件入口
// ============================================================

describe('CreationDetail — 创作任务详情查询 (GET /api/v1/creations/:creation_id)', () => {
  let mockPrisma: MockPrismaClient;

  // ---- 原子函数类型声明 ----

  type ValidateCreationIdFn = (creationId: string) => void;

  type FindCreationByIdFn = (
    prisma: MockPrismaClient,
    creationId: string,
  ) => Promise<TestCreationRecord | null>;

  type MapToCreationDetailResponseFn = (
    record: TestCreationRecord,
  ) => TestCreationDetailResponse;

  type GetCreationDetailFn = (
    creationId: string,
    deps: {
      prisma: MockPrismaClient;
      atoms: {
        validateCreationId: ValidateCreationIdFn;
        findCreationById: FindCreationByIdFn;
        mapToCreationDetailResponse: MapToCreationDetailResponseFn;
      };
    },
  ) => Promise<TestCreationDetailResponse>;

  // ---- 原子函数实例 ----
  let validateCreationId: ValidateCreationIdFn;
  let findCreationById: FindCreationByIdFn;
  let mapToCreationDetailResponse: MapToCreationDetailResponseFn;
  let getCreationDetail: GetCreationDetailFn;

  beforeAll(() => {
    // ===================================================================
    // H2: validateCreationId
    // 职责: 非空 + 非纯空白 + UUID v4 格式校验
    // ===================================================================

    validateCreationId = (creationId) => {
      if (!creationId || creationId.trim().length === 0) {
        throw Object.assign(
          new Error('creation_id 为必填字段'),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: { field: 'creation_id', reason: 'missing_or_empty' },
          },
        );
      }

      if (!UUID_V4_REGEX.test(creationId.trim())) {
        throw Object.assign(
          new Error(`creation_id 不是有效的 UUID v4 格式: ${creationId}`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: {
              field: 'creation_id',
              received: creationId,
              expected: 'UUID v4 (e.g. 00000000-0000-4000-a000-000000000000)',
            },
          },
        );
      }
    };

    // ===================================================================
    // H0: findCreationById (in-memory mock wrapping Prisma findUnique)
    // ===================================================================

    findCreationById = async (prisma, creationId) => {
      try {
        const result = await prisma.creation.findUnique({
          where: { id: creationId },
        });

        if (!result) {
          return null;
        }

        return result as unknown as TestCreationRecord;
      } catch (error) {
        const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> };
        const knownNonRetryable = new Set(['P2002', 'P2003']);
        const isRetryable = !knownNonRetryable.has(prismaError.code ?? '');

        throw Object.assign(
          new Error(`数据库查询失败: ${prismaError.message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: isRetryable,
            prismaCode: prismaError.code,
          },
        );
      }
    };

    // ===================================================================
    // H1: mapToCreationDetailResponse
    // 职责: Prisma camelCase → API snake_case 全字段映射
    //       Decimal → Number, Date → ISO, null → undefined 保留
    // ===================================================================

    mapToCreationDetailResponse = (record) => {
      const shotRenders: TestShotRenderResponse[] = (record.shot_renders ?? [])
        .slice()
        .sort((a, b) => a.shot_index - b.shot_index)
        .map((sr) => ({
          shot_render_id: sr.id,
          creation_id: sr.creation_id,
          script_shot_id: sr.script_shot_id,
          shot_id: sr.shot_id ?? null,
          shot_index: sr.shot_index,
          cache_hash: sr.cache_hash ?? null,
          slice_id: sr.slice_id ?? null,
          render_path: sr.render_path ?? null,
          render_duration_ms: sr.render_duration_ms ?? null,
          retry_count: sr.retry_count,
          status: sr.status,
          error_message: sr.error_message ?? null,
          updated_at: sr.updated_at.toISOString(),
        }));

      return {
        creation_id: record.id,
        product_id: record.product_id,
        script_id: record.script_id,
        task_id: record.task_id,
        engine_mode: (record.engine_mode as EngineMode) || DEFAULT_ENGINE_MODE,
        target_resolution: record.target_resolution || DEFAULT_TARGET_RESOLUTION,
        export_format: record.export_format || DEFAULT_EXPORT_FORMAT,
        status: record.status,
        progress: record.progress,
        current_stage: record.current_stage,
        video_url: record.video_url ?? null,
        file_size_bytes: record.file_size_bytes !== null && record.file_size_bytes !== undefined
          ? Number(record.file_size_bytes)
          : null,
        trace_id: record.trace_id ?? null,
        error_code: record.error_code ?? null,
        error_message: record.error_message ?? null,
        started_at: record.started_at ? record.started_at.toISOString() : null,
        finished_at: record.finished_at ? record.finished_at.toISOString() : null,
        shot_renders: shotRenders,
        created_at: record.created_at.toISOString(),
        updated_at: record.updated_at.toISOString(),
      };
    };

    // ===================================================================
    // F7: getCreationDetail (主编排器)
    // ===================================================================

    getCreationDetail = async (creationId, deps) => {
      const { prisma, atoms } = deps;

      atoms.validateCreationId(creationId);

      const record = await atoms.findCreationById(prisma, creationId);

      if (!record) {
        throw Object.assign(
          new Error(`创作任务 ${creationId} 不存在`),
          {
            errorCode: 'CREATION_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
            retryable: false,
            details: { creation_id: creationId },
          },
        );
      }

      return atoms.mapToCreationDetailResponse(record);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();
    const creationRow = mockCreationRecordFactory();
    mockPrisma.creation.findUnique.mockResolvedValue(creationRow);
  });

  const deps = () => ({
    prisma: mockPrisma,
    atoms: {
      validateCreationId,
      findCreationById,
      mapToCreationDetailResponse,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法 creation_id → 完整 Creation 详情输出', () => {
    it('TC-CRE-DETAIL-001: 返回完整响应结构 — 含 19 个 Creation 字段 + shot_renders 数组', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result).toBeDefined();

      expect(result).toHaveProperty('creation_id');
      expect(typeof result.creation_id).toBe('string');
      expect(result.creation_id).toMatch(UUID_V4_REGEX);

      expect(result).toHaveProperty('product_id');
      expect(typeof result.product_id).toBe('string');

      expect(result).toHaveProperty('script_id');
      expect(typeof result.script_id).toBe('string');

      expect(result).toHaveProperty('task_id');
      expect(typeof result.task_id).toBe('string');
      expect(result.task_id).toMatch(TASK_ID_PATTERN);

      expect(result).toHaveProperty('engine_mode');
      expect(VALID_ENGINE_MODES).toContain(result.engine_mode);

      expect(result).toHaveProperty('target_resolution');
      expect(VALID_RESOLUTIONS).toContain(result.target_resolution);

      expect(result).toHaveProperty('export_format');
      expect(VALID_EXPORT_FORMATS).toContain(result.export_format);

      expect(result).toHaveProperty('status');
      expect(VALID_CREATION_STATUSES).toContain(result.status);

      expect(result).toHaveProperty('progress');
      expect(typeof result.progress).toBe('number');
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);

      expect(result).toHaveProperty('current_stage');
      expect(VALID_CREATION_STAGES).toContain(result.current_stage);

      expect(result).toHaveProperty('video_url');

      expect(result).toHaveProperty('file_size_bytes');

      expect(result).toHaveProperty('trace_id');

      expect(result).toHaveProperty('error_code');

      expect(result).toHaveProperty('error_message');

      expect(result).toHaveProperty('started_at');

      expect(result).toHaveProperty('finished_at');

      expect(result).toHaveProperty('created_at');
      expect(ISO8601_REGEX.test(result.created_at)).toBe(true);

      expect(result).toHaveProperty('updated_at');
      expect(ISO8601_REGEX.test(result.updated_at)).toBe(true);

      expect(result).toHaveProperty('shot_renders');
      expect(Array.isArray(result.shot_renders)).toBe(true);
    });

    it('TC-CRE-DETAIL-002: 每个 ShotRender 包含全部 12 个字段', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.shot_renders.length).toBeGreaterThan(0);

      const shotRender = result.shot_renders[0];

      expect(shotRender).toHaveProperty('shot_render_id');
      expect(typeof shotRender.shot_render_id).toBe('string');

      expect(shotRender).toHaveProperty('creation_id');
      expect(typeof shotRender.creation_id).toBe('string');
      expect(shotRender.creation_id).toBe(CREATION_ID);

      expect(shotRender).toHaveProperty('script_shot_id');
      expect(typeof shotRender.script_shot_id).toBe('string');

      expect(shotRender).toHaveProperty('shot_id');

      expect(shotRender).toHaveProperty('shot_index');
      expect(typeof shotRender.shot_index).toBe('number');
      expect(Number.isInteger(shotRender.shot_index)).toBe(true);

      expect(shotRender).toHaveProperty('cache_hash');

      expect(shotRender).toHaveProperty('slice_id');

      expect(shotRender).toHaveProperty('render_path');

      expect(shotRender).toHaveProperty('render_duration_ms');

      expect(shotRender).toHaveProperty('retry_count');
      expect(typeof shotRender.retry_count).toBe('number');
      expect(Number.isInteger(shotRender.retry_count)).toBe(true);

      expect(shotRender).toHaveProperty('status');
      expect(VALID_SHOT_RENDER_STATUSES).toContain(shotRender.status);

      expect(shotRender).toHaveProperty('error_message');

      expect(shotRender).toHaveProperty('updated_at');
      expect(ISO8601_REGEX.test(shotRender.updated_at)).toBe(true);
    });

    it('TC-CRE-DETAIL-003: shot_renders 按 shot_index ASC 排序', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      for (let i = 1; i < result.shot_renders.length; i++) {
        expect(result.shot_renders[i].shot_index).toBeGreaterThanOrEqual(
          result.shot_renders[i - 1].shot_index,
        );
      }
    });

    it('TC-CRE-DETAIL-004: status=PROCESSING 时 current_stage 为中间阶段，progress 为非 0 非 100', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.status).toBe('PROCESSING');
      expect(result.progress).toBe(65);
      expect(result.current_stage).toBe('TTS_GENERATING');
      expect(result.video_url).toBeNull();
      expect(result.finished_at).toBeNull();
      expect(result.error_code).toBeNull();
      expect(result.error_message).toBeNull();
    });

    it('TC-CRE-DETAIL-005: status=FINISHED 时 video_url / finished_at / file_size_bytes 有值', async () => {
      const finishedRow = mockCreationRecordFinishedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(finishedRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.status).toBe('FINISHED');
      expect(result.progress).toBe(100);
      expect(result.current_stage).toBe('FINISHED');
      expect(result.video_url).not.toBeNull();
      expect(result.video_url).toContain('tikstream/exports');
      expect(result.finished_at).not.toBeNull();
      expect(ISO8601_REGEX.test(result.finished_at!)).toBe(true);
      expect(result.file_size_bytes).not.toBeNull();
      expect(result.file_size_bytes).toBe(25 * 1024 * 1024);
      expect(result.error_code).toBeNull();
      expect(result.error_message).toBeNull();
    });

    it('TC-CRE-DETAIL-006: status=FAILED 时 error_code / error_message / finished_at 有值', async () => {
      const failedRow = mockCreationRecordFailedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(failedRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.status).toBe('FAILED');
      expect(result.current_stage).toBe('FAILED');
      expect(result.error_code).toBe('GPU_SLICING_DECORD_FAILED');
      expect(result.error_message).toContain('Decord failed');
      expect(result.finished_at).not.toBeNull();
      expect(result.video_url).toBeNull();
    });

    it('TC-CRE-DETAIL-007: task_id 格式符合 tsk_YYYYMMDD_6~10位序号', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.task_id).toMatch(TASK_ID_PATTERN);
      expect(result.task_id).toBe('tsk_20260527_000001');
    });

    it('TC-CRE-DETAIL-008: trace_id 格式符合 trc_YYYYMMDD_creation_8位hex', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.trace_id).toMatch(TRACE_ID_PATTERN);
    });

    it('TC-CRE-DETAIL-009: creation_id 为合法 UUID v4', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.creation_id).toMatch(UUID_V4_REGEX);
    });

    it('TC-CRE-DETAIL-010: file_size_bytes BigInt → Number 正确转换', async () => {
      const finishedRow = mockCreationRecordFinishedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(finishedRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(typeof result.file_size_bytes).toBe('number');
      expect(result.file_size_bytes).toBeGreaterThan(0);
      expect(Number.isSafeInteger(result.file_size_bytes!)).toBe(true);
    });

    it('TC-CRE-DETAIL-011: Date 字段正确转为 ISO8601 字符串', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.created_at).toBe(NOW.toISOString());
      expect(result.updated_at).toBe(NOW.toISOString());

      result.shot_renders.forEach((sr) => {
        expect(() => new Date(sr.updated_at)).not.toThrow();
      });
    });

    it('TC-CRE-DETAIL-012: retry_count > 0 的失败 ShotRender 正确透传', async () => {
      const row = mockCreationRecordFactory({
        shot_renders: [
          mockShotRenderRecordFactory(0, CREATION_ID, { status: 'FAILED', retry_count: 3, error_message: 'FFmpeg stitch failed: invalid pixel format' }),
        ],
      });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.shot_renders[0].status).toBe('FAILED');
      expect(result.shot_renders[0].retry_count).toBe(3);
      expect(result.shot_renders[0].error_message).toContain('FFmpeg stitch failed');
    });

    it('TC-CRE-DETAIL-013: progress=0 时正常透传 (PENDING 状态)', async () => {
      const pendingRow = mockCreationRecordFactory({
        status: 'PENDING',
        progress: 0,
        current_stage: 'QUEUE_ALLOCATION',
        started_at: null,
      });
      mockPrisma.creation.findUnique.mockResolvedValue(pendingRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.status).toBe('PENDING');
      expect(result.progress).toBe(0);
      expect(result.current_stage).toBe('QUEUE_ALLOCATION');
      expect(result.started_at).toBeNull();
    });

    it('TC-CRE-DETAIL-014: progress=100 时正常透传 (FINISHED 状态)', async () => {
      const finishedRow = mockCreationRecordFinishedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(finishedRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.status).toBe('FINISHED');
      expect(result.progress).toBe(100);
    });

    it('TC-CRE-DETAIL-015: status=CANCELED 时各字段正确透传', async () => {
      const canceledRow = mockCreationRecordFactory({
        status: 'CANCELED',
        progress: 30,
        current_stage: 'AI_VIDEO_GENERATING',
        finished_at: new Date(NOW.getTime() - 600000),
        video_url: null,
      });
      mockPrisma.creation.findUnique.mockResolvedValue(canceledRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.status).toBe('CANCELED');
      expect(result.progress).toBe(30);
      expect(result.current_stage).toBe('AI_VIDEO_GENERATING');
      expect(result.finished_at).not.toBeNull();
    });

    it('TC-CRE-DETAIL-016: export_format 为 MOV 时正确透传', async () => {
      const movRow = mockCreationRecordFactory({ export_format: 'MOV' });
      mockPrisma.creation.findUnique.mockResolvedValue(movRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.export_format).toBe('MOV');
    });

    it('TC-CRE-DETAIL-017: export_format 为 WEBM 时正确透传', async () => {
      const webmRow = mockCreationRecordFactory({ export_format: 'WEBM' });
      mockPrisma.creation.findUnique.mockResolvedValue(webmRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.export_format).toBe('WEBM');
    });

    it('TC-CRE-DETAIL-018: target_resolution 为 1920x1080 时正确透传', async () => {
      const fullHdRow = mockCreationRecordFactory({ target_resolution: '1920x1080' });
      mockPrisma.creation.findUnique.mockResolvedValue(fullHdRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.target_resolution).toBe('1920x1080');
    });

    it('TC-CRE-DETAIL-019: target_resolution 为 720x1280 时正确透传', async () => {
      const hdRow = mockCreationRecordFactory({ target_resolution: '720x1280' });
      mockPrisma.creation.findUnique.mockResolvedValue(hdRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.target_resolution).toBe('720x1280');
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-CRE-DETAIL-BND-001: creation_id 首尾含空格 → UUID 校验后仍合法', async () => {
      const result = await getCreationDetail(`  ${CREATION_ID}  `, deps());

      expect(result.creation_id).toBe(CREATION_ID);
    });

    it('TC-CRE-DETAIL-BND-002: shot_renders 为空数组 → 返回 shot_renders=[]', async () => {
      const noShotRenderRow = mockCreationRecordFactory({ shot_renders: [] });
      mockPrisma.creation.findUnique.mockResolvedValue(noShotRenderRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.shot_renders).toEqual([]);
      expect(result.shot_renders.length).toBe(0);
    });

    it('TC-CRE-DETAIL-BND-003: video_url 为 null → 正确返回 null', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.video_url).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-004: file_size_bytes 为 null → 正确返回 null', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.file_size_bytes).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-005: error_code 和 error_message 为 null → 正确返回 null', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.error_code).toBeNull();
      expect(result.error_message).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-006: started_at 为 null → 正确返回 null', async () => {
      const notStartedRow = mockCreationRecordFactory({ started_at: null });
      mockPrisma.creation.findUnique.mockResolvedValue(notStartedRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.started_at).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-007: finished_at 为 null → 正确返回 null', async () => {
      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.finished_at).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-008: trace_id 为 null → 正确返回 null', async () => {
      const noTraceRow = mockCreationRecordFactory({ trace_id: null });
      mockPrisma.creation.findUnique.mockResolvedValue(noTraceRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.trace_id).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-009: ShotRender cache_hash/slice_id/render_path/render_duration_ms 为 null → 正确返回 null', async () => {
      const nullFieldRender = mockShotRenderRecordFactory(0, CREATION_ID, {
        cache_hash: null,
        slice_id: null,
        render_path: null,
        render_duration_ms: null,
      });
      const row = mockCreationRecordFactory({ shot_renders: [nullFieldRender] });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.shot_renders[0].cache_hash).toBeNull();
      expect(result.shot_renders[0].slice_id).toBeNull();
      expect(result.shot_renders[0].render_path).toBeNull();
      expect(result.shot_renders[0].render_duration_ms).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-010: ShotRender error_message 为 null → 正确返回 null', async () => {
      const noErrRender = mockShotRenderRecordFactory(0, CREATION_ID, { error_message: null });
      const row = mockCreationRecordFactory({ shot_renders: [noErrRender] });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.shot_renders[0].error_message).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-011: ShotRender shot_id 为 null → 正确返回 null', async () => {
      const noShotIdRender = mockShotRenderRecordFactory(0, CREATION_ID, { shot_id: null });
      const row = mockCreationRecordFactory({ shot_renders: [noShotIdRender] });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.shot_renders[0].shot_id).toBeNull();
    });

    it('TC-CRE-DETAIL-BND-012: 大量 ShotRender (20个) → 全部正确映射并排序', async () => {
      const manyRenders = Array.from({ length: 20 }, (_, i) =>
        mockShotRenderRecordFactory(i, CREATION_ID, {
          shot_index: 19 - i,
        }),
      );
      const row = mockCreationRecordFactory({ shot_renders: manyRenders });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.shot_renders.length).toBe(20);

      for (let i = 1; i < result.shot_renders.length; i++) {
        expect(result.shot_renders[i].shot_index).toBeGreaterThanOrEqual(
          result.shot_renders[i - 1].shot_index,
        );
      }
    });

    it('TC-CRE-DETAIL-BND-013: file_size_bytes BigInt 大值 (200MB) → Number 安全转换', async () => {
      const largeRow = mockCreationRecordFactory({
        status: 'FINISHED',
        current_stage: 'FINISHED',
        progress: 100,
        video_url: 's3://tikstream/exports/large.mp4',
        finished_at: NOW,
        file_size_bytes: BigInt(200 * 1024 * 1024),
      });
      mockPrisma.creation.findUnique.mockResolvedValue(largeRow);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.file_size_bytes).toBe(200 * 1024 * 1024);
      expect(Number.isSafeInteger(result.file_size_bytes!)).toBe(true);
    });

    it('TC-CRE-DETAIL-BND-014: progress 为小数边界 99.9 → 取整后仍为原值 (int 类型)', async () => {
      const row = mockCreationRecordFactory({ progress: 99 as number });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(CREATION_ID, deps());

      expect(result.progress).toBe(99);
      expect(Number.isInteger(result.progress)).toBe(true);
    });

    it('TC-CRE-DETAIL-BND-015: creation_id 全大写 UUID → 通过大小写不敏感校验', async () => {
      const upperId = '00000000-0000-4000-A000-000000000100'.toUpperCase();
      const row = mockCreationRecordFactory({ id: upperId });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(upperId.toUpperCase(), deps());

      expect(result.creation_id).toBe(upperId);
    });

    it('TC-CRE-DETAIL-BND-016: creation_id 混合大小写 → 校验通过', async () => {
      const mixedId = '00000000-0000-4000-A000-000000000100';
      const row = mockCreationRecordFactory({ id: mixedId });
      mockPrisma.creation.findUnique.mockResolvedValue(row);

      const result = await getCreationDetail(mixedId, deps());

      expect(result.creation_id).toBe(mixedId);
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    it('TC-CRE-DETAIL-ERR-001: creation_id 为空字符串 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> } | null = null;
      try {
        await getCreationDetail('', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details).toBeDefined();
      expect(caught!.details!.field).toBe('creation_id');
    });

    it('TC-CRE-DETAIL-ERR-002: creation_id 为纯空格字符串 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail('   ', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-DETAIL-ERR-003: creation_id 为 null/undefined → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await getCreationDetail(null as unknown as string, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-CRE-DETAIL-ERR-004: creation_id 为非 UUID 格式 (纯数字) → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail('12345', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-DETAIL-ERR-005: creation_id 为非 UUID 格式 (随机字符串) → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await getCreationDetail('hello-world-not-a-uuid', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-CRE-DETAIL-ERR-006: creation_id 格式接近 UUID 但版本位不对 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await getCreationDetail('00000000-0000-3000-a000-000000000100', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-CRE-DETAIL-ERR-007: creation_id 格式接近 UUID 但变体位不对 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await getCreationDetail('00000000-0000-4000-c000-000000000100', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-CRE-DETAIL-ERR-008: creation_id 格式接近 UUID 但长度不足 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await getCreationDetail('00000000-0000-4000-a000-00000000000', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-CRE-DETAIL-ERR-009: creation_id 格式接近 UUID 但含非法字符 G > F → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await getCreationDetail('00000000-0000-4000-a000-G00000000100', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-CRE-DETAIL-ERR-010: 合法 UUID 但 Creation 不存在 → 抛出 CREATION_NOT_FOUND', async () => {
      mockPrisma.creation.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> } | null = null;
      try {
        await getCreationDetail('99999999-9999-4999-a999-999999999999', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details).toBeDefined();
      expect(caught!.details!.creation_id).toBe('99999999-9999-4999-a999-999999999999');
    });

    it('TC-CRE-DETAIL-ERR-011: Prisma P1001 数据库连接不可达 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p1001Error = Object.assign(
        new Error("Can't reach database server at `localhost:5432`"),
        { code: 'P1001' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-DETAIL-ERR-012: Prisma P1017 数据库连接超时 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p1017Error = Object.assign(
        new Error('Server has closed the connection'),
        { code: 'P1017' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p1017Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-DETAIL-ERR-013: Prisma P2024 连接池耗尽 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2024Error = Object.assign(
        new Error('Timed out fetching a new connection from the connection pool'),
        { code: 'P2024' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-DETAIL-ERR-014: Prisma P2028 事务超时 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2028Error = Object.assign(
        new Error('Transaction API error: Transaction timeout'),
        { code: 'P2028' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p2028Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-DETAIL-ERR-015: Prisma 初始化失败 (INIT_ERROR) → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const initError = Object.assign(
        new Error('Database initialization failed'),
        { code: 'INIT_ERROR' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(initError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-DETAIL-ERR-016: Prisma Rust Panic (RUST_PANIC) → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const rustPanic = Object.assign(
        new Error('Rust engine panicked'),
        { code: 'RUST_PANIC' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(rustPanic);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-DETAIL-ERR-017: Prisma 未知错误码 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const unknownError = Object.assign(
        new Error('Unknown Prisma engine error'),
        { code: 'P9999' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(unknownError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-DETAIL-ERR-018: Prisma 原生 Error (无 code) → INTERNAL_SERVER_ERROR (retryable)', async () => {
      mockPrisma.creation.findUnique.mockRejectedValue(new Error('Unexpected native error'));

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await getCreationDetail(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时卡点告警', () => {
    it('TC-CRE-DETAIL-PERF-001: getCreationDetail 编排总耗时 ≤ 30ms (mock DB)', async () => {
      const PERF_CEILING_MS = 30;

      const start = performance.now();

      const result = await getCreationDetail(CREATION_ID, deps());

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(result.creation_id).toBe(CREATION_ID);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-CRE-DETAIL-PERF-002: validateCreationId (纯同步) ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      expect(() => validateCreationId(CREATION_ID)).not.toThrow();

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-DETAIL-PERF-003: validateCreationId 失败路径 (提前返回) ≤ 0.5ms', () => {
      const PERF_CEILING_MS = 0.5;

      const start = performance.now();

      try {
        validateCreationId('');
      } catch {
        // expected
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-DETAIL-PERF-004: findCreationById (mock DB, 4 shot_renders) ≤ 15ms', async () => {
      const PERF_CEILING_MS = 15;

      const start = performance.now();

      const result = await findCreationById(mockPrisma, CREATION_ID);

      const elapsed = performance.now() - start;

      expect(result).not.toBeNull();
      expect(result!.id).toBe(CREATION_ID);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-DETAIL-PERF-005: findCreationById 返回 null (不存在) ≤ 10ms', async () => {
      const PERF_CEILING_MS = 10;

      mockPrisma.creation.findUnique.mockResolvedValue(null);

      const start = performance.now();

      const result = await findCreationById(mockPrisma, '99999999-9999-4999-a999-999999999999');

      const elapsed = performance.now() - start;

      expect(result).toBeNull();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-DETAIL-PERF-006: mapToCreationDetailResponse (4 shot_renders) ≤ 5ms', () => {
      const PERF_CEILING_MS = 5;

      const record = mockCreationRecordFactory();

      const start = performance.now();

      const result = mapToCreationDetailResponse(record);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('creation_id');
      expect(result).toHaveProperty('shot_renders');
      expect(result.shot_renders.length).toBe(4);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-DETAIL-PERF-007: mapToCreationDetailResponse (0 shot_renders) ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;

      const record = mockCreationRecordFactory({ shot_renders: [] });

      const start = performance.now();

      const result = mapToCreationDetailResponse(record);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('creation_id');
      expect(result.shot_renders.length).toBe(0);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-DETAIL-PERF-008: mapToCreationDetailResponse (20 shot_renders) ≤ 10ms', () => {
      const PERF_CEILING_MS = 10;

      const manyRenders = Array.from({ length: 20 }, (_, i) =>
        mockShotRenderRecordFactory(i, CREATION_ID),
      );
      const record = mockCreationRecordFactory({ shot_renders: manyRenders });

      const start = performance.now();

      const result = mapToCreationDetailResponse(record);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('creation_id');
      expect(result.shot_renders.length).toBe(20);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-DETAIL-PERF-009: 连续 5 次 getCreationDetail 无性能退化', async () => {
      const ITERATIONS = 5;
      const PERF_CEILING_MS_PER_ITERATION = 15;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await getCreationDetail(CREATION_ID, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-CRE-DETAIL-PERF-010: validateCreationId 对合法 UUID 的平均耗时 (100次) ≤ 0.1ms', () => {
      const ITERATIONS = 100;
      const PERF_CEILING_MS_PER_ITERATION = 0.1;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        validateCreationId(CREATION_ID);
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    });
  });
});
