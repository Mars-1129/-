// =============================================================================
// TikStream AI — Creation Cancel 自动化测试基座
// 对应功能: POST /api/v1/creations/:creation_id/cancel (主动取消创作任务)
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

interface TestCancelCreationRecord {
  id: string;
  task_id: string;
  status: CreationStatus;
  current_stage: CreationStage;
  finished_at: Date;
}

interface TestCancelCreationResponse {
  creation_id: string;
  status: 'CANCELED';
}

type MockPrismaClient = {
  creation: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

type MockBullMqJob = {
  remove: jest.Mock;
};

type MockBullMqQueue = {
  remove: jest.Mock;
  getJob: jest.Mock;
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-27T12:00:00Z');
const CREATION_ID = '00000000-0000-4000-a000-000000000100';
const PRODUCT_ID = '00000000-0000-4000-a000-000000000001';
const SCRIPT_ID = '00000000-0000-4000-a000-000000000050';
const TASK_ID = 'tsk_20260527_000001';
const TRACE_ID = 'trc_20260527_creation_00000000';

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

const CANCELABLE_STATUSES: CreationStatus[] = ['PENDING', 'PROCESSING'];
const NON_CANCELABLE_STATUSES: CreationStatus[] = ['FINISHED', 'FAILED', 'CANCELED'];

const NON_CANCELABLE_REASONS: Record<string, string> = {
  FINISHED: '创作任务已完成，无法取消',
  FAILED: '创作任务已失败，无需取消，请使用重试接口',
  CANCELED: '创作任务已经被取消，无需重复操作',
};

const SCRIPT_SHOT_ID_0 = 'shot-uuid-000';
const SCRIPT_SHOT_ID_1 = 'shot-uuid-001';
const SCRIPT_SHOT_ID_2 = 'shot-uuid-002';
const SCRIPT_SHOT_ID_3 = 'shot-uuid-003';

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
  retry_count: 0,
  status: index < 2 ? 'FINISHED' : 'PROCESSING',
  error_message: null,
  created_at: new Date(NOW.getTime() + index * 60000),
  updated_at: new Date(NOW.getTime() + index * 30000),
  ...overrides,
});

