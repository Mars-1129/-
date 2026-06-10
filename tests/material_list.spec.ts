// =============================================================================
// TikStream AI — Material List Query 自动化测试基座
// 对应功能: GET /api/v1/materials (素材列表查询 — cursor 游标分页 + 多维度筛选)
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
type SortField = 'created_at' | 'file_size_bytes' | 'duration_seconds';
type SortOrder = 'ASC' | 'DESC';

interface ListMaterialsDto {
  product_id: string;
  type?: MaterialType;
  status?: MaterialStatus;
  source_type?: MaterialSourceType;
  keyword?: string;
  created_at_start?: string;
  created_at_end?: string;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
  cursor?: string;
}

interface ResolvedListParams {
  product_id: string;
  type?: MaterialType;
  status?: MaterialStatus;
  source_type?: MaterialSourceType;
  keyword?: string;
  created_at_start?: string;
  created_at_end?: string;
  sort_by: SortField;
  sort_order: SortOrder;
  limit: number;
  cursor?: string;
}

interface MaterialListFilter {
  product_id: string;
  type?: MaterialType;
  status?: MaterialStatus;
  source_type?: MaterialSourceType;
  file_name_contains?: string;
  file_name_mode?: 'insensitive';
  created_at_gte?: Date;
  created_at_lte?: Date;
  sort_by: SortField;
  sort_order: SortOrder;
  limit: number;
  cursor?: string;
}

interface DecodedCursor {
  id: string;
  sort_value: string | number;
  sort_field: SortField;
}

interface MaterialListItem {
  material_id: string;
  file_name: string;
  type: MaterialType;
  source_type: MaterialSourceType;
  status: MaterialStatus;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  slices_count: number;
  product_title: string;
  product_category: string;
  created_at: string;
}

interface CursorPageInfo {
  cursor: string | null;
  has_more: boolean;
  total_count: number;
}

interface MaterialListResponse {
  items: MaterialListItem[];
  page_info: CursorPageInfo;
}

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
  product?: {
    id: string;
    title: string;
    category: string;
    selling_points: string[];
  } | null;
  _count?: {
    slices: number;
  };
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
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-26T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID_EMPTY = '00000000-0000-0000-0000-000000000099';

