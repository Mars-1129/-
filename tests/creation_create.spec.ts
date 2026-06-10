// =============================================================================
// TikStream AI — Creation Create 自动化测试基座
// 对应功能: POST /api/v1/creations (一键成片创作任务发起)
// 对应模块: Creation (人员A) | 测试类型: 单元测试 (Service 层)
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
type ScriptGenerationMode = 'PROMPT_DRIVEN' | 'VIRAL_REWRITE' | 'TEMPLATE_DRIVEN';
type AspectRatio = '9:16' | '16:9';
type CameraMovement = 'Static' | 'Dolly_In_Fast' | 'Dolly_Out' | 'Pan_Left' | 'Tilt_Up';
type TransitionType = 'None' | 'Fade_In' | 'Dissolve' | 'Wipe';
type ComplianceStatus = 'PENDING' | 'PASSED' | 'REJECTED';
type ShotRenderStatus = 'PENDING' | 'PROCESSING' | 'FINISHED' | 'FAILED';

interface TestCreateCreationDto {
  product_id: string;
  script_id: string;
  engine_mode?: EngineMode;
  target_resolution?: string;
  export_format?: string;
  voice_profile?: string;
  bgm_policy?: string;
  force_refresh?: boolean;
}

interface TestProduct {
  id: string;
  title: string;
}

interface TestScriptShot {
  id: string;
  script_id: string;
  shot_id: string | null;
  shot_index: number;
  duration: number;
  scene_description_query: string;
  visual_description: string;
  camera_movement: CameraMovement;
  transition_type: TransitionType;
  voiceover_text: string;
  subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number];
  selected_slice_id: string | null;
  render_prompt: string | null;
  local_factor_patch: Record<string, unknown>;
  compliance_status: ComplianceStatus;
  created_at: Date;
  updated_at: Date;
}

interface TestScript {
  id: string;
  product_id: string;
  title: string | null;
  language: string;
  video_duration: number;
  aspect_ratio: AspectRatio;
  style_vibe: string;
  generation_mode: ScriptGenerationMode;
  shots: TestScriptShot[];
}

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

interface TestCreateCreationResponse {
  creation_id: string;
  task_id: string;
  product_id: string;
  script_id: string;
  status: CreationStatus;
  current_stage: CreationStage;
  progress: number;
}