const mockCreationRecordFactory = (overrides?: Partial<TestCreationRecord>): TestCreationRecord => ({
  id: CREATION_ID,
  product_id: PRODUCT_ID,
  script_id: SCRIPT_ID,
  task_id: TASK_ID,
  engine_mode: 'SCRIPT_DRIVEN',
  target_resolution: '1080x1920',
  export_format: 'MP4',
  status: 'PROCESSING',
  progress: 45,
  current_stage: 'AI_VIDEO_GENERATING',
  video_url: null,
  file_size_bytes: null,
  trace_id: TRACE_ID,
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

const mockCreationPendingFactory = (): TestCreationRecord =>
  mockCreationRecordFactory({
    status: 'PENDING',
    progress: 0,
    current_stage: 'QUEUE_ALLOCATION',
    started_at: null,
  });

const mockCreationProcessingFactory = (): TestCreationRecord =>
  mockCreationRecordFactory({
    status: 'PROCESSING',
    progress: 45,
    current_stage: 'AI_VIDEO_GENERATING',
    started_at: new Date(NOW.getTime() - 3600000),
  });

const mockCreationFinishedFactory = (): TestCreationRecord =>
  mockCreationRecordFactory({
    status: 'FINISHED',
    progress: 100,
    current_stage: 'FINISHED',
    video_url: 's3://tikstream/exports/tsk_20260527_000001.mp4',
    file_size_bytes: BigInt(25 * 1024 * 1024),
    finished_at: NOW,
  });

const mockCreationFailedFactory = (): TestCreationRecord =>
  mockCreationRecordFactory({
    status: 'FAILED',
    progress: 45,
    current_stage: 'FAILED',
    error_code: 'GPU_SLICING_DECORD_FAILED',
    error_message: 'Decord failed to load video: corrupted header at frame 120',
    finished_at: new Date(NOW.getTime() - 1800000),
  });

const mockCreationCanceledFactory = (): TestCreationRecord =>
  mockCreationRecordFactory({
    status: 'CANCELED',
    progress: 30,
    current_stage: 'FAILED',
    finished_at: new Date(NOW.getTime() - 600000),
  });

const mockCancelCreationRecordFactory = (overrides?: Partial<TestCancelCreationRecord>): TestCancelCreationRecord => ({
  id: CREATION_ID,
  task_id: TASK_ID,
  status: 'CANCELED',
  current_stage: 'FAILED',
  finished_at: NOW,
  ...overrides,
});

const mockPrismaClientFactory = (): MockPrismaClient => ({
  creation: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
});

const mockBullMqJobFactory = (overrides?: Partial<MockBullMqJob>): MockBullMqJob => ({
  remove: jest.fn(),
  ...overrides,
});

const mockBullMqQueueFactory = (): MockBullMqQueue => ({
  remove: jest.fn(),
  getJob: jest.fn(),
});

// ============================================================
// 测试套件入口
// ============================================================

describe('CreationCancel — 主动取消创作任务 (POST /api/v1/creations/:creation_id/cancel)', () => {
  let mockPrisma: MockPrismaClient;
  let mockBullMq: MockBullMqQueue;

  // ---- 原子函数类型声明 ----

  type ValidateCreationIdFn = (creationId: string) => void;

  type FindCreationByIdFn = (
    prisma: MockPrismaClient,
    creationId: string,
  ) => Promise<TestCreationRecord | null>;

  type ValidateCreationCancelableFn = (status: CreationStatus) => void;

  type CancelCreationByIdFn = (
    prisma: MockPrismaClient,
    creationId: string,
  ) => Promise<TestCancelCreationRecord>;

  type CancelCreationFn = (
    creationId: string,
    deps: {
      prisma: MockPrismaClient;
      bullMq: MockBullMqQueue;
      atoms: {
        validateCreationId: ValidateCreationIdFn;
        findCreationById: FindCreationByIdFn;
        validateCreationCancelable: ValidateCreationCancelableFn;
        cancelCreationById: CancelCreationByIdFn;
      };
    },
  ) => Promise<TestCancelCreationResponse>;

  // ---- 原子函数实例 ----
  let validateCreationId: ValidateCreationIdFn;
  let findCreationById: FindCreationByIdFn;
  let validateCreationCancelable: ValidateCreationCancelableFn;
  let cancelCreationById: CancelCreationByIdFn;
  let cancelCreation: CancelCreationFn;

  beforeAll(() => {
    // ===================================================================
    // H2: validateCreationId (复用 task-024 实现)
    // 职责: 非空 + 非纯空白 + UUID v4 格式严格校验
    // ===================================================================

    validateCreationId = (creationId) => {
      if (!creationId || (typeof creationId === 'string' && creationId.trim().length === 0)) {
        throw Object.assign(
          new Error('创作任务ID无效'),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: [{ field: 'creation_id', reason: 'creation_id 为必填字段，不能为空' }],
          },
        );
      }

      const trimmed = typeof creationId === 'string' ? creationId.trim() : creationId;

      if (!UUID_V4_REGEX.test(trimmed)) {
        throw Object.assign(
          new Error(`创作任务ID不是有效的UUID v4格式: ${creationId}`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: [{
              field: 'creation_id',
              reason: `creation_id 不是有效的 UUID v4 格式: ${creationId}`,
            }],
          },
        );
      }
    };

    // ===================================================================
    // H0: findCreationById (复用 task-024 实现, in-memory mock)
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
    // H3: validateCreationCancelable — 纯函数状态校验
    // 职责: 判断 Creation status 是否允许取消 (仅 PENDING/PROCESSING)
    // ===================================================================

    validateCreationCancelable = (status) => {
      if (status === 'CANCELED') {
        throw Object.assign(
          new Error(NON_CANCELABLE_REASONS.CANCELED),
          {
            errorCode: 'TASK_STATUS_CONFLICT',
            statusCode: HttpStatus.CONFLICT,
            retryable: false,
            details: {
              creation_status: 'CANCELED',
              reason: 'already_canceled',
            },
          },
        );
      }

      if (status === 'FINISHED') {
        throw Object.assign(
          new Error(NON_CANCELABLE_REASONS.FINISHED),
          {
            errorCode: 'TASK_STATUS_CONFLICT',
            statusCode: HttpStatus.CONFLICT,
            retryable: false,
            details: {
              creation_status: 'FINISHED',
              reason: 'already_finished',
            },
          },
        );
      }

      if (status === 'FAILED') {
        throw Object.assign(
          new Error(NON_CANCELABLE_REASONS.FAILED),
          {
            errorCode: 'TASK_STATUS_CONFLICT',
            statusCode: HttpStatus.CONFLICT,
            retryable: false,
            details: {
              creation_status: 'FAILED',
              reason: 'already_failed',
            },
          },
        );
      }

      if (!CANCELABLE_STATUSES.includes(status)) {
        throw Object.assign(
          new Error(`创作任务状态 ${status} 不允许取消`),
          {
            errorCode: 'TASK_STATUS_CONFLICT',
            statusCode: HttpStatus.CONFLICT,
            retryable: false,
            details: {
              creation_status: status,
              reason: 'unknown_status',
            },
          },
        );
      }
    };

    // ===================================================================
    // J0: cancelCreationById — Repository 原子操作
    // 职责: Prisma update: status=CANCELED + currentStage=FAILED + finishedAt=now
    // ===================================================================

    cancelCreationById = async (prisma, creationId) => {
      try {
        const updated = await prisma.creation.update({
          where: { id: creationId },
          data: {
            status: 'CANCELED',
            current_stage: 'FAILED',
            finished_at: new Date(),
          },
          select: { id: true, task_id: true, status: true, current_stage: true, finished_at: true },
        });

        return {
          id: updated.id,
          task_id: updated.task_id,
          status: updated.status as CreationStatus,
          current_stage: updated.current_stage as CreationStage,
          finished_at: updated.finished_at,
        };
      } catch (error) {
        const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> };
        const retryableCodes = new Set(['P1001', 'P1017', 'P2024', 'P2028', 'INIT_ERROR', 'RUST_PANIC']);
        const isRetryable = retryableCodes.has(prismaError.code ?? '');

        throw Object.assign(
          new Error(`取消创作任务失败: ${prismaError.message}`),
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
    // F8: cancelCreation (主编排器)
    // 编排流程:
    //   Step1: validateCreationId
    //   Step2: findCreationById
    //   Step3: validateCreationCancelable
    //   Step4: cancelCreationById (DB update)
    //   Step5: BullMQ removeJob [最佳努力, 失败不抛异常]
    //   Step6: return CancelCreationResponse
    // ===================================================================

    cancelCreation = async (creationId, deps) => {
      const { prisma, bullMq, atoms } = deps;

      atoms.validateCreationId(creationId);

      const record = await atoms.findCreationById(prisma, creationId);

      if (!record) {
        throw Object.assign(
          new Error(`创作任务不存在 (creation_id=${creationId})`),
          {
            errorCode: 'CREATION_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
            retryable: false,
            details: { creation_id: creationId },
          },
        );
      }

      atoms.validateCreationCancelable(record.status);

      const canceled = await atoms.cancelCreationById(prisma, creationId);

      try {
        const removedCount = await bullMq.remove(record.task_id);
        if (removedCount === 0) {
          const job = await bullMq.getJob(record.task_id);
          if (job) {
            await job.remove();
          }
        }
      } catch {
        // 最佳努力: BullMQ 移除失败不影响主流程
      }

      return {
        creation_id: canceled.id,
        status: 'CANCELED',
      };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();
    mockBullMq = mockBullMqQueueFactory();

    const defaultRecord = mockCreationProcessingFactory();
    mockPrisma.creation.findUnique.mockResolvedValue(defaultRecord);

    const canceledRecord = mockCancelCreationRecordFactory();
    mockPrisma.creation.update.mockResolvedValue(canceledRecord);

    mockBullMq.remove.mockResolvedValue(1);
    mockBullMq.getJob.mockResolvedValue(null);
  });

  const deps = () => ({
    prisma: mockPrisma,
    bullMq: mockBullMq,
    atoms: {
      validateCreationId,
      findCreationById,
      validateCreationCancelable,
      cancelCreationById,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法 creation_id + 可取消状态 → 成功取消', () => {
    it('TC-CRE-CANCEL-001: 取消 PENDING 状态任务 — 返回 creation_id + status=CANCELED', async () => {
      const pendingRecord = mockCreationPendingFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(pendingRecord);

      const canceledRecord = mockCancelCreationRecordFactory({ status: 'CANCELED', current_stage: 'FAILED' });
      mockPrisma.creation.update.mockResolvedValue(canceledRecord);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('creation_id');
      expect(typeof result.creation_id).toBe('string');
      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.creation_id).toMatch(UUID_V4_REGEX);

      expect(result).toHaveProperty('status');
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-002: 取消 PROCESSING 状态任务 — 返回 status=CANCELED', async () => {
      const result = await cancelCreation(CREATION_ID, deps());

      expect(result).toBeDefined();
      expect(result.status).toBe('CANCELED');
      expect(result.creation_id).toBe(CREATION_ID);
    });

    it('TC-CRE-CANCEL-003: Prisma update 被调用且传入了正确的 status/current_stage/finished_at', async () => {
      const beforeCall = Date.now();

      await cancelCreation(CREATION_ID, deps());

      expect(mockPrisma.creation.update).toHaveBeenCalledTimes(1);

      const updateCall = mockPrisma.creation.update.mock.calls[0][0];
      expect(updateCall).toHaveProperty('where');
      expect(updateCall.where).toEqual({ id: CREATION_ID });

      expect(updateCall).toHaveProperty('data');
      expect(updateCall.data).toHaveProperty('status', 'CANCELED');
      expect(updateCall.data).toHaveProperty('current_stage', 'FAILED');
      expect(updateCall.data).toHaveProperty('finished_at');

      const finishedAt = updateCall.data.finished_at;
      expect(finishedAt).toBeInstanceOf(Date);
      expect(finishedAt.getTime()).toBeGreaterThanOrEqual(beforeCall);
      expect(finishedAt.getTime()).toBeLessThanOrEqual(Date.now() + 5000);
    });

    it('TC-CRE-CANCEL-004: Prisma update 不操作 error_code 和 error_message 字段', async () => {
      await cancelCreation(CREATION_ID, deps());

      const updateCall = mockPrisma.creation.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('error_code');
      expect(updateCall.data).not.toHaveProperty('error_message');
    });

    it('TC-CRE-CANCEL-005: BullMQ remove 以正确 task_id 调用', async () => {
      await cancelCreation(CREATION_ID, deps());

      expect(mockBullMq.remove).toHaveBeenCalledTimes(1);
      expect(mockBullMq.remove).toHaveBeenCalledWith(TASK_ID);
    });

    it('TC-CRE-CANCEL-006: Prisma findUnique 先于 update 被调用 (执行顺序)', async () => {
      const callOrder: string[] = [];

      mockPrisma.creation.findUnique.mockImplementation(async () => {
        callOrder.push('findUnique');
        return mockCreationProcessingFactory();
      });

      mockPrisma.creation.update.mockImplementation(async () => {
        callOrder.push('update');
        return mockCancelCreationRecordFactory();
      });

      await cancelCreation(CREATION_ID, deps());

      expect(callOrder).toEqual(['findUnique', 'update']);
    });

    it('TC-CRE-CANCEL-007: cancelCreation 响应对象仅含 creation_id 和 status 两个字段', async () => {
      const result = await cancelCreation(CREATION_ID, deps());

      const keys = Object.keys(result);
      expect(keys).toHaveLength(2);
      expect(keys).toContain('creation_id');
      expect(keys).toContain('status');
    });

    it('TC-CRE-CANCEL-008: 取消后 current_stage 更新为 FAILED', async () => {
      await cancelCreation(CREATION_ID, deps());

      const updateCall = mockPrisma.creation.update.mock.calls[0][0];
      expect(updateCall.data.current_stage).toBe('FAILED');
    });

    it('TC-CRE-CANCEL-009: response 与 api_types.ts ApiRouteMap 契约一致', async () => {
      const result = await cancelCreation(CREATION_ID, deps());

      expect(result).toEqual({
        creation_id: CREATION_ID,
        status: 'CANCELED',
      });

      expect(typeof result.creation_id).toBe('string');
      expect(result.status).toBe('CANCELED');
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-CRE-CANCEL-BND-001: creation_id 首尾含空格 → trim 后校验通过', async () => {
      const result = await cancelCreation(`  ${CREATION_ID}  `, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-BND-002: creation_id 全大写 UUID → 大小写不敏感校验通过', async () => {
      const upperId = '00000000-0000-4000-A000-000000000100'.toUpperCase();
      const upperRecord = mockCreationProcessingFactory();
      upperRecord.id = upperId;
      mockPrisma.creation.findUnique.mockResolvedValue(upperRecord);

      const canceledRecord = mockCancelCreationRecordFactory({ id: upperId });
      mockPrisma.creation.update.mockResolvedValue(canceledRecord);

      const result = await cancelCreation(upperId, deps());

      expect(result.creation_id).toBe(upperId);
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-BND-003: creation_id 混合大小写 → 校验通过', async () => {
      const mixedId = '00000000-0000-4000-A000-000000000100';
      const mixedRecord = mockCreationProcessingFactory();
      mixedRecord.id = mixedId;
      mockPrisma.creation.findUnique.mockResolvedValue(mixedRecord);

      const canceledRecord = mockCancelCreationRecordFactory({ id: mixedId });
      mockPrisma.creation.update.mockResolvedValue(canceledRecord);

      const result = await cancelCreation(mixedId, deps());

      expect(result.creation_id).toBe(mixedId);
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-BND-004: BullMQ remove 返回 0 (任务已不在队列) → 不影响取消成功', async () => {
      mockBullMq.remove.mockResolvedValue(0);
      mockBullMq.getJob.mockResolvedValue(null);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
      expect(mockBullMq.remove).toHaveBeenCalledTimes(1);
    });

    it('TC-CRE-CANCEL-BND-005: BullMQ remove 返回 0 但 getJob 找到活跃 job → 调用 job.remove()', async () => {
      mockBullMq.remove.mockResolvedValue(0);
      const activeJob = mockBullMqJobFactory();
      activeJob.remove.mockResolvedValue(undefined);
      mockBullMq.getJob.mockResolvedValue(activeJob);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
      expect(mockBullMq.remove).toHaveBeenCalledTimes(1);
      expect(mockBullMq.getJob).toHaveBeenCalledTimes(1);
      expect(mockBullMq.getJob).toHaveBeenCalledWith(TASK_ID);
      expect(activeJob.remove).toHaveBeenCalledTimes(1);
    });

    it('TC-CRE-CANCEL-BND-006: BullMQ remove 抛出异常 → 不影响取消成功 (DB 已更新为 CANCELED)', async () => {
      mockBullMq.remove.mockRejectedValue(new Error('ECONNREFUSED redis:6379'));
      mockBullMq.getJob.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
      expect(mockPrisma.creation.update).toHaveBeenCalledTimes(1);
    });

    it('TC-CRE-CANCEL-BND-007: task_id 含特殊字符的 Creation 正常取消', async () => {
      const specialTaskId = 'tsk_20260527_abc123xyz9';
      const specialRecord = mockCreationProcessingFactory();
      specialRecord.task_id = specialTaskId;
      mockPrisma.creation.findUnique.mockResolvedValue(specialRecord);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(mockBullMq.remove).toHaveBeenCalledWith(specialTaskId);
      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-BND-008: PENDING 状态且 progress=0 正常取消', async () => {
      const pendingRecord = mockCreationPendingFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(pendingRecord);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-BND-009: PROCESSING 状态且 progress=99 正常取消', async () => {
      const nearDoneRecord = mockCreationProcessingFactory();
      nearDoneRecord.progress = 99;
      nearDoneRecord.current_stage = 'LOUDNORM_COMPLIANCE';
      mockPrisma.creation.findUnique.mockResolvedValue(nearDoneRecord);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-BND-010: shot_renders 数组为空不影响取消操作', async () => {
      const emptyShotsRecord = mockCreationProcessingFactory();
      emptyShotsRecord.shot_renders = [];
      mockPrisma.creation.findUnique.mockResolvedValue(emptyShotsRecord);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
    });

    it('TC-CRE-CANCEL-BND-011: shot_renders 数组有 20 个元素不影响取消操作', async () => {
      const manyShotsRecord = mockCreationProcessingFactory();
      manyShotsRecord.shot_renders = Array.from({ length: 20 }, (_, i) =>
        mockShotRenderRecordFactory(i, CREATION_ID),
      );
      mockPrisma.creation.findUnique.mockResolvedValue(manyShotsRecord);

      const result = await cancelCreation(CREATION_ID, deps());

      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    // ---- 3.1 creation_id 格式校验 (INVALID_REQUEST) ----

    it('TC-CRE-CANCEL-ERR-001: creation_id 为空字符串 → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        await cancelCreation('', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details).toBeDefined();
    });

    it('TC-CRE-CANCEL-ERR-002: creation_id 为纯空格字符串 → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation('   ', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-003: creation_id 为 null → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(null as unknown as string, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-004: creation_id 为 undefined → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(undefined as unknown as string, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-005: creation_id 为非 UUID 格式 (纯数字) → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation('12345', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-006: creation_id 为非 UUID 格式 (随机字符串) → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation('hello-world-not-a-uuid', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-007: creation_id 版本位不对 (3 而非 4) → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation('00000000-0000-3000-a000-000000000100', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-008: creation_id 变体位不对 (c 而非 8/9/a/b) → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation('00000000-0000-4000-c000-000000000100', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-009: creation_id 长度不足 (少一位) → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation('00000000-0000-4000-a000-00000000000', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-CANCEL-ERR-010: creation_id 含非法字符 G (> F) → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation('00000000-0000-4000-a000-G00000000100', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    // ---- 3.2 Creation 不存在 (CREATION_NOT_FOUND) ----

    it('TC-CRE-CANCEL-ERR-011: 合法 UUID 但 Creation 不存在 → CREATION_NOT_FOUND 404', async () => {
      mockPrisma.creation.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        await cancelCreation('99999999-9999-4999-a999-999999999999', deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('CREATION_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details).toBeDefined();
      expect((caught!.details as Record<string, unknown>).creation_id).toBe('99999999-9999-4999-a999-999999999999');
    });

    it('TC-CRE-CANCEL-ERR-012: 不存在时不调用 Prisma update', async () => {
      mockPrisma.creation.findUnique.mockResolvedValue(null);

      try {
        await cancelCreation('99999999-9999-4999-a999-999999999999', deps());
      } catch {
        // expected
      }

      expect(mockPrisma.creation.update).not.toHaveBeenCalled();
    });

    it('TC-CRE-CANCEL-ERR-013: 不存在时不调用 BullMQ remove', async () => {
      mockPrisma.creation.findUnique.mockResolvedValue(null);

      try {
        await cancelCreation('99999999-9999-4999-a999-999999999999', deps());
      } catch {
        // expected
      }

      expect(mockBullMq.remove).not.toHaveBeenCalled();
    });

    // ---- 3.3 状态不允许取消 (TASK_STATUS_CONFLICT) ----

    it('TC-CRE-CANCEL-ERR-014: FINISHED 状态 → TASK_STATUS_CONFLICT 409', async () => {
      const finishedRecord = mockCreationFinishedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(finishedRecord);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.retryable).toBe(false);
      expect(caught!.message).toContain('已完成');
      expect((caught!.details as Record<string, unknown>).creation_status).toBe('FINISHED');
      expect((caught!.details as Record<string, unknown>).reason).toBe('already_finished');
    });

    it('TC-CRE-CANCEL-ERR-015: FAILED 状态 → TASK_STATUS_CONFLICT 409', async () => {
      const failedRecord = mockCreationFailedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(failedRecord);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.retryable).toBe(false);
      expect(caught!.message).toContain('请使用重试接口');
      expect((caught!.details as Record<string, unknown>).creation_status).toBe('FAILED');
      expect((caught!.details as Record<string, unknown>).reason).toBe('already_failed');
    });

    it('TC-CRE-CANCEL-ERR-016: 已是 CANCELED 状态 (重复取消) → TASK_STATUS_CONFLICT 409', async () => {
      const canceledRecord = mockCreationCanceledFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(canceledRecord);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.retryable).toBe(false);
      expect(caught!.message).toContain('已经被取消');
      expect((caught!.details as Record<string, unknown>).creation_status).toBe('CANCELED');
      expect((caught!.details as Record<string, unknown>).reason).toBe('already_canceled');
    });

    it('TC-CRE-CANCEL-ERR-017: 状态冲突时不调用 Prisma update', async () => {
      const finishedRecord = mockCreationFinishedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(finishedRecord);

      try {
        await cancelCreation(CREATION_ID, deps());
      } catch {
        // expected
      }

      expect(mockPrisma.creation.update).not.toHaveBeenCalled();
    });

    it('TC-CRE-CANCEL-ERR-018: 状态冲突时不调用 BullMQ remove', async () => {
      const finishedRecord = mockCreationFinishedFactory();
      mockPrisma.creation.findUnique.mockResolvedValue(finishedRecord);

      try {
        await cancelCreation(CREATION_ID, deps());
      } catch {
        // expected
      }

      expect(mockBullMq.remove).not.toHaveBeenCalled();
    });

    // ---- 3.4 Prisma 数据库异常 ----

    it('TC-CRE-CANCEL-ERR-019: Prisma P1001 数据库不可达 (findUnique) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p1001Error = Object.assign(
        new Error("Can't reach database server at `localhost:5432`"),
        { code: 'P1001' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-020: Prisma P1017 连接超时 (findUnique) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p1017Error = Object.assign(
        new Error('Server has closed the connection'),
        { code: 'P1017' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p1017Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-021: Prisma P2024 连接池耗尽 (findUnique) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p2024Error = Object.assign(
        new Error('Timed out fetching a new connection from the connection pool'),
        { code: 'P2024' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-022: Prisma P2028 事务超时 (findUnique) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p2028Error = Object.assign(
        new Error('Transaction API error: Transaction timeout'),
        { code: 'P2028' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(p2028Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-023: Prisma 初始化失败 INIT_ERROR → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const initError = Object.assign(
        new Error('Database initialization failed'),
        { code: 'INIT_ERROR' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(initError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-024: Prisma Rust Panic RUST_PANIC → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const rustPanic = Object.assign(
        new Error('Rust engine panicked'),
        { code: 'RUST_PANIC' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(rustPanic);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-025: Prisma 未知错误码 P9999 → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const unknownError = Object.assign(
        new Error('Unknown Prisma engine error'),
        { code: 'P9999' },
      );
      mockPrisma.creation.findUnique.mockRejectedValue(unknownError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-026: Prisma 原生 Error 无 code → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      mockPrisma.creation.findUnique.mockRejectedValue(new Error('Unexpected native error'));

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    // ---- 3.5 Prisma update 层异常 ----

    it('TC-CRE-CANCEL-ERR-027: Prisma P1001 数据库不可达 (update) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p1001Error = Object.assign(
        new Error("Can't reach database server at `localhost:5432`"),
        { code: 'P1001' },
      );
      mockPrisma.creation.update.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-028: Prisma P2024 连接池耗尽 (update) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p2024Error = Object.assign(
        new Error('Timed out fetching a new connection from the connection pool'),
        { code: 'P2024' },
      );
      mockPrisma.creation.update.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await cancelCreation(CREATION_ID, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-CANCEL-ERR-029: Prisma update 层异常 → 不调用 BullMQ remove', async () => {
      mockPrisma.creation.update.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'P1001' }),
      );

      try {
        await cancelCreation(CREATION_ID, deps());
      } catch {
        // expected
      }

      expect(mockBullMq.remove).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时卡点告警', () => {
    it('TC-CRE-CANCEL-PERF-001: cancelCreation 编排总耗时 ≤ 30ms (mock DB + mock Redis)', async () => {
      const PERF_CEILING_MS = 30;

      const start = performance.now();

      const result = await cancelCreation(CREATION_ID, deps());

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(result.creation_id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-CRE-CANCEL-PERF-002: validateCreationId (纯同步, 合法 UUID) ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      expect(() => validateCreationId(CREATION_ID)).not.toThrow();

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-CANCEL-PERF-003: validateCreationId 失败路径 (提前返回) ≤ 0.5ms', () => {
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

    it('TC-CRE-CANCEL-PERF-004: findCreationById (mock DB, 4 shot_renders) ≤ 15ms', async () => {
      const PERF_CEILING_MS = 15;

      const start = performance.now();

      const result = await findCreationById(mockPrisma, CREATION_ID);

      const elapsed = performance.now() - start;

      expect(result).not.toBeNull();
      expect(result!.id).toBe(CREATION_ID);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-CANCEL-PERF-005: findCreationById 返回 null (不存在) ≤ 10ms', async () => {
      const PERF_CEILING_MS = 10;

      mockPrisma.creation.findUnique.mockResolvedValue(null);

      const start = performance.now();

      const result = await findCreationById(mockPrisma, '99999999-9999-4999-a999-999999999999');

      const elapsed = performance.now() - start;

      expect(result).toBeNull();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-CANCEL-PERF-006: validateCreationCancelable (纯同步, CANCELABLE) ≤ 0.5ms', () => {
      const PERF_CEILING_MS = 0.5;

      const start = performance.now();

      expect(() => validateCreationCancelable('PENDING')).not.toThrow();

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-CANCEL-PERF-007: validateCreationCancelable (纯同步, 失败路径) ≤ 0.5ms', () => {
      const PERF_CEILING_MS = 0.5;

      const start = performance.now();

      try {
        validateCreationCancelable('FINISHED');
      } catch {
        // expected
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-CANCEL-PERF-008: cancelCreationById (mock DB update) ≤ 15ms', async () => {
      const PERF_CEILING_MS = 15;

      const start = performance.now();

      const result = await cancelCreationById(mockPrisma, CREATION_ID);

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(result.id).toBe(CREATION_ID);
      expect(result.status).toBe('CANCELED');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-CANCEL-PERF-009: 连续 5 次 cancelCreation 无性能退化', async () => {
      const ITERATIONS = 5;
      const PERF_CEILING_MS_PER_ITERATION = 15;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await cancelCreation(CREATION_ID, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-CRE-CANCEL-PERF-010: validateCreationId 对合法 UUID 的平均耗时 (100次) ≤ 0.1ms', () => {
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

    it('TC-CRE-CANCEL-PERF-011: cancelCreation 含 BullMQ remove 返回 0 + getJob 找到活跃 job 场景 ≤ 30ms', async () => {
      const PERF_CEILING_MS = 30;

      mockBullMq.remove.mockResolvedValue(0);
      const activeJob = mockBullMqJobFactory();
      activeJob.remove.mockResolvedValue(undefined);
      mockBullMq.getJob.mockResolvedValue(activeJob);

      const start = performance.now();

      const result = await cancelCreation(CREATION_ID, deps());

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(result.status).toBe('CANCELED');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-CANCEL-PERF-012: cancelCreation 含 BullMQ 异常降级路径 ≤ 30ms', async () => {
      const PERF_CEILING_MS = 30;

      mockBullMq.remove.mockRejectedValue(new Error('ECONNREFUSED'));
      mockBullMq.getJob.mockRejectedValue(new Error('ECONNREFUSED'));

      const start = performance.now();

      const result = await cancelCreation(CREATION_ID, deps());

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(result.status).toBe('CANCELED');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });
});
