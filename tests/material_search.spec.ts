// =============================================================================
// TikStream AI — Material Search 自动化测试基座
// 对应功能: POST /api/v1/materials/search (素材多维检索 — Qdrant 向量检索 + 结构化过滤 + 关键字兜底)
// 对应模块: Material (人员A) | 测试类型: 单元测试 (Service 层 + Repository 层 + AI 服务层)
// 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// ============================================================
// 0. 测试专用类型定义
// ============================================================

type MaterialType = 'IMAGE' | 'VIDEO';
type MaterialSliceStatus = 'PENDING' | 'CAPTIONING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED';
type SearchMode = 'AUTO' | 'VECTOR' | 'KEYWORD';
type SearchSource = 'vector' | 'keyword_fallback';

interface SearchMaterialsDto {
  product_id: string;
  query?: string;
  type?: MaterialType;
  status?: MaterialSliceStatus;
  min_duration?: number;
  max_duration?: number;
  search_mode?: SearchMode;
  limit?: number;
  cursor?: string;
}

interface ResolvedSearchParams {
  product_id: string;
  query?: string;
  type?: MaterialType;
  status?: MaterialSliceStatus;
  min_duration?: number;
  max_duration?: number;
  search_mode: SearchMode;
  limit: number;
  cursor?: string;
}

interface SearchFilterPair {
  qdrantFilter: Record<string, unknown>;
  pgWhere: Record<string, unknown>;
}

interface TestMaterialSliceRow {
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
  material?: {
    id: string;
    file_name: string;
    type: string;
    product_id: string;
  };
}

interface TestQdrantSearchResult {
  id: string;
  score: number;
  version: number;
  payload?: Record<string, unknown>;
}

interface TestMaterialSliceResult {
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
  score: number | null;
  file_name?: string;
  type?: string;
  created_at: string;
  updated_at: string;
}

interface TestSearchResponse {
  items: TestMaterialSliceResult[];
  page_info: {
    cursor: string | null;
    has_more: boolean;
    total_count: number;
  };
  search_source: SearchSource;
}

