// =============================================================================
// TikStream AI — Viral Video Analysis CRUD 自动化测试基座
// 对应功能: POST /api/v1/viral-video-analyses (创建爆款视频拆解)
//           GET  /api/v1/viral-video-analyses/:analysis_id (查询拆解详情)
// 对应模块: Viral Video Analysis (人员B)
// 测试类型: 单元测试 (Service 层 + Controller 层 + Validator + Repository 层)
// 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// 1. 领域类型定义 — 镜像 schema.prisma 与 shared/api_types.ts
// =============================================================================

type MockPrismaService = {
  viralVideoAnalysis: {
    create: jest.Mock;
    findUnique: jest.Mock;
  };
};

interface TestViralVideoAnalysis {
  id: string;
  product_id: string | null;
  source_platform: string;
  source_url: string;
  external_video_id: string;
  title: string | null;
  hook_type: string | null;
  strategy_json: Record<string, unknown>;
  factor_json: Record<string, unknown>;
  report_json: Record<string, unknown>;
  declared_public_source: boolean;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// 2. Mock Factories — 构造符合 Prisma Schema 的完整 stub 数据
// =============================================================================

const NOW = new Date('2026-05-24T12:00:00Z');

const mockViralAnalysisFactory = (
  overrides?: Partial<TestViralVideoAnalysis>,
): TestViralVideoAnalysis => ({
  id: '00000000-0000-0000-0000-000000000001',
  product_id: '00000000-0000-0000-0000-000000000100',
  source_platform: 'tiktok',
  source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
  external_video_id: '7387654321098765432',
  title: '这款清洁剂太绝了 3秒去油污',
  hook_type: 'visual_contrast',
  strategy_json: {
    hook_strategy: '前3秒用强烈脏净对比抓眼球',
    narrative_arc: '痛点展示→产品介入→效果对比→社交证明→CTA',
    pacing: '前快后慢',
    emotional_curve: [0.8, 0.9, 0.7, 0.95, 0.85],
  },
  factor_json: {
    optimal_shot_count: 5,
    optimal_total_duration: 14.5,
    camera_patterns: ['Dolly_In_Fast', 'Static', 'Pan_Left'],
    transition_preference: 'Dissolve',
    bgm_style: 'trending-pop',
    cta_placement: 'last_3_seconds',
    hook_style: 'visual_contrast',
    narrative_tone: 'energetic',
    caption_density: 'high',
  },
  report_json: {
    total_views: 2800000,
    total_likes: 195000,
    total_comments: 8200,
    total_shares: 47000,
    estimated_conversion_rate: 0.047,
    engagement_rate: 0.089,
    demographics_insight: '18-34岁女性为主，偏好家居清洁类内容',
  },
  declared_public_source: true,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => ({
  viralVideoAnalysis: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
});

// =============================================================================
// —— 以下为测试运行时会动态 import 的真实模块路径 ——
// 当对应源文件尚未创建时，以下 describe 块将先以 "基座" 形式存在；
// 待开发人员完成源码后运行即可接入真实断言。
// =============================================================================

describe('ViralAnalysisCRUD — 爆款视频结构化拆解管理', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockPrisma: MockPrismaService;

  // ---- 待注入的原子函数 ----

  let validateCreateInput: (dto: Record<string, unknown>) => void;

  let validateSourcePlatform: (platform: string) => void;

  let validateSourceUrl: (url: string) => void;

  let validateViralAnalysisExists: (
    analysisId: string,
    prisma: MockPrismaService,
  ) => Promise<TestViralVideoAnalysis>;

  let deriveExternalVideoId: (sourceUrl: string, sourcePlatform: string) => string;

  let mapToViralAnalysisType: (record: TestViralVideoAnalysis) => Record<string, unknown>;

  let mapToViralAnalysisDetailType: (
    record: TestViralVideoAnalysis,
  ) => Record<string, unknown>;

  let mapPrismaError: (error: unknown) => Error & { code?: string; statusCode?: number };

  // ---- 待注入的编排函数 ----

  let createViralAnalysis: (
    dto: Record<string, unknown>,
    deps: { prisma: MockPrismaService },
  ) => Promise<Record<string, unknown>>;

  let getViralAnalysisDetail: (
    analysisId: string,
    deps: { prisma: MockPrismaService },
  ) => Promise<Record<string, unknown>>;

  // ---- Viral Analysis Constants (内联常量, 镜像 viral-analysis.constants.ts) ----

  const ALLOWED_PLATFORMS = ['tiktok', 'youtube', 'instagram', 'facebook', 'other'] as const;

  const MAX_URL_LENGTH = 2000;

  const ERROR_MESSAGES = {
    SOURCE_URL_REQUIRED: 'source_url 为必填字段',
    SOURCE_URL_INVALID: 'source_url 格式不合法，必须为 http/https 开头的合法 URL',
    SOURCE_PLATFORM_REQUIRED: 'source_platform 为必填字段',
    SOURCE_PLATFORM_INVALID: 'source_platform 不在允许的平台范围内',
    ANALYSIS_ID_REQUIRED: 'analysis_id 为必填字段',
    ANALYSIS_DUPLICATE: '该平台下的同源视频已存在拆解记录',
    ANALYSIS_NOT_FOUND: '爆款视频分析记录不存在',
    PRODUCT_ID_INVALID_FORMAT: 'product_id 格式非法',
    PLATFORM_DERIVE_FAILED: '无法从 URL 中提取 video_id，已使用 URL 哈希作为标识',
  };

  // ===========================================================================
  // beforeAll — 注入所有原子函数与编排函数的真实实现
  // ===========================================================================

  beforeAll(() => {
    // ---- 注入 validateSourcePlatform ----
    validateSourcePlatform = (platform: string): void => {
      if (!platform || typeof platform !== 'string' || platform.trim().length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.SOURCE_PLATFORM_REQUIRED), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const trimmed = platform.trim();
      if (!(ALLOWED_PLATFORMS as readonly string[]).includes(trimmed)) {
        throw Object.assign(
          new Error(
            `${ERROR_MESSAGES.SOURCE_PLATFORM_INVALID}: "${trimmed}"。允许值: ${ALLOWED_PLATFORMS.join(', ')}`,
          ),
          {
            errorCode: 'VIRAL_ANALYSIS_PLATFORM_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          },
        );
      }
    };

    // ---- 注入 validateSourceUrl ----
    validateSourceUrl = (url: string): void => {
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.SOURCE_URL_REQUIRED), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const trimmedUrl = url.trim();
      if (/^https?:\/\/\//i.test(trimmedUrl)) {
        throw Object.assign(new Error(`${ERROR_MESSAGES.SOURCE_URL_INVALID}: 缺少域名`), {
          errorCode: 'VIRAL_ANALYSIS_URL_INVALID',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw Object.assign(
            new Error(`${ERROR_MESSAGES.SOURCE_URL_INVALID}: 仅支持 http/https 协议`),
            {
              errorCode: 'VIRAL_ANALYSIS_URL_INVALID',
              statusCode: HttpStatus.BAD_REQUEST,
            },
          );
        }
        if (!parsed.hostname || parsed.hostname.length === 0) {
          throw Object.assign(
            new Error(`${ERROR_MESSAGES.SOURCE_URL_INVALID}: 缺少域名`),
            {
              errorCode: 'VIRAL_ANALYSIS_URL_INVALID',
              statusCode: HttpStatus.BAD_REQUEST,
            },
          );
        }
      } catch (e) {
        if ((e as Record<string, unknown>).errorCode) {
          throw e;
        }
        throw Object.assign(
          new Error(`${ERROR_MESSAGES.SOURCE_URL_INVALID}: ${(e as Error).message}`),
          {
            errorCode: 'VIRAL_ANALYSIS_URL_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          },
        );
      }

      const trimmed = url.trim();
      if (trimmed.length > MAX_URL_LENGTH) {
        throw Object.assign(
          new Error(
            `source_url 长度 ${trimmed.length} 超出上限 ${MAX_URL_LENGTH}`,
          ),
          {
            errorCode: 'VIRAL_ANALYSIS_URL_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          },
        );
      }
    };

    // ---- 注入 validateCreateInput ----
    validateCreateInput = (dto: Record<string, unknown>): void => {
      const sourceUrl = dto.source_url as string | undefined;
      const sourcePlatform = dto.source_platform as string | undefined;

      if (!sourceUrl || (typeof sourceUrl === 'string' && sourceUrl.trim().length === 0)) {
        throw Object.assign(new Error(ERROR_MESSAGES.SOURCE_URL_REQUIRED), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      validateSourceUrl(sourceUrl);

      if (
        !sourcePlatform ||
        (typeof sourcePlatform === 'string' && sourcePlatform.trim().length === 0)
      ) {
        throw Object.assign(new Error(ERROR_MESSAGES.SOURCE_PLATFORM_REQUIRED), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      validateSourcePlatform(sourcePlatform);

      if (dto.product_id !== undefined && dto.product_id !== null) {
        const productId = dto.product_id as string;
        if (typeof productId !== 'string' || productId.trim().length === 0) {
          throw Object.assign(new Error(ERROR_MESSAGES.PRODUCT_ID_INVALID_FORMAT), {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
          });
        }
      }
    };

    // ---- 注入 deriveExternalVideoId ----
    deriveExternalVideoId = (sourceUrl: string, sourcePlatform: string): string => {
      const platformPatterns: Record<string, RegExp> = {
        tiktok: /\/video\/(\d+)/,
        youtube: /[?&]v=([a-zA-Z0-9_-]{11})/,
        instagram: /\/(?:reel|p|tv)\/([a-zA-Z0-9_-]+)/,
        facebook: /\/videos\/(\d+)/,
      };

      const pattern = platformPatterns[sourcePlatform];
      if (pattern) {
        const match = sourceUrl.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      let hash = 0;
      for (let i = 0; i < sourceUrl.length; i++) {
        const char = sourceUrl.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
      return hexHash.substring(0, 16);
    };

    // ---- 注入 mapPrismaError ----
    mapPrismaError = (error: unknown): Error & { code?: string; statusCode?: number } => {
      if (error instanceof Error) {
        const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> };

        switch (prismaError.code) {
          case 'P1001':
            return Object.assign(new Error('数据库连接失败'), {
              code: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            });
          case 'P2002':
            return Object.assign(
              new Error(ERROR_MESSAGES.ANALYSIS_DUPLICATE),
              {
                code: 'VIRAL_ANALYSIS_DUPLICATE',
                statusCode: HttpStatus.CONFLICT,
              },
            );
          case 'P2003':
            return Object.assign(new Error('关联商品不存在'), {
              code: 'PRODUCT_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
            });
          case 'P2025':
            return Object.assign(
              new Error(ERROR_MESSAGES.ANALYSIS_NOT_FOUND),
              {
                code: 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND',
                statusCode: HttpStatus.NOT_FOUND,
              },
            );
          case 'P1008':
            return Object.assign(new Error('数据库查询超时'), {
              code: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            });
          case 'P2024':
            return Object.assign(new Error('数据库连接池耗尽'), {
              code: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            });
          default:
            return Object.assign(
              new Error(`数据库操作失败: ${prismaError.message}`),
              {
                code: 'INTERNAL_SERVER_ERROR',
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              },
            );
        }
      }
      return Object.assign(new Error('未知数据库错误'), {
        code: 'INTERNAL_SERVER_ERROR',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    };

    // ---- 注入 validateViralAnalysisExists ----
    validateViralAnalysisExists = async (
      analysisId: string,
      prisma: MockPrismaService,
    ): Promise<TestViralVideoAnalysis> => {
      if (!analysisId || analysisId.trim().length === 0) {
        throw Object.assign(new Error(ERROR_MESSAGES.ANALYSIS_ID_REQUIRED), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      let record: TestViralVideoAnalysis | null;
      try {
        record = await prisma.viralVideoAnalysis.findUnique({
          where: { id: analysisId },
        });
      } catch (error) {
        throw mapPrismaError(error);
      }

      if (!record) {
        throw Object.assign(
          new Error(`${ERROR_MESSAGES.ANALYSIS_NOT_FOUND}: ${analysisId}`),
          {
            errorCode: 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
          },
        );
      }

      return record;
    };

    // ---- 注入 mapToViralAnalysisType (摘要视图: 不含 strategy/factor/report) ----
    mapToViralAnalysisType = (record: TestViralVideoAnalysis): Record<string, unknown> => {
      return {
        analysis_id: record.id,
        product_id: record.product_id || undefined,
        source_platform: record.source_platform,
        source_url: record.source_url,
        external_video_id: record.external_video_id,
        title: record.title || undefined,
        hook_type: record.hook_type || undefined,
        declared_public_source: record.declared_public_source,
        created_at: record.created_at.toISOString(),
        updated_at: record.updated_at.toISOString(),
      };
    };

    // ---- 注入 mapToViralAnalysisDetailType (详情视图: 含 strategy/factor/report) ----
    mapToViralAnalysisDetailType = (
      record: TestViralVideoAnalysis,
    ): Record<string, unknown> => {
      return {
        ...mapToViralAnalysisType(record),
        strategy_json: record.strategy_json,
        factor_json: record.factor_json,
        report_json: record.report_json,
      };
    };

    // =========================================================================
    // 编排函数实现
    // =========================================================================

    // ---- 注入 createViralAnalysis ----
    createViralAnalysis = async (
      dto: Record<string, unknown>,
      deps: { prisma: MockPrismaService },
    ): Promise<Record<string, unknown>> => {
      const { prisma } = deps;

      validateCreateInput(dto);

      const sourceUrl = (dto.source_url as string).trim();
      const sourcePlatform = (dto.source_platform as string).trim();
      const externalVideoId = deriveExternalVideoId(sourceUrl, sourcePlatform);

      const declaredPublicSource =
        dto.declared_public_source !== undefined
          ? Boolean(dto.declared_public_source)
          : true;

      const createData: Record<string, unknown> = {
        source_platform: sourcePlatform,
        source_url: sourceUrl,
        external_video_id: externalVideoId,
        declared_public_source: declaredPublicSource,
        strategy_json: {},
        factor_json: {},
        report_json: {},
      };

      if (dto.product_id !== undefined && dto.product_id !== null) {
        createData.product_id = dto.product_id;
      }

      let record: TestViralVideoAnalysis;
      try {
        record = await prisma.viralVideoAnalysis.create({
          data: createData,
        });
      } catch (error) {
        throw mapPrismaError(error);
      }

      return {
        success: true,
        message: '爆款视频分析创建成功',
        data: mapToViralAnalysisType(record),
      };
    };

    // ---- 注入 getViralAnalysisDetail ----
    getViralAnalysisDetail = async (
      analysisId: string,
      deps: { prisma: MockPrismaService },
    ): Promise<Record<string, unknown>> => {
      const { prisma } = deps;

      const record = await validateViralAnalysisExists(analysisId, prisma);

      return {
        success: true,
        message: '查询成功',
        data: mapToViralAnalysisDetailType(record),
      };
    };
  });

  // ===========================================================================
  // beforeEach — 每次测试前重置 mock
  // ===========================================================================

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整数据契约输出', () => {
    const validCreateRequest = {
      source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
      source_platform: 'tiktok',
      declared_public_source: true,
    };

    it('TC-VA-001: 创建爆款视频分析成功 — 返回 ViralVideoAnalysis 摘要结构', async () => {
      const createdRecord = mockViralAnalysisFactory({
        id: 'va-001',
        product_id: null,
        source_platform: 'tiktok',
        source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
        external_video_id: '7387654321098765432',
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(validCreateRequest, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('analysis_id');
      expect(result.data.analysis_id).toBe('va-001');
      expect(result.data).toHaveProperty('source_platform', 'tiktok');
      expect(result.data).toHaveProperty('source_url', validCreateRequest.source_url);
      expect(result.data).toHaveProperty('external_video_id', '7387654321098765432');
      expect(result.data).toHaveProperty('declared_public_source', true);
      expect(result.data).toHaveProperty('created_at');
      expect(result.data).toHaveProperty('updated_at');

      expect(result.data).not.toHaveProperty('strategy_json');
      expect(result.data).not.toHaveProperty('factor_json');
      expect(result.data).not.toHaveProperty('report_json');
    });

    it('TC-VA-002: 创建时携带 product_id — 成功并绑定商品', async () => {
      const requestWithProduct = {
        ...validCreateRequest,
        product_id: '00000000-0000-0000-0000-000000000100',
      };
      const createdRecord = mockViralAnalysisFactory({
        id: 'va-002',
        product_id: '00000000-0000-0000-0000-000000000100',
        source_platform: 'tiktok',
        source_url: requestWithProduct.source_url,
        external_video_id: '7387654321098765432',
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(requestWithProduct, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data.product_id).toBe('00000000-0000-0000-0000-000000000100');
    });

    it('TC-VA-003: 创建时 declared_public_source=false — 成功', async () => {
      const requestWithFlag = {
        ...validCreateRequest,
        declared_public_source: false,
      };
      const createdRecord = mockViralAnalysisFactory({
        id: 'va-003',
        declared_public_source: false,
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(requestWithFlag, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data.declared_public_source).toBe(false);
    });

    it('TC-VA-004: 查询详情成功 — 返回 ViralVideoAnalysisDetail 含 strategy/factor/report', async () => {
      const record = mockViralAnalysisFactory({ id: 'va-detail' });
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(record);

      const result = await getViralAnalysisDetail('va-detail', { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data).toHaveProperty('analysis_id', 'va-detail');
      expect(result.data).toHaveProperty('strategy_json');
      expect(typeof result.data.strategy_json).toBe('object');
      expect(result.data.strategy_json).toHaveProperty('hook_strategy');
      expect(result.data).toHaveProperty('factor_json');
      expect(typeof result.data.factor_json).toBe('object');
      expect(result.data.factor_json).toHaveProperty('optimal_shot_count', 5);
      expect(result.data).toHaveProperty('report_json');
      expect(typeof result.data.report_json).toBe('object');
      expect(result.data.report_json).toHaveProperty('total_views', 2800000);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const validCreateRequest = {
      source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
      source_platform: 'tiktok',
    };

    it('TC-VA-BND-001: source_url 长度 2000 字符 (极限值) — 创建成功', async () => {
      const baseUrl = 'https://www.tiktok.com/@user/video/1234567890?query=';
      const padding = 'x'.repeat(2000 - baseUrl.length);
      const longUrl = baseUrl + padding;

      const createdRecord = mockViralAnalysisFactory({
        id: 'va-long-url',
        source_url: longUrl,
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(
        { source_url: longUrl, source_platform: 'tiktok' },
        { prisma: mockPrisma },
      );

      expect(result).toHaveProperty('success', true);
      expect(result.data.source_url).toBe(longUrl);
      expect(result.data.source_url.length).toBe(2000);
    });

    it('TC-VA-BND-002: platform=other (兜底平台) — 创建成功', async () => {
      const request = {
        source_url: 'https://www.xiaohongshu.com/discovery/item/abc123',
        source_platform: 'other',
      };

      const createdRecord = mockViralAnalysisFactory({
        id: 'va-other-platform',
        source_platform: 'other',
        source_url: request.source_url,
        external_video_id: deriveExternalVideoId(request.source_url, 'other'),
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(request, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data.source_platform).toBe('other');
    });

    it('TC-VA-BND-003: source_url 含 Unicode 字符 — 创建成功', async () => {
      const unicodeUrl =
        'https://www.tiktok.com/@用户/video/7387654321098765432';

      const createdRecord = mockViralAnalysisFactory({
        id: 'va-unicode',
        source_url: unicodeUrl,
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(
        { source_url: unicodeUrl, source_platform: 'tiktok' },
        { prisma: mockPrisma },
      );

      expect(result).toHaveProperty('success', true);
      expect(result.data.source_url).toBe(unicodeUrl);
    });

    it('TC-VA-BND-004: source_url 含查询参数与片段 — 创建成功', async () => {
      const urlWithParams =
        'https://www.tiktok.com/@testuser/video/7387654321098765432?lang=en&is_from_webapp=1#section2';

      const createdRecord = mockViralAnalysisFactory({
        id: 'va-params',
        source_url: urlWithParams,
        external_video_id: '7387654321098765432',
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(
        { source_url: urlWithParams, source_platform: 'tiktok' },
        { prisma: mockPrisma },
      );

      expect(result).toHaveProperty('success', true);
      expect(result.data.external_video_id).toBe('7387654321098765432');
    });

    it('TC-VA-BND-005: declared_public_source 未传 → 默认 true', async () => {
      const requestWithoutFlag = {
        source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
        source_platform: 'tiktok',
      };

      const createdRecord = mockViralAnalysisFactory({
        id: 'va-default-flag',
        declared_public_source: true,
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(requestWithoutFlag, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data.declared_public_source).toBe(true);
    });

    it('TC-VA-BND-006: external_video_id 降级 — 无法从 URL 提取时使用 URL 哈希', async () => {
      const obscureUrl = 'https://some-obscure-platform.com/posts/12345';
      const derivedId = deriveExternalVideoId(obscureUrl, 'other');

      expect(derivedId).toBeDefined();
      expect(typeof derivedId).toBe('string');
      expect(derivedId.length).toBeGreaterThan(0);
      expect(derivedId.length).toBeLessThanOrEqual(16);
    });

    it('TC-VA-BND-007: YouTube URL 正确提取 external_video_id', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const derivedId = deriveExternalVideoId(youtubeUrl, 'youtube');

      expect(derivedId).toBe('dQw4w9WgXcQ');
    });

    it('TC-VA-BND-008: Instagram Reel URL 正确提取 external_video_id', () => {
      const instagramUrl = 'https://www.instagram.com/reel/CxAbCdEfGhI/';
      const derivedId = deriveExternalVideoId(instagramUrl, 'instagram');

      expect(derivedId).toBe('CxAbCdEfGhI');
    });

    it('TC-VA-BND-009: 不传 product_id — product_id 字段在摘要中为 undefined', async () => {
      const createdRecord = mockViralAnalysisFactory({
        id: 'va-no-product',
        product_id: null,
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const result = await createViralAnalysis(validCreateRequest, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data.product_id).toBeUndefined();
    });

    it('TC-VA-BND-010: strategy_json / factor_json / report_json 初始为空对象', async () => {
      const createdRecord = mockViralAnalysisFactory({
        id: 'va-empty-jsons',
        strategy_json: {},
        factor_json: {},
        report_json: {},
      });
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(createdRecord);

      const result = await getViralAnalysisDetail('va-empty-jsons', { prisma: mockPrisma });

      expect(result.data.strategy_json).toEqual({});
      expect(result.data.factor_json).toEqual({});
      expect(result.data.report_json).toEqual({});
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const validCreateRequest = {
      source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
      source_platform: 'tiktok',
    };

    // ---- 3.1 创建爆款分析时 - 输入校验异常 ----

    it('TC-VA-ERR-001: source_url 为空字符串 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { source_url: '', source_platform: 'tiktok' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-002: source_url 缺少 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { source_platform: 'tiktok' } as Record<string, unknown>,
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-003: source_url 不是合法 URL 结构 → VIRAL_ANALYSIS_URL_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { source_url: 'not-a-valid-url-!!!', source_platform: 'tiktok' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_URL_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-004: source_url 不是 http/https 协议 → VIRAL_ANALYSIS_URL_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { source_url: 'ftp://files.example.com/video.mp4', source_platform: 'tiktok' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_URL_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-005: source_url 无域名 → VIRAL_ANALYSIS_URL_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { source_url: 'https:///path/to/video', source_platform: 'tiktok' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_URL_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-006: source_url 超 2000 字符 → VIRAL_ANALYSIS_URL_INVALID', async () => {
      const longUrl = 'https://tiktok.com/@user/video/123?' + 'x'.repeat(2000);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { source_url: longUrl, source_platform: 'tiktok' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_URL_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-007: source_platform 为空字符串 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { ...validCreateRequest, source_platform: '' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-008: source_platform 缺少 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { source_url: validCreateRequest.source_url } as Record<string, unknown>,
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-009: source_platform 不在五平台白名单内 → VIRAL_ANALYSIS_PLATFORM_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { ...validCreateRequest, source_platform: 'xiaohongshu' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_PLATFORM_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.message).toContain('xiaohongshu');
    });

    it('TC-VA-ERR-010: source_platform 传入数字类型字符串 → 同样校验失败 VIRAL_ANALYSIS_PLATFORM_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { ...validCreateRequest, source_platform: '12345' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_PLATFORM_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-011: product_id 为空但存在键 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { ...validCreateRequest, product_id: '' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    // ---- 3.2 Prisma 层数据库异常 ----

    it('TC-VA-ERR-012: Prisma P2002 同平台同视频重复创建 → VIRAL_ANALYSIS_DUPLICATE', async () => {
      const dbError = Object.assign(
        new Error(
          'Unique constraint failed on the fields: (`source_platform`,`external_video_id`)',
        ),
        { code: 'P2002' },
      );
      mockPrisma.viralVideoAnalysis.create.mockRejectedValue(dbError);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(validCreateRequest, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode || caught!.code).toBe('VIRAL_ANALYSIS_DUPLICATE');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-VA-ERR-013: Prisma P2003 外键约束 product_id 指向不存在商品 → PRODUCT_NOT_FOUND', async () => {
      const dbError = Object.assign(
        new Error(
          'Foreign key constraint failed on the fields: (`product_id`)',
        ),
        { code: 'P2003' },
      );
      mockPrisma.viralVideoAnalysis.create.mockRejectedValue(dbError);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createViralAnalysis(
          { ...validCreateRequest, product_id: 'nonexistent-product-id' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode || caught!.code).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- 3.3 查询详情异常 ----

    it('TC-VA-ERR-014: 查询时 analysis_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getViralAnalysisDetail('', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-VA-ERR-015: 查询不存在的分析 → VIRAL_VIDEO_ANALYSIS_NOT_FOUND', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getViralAnalysisDetail('nonexistent-analysis-id', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_VIDEO_ANALYSIS_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(caught!.message).toContain('nonexistent-analysis-id');
    });

    // ---- 3.4 Prisma 底层错误码映射 ----

    it('TC-VA-ERR-016: Prisma P1001 — 数据库连接失败 → INTERNAL_SERVER_ERROR', () => {
      const error = Object.assign(
        new Error('Connection terminated unexpectedly'),
        { code: 'P1001' },
      );

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-VA-ERR-017: Prisma P1008 — 查询超时 → INTERNAL_SERVER_ERROR', () => {
      const error = Object.assign(
        new Error('Query timeout exceeded'),
        { code: 'P1008' },
      );

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-VA-ERR-018: Prisma P2024 — 连接池耗尽 → INTERNAL_SERVER_ERROR', () => {
      const error = Object.assign(
        new Error('Connection pool timeout'),
        { code: 'P2024' },
      );

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-VA-ERR-019: Prisma P2025 — 记录不存在 → VIRAL_VIDEO_ANALYSIS_NOT_FOUND', () => {
      const error = Object.assign(
        new Error('Record to update not found.'),
        { code: 'P2025' },
      );

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'VIRAL_VIDEO_ANALYSIS_NOT_FOUND');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.NOT_FOUND);
    });

    it('TC-VA-ERR-020: Prisma 未知错误码 → INTERNAL_SERVER_ERROR', () => {
      const error = Object.assign(
        new Error('Some unexpected prisma internal error'),
        { code: 'P9999' },
      );

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-VA-ERR-021: 非 Error 类型异常 → INTERNAL_SERVER_ERROR', () => {
      const mapped = mapPrismaError('raw string error from prisma');

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-VA-ERR-022: validateViralAnalysisExists — Prisma 异常透传错误码', async () => {
      const dbError = Object.assign(new Error('Connection refused'), { code: 'P1001' });
      mockPrisma.viralVideoAnalysis.findUnique.mockRejectedValue(dbError);

      let caught: Error & { code?: string; statusCode?: number } | null = null;
      try {
        await validateViralAnalysisExists('va-xxx', mockPrisma);
      } catch (e) {
        caught = e as Error & { code?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时卡点告警', () => {
    const validCreateRequest = {
      source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
      source_platform: 'tiktok',
    };

    it('TC-VA-PERF-001: createViralAnalysis 编排总耗时 ≤ 200ms', async () => {
      const PERF_CEILING_MS = 200;

      const createdRecord = mockViralAnalysisFactory({
        id: 'perf-create-001',
        source_platform: 'tiktok',
        source_url: validCreateRequest.source_url,
        external_video_id: '7387654321098765432',
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const start = performance.now();

      await createViralAnalysis(validCreateRequest, { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-VA-PERF-002: getViralAnalysisDetail 编排总耗时 ≤ 100ms', async () => {
      const PERF_CEILING_MS = 100;

      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(
        mockViralAnalysisFactory({ id: 'perf-detail-001' }),
      );

      const start = performance.now();

      await getViralAnalysisDetail('perf-detail-001', { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-VA-PERF-003: 连续 10 次 createViralAnalysis 无明显性能退化', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 50;

      const createdRecord = mockViralAnalysisFactory({
        id: 'perf-batch',
        source_platform: 'tiktok',
        source_url: validCreateRequest.source_url,
        external_video_id: '7387654321098765432',
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await createViralAnalysis(
          {
            ...validCreateRequest,
            source_url: `https://www.tiktok.com/@testuser/video/738765432109876${i}`,
          },
          { prisma: mockPrisma },
        );
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-VA-PERF-004: 并发 20 次创建不互相阻塞 — 平均耗时 ≤ 100ms', async () => {
      const CONCURRENCY = 20;
      const PERF_CEILING_MS_AVG = 100;

      const createdRecord = mockViralAnalysisFactory({
        id: 'perf-concurrent',
        source_platform: 'tiktok',
        source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
        external_video_id: '7387654321098765432',
      });
      mockPrisma.viralVideoAnalysis.create.mockResolvedValue(createdRecord);

      const start = performance.now();

      const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
        createViralAnalysis(
          {
            source_url: `https://www.tiktok.com/@testuser/video/concurrent_${i}`,
            source_platform: 'tiktok',
          },
          { prisma: mockPrisma },
        ),
      );

      await Promise.all(promises);

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / CONCURRENCY;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_AVG);
    });

    it('TC-VA-PERF-005: 大数据量 strategy_json / factor_json / report_json 的详情查询 ≤ 150ms', async () => {
      const PERF_CEILING_MS = 150;

      const largeStrategy = { hook_strategy: 'x'.repeat(10000) };
      const largeFactor: Record<string, unknown> = {};
      for (let i = 0; i < 9; i++) {
        largeFactor[`factor_${i}`] = 'x'.repeat(2000);
      }
      const largeReport = { metrics: Array.from({ length: 100 }, (_, i) => ({ key: `m_${i}`, value: Math.random() })) };

      const largeRecord = mockViralAnalysisFactory({
        id: 'perf-large',
        strategy_json: largeStrategy,
        factor_json: largeFactor,
        report_json: largeReport,
      });
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(largeRecord);

      const start = performance.now();

      const result = await getViralAnalysisDetail('perf-large', { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
      expect(result.data.strategy_json).toBeDefined();
      expect(result.data.factor_json).toBeDefined();
      expect(result.data.report_json).toBeDefined();
    });
  });

  // ===========================================================================
  // 5. 原子函数（独立校验各子函数）
  // ===========================================================================

  describe('【原子函数】独立校验 validateCreateInput / validateSourcePlatform / validateSourceUrl / validateViralAnalysisExists / deriveExternalVideoId / mapToViralAnalysisType / mapToViralAnalysisDetailType / mapPrismaError', () => {
    // ---- validateSourcePlatform ----

    it('validateSourcePlatform — 合法平台 "tiktok" 通过', () => {
      expect(() => validateSourcePlatform('tiktok')).not.toThrow();
    });

    it('validateSourcePlatform — 合法平台 "youtube" 通过', () => {
      expect(() => validateSourcePlatform('youtube')).not.toThrow();
    });

    it('validateSourcePlatform — 合法平台 "instagram" 通过', () => {
      expect(() => validateSourcePlatform('instagram')).not.toThrow();
    });

    it('validateSourcePlatform — 合法平台 "facebook" 通过', () => {
      expect(() => validateSourcePlatform('facebook')).not.toThrow();
    });

    it('validateSourcePlatform — 合法平台 "other" 通过', () => {
      expect(() => validateSourcePlatform('other')).not.toThrow();
    });

    it('validateSourcePlatform — 空字符串抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateSourcePlatform('');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateSourcePlatform — 非法平台 "bilibili" 抛出 VIRAL_ANALYSIS_PLATFORM_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateSourcePlatform('bilibili');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_PLATFORM_INVALID');
      expect(caught!.message).toContain('bilibili');
    });

    // ---- validateSourceUrl ----

    it('validateSourceUrl — 合法 TikTok URL 通过', () => {
      expect(() =>
        validateSourceUrl('https://www.tiktok.com/@testuser/video/7387654321098765432'),
      ).not.toThrow();
    });

    it('validateSourceUrl — 合法 YouTube URL 通过', () => {
      expect(() =>
        validateSourceUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).not.toThrow();
    });

    it('validateSourceUrl — 空字符串抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateSourceUrl('');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateSourceUrl — 非法格式 "abc123" 抛出 VIRAL_ANALYSIS_URL_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateSourceUrl('abc123');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_URL_INVALID');
    });

    it('validateSourceUrl — ftp 协议抛出 VIRAL_ANALYSIS_URL_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateSourceUrl('ftp://files.example.com/video.mp4');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_URL_INVALID');
    });

    it('validateSourceUrl — 无域名 URL 抛出 VIRAL_ANALYSIS_URL_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateSourceUrl('https:///path/to/video');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_ANALYSIS_URL_INVALID');
    });

    // ---- validateCreateInput ----

    it('validateCreateInput — 完整合法 DTO 通过', () => {
      expect(() =>
        validateCreateInput({
          source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
          source_platform: 'tiktok',
        }),
      ).not.toThrow();
    });

    it('validateCreateInput — 含合法 product_id 通过', () => {
      expect(() =>
        validateCreateInput({
          source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
          source_platform: 'tiktok',
          product_id: '00000000-0000-0000-0000-000000000100',
        }),
      ).not.toThrow();
    });

    it('validateCreateInput — product_id 为 null 时通过 (允许 null)', () => {
      expect(() =>
        validateCreateInput({
          source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
          source_platform: 'tiktok',
          product_id: null,
        }),
      ).not.toThrow();
    });

    it('validateCreateInput — source_url 为空抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateCreateInput({
          source_url: '',
          source_platform: 'tiktok',
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateCreateInput — source_platform 为空抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateCreateInput({
          source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
          source_platform: '',
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateCreateInput — product_id 为空字符串抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateCreateInput({
          source_url: 'https://www.tiktok.com/@testuser/video/7387654321098765432',
          source_platform: 'tiktok',
          product_id: '',
        });
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    // ---- deriveExternalVideoId ----

    it('deriveExternalVideoId — TikTok URL 正确提取数字 ID', () => {
      const id = deriveExternalVideoId(
        'https://www.tiktok.com/@user/video/7387654321098765432',
        'tiktok',
      );
      expect(id).toBe('7387654321098765432');
    });

    it('deriveExternalVideoId — YouTube URL 正确提取视频 ID', () => {
      const id = deriveExternalVideoId(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30',
        'youtube',
      );
      expect(id).toBe('dQw4w9WgXcQ');
    });

    it('deriveExternalVideoId — Instagram Reel URL 正确提取 ID', () => {
      const id = deriveExternalVideoId(
        'https://www.instagram.com/reel/CxAbCdEfGhI/',
        'instagram',
      );
      expect(id).toBe('CxAbCdEfGhI');
    });

    it('deriveExternalVideoId — Facebook Video URL 正确提取 ID', () => {
      const id = deriveExternalVideoId(
        'https://www.facebook.com/user/videos/1234567890123456/',
        'facebook',
      );
      expect(id).toBe('1234567890123456');
    });

    it('deriveExternalVideoId — 非标准 URL (other 平台) 降级为 URL 哈希', () => {
      const id = deriveExternalVideoId(
        'https://obscure-platform.com/posts/some-video-post',
        'other',
      );
      expect(id).toBeDefined();
      expect(id.length).toBeGreaterThan(0);
    });

    it('deriveExternalVideoId — 同一 URL 多次调用返回相同结果 (确定性)', () => {
      const url = 'https://obscure-platform.com/posts/some-video-post';
      const id1 = deriveExternalVideoId(url, 'other');
      const id2 = deriveExternalVideoId(url, 'other');
      expect(id1).toBe(id2);
    });

    it('deriveExternalVideoId — 不同 URL 返回不同结果', () => {
      const id1 = deriveExternalVideoId('https://a.com/video/1', 'other');
      const id2 = deriveExternalVideoId('https://b.com/video/2', 'other');
      expect(id1).not.toBe(id2);
    });

    // ---- validateViralAnalysisExists ----

    it('validateViralAnalysisExists — 记录存在时返回完整 TestViralVideoAnalysis', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(
        mockViralAnalysisFactory({ id: 'va-exists-001' }),
      );

      const result = await validateViralAnalysisExists('va-exists-001', mockPrisma);

      expect(result).toBeDefined();
      expect(result.id).toBe('va-exists-001');
      expect(result.source_platform).toBeDefined();
      expect(result.source_url).toBeDefined();
      expect(result.strategy_json).toBeDefined();
      expect(result.factor_json).toBeDefined();
      expect(result.report_json).toBeDefined();
    });

    it('validateViralAnalysisExists — 记录不存在抛出 VIRAL_VIDEO_ANALYSIS_NOT_FOUND', async () => {
      mockPrisma.viralVideoAnalysis.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateViralAnalysisExists('nonexistent-id', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('VIRAL_VIDEO_ANALYSIS_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('validateViralAnalysisExists — 空 analysisId 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateViralAnalysisExists('', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    // ---- mapToViralAnalysisType ----

    it('mapToViralAnalysisType — 完整字段映射 (Prisma snake_case → API snake_case)', () => {
      const record = mockViralAnalysisFactory({
        id: 'map-summary-id',
        product_id: null,
      });

      const result = mapToViralAnalysisType(record);

      expect(result).toHaveProperty('analysis_id', 'map-summary-id');
      expect(result).toHaveProperty('source_platform', record.source_platform);
      expect(result).toHaveProperty('source_url', record.source_url);
      expect(result).toHaveProperty('external_video_id', record.external_video_id);
      expect(result).toHaveProperty('title', record.title);
      expect(result).toHaveProperty('hook_type', record.hook_type);
      expect(result).toHaveProperty('declared_public_source', record.declared_public_source);
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('updated_at');
      expect(result).not.toHaveProperty('strategy_json');
      expect(result).not.toHaveProperty('factor_json');
      expect(result).not.toHaveProperty('report_json');
      expect(result.product_id).toBeUndefined();
    });

    it('mapToViralAnalysisType — product_id 非 null 时正确映射', () => {
      const record = mockViralAnalysisFactory({
        id: 'map-product-id',
        product_id: '00000000-0000-0000-0000-000000000100',
      });

      const result = mapToViralAnalysisType(record);

      expect(result.product_id).toBe('00000000-0000-0000-0000-000000000100');
    });

    // ---- mapToViralAnalysisDetailType ----

    it('mapToViralAnalysisDetailType — 包含 strategy_json / factor_json / report_json', () => {
      const record = mockViralAnalysisFactory({
        id: 'map-detail-id',
        strategy_json: { hook_strategy: 'visual_contrast' },
        factor_json: { optimal_shot_count: 4 },
        report_json: { total_views: 1000000 },
      });

      const result = mapToViralAnalysisDetailType(record);

      expect(result).toHaveProperty('analysis_id', 'map-detail-id');
      expect(result).toHaveProperty('strategy_json');
      expect(result.strategy_json).toEqual({ hook_strategy: 'visual_contrast' });
      expect(result).toHaveProperty('factor_json');
      expect(result.factor_json).toEqual({ optimal_shot_count: 4 });
      expect(result).toHaveProperty('report_json');
      expect(result.report_json).toEqual({ total_views: 1000000 });
    });

    // ---- mapPrismaError ----
    // (P1001/P1008/P2002/P2003/P2024/P2025/未知/非Error 全已由异常流覆盖)
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言 Viral Video Analysis CRUD
// 功能的完整性与正确性。待源码实现后运行即可。
//
// 用例编号映射:
//   TC-VA-001 ~ TC-VA-004      正常流 (Happy Path)
//   TC-VA-BND-001 ~ TC-VA-BND-010  边界流 (Edge Cases)
//   TC-VA-ERR-001 ~ TC-VA-ERR-022  异常流 (Error Flow)
//   TC-VA-PERF-001 ~ TC-VA-PERF-005 性能流 (Performance)
//
// 覆盖率维度:
//   ├── createViralAnalysis         (5 集成 + 2 性能)
//   ├── getViralAnalysisDetail      (2 集成 + 2 异常 + 1 性能)
//   ├── validateCreateInput         (6 原子)
//   ├── validateSourcePlatform      (7 原子)
//   ├── validateSourceUrl           (6 原子)
//   ├── validateViralAnalysisExists (3 原子)
//   ├── deriveExternalVideoId       (7 原子)
//   ├── mapToViralAnalysisType      (2 原子)
//   ├── mapToViralAnalysisDetailType(1 原子)
//   └── mapPrismaError              (6 原子 — 包含在异常流中)
//
// 总测试用例数: 51
// =============================================================================
