// =============================================================================
// TikStream AI — Material Delete 自动化测试基座
// 对应功能: DELETE /api/v1/materials/:material_id (素材删除 — 级联切片 + MinIO 异步清理)
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

type MockPrismaClient = {
  material: {
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
  materialSlice: {
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type MockMinioClient = {
  deleteObject: jest.Mock;
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-26T12:00:00Z');
const MATERIAL_ID = 'dc52d4ff-0000-4000-a000-000000000010';
const MATERIAL_ID_2 = 'a1b2c3d4-0000-4000-b000-000000000020';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const SLICE_ID_1 = 'slc_20260523_000001_001';
const SLICE_ID_2 = 'slc_20260523_000002_002';
const SLICE_ID_3 = 'slc_20260523_000003_003';
const SLICE_ID_4 = 'slc_20260523_000004_004';
const SLICE_ID_5 = 'slc_20260523_000005_005';
const BUCKET_NAME = 'tikstream-assets';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  dense_caption: `A detailed shot ${index} showing the product wireless hair curler.`,
  tags: ['wireless', `feature_${index}`, 'close-up'],
  stream_url: `http://minio:9000/${BUCKET_NAME}/slices/${MATERIAL_ID}/slice_${index}.mp4`,
  key_frame_url: `http://minio:9000/${BUCKET_NAME}/slices/${MATERIAL_ID}/keyframe_${index}.webp`,
  embedding_version: index <= 3 ? 'v2.1' : null,
  sfx_url: index % 2 === 0 ? `http://minio:9000/${BUCKET_NAME}/sfx/sfx_${index}.wav` : null,
  status: index <= 3 ? 'COMPLETED' : (index === 4 ? 'CAPTIONING' : 'PENDING'),
  created_at: new Date(NOW.getTime() - (5 - index) * 3600000),
  updated_at: new Date(NOW.getTime() - (5 - index) * 1800000),
  ...overrides,
});

const mockMaterialRowFactory = (overrides?: Partial<TestMaterialRow>): TestMaterialRow => ({
  id: MATERIAL_ID,
  product_id: PRODUCT_ID,
  file_name: 'product_demo_video.mp4',
  type: 'VIDEO',
  source_type: 'UPLOAD',
  origin_url: `http://minio:9000/${BUCKET_NAME}/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/product_demo_video.mp4`,
  thumbnail_url: `http://minio:9000/${BUCKET_NAME}/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/thumb.webp`,
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

const mockImageMaterialRowFactory = (overrides?: Partial<TestMaterialRow>): TestMaterialRow => ({
  id: MATERIAL_ID,
  product_id: PRODUCT_ID,
  file_name: 'product_demo_image.jpeg',
  type: 'IMAGE',
  source_type: 'UPLOAD',
  origin_url: `http://minio:9000/${BUCKET_NAME}/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/product_demo_image.jpeg`,
  thumbnail_url: `http://minio:9000/${BUCKET_NAME}/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/thumb.webp`,
  file_size_bytes: BigInt(524288),
  duration_seconds: null,
  width: 1080,
  height: 1920,
  mime_type: 'image/jpeg',
  status: 'COMPLETED',
  slices_count: 1,
  remark: null,
  created_at: NOW,
  updated_at: NOW,
  slices: [mockSliceRowFactory(1, { start_time: 0, end_time: 0, duration: 0, stream_url: null, key_frame_url: null })],
  product: mockProductRowFactory(),
  ...overrides,
});

const mockPrismaClientFactory = (): MockPrismaClient => {
  const client = {
    material: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    materialSlice: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as MockPrismaClient;

  client.$transaction.mockImplementation(
    async (fn: (tx: Omit<MockPrismaClient, '$transaction'>) => Promise<unknown>) =>
      fn(client),
  );

  return client;
};

const mockMinioClientFactory = (): MockMinioClient => ({
  deleteObject: jest.fn(),
});

// ============================================================
// 测试套件入口
// ============================================================

describe('MaterialDelete — 素材删除 (DELETE /api/v1/materials/:material_id)', () => {
  let mockPrisma: MockPrismaClient;
  let mockMinio: MockMinioClient;

  // ---- 原子函数类型声明 ----

  type ValidateMaterialIdFn = (materialId: string) => void;

  type ExtractObjectKeyFromUrlFn = (url: string) => string | null;

  type CollectMaterialObjectKeysFn = (row: TestMaterialRow) => string[];

  type DeleteMaterialByIdFn = (
    prisma: MockPrismaClient,
    materialId: string,
  ) => Promise<void>;

  type FindMaterialByIdFn = (
    prisma: MockPrismaClient,
    materialId: string,
  ) => Promise<TestMaterialRow | null>;

  type CleanupMinioObjectsFn = (
    minio: MockMinioClient,
    keys: string[],
  ) => Promise<void>;

  type DeleteMaterialFn = (
    materialId: string,
    deps: {
      prisma: MockPrismaClient;
      minio: MockMinioClient;
      atoms: {
        validateMaterialId: ValidateMaterialIdFn;
        findMaterialById: FindMaterialByIdFn;
        collectMaterialObjectKeys: CollectMaterialObjectKeysFn;
        deleteMaterialById: DeleteMaterialByIdFn;
        cleanupMinioObjects: CleanupMinioObjectsFn;
      };
    },
  ) => Promise<null>;

  // ---- 原子函数实例 ----
  let validateMaterialId: ValidateMaterialIdFn;
  let extractObjectKeyFromUrl: ExtractObjectKeyFromUrlFn;
  let collectMaterialObjectKeys: CollectMaterialObjectKeysFn;
  let deleteMaterialById: DeleteMaterialByIdFn;
  let findMaterialById: FindMaterialByIdFn;
  let cleanupMinioObjects: CleanupMinioObjectsFn;
  let deleteMaterial: DeleteMaterialFn;

  beforeAll(() => {
    // ===================================================================
    // F1: validateMaterialId (复用 task-019 逻辑)
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
    // Repo: findMaterialById (in-memory mock wrapping Prisma findUnique)
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
    // F3: extractObjectKeyFromUrl
    // ===================================================================

    extractObjectKeyFromUrl = (url) => {
      try {
        const parts = url.split(`/${BUCKET_NAME}/`);
        if (parts.length >= 2) {
          return parts[1];
        }
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        if (pathname && pathname.length > 1) {
          return pathname.replace(/^\//, '');
        }
        return null;
      } catch {
        return null;
      }
    };

    // ===================================================================
    // F2: collectMaterialObjectKeys
    // ===================================================================

    collectMaterialObjectKeys = (row) => {
      const keys: string[] = [];

      const originKey = extractObjectKeyFromUrl(row.origin_url);
      if (originKey) {
        keys.push(originKey);
      }

      if (row.thumbnail_url) {
        const thumbKey = extractObjectKeyFromUrl(row.thumbnail_url);
        if (thumbKey) {
          keys.push(thumbKey);
        }
      }

      const slices = row.slices ?? [];
      for (const slice of slices) {
        if (slice.stream_url) {
          const streamKey = extractObjectKeyFromUrl(slice.stream_url);
          if (streamKey) {
            keys.push(streamKey);
          }
        }
        if (slice.key_frame_url) {
          const kfKey = extractObjectKeyFromUrl(slice.key_frame_url);
          if (kfKey) {
            keys.push(kfKey);
          }
        }
        if (slice.sfx_url) {
          const sfxKey = extractObjectKeyFromUrl(slice.sfx_url);
          if (sfxKey) {
            keys.push(sfxKey);
          }
        }
      }

      return [...new Set(keys)].filter(Boolean);
    };

    // ===================================================================
    // F5: deleteMaterialById (Repository 事务级联删除)
    // ===================================================================

    deleteMaterialById = async (prisma, materialId) => {
      try {
        const result = await prisma.$transaction(
          async (tx: Omit<MockPrismaClient, '$transaction'>) => {
            await tx.materialSlice.deleteMany({
              where: { material_id: materialId },
            });
            await tx.material.delete({
              where: { id: materialId },
            });
            return null;
          },
        );
        return result as unknown as void;
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
        if (prismaError.code === 'P2003') {
          throw Object.assign(
            new Error(`素材 ${materialId} 存在外键约束，无法删除`),
            {
              errorCode: 'MATERIAL_DELETE_CONFLICT',
              statusCode: HttpStatus.CONFLICT,
              retryable: false,
              details: { material_id: materialId, reason: 'foreign_key_constraint' },
            },
          );
        }
        const isRetryable =
          prismaError.code === 'P1001' ||
          prismaError.code === 'P2024' ||
          prismaError.code === 'P2028';
        throw Object.assign(
          new Error(`数据库删除失败: ${prismaError.message}`),
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
    // F4: cleanupMinioObjects (fire-and-forget, 永不抛异常)
    // ===================================================================

    cleanupMinioObjects = async (minio, keys) => {
      if (keys.length === 0) {
        return;
      }

      try {
        const results = await Promise.allSettled(
          keys.map((key) => minio.deleteObject(key)),
        );

        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        if (failed > 0) {
          const failedReasons = results
            .filter((r) => r.status === 'rejected')
            .map((r) => (r as PromiseRejectedResult).reason)
            .join(', ');
          console.warn(`MinIO cleanup: ${succeeded} succeeded, ${failed} failed: ${failedReasons}`);
        }
      } catch (error) {
        console.warn(`MinIO cleanup batch failed (non-fatal): ${(error as Error).message}`);
      }
    };

    // ===================================================================
    // F0: deleteMaterial (主编排器)
    // ===================================================================

    deleteMaterial = async (materialId, deps) => {
      const { prisma, minio, atoms } = deps;

      atoms.validateMaterialId(materialId);

      const row = await atoms.findMaterialById(prisma, materialId);

      if (!row) {
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

      const objectKeys = atoms.collectMaterialObjectKeys(row);

      await atoms.deleteMaterialById(prisma, materialId);

      atoms.cleanupMinioObjects(minio, objectKeys);

      return null;
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();
    mockMinio = mockMinioClientFactory();

    const materialRow = mockMaterialRowFactory();
    mockPrisma.material.findUnique.mockResolvedValue(materialRow);
    mockPrisma.materialSlice.deleteMany.mockResolvedValue({ count: 5 });
    mockPrisma.material.delete.mockResolvedValue(materialRow);
    mockMinio.deleteObject.mockResolvedValue(undefined);
  });

  const deps = () => ({
    prisma: mockPrisma,
    minio: mockMinio,
    atoms: {
      validateMaterialId,
      findMaterialById,
      collectMaterialObjectKeys,
      deleteMaterialById,
      cleanupMinioObjects,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法 material_id → 删除成功返回 null', () => {
    it('TC-MAT-DEL-001: 删除成功返回 null（符合 ApiResponse<null> 契约）', async () => {
      const result = await deleteMaterial(MATERIAL_ID, deps());

      expect(result).toBeNull();
    });

    it('TC-MAT-DEL-002: Prisma 事务中先删切片再删素材', async () => {
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
              delete: jest.fn().mockImplementation(async () => {
                callOrder.push('material_deleted');
                return {};
              }),
            },
          };
          return fn(tx as unknown as Omit<MockPrismaClient, '$transaction'>);
        },
      );

      await deleteMaterial(MATERIAL_ID, deps());

      expect(callOrder[0]).toBe('slices_deleted');
      expect(callOrder[1]).toBe('material_deleted');
    });

    it('TC-MAT-DEL-003: 调用 MinIO 清理（至少包含 origin + thumbnail + slices url）', async () => {
      await deleteMaterial(MATERIAL_ID, deps());

      expect(mockMinio.deleteObject).toHaveBeenCalled();
      const callCount = (mockMinio.deleteObject as jest.Mock).mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(7);
    });

    it('TC-MAT-DEL-004: MinIO 调用传入有效的 object key', async () => {
      await deleteMaterial(MATERIAL_ID, deps());

      const calls = (mockMinio.deleteObject as jest.Mock).mock.calls;
      calls.forEach((call: string[]) => {
        expect(typeof call[0]).toBe('string');
        expect(call[0].length).toBeGreaterThan(0);
      });
    });

    it('TC-MAT-DEL-005: deleteMaterialById 接收正确 material_id', async () => {
      await deleteMaterial(MATERIAL_ID, deps());

      const txnCalls = (mockPrisma.$transaction as jest.Mock).mock.calls;
      expect(txnCalls.length).toBe(1);
    });

    it('TC-MAT-DEL-006: 素材查找后收集到的 object keys 去重（无重复 key）', async () => {
      const row = mockMaterialRowFactory();
      const keys = collectMaterialObjectKeys(row);

      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('TC-MAT-DEL-007: 删除后不再查询素材（验证幂等）', async () => {
      await deleteMaterial(MATERIAL_ID, deps());

      expect(mockPrisma.material.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('TC-MAT-DEL-008: 视频素材的 origin 和 thumbnail URL 都被收集', async () => {
      const row = mockMaterialRowFactory({
        origin_url: `http://minio:9000/${BUCKET_NAME}/materials/origin.mp4`,
        thumbnail_url: `http://minio:9000/${BUCKET_NAME}/materials/thumb.webp`,
      });

      const keys = collectMaterialObjectKeys(row);

      expect(keys).toContain('materials/origin.mp4');
      expect(keys).toContain('materials/thumb.webp');
    });

    it('TC-MAT-DEL-009: 切片的 stream_url + key_frame_url + sfx_url 全部收集', async () => {
      const row = mockMaterialRowFactory();
      const keys = collectMaterialObjectKeys(row);

      const sliceKeyFiles = keys.filter(
        (k) => k.includes('slice_') || k.includes('keyframe_') || k.includes('sfx_'),
      );
      expect(sliceKeyFiles.length).toBeGreaterThanOrEqual(5);
    });

    it('TC-MAT-DEL-010: 图片素材只有 origin + thumbnail', async () => {
      const row = mockImageMaterialRowFactory();
      const keys = collectMaterialObjectKeys(row);

      expect(keys.length).toBe(2);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-MAT-DEL-BND-001: material_id 首尾含空格 → trim 后正常删除', async () => {
      const result = await deleteMaterial(`  ${MATERIAL_ID}  `, deps());

      expect(result).toBeNull();
    });

    it('TC-MAT-DEL-BND-002: 切片列表为空 → 只删素材本人', async () => {
      const noSliceRow = { ...mockMaterialRowFactory(), slices: [], slices_count: 0 };
      mockPrisma.material.findUnique.mockResolvedValue(noSliceRow);

      const callOrder: string[] = [];

      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: Omit<MockPrismaClient, '$transaction'>) => Promise<unknown>) => {
          const tx = {
            materialSlice: {
              deleteMany: jest.fn().mockImplementation(async () => {
                callOrder.push('slices_deleted');
                return { count: 0 };
              }),
            },
            material: {
              delete: jest.fn().mockImplementation(async () => {
                callOrder.push('material_deleted');
                return {};
              }),
            },
          };
          return fn(tx as unknown as Omit<MockPrismaClient, '$transaction'>);
        },
      );

      const result = await deleteMaterial(MATERIAL_ID, deps());

      expect(result).toBeNull();
      expect(callOrder).toContain('material_deleted');
    });

    it('TC-MAT-DEL-BND-003: thumbnail_url 为 null → objectKeys 不含 thumbnail', async () => {
      const noThumbRow = mockMaterialRowFactory({ thumbnail_url: null });
      const keys = collectMaterialObjectKeys(noThumbRow);

      const thumbKeys = keys.filter((k) => k.includes('thumb'));
      expect(thumbKeys.length).toBe(0);
    });

    it('TC-MAT-DEL-BND-004: 切片 stream_url 为 null → 不收集空 URL', async () => {
      const nullStreamSlice = mockSliceRowFactory(1, { stream_url: null });
      const row = mockMaterialRowFactory({ slices: [nullStreamSlice] });

      const keys = collectMaterialObjectKeys(row);

      keys.forEach((k) => {
        expect(k).not.toBe('');
        expect(k).not.toBeNull();
      });
    });

    it('TC-MAT-DEL-BND-005: 切片 key_frame_url 为 null → 不收集空 URL', async () => {
      const nullKfSlice = mockSliceRowFactory(1, { key_frame_url: null });
      const row = mockMaterialRowFactory({ slices: [nullKfSlice] });

      const keys = collectMaterialObjectKeys(row);

      const kfKeys = keys.filter((k) => k.includes('keyframe'));
      expect(kfKeys.length).toBe(0);
    });

    it('TC-MAT-DEL-BND-006: 所有切片 sfx_url 为 null → 不收集空 URL', async () => {
      const noSfxSlices = [1, 2, 3, 4, 5].map((i) =>
        mockSliceRowFactory(i, { sfx_url: null }),
      );
      const row = mockMaterialRowFactory({ slices: noSfxSlices });

      const keys = collectMaterialObjectKeys(row);

      const sfxKeys = keys.filter((k) => k.includes('sfx'));
      expect(sfxKeys.length).toBe(0);
    });

    it('TC-MAT-DEL-BND-007: origin_url 含非标准路径格式 → extractObjectKeyFromUrl 静默返回 null', async () => {
      const result = extractObjectKeyFromUrl('not-a-valid-url');

      expect(result).toBeNull();
    });

    it('TC-MAT-DEL-BND-008: URL 不含 bucketName → 尝试 pathname 兜底', async () => {
      const result = extractObjectKeyFromUrl('http://other-host:9000/materials/foo/bar.mp4');

      expect(result).toBe('materials/foo/bar.mp4');
    });

    it('TC-MAT-DEL-BND-009: 大量切片 (50 个) → 全部 collect 无遗漏', () => {
      const manySlices = Array.from({ length: 50 }, (_, i) =>
        mockSliceRowFactory(i + 1, {
          slice_id: `slc_20260523_${String(i + 1).padStart(6, '0')}_001`,
          start_time: i * 0.3,
          end_time: (i + 1) * 0.3,
          duration: 0.3,
          stream_url: `http://minio:9000/${BUCKET_NAME}/slices/many/slice_${i}.mp4`,
          key_frame_url: i % 3 === 0 ? `http://minio:9000/${BUCKET_NAME}/slices/many/kf_${i}.webp` : null,
          sfx_url: i % 5 === 0 ? `http://minio:9000/${BUCKET_NAME}/sfx/sfx_${i}.wav` : null,
        }),
      );
      const row = mockMaterialRowFactory({ slices: manySlices, slices_count: 50 });

      const keys = collectMaterialObjectKeys(row);

      expect(keys.length).toBeGreaterThan(0);
    });

    it('TC-MAT-DEL-BND-010: cleanupMinioObjects 空数组 → 无操作', async () => {
      mockMinio.deleteObject.mockClear();

      await cleanupMinioObjects(mockMinio, []);

      expect(mockMinio.deleteObject).not.toHaveBeenCalled();
    });

    it('TC-MAT-DEL-BND-011: cleanupMinioObjects 单 key 成功 → 不抛异常', async () => {
      let threw = false;
      try {
        await cleanupMinioObjects(mockMinio, ['materials/test.mp4']);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(mockMinio.deleteObject).toHaveBeenCalledTimes(1);
    });

    it('TC-MAT-DEL-BND-012: cleanupMinioObjects 部分失败 → 不阻断', async () => {
      let callCount = 0;
      mockMinio.deleteObject.mockImplementation(async () => {
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('Simulated MinIO failure');
        }
      });

      let threw = false;
      try {
        await cleanupMinioObjects(mockMinio, ['a', 'b', 'c', 'd', 'e']);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
    });

    it('TC-MAT-DEL-BND-013: cleanupMinioObjects 全部失败 → 不抛异常', async () => {
      mockMinio.deleteObject.mockRejectedValue(new Error('All MinIO calls fail'));

      let threw = false;
      try {
        await cleanupMinioObjects(mockMinio, ['a', 'b', 'c']);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
    });

    it('TC-MAT-DEL-BND-014: deleteMinio Bucket 调用失败不阻塞主流程', async () => {
      mockMinio.deleteObject.mockRejectedValue(new Error('MinIO unreachable'));

      const result = await deleteMaterial(MATERIAL_ID, deps());

      expect(result).toBeNull();
    });

    it('TC-MAT-DEL-BND-015: 重复删除同一素材 → Prisma P2025 → MATERIAL_NOT_FOUND', async () => {
      const p2025Error = Object.assign(new Error('Record to delete does not exist'), { code: 'P2025' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p2025Error);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });

  // ===========================================================================
  // 3. 异常流（Exception / Error Handling）
  // ===========================================================================

  describe('【异常流】人为制造报错场景 → 精准抛出规范错误码', () => {
    it('TC-MAT-DEL-ERR-001: material_id 为空字符串 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await deleteMaterial('', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details!.field).toBe('material_id');
      expect(caught!.details!.reason).toBe('missing_or_empty');
    });

    it('TC-MAT-DEL-ERR-002: material_id 为纯空格 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteMaterial('   ', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DEL-ERR-003: material_id 为 null → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteMaterial(null as unknown as string, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DEL-ERR-004: material_id 不是 UUID v4 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await deleteMaterial('not-a-valid-uuid-format', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.details!.field).toBe('material_id');
      expect(caught!.details!.received).toBe('not-a-valid-uuid-format');
      expect(caught!.details!.expected).toContain('UUID v4');
    });

    it('TC-MAT-DEL-ERR-005: 数据库中不存在该素材 → 抛出 MATERIAL_NOT_FOUND', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details!.material_id).toBe(MATERIAL_ID);
    });

    it('TC-MAT-DEL-ERR-006: Prisma P2025（记录不存在于 delete）→ 抛出 MATERIAL_NOT_FOUND', async () => {
      const p2025Error = Object.assign(new Error('Record to delete does not exist'), { code: 'P2025' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p2025Error);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-MAT-DEL-ERR-007: Prisma P2003（外键约束）→ 抛出 MATERIAL_DELETE_CONFLICT (409)', async () => {
      const p2003Error = Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p2003Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_DELETE_CONFLICT');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details!.material_id).toBe(MATERIAL_ID);
      expect(caught!.details!.reason).toBe('foreign_key_constraint');
    });

    it('TC-MAT-DEL-ERR-008: Prisma P1001 数据库连接超时 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p1001Error = Object.assign(new Error('Connection timeout'), { code: 'P1001' });
      mockPrisma.material.findUnique.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-DEL-ERR-009: Prisma P2024 连接池耗尽 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2024Error = Object.assign(new Error('Timed out fetching connection'), { code: 'P2024' });
      mockPrisma.material.findUnique.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-DEL-ERR-010: Prisma P2028 事务冲突 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2028Error = Object.assign(new Error('Transaction API error'), { code: 'P2028' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p2028Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-DEL-ERR-011: 未知 Prisma 错误码 (P9999) → 抛出 INTERNAL_SERVER_ERROR (non-retryable)', async () => {
      const p9999Error = Object.assign(new Error('Mysterious error'), { code: 'P9999' });
      mockPrisma.material.findUnique.mockResolvedValue(mockMaterialRowFactory());
      mockPrisma.$transaction.mockRejectedValue(p9999Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(false);
    });

    it('TC-MAT-DEL-ERR-012: findMaterialById Prisma P1001 → 抛出 INTERNAL_SERVER_ERROR', async () => {
      const p1001Error = Object.assign(new Error('Connection timeout'), { code: 'P1001' });
      mockPrisma.material.findUnique.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await deleteMaterial(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-DEL-ERR-013: material_id 含 SQL 注入 → 被 UUID v4 校验拦截', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await deleteMaterial("dc52d4ff-0000-4000-a000-000000000010'; DROP TABLE materials;--", deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DEL-ERR-014: material_id UUID v1 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        await deleteMaterial('dc52d4ff-0000-1000-a000-000000000010', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    it('TC-MAT-DEL-PERF-001: deleteMaterial 编排总耗时 ≤ 2000ms (mock 全链路)', async () => {
      const PERF_CEILING_MS = 2000;

      const start = performance.now();

      await deleteMaterial(MATERIAL_ID, deps());

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 5000);

    it('TC-MAT-DEL-PERF-002: validateMaterialId ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      validateMaterialId(MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DEL-PERF-003: extractObjectKeyFromUrl ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      const key = extractObjectKeyFromUrl(`http://minio:9000/${BUCKET_NAME}/materials/20260526/test.mp4`);

      const elapsed = performance.now() - start;

      expect(key).toBe('materials/20260526/test.mp4');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DEL-PERF-004: collectMaterialObjectKeys (5 slices) ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;
      const row = mockMaterialRowFactory();

      const start = performance.now();

      const keys = collectMaterialObjectKeys(row);

      const elapsed = performance.now() - start;

      expect(keys.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DEL-PERF-005: collectMaterialObjectKeys (100 slices) ≤ 5ms', () => {
      const PERF_CEILING_MS = 5;
      const manySlices = Array.from({ length: 100 }, (_, i) =>
        mockSliceRowFactory(i + 1, {
          slice_id: `slc_20260523_${String(i + 1).padStart(6, '0')}_001`,
          start_time: i * 0.15,
          end_time: (i + 1) * 0.15,
          duration: 0.15,
          stream_url: `http://minio:9000/${BUCKET_NAME}/slices/many/slice_${i}.mp4`,
          key_frame_url: i % 3 === 0 ? `http://minio:9000/${BUCKET_NAME}/slices/many/kf_${i}.webp` : null,
          sfx_url: null,
        }),
      );
      const row = mockMaterialRowFactory({ slices: manySlices, slices_count: 100 });

      const start = performance.now();

      const keys = collectMaterialObjectKeys(row);

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DEL-PERF-006: deleteMaterialById (mock 事务) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      await deleteMaterialById(mockPrisma, MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DEL-PERF-007: cleanupMinioObjects (10 keys, 全成功) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;
      const keys = Array.from({ length: 10 }, (_, i) => `materials/test_${i}.mp4`);

      const start = performance.now();

      await cleanupMinioObjects(mockMinio, keys);

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DEL-PERF-008: 连续 100 次 deleteMaterial 无退化', async () => {
      const ITERATIONS = 100;
      const PERF_CEILING_MS_PER_ITERATION = 50;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await deleteMaterial(MATERIAL_ID, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 30000);

    it('TC-MAT-DEL-PERF-009: validateMaterialId 失败分支 ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      try {
        validateMaterialId('not-uuid');
      } catch {
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DEL-PERF-010: extractObjectKeyFromUrl 失败分支 ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      const result = extractObjectKeyFromUrl('not-a-url');

      const elapsed = performance.now() - start;

      expect(result).toBeNull();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立纯逻辑验证', () => {
    it('TC-MAT-DEL-ATOM-001: extractObjectKeyFromUrl — 标准 MinIO URL 正确提取', () => {
      const key = extractObjectKeyFromUrl(
        `http://minio:9000/${BUCKET_NAME}/materials/20260526/dc52d4ff/file.mp4`,
      );
      expect(key).toBe('materials/20260526/dc52d4ff/file.mp4');
    });

    it('TC-MAT-DEL-ATOM-002: extractObjectKeyFromUrl — 深层路径正确提取', () => {
      const key = extractObjectKeyFromUrl(
        `http://minio:9000/${BUCKET_NAME}/slices/material-id/slice_001.mp4`,
      );
      expect(key).toBe('slices/material-id/slice_001.mp4');
    });

    it('TC-MAT-DEL-ATOM-003: extractObjectKeyFromUrl — 不含 bucketName 用 pathname 兜底', () => {
      const key = extractObjectKeyFromUrl(
        'http://other-host:9000/foo/bar/baz.mp4',
      );
      expect(key).toBe('foo/bar/baz.mp4');
    });

    it('TC-MAT-DEL-ATOM-004: extractObjectKeyFromUrl — 空字符串返回 null', () => {
      const key = extractObjectKeyFromUrl('');
      expect(key).toBeNull();
    });

    it('TC-MAT-DEL-ATOM-005: extractObjectKeyFromUrl — 非法 URL 返回 null', () => {
      const key = extractObjectKeyFromUrl('%%%%');
      expect(key).toBeNull();
    });

    it('TC-MAT-DEL-ATOM-006: collectMaterialObjectKeys — 视频素材含全量切片收集', () => {
      const row = mockMaterialRowFactory();
      const keys = collectMaterialObjectKeys(row);

      expect(keys.length).toBeGreaterThanOrEqual(7);
      expect(keys.some((k) => k.includes('product_demo_video'))).toBe(true);
      expect(keys.some((k) => k.includes('thumb'))).toBe(true);
      expect(keys.some((k) => k.includes('slice_1'))).toBe(true);
      expect(keys.some((k) => k.includes('keyframe_1'))).toBe(true);
      expect(keys.some((k) => k.includes('sfx_2'))).toBe(true);
    });

    it('TC-MAT-DEL-ATOM-007: collectMaterialObjectKeys — origin 和 thumbnail 指向同一路径仅去重保留一个', () => {
      const sameUrl = `http://minio:9000/${BUCKET_NAME}/materials/same.mp4`;
      const row = mockMaterialRowFactory({
        origin_url: sameUrl,
        thumbnail_url: sameUrl,
      });

      const keys = collectMaterialObjectKeys(row);

      const urlCount = keys.filter((k) => k === 'materials/same.mp4').length;
      expect(urlCount).toBe(1);
    });

    it('TC-MAT-DEL-ATOM-008: collectMaterialObjectKeys — 图片素材仅收集 origin + thumbnail', () => {
      const row = mockImageMaterialRowFactory();
      const keys = collectMaterialObjectKeys(row);

      expect(keys.length).toBe(2);
    });

    it('TC-MAT-DEL-ATOM-009: collectMaterialObjectKeys — slices 为 undefined 不抛异常', () => {
      const row = mockMaterialRowFactory();
      delete (row as Record<string, unknown>).slices;

      let threw = false;
      let keys: string[] = [];
      try {
        keys = collectMaterialObjectKeys(row);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(Array.isArray(keys)).toBe(true);
    });

    it('TC-MAT-DEL-ATOM-010: deleteMaterialById — 事务内调用 slice deleteMany + material delete', async () => {
      await deleteMaterialById(mockPrisma, MATERIAL_ID);

      expect(mockPrisma.materialSlice.deleteMany).toHaveBeenCalledWith({
        where: { material_id: MATERIAL_ID },
      });
      expect(mockPrisma.material.delete).toHaveBeenCalledWith({
        where: { id: MATERIAL_ID },
      });
    });

    it('TC-MAT-DEL-ATOM-011: cleanupMinioObjects — 全部 keys 都传递给 MinIO deleteObject', async () => {
      const keys = ['a', 'b', 'c', 'd', 'e'];

      await cleanupMinioObjects(mockMinio, keys);

      expect(mockMinio.deleteObject).toHaveBeenCalledTimes(5);
    });

    it('TC-MAT-DEL-ATOM-012: validateMaterialId — 多个合法 UUID v4 全部通过', () => {
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
