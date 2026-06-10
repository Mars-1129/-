// =============================================================================
// TikStream AI — Material Detail 自动化测试基座
// 对应功能: GET /api/v1/materials/:material_id (素材详情查询 — 含完整切片列表)
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

interface TestMaterialResponse {
  material_id: string;
  product_id: string;
  file_name: string;
  type: MaterialType;
  source_type: MaterialSourceType;
  origin_url: string;
  thumbnail_url: string | null;
  file_size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  status: MaterialStatus;
  slices_count: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
  product: {
    id: string;
    title: string;
    category: string;
    selling_points: string[];
  } | null;
}

interface TestSliceResponse {
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
  status: MaterialSliceStatus;
  created_at: string;
  updated_at: string;
}

interface TestMaterialDetailResponse {
  material: TestMaterialResponse;
  slices: TestSliceResponse[];
}

type MockPrismaClient = {
  material: {
    findUnique: jest.Mock;
  };
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-26T12:00:00Z');
const MATERIAL_ID = 'dc52d4ff-0000-4000-a000-000000000010';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const SLICE_ID_1 = 'slc_20260523_000001_001';
const SLICE_ID_2 = 'slc_20260523_000002_002';
const SLICE_ID_3 = 'slc_20260523_000003_003';
const SLICE_ID_4 = 'slc_20260523_000004_004';
const SLICE_ID_5 = 'slc_20260523_000005_005';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_MATERIAL_TYPES: MaterialType[] = ['IMAGE', 'VIDEO'];
const VALID_MATERIAL_STATUSES: MaterialStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
const VALID_MATERIAL_SOURCE_TYPES: MaterialSourceType[] = ['UPLOAD', 'REFERENCE', 'GENERATED'];
const VALID_SLICE_STATUSES: MaterialSliceStatus[] = ['PENDING', 'CAPTIONING', 'EMBEDDING', 'COMPLETED', 'FAILED'];

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
  dense_caption: `A detailed shot ${index} showing the product wireless hair curler with smart temperature control, clean lighting setup, product centered in frame`,
  tags: ['wireless', `feature_${index}`, 'close-up', 'product_centered'],
  stream_url: `http://minio:9000/tikstream-assets/slices/${MATERIAL_ID}/slice_${index}.mp4`,
  key_frame_url: `http://minio:9000/tikstream-assets/slices/${MATERIAL_ID}/keyframe_${index}.webp`,
  embedding_version: index <= 3 ? 'v2.1' : null,
  sfx_url: index % 2 === 0 ? `http://minio:9000/tikstream-assets/sfx/sfx_${index}.wav` : null,
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
  origin_url: 'http://minio:9000/tikstream-assets/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/product_demo_video.mp4',
  thumbnail_url: 'http://minio:9000/tikstream-assets/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/thumb.webp',
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
  origin_url: 'http://minio:9000/tikstream-assets/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/product_demo_image.jpeg',
  thumbnail_url: 'http://minio:9000/tikstream-assets/materials/20260526/dc52d4ff-0000-4000-a000-000000000010/thumb.webp',
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

const mockPrismaClientFactory = (): MockPrismaClient => ({
  material: {
    findUnique: jest.fn(),
  },
});

// ============================================================
// 测试套件入口
// ============================================================

describe('MaterialDetail — 素材详情查询 (GET /api/v1/materials/:material_id)', () => {
  let mockPrisma: MockPrismaClient;

  // ---- 原子函数类型声明 ----

  type ValidateMaterialIdFn = (materialId: string) => void;

  type MapToMaterialDetailFn = (
    row: TestMaterialRow,
  ) => TestMaterialDetailResponse;

  type FindMaterialByIdFn = (
    prisma: MockPrismaClient,
    materialId: string,
  ) => Promise<TestMaterialRow | null>;

  type GetMaterialDetailFn = (
    materialId: string,
    deps: {
      prisma: MockPrismaClient;
      atoms: {
        validateMaterialId: ValidateMaterialIdFn;
        findMaterialById: FindMaterialByIdFn;
        mapToMaterialDetail: MapToMaterialDetailFn;
      };
    },
  ) => Promise<TestMaterialDetailResponse>;

  // ---- 原子函数实例 ----
  let validateMaterialId: ValidateMaterialIdFn;
  let mapToMaterialDetail: MapToMaterialDetailFn;
  let findMaterialById: FindMaterialByIdFn;
  let getMaterialDetail: GetMaterialDetailFn;

  beforeAll(() => {
    // ===================================================================
    // F1: validateMaterialId
    // 职责: 非空 + 非纯空白 + UUID v4 格式校验
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

      if (!UUID_V4_REGEX.test(materialId.trim())) {
        throw Object.assign(
          new Error(`material_id 不是有效的 UUID v4 格式: ${materialId}`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: {
              field: 'material_id',
              received: materialId,
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
    // F2: mapToMaterialDetail
    // 职责: Prisma 原始行 → Material + MaterialSlice[]
    // ===================================================================

    mapToMaterialDetail = (row) => {
      const rawSlices = row.slices ?? [];

      const sortedSlices = [...rawSlices].sort(
        (a, b) => a.start_time - b.start_time,
      );

      const material: TestMaterialResponse = {
        material_id: row.id,
        product_id: row.product_id,
        file_name: row.file_name,
        type: (row.type as MaterialType) || 'IMAGE',
        source_type: (row.source_type as MaterialSourceType) || 'UPLOAD',
        origin_url: row.origin_url,
        thumbnail_url: row.thumbnail_url ?? null,
        file_size_bytes: Number(row.file_size_bytes),
        duration_seconds: row.duration_seconds ?? null,
        width: row.width ?? null,
        height: row.height ?? null,
        mime_type: row.mime_type ?? null,
        status: (row.status as MaterialStatus) || 'PENDING',
        slices_count: row.slices_count,
        remark: row.remark ?? null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        product: row.product
          ? {
              id: row.product.id,
              title: row.product.title,
              category: row.product.category,
              selling_points: row.product.selling_points,
            }
          : null,
      };

      const slices: TestSliceResponse[] = sortedSlices.map((s) => ({
        id: s.id,
        material_id: s.material_id,
        slice_id: s.slice_id,
        start_time: s.start_time,
        end_time: s.end_time,
        duration: s.duration,
        dense_caption: s.dense_caption ?? null,
        tags: Array.isArray(s.tags) ? s.tags : [],
        stream_url: s.stream_url ?? null,
        key_frame_url: s.key_frame_url ?? null,
        embedding_version: s.embedding_version ?? null,
        sfx_url: s.sfx_url ?? null,
        status: (s.status as MaterialSliceStatus) || 'PENDING',
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      }));

      return { material, slices };
    };

    // ===================================================================
    // F0: getMaterialDetail (主编排器)
    // ===================================================================

    getMaterialDetail = async (materialId, deps) => {
      const { prisma, atoms } = deps;

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

      return atoms.mapToMaterialDetail(row);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();
    const materialRow = mockMaterialRowFactory();
    mockPrisma.material.findUnique.mockResolvedValue(materialRow);
  });

  const deps = () => ({
    prisma: mockPrisma,
    atoms: {
      validateMaterialId,
      findMaterialById,
      mapToMaterialDetail,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法 material_id → 完整 MaterialDetailResponse 输出', () => {
    it('TC-MAT-DETAIL-001: 返回完整响应结构 { material, slices }', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material');
      expect(result).toHaveProperty('slices');
      expect(result.material).toBeDefined();
      expect(Array.isArray(result.slices)).toBe(true);
    });

    it('TC-MAT-DETAIL-002: material 子对象包含全部 19 个字段', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      const m = result.material;

      expect(m).toHaveProperty('material_id');
      expect(typeof m.material_id).toBe('string');
      expect(m.material_id).toBe(MATERIAL_ID);

      expect(m).toHaveProperty('product_id');
      expect(typeof m.product_id).toBe('string');

      expect(m).toHaveProperty('file_name');
      expect(typeof m.file_name).toBe('string');

      expect(m).toHaveProperty('type');
      expect(VALID_MATERIAL_TYPES).toContain(m.type);

      expect(m).toHaveProperty('source_type');
      expect(VALID_MATERIAL_SOURCE_TYPES).toContain(m.source_type);

      expect(m).toHaveProperty('origin_url');
      expect(typeof m.origin_url).toBe('string');

      expect(m).toHaveProperty('thumbnail_url');

      expect(m).toHaveProperty('file_size_bytes');
      expect(typeof m.file_size_bytes).toBe('number');
      expect(m.file_size_bytes).toBeGreaterThan(0);

      expect(m).toHaveProperty('duration_seconds');

      expect(m).toHaveProperty('width');
      expect(m).toHaveProperty('height');

      expect(m).toHaveProperty('mime_type');

      expect(m).toHaveProperty('status');
      expect(VALID_MATERIAL_STATUSES).toContain(m.status);

      expect(m).toHaveProperty('slices_count');
      expect(typeof m.slices_count).toBe('number');
      expect(m.slices_count).toBeGreaterThanOrEqual(0);

      expect(m).toHaveProperty('remark');

      expect(m).toHaveProperty('created_at');
      expect(() => new Date(m.created_at)).not.toThrow();

      expect(m).toHaveProperty('updated_at');
      expect(() => new Date(m.updated_at)).not.toThrow();

      expect(m).toHaveProperty('product');
    });

    it('TC-MAT-DETAIL-003: material.product 嵌套对象包含必需字段', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      const product = result.material.product;

      expect(product).toBeDefined();
      expect(product).not.toBeNull();
      if (product) {
        expect(product).toHaveProperty('id');
        expect(typeof product.id).toBe('string');

        expect(product).toHaveProperty('title');
        expect(typeof product.title).toBe('string');

        expect(product).toHaveProperty('category');
        expect(typeof product.category).toBe('string');

        expect(product).toHaveProperty('selling_points');
        expect(Array.isArray(product.selling_points)).toBe(true);
      }
    });

    it('TC-MAT-DETAIL-004: 每个 Slice 包含全部 15 个字段', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices.length).toBeGreaterThan(0);

      const slice = result.slices[0];

      expect(slice).toHaveProperty('id');
      expect(typeof slice.id).toBe('string');

      expect(slice).toHaveProperty('material_id');
      expect(typeof slice.material_id).toBe('string');

      expect(slice).toHaveProperty('slice_id');
      expect(typeof slice.slice_id).toBe('string');

      expect(slice).toHaveProperty('start_time');
      expect(typeof slice.start_time).toBe('number');

      expect(slice).toHaveProperty('end_time');
      expect(typeof slice.end_time).toBe('number');

      expect(slice).toHaveProperty('duration');
      expect(typeof slice.duration).toBe('number');

      expect(slice).toHaveProperty('dense_caption');

      expect(slice).toHaveProperty('tags');
      expect(Array.isArray(slice.tags)).toBe(true);

      expect(slice).toHaveProperty('stream_url');

      expect(slice).toHaveProperty('key_frame_url');

      expect(slice).toHaveProperty('embedding_version');

      expect(slice).toHaveProperty('sfx_url');

      expect(slice).toHaveProperty('status');
      expect(VALID_SLICE_STATUSES).toContain(slice.status);

      expect(slice).toHaveProperty('created_at');
      expect(() => new Date(slice.created_at)).not.toThrow();

      expect(slice).toHaveProperty('updated_at');
      expect(() => new Date(slice.updated_at)).not.toThrow();
    });

    it('TC-MAT-DETAIL-005: slices 按 start_time ASC 排序', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      for (let i = 1; i < result.slices.length; i++) {
        expect(result.slices[i].start_time).toBeGreaterThanOrEqual(
          result.slices[i - 1].start_time,
        );
      }
    });

    it('TC-MAT-DETAIL-006: BigInt file_size_bytes → Number 正确转换', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(typeof result.material.file_size_bytes).toBe('number');
      expect(result.material.file_size_bytes).toBe(15 * 1024 * 1024);
      expect(Number.isSafeInteger(result.material.file_size_bytes)).toBe(true);
    });

    it('TC-MAT-DETAIL-007: Date 字段正确转为 ISO8601 字符串', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.created_at).toBe(NOW.toISOString());
      expect(result.material.updated_at).toBe(NOW.toISOString());

      result.slices.forEach((slice) => {
        expect(() => new Date(slice.created_at)).not.toThrow();
        expect(() => new Date(slice.updated_at)).not.toThrow();
      });
    });

    it('TC-MAT-DETAIL-008: slices_count 与 slices 数组长度一致', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.slices_count).toBe(result.slices.length);
    });

    it('TC-MAT-DETAIL-009: 图片素材 duration_seconds 为 null，slices 只有一条 duration=0', async () => {
      const imageRow = mockImageMaterialRowFactory();
      mockPrisma.material.findUnique.mockResolvedValue(imageRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.duration_seconds).toBeNull();
      expect(result.material.type).toBe('IMAGE');
      expect(result.slices.length).toBe(1);
      expect(result.slices[0].duration).toBe(0);
    });

    it('TC-MAT-DETAIL-010: 切片包含完整 Dense Caption 和 Tags', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices[0].dense_caption).not.toBeNull();
      expect(typeof result.slices[0].dense_caption).toBe('string');
      expect(result.slices[0].dense_caption!.length).toBeGreaterThan(0);

      expect(result.slices[0].tags.length).toBeGreaterThan(0);
      result.slices[0].tags.forEach((tag) => {
        expect(typeof tag).toBe('string');
      });
    });

    it('TC-MAT-DETAIL-011: stream_url 和 key_frame_url 正确透传', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices[0].stream_url).not.toBeNull();
      expect(result.slices[0].stream_url).toContain('minio:9000');
      expect(result.slices[0].key_frame_url).not.toBeNull();
    });

    it('TC-MAT-DETAIL-012: embedding_version 和 sfx_url 正确透传', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices[0].embedding_version).toBe('v2.1');

      const evenSlice = result.slices.find((s) => s.sfx_url !== null);
      expect(evenSlice).toBeDefined();
    });

    it('TC-MAT-DETAIL-013: remark 字段正确透传', async () => {
      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.remark).toBe('核心素材-主视觉');
    });

    it('TC-MAT-DETAIL-014: source_type=REFERENCE 正确透传', async () => {
      const refRow = mockMaterialRowFactory({ source_type: 'REFERENCE' });
      mockPrisma.material.findUnique.mockResolvedValue(refRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.source_type).toBe('REFERENCE');
    });

    it('TC-MAT-DETAIL-015: status=PROCESSING 正确透传', async () => {
      const processingRow = mockMaterialRowFactory({ status: 'PROCESSING' });
      mockPrisma.material.findUnique.mockResolvedValue(processingRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.status).toBe('PROCESSING');
    });

    it('TC-MAT-DETAIL-016: source_type=GENERATED 正确透传', async () => {
      const genRow = mockMaterialRowFactory({ source_type: 'GENERATED' });
      mockPrisma.material.findUnique.mockResolvedValue(genRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.source_type).toBe('GENERATED');
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-MAT-DETAIL-BND-001: material_id 首尾含空格 → UUID 校验后仍合法', async () => {
      const result = await getMaterialDetail(`  ${MATERIAL_ID}  `, deps());

      expect(result.material.material_id).toBe(MATERIAL_ID);
    });

    it('TC-MAT-DETAIL-BND-002: slices 为空数组 → 返回 slices=[]', async () => {
      const noSliceRow = { ...mockMaterialRowFactory(), slices: [], slices_count: 0 };
      mockPrisma.material.findUnique.mockResolvedValue(noSliceRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices).toEqual([]);
      expect(result.slices.length).toBe(0);
      expect(result.material.slices_count).toBe(0);
    });

    it('TC-MAT-DETAIL-BND-003: product 为 null → product 返回 null', async () => {
      const orphanRow = { ...mockMaterialRowFactory(), product: null };
      mockPrisma.material.findUnique.mockResolvedValue(orphanRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.product).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-004: thumbnail_url 为 null → 正确返回 null', async () => {
      const noThumbRow = mockMaterialRowFactory({ thumbnail_url: null });
      mockPrisma.material.findUnique.mockResolvedValue(noThumbRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.thumbnail_url).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-005: remark 为 null → 正确返回 null', async () => {
      const noRemarkRow = mockMaterialRowFactory({ remark: null });
      mockPrisma.material.findUnique.mockResolvedValue(noRemarkRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.remark).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-006: width/height 为 null → 正确返回 null', async () => {
      const noDimRow = mockMaterialRowFactory({ width: null, height: null });
      mockPrisma.material.findUnique.mockResolvedValue(noDimRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.width).toBeNull();
      expect(result.material.height).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-007: mime_type 为 null → 正确返回 null', async () => {
      const noMimeRow = mockMaterialRowFactory({ mime_type: null });
      mockPrisma.material.findUnique.mockResolvedValue(noMimeRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.mime_type).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-008: 切片 dense_caption 为 null → 正确返回 null', async () => {
      const nullCaptionSlice = mockSliceRowFactory(1, { dense_caption: null });
      const row = mockMaterialRowFactory({ slices: [nullCaptionSlice] });
      mockPrisma.material.findUnique.mockResolvedValue(row);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices[0].dense_caption).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-009: 切片 tags 为 null/undefined → 返回空数组', async () => {
      const nullTagsSlice = mockSliceRowFactory(1, { tags: null as unknown as string[] });
      const row = mockMaterialRowFactory({ slices: [nullTagsSlice] });
      mockPrisma.material.findUnique.mockResolvedValue(row);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(Array.isArray(result.slices[0].tags)).toBe(true);
      expect(result.slices[0].tags).toEqual([]);
    });

    it('TC-MAT-DETAIL-BND-010: 切片 stream_url/key_frame_url/sfx_url 为 null → 正确返回 null', async () => {
      const nullUrlSlice = mockSliceRowFactory(1, {
        stream_url: null,
        key_frame_url: null,
        sfx_url: null,
      });
      const row = mockMaterialRowFactory({ slices: [nullUrlSlice] });
      mockPrisma.material.findUnique.mockResolvedValue(row);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices[0].stream_url).toBeNull();
      expect(result.slices[0].key_frame_url).toBeNull();
      expect(result.slices[0].sfx_url).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-011: 切片 embedding_version 为 null → 正确返回 null', async () => {
      const nullEmbSlice = mockSliceRowFactory(1, { embedding_version: null });
      const row = mockMaterialRowFactory({ slices: [nullEmbSlice] });
      mockPrisma.material.findUnique.mockResolvedValue(row);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices[0].embedding_version).toBeNull();
    });

    it('TC-MAT-DETAIL-BND-012: 大量切片 (20个) → 全部正确映射', async () => {
      const manySlices = Array.from({ length: 20 }, (_, i) =>
        mockSliceRowFactory(i + 1, {
          slice_id: `slc_20260523_${String(i + 1).padStart(6, '0')}_001`,
          start_time: i * 1.5,
          end_time: (i + 1) * 1.5,
          duration: 1.5,
        }),
      );
      const row = mockMaterialRowFactory({ slices: manySlices, slices_count: 20 });
      mockPrisma.material.findUnique.mockResolvedValue(row);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices.length).toBe(20);
      expect(result.material.slices_count).toBe(20);

      for (let i = 1; i < result.slices.length; i++) {
        expect(result.slices[i].start_time).toBeGreaterThanOrEqual(
          result.slices[i - 1].start_time,
        );
      }
    });

    it('TC-MAT-DETAIL-BND-013: file_size_bytes 为大值 (200MB) → Number 安全转换', async () => {
      const largeRow = mockMaterialRowFactory({
        file_size_bytes: BigInt(200 * 1024 * 1024),
      });
      mockPrisma.material.findUnique.mockResolvedValue(largeRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.file_size_bytes).toBe(200 * 1024 * 1024);
    });

    it('TC-MAT-DETAIL-BND-014: duration_seconds 非整数 (12.56) → 正确保留小数', async () => {
      const decimalRow = mockMaterialRowFactory({ duration_seconds: 12.56 });
      mockPrisma.material.findUnique.mockResolvedValue(decimalRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.material.duration_seconds).toBe(12.56);
    });

    it('TC-MAT-DETAIL-BND-015: 切片 duration 为 0 (图片) → 正确返回', async () => {
      const imgRow = mockImageMaterialRowFactory();
      mockPrisma.material.findUnique.mockResolvedValue(imgRow);

      const result = await getMaterialDetail(MATERIAL_ID, deps());

      expect(result.slices[0].duration).toBe(0);
      expect(result.slices[0].start_time).toBe(0);
      expect(result.slices[0].end_time).toBe(0);
    });
  });

  // ===========================================================================
  // 3. 异常流（Exception / Error Handling）
  // ===========================================================================

  describe('【异常流】人为制造报错场景 → 精准抛出规范错误码', () => {
    it('TC-MAT-DETAIL-ERR-001: material_id 为空字符串 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await getMaterialDetail('', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details).toBeDefined();
      expect(caught!.details!.field).toBe('material_id');
      expect(caught!.details!.reason).toBe('missing_or_empty');
    });

    it('TC-MAT-DETAIL-ERR-002: material_id 为纯空格 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getMaterialDetail('   ', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MAT-DETAIL-ERR-003: material_id 为 null → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getMaterialDetail(null as unknown as string, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DETAIL-ERR-004: material_id 为 undefined → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getMaterialDetail(undefined as unknown as string, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DETAIL-ERR-005: material_id 不是 UUID → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await getMaterialDetail('not-a-valid-uuid', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.details).toBeDefined();
      expect(caught!.details!.field).toBe('material_id');
      expect(caught!.details!.received).toBe('not-a-valid-uuid');
      expect(caught!.details!.expected).toContain('UUID v4');
    });

    it('TC-MAT-DETAIL-ERR-006: material_id 长度不对 (太短) → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getMaterialDetail('abc-123', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DETAIL-ERR-007: material_id 含特殊字符 → 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getMaterialDetail('dc52d4ff-0000-4000-a000-000000000010; DROP TABLE materials;--', deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DETAIL-ERR-008: 数据库中不存在该素材 → 抛出 MATERIAL_NOT_FOUND', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await getMaterialDetail(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.retryable).toBe(false);
      expect(caught!.details).toBeDefined();
      expect(caught!.details!.material_id).toBe(MATERIAL_ID);
    });

    it('TC-MAT-DETAIL-ERR-009: Prisma P1001 数据库连接超时 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p1001Error = Object.assign(new Error('Connection timeout'), { code: 'P1001' });
      mockPrisma.material.findUnique.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getMaterialDetail(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-DETAIL-ERR-010: Prisma P2024 连接池耗尽 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2024Error = Object.assign(new Error('Timed out fetching connection from pool'), { code: 'P2024' });
      mockPrisma.material.findUnique.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getMaterialDetail(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-DETAIL-ERR-011: Prisma P2028 事务冲突 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const p2028Error = Object.assign(new Error('Transaction API error'), { code: 'P2028' });
      mockPrisma.material.findUnique.mockRejectedValue(p2028Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getMaterialDetail(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-DETAIL-ERR-012: 未知 Prisma 错误码 (P9999) → 抛出 INTERNAL_SERVER_ERROR (non-retryable)', async () => {
      const p9999Error = Object.assign(new Error('Mysterious Prisma error'), { code: 'P9999' });
      mockPrisma.material.findUnique.mockRejectedValue(p9999Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await getMaterialDetail(MATERIAL_ID, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(false);
    });

    it('TC-MAT-DETAIL-ERR-013: material_id 合法 UUID 但 variant 不是 8/9/a/b → 抛出 INVALID_REQUEST', async () => {
      const nonV4Uuid = 'dc52d4ff-0000-4000-0000-000000000010';
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getMaterialDetail(nonV4Uuid, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-DETAIL-ERR-014: material_id 合法 UUID 但 version 不是 4 → 抛出 INVALID_REQUEST', async () => {
      const v1Uuid = 'dc52d4ff-0000-1000-a000-000000000010';
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getMaterialDetail(v1Uuid, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    it('TC-MAT-DETAIL-PERF-001: getMaterialDetail 编排总耗时 ≤ 2000ms (mock 全链路)', async () => {
      const PERF_CEILING_MS = 2000;

      const start = performance.now();

      await getMaterialDetail(MATERIAL_ID, deps());

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 5000);

    it('TC-MAT-DETAIL-PERF-002: validateMaterialId ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      validateMaterialId(MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DETAIL-PERF-003: mapToMaterialDetail (5 slices) ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;
      const row = mockMaterialRowFactory();

      const start = performance.now();

      const result = mapToMaterialDetail(row);

      const elapsed = performance.now() - start;

      expect(result.slices.length).toBe(5);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DETAIL-PERF-004: mapToMaterialDetail (50 slices) ≤ 10ms', () => {
      const PERF_CEILING_MS = 10;
      const manySlices = Array.from({ length: 50 }, (_, i) =>
        mockSliceRowFactory(i + 1, {
          slice_id: `slc_20260523_${String(i + 1).padStart(6, '0')}_001`,
          start_time: i * 0.5,
          end_time: (i + 1) * 0.5,
          duration: 0.5,
        }),
      );
      const row = mockMaterialRowFactory({ slices: manySlices, slices_count: 50 });

      const start = performance.now();

      const result = mapToMaterialDetail(row);

      const elapsed = performance.now() - start;

      expect(result.slices.length).toBe(50);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DETAIL-PERF-005: validateMaterialId 失败分支 ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      try {
        validateMaterialId('not-a-uuid');
      } catch {
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DETAIL-PERF-006: 连续 100 次 getMaterialDetail 无退化', async () => {
      const ITERATIONS = 100;
      const PERF_CEILING_MS_PER_ITERATION = 50;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await getMaterialDetail(MATERIAL_ID, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 30000);

    it('TC-MAT-DETAIL-PERF-007: mapToMaterialDetail (空 slices) ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const row = mockMaterialRowFactory({ slices: [], slices_count: 0 });

      const start = performance.now();

      const result = mapToMaterialDetail(row);

      const elapsed = performance.now() - start;

      expect(result.slices).toEqual([]);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-DETAIL-PERF-008: findMaterialById (mock DB) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      const result = await findMaterialById(mockPrisma, MATERIAL_ID);

      const elapsed = performance.now() - start;

      expect(result).not.toBeNull();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立纯逻辑验证', () => {
    it('TC-MAT-DETAIL-ATOM-001: validateMaterialId — 标准 UUID v4 通过', () => {
      expect(() => validateMaterialId(MATERIAL_ID)).not.toThrow();
    });

    it('TC-MAT-DETAIL-ATOM-002: validateMaterialId — 多个合法 UUID v4 全部通过', () => {
      const validUuids = [
        '00000000-0000-4000-8000-000000000001',
        'ffffffff-ffff-4fff-bfff-ffffffffffff',
        '123e4567-e89b-42d3-a456-426614174000',
        'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6',
      ];

      validUuids.forEach((uuid) => {
        expect(() => validateMaterialId(uuid)).not.toThrow();
      });
    });

    it('TC-MAT-DETAIL-ATOM-003: validateMaterialId — 非法 UUID 逐一被拦截', () => {
      const invalidCases = [
        { input: 'hello', label: '普通字符串' },
        { input: '', label: '空字符串' },
        { input: '   ', label: '纯空格' },
        { input: '12345678-1234-1234-1234-123456789012', label: 'version 1 UUID' },
        { input: '12345678-1234-3234-1234-123456789012', label: 'version 3 UUID' },
        { input: '12345678-1234-5234-1234-123456789012', label: 'version 5 UUID' },
        { input: '12345678-1234-4234-1234-12345678901', label: '长度不足' },
        { input: '12345678-1234-4234-1234-1234567890123', label: '长度溢出' },
      ];

      invalidCases.forEach(({ input, label }) => {
        try {
          validateMaterialId(input);
          throw new Error(`Should have thrown for: ${label} (input="${input}")`);
        } catch (err) {
          const e = err as Error & { errorCode?: string };
          expect(e.errorCode).toBe('INVALID_REQUEST');
        }
      });
    });

    it('TC-MAT-DETAIL-ATOM-004: mapToMaterialDetail — material_id 字段映射正确', () => {
      const row = mockMaterialRowFactory();
      const result = mapToMaterialDetail(row);

      expect(result.material.material_id).toBe(row.id);
    });

    it('TC-MAT-DETAIL-ATOM-005: mapToMaterialDetail — file_name/type/source_type 直传', () => {
      const row = mockMaterialRowFactory();
      const result = mapToMaterialDetail(row);

      expect(result.material.file_name).toBe(row.file_name);
      expect(result.material.type).toBe(row.type);
      expect(result.material.source_type).toBe(row.source_type);
    });

    it('TC-MAT-DETAIL-ATOM-006: mapToMaterialDetail — product 字段完整映射', () => {
      const row = mockMaterialRowFactory();
      const result = mapToMaterialDetail(row);

      expect(result.material.product).not.toBeNull();
      if (result.material.product) {
        expect(result.material.product.id).toBe(row.product!.id);
        expect(result.material.product.title).toBe(row.product!.title);
        expect(result.material.product.category).toBe(row.product!.category);
        expect(result.material.product.selling_points).toEqual(
          row.product!.selling_points,
        );
      }
    });

    it('TC-MAT-DETAIL-ATOM-007: mapToMaterialDetail — slices 状态值全部正确', () => {
      const row = mockMaterialRowFactory();
      const result = mapToMaterialDetail(row);

      const statuses = result.slices.map((s) => s.status);
      expect(statuses[0]).toBe('COMPLETED');
      expect(statuses[1]).toBe('COMPLETED');
      expect(statuses[2]).toBe('COMPLETED');
      expect(statuses[3]).toBe('CAPTIONING');
      expect(statuses[4]).toBe('PENDING');
    });

    it('TC-MAT-DETAIL-ATOM-008: mapToMaterialDetail — slices 乱序输入按 start_time 排序输出', () => {
      const unorderedSlices = [
        mockSliceRowFactory(5, { start_time: 12.0, end_time: 15.0 }),
        mockSliceRowFactory(1, { start_time: 0.0, end_time: 3.0 }),
        mockSliceRowFactory(3, { start_time: 6.0, end_time: 9.0 }),
        mockSliceRowFactory(2, { start_time: 3.0, end_time: 6.0 }),
        mockSliceRowFactory(4, { start_time: 9.0, end_time: 12.0 }),
      ];
      const row = mockMaterialRowFactory({ slices: unorderedSlices, slices_count: 5 });

      const result = mapToMaterialDetail(row);

      for (let i = 1; i < result.slices.length; i++) {
        expect(result.slices[i].start_time).toBeGreaterThanOrEqual(
          result.slices[i - 1].start_time,
        );
      }
    });

    it('TC-MAT-DETAIL-ATOM-009: mapToMaterialDetail — BigInt to Number 转换精度', () => {
      const values = [
        BigInt(0),
        BigInt(1),
        BigInt(524288),
        BigInt(10 * 1024 * 1024),
        BigInt(200 * 1024 * 1024),
        BigInt(Number.MAX_SAFE_INTEGER),
      ];

      values.forEach((val) => {
        const row = mockMaterialRowFactory({ file_size_bytes: val });
        const result = mapToMaterialDetail(row);
        expect(typeof result.material.file_size_bytes).toBe('number');
        expect(result.material.file_size_bytes).toBe(Number(val));
      });
    });

    it('TC-MAT-DETAIL-ATOM-010: findMaterialById — 正确记录 → 非 null', async () => {
      const result = await findMaterialById(mockPrisma, MATERIAL_ID);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.id).toBe(MATERIAL_ID);
      }
    });

    it('TC-MAT-DETAIL-ATOM-011: findMaterialById — 不存在记录 → 返回 null', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);

      const result = await findMaterialById(mockPrisma, MATERIAL_ID);

      expect(result).toBeNull();
    });
  });
});
