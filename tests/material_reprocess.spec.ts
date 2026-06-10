// =============================================================================
// TikStream AI — Material Reprocess 自动化测试基座
// 对应功能: POST /api/v1/materials/:material_id/reprocess (素材重新处理 — 重置切片 + 重新入队 GPU Worker)
// 对应模块: Material (人员A) | 测试类型: 单元测试 (Service 层 + Repository 层)
// 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// ============================================================
// 0. 测试专用类型定义
// ============================================================

type MaterialType = 'IMAGE' | 'VIDEO';
type MaterialSourceType = 'UPLOAD' | 'REFERENCE' | 'GENERATED';
type MaterialStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type MaterialSliceStatus = 'PENDING' | 'CAPTIONING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED';
type ReprocessAllowedStatus = 'COMPLETED' | 'FAILED';
type ReprocessDisallowedStatus = 'PENDING' | 'PROCESSING';

interface TestMaterialRow {
  id: string;
  product_id: string;
  file_name: string;
  type: string;
  source_type: string;
  origin_url: string;
  thumbnail_url: string | null;
  file_size_bytes: bigint;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  status: string;
  slices_count: number;
  remark: string | null;
  created_at: Date;
  updated_at: Date;
  slices?: TestSliceRow[];
  product?: TestProductRow | null;
}