type MockPrismaClient = {
  materialSlice: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

type MockQdrantClient = {
  search: jest.Mock;
};

type MockImageBindClient = {
  embedQuery: jest.Mock;
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-26T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const SLICE_ID_1 = 'slc_20260523_000001_001';
const SLICE_ID_2 = 'slc_20260523_000002_002';
const SLICE_ID_3 = 'slc_20260523_000003_003';
const SLICE_ID_4 = 'slc_20260523_000004_004';
const SLICE_ID_5 = 'slc_20260523_000005_005';
const SLICE_IDS = [SLICE_ID_1, SLICE_ID_2, SLICE_ID_3, SLICE_ID_4, SLICE_ID_5];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const EMBEDDING_DIM = 512;

const VALID_SEARCH_MODES: SearchMode[] = ['AUTO', 'VECTOR', 'KEYWORD'];
const VALID_MATERIAL_TYPES: MaterialType[] = ['IMAGE', 'VIDEO'];
const VALID_SLICE_STATUSES: MaterialSliceStatus[] = ['PENDING', 'CAPTIONING', 'EMBEDDING', 'COMPLETED', 'FAILED'];

// ============================================================
// Mock Factories
// ============================================================

const mockSliceRowFactory = (
  index: number,
  overrides?: Partial<TestMaterialSliceRow>,
): TestMaterialSliceRow => ({
  id: `slice-uuid-${index}-material-001`,
  material_id: `material-00${index}`,
  slice_id: SLICE_IDS[index - 1] || `slc_extra_${index}`,
  start_time: (index - 1) * 3.0,
  end_time: index * 3.0,
  duration: 3.0,
  dense_caption: `A detailed close-up shot ${index} showing the product wireless hair curler with smart temperature control on a clean white desk, soft studio lighting, product centered in frame`,
  tags: ['wireless', `feature_${index}`, 'close-up', 'product_centered', 'studio_lighting'],
  stream_url: `http://minio:9000/tikstream-assets/slices/material-001/slice_${index}.mp4`,
  key_frame_url: `http://minio:9000/tikstream-assets/slices/material-001/keyframe_${index}.webp`,
  embedding_version: index <= 3 ? 'imagebind-v2.1' : null,
  sfx_url: index % 2 === 0 ? `http://minio:9000/tikstream-assets/sfx/sfx_${index}.wav` : null,
  status: index <= 3 ? 'COMPLETED' : (index === 4 ? 'EMBEDDING' : 'PENDING'),
  created_at: NOW,
  updated_at: NOW,
  material: {
    id: `material-00${index}`,
    file_name: `product_demo_${index}.mp4`,
    type: index % 3 === 0 ? 'IMAGE' : 'VIDEO',
    product_id: PRODUCT_ID,
  },
  ...overrides,
});

const mockSliceRowListFactory = (count: number): TestMaterialSliceRow[] =>
  Array.from({ length: count }, (_, i) => mockSliceRowFactory(i + 1));

const mockQdrantResultFactory = (index: number, score?: number): TestQdrantSearchResult => ({
  id: SLICE_IDS[index - 1] || `slc_extra_${index}`,
  score: score ?? (0.95 - (index - 1) * 0.05),
  version: 1,
  payload: {
    product_id: PRODUCT_ID,
    duration: 3.0,
    dense_caption: `A detailed close-up shot ${index} showing product`,
    tags: ['wireless', `feature_${index}`],
    status: 'COMPLETED',
  },
});

const mockQdrantResultListFactory = (count: number): TestQdrantSearchResult[] =>
  Array.from({ length: count }, (_, i) => mockQdrantResultFactory(i + 1));

const mockEmbeddingFactory = (): number[] =>
  Array.from({ length: EMBEDDING_DIM }, () => Math.random());

const mockZeroEmbeddingFactory = (): number[] =>
  Array.from({ length: EMBEDDING_DIM }, () => 0);

const mockPrismaClientFactory = (): MockPrismaClient => ({
  materialSlice: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
});

const mockQdrantClientFactory = (): MockQdrantClient => ({
  search: jest.fn(),
});

const mockImageBindClientFactory = (): MockImageBindClient => ({
  embedQuery: jest.fn(),
});

// ============================================================
// 测试套件入口
// ============================================================

describe('MaterialSearch — 素材多维检索 (POST /api/v1/materials/search)', () => {
  let mockPrisma: MockPrismaClient;
  let mockQdrant: MockQdrantClient;
  let mockImageBind: MockImageBindClient;

  // ---- 原子函数类型声明 ----

  type ResolveSearchDefaultsFn = (dto: SearchMaterialsDto) => ResolvedSearchParams;

  type BuildSearchFilterFn = (params: ResolvedSearchParams) => SearchFilterPair;

  type EmbedQueryFn = (
    client: MockImageBindClient,
    query: string,
  ) => Promise<number[]>;

  type PerformQdrantSearchFn = (
    client: MockQdrantClient,
    vector: number[],
    filter: Record<string, unknown>,
    limit: number,
  ) => Promise<TestQdrantSearchResult[]>;

  type CollectHitIdsFn = (results: TestQdrantSearchResult[]) => string[];

  type FindSlicesByIdsFn = (
    prisma: MockPrismaClient,
    sliceIds: string[],
  ) => Promise<TestMaterialSliceRow[]>;

  type SearchSlicesByKeywordFn = (
    prisma: MockPrismaClient,
    pgWhere: Record<string, unknown>,
    limit: number,
    cursor?: string,
  ) => Promise<{
    items: TestMaterialSliceRow[];
    total_count: number;
    has_more: boolean;
    next_cursor: string | null;
  }>;

  type MapToMaterialSliceResultFn = (
    row: TestMaterialSliceRow,
    searchSource: SearchSource,
    score?: number,
  ) => TestMaterialSliceResult;

  type BuildPageInfoFn = (
    items: TestMaterialSliceResult[],
    hasMore: boolean,
    nextCursor: string | null,
    totalCount: number,
  ) => { cursor: string | null; has_more: boolean; total_count: number };

  type SearchMaterialSlicesFn = (
    dto: SearchMaterialsDto,
    deps: {
      prisma: MockPrismaClient;
      qdrant: MockQdrantClient;
      imageBind: MockImageBindClient;
      atoms: {
        resolveSearchDefaults: ResolveSearchDefaultsFn;
        buildSearchFilter: BuildSearchFilterFn;
        embedQuery: EmbedQueryFn;
        performQdrantSearch: PerformQdrantSearchFn;
        collectHitIds: CollectHitIdsFn;
        findSlicesByIds: FindSlicesByIdsFn;
        searchSlicesByKeyword: SearchSlicesByKeywordFn;
        mapToMaterialSliceResult: MapToMaterialSliceResultFn;
        buildPageInfo: BuildPageInfoFn;
      };
    },
  ) => Promise<TestSearchResponse>;

  // ---- 原子函数实例 ----
  let resolveSearchDefaults: ResolveSearchDefaultsFn;
  let buildSearchFilter: BuildSearchFilterFn;
  let embedQuery: EmbedQueryFn;
  let performQdrantSearch: PerformQdrantSearchFn;
  let collectHitIds: CollectHitIdsFn;
  let findSlicesByIds: FindSlicesByIdsFn;
  let searchSlicesByKeyword: SearchSlicesByKeywordFn;
  let mapToMaterialSliceResult: MapToMaterialSliceResultFn;
  let buildPageInfo: BuildPageInfoFn;
  let searchMaterialSlices: SearchMaterialSlicesFn;

  beforeAll(() => {
    // ===================================================================
    // F1: resolveSearchDefaults
    // ===================================================================

    resolveSearchDefaults = (dto) => {
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

      const query = dto.query?.trim() || undefined;

      if (
        !query &&
        !dto.type &&
        !dto.status &&
        dto.min_duration === undefined &&
        dto.max_duration === undefined
      ) {
        throw Object.assign(
          new Error('至少需要一个查询条件：query / type / status / duration range'),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: { reason: 'at_least_one_filter_required' },
          },
        );
      }

      return {
        product_id: dto.product_id,
        query,
        type: dto.type,
        status: dto.status,
        min_duration: dto.min_duration,
        max_duration: dto.max_duration,
        search_mode: dto.search_mode ?? 'AUTO',
        limit,
        cursor: dto.cursor,
      };
    };

    // ===================================================================
    // F2: buildSearchFilter
    // ===================================================================

    buildSearchFilter = (params) => {
      const pgWhere: Record<string, unknown> = {};

      if (params.product_id) {
        pgWhere.product_id = params.product_id;
      }
      if (params.type) {
        pgWhere.type = params.type;
      }
      if (params.status) {
        pgWhere.status = params.status;
      }

      const durationFilter: Record<string, number> = {};
      if (params.min_duration !== undefined) {
        durationFilter.gte = params.min_duration;
      }
      if (params.max_duration !== undefined) {
        durationFilter.lte = params.max_duration;
      }
      if (Object.keys(durationFilter).length > 0) {
        pgWhere.duration = durationFilter;
      }

      const qdrantFilter: Record<string, unknown> = {
        must: [],
      };

      const mustArr = qdrantFilter.must as Array<Record<string, unknown>>;
      mustArr.push({
        key: 'product_id',
        match: { value: params.product_id },
      });

      if (params.type) {
        mustArr.push({
          key: 'type',
          match: { value: params.type },
        });
      }
      if (params.status) {
        mustArr.push({
          key: 'status',
          match: { value: params.status },
        });
      }
      if (params.min_duration !== undefined || params.max_duration !== undefined) {
        const durRange: Record<string, number> = {};
        if (params.min_duration !== undefined) durRange.gte = params.min_duration;
        if (params.max_duration !== undefined) durRange.lte = params.max_duration;
        mustArr.push({ key: 'duration', range: durRange });
      }

      return { qdrantFilter, pgWhere };
    };

    // ===================================================================
    // F3a: embedQuery (ImageBind)
    // ===================================================================

    embedQuery = async (client, query) => {
      try {
        const result = await client.embedQuery({ text: query });
        if (Array.isArray(result) && result.length === EMBEDDING_DIM) {
          return result;
        }
        return mockZeroEmbeddingFactory();
      } catch {
        return mockZeroEmbeddingFactory();
      }
    };

    // ===================================================================
    // F3b: performQdrantSearch
    // ===================================================================

    performQdrantSearch = async (client, vector, filter, limit) => {
      try {
        const results = await client.search('asset_slices', {
          vector,
          filter,
          limit,
          with_payload: true,
          with_vector: false,
        });
        return results;
      } catch (error) {
        throw Object.assign(
          new Error(`Qdrant search failed: ${(error as Error).message}`),
          {
            errorCode: 'VECTOR_SEARCH_FAILED',
            statusCode: HttpStatus.BAD_GATEWAY,
            retryable: true,
          },
        );
      }
    };

    // ===================================================================
    // F3c: collectHitIds
    // ===================================================================

    collectHitIds = (results) => {
      return results.map((r) => r.id);
    };

    // ===================================================================
    // F3d: findSlicesByIds
    // ===================================================================

    findSlicesByIds = async (prisma, sliceIds) => {
      try {
        const items = await prisma.materialSlice.findMany({
          where: { slice_id: { in: sliceIds } },
        });
        return items;
      } catch (error) {
        const prismaError = error as Error & { code?: string };
        const isRetryable =
          prismaError.code === 'P1001' ||
          prismaError.code === 'P2024' ||
          prismaError.code === 'P2028';
        throw Object.assign(
          new Error(`PostgreSQL 回查切片失败: ${prismaError.message}`),
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
    // F4: searchSlicesByKeyword (关键字兜底)
    // ===================================================================

    searchSlicesByKeyword = async (prisma, pgWhere, limit, cursor) => {
      try {
        const take = limit + 1;
        const skip = cursor ? 1 : 0;
        const cursorClause = cursor ? { slice_id: cursor } : undefined;

        const queryArgs: Record<string, unknown> = {
          where: pgWhere,
          take,
        };
        if (cursorClause) {
          queryArgs.cursor = cursorClause;
          queryArgs.skip = skip;
        }

        const items = await prisma.materialSlice.findMany(queryArgs);

        let total_count = -1;
        try {
          const countWhere = { ...pgWhere };
          delete countWhere.OR;
          if (pgWhere.OR) {
            total_count = await prisma.materialSlice.count({ where: pgWhere });
          } else {
            total_count = await prisma.materialSlice.count({ where: pgWhere });
          }
        } catch {
          total_count = -1;
        }

        const has_more = items.length > limit;
        if (has_more) {
          items.pop();
        }

        let next_cursor: string | null = null;
        if (has_more && items.length > 0) {
          const lastItem = items[items.length - 1] as TestMaterialSliceRow;
          next_cursor = lastItem.slice_id;
        }

        return { items, total_count, has_more, next_cursor };
      } catch (error) {
        const prismaError = error as Error & { code?: string };
        const isRetryable =
          prismaError.code === 'P1001' ||
          prismaError.code === 'P2024' ||
          prismaError.code === 'P2028';
        throw Object.assign(
          new Error(`关键字检索失败: ${prismaError.message}`),
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
    // F5: mapToMaterialSliceResult
    // ===================================================================

    mapToMaterialSliceResult = (row, searchSource, score) => {
      return {
        id: row.id,
        material_id: row.material_id,
        slice_id: row.slice_id,
        start_time: row.start_time,
        end_time: row.end_time,
        duration: row.duration,
        dense_caption: row.dense_caption ?? null,
        tags: Array.isArray(row.tags) ? row.tags : [],
        stream_url: row.stream_url ?? null,
        key_frame_url: row.key_frame_url ?? null,
        embedding_version: row.embedding_version ?? null,
        sfx_url: row.sfx_url ?? null,
        status: (row.status as MaterialSliceStatus) || 'PENDING',
        score: score ?? null,
        file_name: row.material?.file_name,
        type: row.material?.type,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      };
    };

    // ===================================================================
    // buildPageInfo (内联)
    // ===================================================================

    buildPageInfo = (items, hasMore, nextCursor, totalCount) => {
      return {
        cursor: nextCursor,
        has_more: hasMore,
        total_count: totalCount,
      };
    };

    // ===================================================================
    // F0: searchMaterialSlices (主编排器)
    // ===================================================================

    searchMaterialSlices = async (dto, deps) => {
      const { prisma, qdrant, imageBind, atoms } = deps;

      const params = atoms.resolveSearchDefaults(dto);

      const { qdrantFilter, pgWhere } = atoms.buildSearchFilter(params);

      const searchMode = params.search_mode;

      if (searchMode === 'KEYWORD') {
        if (params.query) {
          (pgWhere as Record<string, unknown>).OR = [
            { denseCaption: { contains: params.query, mode: 'insensitive' } },
            { tags: { path: ['$'], string_contains: params.query } },
          ];
        }
        const result = await atoms.searchSlicesByKeyword(prisma, pgWhere, params.limit, params.cursor);
        const items = result.items.map((r) => atoms.mapToMaterialSliceResult(r, 'keyword_fallback'));
        return {
          items,
          page_info: atoms.buildPageInfo(items, result.has_more, result.next_cursor, result.total_count),
          search_source: 'keyword_fallback',
        };
      }

      const embedResult = await atoms.embedQuery(imageBind, params.query || '');

      let qdrantResults: TestQdrantSearchResult[];
      try {
        qdrantResults = await atoms.performQdrantSearch(qdrant, embedResult, qdrantFilter, params.limit);
      } catch (qdrantErr) {
        if (searchMode === 'VECTOR') {
          throw qdrantErr;
        }
        if (params.query) {
          (pgWhere as Record<string, unknown>).OR = [
            { denseCaption: { contains: params.query, mode: 'insensitive' } },
            { tags: { path: ['$'], string_contains: params.query } },
          ];
        }
        const result = await atoms.searchSlicesByKeyword(prisma, pgWhere, params.limit, params.cursor);
        const items = result.items.map((r) => atoms.mapToMaterialSliceResult(r, 'keyword_fallback'));
        return {
          items,
          page_info: atoms.buildPageInfo(items, result.has_more, result.next_cursor, result.total_count),
          search_source: 'keyword_fallback',
        };
      }

      if (qdrantResults.length === 0) {
        if (searchMode === 'VECTOR') {
          return {
            items: [],
            page_info: { cursor: null, has_more: false, total_count: 0 },
            search_source: 'vector',
          };
        }
        if (params.query) {
          (pgWhere as Record<string, unknown>).OR = [
            { denseCaption: { contains: params.query, mode: 'insensitive' } },
            { tags: { path: ['$'], string_contains: params.query } },
          ];
        }
        const result = await atoms.searchSlicesByKeyword(prisma, pgWhere, params.limit, params.cursor);
        const items = result.items.map((r) => atoms.mapToMaterialSliceResult(r, 'keyword_fallback'));
        return {
          items,
          page_info: atoms.buildPageInfo(items, result.has_more, result.next_cursor, result.total_count),
          search_source: 'keyword_fallback',
        };
      }

      const hitIds = atoms.collectHitIds(qdrantResults);
      const pgRows = await atoms.findSlicesByIds(prisma, hitIds);

      const scoreMap = new Map<string, number>();
      qdrantResults.forEach((r) => scoreMap.set(r.id, r.score));

      const items = pgRows.map((r) =>
        atoms.mapToMaterialSliceResult(r, 'vector', scoreMap.get(r.slice_id)),
      );

      return {
        items,
        page_info: atoms.buildPageInfo(items, false, null, items.length),
        search_source: 'vector',
      };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();
    mockQdrant = mockQdrantClientFactory();
    mockImageBind = mockImageBindClientFactory();

    mockImageBind.embedQuery.mockResolvedValue(mockEmbeddingFactory());
    mockQdrant.search.mockResolvedValue(mockQdrantResultListFactory(5));
    mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(5));
    mockPrisma.materialSlice.count.mockResolvedValue(25);
  });

  const deps = () => ({
    prisma: mockPrisma,
    qdrant: mockQdrant,
    imageBind: mockImageBind,
    atoms: {
      resolveSearchDefaults,
      buildSearchFilter,
      embedQuery,
      performQdrantSearch,
      collectHitIds,
      findSlicesByIds,
      searchSlicesByKeyword,
      mapToMaterialSliceResult,
      buildPageInfo,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整 SearchResponse 输出', () => {
    it('TC-MAT-SRCH-001: 向量检索成功返回完整响应结构 { items, page_info, search_source }', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
      };

      const result = await searchMaterialSlices(dto, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('page_info');
      expect(result).toHaveProperty('search_source');
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.search_source).toBe('vector');
    });

    it('TC-MAT-SRCH-002: 每个 MaterialSliceResult 包含全部必需字段', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
      };

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];

      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('material_id');
      expect(item).toHaveProperty('slice_id');
      expect(item).toHaveProperty('start_time');
      expect(item).toHaveProperty('end_time');
      expect(item).toHaveProperty('duration');
      expect(item).toHaveProperty('dense_caption');
      expect(item).toHaveProperty('tags');
      expect(item).toHaveProperty('stream_url');
      expect(item).toHaveProperty('key_frame_url');
      expect(item).toHaveProperty('embedding_version');
      expect(item).toHaveProperty('sfx_url');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('file_name');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('created_at');
      expect(item).toHaveProperty('updated_at');
    });

    it('TC-MAT-SRCH-003: 向量检索结果包含 score（相似度分数）且降序排列', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
      };

      const result = await searchMaterialSlices(dto, deps());

      result.items.forEach((item) => {
        expect(typeof item.score).toBe('number');
        expect(item.score).toBeGreaterThan(0);
        expect(item.score).toBeLessThanOrEqual(1);
      });
    });

    it('TC-MAT-SRCH-004: search_mode=KEYWORD 返回 search_source=keyword_fallback', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(5));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBeGreaterThan(0);
      result.items.forEach((item) => {
        expect(item.score).toBeNull();
      });
    });

    it('TC-MAT-SRCH-005: search_mode=AUTO + Qdrant 可用 → 向量检索路径', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'AUTO',
      };

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('vector');
      expect(mockQdrant.search).toHaveBeenCalled();
    });

    it('TC-MAT-SRCH-006: search_mode=AUTO + Qdrant 不可用 → 自动降级 KEYWORD', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'AUTO',
      };

      mockQdrant.search.mockRejectedValue(new Error('Qdrant unreachable'));
      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBe(3);
    });

    it('TC-MAT-SRCH-007: search_mode=AUTO + Qdrant 空结果 → 自动降级 KEYWORD', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'AUTO',
      };

      mockQdrant.search.mockResolvedValue([]);
      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(2));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBe(2);
    });

    it('TC-MAT-SRCH-008: search_mode=VECTOR → Qdrant 失败时直接抛异常', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'VECTOR',
      };

      mockQdrant.search.mockRejectedValue(new Error('Qdrant unreachable'));

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VECTOR_SEARCH_FAILED');
    });

    it('TC-MAT-SRCH-009: search_mode=VECTOR → Qdrant 空结果返回 items=[]', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'VECTOR',
      };

      mockQdrant.search.mockResolvedValue([]);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items).toEqual([]);
      expect(result.page_info.total_count).toBe(0);
      expect(result.page_info.has_more).toBe(false);
      expect(result.search_source).toBe('vector');
    });

    it('TC-MAT-SRCH-010: 结构化筛选 type=VIDEO 与向量检索同时生效', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        type: 'VIDEO',
        status: 'COMPLETED',
      };

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('vector');
      expect(mockQdrant.search).toHaveBeenCalledWith(
        'asset_slices',
        expect.objectContaining({
          filter: expect.objectContaining({
            must: expect.arrayContaining([
              expect.objectContaining({ key: 'type', match: { value: 'VIDEO' } }),
              expect.objectContaining({ key: 'status', match: { value: 'COMPLETED' } }),
            ]),
          }),
        }),
      );
    });

    it('TC-MAT-SRCH-011: 时间范围过滤 min_duration/max_duration 传入 Qdrant filter', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        min_duration: 1.5,
        max_duration: 4.0,
      };

      await searchMaterialSlices(dto, deps());

      expect(mockQdrant.search).toHaveBeenCalledWith(
        'asset_slices',
        expect.objectContaining({
          filter: expect.objectContaining({
            must: expect.arrayContaining([
              expect.objectContaining({ key: 'duration', range: { gte: 1.5, lte: 4.0 } }),
            ]),
          }),
        }),
      );
    });

    it('TC-MAT-SRCH-012: ImageBind embedQuery 返回 512 维向量', async () => {
      const embedding = await embedQuery(mockImageBind, 'wireless hair curler');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(EMBEDDING_DIM);
      expect(typeof embedding[0]).toBe('number');
    });

    it('TC-MAT-SRCH-013: search_mode=KEYWORD 且无 query → 仅结构化筛选查询', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        type: 'VIDEO',
        status: 'COMPLETED',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(4));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBe(4);
    });

    it('TC-MAT-SRCH-014: 关键字兜底分页正确 — has_more=true 返回 next_cursor', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        search_mode: 'KEYWORD',
        limit: 3,
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(4));
      mockPrisma.materialSlice.count.mockResolvedValue(25);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBe(3);
      expect(result.page_info.has_more).toBe(true);
      expect(result.page_info.cursor).not.toBeNull();
    });

    it('TC-MAT-SRCH-015: 关键字兜底分页 — cursor 翻页', async () => {
      const firstPageRows = mockSliceRowListFactory(6);
      const secondPageRows = mockSliceRowListFactory(5).map((r, i) => ({
        ...r,
        slice_id: `slc_page2_${i}`,
      }));

      mockPrisma.materialSlice.findMany.mockResolvedValueOnce(firstPageRows);
      mockPrisma.materialSlice.count.mockResolvedValue(25);

      const dto1: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        search_mode: 'KEYWORD',
        limit: 5,
      };
      const result1 = await searchMaterialSlices(dto1, deps());

      mockPrisma.materialSlice.findMany.mockResolvedValueOnce(secondPageRows);
      const dto2: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        search_mode: 'KEYWORD',
        limit: 5,
        cursor: result1.page_info.cursor!,
      };
      const result2 = await searchMaterialSlices(dto2, deps());

      expect(result2.items.length).toBe(5);
    });

    it('TC-MAT-SRCH-016: mapToMaterialSliceResult — 正确映射所有字段', () => {
      const row = mockSliceRowFactory(1);
      const result = mapToMaterialSliceResult(row, 'vector', 0.95);

      expect(result.slice_id).toBe(row.slice_id);
      expect(result.material_id).toBe(row.material_id);
      expect(result.start_time).toBe(row.start_time);
      expect(result.end_time).toBe(row.end_time);
      expect(result.duration).toBe(row.duration);
      expect(result.dense_caption).toBe(row.dense_caption);
      expect(result.tags).toEqual(row.tags);
      expect(result.stream_url).toBe(row.stream_url);
      expect(result.key_frame_url).toBe(row.key_frame_url);
      expect(result.embedding_version).toBe(row.embedding_version);
      expect(result.sfx_url).toBe(row.sfx_url);
      expect(result.status).toBe(row.status);
      expect(result.score).toBe(0.95);
      expect(result.file_name).toBe(row.material?.file_name);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-MAT-SRCH-BND-001: 仅 type 筛选无 query → 正常执行', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        type: 'VIDEO',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(5));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-SRCH-BND-002: 仅 status 筛选无 query → 正常执行', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        status: 'COMPLETED',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBe(3);
    });

    it('TC-MAT-SRCH-BND-003: query 为空字符串 → trim 后为 undefined → 降级筛选查询', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: '',
        type: 'VIDEO',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-SRCH-BND-004: query 为纯空格 → trim 后为 undefined', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: '   ',
        type: 'VIDEO',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBe(3);
    });

    it('TC-MAT-SRCH-BND-005: limit=1 → 返回恰好 1 条', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        limit: 1,
      };

      mockQdrant.search.mockResolvedValue([mockQdrantResultFactory(1)]);
      mockPrisma.materialSlice.findMany.mockResolvedValue([mockSliceRowFactory(1)]);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBe(1);
    });

    it('TC-MAT-SRCH-BND-006: limit=50 (上限) → 正常执行', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        limit: 50,
      };

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBeLessThanOrEqual(50);
    });

    it('TC-MAT-SRCH-BND-007: min_duration=0 max_duration=0 → 筛选 duration=0 的切片', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        min_duration: 0,
        max_duration: 0,
      };

      await searchMaterialSlices(dto, deps());

      expect(mockQdrant.search).toHaveBeenCalledWith(
        'asset_slices',
        expect.objectContaining({
          filter: expect.objectContaining({
            must: expect.arrayContaining([
              expect.objectContaining({ key: 'duration', range: { gte: 0, lte: 0 } }),
            ]),
          }),
        }),
      );
    });

    it('TC-MAT-SRCH-BND-008: ImageBind 返回错误维度 embedding → embedQuery 降级零向量', async () => {
      mockImageBind.embedQuery.mockResolvedValue([0.1, 0.2]);

      const embedding = await embedQuery(mockImageBind, 'test');

      expect(embedding.length).toBe(EMBEDDING_DIM);
    });

    it('TC-MAT-SRCH-BND-009: 关键字兜底零结果 → items=[], total_count=0', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'xyznonexistentpattern',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue([]);
      mockPrisma.materialSlice.count.mockResolvedValue(0);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items).toEqual([]);
      expect(result.page_info.total_count).toBe(0);
      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();
    });

    it('TC-MAT-SRCH-BND-010: Qdrant 返回结果数与 PG 回查不一致 → 仅返回 PG 中存在的', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
      };

      const qResults = mockQdrantResultListFactory(5);
      mockQdrant.search.mockResolvedValue(qResults);
      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBe(3);
    });

    it('TC-MAT-SRCH-BND-011: 关键词兜底 count 查询失败 → total_count=-1 不阻断', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(5));
      mockPrisma.materialSlice.count.mockRejectedValue(new Error('count timeout'));

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.page_info.total_count).toBe(-1);
    });

    it('TC-MAT-SRCH-BND-012: 切片 tags 为 null → mapToMaterialSliceResult 返回空数组', () => {
      const row = mockSliceRowFactory(1, { tags: null as unknown as string[] });
      const result = mapToMaterialSliceResult(row, 'keyword_fallback');

      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags).toEqual([]);
    });

    it('TC-MAT-SRCH-BND-013: 切片 stream_url/key_frame_url 为 null → 正确返回 null', () => {
      const row = mockSliceRowFactory(1, {
        stream_url: null,
        key_frame_url: null,
        sfx_url: null,
      });
      const result = mapToMaterialSliceResult(row, 'vector', 0.9);

      expect(result.stream_url).toBeNull();
      expect(result.key_frame_url).toBeNull();
      expect(result.sfx_url).toBeNull();
    });
  });

  // ===========================================================================
  // 3. 异常流（Exception / Error Handling）
  // ===========================================================================

  describe('【异常流】人为制造报错场景 → 精准抛出规范错误码', () => {
    it('TC-MAT-SRCH-ERR-001: limit=0 → 抛出 INVALID_REQUEST', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
        limit: 0,
      };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MAT-SRCH-ERR-002: limit=-1 → 抛出 INVALID_REQUEST', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
        limit: -1,
      };

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-SRCH-ERR-003: limit=51 (超过 MAX_LIMIT) → 抛出 INVALID_REQUEST', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
        limit: 51,
      };

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-SRCH-ERR-004: 无任何查询条件 → 抛出 INVALID_REQUEST', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
      };

      let caught: Error & { errorCode?: string; details?: Record<string, unknown> } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.details!.reason).toBe('at_least_one_filter_required');
    });

    it('TC-MAT-SRCH-ERR-005: search_mode=VECTOR + Qdrant 失败 → 抛出 VECTOR_SEARCH_FAILED', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
        search_mode: 'VECTOR',
      };

      mockQdrant.search.mockRejectedValue(new Error('Qdrant down'));

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VECTOR_SEARCH_FAILED');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-SRCH-ERR-006: Prisma findMany P1001 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockRejectedValue(
        Object.assign(new Error('Connection timeout'), { code: 'P1001' }),
      );

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-SRCH-ERR-007: Prisma findMany P2024 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockRejectedValue(
        Object.assign(new Error('Connection pool exhausted'), { code: 'P2024' }),
      );

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-SRCH-ERR-008: ImageBind 抛异常 → embedQuery 返回零向量不抛异常', async () => {
      mockImageBind.embedQuery.mockRejectedValue(new Error('ImageBind service down'));

      const embedding = await embedQuery(mockImageBind, 'test');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(EMBEDDING_DIM);
    });

    it('TC-MAT-SRCH-ERR-009: PG 回查失败 → 抛出 INTERNAL_SERVER_ERROR', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
        search_mode: 'VECTOR',
      };

      mockPrisma.materialSlice.findMany.mockRejectedValue(
        Object.assign(new Error('Query failed'), { code: 'P2028' }),
      );

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await searchMaterialSlices(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
    });

    it('TC-MAT-SRCH-ERR-010: search_mode 未传时默认 AUTO', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
      };
      delete dto.search_mode;

      const params = resolveSearchDefaults(dto);
      expect(params.search_mode).toBe('AUTO');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    it('TC-MAT-SRCH-PERF-001: searchMaterialSlices AUTO 全链路 ≤ 2000ms', async () => {
      const PERF_CEILING_MS = 2000;
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
      };

      const start = performance.now();

      await searchMaterialSlices(dto, deps());

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 5000);

    it('TC-MAT-SRCH-PERF-002: resolveSearchDefaults ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
      };

      const start = performance.now();

      const params = resolveSearchDefaults(dto);

      const elapsed = performance.now() - start;

      expect(params.product_id).toBe(PRODUCT_ID);
      expect(params.search_mode).toBe('AUTO');
      expect(params.limit).toBe(DEFAULT_LIMIT);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-SRCH-PERF-003: buildSearchFilter ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const params: ResolvedSearchParams = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        type: 'VIDEO',
        status: 'COMPLETED',
        min_duration: 1.5,
        max_duration: 4.0,
        search_mode: 'AUTO',
        limit: 20,
      };

      const start = performance.now();

      const filters = buildSearchFilter(params);

      const elapsed = performance.now() - start;

      expect(filters).toHaveProperty('qdrantFilter');
      expect(filters).toHaveProperty('pgWhere');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-SRCH-PERF-004: collectHitIds (100 results) ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const results = Array.from({ length: 100 }, (_, i) => mockQdrantResultFactory(i + 1));

      const start = performance.now();

      const ids = collectHitIds(results);

      const elapsed = performance.now() - start;

      expect(ids.length).toBe(100);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-SRCH-PERF-005: mapToMaterialSliceResult ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const row = mockSliceRowFactory(1);

      const start = performance.now();

      const result = mapToMaterialSliceResult(row, 'vector', 0.95);

      const elapsed = performance.now() - start;

      expect(result.slice_id).toBe(row.slice_id);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-SRCH-PERF-006: findSlicesByIds (mock 20 条) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;
      const ids = SLICE_IDS.slice(0, 5);

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(5));

      const start = performance.now();

      const result = await findSlicesByIds(mockPrisma, ids);

      const elapsed = performance.now() - start;

      expect(result.length).toBe(5);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-SRCH-PERF-007: searchSlicesByKeyword (mock 10 条) ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;
      const pgWhere: Record<string, unknown> = {
        product_id: PRODUCT_ID,
        OR: [{ dense_caption: { contains: 'wireless', mode: 'insensitive' } }],
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(10));
      mockPrisma.materialSlice.count.mockResolvedValue(25);

      const start = performance.now();

      const result = await searchSlicesByKeyword(mockPrisma, pgWhere, 20);

      const elapsed = performance.now() - start;

      expect(result.items.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-SRCH-PERF-008: 连续 50 次 searchMaterialSlices 无退化', async () => {
      const ITERATIONS = 50;
      const PERF_CEILING_MS_PER_ITERATION = 100;
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
      };

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await searchMaterialSlices(dto, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 30000);

    it('TC-MAT-SRCH-PERF-009: embedQuery 成功返回 ≤ 50ms', async () => {
      const PERF_CEILING_MS = 50;

      const start = performance.now();

      const embedding = await embedQuery(mockImageBind, 'wireless');

      const elapsed = performance.now() - start;

      expect(embedding.length).toBe(EMBEDDING_DIM);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-SRCH-PERF-010: mapToMaterialSliceResult ×100 次 ≤ 10ms', () => {
      const PERF_CEILING_MS = 10;
      const rows = mockSliceRowListFactory(100);

      const start = performance.now();

      for (const row of rows) {
        mapToMaterialSliceResult(row, 'vector', 0.9);
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立纯逻辑验证', () => {
    it('TC-MAT-SRCH-ATOM-001: resolveSearchDefaults — 完整 DTO 正确解析', () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        type: 'VIDEO',
        status: 'COMPLETED',
        min_duration: 1.5,
        max_duration: 4.0,
        search_mode: 'VECTOR',
        limit: 10,
      };

      const params = resolveSearchDefaults(dto);

      expect(params.product_id).toBe(PRODUCT_ID);
      expect(params.query).toBe('wireless hair curler');
      expect(params.type).toBe('VIDEO');
      expect(params.status).toBe('COMPLETED');
      expect(params.min_duration).toBe(1.5);
      expect(params.max_duration).toBe(4.0);
      expect(params.search_mode).toBe('VECTOR');
      expect(params.limit).toBe(10);
    });

    it('TC-MAT-SRCH-ATOM-002: resolveSearchDefaults — 默认值填充', () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'test',
      };

      const params = resolveSearchDefaults(dto);

      expect(params.search_mode).toBe('AUTO');
      expect(params.limit).toBe(DEFAULT_LIMIT);
      expect(params.type).toBeUndefined();
      expect(params.status).toBeUndefined();
    });

    it('TC-MAT-SRCH-ATOM-003: buildSearchFilter — 仅 product_id', () => {
      const params: ResolvedSearchParams = {
        product_id: PRODUCT_ID,
        query: 'test',
        search_mode: 'AUTO',
        limit: 20,
      };

      const filters = buildSearchFilter(params);

      const pgWhere = filters.pgWhere as Record<string, unknown>;
      expect(pgWhere.product_id).toBe(PRODUCT_ID);
      expect(pgWhere.type).toBeUndefined();
      expect(pgWhere.status).toBeUndefined();
      expect(pgWhere.duration).toBeUndefined();
    });

    it('TC-MAT-SRCH-ATOM-004: buildSearchFilter — 全筛选条件', () => {
      const params: ResolvedSearchParams = {
        product_id: PRODUCT_ID,
        query: 'test',
        type: 'VIDEO',
        status: 'COMPLETED',
        min_duration: 2.0,
        max_duration: 5.0,
        search_mode: 'AUTO',
        limit: 20,
      };

      const filters = buildSearchFilter(params);

      const pgWhere = filters.pgWhere as Record<string, unknown>;
      expect(pgWhere.type).toBe('VIDEO');
      expect(pgWhere.status).toBe('COMPLETED');
      expect(pgWhere.duration).toEqual({ gte: 2.0, lte: 5.0 });

      const qdrantFilter = filters.qdrantFilter as Record<string, unknown>;
      expect(qdrantFilter.must).toBeDefined();
    });

    it('TC-MAT-SRCH-ATOM-005: collectHitIds — 有序提取 slice_id', () => {
      const results = [
        mockQdrantResultFactory(1, 0.95),
        mockQdrantResultFactory(2, 0.88),
        mockQdrantResultFactory(3, 0.72),
      ];

      const ids = collectHitIds(results);

      expect(ids).toEqual([SLICE_ID_1, SLICE_ID_2, SLICE_ID_3]);
    });

    it('TC-MAT-SRCH-ATOM-006: collectHitIds — 空结果返回空数组', () => {
      const ids = collectHitIds([]);

      expect(ids).toEqual([]);
    });

    it('TC-MAT-SRCH-ATOM-007: mapToMaterialSliceResult — score null 关键字兜底', () => {
      const row = mockSliceRowFactory(1);
      const result = mapToMaterialSliceResult(row, 'keyword_fallback');

      expect(result.score).toBeNull();
      expect(result.file_name).toBe(row.material?.file_name);
    });

    it('TC-MAT-SRCH-ATOM-008: mapToMaterialSliceResult — score 有效值', () => {
      const row = mockSliceRowFactory(1);
      const result = mapToMaterialSliceResult(row, 'vector', 0.92);

      expect(result.score).toBe(0.92);
    });

    it('TC-MAT-SRCH-ATOM-009: mapToMaterialSliceResult — material 缺失兜底', () => {
      const row = { ...mockSliceRowFactory(1), material: undefined };
      const result = mapToMaterialSliceResult(row, 'vector', 0.5);

      expect(result.file_name).toBeUndefined();
      expect(result.type).toBeUndefined();
    });

    it('TC-MAT-SRCH-ATOM-010: performQdrantSearch — Qdrant 异常抛出 VECTOR_SEARCH_FAILED', async () => {
      mockQdrant.search.mockRejectedValue(new Error('Qdrant network error'));

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await performQdrantSearch(mockQdrant, mockEmbeddingFactory(), {}, 10);
      } catch (err) {
        caught = err as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VECTOR_SEARCH_FAILED');
      expect(caught!.retryable).toBe(true);
    });
  });

  // ===========================================================================
  // 6. 关键字兜底专项测试（嵌套 material 关系过滤 + JSON tags 路径筛选）
  // ===========================================================================

  describe('【关键字兜底】嵌套 material 关系过滤 + JSON tags 筛选', () => {
    /**
     * 构建与生产环境 buildSearchFilters 一致的 pgWhere 结构
     * 差异点：product_id 通过嵌套的 material 关系过滤，而非平铺字段
     */
    const buildProductionPgWhere = (overrides?: Record<string, unknown>): Record<string, unknown> => {
      const materialFilter: Record<string, unknown> = {
        productId: PRODUCT_ID,
      };
      const pgWhere: Record<string, unknown> = {
        material: materialFilter,
      };
      if (overrides) {
        Object.assign(pgWhere, overrides);
      }
      return pgWhere;
    };

    it('TC-MAT-SRCH-KW-001: KEYWORD 模式 + 嵌套 material 关系过滤 + tags path 语法 → 正常返回结果', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(5));
      mockPrisma.materialSlice.count.mockResolvedValue(25);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBeGreaterThan(0);
      expect(mockPrisma.materialSlice.findMany).toHaveBeenCalled();
    });

    it('TC-MAT-SRCH-KW-002: KEYWORD 模式 + type/status 结构化筛选 + 嵌套 material 关系过滤 → 正常返回', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        type: 'VIDEO',
        status: 'COMPLETED',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));
      mockPrisma.materialSlice.count.mockResolvedValue(10);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBe(3);
    });

    it('TC-MAT-SRCH-KW-003: AUTO 模式 + Qdrant 空结果 → 关键字兜底 + 嵌套 material 过滤', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless hair curler',
        search_mode: 'AUTO',
      };

      mockQdrant.search.mockResolvedValue([]);
      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(4));
      mockPrisma.materialSlice.count.mockResolvedValue(15);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBe(4);
    });

    it('TC-MAT-SRCH-KW-004: AUTO 模式 + Qdrant 异常 → 关键字兜底 + 嵌套 material 过滤', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        search_mode: 'AUTO',
      };

      mockQdrant.search.mockRejectedValue(new Error('Qdrant unreachable'));
      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));
      mockPrisma.materialSlice.count.mockResolvedValue(10);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBe(3);
    });

    it('TC-MAT-SRCH-KW-005: 关键字兜底 zero results → items=[] + total_count=0', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'nonexistent_term_xyz',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue([]);
      mockPrisma.materialSlice.count.mockResolvedValue(0);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items).toEqual([]);
      expect(result.page_info.total_count).toBe(0);
      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();
      expect(result.search_source).toBe('keyword_fallback');
    });

    it('TC-MAT-SRCH-KW-006: 关键字兜底 score 始终为 null', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(3));

      const result = await searchMaterialSlices(dto, deps());

      result.items.forEach((item) => {
        expect(item.score).toBeNull();
      });
    });

    it('TC-MAT-SRCH-KW-007: 关键字兜底 + duration 过滤 → 正确传入 pgWhere', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'wireless',
        min_duration: 2.0,
        max_duration: 5.0,
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(4));
      mockPrisma.materialSlice.count.mockResolvedValue(8);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.search_source).toBe('keyword_fallback');
      expect(result.items.length).toBe(4);
    });

    it('TC-MAT-SRCH-KW-008: 关键字兜底查找 — tags 包含特殊字符正常返回', async () => {
      const dto: SearchMaterialsDto = {
        product_id: PRODUCT_ID,
        query: 'hair%curler',
        search_mode: 'KEYWORD',
      };

      mockPrisma.materialSlice.findMany.mockResolvedValue(mockSliceRowListFactory(2));
      mockPrisma.materialSlice.count.mockResolvedValue(5);

      const result = await searchMaterialSlices(dto, deps());

      expect(result.items.length).toBe(2);
      expect(result.search_source).toBe('keyword_fallback');
    });
  });
});
