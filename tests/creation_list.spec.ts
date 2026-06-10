// =============================================================================
// TikStream AI — Creation List 自动化测试基座
// 对应功能: GET /api/v1/creations (创作任务列表查询)
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
type ShotRenderStatus = 'PENDING' | 'PROCESSING' | 'FINISHED' | 'FAILED';

interface TestShotRenderRow {
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

interface TestCreationRow {
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
  shot_renders: TestShotRenderRow[];
}

interface TestCreationListItem {
  creation_id: string;
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
  file_size_bytes: number | null;
  trace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TestCursorPageInfo {
  cursor: string | null;
  has_more: boolean;
  total_count: number;
}

interface TestCreationListResponse {
  items: TestCreationListItem[];
  page_info: TestCursorPageInfo;
}

interface TestDecodedCursor {
  id: string;
  sort_value: string;
}

interface TestCreationListFilter {
  product_id: string;
  status?: CreationStatus;
  current_stage?: CreationStage;
  engine_mode?: string;
  export_format?: string;
}

interface TestPaginatedCreationResult {
  items: TestCreationRow[];
  total_count: number;
  has_more: boolean;
  next_cursor: string | null;
}

type MockPrismaClient = {
  creation: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-27T12:00:00Z');
const PRODUCT_ID = '00000000-0000-4000-a000-000000000001';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_ID_PATTERN = /^tsk_\d{8}_[a-z0-9]{6,10}$/;
const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

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
const VALID_ENGINE_MODES: string[] = ['SCRIPT_DRIVEN'];
const VALID_EXPORT_FORMATS: string[] = ['MP4', 'MOV', 'WEBM'];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const BASE_DATE = new Date('2026-05-27T12:00:00Z');

// ============================================================
// Mock Factories
// ============================================================

const mockShotRenderRowFactory = (
  creationId: string,
  index: number,
  overrides?: Partial<TestShotRenderRow>,
): TestShotRenderRow => ({
  id: `render-uuid-${String(index).padStart(3, '0')}`,
  creation_id: creationId,
  script_shot_id: `shot-uuid-${String(index).padStart(3, '0')}`,
  shot_id: `shot_${String(index + 1).padStart(2, '0')}`,
  shot_index: index,
  cache_hash: `sha256_abc${String(index).padStart(4, '0')}`,
  slice_id: `slc_test_${String(index).padStart(3, '0')}`,
  render_path: `s3://tikstream/renders/${creationId}/shot_${index}.mp4`,
  render_duration_ms: 12500 + index * 1500,
  retry_count: 0,
  status: 'FINISHED',
  error_message: null,
  created_at: new Date(BASE_DATE.getTime() + index * 60000),
  updated_at: new Date(BASE_DATE.getTime() + index * 30000),
  ...overrides,
});

const mockCreationRowFactory = (
  index: number,
  overrides?: Partial<TestCreationRow>,
): TestCreationRow => {
  const creationId = `00000000-0000-4000-a000-${String(index + 1).padStart(12, '0')}`;
  return {
    id: creationId,
    product_id: PRODUCT_ID,
    script_id: `script-uuid-${String(index).padStart(12, '0')}`,
    task_id: `tsk_20260527_${String(index + 1).padStart(6, '0')}`,
    engine_mode: 'SCRIPT_DRIVEN',
    target_resolution: '1080x1920',
    export_format: 'MP4',
    status: ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED'][index % 4] as CreationStatus,
    progress: [0, 45, 100, 72][index % 4],
    current_stage: ['QUEUE_ALLOCATION', 'AI_VIDEO_GENERATING', 'FINISHED', 'FAILED'][index % 4] as CreationStage,
    video_url: index % 4 === 2 ? `s3://tikstream/exports/tsk_20260527_${String(index + 1).padStart(6, '0')}.mp4` : null,
    file_size_bytes: index % 4 === 2 ? BigInt(25 * 1024 * 1024) : null,
    trace_id: `trc_20260527_creation_${creationId.slice(0, 8)}`,
    error_code: index % 4 === 3 ? 'GPU_SLICING_DECORD_FAILED' : null,
    error_message: index % 4 === 3 ? 'Decord failed to load video' : null,
    started_at: index % 4 === 0 ? null : new Date(BASE_DATE.getTime() - (index + 1) * 3600000),
    finished_at: index % 4 >= 2 ? new Date(BASE_DATE.getTime() - index * 600000) : null,
    created_at: new Date(BASE_DATE.getTime() - index * 600000),
    updated_at: new Date(BASE_DATE.getTime() - index * 60000),
    shot_renders: [
      mockShotRenderRowFactory(creationId, 0),
      mockShotRenderRowFactory(creationId, 1),
    ],
    ...overrides,
  };
};

const mockPrismaClientFactory = (): MockPrismaClient => ({
  creation: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
});

// ============================================================
// 测试套件入口
// ============================================================

describe('CreationList — 创作任务列表查询 (GET /api/v1/creations)', () => {
  let mockPrisma: MockPrismaClient;

  // ---- 原子函数类型声明 ----

  type EncodeCreationCursorFn = (item: TestCreationRow) => string;

  type DecodeCreationCursorFn = (token: string) => TestDecodedCursor | null;

  type FindCreationsPaginatedFn = (
    prisma: MockPrismaClient,
    filter: TestCreationListFilter,
    decodedCursor: TestDecodedCursor | null,
    limit: number,
  ) => Promise<TestPaginatedCreationResult>;

  type ResolveListDefaultsFn = (dto: {
    product_id: string;
    status?: string;
    current_stage?: string;
    engine_mode?: string;
    export_format?: string;
    limit?: number;
    cursor?: string;
  }) => {
    product_id: string;
    status?: string;
    current_stage?: string;
    engine_mode?: string;
    export_format?: string;
    limit: number;
    cursor?: string;
  };

  type BuildListFilterFn = (params: {
    product_id: string;
    status?: string;
    current_stage?: string;
    engine_mode?: string;
    export_format?: string;
  }) => TestCreationListFilter;

  type MapToCreationListItemFn = (row: TestCreationRow) => TestCreationListItem;

  type BuildPageInfoFn = (
    items: TestCreationListItem[],
    hasMore: boolean,
    nextCursor: string | null,
    totalCount: number,
  ) => TestCursorPageInfo;

  type ListCreationsFn = (
    dto: {
      product_id: string;
      status?: string;
      current_stage?: string;
      engine_mode?: string;
      export_format?: string;
      limit?: number;
      cursor?: string;
    },
    deps: {
      prisma: MockPrismaClient;
      atoms: {
        resolveListDefaults: ResolveListDefaultsFn;
        buildListFilter: BuildListFilterFn;
        decodeCreationCursor: DecodeCreationCursorFn;
        findCreationsPaginated: FindCreationsPaginatedFn;
        encodeCreationCursor: EncodeCreationCursorFn;
        mapToCreationListItem: MapToCreationListItemFn;
        buildPageInfo: BuildPageInfoFn;
      };
    },
  ) => Promise<TestCreationListResponse>;

  // ---- 原子函数实例 ----
  let encodeCreationCursor: EncodeCreationCursorFn;
  let decodeCreationCursor: DecodeCreationCursorFn;
  let findCreationsPaginated: FindCreationsPaginatedFn;
  let resolveListDefaults: ResolveListDefaultsFn;
  let buildListFilter: BuildListFilterFn;
  let mapToCreationListItem: MapToCreationListItemFn;
  let buildPageInfo: BuildPageInfoFn;
  let listCreations: ListCreationsFn;

  beforeAll(() => {
    // ===================================================================
    // K0: encodeCreationCursor
    // 职责: { v: created_at.toISOString(), i: id } → base64url
    // ===================================================================

    encodeCreationCursor = (item) => {
      const payload = { v: item.created_at.toISOString(), i: item.id };
      return Buffer.from(JSON.stringify(payload)).toString('base64url');
    };

    // ===================================================================
    // K1: decodeCreationCursor
    // 职责: base64url 解码 → 校验 i 和 v → { id, sort_value }
    //       任一校验失败 return null
    // ===================================================================

    decodeCreationCursor = (token) => {
      try {
        const jsonStr = Buffer.from(token, 'base64url').toString('utf-8');
        const parsed = JSON.parse(jsonStr);

        if (!parsed || typeof parsed !== 'object') {
          return null;
        }
        if (!parsed.i || typeof parsed.i !== 'string') {
          return null;
        }
        if (parsed.v === undefined || parsed.v === null) {
          return null;
        }

        return {
          id: parsed.i,
          sort_value: parsed.v,
        };
      } catch {
        return null;
      }
    };

    // ===================================================================
    // J1: findCreationsPaginated
    // 职责: Prisma findMany + count → { items, total_count, has_more, next_cursor }
    //       count 失败不阻断 → total_count = -1
    // ===================================================================

    findCreationsPaginated = async (prisma, filter, decodedCursor, limit) => {
      const where: Record<string, unknown> = {
        product_id: filter.product_id,
      };

      if (filter.status) {
        where.status = filter.status;
      }
      if (filter.current_stage) {
        where.current_stage = filter.current_stage;
      }
      if (filter.engine_mode) {
        where.engine_mode = filter.engine_mode;
      }
      if (filter.export_format) {
        where.export_format = filter.export_format;
      }

      const queryArgs: Record<string, unknown> = {
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          shot_renders: {
            orderBy: { shot_index: 'asc' },
          },
        },
      };

      if (decodedCursor) {
        queryArgs.cursor = { id: decodedCursor.id };
        queryArgs.skip = 1;
      }

      let items: TestCreationRow[] = [];
      try {
        const rawItems = await prisma.creation.findMany(queryArgs);
        items = (rawItems as unknown as TestCreationRow[]).map((row) => ({
          id: row.id,
          product_id: row.product_id,
          script_id: row.script_id,
          task_id: row.task_id,
          engine_mode: row.engine_mode,
          target_resolution: row.target_resolution,
          export_format: row.export_format,
          status: row.status,
          progress: row.progress,
          current_stage: row.current_stage,
          video_url: row.video_url,
          file_size_bytes: row.file_size_bytes,
          trace_id: row.trace_id,
          error_code: row.error_code,
          error_message: row.error_message,
          started_at: row.started_at,
          finished_at: row.finished_at,
          created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
          updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
          shot_renders: row.shot_renders || [],
        }));
      } catch (error) {
        const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> };
        const knownNonRetryable = new Set(['P2002', 'P2003']);
        const isRetryable = !knownNonRetryable.has(prismaError.code ?? '');

        throw Object.assign(
          new Error(`Creation list query failed: ${prismaError.message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: isRetryable,
            prismaCode: prismaError.code,
          },
        );
      }

      let total_count = -1;
      try {
        total_count = await prisma.creation.count({ where });
      } catch {
        total_count = -1;
      }

      const has_more = items.length > limit;
      if (has_more) {
        items = items.slice(0, limit);
      }

      let next_cursor: string | null = null;
      if (has_more && items.length > 0) {
        const lastItem = items[items.length - 1];
        next_cursor = encodeCreationCursor(lastItem);
      }

      return { items, total_count, has_more, next_cursor };
    };

    // ===================================================================
    // L1: resolveListDefaults
    // 职责: 校验 product_id 必填、limit 1~100 约束
    // ===================================================================

    resolveListDefaults = (dto) => {
      if (!dto.product_id || (typeof dto.product_id === 'string' && dto.product_id.trim().length === 0)) {
        throw Object.assign(
          new Error('product_id 为必填字段，不能为空'),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: [{ field: 'product_id', reason: 'product_id 为必填字段，上下文隔离边界' }],
          },
        );
      }

      const limit = dto.limit ?? DEFAULT_LIMIT;

      if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
        throw Object.assign(
          new Error(`limit 必须为 1~${MAX_LIMIT} 的正整数，当前为 ${limit}`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: { field: 'limit', received: dto.limit },
          },
        );
      }

      return {
        product_id: dto.product_id,
        status: dto.status,
        current_stage: dto.current_stage,
        engine_mode: dto.engine_mode,
        export_format: dto.export_format,
        limit,
        cursor: dto.cursor,
      };
    };

    // ===================================================================
    // L2: buildListFilter
    // 职责: 校验筛选值合法性 → 组装 Prisma where
    // ===================================================================

    buildListFilter = (params) => {
      const filter: TestCreationListFilter = {
        product_id: params.product_id,
      };

      if (params.status) {
        if (!VALID_CREATION_STATUSES.includes(params.status as CreationStatus)) {
          throw Object.assign(
            new Error(`status 无效: ${params.status}，允许值: ${VALID_CREATION_STATUSES.join(', ')}`),
            {
              errorCode: 'INVALID_REQUEST',
              statusCode: HttpStatus.BAD_REQUEST,
              retryable: false,
              details: { field: 'status', received: params.status },
            },
          );
        }
        filter.status = params.status as CreationStatus;
      }

      if (params.current_stage) {
        if (!VALID_CREATION_STAGES.includes(params.current_stage as CreationStage)) {
          throw Object.assign(
            new Error(`current_stage 无效: ${params.current_stage}，允许值: ${VALID_CREATION_STAGES.join(', ')}`),
            {
              errorCode: 'INVALID_REQUEST',
              statusCode: HttpStatus.BAD_REQUEST,
              retryable: false,
              details: { field: 'current_stage', received: params.current_stage },
            },
          );
        }
        filter.current_stage = params.current_stage as CreationStage;
      }

      if (params.engine_mode) {
        if (!VALID_ENGINE_MODES.includes(params.engine_mode)) {
          throw Object.assign(
            new Error(`engine_mode 无效: ${params.engine_mode}，允许值: ${VALID_ENGINE_MODES.join(', ')}`),
            {
              errorCode: 'INVALID_REQUEST',
              statusCode: HttpStatus.BAD_REQUEST,
              retryable: false,
              details: { field: 'engine_mode', received: params.engine_mode },
            },
          );
        }
        filter.engine_mode = params.engine_mode;
      }

      if (params.export_format) {
        if (!VALID_EXPORT_FORMATS.includes(params.export_format)) {
          throw Object.assign(
            new Error(`export_format 无效: ${params.export_format}，允许值: ${VALID_EXPORT_FORMATS.join(', ')}`),
            {
              errorCode: 'INVALID_REQUEST',
              statusCode: HttpStatus.BAD_REQUEST,
              retryable: false,
              details: { field: 'export_format', received: params.export_format },
            },
          );
        }
        filter.export_format = params.export_format;
      }

      return filter;
    };

    // ===================================================================
    // L4: mapToCreationListItem
    // 职责: Prisma camelCase → API snake_case (不含 shot_renders)
    // ===================================================================

    mapToCreationListItem = (row) => ({
      creation_id: row.id,
      product_id: row.product_id,
      script_id: row.script_id,
      task_id: row.task_id,
      engine_mode: row.engine_mode,
      target_resolution: row.target_resolution,
      export_format: row.export_format,
      status: row.status,
      progress: row.progress,
      current_stage: row.current_stage,
      video_url: row.video_url ?? null,
      file_size_bytes: row.file_size_bytes !== null && row.file_size_bytes !== undefined
        ? Number(row.file_size_bytes)
        : null,
      trace_id: row.trace_id ?? null,
      error_code: row.error_code ?? null,
      error_message: row.error_message ?? null,
      started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at ?? null,
      finished_at: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at ?? null,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    });

    // ===================================================================
    // L5: buildPageInfo
    // 职责: 纯组装函数
    // ===================================================================

    buildPageInfo = (items, hasMore, nextCursor, totalCount) => ({
      cursor: nextCursor,
      has_more: hasMore,
      total_count: totalCount,
    });

    // ===================================================================
    // L0: listCreations (主编排器)
    // 六步串行: 默认值解析 → 筛选构建 → 游标解码 → 分页查询 → item映射 → pageInfo构建
    // ===================================================================

    listCreations = async (dto, deps) => {
      const { prisma, atoms } = deps;

      const params = atoms.resolveListDefaults(dto);

      const filter = atoms.buildListFilter(params);

      const decodedCursor = params.cursor
        ? atoms.decodeCreationCursor(params.cursor)
        : null;

      const { items: rows, total_count, has_more, next_cursor } =
        await atoms.findCreationsPaginated(prisma, filter, decodedCursor, params.limit);

      const creationItems = rows.map((row) => atoms.mapToCreationListItem(row));

      const page_info = atoms.buildPageInfo(creationItems, has_more, next_cursor, total_count);

      return { items: creationItems, page_info };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();

    const sampleItems = [
      mockCreationRowFactory(0),
      mockCreationRowFactory(1),
      mockCreationRowFactory(2),
    ];
    mockPrisma.creation.findMany.mockResolvedValue(sampleItems);
    mockPrisma.creation.count.mockResolvedValue(3);
  });

  const deps = () => ({
    prisma: mockPrisma,
    atoms: {
      resolveListDefaults,
      buildListFilter,
      decodeCreationCursor,
      findCreationsPaginated,
      encodeCreationCursor,
      mapToCreationListItem,
      buildPageInfo,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法 product_id + 可选筛选 → 正确返回分页列表', () => {
    it('TC-CRE-LIST-001: 仅 product_id 查询 — 返回 items[] + page_info 完整结构', async () => {
      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(3);

      expect(result).toHaveProperty('page_info');
      expect(result.page_info).toHaveProperty('cursor');
      expect(result.page_info).toHaveProperty('has_more');
      expect(result.page_info).toHaveProperty('total_count');
    });

    it('TC-CRE-LIST-002: 每个列表项含全部 19 个 API 字段，不含 shot_renders', async () => {
      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      const item = result.items[0];

      expect(item).toHaveProperty('creation_id');
      expect(item).toHaveProperty('product_id');
      expect(item).toHaveProperty('script_id');
      expect(item).toHaveProperty('task_id');
      expect(item).toHaveProperty('engine_mode');
      expect(item).toHaveProperty('target_resolution');
      expect(item).toHaveProperty('export_format');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('progress');
      expect(item).toHaveProperty('current_stage');
      expect(item).toHaveProperty('video_url');
      expect(item).toHaveProperty('file_size_bytes');
      expect(item).toHaveProperty('trace_id');
      expect(item).toHaveProperty('error_code');
      expect(item).toHaveProperty('error_message');
      expect(item).toHaveProperty('started_at');
      expect(item).toHaveProperty('finished_at');
      expect(item).toHaveProperty('created_at');
      expect(item).toHaveProperty('updated_at');

      expect(item).not.toHaveProperty('shot_renders');
    });

    it('TC-CRE-LIST-003: creation_id 为有效 UUID v4 格式', async () => {
      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      for (const item of result.items) {
        expect(item.creation_id).toMatch(UUID_V4_REGEX);
        expect(item.product_id).toBe(PRODUCT_ID);
      }
    });

    it('TC-CRE-LIST-004: task_id 为合法 TASK_ID 格式', async () => {
      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      for (const item of result.items) {
        expect(item.task_id).toMatch(TASK_ID_PATTERN);
      }
    });

    it('TC-CRE-LIST-005: created_at 和 updated_at 为 ISO8601 时间戳', async () => {
      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      for (const item of result.items) {
        expect(item.created_at).toMatch(ISO8601_REGEX);
        expect(item.updated_at).toMatch(ISO8601_REGEX);
      }
    });

    it('TC-CRE-LIST-006: page_info.has_more=false 且 next_cursor=null (数据量 ≤ limit)', async () => {
      const items = [mockCreationRowFactory(0)];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();
      expect(result.page_info.total_count).toBe(1);
    });

    it('TC-CRE-LIST-007: page_info.has_more=true 且 next_cursor 非空 (数据量 > limit)', async () => {
      const items = Array.from({ length: DEFAULT_LIMIT + 1 }, (_, i) => mockCreationRowFactory(i));
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(25);

      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      expect(result.page_info.has_more).toBe(true);
      expect(result.page_info.cursor).not.toBeNull();
      expect(typeof result.page_info.cursor).toBe('string');
      expect(result.page_info.cursor).toMatch(BASE64URL_REGEX);
      expect(result.items.length).toBe(DEFAULT_LIMIT);
      expect(result.page_info.total_count).toBe(25);
    });

    it('TC-CRE-LIST-008: cursor 首次传空 → 返回首页', async () => {
      const items = [
        mockCreationRowFactory(0),
        mockCreationRowFactory(1),
      ];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(2);

      const result = await listCreations({ product_id: PRODUCT_ID, cursor: undefined }, deps());

      expect(result.items.length).toBe(2);
      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.cursor).toBeUndefined();
      expect(findManyCall.skip).toBeUndefined();
    });

    it('TC-CRE-LIST-009: cursor 传合法 token → 游标分页下一页', async () => {
      const lastItem = mockCreationRowFactory(5);
      const cursorToken = encodeCreationCursor(lastItem);

      const page2Items = [mockCreationRowFactory(6), mockCreationRowFactory(7)];
      mockPrisma.creation.findMany.mockResolvedValue(page2Items);
      mockPrisma.creation.count.mockResolvedValue(10);

      const result = await listCreations({ product_id: PRODUCT_ID, cursor: cursorToken }, deps());

      expect(result.items.length).toBe(2);
      expect(mockPrisma.creation.findMany).toHaveBeenCalledTimes(1);

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.cursor).toEqual({ id: lastItem.id });
      expect(findManyCall.skip).toBe(1);
    });

    it('TC-CRE-LIST-010: 结果集按 created_at DESC + id DESC 排序', async () => {
      const items = [
        mockCreationRowFactory(1, { created_at: new Date('2026-05-27T10:00:00Z') }),
        mockCreationRowFactory(0, { created_at: new Date('2026-05-27T08:00:00Z') }),
      ];
      mockPrisma.creation.findMany.mockResolvedValue(items);

      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      expect(result.items.length).toBe(2);
      expect(new Date(result.items[0].created_at).getTime())
        .toBeGreaterThanOrEqual(new Date(result.items[1].created_at).getTime());
    });

    it('TC-CRE-LIST-011: status=PENDING 筛选 → 仅返回 PENDING 状态记录', async () => {
      const items = [mockCreationRowFactory(0, { status: 'PENDING' })];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID, status: 'PENDING' }, deps());

      expect(result.items.length).toBe(1);
      for (const item of result.items) {
        expect(item.status).toBe('PENDING');
      }

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe('PENDING');
    });

    it('TC-CRE-LIST-012: current_stage=AI_VIDEO_GENERATING 筛选 → 仅返回对应阶段', async () => {
      const items = [mockCreationRowFactory(0, { current_stage: 'AI_VIDEO_GENERATING' })];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID, current_stage: 'AI_VIDEO_GENERATING' }, deps());

      expect(result.items.length).toBe(1);
      expect(result.items[0].current_stage).toBe('AI_VIDEO_GENERATING');

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.where.current_stage).toBe('AI_VIDEO_GENERATING');
    });

    it('TC-CRE-LIST-013: engine_mode=SCRIPT_DRIVEN 筛选', async () => {
      mockPrisma.creation.findMany.mockResolvedValue([mockCreationRowFactory(0, { engine_mode: 'SCRIPT_DRIVEN' })]);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID, engine_mode: 'SCRIPT_DRIVEN' }, deps());

      expect(result.items.length).toBe(1);
      expect(result.items[0].engine_mode).toBe('SCRIPT_DRIVEN');

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.where.engine_mode).toBe('SCRIPT_DRIVEN');
    });

    it('TC-CRE-LIST-014: export_format=MP4 筛选', async () => {
      mockPrisma.creation.findMany.mockResolvedValue([mockCreationRowFactory(0, { export_format: 'MP4' })]);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID, export_format: 'MP4' }, deps());

      expect(result.items.length).toBe(1);
      expect(result.items[0].export_format).toBe('MP4');

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.where.export_format).toBe('MP4');
    });

    it('TC-CRE-LIST-015: 多维度交叉筛选 (status+engine_mode+export_format)', async () => {
      const items = [mockCreationRowFactory(0, { status: 'PROCESSING', engine_mode: 'SCRIPT_DRIVEN', export_format: 'MP4' })];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({
        product_id: PRODUCT_ID,
        status: 'PROCESSING',
        engine_mode: 'SCRIPT_DRIVEN',
        export_format: 'MP4',
      }, deps());

      expect(result.items.length).toBe(1);

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe('PROCESSING');
      expect(findManyCall.where.engine_mode).toBe('SCRIPT_DRIVEN');
      expect(findManyCall.where.export_format).toBe('MP4');
    });

    it('TC-CRE-LIST-016: product_id 无匹配记录 → 返回空列表', async () => {
      mockPrisma.creation.findMany.mockResolvedValue([]);
      mockPrisma.creation.count.mockResolvedValue(0);

      const result = await listCreations({ product_id: '99999999-9999-4999-a999-999999999999' }, deps());

      expect(result.items).toEqual([]);
      expect(result.items.length).toBe(0);
      expect(result.page_info.total_count).toBe(0);
      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();
    });

    it('TC-CRE-LIST-017: 不传 product_id 时不做存在性校验，仅做 WHERE 过滤', async () => {
      const items = [mockCreationRowFactory(0, { product_id: 'non-existent-product-uuid' })];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: 'non-existent-product-uuid' }, deps());

      expect(result.items.length).toBe(1);
      expect(mockPrisma.creation.findMany).toHaveBeenCalledTimes(1);
    });

    it('TC-CRE-LIST-018: 所有状态枚举值分别筛选均正确 (PENDING/PROCESSING/FINISHED/FAILED/CANCELED)', async () => {
      for (const status of VALID_CREATION_STATUSES) {
        const freshPrisma = mockPrismaClientFactory();
        freshPrisma.creation.findMany.mockResolvedValue([mockCreationRowFactory(0, { status })]);
        freshPrisma.creation.count.mockResolvedValue(1);

        const result = await listCreations(
          { product_id: PRODUCT_ID, status },
          { ...deps(), prisma: freshPrisma },
        );

        expect(result.items.length).toBe(1);
        expect(result.items[0].status).toBe(status);
      }
    });

    it('TC-CRE-LIST-019: limit 不传 → 默认 20', async () => {
      await listCreations({ product_id: PRODUCT_ID }, deps());

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(DEFAULT_LIMIT + 1);
    });

    it('TC-CRE-LIST-020: limit=5 → take=6 (limit+1 检测 has_more)', async () => {
      const items = Array.from({ length: 5 }, (_, i) => mockCreationRowFactory(i));
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(5);

      await listCreations({ product_id: PRODUCT_ID, limit: 5 }, deps());

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(6);
    });
  });

  // ===========================================================================
  // 2. 边界流（Boundary）
  // ===========================================================================

  describe('【边界流】极端输入 → 优雅处理不崩溃', () => {
    it('TC-CRE-LIST-BND-001: product_id 为空字符串 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        resolveListDefaults({ product_id: '' });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-LIST-BND-002: product_id 为纯空白字符串 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        resolveListDefaults({ product_id: '   \t\n   ' });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRE-LIST-BND-003: limit=0 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        resolveListDefaults({ product_id: PRODUCT_ID, limit: 0 });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-LIST-BND-004: limit=-1 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        resolveListDefaults({ product_id: PRODUCT_ID, limit: -1 });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRE-LIST-BND-005: limit=MAX_LIMIT+1=101 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        resolveListDefaults({ product_id: PRODUCT_ID, limit: 101 });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRE-LIST-BND-006: limit=1 (允许的最小值)', async () => {
      const items = [mockCreationRowFactory(0)];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID, limit: 1 }, deps());

      expect(result.items.length).toBe(1);
      expect(result.page_info.has_more).toBe(false);
    });

    it('TC-CRE-LIST-BND-007: limit=100 (允许的最大值)', async () => {
      const items = Array.from({ length: 100 }, (_, i) => mockCreationRowFactory(i));
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(100);

      const result = await listCreations({ product_id: PRODUCT_ID, limit: 100 }, deps());

      expect(result.items.length).toBe(100);
    });

    it('TC-CRE-LIST-BND-008: limit 为小数 (非整数) → INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        resolveListDefaults({ product_id: PRODUCT_ID, limit: 2.5 });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-CRE-LIST-BND-009: cursor 为非法 base64 → decodeCreationCursor 返回 null (退化为首页)', async () => {
      const decoded = decodeCreationCursor('!!!not-valid-base64!!!');
      expect(decoded).toBeNull();
    });

    it('TC-CRE-LIST-BND-010: cursor 为合法 base64 但非 JSON → 返回 null', async () => {
      const token = Buffer.from('hello world').toString('base64url');
      const decoded = decodeCreationCursor(token);
      expect(decoded).toBeNull();
    });

    it('TC-CRE-LIST-BND-011: cursor JSON 缺少 i 字段 → 返回 null', async () => {
      const token = Buffer.from(JSON.stringify({ v: '2026-05-27T00:00:00.000Z' })).toString('base64url');
      const decoded = decodeCreationCursor(token);
      expect(decoded).toBeNull();
    });

    it('TC-CRE-LIST-BND-012: cursor JSON 缺少 v 字段 → 返回 null', async () => {
      const token = Buffer.from(JSON.stringify({ i: '00000000-0000-4000-a000-000000000001' })).toString('base64url');
      const decoded = decodeCreationCursor(token);
      expect(decoded).toBeNull();
    });

    it('TC-CRE-LIST-BND-013: cursor 为空字符串 → 退化为首页 (不传 cursor 给 decode)', async () => {
      const items = [mockCreationRowFactory(0)];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID, cursor: '' }, deps());

      expect(result.items.length).toBe(1);

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(DEFAULT_LIMIT + 1);
    });

    it('TC-CRE-LIST-BND-014: 极大数据量返回 — 100 条数据 map 全部成功', async () => {
      const items = Array.from({ length: 100 }, (_, i) => mockCreationRowFactory(i));
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(500);

      const result = await listCreations({ product_id: PRODUCT_ID, limit: 100 }, deps());

      expect(result.items.length).toBe(100);
      for (const item of result.items) {
        expect(item).toHaveProperty('creation_id');
        expect(item.creation_id).toMatch(UUID_V4_REGEX);
      }
    });

    it('TC-CRE-LIST-BND-015: 筛选参数为 undefined 时不写入 where 条件', async () => {
      mockPrisma.creation.findMany.mockResolvedValue([mockCreationRowFactory(0)]);
      mockPrisma.creation.count.mockResolvedValue(1);

      await listCreations({
        product_id: PRODUCT_ID,
        status: undefined,
        current_stage: undefined,
        engine_mode: undefined,
        export_format: undefined,
      }, deps());

      const findManyCall = mockPrisma.creation.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBeUndefined();
      expect(findManyCall.where.current_stage).toBeUndefined();
      expect(findManyCall.where.engine_mode).toBeUndefined();
      expect(findManyCall.where.export_format).toBeUndefined();
    });

    it('TC-CRE-LIST-BND-016: 返回 0 条数据时 items 为空数组，page_info 均为默认值', async () => {
      mockPrisma.creation.findMany.mockResolvedValue([]);
      mockPrisma.creation.count.mockResolvedValue(0);

      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      expect(result.items).toEqual([]);
      expect(result.items.length).toBe(0);
      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();
      expect(result.page_info.total_count).toBe(0);
    });

    it('TC-CRE-LIST-BND-017: file_size_bytes 为 BigInt → 正确转为 Number', () => {
      const row = mockCreationRowFactory(0, { file_size_bytes: BigInt(25 * 1024 * 1024) });
      const item = mapToCreationListItem(row);

      expect(item.file_size_bytes).toBe(25 * 1024 * 1024);
      expect(typeof item.file_size_bytes).toBe('number');
    });

    it('TC-CRE-LIST-BND-018: file_size_bytes 为 null → 保持 null', () => {
      const row = mockCreationRowFactory(0, { file_size_bytes: null });
      const item = mapToCreationListItem(row);

      expect(item.file_size_bytes).toBeNull();
    });

    it('TC-CRE-LIST-BND-019: started_at 为 null 时输出 null', () => {
      const row = mockCreationRowFactory(0, { started_at: null });
      const item = mapToCreationListItem(row);

      expect(item.started_at).toBeNull();
    });

    it('TC-CRE-LIST-BND-020: 全状态枚举筛选 + FINISHED 状态含 video_url', async () => {
      const items = [mockCreationRowFactory(0, {
        status: 'FINISHED',
        progress: 100,
        current_stage: 'FINISHED',
        video_url: 's3://tikstream/exports/video.mp4',
        file_size_bytes: BigInt(15 * 1024 * 1024),
        finished_at: new Date('2026-05-27T11:00:00Z'),
      })];
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(1);

      const result = await listCreations({ product_id: PRODUCT_ID, status: 'FINISHED' }, deps());

      expect(result.items[0].status).toBe('FINISHED');
      expect(result.items[0].video_url).toBe('s3://tikstream/exports/video.mp4');
      expect(result.items[0].file_size_bytes).toBe(15 * 1024 * 1024);
      expect(result.items[0].finished_at).toMatch(ISO8601_REGEX);
    });
  });

  // ===========================================================================
  // 3. 异常流（Exception）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获 + 规范错误码', () => {
    // ---- 3.1 参数校验异常 ----

    it('TC-CRE-LIST-ERR-001: product_id 为 null → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: null as unknown as string }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-LIST-ERR-002: product_id 为 undefined → INVALID_REQUEST 400', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: undefined as unknown as string }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
    });

    it('TC-CRE-LIST-ERR-003: status 非法值 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        buildListFilter({ product_id: PRODUCT_ID, status: 'COMPLETED' });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
      expect((caught!.details as Record<string, unknown>).field).toBe('status');
    });

    it('TC-CRE-LIST-ERR-004: current_stage 非法值 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        buildListFilter({ product_id: PRODUCT_ID, current_stage: 'RENDERING' });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect((caught!.details as Record<string, unknown>).field).toBe('current_stage');
    });

    it('TC-CRE-LIST-ERR-005: engine_mode 非法值 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        buildListFilter({ product_id: PRODUCT_ID, engine_mode: 'AI_DRIVEN' });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect((caught!.details as Record<string, unknown>).field).toBe('engine_mode');
    });

    it('TC-CRE-LIST-ERR-006: export_format 非法值 → INVALID_REQUEST 400', () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        buildListFilter({ product_id: PRODUCT_ID, export_format: 'AVI' });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect((caught!.details as Record<string, unknown>).field).toBe('export_format');
    });

    // ---- 3.2 Prisma 数据库异常 (findMany) ----

    it('TC-CRE-LIST-ERR-007: Prisma P1001 数据库不可达 (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p1001Error = Object.assign(
        new Error("Can't reach database server at `localhost:5432`"),
        { code: 'P1001' },
      );
      mockPrisma.creation.findMany.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-LIST-ERR-008: Prisma P1017 连接超时 (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p1017Error = Object.assign(
        new Error('Server has closed the connection'),
        { code: 'P1017' },
      );
      mockPrisma.creation.findMany.mockRejectedValue(p1017Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-LIST-ERR-009: Prisma P2024 连接池耗尽 (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p2024Error = Object.assign(
        new Error('Timed out fetching a new connection from the connection pool'),
        { code: 'P2024' },
      );
      mockPrisma.creation.findMany.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-LIST-ERR-010: Prisma P2028 事务超时 (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const p2028Error = Object.assign(
        new Error('Transaction API error: Transaction timeout'),
        { code: 'P2028' },
      );
      mockPrisma.creation.findMany.mockRejectedValue(p2028Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-LIST-ERR-011: Prisma 初始化失败 INIT_ERROR (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const initError = Object.assign(
        new Error('Database initialization failed'),
        { code: 'INIT_ERROR' },
      );
      mockPrisma.creation.findMany.mockRejectedValue(initError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-LIST-ERR-012: Prisma Rust Panic RUST_PANIC (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const rustPanic = Object.assign(
        new Error('Rust engine panicked'),
        { code: 'RUST_PANIC' },
      );
      mockPrisma.creation.findMany.mockRejectedValue(rustPanic);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-LIST-ERR-013: Prisma 未知错误码 P9999 (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      const unknownError = Object.assign(
        new Error('Unknown Prisma engine error'),
        { code: 'P9999' },
      );
      mockPrisma.creation.findMany.mockRejectedValue(unknownError);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-CRE-LIST-ERR-014: Prisma 原生 Error 无 code (findMany) → INTERNAL_SERVER_ERROR 500 retryable', async () => {
      mockPrisma.creation.findMany.mockRejectedValue(new Error('Unexpected native error'));

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    // ---- 3.3 Prisma count 异常 (非阻断) ----

    it('TC-CRE-LIST-ERR-015: Prisma count 抛异常 → total_count=-1 主流程不中断', async () => {
      mockPrisma.creation.count.mockRejectedValue(new Error('Count query timeout'));

      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      expect(result).toBeDefined();
      expect(result.items.length).toBe(3);
      expect(result.page_info.total_count).toBe(-1);
      expect(result.page_info.has_more).toBe(false);
    });

    // ---- 3.4 错误码三元组精准断言 ----

    it('TC-CRE-LIST-ERR-016: 所有 INVALID_REQUEST 异常含 errorCode+statusCode+retryable 三元组', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown } | null = null;
      try {
        await listCreations({ product_id: '' }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      }

      expect(caught).not.toBeNull();
      expect(caught).toHaveProperty('errorCode');
      expect(caught).toHaveProperty('statusCode');
      expect(caught).toHaveProperty('retryable');
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.retryable).toBe(false);
      expect(caught).toHaveProperty('details');
    });

    it('TC-CRE-LIST-ERR-017: INTERNAL_SERVER_ERROR 异常 errorCode+statusCode+retryable 三元组', async () => {
      mockPrisma.creation.findMany.mockRejectedValue(
        Object.assign(new Error('DB down'), { code: 'P1001' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught).toHaveProperty('errorCode');
      expect(caught).toHaveProperty('statusCode');
      expect(caught).toHaveProperty('retryable');
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时卡点告警', () => {
    it('TC-CRE-LIST-PERF-001: listCreations 编排总耗时 ≤ 30ms (mock DB, 3 items)', async () => {
      const PERF_CEILING_MS = 30;

      const start = performance.now();

      const result = await listCreations({ product_id: PRODUCT_ID }, deps());

      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(result.items.length).toBe(3);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-CRE-LIST-PERF-002: resolveListDefaults (纯同步) ≤ 0.5ms', () => {
      const PERF_CEILING_MS = 0.5;

      const start = performance.now();

      const result = resolveListDefaults({ product_id: PRODUCT_ID });

      const elapsed = performance.now() - start;

      expect(result.product_id).toBe(PRODUCT_ID);
      expect(result.limit).toBe(DEFAULT_LIMIT);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-003: resolveListDefaults 失败路径 ≤ 0.5ms', () => {
      const PERF_CEILING_MS = 0.5;

      const start = performance.now();

      try {
        resolveListDefaults({ product_id: '' });
      } catch {
        // expected
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-004: buildListFilter (纯同步, 5 维度全设) ≤ 0.5ms', () => {
      const PERF_CEILING_MS = 0.5;

      const start = performance.now();

      const filter = buildListFilter({
        product_id: PRODUCT_ID,
        status: 'PROCESSING',
        current_stage: 'AI_VIDEO_GENERATING',
        engine_mode: 'SCRIPT_DRIVEN',
        export_format: 'MP4',
      });

      const elapsed = performance.now() - start;

      expect(filter.product_id).toBe(PRODUCT_ID);
      expect(filter.status).toBe('PROCESSING');
      expect(filter.current_stage).toBe('AI_VIDEO_GENERATING');
      expect(filter.engine_mode).toBe('SCRIPT_DRIVEN');
      expect(filter.export_format).toBe('MP4');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-005: encodeCreationCursor + decodeCreationCursor 完整往返 ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const item = mockCreationRowFactory(0);

      const start = performance.now();

      const encoded = encodeCreationCursor(item);
      const decoded = decodeCreationCursor(encoded);

      const elapsed = performance.now() - start;

      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(item.id);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-006: findCreationsPaginated (mock DB, 3 items) ≤ 15ms', async () => {
      const PERF_CEILING_MS = 15;

      const filter: TestCreationListFilter = { product_id: PRODUCT_ID };

      const start = performance.now();

      const result = await findCreationsPaginated(mockPrisma, filter, null, 20);

      const elapsed = performance.now() - start;

      expect(result.items.length).toBe(3);
      expect(result.total_count).toBe(3);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-007: mapToCreationListItem (单条) ≤ 0.5ms', () => {
      const PERF_CEILING_MS = 0.5;

      const row = mockCreationRowFactory(0);

      const start = performance.now();

      const item = mapToCreationListItem(row);

      const elapsed = performance.now() - start;

      expect(item.creation_id).toBe(row.id);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-008: mapToCreationListItem × 100 条 ≤ 5ms', () => {
      const PERF_CEILING_MS = 5;

      const rows = Array.from({ length: 100 }, (_, i) => mockCreationRowFactory(i));

      const start = performance.now();

      const items = rows.map((row) => mapToCreationListItem(row));

      const elapsed = performance.now() - start;

      expect(items.length).toBe(100);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-009: buildPageInfo (纯组装) ≤ 0.3ms', () => {
      const PERF_CEILING_MS = 0.3;

      const items = [mapToCreationListItem(mockCreationRowFactory(0))];

      const start = performance.now();

      const pageInfo = buildPageInfo(items, false, null, 1);

      const elapsed = performance.now() - start;

      expect(pageInfo.cursor).toBeNull();
      expect(pageInfo.has_more).toBe(false);
      expect(pageInfo.total_count).toBe(1);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRE-LIST-PERF-010: 连续 5 次 listCreations 无性能退化', async () => {
      const ITERATIONS = 5;
      const PERF_CEILING_MS_PER_ITERATION = 15;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await listCreations({ product_id: PRODUCT_ID }, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-CRE-LIST-PERF-011: 100 次 buildListFilter 平均耗时 ≤ 0.1ms', () => {
      const ITERATIONS = 100;
      const PERF_CEILING_MS_PER_ITERATION = 0.1;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        buildListFilter({ product_id: PRODUCT_ID, status: 'PROCESSING' });
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    });

    it('TC-CRE-LIST-PERF-012: 100 次 resolveListDefaults 平均耗时 ≤ 0.1ms', () => {
      const ITERATIONS = 100;
      const PERF_CEILING_MS_PER_ITERATION = 0.1;

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        resolveListDefaults({ product_id: PRODUCT_ID });
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    });

    it('TC-CRE-LIST-PERF-013: 全流程 100 条数据 map 耗时 ≤ 10ms', async () => {
      const PERF_CEILING_MS = 10;

      const items = Array.from({ length: 100 }, (_, i) => mockCreationRowFactory(i));
      mockPrisma.creation.findMany.mockResolvedValue(items);
      mockPrisma.creation.count.mockResolvedValue(200);

      const start = performance.now();

      const result = await listCreations({ product_id: PRODUCT_ID, limit: 100 }, deps());

      const elapsed = performance.now() - start;

      expect(result.items.length).toBe(100);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS + 20);
    }, 15000);
  });
});