interface TestSliceRow {
  id: string;
  material_id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  dense_caption: string | null;
  tags: string[];
  stream_url: string | null;
  key_frame_url: string | null;
  embedding_version: string | null;
  sfx_url: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface TestProductRow {
  id: string;
  title: string;
  sku_code: string;
  category: string;
  selling_points: string[];
  target_audience: string | null;
  scenario_tags: string[];
  text_features: Record<string, unknown>;
  cover_image_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TestEnqueueResult {
  jobId: string;
  taskId: string;
}

interface TestReprocessResponse {
  material_id: string;
  task_id: string;
  status: string;
}

type MockPrismaClient = {
  material: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  materialSlice: {
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type MockGpuQueue = {
  add: jest.Mock;
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-26T12:00:00Z');
const MATERIAL_ID = 'dc52d4ff-0000-4000-a000-000000000010';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const TASK_ID = 'tsk_20260526_000042';
const JOB_ID = '42';
const FALLBACK_TASK_ID = 'tsk_20260526_000000';
const SLICE_ID_1 = 'slc_20260523_000001_001';
const SLICE_ID_2 = 'slc_20260523_000002_002';
const SLICE_ID_3 = 'slc_20260523_000003_003';
const SLICE_ID_4 = 'slc_20260523_000004_004';
const SLICE_ID_5 = 'slc_20260523_000005_005';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_REPROCESS_STATUSES: ReprocessAllowedStatus[] = ['COMPLETED', 'FAILED'];
const DISALLOWED_REPROCESS_STATUSES: ReprocessDisallowedStatus[] = ['PENDING', 'PROCESSING'];

// ============================================================
// Mock Factories
// ============================================================

const mockProductRowFactory = (overrides?: Partial<TestProductRow>): TestProductRow => ({
  id: PRODUCT_ID,
  title: '智能无线卷发棒 Pro',
  sku_code: 'SKU-HB-PRO-001',
  category: 'Beauty/PersonalCare',
  selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
  target_audience: '北美年轻女性,25-35岁',
  scenario_tags: ['日常造型', '出差便携'],
  text_features: {},
  cover_image_url: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockSliceRowFactory = (
  index: number,
  overrides?: Partial<TestSliceRow>,
): TestSliceRow => ({
  id: `slice-uuid-${index}-${MATERIAL_ID}`,
  material_id: MATERIAL_ID,
  slice_id: [SLICE_ID_1, SLICE_ID_2, SLICE_ID_3, SLICE_ID_4, SLICE_ID_5][index - 1] || `slc_extra_${index}`,
  start_time: (index - 1) * 3.0,
  end_time: index * 3.0,
  duration: 3.0,
  dense_caption: `A detailed shot ${index} showing product.`,
  tags: ['wireless', `feature_${index}`],
  stream_url: `http://minio:9000/tikstream-assets/slices/${MATERIAL_ID}/slice_${index}.mp4`,
  key_frame_url: `http://minio:9000/tikstream-assets/slices/${MATERIAL_ID}/keyframe_${index}.webp`,
  embedding_version: 'imagebind-v2.1',
  sfx_url: index % 2 === 0 ? `http://minio:9000/tikstream-assets/sfx/sfx_${index}.wav` : null,
  status: 'COMPLETED',
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockMaterialRowFactory = (overrides?: Partial<TestMaterialRow>): TestMaterialRow => ({
  id: MATERIAL_ID,
  product_id: PRODUCT_ID,
  file_name: 'product_demo_video.mp4',
  type: 'VIDEO',
  source_type: 'UPLOAD',
  origin_url: `http://minio:9000/tikstream-assets/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/product_demo_video.mp4`,
  thumbnail_url: `http://minio:9000/tikstream-assets/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/thumb.webp`,
  file_size_bytes: BigInt(15 * 1024 * 1024),
  duration_seconds: 12.0,
  width: 1080,
  height: 1920,
  mime_type: 'video/mp4',
  status: 'COMPLETED',
  slices_count: 5,
  remark: '核心素材-主视觉',
  created_at: NOW,
  updated_at: NOW,
  slices: [
    mockSliceRowFactory(1),
    mockSliceRowFactory(2),
    mockSliceRowFactory(3),
    mockSliceRowFactory(4),
    mockSliceRowFactory(5),
  ],
  product: mockProductRowFactory(),
  ...overrides,
});

const mockPrismaClientFactory = (): MockPrismaClient => {
  const client = {
    material: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    materialSlice: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as MockPrismaClient;

  client.$transaction.mockImplementation(
    async (fn: (tx: Omit<MockPrismaClient, '$transaction'>) => Promise<unknown>) => fn(client),
  );

  return client;
};

const mockGpuQueueFactory = (): MockGpuQueue => ({
  add: jest.fn(),
});

// ============================================================
// 测试套件入口
// ============================================================

describe('MaterialReprocess — 素材重新处理 (POST /api/v1/materials/:material_id/reprocess)', () => {
  let mockPrisma: MockPrismaClient;
  let mockGpuQueue: MockGpuQueue;

  // ---- 原子函数类型声明 ----

  type ValidateMaterialIdFn = (materialId: string) => void;

  type ValidateReprocessStatusFn = (material: { id: string; status: string }) => void;

  type FindMaterialByIdFn = (
    prisma: MockPrismaClient,
    materialId: string,
  ) => Promise<TestMaterialRow | null>;

  type ResetMaterialForReprocessFn = (
    prisma: MockPrismaClient,
    materialId: string,
  ) => Promise<void>;

  type EnqueueGpuSlicingJobFn = (
    queue: MockGpuQueue,
    materialId: string,
  ) => Promise<TestEnqueueResult>;

  type ReprocessMaterialFn = (
    materialId: string,
    deps: {
      prisma: MockPrismaClient;
      gpuQueue: MockGpuQueue;
      atoms: {
        validateMaterialId: ValidateMaterialIdFn;
        findMaterialById: FindMaterialByIdFn;
        validateReprocessStatus: ValidateReprocessStatusFn;
        resetMaterialForReprocess: ResetMaterialForReprocessFn;
        enqueueGpuSlicingJob: EnqueueGpuSlicingJobFn;
      };
    },
  ) => Promise<TestReprocessResponse>;

  // ---- 原子函数实例 ----
  let validateMaterialId: ValidateMaterialIdFn;
  let validateReprocessStatus: ValidateReprocessStatusFn;
  let findMaterialById: FindMaterialByIdFn;
  let resetMaterialForReprocess: ResetMaterialForReprocessFn;
  let enqueueGpuSlicingJob: EnqueueGpuSlicingJobFn;
  let reprocessMaterial: ReprocessMaterialFn;

  beforeAll(() => {
    // ===================================================================
    // F1: validateMaterialId (复用 task-019)
    // ===================================================================

    validateMaterialId = (materialId) => {
      if (!materialId || materialId.trim().length === 0) {
        throw Object.assign(
          new Error('material_id 为必填字段'),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: { field: 'material_id', reason: 'missing_or_empty' },
          },
        );
      }

      const trimmed = materialId.trim();
      if (!UUID_V4_REGEX.test(trimmed)) {
        throw Object.assign(
          new Error(`material_id 不是有效的 UUID v4 格式: ${trimmed}`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: {
              field: 'material_id',
              received: trimmed,
              expected: 'UUID v4 (e.g. 00000000-0000-4000-0000-000000000000)',
            },
          },
        );
      }
    };

    // ===================================================================
    // F2: validateReprocessStatus
    // ===================================================================

    validateReprocessStatus = (material) => {
      const allowedStatuses: string[] = ['COMPLETED', 'FAILED'];

      if (!allowedStatuses.includes(material.status)) {
        throw Object.assign(
          new Error(`素材 ${material.id} 当前状态 ${material.status} 不允许重新处理，仅 ${allowedStatuses.join('/')} 状态可重新处理`),
          {
            errorCode: 'TASK_STATUS_CONFLICT',
            statusCode: HttpStatus.CONFLICT,
            retryable: false,
            details: {
              material_id: material.id,
              current_status: material.status,
              allowed_statuses: allowedStatuses,
            },
          },
        );
      }
    };

    // ===================================================================
    // Repo: findMaterialById
    // ===================================================================

    findMaterialById = async (prisma, materialId) => {
      try {
        const result = await prisma.material.findUnique({
          where: { id: materialId },
        });
        if (!result) {
          return null;
        }
        return result as unknown as TestMaterialRow;
      } catch (error) {
        const prismaError = error as Error & { code?: string };
        const isRetryable =
          prismaError.code === 'P1001' ||
          prismaError.code === 'P2024' ||
          prismaError.code === 'P2028';
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
    // F4: resetMaterialForReprocess (Repository 事务重置)
    // ===================================================================

    resetMaterialForReprocess = async (prisma, materialId) => {
      try {
        await prisma.$transaction(async (tx: Omit<MockPrismaClient, '$transaction'>) => {
          await tx.materialSlice.deleteMany({
            where: { material_id: materialId },
          });
          await tx.material.update({
            where: { id: materialId },
            data: {
              status: 'PENDING',
              slices_count: 0,
              updated_at: NOW,
            },
          });
        });
      } catch (error) {
        const prismaError = error as Error & { code?: string };

        if (prismaError.code === 'P2025') {
          throw Object.assign(
            new Error(`素材 ${materialId} 不存在或已被删除`),
            {
              errorCode: 'MATERIAL_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
              retryable: false,
              details: { material_id: materialId },
            },
          );
        }

        const isRetryable =
          prismaError.code === 'P1001' ||
          prismaError.code === 'P2024' ||
          prismaError.code === 'P2028';
        throw Object.assign(
          new Error(`素材重置失败: ${prismaError.message}`),
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
    // F3: enqueueGpuSlicingJob (复用 task-016, fire-and-forget)
    // ===================================================================

    enqueueGpuSlicingJob = async (queue, materialId) => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const datePrefix = `${y}${m}${d}`;

      try {
        const job = await queue.add('gpu_slicing', {
          materialId,
          skipQdrant: false,
          enqueuedAt: new Date().toISOString(),
        });

        const jobId = typeof job.id === 'string' ? job.id : String(job.id || '42');
        const taskId = `tsk_${datePrefix}_${String(jobId).padStart(6, '0')}`;

        return { jobId, taskId };
      } catch {
        const fallbackTaskId = `tsk_${datePrefix}_000000`;
        return {
          jobId: 'enqueue-failed',
          taskId: fallbackTaskId,
        };
      }
    };

    // ===================================================================
    // F0: reprocessMaterial (主编排器)
    // ===================================================================

    reprocessMaterial = async (materialId, deps) => {
      const { prisma, gpuQueue, atoms } = deps;

      atoms.validateMaterialId(materialId);

      const material = await atoms.findMaterialById(prisma, materialId);

      if (!material) {
        throw Object.assign(
          new Error(`素材 ${materialId} 不存在`),
          {
            errorCode: 'MATERIAL_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
            retryable: false,
            details: { material_id: materialId },
          },
        );
      }

      atoms.validateReprocessStatus(material);

      await atoms.resetMaterialForReprocess(prisma, materialId);

      const enqueueResult = await atoms.enqueueGpuSlicingJob(gpuQueue, materialId);

      return {
        material_id: materialId,
        task_id: enqueueResult.taskId,
        status: 'PENDING',
      };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();
    mockGpuQueue = mockGpuQueueFactory();

    mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
    mockPrisma.materialSlice.deleteMany.mockResolvedValue({ count: 5 });
    mockPrisma.material.update.mockResolvedValue({
      ...mockMaterialRowFactory(),
      status: 'PENDING',
      slices_count: 0,
    });

    const mockJob = { id: JOB_ID };
    mockGpuQueue.add.mockResolvedValue(mockJob);
  });

  const deps = () => ({
    prisma: mockPrisma,
    gpuQueue: mockGpuQueue,
    atoms: {
      validateMaterialId,
      findMaterialById,
      validateReprocessStatus,
      resetMaterialForReprocess,
      enqueueGpuSlicingJob,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法 material_id + COMPLETED/FAILED 状态 → 重新处理成功', () => {
    it('TC-MAT-REPR-001: 返回完整响应 { material_id, task_id, status }', async () => {
      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material_id');
      expect(result).toHaveProperty('task_id');
      expect(result).toHaveProperty('status');

      expect(typeof result.material_id).toBe('string');
      expect(typeof result.task_id).toBe('string');
      expect(typeof result.status).toBe('string');
    });

    it('TC-MAT-REPR-002: material_id 正确回传', async () => {
      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.material_id).toBe(MATERIAL_ID);
    });

    it('TC-MAT-REPR-003: status 返回 PENDING', async () => {
      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.status).toBe('PENDING');
    });

    it('TC-MAT-REPR-004: task_id 格式为 tsk_YYYYMMDD_NNNNNN', async () => {
      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.task_id).toMatch(/^tsk_\d{8}_\d{6}$/);
    });

    it('TC-MAT-REPR-005: status=COMPLETED 允许重新处理', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialRowFactory({ status: 'COMPLETED' }),
      );

      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.status).toBe('PENDING');
      expect(result.material_id).toBe(MATERIAL_ID);
    });

    it('TC-MAT-REPR-006: status=FAILED 允许重新处理', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialRowFactory({ status: 'FAILED' }),
      );

      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.status).toBe('PENDING');
      expect(result.material_id).toBe(MATERIAL_ID);
    });

    it('TC-MAT-REPR-007: 事务中先 deleteMany 切片再 update 素材', async () => {
      const callOrder: string[] = [];

      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: Omit<MockPrismaClient, '$transaction'>) => Promise<unknown>) => {
          const tx = {
            materialSlice: {
              deleteMany: jest.fn().mockImplementation(async () => {
                callOrder.push('slices_deleted');
                return { count: 5 };
              }),
            },
            material: {
              update: jest.fn().mockImplementation(async () => {
                callOrder.push('material_updated');
                return {};
              }),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
          };
          return fn(tx as unknown as Omit<MockPrismaClient, '$transaction'>);
        },
      );

      await reprocessMaterial(MATERIAL_ID, deps());

      expect(callOrder[0]).toBe('slices_deleted');
      expect(callOrder[1]).toBe('material_updated');
    });

    it('TC-MAT-REPR-008: resetMaterialForReprocess 将 status 重置为 PENDING + slices_count 重置为 0', async () => {
      await reprocessMaterial(MATERIAL_ID, deps());

      expect(mockPrisma.material.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MATERIAL_ID },
          data: expect.objectContaining({
            status: 'PENDING',
            slices_count: 0,
          }),
        }),
      );
    });

    it('TC-MAT-REPR-009: GPU Slicing Job 入队参数正确', async () => {
      await reprocessMaterial(MATERIAL_ID, deps());

      expect(mockGpuQueue.add).toHaveBeenCalledWith(
        'gpu_slicing',
        expect.objectContaining({
          materialId: MATERIAL_ID,
          skipQdrant: false,
          enqueuedAt: expect.any(String),
        }),
      );
    });

    it('TC-MAT-REPR-010: 素材查找调用 findUnique 一次', async () => {
      await reprocessMaterial(MATERIAL_ID, deps());

      expect(mockPrisma.material.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.material.findUnique).toHaveBeenCalledWith({
        where: { id: MATERIAL_ID },
      });
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-MAT-REPR-BND-001: material_id 含空格 → validateMaterialId trim 后仍通过并正常处理', async () => {
      const result = await reprocessMaterial(`  ${MATERIAL_ID}  `, deps());

      expect(result.status).toBe('PENDING');
      expect(result.task_id).toMatch(/^tsk_\d{8}_\d{6}$/);
    });

    it('TC-MAT-REPR-BND-002: 素材切片数为 0 → 不抛异常仍正常重置', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialRowFactory({ slices: [], slices_count: 0 }),
      );

      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.status).toBe('PENDING');
    });

    it('TC-MAT-REPR-BND-003: GPU Queue enqueue 失败 → task_id 为 fallback', async () => {
      mockGpuQueue.add.mockRejectedValue(new Error('Redis unreachable'));

      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.material_id).toBe(MATERIAL_ID);
      expect(result.status).toBe('PENDING');

      const taskParts = result.task_id.split('_');
      expect(taskParts.length).toBe(3);
      expect(taskParts[0]).toBe('tsk');

      const suffix = taskParts[taskParts.length - 1];
      expect(suffix).toBe('000000');
    });