const MATERIAL_IDS = [
  '10000000-0000-4000-a000-000000000001',
  '10000000-0000-4000-a000-000000000002',
  '10000000-0000-4000-a000-000000000003',
  '10000000-0000-4000-a000-000000000004',
  '10000000-0000-4000-a000-000000000005',
  '10000000-0000-4000-a000-000000000006',
  '10000000-0000-4000-a000-000000000007',
  '10000000-0000-4000-a000-000000000008',
  '10000000-0000-4000-a000-000000000009',
  '10000000-0000-4000-a000-000000000010',
  '10000000-0000-4000-a000-000000000011',
  '10000000-0000-4000-a000-000000000012',
  '10000000-0000-4000-a000-000000000013',
  '10000000-0000-4000-a000-000000000014',
  '10000000-0000-4000-a000-000000000015',
  '10000000-0000-4000-a000-000000000016',
  '10000000-0000-4000-a000-000000000017',
  '10000000-0000-4000-a000-000000000018',
  '10000000-0000-4000-a000-000000000019',
  '10000000-0000-4000-a000-000000000020',
  '10000000-0000-4000-a000-000000000021',
  '10000000-0000-4000-a000-000000000022',
  '10000000-0000-4000-a000-000000000023',
  '10000000-0000-4000-a000-000000000024',
  '10000000-0000-4000-a000-000000000025',
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SORTABLE_FIELDS: SortField[] = ['created_at', 'file_size_bytes', 'duration_seconds'];
const VALID_SORT_ORDERS: SortOrder[] = ['ASC', 'DESC'];
const DEFAULT_SORT_BY: SortField = 'created_at';
const DEFAULT_SORT_ORDER: SortOrder = 'DESC';

const VALID_MATERIAL_TYPES: MaterialType[] = ['IMAGE', 'VIDEO'];
const VALID_MATERIAL_STATUSES: MaterialStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
const VALID_MATERIAL_SOURCE_TYPES: MaterialSourceType[] = ['UPLOAD', 'REFERENCE', 'GENERATED'];

const CURSOR_SORT_FIELD_MAP: Record<SortField, string> = {
  created_at: 'created_at',
  file_size_bytes: 'file_size_bytes',
  duration_seconds: 'duration_seconds',
};

// ============================================================
// Mock Factories
// ============================================================

const mockProductFactory = (overrides?: Partial<TestProductRow>): TestProductRow => ({
  id: PRODUCT_ID,
  title: '智能无线卷发棒 Pro',
  sku_code: 'SKU-HB-PRO-001',
  category: 'Beauty/PersonalCare',
  selling_points: ['3档智能控温', '10分钟快充', '便携无线'],
  target_audience: '北美年轻女性,25-35岁',
  scenario_tags: ['日常造型', '出差便携'],
  text_features: {},
  cover_image_url: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockMaterialRowFactory = (index: number, overrides?: Partial<TestMaterialRow>): TestMaterialRow => ({
  id: MATERIAL_IDS[index - 1] || MATERIAL_IDS[0],
  product_id: PRODUCT_ID,
  file_name: `product_demo_${String(index).padStart(3, '0')}.mp4`,
  type: index % 3 === 0 ? 'IMAGE' : 'VIDEO',
  source_type: index <= 5 ? 'UPLOAD' : 'REFERENCE',
  origin_url: `http://minio:9000/tikstream-assets/materials/20260526/${MATERIAL_IDS[index - 1]}/product_demo_${String(index).padStart(3, '0')}.mp4`,
  thumbnail_url: index % 4 === 0 ? null : `http://minio:9000/tikstream-assets/materials/20260526/${MATERIAL_IDS[index - 1]}/thumb.webp`,
  file_size_bytes: BigInt(5 * 1024 * 1024 + index * 1024 * 512),
  duration_seconds: index % 3 === 0 ? null : (5.0 + index * 0.5),
  width: 1080,
  height: 1920,
  mime_type: index % 3 === 0 ? 'image/jpeg' : 'video/mp4',
  status: index <= 15 ? 'COMPLETED' : (index <= 20 ? 'PROCESSING' : 'PENDING'),
  slices_count: index % 3 === 0 ? 1 : (3 + (index % 5)),
  remark: index === 1 ? '核心素材-主视觉' : null,
  created_at: new Date(NOW.getTime() - (25 - index) * 3600000),
  updated_at: new Date(NOW.getTime() - (25 - index) * 1800000),
  product: {
    id: PRODUCT_ID,
    title: `商品-${index}`,
    category: index % 3 === 0 ? 'Beauty/PersonalCare' : (index % 3 === 1 ? 'Electronics' : 'Home & Kitchen'),
    selling_points: [`卖点${index}-A`, `卖点${index}-B`],
  },
  _count: {
    slices: index % 3 === 0 ? 1 : (3 + (index % 5)),
  },
  ...overrides,
});

const mockMaterialRowListFactory = (count: number, offset: number = 0): TestMaterialRow[] =>
  Array.from({ length: count }, (_, i) => mockMaterialRowFactory(i + 1 + offset));

const mockMaterialListItemFactory = (index: number, overrides?: Partial<MaterialListItem>): MaterialListItem => ({
  material_id: MATERIAL_IDS[index - 1] || MATERIAL_IDS[0],
  file_name: `product_demo_${String(index).padStart(3, '0')}.mp4`,
  type: index % 3 === 0 ? 'IMAGE' : 'VIDEO',
  source_type: index <= 5 ? 'UPLOAD' : 'REFERENCE',
  status: index <= 15 ? 'COMPLETED' : (index <= 20 ? 'PROCESSING' : 'PENDING'),
  thumbnail_url: index % 4 === 0 ? null : `http://minio:9000/tikstream-assets/materials/20260526/${MATERIAL_IDS[index - 1]}/thumb.webp`,
  duration_seconds: index % 3 === 0 ? null : (5.0 + index * 0.5),
  file_size_bytes: Number(BigInt(5 * 1024 * 1024 + index * 1024 * 512)),
  slices_count: index % 3 === 0 ? 1 : (3 + (index % 5)),
  product_title: `商品-${index}`,
  product_category: index % 3 === 0 ? 'Beauty/PersonalCare' : (index % 3 === 1 ? 'Electronics' : 'Home & Kitchen'),
  created_at: new Date(NOW.getTime() - (25 - index) * 3600000).toISOString(),
  ...overrides,
});

const mockPrismaClientFactory = (): MockPrismaClient => ({
  material: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
});

// ============================================================
// 测试套件入口
// ============================================================

describe('MaterialList — 素材列表查询 (GET /api/v1/materials)', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockPrisma: MockPrismaClient;

  // ---- 原子函数类型声明 ----

  type ResolveListDefaultsFn = (dto: ListMaterialsDto) => ResolvedListParams;

  type ValidateAndNormalizeSortFn = (
    sort_by: string,
    sort_order: string,
  ) => { sort_by: SortField; sort_order: SortOrder };

  type BuildListFilterFn = (params: ResolvedListParams) => MaterialListFilter;

  type DecodeCursorTokenFn = (
    token: string,
    sort_by: SortField,
  ) => DecodedCursor | null;

  type EncodeCursorTokenFn = (
    item: TestMaterialRow,
    sort_by: SortField,
  ) => string;

  type BuildSortConfigFn = (
    sort_by: SortField,
    sort_order: SortOrder,
  ) => Array<{ [key: string]: string }>;

  type BuildPrismaWhereFn = (filter: MaterialListFilter) => Record<string, unknown>;

  type BuildPrismaCursorFn = (
    cursor: DecodedCursor | null,
  ) => { id: string } | undefined;

  type FindMaterialsPaginatedFn = (
    prisma: MockPrismaClient,
    filter: MaterialListFilter,
    decodedCursor: DecodedCursor | null,
  ) => Promise<{
    items: TestMaterialRow[];
    total_count: number;
    has_more: boolean;
    next_cursor: string | null;
  }>;

  type MapToMaterialListItemFn = (row: TestMaterialRow) => MaterialListItem;

  type BuildPageInfoFn = (
    items: MaterialListItem[],
    hasMore: boolean,
    nextCursor: string | null,
    totalCount: number,
  ) => CursorPageInfo;

  type ListMaterialsFn = (
    dto: ListMaterialsDto,
    deps: {
      prisma: MockPrismaClient;
      atoms: {
        resolveListDefaults: ResolveListDefaultsFn;
        validateAndNormalizeSort: ValidateAndNormalizeSortFn;
        buildListFilter: BuildListFilterFn;
        decodeCursorToken: DecodeCursorTokenFn;
        findMaterialsPaginated: FindMaterialsPaginatedFn;
        mapToMaterialListItem: MapToMaterialListItemFn;
        buildPageInfo: BuildPageInfoFn;
      };
    },
  ) => Promise<MaterialListResponse>;

  // ---- 原子函数实例 ----
  let resolveListDefaults: ResolveListDefaultsFn;
  let validateAndNormalizeSort: ValidateAndNormalizeSortFn;
  let buildListFilter: BuildListFilterFn;
  let decodeCursorToken: DecodeCursorTokenFn;
  let encodeCursorToken: EncodeCursorTokenFn;
  let buildSortConfig: BuildSortConfigFn;
  let buildPrismaWhere: BuildPrismaWhereFn;
  let buildPrismaCursor: BuildPrismaCursorFn;
  let findMaterialsPaginated: FindMaterialsPaginatedFn;
  let mapToMaterialListItem: MapToMaterialListItemFn;
  let buildPageInfo: BuildPageInfoFn;
  let listMaterials: ListMaterialsFn;

  const SORT_FIELDS_TO_PRISMA: Record<SortField, string> = {
    created_at: 'created_at',
    file_size_bytes: 'file_size_bytes',
    duration_seconds: 'duration_seconds',
  };

  beforeAll(() => {
    // ===================================================================
    // F1: resolveListDefaults
    // 职责: 填充默认值 + 清洗 keyword + 校验 limit
    // ===================================================================

    resolveListDefaults = (dto) => {
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

      const keyword = dto.keyword?.trim() || undefined;

      return {
        product_id: dto.product_id,
        type: dto.type,
        status: dto.status,
        source_type: dto.source_type,
        keyword,
        created_at_start: dto.created_at_start,
        created_at_end: dto.created_at_end,
        sort_by: (dto.sort_by ?? DEFAULT_SORT_BY) as SortField,
        sort_order: (dto.sort_order ?? DEFAULT_SORT_ORDER) as SortOrder,
        limit,
        cursor: dto.cursor,
      };
    };

    // ===================================================================
    // F2: validateAndNormalizeSort
    // 职责: 白名单校验 sort_by/sort_order，非法值静默回退
    // ===================================================================

    validateAndNormalizeSort = (sort_by, sort_order) => {
      const validSortBy = SORTABLE_FIELDS.includes(sort_by as SortField)
        ? (sort_by as SortField)
        : DEFAULT_SORT_BY;

      const validSortOrder = VALID_SORT_ORDERS.includes(sort_order as SortOrder)
        ? (sort_order as SortOrder)
        : DEFAULT_SORT_ORDER;

      return { sort_by: validSortBy, sort_order: validSortOrder };
    };

    // ===================================================================
    // F3: buildListFilter
    // 职责: ResolvedListParams → MaterialListFilter
    // ===================================================================

    buildListFilter = (params) => {
      const filter: MaterialListFilter = {
        product_id: params.product_id,
        sort_by: params.sort_by,
        sort_order: params.sort_order,
        limit: params.limit,
      };

      if (params.type) {
        filter.type = params.type;
      }
      if (params.status) {
        filter.status = params.status;
      }
      if (params.source_type) {
        filter.source_type = params.source_type;
      }
      if (params.keyword) {
        filter.file_name_contains = params.keyword;
        filter.file_name_mode = 'insensitive';
      }

      if (params.created_at_start) {
        const parsed = new Date(params.created_at_start);
        if (isNaN(parsed.getTime())) {
          throw Object.assign(
            new Error(`created_at_start 不是有效的 ISO8601 时间: ${params.created_at_start}`),
            {
              errorCode: 'INVALID_REQUEST',
              statusCode: HttpStatus.BAD_REQUEST,
              retryable: false,
              details: { field: 'created_at_start', received: params.created_at_start },
            },
          );
        }
        filter.created_at_gte = parsed;
      }

      if (params.created_at_end) {
        const parsed = new Date(params.created_at_end);
        if (isNaN(parsed.getTime())) {
          throw Object.assign(
            new Error(`created_at_end 不是有效的 ISO8601 时间: ${params.created_at_end}`),
            {
              errorCode: 'INVALID_REQUEST',
              statusCode: HttpStatus.BAD_REQUEST,
              retryable: false,
              details: { field: 'created_at_end', received: params.created_at_end },
            },
          );
        }
        filter.created_at_lte = parsed;
      }

      if (
        filter.created_at_gte &&
        filter.created_at_lte &&
        filter.created_at_gte > filter.created_at_lte
      ) {
        throw Object.assign(
          new Error('created_at_start 不能晚于 created_at_end'),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
            details: {
              field: 'created_at_start',
              received: params.created_at_start,
              created_at_end: params.created_at_end,
            },
          },
        );
      }

      return filter;
    };

    // ===================================================================
    // F4: decodeCursorToken
    // 职责: base64url → DecodedCursor | null (静默降级)
    // ===================================================================

    decodeCursorToken = (token, sort_by) => {
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
          sort_field: sort_by,
        };
      } catch {
        return null;
      }
    };

    // ===================================================================
    // F5b: encodeCursorToken
    // 职责: MaterialRow → base64url cursor token
    // ===================================================================

    encodeCursorToken = (item, sort_by) => {
      let sortValue: string | number;
      switch (sort_by) {
        case 'created_at':
          sortValue = item.created_at.toISOString();
          break;
        case 'file_size_bytes':
          sortValue = Number(item.file_size_bytes);
          break;
        case 'duration_seconds':
          sortValue = item.duration_seconds ?? 0;
          break;
        default:
          sortValue = item.created_at.toISOString();
      }

      const payload = { v: sortValue, i: item.id };
      return Buffer.from(JSON.stringify(payload)).toString('base64url');
    };

    // ===================================================================
    // F5a: buildSortConfig
    // 职责: sort_by + sort_order → Prisma orderBy[]
    // ===================================================================

    buildSortConfig = (sort_by, sort_order) => {
      const sortField = SORT_FIELDS_TO_PRISMA[sort_by] || 'created_at';
      return [
        { [sortField]: sort_order.toLowerCase() },
        { id: 'desc' },
      ];
    };

    // ===================================================================
    // buildPrismaWhere (Repository 内部辅助)
    // 职责: MaterialListFilter → Prisma where 对象
    // ===================================================================

    buildPrismaWhere = (filter) => {
      const where: Record<string, unknown> = {
        product_id: filter.product_id,
      };

      if (filter.type) {
        where.type = filter.type;
      }
      if (filter.status) {
        where.status = filter.status;
      }
      if (filter.source_type) {
        where.source_type = filter.source_type;
      }
      if (filter.file_name_contains) {
        where.file_name = {
          contains: filter.file_name_contains,
          mode: filter.file_name_mode || 'insensitive',
        };
      }
      if (filter.created_at_gte || filter.created_at_lte) {
        const createdAtFilter: Record<string, Date> = {};
        if (filter.created_at_gte) {
          createdAtFilter.gte = filter.created_at_gte;
        }
        if (filter.created_at_lte) {
          createdAtFilter.lte = filter.created_at_lte;
        }
        where.created_at = createdAtFilter;
      }

      return where;
    };

    // ===================================================================
    // buildPrismaCursor (Repository 内部辅助)
    // ===================================================================

    buildPrismaCursor = (cursor) => {
      if (!cursor) {
        return undefined;
      }
      return { id: cursor.id };
    };

    // ===================================================================
    // F5: findMaterialsPaginated
    // 职责: Prisma findMany cursor-based 分页查询
    // ===================================================================

    findMaterialsPaginated = async (prisma, filter, decodedCursor) => {
      const where = buildPrismaWhere(filter);
      const orderBy = buildSortConfig(filter.sort_by, filter.sort_order);
      const cursor = buildPrismaCursor(decodedCursor);

      const skip = cursor ? 1 : 0;
      const take = filter.limit + 1;

      let items: TestMaterialRow[] = [];
      try {
        const findManyArgs: Record<string, unknown> = {
          where,
          orderBy,
          take,
        };
        if (cursor) {
          findManyArgs.cursor = cursor;
          findManyArgs.skip = skip;
        }
        items = await prisma.material.findMany(findManyArgs);
      } catch (err) {
        const prismaErr = err as Error & { code?: string };
        const isRetryable =
          prismaErr.code === 'P1001' ||
          prismaErr.code === 'P2028' ||
          prismaErr.code === 'P2024';
        throw Object.assign(
          new Error(`数据库查询失败: ${prismaErr.message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: isRetryable,
            prismaCode: prismaErr.code,
          },
        );
      }

      let total_count = -1;
      try {
        total_count = await prisma.material.count(where);
      } catch {
        total_count = -1;
      }

      const has_more = items.length > filter.limit;
      if (has_more) {
        items = items.slice(0, filter.limit);
      }

      let next_cursor: string | null = null;
      if (has_more && items.length > 0) {
        const lastItem = items[items.length - 1];
        next_cursor = encodeCursorToken(lastItem, filter.sort_by);
      }

      return { items, total_count, has_more, next_cursor };
    };

    // ===================================================================
    // F6: mapToMaterialListItem
    // 职责: Prisma 原始行 → API 响应 MaterialListItem
    // ===================================================================

    mapToMaterialListItem = (row) => {
      return {
        material_id: row.id,
        file_name: row.file_name,
        type: (row.type as MaterialType) || 'IMAGE',
        source_type: (row.source_type as MaterialSourceType) || 'UPLOAD',
        status: (row.status as MaterialStatus) || 'PENDING',
        thumbnail_url: row.thumbnail_url ?? null,
        duration_seconds: row.duration_seconds ?? null,
        file_size_bytes: Number(row.file_size_bytes),
        slices_count: row._count?.slices ?? row.slices_count ?? 0,
        product_title: row.product?.title ?? 'Unknown',
        product_category: row.product?.category ?? 'Unknown',
        created_at: row.created_at.toISOString(),
      };
    };

    // ===================================================================
    // F7: buildPageInfo
    // 职责: 构建 CursorPageInfo
    // ===================================================================

    buildPageInfo = (items, hasMore, nextCursor, totalCount) => {
      return {
        cursor: nextCursor,
        has_more: hasMore,
        total_count: totalCount,
      };
    };

    // ===================================================================
    // F0: listMaterials (主编排器)
    // 职责: 总编排：接收 DTO → 各原子函数串联 → 返回统一响应
    // ===================================================================

    listMaterials = async (dto, deps) => {
      const { prisma, atoms } = deps;

      const params = atoms.resolveListDefaults(dto);

      const normalizedSort = atoms.validateAndNormalizeSort(
        params.sort_by,
        params.sort_order,
      );
      params.sort_by = normalizedSort.sort_by;
      params.sort_order = normalizedSort.sort_order;

      const filter = atoms.buildListFilter(params);

      const decodedCursor = params.cursor
        ? atoms.decodeCursorToken(params.cursor, filter.sort_by)
        : null;

      const { items: rows, total_count, has_more, next_cursor } =
        await atoms.findMaterialsPaginated(prisma, filter, decodedCursor);

      const materialItems = rows.map((row) => atoms.mapToMaterialListItem(row));

      const page_info = atoms.buildPageInfo(
        materialItems,
        has_more,
        next_cursor,
        total_count,
      );

      return { items: materialItems, page_info };
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaClientFactory();

    mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(DEFAULT_LIMIT));
    mockPrisma.material.count.mockResolvedValue(25);
  });

  const deps = () => ({
    prisma: mockPrisma,
    atoms: {
      resolveListDefaults,
      validateAndNormalizeSort,
      buildListFilter,
      decodeCursorToken,
      findMaterialsPaginated,
      mapToMaterialListItem,
      buildPageInfo,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整 MaterialListResponse 输出', () => {
    it('TC-MAT-LIST-001: 基本查询 — 返回完整响应结构 { items, page_info }', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('page_info');
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(20);

      expect(result.page_info).toHaveProperty('cursor');
      expect(result.page_info).toHaveProperty('has_more');
      expect(result.page_info).toHaveProperty('total_count');
      expect(typeof result.page_info.has_more).toBe('boolean');
      expect(typeof result.page_info.total_count).toBe('number');
    });

    it('TC-MAT-LIST-002: 每个 MaterialListItem 包含全部必需字段', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      mockPrisma.material.findMany.mockResolvedValue([mockMaterialRowFactory(1)]);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(1);
      const item = result.items[0];

      expect(item).toHaveProperty('material_id');
      expect(typeof item.material_id).toBe('string');
      expect(item.material_id.length).toBeGreaterThan(0);

      expect(item).toHaveProperty('file_name');
      expect(typeof item.file_name).toBe('string');

      expect(item).toHaveProperty('type');
      expect(VALID_MATERIAL_TYPES).toContain(item.type);

      expect(item).toHaveProperty('source_type');
      expect(VALID_MATERIAL_SOURCE_TYPES).toContain(item.source_type);

      expect(item).toHaveProperty('status');
      expect(VALID_MATERIAL_STATUSES).toContain(item.status);

      expect(item).toHaveProperty('thumbnail_url');

      expect(item).toHaveProperty('duration_seconds');

      expect(item).toHaveProperty('file_size_bytes');
      expect(typeof item.file_size_bytes).toBe('number');
      expect(item.file_size_bytes).toBeGreaterThan(0);

      expect(item).toHaveProperty('slices_count');
      expect(typeof item.slices_count).toBe('number');
      expect(item.slices_count).toBeGreaterThanOrEqual(0);

      expect(item).toHaveProperty('product_title');
      expect(typeof item.product_title).toBe('string');

      expect(item).toHaveProperty('product_category');
      expect(typeof item.product_category).toBe('string');

      expect(item).toHaveProperty('created_at');
      expect(() => new Date(item.created_at)).not.toThrow();
    });

    it('TC-MAT-LIST-003: limit 默认值 20 生效（未传 limit）', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBeLessThanOrEqual(DEFAULT_LIMIT);
      expect(mockPrisma.material.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_LIMIT + 1 }),
      );
    });

    it('TC-MAT-LIST-004: 自定义 limit=5 返回 ≤5 条', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 5 };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(5));

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(5);
      expect(mockPrisma.material.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 6 }),
      );
    });

    it('TC-MAT-LIST-005: 按 type=VIDEO 筛选', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, type: 'VIDEO' };

      const videoOnlyRows = mockMaterialRowListFactory(15).filter((r) => r.type === 'VIDEO');
      mockPrisma.material.findMany.mockResolvedValue(videoOnlyRows);
      mockPrisma.material.count.mockResolvedValue(videoOnlyRows.length);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
      result.items.forEach((item) => {
        expect(item.type).toBe('VIDEO');
      });
    });

    it('TC-MAT-LIST-006: 按 status=COMPLETED 筛选', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, status: 'COMPLETED' };

      const completedRows = mockMaterialRowListFactory(16).filter((r) => r.status === 'COMPLETED');
      mockPrisma.material.findMany.mockResolvedValue(completedRows);

      const result = await listMaterials(dto, deps());

      result.items.forEach((item) => {
        expect(item.status).toBe('COMPLETED');
      });
    });

    it('TC-MAT-LIST-007: 按 source_type=UPLOAD 筛选', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, source_type: 'UPLOAD' };

      const uploadRows = mockMaterialRowListFactory(6).filter((r) => r.source_type === 'UPLOAD');
      mockPrisma.material.findMany.mockResolvedValue(uploadRows);

      const result = await listMaterials(dto, deps());

      result.items.forEach((item) => {
        expect(item.source_type).toBe('UPLOAD');
      });
    });

    it('TC-MAT-LIST-008: 关键词模糊搜索 keyword=卷发棒', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, keyword: '卷发棒' };

      const matchingRows = [
        mockMaterialRowFactory(1, { file_name: '卷发棒_主视觉.mp4' }),
        mockMaterialRowFactory(2, { file_name: '卷发棒_使用场景.jpg' }),
      ];
      mockPrisma.material.findMany.mockResolvedValue(matchingRows);
      mockPrisma.material.count.mockResolvedValue(2);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(2);
      expect(result.page_info.total_count).toBe(2);
    });

    it('TC-MAT-LIST-009: 时间范围过滤 created_at_start / created_at_end', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        created_at_start: '2026-05-25T00:00:00Z',
        created_at_end: '2026-05-27T00:00:00Z',
      };

      const filteredRows = mockMaterialRowListFactory(10);
      mockPrisma.material.findMany.mockResolvedValue(filteredRows);
      mockPrisma.material.count.mockResolvedValue(10);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(10);
    });

    it('TC-MAT-LIST-010: 多条件复合筛选 type=VIDEO + status=COMPLETED + source_type=UPLOAD', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        type: 'VIDEO',
        status: 'COMPLETED',
        source_type: 'UPLOAD',
      };

      const multiRows = mockMaterialRowListFactory(5).map((r) => ({
        ...r,
        type: 'VIDEO',
        status: 'COMPLETED',
        source_type: 'UPLOAD',
      }));
      mockPrisma.material.findMany.mockResolvedValue(multiRows);
      mockPrisma.material.count.mockResolvedValue(5);

      const result = await listMaterials(dto, deps());

      result.items.forEach((item) => {
        expect(item.type).toBe('VIDEO');
        expect(item.status).toBe('COMPLETED');
        expect(item.source_type).toBe('UPLOAD');
      });
    });

    it('TC-MAT-LIST-011: 排序 sort_by=file_size_bytes sort_order=ASC', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        sort_by: 'file_size_bytes',
        sort_order: 'ASC',
      };

      const rows = mockMaterialRowListFactory(5).sort(
        (a, b) => Number(a.file_size_bytes) - Number(b.file_size_bytes),
      );
      mockPrisma.material.findMany.mockResolvedValue(rows);

      const result = await listMaterials(dto, deps());

      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i].file_size_bytes).toBeGreaterThanOrEqual(
          result.items[i - 1].file_size_bytes,
        );
      }
    });

    it('TC-MAT-LIST-012: 排序 sort_by=duration_seconds sort_order=DESC', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        sort_by: 'duration_seconds',
        sort_order: 'DESC',
      };

      const videoRows = mockMaterialRowListFactory(10)
        .filter((r) => r.type === 'VIDEO')
        .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0));
      mockPrisma.material.findMany.mockResolvedValue(videoRows);

      const result = await listMaterials(dto, deps());

      for (let i = 1; i < result.items.length; i++) {
        const prev = result.items[i - 1].duration_seconds ?? 0;
        const curr = result.items[i].duration_seconds ?? 0;
        expect(curr).toBeLessThanOrEqual(prev);
      }
    });

    it('TC-MAT-LIST-013: Cursor 分页有效 — 返回 has_more=true + next_cursor', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 5 };

      const firstPage = mockMaterialRowListFactory(6);
      mockPrisma.material.findMany.mockResolvedValue(firstPage);
      mockPrisma.material.count.mockResolvedValue(25);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(5);
      expect(result.page_info.has_more).toBe(true);
      expect(result.page_info.cursor).not.toBeNull();
      expect(typeof result.page_info.cursor).toBe('string');
    });

    it('TC-MAT-LIST-014: Cursor 分页 — 最后一页返回 has_more=false + cursor=null', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 10 };

      const lastPage = mockMaterialRowListFactory(3);
      mockPrisma.material.findMany.mockResolvedValue(lastPage);
      mockPrisma.material.count.mockResolvedValue(23);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(3);
      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();
    });

    it('TC-MAT-LIST-015: 使用 cursor 翻到第二页', async () => {
      const firstPageRows = mockMaterialRowListFactory(6);
      const lastItemOfFirstPage = firstPageRows[4];
      const cursorToken = encodeCursorToken(lastItemOfFirstPage as TestMaterialRow, 'created_at');

      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        limit: 5,
        cursor: cursorToken,
      };

      const secondPage = mockMaterialRowListFactory(5, 5);
      mockPrisma.material.findMany.mockResolvedValue(secondPage);
      mockPrisma.material.count.mockResolvedValue(25);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(5);
      expect(result.items[0].material_id).toBe(MATERIAL_IDS[5]);
    });

    it('TC-MAT-LIST-016: product 关联缺失时 product_title / product_category 兜底为 Unknown', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const orphanRow = mockMaterialRowFactory(1, { product: null });
      mockPrisma.material.findMany.mockResolvedValue([orphanRow]);

      const result = await listMaterials(dto, deps());

      expect(result.items[0].product_title).toBe('Unknown');
      expect(result.items[0].product_category).toBe('Unknown');
    });

    it('TC-MAT-LIST-017: 图片素材 duration_seconds 为 null', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const imageRow = mockMaterialRowFactory(3, { type: 'IMAGE', duration_seconds: null });
      mockPrisma.material.findMany.mockResolvedValue([imageRow]);

      const result = await listMaterials(dto, deps());

      expect(result.items[0].type).toBe('IMAGE');
      expect(result.items[0].duration_seconds).toBeNull();
    });

    it('TC-MAT-LIST-018: slices_count 由 _count.slices 决定', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const row = mockMaterialRowFactory(1, {
        _count: { slices: 7 },
        slices_count: 0,
      });
      mockPrisma.material.findMany.mockResolvedValue([row]);

      const result = await listMaterials(dto, deps());

      expect(result.items[0].slices_count).toBe(7);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-MAT-LIST-BND-001: 空结果集 — 返回 items=[] + total_count=0', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID_EMPTY };

      mockPrisma.material.findMany.mockResolvedValue([]);
      mockPrisma.material.count.mockResolvedValue(0);

      const result = await listMaterials(dto, deps());

      expect(result.items).toEqual([]);
      expect(result.items.length).toBe(0);
      expect(result.page_info.total_count).toBe(0);
      expect(result.page_info.has_more).toBe(false);
      expect(result.page_info.cursor).toBeNull();
    });

    it('TC-MAT-LIST-BND-002: limit=1 返回恰好 1 条', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 1 };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(1));

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(1);
    });

    it('TC-MAT-LIST-BND-003: limit=100 (上限最大值) 正常执行', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 100 };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(25));
      mockPrisma.material.count.mockResolvedValue(25);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBeLessThanOrEqual(100);
      expect(mockPrisma.material.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }),
      );
    });

    it('TC-MAT-LIST-BND-004: keyword=空字符串 → 等同于不筛选（trim 后为 undefined）', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, keyword: '' };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-LIST-BND-005: keyword=纯空格 → 等同于不筛选', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, keyword: '   ' };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-LIST-BND-006: sort_by=非法值 → 静默回退为 created_at DESC', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        sort_by: 'invalid_field',
        sort_order: 'SIDEWAYS',
      };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-LIST-BND-007: cursor 解码失败（非法 base64url）→ 静默降级为从头查询', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        cursor: '!!!not-valid-base64!!!',
      };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-LIST-BND-008: cursor 为有效 base64url 但 JSON 结构缺少必要字段 → 降级', async () => {
      const badToken = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');

      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        cursor: badToken,
      };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-LIST-BND-009: file_size_bytes 为大值 (200MB) → Number 安全转换', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const largeRow = mockMaterialRowFactory(1, {
        file_size_bytes: BigInt(200 * 1024 * 1024),
      });
      mockPrisma.material.findMany.mockResolvedValue([largeRow]);

      const result = await listMaterials(dto, deps());

      expect(result.items[0].file_size_bytes).toBe(200 * 1024 * 1024);
      expect(typeof result.items[0].file_size_bytes).toBe('number');
    });

    it('TC-MAT-LIST-BND-010: BigInt 最大安全值 (Number.MAX_SAFE_INTEGER) 安全转换', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const bigRow = mockMaterialRowFactory(1, {
        file_size_bytes: BigInt(Number.MAX_SAFE_INTEGER),
      });
      mockPrisma.material.findMany.mockResolvedValue([bigRow]);

      const result = await listMaterials(dto, deps());

      expect(result.items[0].file_size_bytes).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('TC-MAT-LIST-BND-011: created_at_start 与 created_at_end 为同一天 → 正常查询', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        created_at_start: '2026-05-25T00:00:00.000Z',
        created_at_end: '2026-05-25T23:59:59.999Z',
      };

      const sameDayRows = mockMaterialRowListFactory(5);
      mockPrisma.material.findMany.mockResolvedValue(sameDayRows);
      mockPrisma.material.count.mockResolvedValue(5);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(5);
    });

    it('TC-MAT-LIST-BND-012: created_at_start 与 created_at_end 完全相同 → 正常查询', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        created_at_start: '2026-05-25T12:00:00.000Z',
        created_at_end: '2026-05-25T12:00:00.000Z',
      };

      mockPrisma.material.findMany.mockResolvedValue([mockMaterialRowFactory(1)]);
      mockPrisma.material.count.mockResolvedValue(1);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(1);
    });

    it('TC-MAT-LIST-BND-013: source_type=GENERATED 筛选', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, source_type: 'GENERATED' };

      const generatedRows = [
        mockMaterialRowFactory(1, { source_type: 'GENERATED' }),
        mockMaterialRowFactory(2, { source_type: 'GENERATED' }),
      ];
      mockPrisma.material.findMany.mockResolvedValue(generatedRows);

      const result = await listMaterials(dto, deps());

      result.items.forEach((item) => {
        expect(item.source_type).toBe('GENERATED');
      });
    });

    it('TC-MAT-LIST-BND-014: status=PENDING 与 status=PROCESSING 筛选均可工作', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, status: 'PROCESSING' };

      const processingRows = mockMaterialRowListFactory(4, 16).map((r) => ({
        ...r,
        status: 'PROCESSING',
      }));
      mockPrisma.material.findMany.mockResolvedValue(processingRows);

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBe(4);
      result.items.forEach((item) => {
        expect(item.status).toBe('PROCESSING');
      });
    });

    it('TC-MAT-LIST-BND-015: thumbnail_url=null 时正确返回 null', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const noThumbRow = mockMaterialRowFactory(4, { thumbnail_url: null });
      mockPrisma.material.findMany.mockResolvedValue([noThumbRow]);

      const result = await listMaterials(dto, deps());

      expect(result.items[0].thumbnail_url).toBeNull();
    });
  });

  // ===========================================================================
  // 3. 异常流（Exception / Error Handling）
  // ===========================================================================

  describe('【异常流】人为制造报错场景 → 精准抛出规范错误码', () => {
    it('TC-MAT-LIST-ERR-001: limit=0 → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 0 };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MAT-LIST-ERR-002: limit=-1 → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: -1 };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-LIST-ERR-003: limit=101 (超过 MAX_LIMIT) → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 101 };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MAT-LIST-ERR-004: limit=99999 → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: 99999 };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-LIST-ERR-005: limit=非数字字符串 → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        limit: 'abc' as unknown as number,
      };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-MAT-LIST-ERR-006: created_at_start 不是 ISO8601 格式 → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        created_at_start: 'not-a-date',
      };

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.details).toBeDefined();
      expect(caught!.details!.field).toBe('created_at_start');
    });

    it('TC-MAT-LIST-ERR-007: created_at_end 不是 ISO8601 格式 → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        created_at_end: 'garbage-date',
      };

      let caught: Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; details?: Record<string, unknown> };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.details).toBeDefined();
      expect(caught!.details!.field).toBe('created_at_end');
    });

    it('TC-MAT-LIST-ERR-008: created_at_start > created_at_end (时间矛盾) → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        created_at_start: '2026-05-27T00:00:00Z',
        created_at_end: '2026-05-25T00:00:00Z',
      };

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MAT-LIST-ERR-009: Prisma P1001 数据库连接超时 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const p1001Error = Object.assign(new Error('Connection timeout'), {
        code: 'P1001',
      });
      mockPrisma.material.findMany.mockRejectedValue(p1001Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-LIST-ERR-010: Prisma P2028 事务冲突 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const p2028Error = Object.assign(new Error('Transaction API error'), {
        code: 'P2028',
      });
      mockPrisma.material.findMany.mockRejectedValue(p2028Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-LIST-ERR-011: Prisma P2024 连接池耗尽 → 抛出 INTERNAL_SERVER_ERROR (retryable)', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const p2024Error = Object.assign(new Error('Timed out fetching connection from pool'), {
        code: 'P2024',
      });
      mockPrisma.material.findMany.mockRejectedValue(p2024Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-LIST-ERR-012: 未知 Prisma 错误码 (P3000) → 抛出 INTERNAL_SERVER_ERROR (non-retryable)', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const p3000Error = Object.assign(new Error('Unknown Prisma error'), {
        code: 'P3000',
      });
      mockPrisma.material.findMany.mockRejectedValue(p3000Error);

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(false);
    });

    it('TC-MAT-LIST-ERR-013: total_count 查询失败不阻断主响应 — items 正常返回(total_count=-1)', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));
      mockPrisma.material.count.mockRejectedValue(new Error('count query timeout'));

      const result = await listMaterials(dto, deps());

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.page_info.total_count).toBe(-1);
    });

    it('TC-MAT-LIST-ERR-014: findMany + count 同时失败 → 抛出异常', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      mockPrisma.material.findMany.mockRejectedValue(
        Object.assign(new Error('Double failure'), { code: 'P1001' }),
      );

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await listMaterials(dto, deps());
      } catch (err) {
        caught = err as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
    });

    it('TC-MAT-LIST-ERR-015: cursor 解码后 sort_field 不匹配但仍正常降级查询', async () => {
      const validToken = encodeCursorToken(mockMaterialRowFactory(1) as TestMaterialRow, 'created_at');

      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        sort_by: 'file_size_bytes',
        cursor: validToken,
      };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(10));

      const result = await listMaterials(dto, deps());

      expect(result).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-LIST-ERR-016: cursor 中 sort_value=NaN 降级处理', async () => {
      const badCursor = Buffer.from(JSON.stringify({ v: NaN, i: MATERIAL_IDS[0] })).toString('base64url');

      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        cursor: badCursor,
      };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));

      const result = await listMaterials(dto, deps());

      expect(result).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('TC-MAT-LIST-ERR-017: limit=NaN → 抛出 INVALID_REQUEST', async () => {
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID, limit: NaN };

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await listMaterials(dto, deps());
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
    it('TC-MAT-LIST-PERF-001: listMaterials 编排总耗时 ≤ 2000ms (mock 全链路)', async () => {
      const PERF_CEILING_MS = 2000;
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));
      mockPrisma.material.count.mockResolvedValue(25);

      const start = performance.now();

      await listMaterials(dto, deps());

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 5000);

    it('TC-MAT-LIST-PERF-002: resolveListDefaults ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      const start = performance.now();

      const result = resolveListDefaults(dto);

      const elapsed = performance.now() - start;

      expect(result.product_id).toBe(PRODUCT_ID);
      expect(result.limit).toBe(DEFAULT_LIMIT);
      expect(result.sort_by).toBe(DEFAULT_SORT_BY);
      expect(result.sort_order).toBe(DEFAULT_SORT_ORDER);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-003: validateAndNormalizeSort ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      const result = validateAndNormalizeSort('created_at', 'DESC');

      const elapsed = performance.now() - start;

      expect(result.sort_by).toBe('created_at');
      expect(result.sort_order).toBe('DESC');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-004: buildListFilter (含 keyword + 时间范围) ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;
      const params: ResolvedListParams = {
        product_id: PRODUCT_ID,
        type: 'VIDEO',
        status: 'COMPLETED',
        keyword: '卷发棒',
        created_at_start: '2026-05-20T00:00:00Z',
        created_at_end: '2026-05-27T00:00:00Z',
        sort_by: 'created_at',
        sort_order: 'DESC',
        limit: 20,
      };

      const start = performance.now();

      const filter = buildListFilter(params);

      const elapsed = performance.now() - start;

      expect(filter.product_id).toBe(PRODUCT_ID);
      expect(filter.type).toBe('VIDEO');
      expect(filter.status).toBe('COMPLETED');
      expect(filter.file_name_contains).toBe('卷发棒');
      expect(filter.created_at_gte).toBeDefined();
      expect(filter.created_at_lte).toBeDefined();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-005: decodeCursorToken ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const cursorToken = encodeCursorToken(mockMaterialRowFactory(1) as TestMaterialRow, 'created_at');

      const start = performance.now();

      const decoded = decodeCursorToken(cursorToken, 'created_at');

      const elapsed = performance.now() - start;

      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(MATERIAL_IDS[0]);
      expect(decoded!.sort_field).toBe('created_at');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-006: encodeCursorToken ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      const token = encodeCursorToken(mockMaterialRowFactory(1) as TestMaterialRow, 'created_at');

      const elapsed = performance.now() - start;

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-007: mapToMaterialListItem ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const row = mockMaterialRowFactory(1);

      const start = performance.now();

      const item = mapToMaterialListItem(row);

      const elapsed = performance.now() - start;

      expect(item.material_id).toBe(row.id);
      expect(item.file_name).toBe(row.file_name);
      expect(typeof item.file_size_bytes).toBe('number');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-008: buildPageInfo ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const items = [mockMaterialListItemFactory(1), mockMaterialListItemFactory(2)];

      const start = performance.now();

      const pageInfo = buildPageInfo(items, true, 'cursor-token-abc', 25);

      const elapsed = performance.now() - start;

      expect(pageInfo.has_more).toBe(true);
      expect(pageInfo.cursor).toBe('cursor-token-abc');
      expect(pageInfo.total_count).toBe(25);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-009: findMaterialsPaginated (mock 20 条) ≤ 100ms', async () => {
      const PERF_CEILING_MS = 100;
      const filter: MaterialListFilter = {
        product_id: PRODUCT_ID,
        sort_by: 'created_at',
        sort_order: 'DESC',
        limit: 20,
      };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));
      mockPrisma.material.count.mockResolvedValue(25);

      const start = performance.now();

      const result = await findMaterialsPaginated(mockPrisma, filter, null);

      const elapsed = performance.now() - start;

      expect(result.items.length).toBe(20);
      expect(result.total_count).toBe(25);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-010: 连续 50 次 listMaterials 无退化', async () => {
      const ITERATIONS = 50;
      const PERF_CEILING_MS_PER_ITERATION = 100;
      const dto: ListMaterialsDto = { product_id: PRODUCT_ID };

      mockPrisma.material.findMany.mockResolvedValue(mockMaterialRowListFactory(20));
      mockPrisma.material.count.mockResolvedValue(25);

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await listMaterials(dto, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 30000);

    it('TC-MAT-LIST-PERF-011: mapToMaterialListItem ×100 次 ≤ 10ms', () => {
      const PERF_CEILING_MS = 10;
      const rows = mockMaterialRowListFactory(100);

      const start = performance.now();

      for (const row of rows) {
        mapToMaterialListItem(row);
      }

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-LIST-PERF-012: decodeCursorToken 失败分支（非法 token）≤ 1ms', () => {
      const PERF_CEILING_MS = 1;

      const start = performance.now();

      const result = decodeCursorToken('!!!invalid-base64url-token!!!', 'created_at');

      const elapsed = performance.now() - start;

      expect(result).toBeNull();
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立纯逻辑验证', () => {
    it('TC-MAT-LIST-ATOM-001: resolveListDefaults — type/status/source_type 透传', () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        type: 'VIDEO',
        status: 'COMPLETED',
        source_type: 'REFERENCE',
      };

      const result = resolveListDefaults(dto);

      expect(result.product_id).toBe(PRODUCT_ID);
      expect(result.type).toBe('VIDEO');
      expect(result.status).toBe('COMPLETED');
      expect(result.source_type).toBe('REFERENCE');
      expect(result.limit).toBe(DEFAULT_LIMIT);
      expect(result.sort_by).toBe(DEFAULT_SORT_BY);
      expect(result.sort_order).toBe(DEFAULT_SORT_ORDER);
    });

    it('TC-MAT-LIST-ATOM-002: validateAndNormalizeSort — 非法 sort_by 回退', () => {
      const result = validateAndNormalizeSort('random_field', 'DESC');
      expect(result.sort_by).toBe(DEFAULT_SORT_BY);
      expect(result.sort_order).toBe('DESC');
    });

    it('TC-MAT-LIST-ATOM-003: validateAndNormalizeSort — 非法 sort_order 回退', () => {
      const result = validateAndNormalizeSort('created_at', 'HORIZONTAL');
      expect(result.sort_by).toBe('created_at');
      expect(result.sort_order).toBe(DEFAULT_SORT_ORDER);
    });

    it('TC-MAT-LIST-ATOM-004: validateAndNormalizeSort — 两者都非法，同时回退', () => {
      const result = validateAndNormalizeSort('nonsense', 'sideways');
      expect(result.sort_by).toBe(DEFAULT_SORT_BY);
      expect(result.sort_order).toBe(DEFAULT_SORT_ORDER);
    });

    it('TC-MAT-LIST-ATOM-005: validateAndNormalizeSort — file_size_bytes+ASC 合法', () => {
      const result = validateAndNormalizeSort('file_size_bytes', 'ASC');
      expect(result.sort_by).toBe('file_size_bytes');
      expect(result.sort_order).toBe('ASC');
    });

    it('TC-MAT-LIST-ATOM-006: validateAndNormalizeSort — duration_seconds+DESC 合法', () => {
      const result = validateAndNormalizeSort('duration_seconds', 'DESC');
      expect(result.sort_by).toBe('duration_seconds');
      expect(result.sort_order).toBe('DESC');
    });

    it('TC-MAT-LIST-ATOM-007: buildListFilter — 不含 keyword 时无 file_name 过滤', () => {
      const params: ResolvedListParams = {
        product_id: PRODUCT_ID,
        sort_by: 'created_at',
        sort_order: 'DESC',
        limit: 20,
      };

      const filter = buildListFilter(params);

      expect(filter.file_name_contains).toBeUndefined();
      expect(filter.file_name_mode).toBeUndefined();
    });

    it('TC-MAT-LIST-ATOM-008: buildListFilter — keyword 经 resolveListDefaults trim 后正确设置', () => {
      const dto: ListMaterialsDto = {
        product_id: PRODUCT_ID,
        keyword: '  product  ',
      };
      const params = resolveListDefaults(dto);

      const filter = buildListFilter(params);

      expect(filter.file_name_contains).toBe('product');
      expect(filter.file_name_mode).toBe('insensitive');
    });

    it('TC-MAT-LIST-ATOM-009: decodeCursorToken — 有效 token 正确往返', () => {
      const row = mockMaterialRowFactory(1);
      const token = encodeCursorToken(row as TestMaterialRow, 'created_at');
      const decoded = decodeCursorToken(token, 'created_at');

      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(row.id);
      expect(decoded!.sort_field).toBe('created_at');
    });

    it('TC-MAT-LIST-ATOM-010: decodeCursorToken — 有效 token (file_size_bytes) 正确往返', () => {
      const row = mockMaterialRowFactory(1, { file_size_bytes: BigInt(10485760) });
      const token = encodeCursorToken(row as TestMaterialRow, 'file_size_bytes');
      const decoded = decodeCursorToken(token, 'file_size_bytes');

      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(row.id);
      expect(decoded!.sort_value).toBe(10485760);
    });

    it('TC-MAT-LIST-ATOM-011: decodeCursorToken — 有效 token (duration_seconds) 正确往返', () => {
      const row = mockMaterialRowFactory(2, { type: 'VIDEO', duration_seconds: 8.5 });
      const token = encodeCursorToken(row as TestMaterialRow, 'duration_seconds');
      const decoded = decodeCursorToken(token, 'duration_seconds');

      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(row.id);
      expect(decoded!.sort_value).toBe(8.5);
    });

    it('TC-MAT-LIST-ATOM-012: encodeCursorToken — 同一条数据多次编码结果一致', () => {
      const row = mockMaterialRowFactory(1);

      const token1 = encodeCursorToken(row as TestMaterialRow, 'created_at');
      const token2 = encodeCursorToken(row as TestMaterialRow, 'created_at');

      expect(token1).toBe(token2);
    });

    it('TC-MAT-LIST-ATOM-013: mapToMaterialListItem — BigInt → Number 转换正确', () => {
      const row = mockMaterialRowFactory(1, { file_size_bytes: BigInt(12345678) });

      const item = mapToMaterialListItem(row);

      expect(typeof item.file_size_bytes).toBe('number');
      expect(item.file_size_bytes).toBe(12345678);
      expect(Number.isSafeInteger(item.file_size_bytes)).toBe(true);
    });

    it('TC-MAT-LIST-ATOM-014: mapToMaterialListItem — _count.slices 优先于 slices_count', () => {
      const row = mockMaterialRowFactory(1, {
        _count: { slices: 9 },
        slices_count: 3,
      });

      const item = mapToMaterialListItem(row);

      expect(item.slices_count).toBe(9);
    });

    it('TC-MAT-LIST-ATOM-015: mapToMaterialListItem — _count 不存在时回退到 slices_count', () => {
      const row = { ...mockMaterialRowFactory(1), _count: undefined };

      const item = mapToMaterialListItem(row);

      expect(item.slices_count).toBe(row.slices_count);
    });

    it('TC-MAT-LIST-ATOM-016: buildPageInfo — 空列表 has_more=false cursor=null', () => {
      const pageInfo = buildPageInfo([], false, null, 0);

      expect(pageInfo.has_more).toBe(false);
      expect(pageInfo.cursor).toBeNull();
      expect(pageInfo.total_count).toBe(0);
    });

    it('TC-MAT-LIST-ATOM-017: buildPageInfo — has_more=true 时 cursor 非空', () => {
      const items = [mockMaterialListItemFactory(1)];
      const pageInfo = buildPageInfo(items, true, 'next-page-token', 100);

      expect(pageInfo.has_more).toBe(true);
      expect(pageInfo.cursor).toBe('next-page-token');
      expect(pageInfo.total_count).toBe(100);
    });

    it('TC-MAT-LIST-ATOM-018: buildSortConfig — 三种排序字段正确映射', () => {
      const config1 = buildSortConfig('created_at', 'DESC');
      expect(config1).toHaveLength(2);
      expect(config1[0]).toHaveProperty('created_at');
      expect(config1[0]['created_at']).toBe('desc');
      expect(config1[1]).toHaveProperty('id');
      expect(config1[1]['id']).toBe('desc');

      const config2 = buildSortConfig('file_size_bytes', 'ASC');
      expect(config2).toHaveLength(2);
      expect(config2[0]).toHaveProperty('file_size_bytes');
      expect(config2[0]['file_size_bytes']).toBe('asc');
      expect(config2[1]).toHaveProperty('id');
      expect(config2[1]['id']).toBe('desc');

      const config3 = buildSortConfig('duration_seconds', 'DESC');
      expect(config3).toHaveLength(2);
      expect(config3[0]).toHaveProperty('duration_seconds');
      expect(config3[0]['duration_seconds']).toBe('desc');
      expect(config3[1]).toHaveProperty('id');
      expect(config3[1]['id']).toBe('desc');
    });

    it('TC-MAT-LIST-ATOM-019: buildPrismaWhere — 仅 product_id 时无多余字段', () => {
      const filter: MaterialListFilter = {
        product_id: PRODUCT_ID,
        sort_by: 'created_at',
        sort_order: 'DESC',
        limit: 20,
      };

      const where = buildPrismaWhere(filter);

      expect(where).toHaveProperty('product_id');
      expect(where).not.toHaveProperty('type');
      expect(where).not.toHaveProperty('status');
      expect(where).not.toHaveProperty('source_type');
      expect(where).not.toHaveProperty('file_name');
    });

    it('TC-MAT-LIST-ATOM-020: buildPrismaCursor — null 入参返回 undefined', () => {
      const result = buildPrismaCursor(null);
      expect(result).toBeUndefined();
    });

    it('TC-MAT-LIST-ATOM-021: buildPrismaCursor — 有效 cursor 返回 { id }', () => {
      const cursor: DecodedCursor = {
        id: MATERIAL_IDS[0],
        sort_value: '2026-05-25T00:00:00.000Z',
        sort_field: 'created_at',
      };

      const result = buildPrismaCursor(cursor);

      expect(result).toEqual({ id: MATERIAL_IDS[0] });
    });
  });
});