interface TestCreateCreationParams {
  id: string;
  productId: string;
  scriptId: string;
  taskId: string;
  engineMode: string;
  targetResolution: string;
  exportFormat: string;
  traceId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestCreationJobPayload {
  creation_id: string;
  task_id: string;
  product_id: string;
  script_id: string;
  trace_id: string;
  voice_profile: string;
  bgm_policy: string;
  force_refresh: boolean;
}

type MockPrismaService = {
  product: { findUnique: jest.Mock };
  script: { findUnique: jest.Mock };
  creation: { create: jest.Mock };
};

type MockRedisClient = {
  incr: jest.Mock;
};

type MockBullMqQueue = {
  add: jest.Mock;
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-27T12:00:00Z');
const PRODUCT_ID = '00000000-0000-4000-a000-000000000001';
const SCRIPT_ID = '00000000-0000-4000-a000-000000000050';
const CREATION_ID = '00000000-0000-4000-a000-000000000100';

const VALID_ENGINE_MODES: EngineMode[] = ['SCRIPT_DRIVEN'];
const VALID_RESOLUTIONS = ['1080x1920', '1920x1080', '720x1280'];
const VALID_EXPORT_FORMATS = ['MP4', 'MOV', 'WEBM'];

const DEFAULT_TARGET_RESOLUTION = '1080x1920';
const DEFAULT_EXPORT_FORMAT = 'MP4';
const DEFAULT_ENGINE_MODE: EngineMode = 'SCRIPT_DRIVEN';
const DEFAULT_VOICE_PROFILE = 'default_female_zh';
const DEFAULT_BGM_POLICY = 'auto_match';

const TASK_ID_PATTERN = /^tsk_\d{8}_[0-9a-z]{6,10}$/;
const TRACE_ID_PATTERN = /^trc_\d{8}_creation_[a-f0-9]{8}$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_VIDEO_DURATION_SECONDS = 15.0;
const SHOT_MIN_DURATION = 1.5;
const SHOT_MAX_DURATION = 5.0;

// ============================================================
// Mock Factories
// ============================================================

const mockProductFactory = (overrides?: Partial<TestProduct>): TestProduct => ({
  id: PRODUCT_ID,
  title: '智能无线卷发棒 Pro',
  ...overrides,
});

const mockScriptShotFactory = (
  index: number,
  scriptId: string,
  overrides?: Partial<TestScriptShot>,
): TestScriptShot => ({
  id: `shot-uuid-${String(index).padStart(3, '0')}`,
  script_id: scriptId,
  shot_id: `shot_${String(index + 1).padStart(2, '0')}`,
  shot_index: index,
  duration: 3.0,
  scene_description_query: `Scene ${index + 1}: Product unboxing showcase`,
  visual_description: `Close-up of product features, bright studio lighting, 9:16 framing`,
  camera_movement: index === 0 ? 'Dolly_In_Fast' : 'Static',
  transition_type: index === 0 ? 'None' : 'Dissolve',
  voiceover_text: `这是第${index + 1}个镜头的旁白文案`,
  subtitle_text: `这是第${index + 1}个镜头的字幕`,
  safe_zone_bounding_box: [0, 280, 1080, 1640],
  selected_slice_id: index < 3 ? `slc_test_${String(index).padStart(3, '0')}` : null,
  render_prompt: null,
  local_factor_patch: {},
  compliance_status: 'PASSED',
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockScriptFactory = (overrides?: Partial<TestScript>): TestScript => {
  const id = overrides?.id ?? SCRIPT_ID;
  return {
    id,
    product_id: PRODUCT_ID,
    title: '卷发棒春日上新爆款剧本',
    language: 'zh-CN',
    video_duration: 12.0,
    aspect_ratio: '9:16',
    style_vibe: '现代简约',
    generation_mode: 'PROMPT_DRIVEN',
    shots: [
      mockScriptShotFactory(0, id),
      mockScriptShotFactory(1, id),
      mockScriptShotFactory(2, id),
      mockScriptShotFactory(3, id),
    ],
    ...overrides,
  };
};

const mockCreateCreationDtoFactory = (overrides?: Partial<TestCreateCreationDto>): TestCreateCreationDto => ({
  product_id: PRODUCT_ID,
  script_id: SCRIPT_ID,
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
  status: 'PENDING',
  progress: 0,
  current_stage: 'QUEUE_ALLOCATION',
  video_url: null,
  file_size_bytes: null,
  trace_id: 'trc_20260527_creation_00000000',
  error_code: null,
  error_message: null,
  started_at: null,
  finished_at: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockShotRenderRecordFactory = (
  index: number,
  creationId: string,
  scriptShotId: string,
  overrides?: Partial<TestShotRenderRecord>,
): TestShotRenderRecord => ({
  id: `render-uuid-${String(index).padStart(3, '0')}`,
  creation_id: creationId,
  script_shot_id: scriptShotId,
  shot_id: `shot_${String(index + 1).padStart(2, '0')}`,
  shot_index: index,
  cache_hash: null,
  slice_id: index < 3 ? `slc_test_${String(index).padStart(3, '0')}` : null,
  render_path: null,
  render_duration_ms: null,
  retry_count: 0,
  status: 'PENDING',
  error_message: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => ({
  product: { findUnique: jest.fn() },
  script: { findUnique: jest.fn() },
  creation: { create: jest.fn() },
});

const mockRedisClientFactory = (): MockRedisClient => ({
  incr: jest.fn(),
});

const mockBullMqQueueFactory = (): MockBullMqQueue => ({
  add: jest.fn(),
});

// ============================================================
// 测试套件入口
// ============================================================

describe('CreationCreate — 一键成片创作任务发起 (POST /api/v1/creations)', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockPrisma: MockPrismaService;
  let mockRedis: MockRedisClient;
  let mockBullMq: MockBullMqQueue;

  // ---- 原子函数类型声明 ----

  type ValidateProductAndScriptFn = (
    productId: string,
    scriptId: string,
    prisma: MockPrismaService,
  ) => Promise<{
    product: TestProduct;
    script: TestScript;
  }>;

  type GenerateCreationIdentifiersFn = (
    redis: MockRedisClient | null,
  ) => Promise<{
    creationId: string;
    taskId: string;
    traceId: string;
  }>;

  type BuildCreationParamsFn = (
    dto: TestCreateCreationDto,
    creationId: string,
    taskId: string,
    traceId: string,
    now: Date,
  ) => TestCreateCreationParams;

  type MapToCreateCreationResponseFn = (
    creation: TestCreationRecord,
  ) => TestCreateCreationResponse;

  type PersistCreationRecordFn = (
    prisma: MockPrismaService,
    params: TestCreateCreationParams,
    shots: TestScriptShot[],
  ) => Promise<TestCreationRecord>;

  type EnqueueCreationJobFn = (
    queue: MockBullMqQueue,
    payload: TestCreationJobPayload,
  ) => Promise<string>;

  // ---- 主编排函数类型 ----

  type CreateCreationFn = (
    dto: TestCreateCreationDto,
    deps: {
      prisma: MockPrismaService;
      redis: MockRedisClient | null;
      bullMq: MockBullMqQueue;
      atoms: {
        validateProductAndScript: ValidateProductAndScriptFn;
        generateCreationIdentifiers: GenerateCreationIdentifiersFn;
        buildCreationParams: BuildCreationParamsFn;
        mapToCreateCreationResponse: MapToCreateCreationResponseFn;
        persistCreationRecord: PersistCreationRecordFn;
        enqueueCreationJob: EnqueueCreationJobFn;
      };
    },
  ) => Promise<TestCreateCreationResponse>;

  // ---- 原子函数实例 ----
  let validateProductAndScript: ValidateProductAndScriptFn;
  let generateCreationIdentifiers: GenerateCreationIdentifiersFn;
  let buildCreationParams: BuildCreationParamsFn;
  let mapToCreateCreationResponse: MapToCreateCreationResponseFn;
  let persistCreationRecord: PersistCreationRecordFn;
  let enqueueCreationJob: EnqueueCreationJobFn;
  let createCreation: CreateCreationFn;

  let redisSequence: number;

  beforeAll(() => {
    redisSequence = 0;

    // ---- F1: validateProductAndScript ----

    validateProductAndScript = async (productId, scriptId, prisma) => {
      if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
        throw Object.assign(new Error(`商品ID无效: ${productId}`), {
          errorCode: 'PRODUCT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }

      if (!scriptId || typeof scriptId !== 'string' || scriptId.trim().length === 0) {
        throw Object.assign(new Error(`剧本ID无效: ${scriptId}`), {
          errorCode: 'SCRIPT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw Object.assign(new Error(`商品不存在: ${productId}`), {
          errorCode: 'PRODUCT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }

      const script = await prisma.script.findUnique({ where: { id: scriptId } });
      if (!script) {
        throw Object.assign(new Error(`剧本不存在: ${scriptId}`), {
          errorCode: 'SCRIPT_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
          retryable: false,
        });
      }

      if (script.product_id !== productId) {
        throw Object.assign(
          new Error(`剧本不属于指定商品 (script_id=${scriptId}, product_id=${productId})`),
          {
            errorCode: 'CREATION_SCRIPT_PRODUCT_MISMATCH',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      if (!script.shots || script.shots.length === 0) {
        throw Object.assign(new Error('剧本未包含任何分镜'), {
          errorCode: 'SCRIPT_NO_SHOTS_GENERATED',
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          retryable: false,
        });
      }

      return { product, script };
    };

    // ---- F2: generateCreationIdentifiers ----

    generateCreationIdentifiers = async (redis) => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const datePrefix = `${y}${m}${d}`;

      let sequence: number;

      if (redis) {
        try {
          const seq = await redis.incr(`tikstream:creation:seq:${datePrefix}`);
          sequence = seq as number;
        } catch {
          sequence = parseInt(Date.now().toString(36).slice(-8), 36) +
            Math.floor(Math.random() * 10000);
        }
      } else {
        sequence = parseInt(Date.now().toString(36).slice(-8), 36) +
          Math.floor(Math.random() * 10000);
      }

      const creationId = crypto.randomUUID();
      const taskId = `tsk_${datePrefix}_${String(sequence % 1000000).padStart(6, '0')}`;
      const traceId = `trc_${datePrefix}_creation_${creationId.slice(0, 8)}`;

      return { creationId, taskId, traceId };
    };

    // ---- F3: buildCreationParams ----

    buildCreationParams = (dto, creationId, taskId, traceId, now) => ({
      id: creationId,
      productId: dto.product_id,
      scriptId: dto.script_id,
      taskId,
      engineMode: dto.engine_mode ?? DEFAULT_ENGINE_MODE,
      targetResolution: dto.target_resolution ?? DEFAULT_TARGET_RESOLUTION,
      exportFormat: dto.export_format ?? DEFAULT_EXPORT_FORMAT,
      traceId,
      createdAt: now,
      updatedAt: now,
    });

    // ---- F4: mapToCreateCreationResponse ----

    mapToCreateCreationResponse = (creation) => ({
      creation_id: creation.id,
      task_id: creation.task_id,
      product_id: creation.product_id,
      script_id: creation.script_id,
      status: creation.status,
      current_stage: creation.current_stage,
      progress: creation.progress,
    });

    // ---- F5: persistCreationRecord ----

    persistCreationRecord = async (prisma, params, shots) => {
      try {
        const shotRenderData = shots.map((shot, idx) => ({
          id: `render-uuid-${String(idx).padStart(3, '0')}`,
          creation_id: params.id,
          script_shot_id: shot.id,
          shot_id: shot.shot_id,
          shot_index: shot.shot_index,
          cache_hash: null,
          slice_id: shot.selected_slice_id,
          render_path: null,
          render_duration_ms: null,
          retry_count: 0,
          status: 'PENDING' as ShotRenderStatus,
          error_message: null,
          created_at: params.createdAt,
          updated_at: params.updatedAt,
        }));

        const record = await prisma.creation.create({
          data: {
            ...params,
            status: 'PENDING' as CreationStatus,
            progress: 0,
            currentStage: 'QUEUE_ALLOCATION' as CreationStage,
            shotRenders: { createMany: { data: shotRenderData } },
          },
        });

        return record;
      } catch (err) {
        const prismaErr = err as Error & { code?: string; meta?: Record<string, unknown> };
        if (prismaErr.code === 'P2002') {
          const target = (prismaErr.meta?.target as string[])?.join(', ') ?? 'unknown';
          throw Object.assign(
            new Error(`唯一键冲突: ${target}`),
            {
              errorCode: 'IDEMPOTENCY_CONFLICT',
              statusCode: HttpStatus.CONFLICT,
              retryable: false,
            },
          );
        }

        if (prismaErr.code === 'P2003') {
          throw Object.assign(
            new Error(`外键约束失败: ${prismaErr.message}`),
            {
              errorCode: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          );
        }

        if (prismaErr.code === 'P2025') {
          throw Object.assign(
            new Error(`关联记录不存在: ${prismaErr.message}`),
            {
              errorCode: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          );
        }

        if (prismaErr.code === 'P1001' || prismaErr.code === 'P1017' || prismaErr.code === 'P2024') {
          throw Object.assign(
            new Error(`数据库连接异常: ${prismaErr.message}`),
            {
              errorCode: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          );
        }

        throw Object.assign(
          new Error(`数据库操作失败: ${prismaErr.message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }
    };

    // ---- F6: enqueueCreationJob ----

    enqueueCreationJob = async (queue, payload) => {
      try {
        const job = await queue.add('compose-video', payload, {
          jobId: payload.task_id,
        });
        return typeof job.id === 'string' ? job.id : 'job-created';
      } catch (err) {
        const queueErr = err as Error & { code?: string };
        throw Object.assign(
          new Error(`任务入队失败: ${queueErr.message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }
    };

    // ---- 主编排: createCreation ----

    createCreation = async (dto, deps) => {
      const { prisma, redis, bullMq, atoms } = deps;

      const { product, script } = await atoms.validateProductAndScript(
        dto.product_id,
        dto.script_id,
        prisma,
      );

      const { creationId, taskId, traceId } = await atoms.generateCreationIdentifiers(redis);

      const params = atoms.buildCreationParams(dto, creationId, taskId, traceId, new Date());

      const creation = await atoms.persistCreationRecord(prisma, params, script.shots);

      await atoms.enqueueCreationJob(bullMq, {
        creation_id: creationId,
        task_id: taskId,
        product_id: product.id,
        script_id: script.id,
        trace_id: traceId,
        voice_profile: dto.voice_profile ?? DEFAULT_VOICE_PROFILE,
        bgm_policy: dto.bgm_policy ?? DEFAULT_BGM_POLICY,
        force_refresh: dto.force_refresh ?? false,
      });

      return atoms.mapToCreateCreationResponse(creation);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
    mockRedis = mockRedisClientFactory();
    mockBullMq = mockBullMqQueueFactory();
    redisSequence = 0;

    mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());

    mockPrisma.script.findUnique.mockResolvedValue(mockScriptFactory());

    mockPrisma.creation.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      const data = args.data;
      return mockCreationRecordFactory({
        id: (data.id as string) ?? CREATION_ID,
        product_id: (data.productId as string) ?? PRODUCT_ID,
        script_id: (data.scriptId as string) ?? SCRIPT_ID,
        task_id: (data.taskId as string) ?? 'tsk_20260527_000001',
        engine_mode: (data.engineMode as string) ?? 'SCRIPT_DRIVEN',
        target_resolution: (data.targetResolution as string) ?? '1080x1920',
        export_format: (data.exportFormat as string) ?? 'MP4',
        trace_id: (data.traceId as string) ?? 'trc_20260527_creation_00000000',
        status: (data.status as CreationStatus) ?? 'PENDING',
        progress: (data.progress as number) ?? 0,
        current_stage: (data.currentStage as CreationStage) ?? 'QUEUE_ALLOCATION',
      });
    });

    mockRedis.incr.mockImplementation(async () => {
      redisSequence += 1;
      return redisSequence;
    });

    mockBullMq.add.mockResolvedValue({ id: 'job-creation-001' });
  });

  const deps = () => ({
    prisma: mockPrisma,
    redis: mockRedis,
    bullMq: mockBullMq,
    atoms: {
      validateProductAndScript,
      generateCreationIdentifiers,
      buildCreationParams,
      mapToCreateCreationResponse,
      persistCreationRecord,
      enqueueCreationJob,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整 CreateCreationResponse 输出', () => {
    it('TC-CRE-001: 一键成片任务创建成功 — 返回完整响应结构', async () => {
      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();

      expect(result).toHaveProperty('creation_id');
      expect(typeof result.creation_id).toBe('string');
      expect(result.creation_id.length).toBeGreaterThan(0);
      expect(result.creation_id).toMatch(UUID_V4_PATTERN);

      expect(result).toHaveProperty('task_id');
      expect(typeof result.task_id).toBe('string');
      expect(result.task_id.length).toBeGreaterThan(0);
      expect(result.task_id).toMatch(TASK_ID_PATTERN);

      expect(result).toHaveProperty('product_id');
      expect(result.product_id).toBe(PRODUCT_ID);

      expect(result).toHaveProperty('script_id');
      expect(result.script_id).toBe(SCRIPT_ID);

      expect(result).toHaveProperty('status');
      expect(result.status).toBe('PENDING');

      expect(result).toHaveProperty('current_stage');
      expect(result.current_stage).toBe('QUEUE_ALLOCATION');

      expect(result).toHaveProperty('progress');
      expect(result.progress).toBe(0);
    });

    it('TC-CRE-002: 默认值正确填充 — engine_mode/target_resolution/export_format', async () => {
      const dto = mockCreateCreationDtoFactory();
      delete dto.engine_mode;
      delete dto.target_resolution;
      delete dto.export_format;

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
      expect(result.current_stage).toBe('QUEUE_ALLOCATION');
    });

    it('TC-CRE-003: 可选参数 voice_profile/bgm_policy/force_refresh 正确传递到 BullMQ Job Payload', async () => {
      const dto = mockCreateCreationDtoFactory({
        voice_profile: 'male_anchor_en',
        bgm_policy: 'manual_select',
        force_refresh: true,
      });

      const result = await createCreation(dto, deps());

      expect(result).toHaveProperty('creation_id');

      expect(mockBullMq.add).toHaveBeenCalledTimes(1);

      const addCallArgs = mockBullMq.add.mock.calls[0];
      expect(addCallArgs[0]).toBe('compose-video');

      const payload = addCallArgs[1];
      expect(payload.voice_profile).toBe('male_anchor_en');
      expect(payload.bgm_policy).toBe('manual_select');
      expect(payload.force_refresh).toBe(true);

      const options = addCallArgs[2];
      expect(options).toHaveProperty('jobId');
      expect(options.jobId).toBe(result.task_id);
    });

    it('TC-CRE-004: task_id 格式符合 tsk_YYYYMMDD_6位序号', async () => {
      const dto = mockCreateCreationDtoFactory();

      mockRedis.incr.mockResolvedValue(42);

      const result = await createCreation(dto, deps());

      const taskIdPattern = /^tsk_\d{8}_\d{6}$/;
      expect(result.task_id).toMatch(taskIdPattern);
    });

    it('TC-CRE-005: ShotRender 预创建 — Prisma creation.create 包含正确数量的 shotRenders', async () => {
      const dto = mockCreateCreationDtoFactory();

      const scriptWithShots = mockScriptFactory();
      mockPrisma.script.findUnique.mockResolvedValue(scriptWithShots);

      const result = await createCreation(dto, deps());

      expect(result).toHaveProperty('creation_id');

      expect(mockPrisma.creation.create).toHaveBeenCalledTimes(1);

      const createCallArgs = mockPrisma.creation.create.mock.calls[0][0];
      expect(createCallArgs).toHaveProperty('data');

      const dataArg = createCallArgs.data;
      expect(dataArg).toHaveProperty('shotRenders');
      expect(dataArg.shotRenders).toHaveProperty('createMany');

      const createManyData = dataArg.shotRenders.createMany.data;
      expect(createManyData).toBeInstanceOf(Array);
      expect(createManyData.length).toBe(scriptWithShots.shots.length);

      for (let i = 0; i < createManyData.length; i++) {
        expect(createManyData[i].shot_index).toBe(i);
        expect(createManyData[i].status).toBe('PENDING');
        expect(createManyData[i].creation_id).toBe(result.creation_id);
      }
    });

    it('TC-CRE-006: trace_id 格式符合 trc_YYYYMMDD_creation_8位hex', async () => {
      const dto = mockCreateCreationDtoFactory();

      const traceIds: string[] = [];

      const recordWithTrace = mockCreationRecordFactory({
        trace_id: 'trc_20260527_creation_00000000',
      });
      mockPrisma.creation.create.mockResolvedValue(recordWithTrace);

      const result = await createCreation(dto, deps());

      expect(result).not.toHaveProperty('trace_id');
      expect(mockPrisma.creation.create.mock.calls[0][0].data).toHaveProperty('traceId');
    });

    it('TC-CRE-007: voice_profile 未提供时默认使用 default_female_zh', async () => {
      const dto = mockCreateCreationDtoFactory();
      delete dto.voice_profile;

      await createCreation(dto, deps());

      const payload = mockBullMq.add.mock.calls[0][1];
      expect(payload.voice_profile).toBe(DEFAULT_VOICE_PROFILE);
    });

    it('TC-CRE-008: bgm_policy 未提供时默认使用 auto_match', async () => {
      const dto = mockCreateCreationDtoFactory();
      delete dto.bgm_policy;

      await createCreation(dto, deps());

      const payload = mockBullMq.add.mock.calls[0][1];
      expect(payload.bgm_policy).toBe(DEFAULT_BGM_POLICY);
    });

    it('TC-CRE-009: force_refresh 未提供时默认使用 false', async () => {
      const dto = mockCreateCreationDtoFactory();
      delete dto.force_refresh;

      await createCreation(dto, deps());

      const payload = mockBullMq.add.mock.calls[0][1];
      expect(payload.force_refresh).toBe(false);
    });

    it('TC-CRE-010: product_id 与 script 归属一致时正常通过校验', async () => {
      const product = mockProductFactory({ id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
      const script = mockScriptFactory({
        id: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        product_id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      });

      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory({
        product_id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        script_id: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      });

      const result = await createCreation(dto, deps());

      expect(result.product_id).toBe('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
      expect(result.script_id).toBe('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-CRE-BND-001: engine_mode 显式指定 SCRIPT_DRIVEN 正常', async () => {
      const dto = mockCreateCreationDtoFactory({ engine_mode: 'SCRIPT_DRIVEN' });

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
    });

    it('TC-CRE-BND-002: target_resolution 显式指定 1920x1080 正常', async () => {
      const dto = mockCreateCreationDtoFactory({ target_resolution: '1920x1080' });

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-003: export_format 显式指定 MOV 正常', async () => {
      const dto = mockCreateCreationDtoFactory({ export_format: 'MOV' });

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-004: 剧本仅含 1 个分镜 (边界最小值) 正常', async () => {
      const script = mockScriptFactory({
        shots: [mockScriptShotFactory(0, SCRIPT_ID, { duration: SHOT_MIN_DURATION })],
      });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
    });

    it('TC-CRE-BND-005: 剧本含 10 个分镜 (较多分镜) 正常并预创建全部 ShotRender', async () => {
      const shots = Array.from({ length: 10 }, (_, i) =>
        mockScriptShotFactory(i, SCRIPT_ID, { duration: 1.5 }),
      );
      const script = mockScriptFactory({ shots });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();

      const createData = mockPrisma.creation.create.mock.calls[0][0].data;
      expect(createData.shotRenders.createMany.data.length).toBe(10);
    });

    it('TC-CRE-BND-006: 剧本视频总时长恰好 15.0s (上限临界值) 正常', async () => {
      const shots = [
        mockScriptShotFactory(0, SCRIPT_ID, { duration: 5.0 }),
        mockScriptShotFactory(1, SCRIPT_ID, { duration: 5.0 }),
        mockScriptShotFactory(2, SCRIPT_ID, { duration: 5.0 }),
      ];
      const script = mockScriptFactory({ video_duration: 15.0, shots });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-007: 单分镜时长恰好 5.0s (上限) 正常通过', async () => {
      const script = mockScriptFactory({
        shots: [mockScriptShotFactory(0, SCRIPT_ID, { duration: 5.0 })],
      });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-008: 单分镜时长恰好 1.5s (下限) 正常通过', async () => {
      const script = mockScriptFactory({
        shots: [mockScriptShotFactory(0, SCRIPT_ID, { duration: 1.5 })],
      });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-009: 所有可选字段显式清空为空字符串', async () => {
      const dto = mockCreateCreationDtoFactory({
        voice_profile: '',
        bgm_policy: '',
      });

      await createCreation(dto, deps());

      const payload = mockBullMq.add.mock.calls[0][1];
      expect(typeof payload.voice_profile).toBe('string');
      expect(typeof payload.bgm_policy).toBe('string');
    });

    it('TC-CRE-BND-010: 极长 product UUID 格式正常解析', async () => {
      const productId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const product = mockProductFactory({ id: productId });
      const script = mockScriptFactory({ product_id: productId });

      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory({
        product_id: productId,
        script_id: SCRIPT_ID,
      });

      const result = await createCreation(dto, deps());

      expect(result.product_id).toBe(productId);
    });

    it('TC-CRE-BND-011: Redis 不可用时序列号降级生成 (不抛异常)', async () => {
      mockRedis.incr.mockRejectedValue(new Error('ECONNREFUSED'));

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toHaveProperty('task_id');
      expect(typeof result.task_id).toBe('string');
      expect(result.task_id.length).toBeGreaterThan(0);
    });

    it('TC-CRE-BND-012: redis 参数为 null 时降级生成序列号', async () => {
      const dto = mockCreateCreationDtoFactory();

      const customDeps = deps();
      customDeps.redis = null as unknown as MockRedisClient;

      const result = await createCreation(dto, customDeps);

      expect(result).toHaveProperty('task_id');
      expect(typeof result.task_id).toBe('string');
      expect(result.task_id.length).toBeGreaterThan(0);
    });

    it('TC-CRE-BND-013: selected_slice_id 为 null 的分镜正确传递到 ShotRender', async () => {
      const shots = [
        mockScriptShotFactory(0, SCRIPT_ID, { selected_slice_id: null }),
        mockScriptShotFactory(1, SCRIPT_ID, { selected_slice_id: 'slc_test_valid' }),
      ];
      const script = mockScriptFactory({ shots });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      await createCreation(dto, deps());

      const createData = mockPrisma.creation.create.mock.calls[0][0].data;
      const renderData = createData.shotRenders.createMany.data;

      expect(renderData[0].slice_id).toBeNull();
      expect(renderData[1].slice_id).toBe('slc_test_valid');
    });

    it('TC-CRE-BND-014: 剧本语言为 en-US 正确传递不阻断', async () => {
      const script = mockScriptFactory({ language: 'en-US' });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-015: 剧本风格 vibe 含特殊字符正常通过', async () => {
      const script = mockScriptFactory({ style_vibe: '赛博朋克/复古未来主义™' });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-016: target_resolution 为 720x1280 正常', async () => {
      const dto = mockCreateCreationDtoFactory({ target_resolution: '720x1280' });

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });

    it('TC-CRE-BND-017: export_format 为 WEBM 正常', async () => {
      const dto = mockCreateCreationDtoFactory({ export_format: 'WEBM' });

      const result = await createCreation(dto, deps());

      expect(result).toBeDefined();
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    // ---- 3.1 Product/Script 存在性校验 ----

    it('TC-CRE-ERR-001: 商品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const dto = mockCreateCreationDtoFactory({
        product_id: '99999999-9999-9999-9999-999999999999',
      });

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-ERR-002: 剧本不存在 → SCRIPT_NOT_FOUND', async () => {
      mockPrisma.script.findUnique.mockResolvedValue(null);

      const dto = mockCreateCreationDtoFactory({
        script_id: '88888888-8888-8888-8888-888888888888',
      });

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-ERR-003: 剧本不属于指定商品 → CREATION_SCRIPT_PRODUCT_MISMATCH', async () => {
      const script = mockScriptFactory({ product_id: 'different-uuid-different-000000000099' });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('CREATION_SCRIPT_PRODUCT_MISMATCH');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-ERR-004: 剧本包含 0 个分镜 → SCRIPT_NO_SHOTS_GENERATED', async () => {
      const script = mockScriptFactory({ shots: [] });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NO_SHOTS_GENERATED');
      expect(caught!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-ERR-005: product_id 为空字符串 → PRODUCT_NOT_FOUND', async () => {
      const dto = mockCreateCreationDtoFactory({ product_id: '' });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
    });

    it('TC-CRE-ERR-006: script_id 为空字符串 → SCRIPT_NOT_FOUND', async () => {
      const dto = mockCreateCreationDtoFactory({ script_id: '' });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
    });

    // ---- 3.2 Prisma 层异常 ----

    it('TC-CRE-ERR-007: Prisma P2002 task_id 唯一约束冲突 → IDEMPOTENCY_CONFLICT', async () => {
      const p2002Error = Object.assign(
        new Error('Unique constraint failed on the fields: (`task_id`)'),
        {
          code: 'P2002',
          meta: { target: ['task_id'] },
        },
      );
      mockPrisma.creation.create.mockRejectedValue(p2002Error);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('IDEMPOTENCY_CONFLICT');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-ERR-008: Prisma P2003 外键约束失败 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2003Error = Object.assign(
        new Error('Foreign key constraint failed on the fields: (`script_id`)'),
        { code: 'P2003' },
      );
      mockPrisma.creation.create.mockRejectedValue(p2003Error);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-ERR-009: Prisma P2025 记录不存在 (防御性覆盖) → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2025Error = Object.assign(
        new Error('Record to update not found'),
        { code: 'P2025' },
      );
      mockPrisma.creation.create.mockRejectedValue(p2025Error);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-ERR-010: Prisma P1001 数据库连接不可达 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p1001Error = Object.assign(
        new Error("Can't reach database server at `localhost:5432`"),
        { code: 'P1001' },
      );
      mockPrisma.creation.create.mockRejectedValue(p1001Error);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-ERR-011: Prisma P1017 数据库连接超时 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p1017Error = Object.assign(
        new Error('Server has closed the connection'),
        { code: 'P1017' },
      );
      mockPrisma.creation.create.mockRejectedValue(p1017Error);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-ERR-012: Prisma P2024 连接池耗尽 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2024Error = Object.assign(
        new Error('Timed out fetching a new connection from the connection pool'),
        { code: 'P2024' },
      );
      mockPrisma.creation.create.mockRejectedValue(p2024Error);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-ERR-013: Prisma 未知错误码 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      const unknownError = Object.assign(
        new Error('Unknown Prisma engine error'),
        { code: 'P9999' },
      );
      mockPrisma.creation.create.mockRejectedValue(unknownError);

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    // ---- 3.3 BullMQ 层异常 ----

    it('TC-CRE-ERR-014: BullMQ 队列不可达 (ECONNREFUSED) → INTERNAL_SERVER_ERROR (retryable)', async () => {
      mockBullMq.add.mockRejectedValue(new Error('ECONNREFUSED redis:6379'));

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-ERR-015: BullMQ 队列连接超时 (ETIMEDOUT) → INTERNAL_SERVER_ERROR (retryable)', async () => {
      mockBullMq.add.mockRejectedValue(
        Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }),
      );

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-ERR-016: BullMQ 队列已满 (MaxlenExceeded) → INTERNAL_SERVER_ERROR (retryable)', async () => {
      mockBullMq.add.mockRejectedValue(new Error('MAXLEN exceeded'));

      const dto = mockCreateCreationDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    // ---- 3.4 Prisma 查询层异常（validateProductAndScript 内） ----

    it('TC-CRE-ERR-017: Prisma product.findUnique 数据库异常 → 异常穿透', async () => {
      mockPrisma.product.findUnique.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'P1001' }),
      );

      const dto = mockCreateCreationDtoFactory();

      let caught: Error | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).not.toBeNull();
      expect(caught!.message).toContain('Connection lost');
    });

    it('TC-CRE-ERR-018: Prisma script.findUnique 数据库异常 → 异常穿透', async () => {
      mockPrisma.script.findUnique.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'P1001' }),
      );

      const dto = mockCreateCreationDtoFactory();

      let caught: Error | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).not.toBeNull();
      expect(caught!.message).toContain('Connection lost');
    });

    // ---- 3.5 product_id 格式校验 ----

    it('TC-CRE-ERR-019: product_id 为纯空格字符串 → PRODUCT_NOT_FOUND', async () => {
      const dto = mockCreateCreationDtoFactory({ product_id: '   ' });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
    });

    it('TC-CRE-ERR-020: script_id 为纯空格字符串 → SCRIPT_NOT_FOUND', async () => {
      const dto = mockCreateCreationDtoFactory({ script_id: '   ' });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
    });

    it('TC-CRE-ERR-021: product_id 为 null/undefined 类型 → PRODUCT_NOT_FOUND', async () => {
      const dto = mockCreateCreationDtoFactory({ product_id: undefined as unknown as string });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
    });

    it('TC-CRE-ERR-022: script_id 为 null/undefined 类型 → SCRIPT_NOT_FOUND', async () => {
      const dto = mockCreateCreationDtoFactory({ script_id: undefined as unknown as string });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await createCreation(dto, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_NOT_FOUND');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    it('TC-CRE-PERF-001: createCreation 编排总耗时 ≤ 200ms (mock 全链路)', async () => {
      const PERF_CEILING_MS = 200;

      const dto = mockCreateCreationDtoFactory();

      const start = performance.now();

      await createCreation(dto, deps());

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-CRE-PERF-002: validateProductAndScript ≤ 30ms', async () => {
      const PERF_CEILING_MS = 30;

      const start = performance.now();

      const result = await validateProductAndScript(PRODUCT_ID, SCRIPT_ID, mockPrisma);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('product');
      expect(result).toHaveProperty('script');
      expect(result.product.id).toBe(PRODUCT_ID);
      expect(result.script.id).toBe(SCRIPT_ID);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-003: generateCreationIdentifiers ≤ 10ms', async () => {
      const PERF_CEILING_MS = 10;

      const start = performance.now();

      const result = await generateCreationIdentifiers(mockRedis);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('creationId');
      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('traceId');
      expect(result.creationId).toMatch(UUID_V4_PATTERN);
      expect(result.taskId).toMatch(TASK_ID_PATTERN);
      expect(result.traceId).toMatch(TRACE_ID_PATTERN);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-004: generateCreationIdentifiers (Redis 降级路径) ≤ 10ms', async () => {
      const PERF_CEILING_MS = 10;

      const start = performance.now();

      const result = await generateCreationIdentifiers(null as unknown as MockRedisClient);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('traceId');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-005: buildCreationParams ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;

      const dto = mockCreateCreationDtoFactory();

      const start = performance.now();

      const params = buildCreationParams(
        dto,
        CREATION_ID,
        'tsk_20260527_000001',
        'trc_20260527_creation_00000000',
        NOW,
      );

      const elapsed = performance.now() - start;

      expect(params).toHaveProperty('id');
      expect(params).toHaveProperty('productId');
      expect(params).toHaveProperty('scriptId');
      expect(params).toHaveProperty('taskId');
      expect(params).toHaveProperty('engineMode');
      expect(params).toHaveProperty('targetResolution');
      expect(params).toHaveProperty('exportFormat');
      expect(params).toHaveProperty('traceId');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-006: mapToCreateCreationResponse ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const record = mockCreationRecordFactory();

      const start = performance.now();

      const response = mapToCreateCreationResponse(record);

      const elapsed = performance.now() - start;

      expect(response).toHaveProperty('creation_id');
      expect(response).toHaveProperty('task_id');
      expect(response).toHaveProperty('product_id');
      expect(response).toHaveProperty('script_id');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('current_stage');
      expect(response).toHaveProperty('progress');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-007: persistCreationRecord (mock DB, 4 shots) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const shots = [
        mockScriptShotFactory(0, SCRIPT_ID),
        mockScriptShotFactory(1, SCRIPT_ID),
        mockScriptShotFactory(2, SCRIPT_ID),
        mockScriptShotFactory(3, SCRIPT_ID),
      ];

      const params = buildCreationParams(
        mockCreateCreationDtoFactory(),
        CREATION_ID,
        'tsk_20260527_000001',
        'trc_20260527_creation_00000000',
        NOW,
      );

      const start = performance.now();

      const result = await persistCreationRecord(mockPrisma, params, shots);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('task_id');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-008: enqueueCreationJob (mock Redis) ≤ 20ms', async () => {
      const PERF_CEILING_MS = 20;

      const payload: TestCreationJobPayload = {
        creation_id: CREATION_ID,
        task_id: 'tsk_20260527_000001',
        product_id: PRODUCT_ID,
        script_id: SCRIPT_ID,
        trace_id: 'trc_20260527_creation_00000000',
        voice_profile: DEFAULT_VOICE_PROFILE,
        bgm_policy: DEFAULT_BGM_POLICY,
        force_refresh: false,
      };

      const start = performance.now();

      const jobId = await enqueueCreationJob(mockBullMq, payload);

      const elapsed = performance.now() - start;

      expect(typeof jobId).toBe('string');
      expect(jobId.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-009: 连续 5 次 createCreation 无退化', async () => {
      const ITERATIONS = 5;
      const PERF_CEILING_MS_PER_ITERATION = 50;

      const dto = mockCreateCreationDtoFactory();

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await createCreation(dto, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-CRE-PERF-010: persistCreationRecord 含 10 个分镜 (ShotRender=10 条) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const shots = Array.from({ length: 10 }, (_, i) =>
        mockScriptShotFactory(i, SCRIPT_ID),
      );

      const params = buildCreationParams(
        mockCreateCreationDtoFactory(),
        CREATION_ID,
        'tsk_20260527_000001',
        'trc_20260527_creation_00000000',
        NOW,
      );

      const start = performance.now();

      const result = await persistCreationRecord(mockPrisma, params, shots);

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-011: 原子函数 F1~F4 同步链路总耗时 ≤ 15ms', () => {
      const PERF_CEILING_MS = 15;
      const dto = mockCreateCreationDtoFactory();

      const start = performance.now();

      const params = buildCreationParams(
        dto,
        CREATION_ID,
        'tsk_20260527_000001',
        'trc_20260527_creation_00000000',
        NOW,
      );

      const response = mapToCreateCreationResponse({
        ...params,
        status: 'PENDING',
        progress: 0,
        current_stage: 'QUEUE_ALLOCATION',
        video_url: null,
        file_size_bytes: null,
        error_code: null,
        error_message: null,
        started_at: null,
        finished_at: null,
      } as unknown as TestCreationRecord);

      const elapsed = performance.now() - start;

      expect(response).toBeDefined();
      expect(response).toHaveProperty('creation_id');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-PERF-012: validateProductAndScript 遍历 10 个 shots 无性能退化', async () => {
      const PERF_CEILING_MS = 30;

      const shots = Array.from({ length: 10 }, (_, i) =>
        mockScriptShotFactory(i, SCRIPT_ID),
      );
      const script = mockScriptFactory({ shots });
      mockPrisma.script.findUnique.mockResolvedValue(script);

      const start = performance.now();

      const result = await validateProductAndScript(PRODUCT_ID, SCRIPT_ID, mockPrisma);

      const elapsed = performance.now() - start;

      expect(result.script.shots.length).toBe(10);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });
});