    it('TC-MAT-REPR-BND-004: GPU Queue enqueue 失败 → 不阻断主流程返回', async () => {
      mockGpuQueue.add.mockRejectedValue(new Error('Redis unreachable'));

      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
    });

    it('TC-MAT-REPR-BND-005: 图片素材也允许重新处理', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialRowFactory({
          type: 'IMAGE',
          duration_seconds: null,
          slices: [mockSliceRowFactory(1, { start_time: 0, end_time: 0, duration: 0 })],
          slices_count: 1,
        }),
      );

      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.status).toBe('PENDING');
    });

    it('TC-MAT-REPR-BND-006: task_id 格式始终合法 (GPU 入队成功场景)', async () => {
      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.task_id).toMatch(/^tsk_\d{8}_\d{6}$/);
    });

    it('TC-MAT-REPR-BND-007: 重新处理后的素材 status 为 PENDING (非原始状态)', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialRowFactory({ status: 'FAILED' }),
      );

      const result = await reprocessMaterial(MATERIAL_ID, deps());

      expect(result.status).toBe('PENDING');
      expect(result.status).not.toBe('FAILED');
    });

    it('TC-MAT-REPR-BND-008: validateReprocessStatus 非法状态全部被拦截', () => {
      const invalidCases = [
        { status: 'PENDING', label: 'PENDING' },
        { status: 'PROCESSING', label: 'PROCESSING' },
      ];

      invalidCases.forEach(({ status, label }) => {
        let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
        try {
          validateReprocessStatus({ id: MATERIAL_ID, status });
        } catch (err) {
          caught = err as Error & { errorCode?: string; statusCode?: number };
        }

        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
        expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      });
    });

    it('TC-MAT-REPR-BND-009: validateReprocessStatus 合法状态全部通过', () => {
      const validCases = [
        { status: 'COMPLETED', label: 'COMPLETED' },
        { status: 'FAILED', label: 'FAILED' },
      ];

      validCases.forEach(({ status, label }) => {
        expect(() =>
          validateReprocessStatus({ id: MATERIAL_ID, status }),
        ).not.toThrow();
      });
    });

    it('TC-MAT-REPR-BND-010: 事务内 deleteMany 传入正确 material_id', async () => {
      await reprocessMaterial(MATERIAL_ID, deps());

      expect(mockPrisma.materialSlice.deleteMany).toHaveBeenCalledWith({
        where: { material_id: MATERIAL_ID },
      });
    });

    it('TC-MAT-REPR-BND-011: 事务内 update 传入 correct id', async () => {
      await reprocessMaterial(MATERIAL_ID, deps());

      expect(mockPrisma.material.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MATERIAL_ID },
        }),
      );
    });
  });

  // ===========================================================================
  // 3. 异常流（Exception / Error Handling）
  // ===========================================================================

  describe('【异常流】人为制造报错场景 → 精准抛出规范错误码', () => {
    it('TC-MAT-REPR-ERR-001: material_id 为空字符串 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> } | null = null;
      try {
        await reprocessMaterial('', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details!.field).toBe('material_id');
    });

    it('TC-MAT-REPR-ERR-002: material_id 为纯空格 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await reprocessMaterial('   ', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-REPR-ERR-003: material_id 为 null → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await reprocessMaterial(null as unknown as string, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-REPR-ERR-004: material_id 不是 UUID v4 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await reprocessMaterial('not-a-valid-uuid', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.details!.field).toBe('material_id');
      expect(caught!.details!.expected).toContain('UUID v4');
    });

    it('TC-MAT-REPR-ERR-005: 数据库中不存在该素材 → 抛出 MATERIAL_NOT_FOUND', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details!.material_id).toBe(MATERIAL_ID);
    });

    it('TC-MAT-REPR-ERR-006: status=PENDING → 抛出 TASK_STATUS_CONFLICT (409)', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialRowFactory({ status: 'PENDING' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details!.material_id).toBe(MATERIAL_ID);
      expect(caught!.details!.current_status).toBe('PENDING');
      expect(caught!.details!.allowed_statuses).toContain('COMPLETED');
      expect(caught!.details!.allowed_statuses).toContain('FAILED');
    });

    it('TC-MAT-REPR-ERR-007: status=PROCESSING → 抛出 TASK_STATUS_CONFLICT (409)', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(
        mockMaterialRowFactory({ status: 'PROCESSING' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-MAT-REPR-ERR-008: Prisma P2025（事务中 update 失败）→ 抛出 MATERIAL_NOT_FOUND', async () => {
      const p2025Error = Object.assign(new Error('Record not found'), { code: 'P2025' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p2025Error);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-MAT-REPR-ERR-009: Prisma P1001 数据库连接超时 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p1001Error = Object.assign(new Error('Connection timeout'), { code: 'P1001' });
      mockPrisma.material.findUnique.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-REPR-ERR-010: Prisma P2024 连接池耗尽 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2024Error = Object.assign(new Error('Connection pool exhausted'), { code: 'P2024' });
      mockPrisma.material.findUnique.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-REPR-ERR-011: Prisma P2028 事务冲突 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2028Error = Object.assign(new Error('Transaction API error'), { code: 'P2028' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p2028Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-REPR-ERR-012: 未知 Prisma 错误码 (P9999) → 抛出 INTERNAL_SERVER_ERROR (non-retryable)', async () => {
      const p9999Error = Object.assign(new Error('Mysterious error'), { code: 'P9999' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p9999Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await reprocessMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(false);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    it('TC-MAT-REPR-PERF-001: reprocessMaterial 编排总耗时 ≤ 2000ms (mock 全链路)', async () => {
      const PERF_CEILING_MS = 2000;

      const start = performance.now();

      await reprocessMaterial(MATERIAL_ID, deps());

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 5000);

    it('TC-MAT-REPR-PERF-002: validateMaterialId ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      validateMaterialId(MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-REPR-PERF-003: validateReprocessStatus ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      validateReprocessStatus({ id: MATERIAL_ID, status: 'COMPLETED' });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-REPR-PERF-004: findMaterialById (mock DB) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      const result = await findMaterialById(mockPrisma, MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(result).not.toBeNull();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-REPR-PERF-005: resetMaterialForReprocess (mock 事务) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      await resetMaterialForReprocess(mockPrisma, MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-REPR-PERF-006: enqueueGpuSlicingJob (mock 队列) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      const result = await enqueueGpuSlicingJob(mockGpuQueue, MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(result.taskId).toMatch(/^tsk_\d{8}_\d{6}$/);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-REPR-PERF-007: 连续 100 次 reprocessMaterial 无退化', async () => {
      const ITERATIONS = 100;
      const PERF_CEILING_MS_PER_ITERATION = 50;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await reprocessMaterial(MATERIAL_ID, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 30000);

    it('TC-MAT-REPR-PERF-008: validateReprocessStatus 失败分支 ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      try {
        validateReprocessStatus({ id: MATERIAL_ID, status: 'PENDING' });
      } catch {
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立纯逻辑验证', () => {
    it('TC-MAT-REPR-ATOM-001: validateReprocessStatus — COMPLETED 通过', () => {
      expect(() =>
        validateReprocessStatus({ id: MATERIAL_ID, status: 'COMPLETED' }),
      ).not.toThrow();
    });

    it('TC-MAT-REPR-ATOM-002: validateReprocessStatus — FAILED 通过', () => {
      expect(() =>
        validateReprocessStatus({ id: MATERIAL_ID, status: 'FAILED' }),
      ).not.toThrow();
    });

    it('TC-MAT-REPR-ATOM-003: validateReprocessStatus — PENDING 抛异常含 details', () => {
      let caught: Error & { errorCode?: string; details?: Record<string, unknown> } | null = null;
      try {
        validateReprocessStatus({ id: MATERIAL_ID, status: 'PENDING' });
      } catch (err) {
        caught = err as Error & { errorCode?: string; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
      expect(caught!.details!.current_status).toBe('PENDING');
      expect(caught!.details!.allowed_statuses).toEqual(['COMPLETED', 'FAILED']);
    });

    it('TC-MAT-REPR-ATOM-004: validateReprocessStatus — PROCESSING 抛异常', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateReprocessStatus({ id: MATERIAL_ID, status: 'PROCESSING' });
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_STATUS_CONFLICT');
    });

    it('TC-MAT-REPR-ATOM-005: resetMaterialForReprocess — 事务内 deleteMany + update 都调用', async () => {
      await resetMaterialForReprocess(mockPrisma, MATERIAL_ID);

      expect(mockPrisma.materialSlice.deleteMany).toHaveBeenCalledWith({
        where: { material_id: MATERIAL_ID },
      });
      expect(mockPrisma.material.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MATERIAL_ID },
          data: expect.objectContaining({
            status: 'PENDING',
            slices_count: 0,
          }),
        }),
      );
    });

    it('TC-MAT-REPR-ATOM-006: enqueueGpuSlicingJob — 成功返回合法 task_id', async () => {
      const result = await enqueueGpuSlicingJob(mockGpuQueue, MATERIAL_ID);

      expect(result.taskId).toMatch(/^tsk_\d{8}_\d{6}$/);
      expect(result.jobId).toBe(JOB_ID);
    });

    it('TC-MAT-REPR-ATOM-007: enqueueGpuSlicingJob — 失败返回 fallback taskId', async () => {
      mockGpuQueue.add.mockRejectedValue(new Error('Queue failed'));

      const result = await enqueueGpuSlicingJob(mockGpuQueue, MATERIAL_ID);

      expect(result.jobId).toBe('enqueue-failed');
      expect(result.taskId).toMatch(/^tsk_\d{8}_000000$/);
    });

    it('TC-MAT-REPR-ATOM-008: enqueueGpuSlicingJob — 失败不抛异常', async () => {
      mockGpuQueue.add.mockRejectedValue(new Error('Queue failed'));

      let threw = false;
      try {
        await enqueueGpuSlicingJob(mockGpuQueue, MATERIAL_ID);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
    });

    it('TC-MAT-REPR-ATOM-009: enqueueGpuSlicingJob — skipQdrant 默认为 false', async () => {
      await enqueueGpuSlicingJob(mockGpuQueue, MATERIAL_ID);

      expect(mockGpuQueue.add).toHaveBeenCalledWith(
        'gpu_slicing',
        expect.objectContaining({
          materialId: MATERIAL_ID,
          skipQdrant: false,
        }),
      );
    });

    it('TC-MAT-REPR-ATOM-010: validateMaterialId — 5 个合法 UUID v4 全部通过', () => {
      const validUuids = [
        '00000000-0000-4000-8000-000000000001',
        'ffffffff-ffff-4fff-bfff-ffffffffffff',
        '123e4567-e89b-42d3-a456-426614174000',
        'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6',
        'dc52d4ff-0000-4000-a000-000000000010',
      ];

      validUuids.forEach((uuid) => {
        expect(() => validateMaterialId(uuid)).not.toThrow();
      });
    });
  });
});
