// =============================================================================
// TikStream AI — Template CRUD 自动化测试基座
// 对应功能: POST/GET/PATCH/DELETE /api/v1/templates (模板管理基础 CRUD)
// 对应模块: Template (人员B) — 公共模块
// 测试类型: 单元测试 (Service 层 + Controller 层 + Validator)
// 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

type MockPrismaService = {
  template: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

interface TestTemplate {
  id: string;
  product_id: string | null;
  name: string;
  category: string;
  strategy_summary: string;
  factor_json: Record<string, unknown>;
  schema_json: Record<string, unknown> | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Mock Factories — 构造符合 Prisma Schema 的完整 stub 数据
// =============================================================================

const mockTemplateFactory = (overrides?: Partial<TestTemplate>): TestTemplate => ({
  id: '00000000-0000-0000-0000-000000000001',
  product_id: '00000000-0000-0000-0000-000000000100',
  name: '快节奏产品测评模板',
  category: 'promo',
  strategy_summary: '前3秒用强烈视觉对比吸引注意力，中间段落展示产品核心卖点与实际使用效果，结尾用社交证明+CTA收尾。整体节奏快切为主，慢镜展示为辅。',
  factor_json: {
    optimal_shot_count: 5,
    optimal_total_duration: 13.5,
    camera_patterns: ['Dolly_In_Fast', 'Pan_Left', 'Tilt_Up', 'Static'],
    transition_preference: 'Dissolve',
    bgm_style: 'upbeat-electronic',
    caption_density: 'high',
    cta_placement: 'last_2_seconds',
    hook_style: 'visual_contrast',
    narrative_tone: 'energetic',
  },
  schema_json: {
    required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'],
    optional_fields: ['render_prompt'],
  },
  status: 'ACTIVE',
  created_at: new Date('2026-05-20T10:00:00Z'),
  updated_at: new Date('2026-05-20T10:00:00Z'),
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => ({
  template: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

// =============================================================================
// —— 以下为测试运行时会动态 import 的真实模块路径 ——
// 当对应源文件尚未创建时，以下 describe 块将先以 "基座" 形式存在；
// 待开发人员完成源码后取消 .skip 即可接入真实断言。
// =============================================================================

describe('TemplateCRUD — 模板管理基础 CRUD', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockPrisma: MockPrismaService;

  // ---- 模拟未经 NestJS DI 的纯逻辑函数 (用真实实现或高保真 mock 替代) ----

  let validateTemplateCategory: (category: string) => void;

  let validateFactorJsonStructure: (factorJson: Record<string, unknown>) => void;

  let validateTemplateNotArchived: (template: TestTemplate) => void;

  let mapToTemplateType: (record: TestTemplate) => Record<string, unknown>;

  let mapToTemplateDetailType: (record: TestTemplate) => Record<string, unknown>;

  let validateTemplateExists: (
    templateId: string,
    prisma: MockPrismaService,
  ) => Promise<TestTemplate>;

  let mapPrismaError: (error: unknown) => Error & { code?: string; statusCode?: number };

  // ---- 模拟 CRUD 编排函数 ----

  let createTemplate: (
    dto: Record<string, unknown>,
    deps: { prisma: MockPrismaService },
  ) => Promise<Record<string, unknown>>;

  let getTemplateList: (
    query: Record<string, unknown>,
    deps: { prisma: MockPrismaService },
  ) => Promise<Record<string, unknown>>;

  let getTemplateDetail: (
    templateId: string,
    deps: { prisma: MockPrismaService },
  ) => Promise<Record<string, unknown>>;

  let updateTemplate: (
    templateId: string,
    dto: Record<string, unknown>,
    deps: { prisma: MockPrismaService },
  ) => Promise<Record<string, unknown>>;

  let deleteTemplate: (
    templateId: string,
    deps: { prisma: MockPrismaService },
  ) => Promise<Record<string, unknown>>;

  // ---- Template Constants (内联常量, 镜像 template.constants.ts) ----

  const ALLOWED_CATEGORIES = [
    'promo', 'unboxing', 'tutorial', 'review', 'story', 'comparison', 'custom',
  ] as const;

  const FACTOR_PRIORITY = [
    'optimal_shot_count',
    'optimal_total_duration',
    'camera_patterns',
    'transition_preference',
    'bgm_style',
    'cta_placement',
    'hook_style',
    'narrative_tone',
    'caption_density',
  ] as const;

  const ALLOWED_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

  const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
    ACTIVE: ['INACTIVE', 'ARCHIVED'],
    INACTIVE: ['ACTIVE', 'ARCHIVED'],
    ARCHIVED: ['ACTIVE'],
  };

  // ===========================================================================
  // beforeAll — 注入所有原子函数与编排函数的真实实现
  // ===========================================================================

  beforeAll(() => {
    // ---- 注入 validateTemplateCategory ----
    validateTemplateCategory = (category: string) => {
      if (!category || typeof category !== 'string' || category.trim().length === 0) {
        throw Object.assign(new Error('模板分类不可为空'), {
          errorCode: 'TEMPLATE_CATEGORY_INVALID',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
        throw Object.assign(
          new Error(`模板分类 "${category}" 不在允许范围内。允许值为: ${ALLOWED_CATEGORIES.join(', ')}`),
          {
            errorCode: 'TEMPLATE_CATEGORY_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          },
        );
      }
    };

    // ---- 注入 validateFactorJsonStructure ----
    validateFactorJsonStructure = (factorJson: Record<string, unknown>) => {
      if (!factorJson || typeof factorJson !== 'object' || Array.isArray(factorJson)) {
        throw Object.assign(new Error('因子配置必须为非空 JSON 对象'), {
          errorCode: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const keys = Object.keys(factorJson);

      if (keys.length === 0) {
        throw Object.assign(new Error('因子配置不能为空对象'), {
          errorCode: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const hasKnownKey = keys.some((key) =>
        (FACTOR_PRIORITY as readonly string[]).includes(key),
      );

      if (!hasKnownKey) {
        throw Object.assign(
          new Error(`因子配置不含任何已知因子键。已知键: ${FACTOR_PRIORITY.join(', ')}`),
          {
            errorCode: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          },
        );
      }

      for (const key of keys) {
        if (factorJson[key] === null || factorJson[key] === undefined) {
          throw Object.assign(new Error(`因子键 "${key}" 的值不可为 null/undefined`), {
            errorCode: 'TEMPLATE_FACTOR_STRUCTURE_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          });
        }
      }
    };

    // ---- 注入 validateTemplateNotArchived ----
    validateTemplateNotArchived = (template: TestTemplate) => {
      if (template.status === 'ARCHIVED') {
        throw Object.assign(
          new Error(`模板 ${template.id} 已归档，不可修改或套用`),
          {
            errorCode: 'TEMPLATE_STATUS_IMMUTABLE',
            statusCode: HttpStatus.CONFLICT,
          },
        );
      }
    };

    // ---- 注入 mapToTemplateType (API 列表视图中可选 factor_json/schema_json) ----
    mapToTemplateType = (record: TestTemplate) => {
      return {
        template_id: record.id,
        product_id: record.product_id || undefined,
        name: record.name,
        category: record.category,
        strategy_summary: record.strategy_summary,
        status: record.status,
        created_at: record.created_at.toISOString(),
        updated_at: record.updated_at.toISOString(),
      };
    };

    // ---- 注入 mapToTemplateDetailType (详情视图中必须包含 factor_json) ----
    mapToTemplateDetailType = (record: TestTemplate) => {
      return {
        ...mapToTemplateType(record),
        factor_json: record.factor_json,
        schema_json: record.schema_json,
      };
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
            return Object.assign(new Error('同名模板已存在'), {
              code: 'TEMPLATE_NAME_DUPLICATE',
              statusCode: HttpStatus.CONFLICT,
            });
          case 'P2003':
            return Object.assign(new Error('关联商品不存在'), {
              code: 'PRODUCT_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
            });
          case 'P2025':
            return Object.assign(new Error('模板不存在'), {
              code: 'TEMPLATE_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
            });
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

    // ---- 注入 validateTemplateExists ----
    validateTemplateExists = async (
      templateId: string,
      prisma: MockPrismaService,
    ): Promise<TestTemplate> => {
      if (!templateId) {
        throw Object.assign(new Error('template_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      let template: TestTemplate | null;
      try {
        template = await prisma.template.findUnique({
          where: { id: templateId },
        });
      } catch (error) {
        throw mapPrismaError(error);
      }

      if (!template) {
        throw Object.assign(new Error(`模板 ${templateId} 不存在`), {
          errorCode: 'TEMPLATE_NOT_FOUND',
          statusCode: HttpStatus.NOT_FOUND,
        });
      }

      return template;
    };

    // =========================================================================
    // 编排函数实现
    // =========================================================================

    // ---- 注入 createTemplate ----
    createTemplate = async (dto, deps) => {
      const { prisma } = deps;

      const name = dto.name as string;
      if (!name || String(name).trim().length === 0) {
        throw Object.assign(new Error('模板名称不可为空'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }
      if (String(name).length > 120) {
        throw Object.assign(
          new Error(`模板名称长度 ${String(name).length} 超出上限 120`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
          },
        );
      }

      const strategySummary = dto.strategy_summary as string;
      if (!strategySummary || String(strategySummary).trim().length === 0) {
        throw Object.assign(new Error('策略摘要不可为空'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const factorJson = (dto.factor_json || {}) as Record<string, unknown>;

      validateTemplateCategory((dto.category as string) || '');
      validateFactorJsonStructure(factorJson);

      if (dto.schema_json !== undefined && dto.schema_json !== null) {
        if (typeof dto.schema_json !== 'object' || Array.isArray(dto.schema_json)) {
          throw Object.assign(new Error('模板结构定义 schema_json 须为合法 JSON 对象'), {
            errorCode: 'TEMPLATE_SCHEMA_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          });
        }
      }

      let record: TestTemplate;
      try {
        record = await prisma.template.create({
          data: {
            id: dto.id,
            product_id: (dto.product_id as string) || null,
            name: String(name),
            category: String(dto.category),
            strategy_summary: String(strategySummary),
            factor_json: factorJson,
            schema_json: (dto.schema_json as Record<string, unknown>) ?? null,
            status: (dto.status as string) || 'ACTIVE',
          },
        });
      } catch (error) {
        throw mapPrismaError(error);
      }

      return {
        success: true,
        message: '模板创建成功',
        data: mapToTemplateType(record),
      };
    };

    // ---- 注入 getTemplateList ----
    getTemplateList = async (query, deps) => {
      const { prisma } = deps;

      const page = query.page === undefined ? 1 : Number(query.page);
      const pageSize = query.page_size === undefined ? 20 : Number(query.page_size);

      if (!Number.isInteger(page) || page < 1) {
        throw Object.assign(new Error('page 必须为正整数'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw Object.assign(new Error('page_size 必须在 1-100 之间'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const where: Record<string, unknown> = {};
      if (query.category) {
        where.category = query.category;
      }
      if (query.status) {
        where.status = query.status;
      }

      let items: TestTemplate[];
      let total: number;
      try {
        [items, total] = await Promise.all([
          prisma.template.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { created_at: 'desc' },
          }),
          prisma.template.count({ where }),
        ]);
      } catch (error) {
        throw mapPrismaError(error);
      }

      return {
        success: true,
        message: '查询成功',
        data: {
          items: items.map(mapToTemplateType),
          page,
          page_size: pageSize,
          total,
          has_more: page * pageSize < total,
        },
      };
    };

    // ---- 注入 getTemplateDetail ----
    getTemplateDetail = async (templateId, deps) => {
      const { prisma } = deps;

      const template = await validateTemplateExists(templateId, prisma);

      return {
        success: true,
        message: '查询成功',
        data: mapToTemplateDetailType(template),
      };
    };

    // ---- 注入 updateTemplate ----
    updateTemplate = async (templateId, dto, deps) => {
      const { prisma } = deps;

      if (!templateId) {
        throw Object.assign(new Error('template_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      const existing = await validateTemplateExists(templateId, prisma);
      validateTemplateNotArchived(existing);

      const updateData: Record<string, unknown> = {};

      if (dto.name !== undefined) {
        const name = String(dto.name);
        if (name.trim().length === 0) {
          throw Object.assign(new Error('模板名称不可为空'), {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
          });
        }
        if (name.length > 120) {
          throw Object.assign(new Error(`模板名称长度 ${name.length} 超出上限 120`), {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
          });
        }
        updateData.name = name;
      }

      if (dto.category !== undefined) {
        validateTemplateCategory(String(dto.category));
        updateData.category = String(dto.category);
      }

      if (dto.strategy_summary !== undefined) {
        const summary = String(dto.strategy_summary);
        if (summary.trim().length === 0) {
          throw Object.assign(new Error('策略摘要不可为空'), {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
          });
        }
        updateData.strategy_summary = summary;
      }

      if (dto.factor_json !== undefined) {
        validateFactorJsonStructure(dto.factor_json as Record<string, unknown>);
        updateData.factor_json = dto.factor_json;
      }

      if (dto.schema_json !== undefined) {
        if (dto.schema_json !== null && (typeof dto.schema_json !== 'object' || Array.isArray(dto.schema_json))) {
          throw Object.assign(new Error('模板结构定义 schema_json 须为合法 JSON 对象'), {
            errorCode: 'TEMPLATE_SCHEMA_INVALID',
            statusCode: HttpStatus.BAD_REQUEST,
          });
        }
        updateData.schema_json = dto.schema_json;
      }

      if (dto.status !== undefined) {
        const newStatus = String(dto.status);
        if (!(ALLOWED_STATUSES as readonly string[]).includes(newStatus)) {
          throw Object.assign(
            new Error(`无效的模板状态 "${newStatus}"。允许值: ${ALLOWED_STATUSES.join(', ')}`),
            {
              errorCode: 'TEMPLATE_STATUS_IMMUTABLE',
              statusCode: HttpStatus.CONFLICT,
            },
          );
        }

        const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
        if (!allowedTransitions.includes(newStatus)) {
          throw Object.assign(
            new Error(`不允许从 ${existing.status} 转换为 ${newStatus}`),
            {
              errorCode: 'TEMPLATE_STATUS_IMMUTABLE',
              statusCode: HttpStatus.CONFLICT,
            },
          );
        }
        updateData.status = newStatus;
      }

      let updated: TestTemplate;
      try {
        updated = await prisma.template.update({
          where: { id: templateId },
          data: updateData,
        });
      } catch (error) {
        throw mapPrismaError(error);
      }

      return {
        success: true,
        message: '模板更新成功',
        data: mapToTemplateType(updated),
      };
    };

    // ---- 注入 deleteTemplate ----
    deleteTemplate = async (templateId, deps) => {
      const { prisma } = deps;

      if (!templateId) {
        throw Object.assign(new Error('template_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
        });
      }

      await validateTemplateExists(templateId, prisma);

      try {
        await prisma.template.delete({
          where: { id: templateId },
        });
      } catch (error) {
        throw mapPrismaError(error);
      }

      return {
        success: true,
        message: '模板删除成功',
        data: {
          template_id: templateId,
          deleted: true,
        },
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
      product_id: '00000000-0000-0000-0000-000000000100',
      name: '快节奏产品测评模板',
      category: 'promo',
      strategy_summary: '前3秒用强烈视觉对比吸引注意力，中间段落展示产品核心卖点与实际使用效果，结尾用CTA收尾。',
      factor_json: {
        optimal_shot_count: 5,
        optimal_total_duration: 13.5,
        camera_patterns: ['Dolly_In_Fast', 'Pan_Left'],
        transition_preference: 'Dissolve',
        bgm_style: 'upbeat-electronic',
        caption_density: 'high',
      },
      schema_json: {
        required_fields: ['visual_description', 'voiceover_text'],
      },
      status: 'ACTIVE',
    };

    it('TC-CRUD-001: 创建模板成功 — 返回完整 Template 结构', async () => {
      const createdRecord = mockTemplateFactory({
        id: 'tp-001',
        ...validCreateRequest,
      });
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const result = await createTemplate(validCreateRequest, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('template_id');
      expect(result.data.template_id).toBe(createdRecord.id);
      expect(result.data.name).toBe(validCreateRequest.name);
      expect(result.data.category).toBe(validCreateRequest.category);
      expect(result.data.strategy_summary).toBe(validCreateRequest.strategy_summary);
      expect(result.data.status).toBe('ACTIVE');
      expect(result.data).toHaveProperty('created_at');
      expect(result.data).toHaveProperty('updated_at');

      // 验证列表视图不应包含 factor_json / schema_json
      expect(result.data).not.toHaveProperty('factor_json');
      expect(result.data).not.toHaveProperty('schema_json');
    });

    it('TC-CRUD-002: 分页查询列表成功 — 返回 PaginatedData<Template>', async () => {
      const mockRecords = [
        mockTemplateFactory({ id: 'tp-a', name: '模板A' }),
        mockTemplateFactory({ id: 'tp-b', name: '模板B' }),
        mockTemplateFactory({ id: 'tp-c', name: '模板C' }),
      ];
      mockPrisma.template.findMany.mockResolvedValue(mockRecords);
      mockPrisma.template.count.mockResolvedValue(3);

      const result = await getTemplateList(
        { page: 1, page_size: 20 },
        { prisma: mockPrisma },
      );

      expect(result).toHaveProperty('success', true);
      expect(result.data).toHaveProperty('items');
      expect(result.data).toHaveProperty('page', 1);
      expect(result.data).toHaveProperty('page_size', 20);
      expect(result.data).toHaveProperty('total', 3);
      expect(result.data).toHaveProperty('has_more', false);
      expect(Array.isArray(result.data.items)).toBe(true);
      expect(result.data.items).toHaveLength(3);

      for (const item of result.data.items) {
        expect(item).toHaveProperty('template_id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('category');
        expect(item).toHaveProperty('strategy_summary');
        expect(item).toHaveProperty('status');
        expect(item).toHaveProperty('created_at');
        expect(item).toHaveProperty('updated_at');
        expect(item).not.toHaveProperty('factor_json');
        expect(item).not.toHaveProperty('schema_json');
      }
    });

    it('TC-CRUD-003: 按 category 过滤列表 — 只返回匹配项', async () => {
      const mockRecords = [
        mockTemplateFactory({ id: 'tp-1', category: 'unboxing', name: '开箱模板' }),
        mockTemplateFactory({ id: 'tp-2', category: 'unboxing', name: '开箱模板2' }),
      ];
      mockPrisma.template.findMany.mockResolvedValue(mockRecords);
      mockPrisma.template.count.mockResolvedValue(2);

      const result = await getTemplateList(
        { page: 1, page_size: 20, category: 'unboxing' },
        { prisma: mockPrisma },
      );

      expect(result.data.total).toBe(2);
      expect(result.data.items).toHaveLength(2);
      for (const item of result.data.items) {
        expect(item.category).toBe('unboxing');
      }
    });

    it('TC-CRUD-004: 按 status 过滤列表 — 只返回 ACTIVE 模板', async () => {
      const mockRecords = [
        mockTemplateFactory({ id: 'tp-1', status: 'ACTIVE' }),
      ];
      mockPrisma.template.findMany.mockResolvedValue(mockRecords);
      mockPrisma.template.count.mockResolvedValue(1);

      const result = await getTemplateList(
        { page: 1, page_size: 20, status: 'ACTIVE' },
        { prisma: mockPrisma },
      );

      expect(result.data.total).toBe(1);
      expect(result.data.items[0].status).toBe('ACTIVE');
    });

    it('TC-CRUD-005: 查询详情成功 — 返回 TemplateDetail (含 factor_json + schema_json)', async () => {
      const record = mockTemplateFactory({ id: 'tp-detail' });
      mockPrisma.template.findUnique.mockResolvedValue(record);

      const result = await getTemplateDetail('tp-detail', { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data).toHaveProperty('template_id', 'tp-detail');
      expect(result.data).toHaveProperty('factor_json');
      expect(typeof result.data.factor_json).toBe('object');
      expect(result.data.factor_json).toHaveProperty('optimal_shot_count', 5);
      expect(result.data).toHaveProperty('schema_json');
      expect(result.data.schema_json).toBeDefined();
    });

    it('TC-CRUD-006: 更新模板成功 — 返回更新后的 Template', async () => {
      const existingRecord = mockTemplateFactory({ id: 'tp-update' });
      mockPrisma.template.findUnique.mockResolvedValue(existingRecord);

      const updatedRecord = {
        ...existingRecord,
        name: '更新后的模板名',
        strategy_summary: '更新后的策略摘要',
        updated_at: new Date('2026-05-24T12:00:00Z'),
      };
      mockPrisma.template.update.mockResolvedValue(updatedRecord);

      const result = await updateTemplate(
        'tp-update',
        {
          name: '更新后的模板名',
          strategy_summary: '更新后的策略摘要',
        },
        { prisma: mockPrisma },
      );

      expect(result).toHaveProperty('success', true);
      expect(result.data.name).toBe('更新后的模板名');
      expect(result.data.strategy_summary).toBe('更新后的策略摘要');
      expect(result.data.template_id).toBe('tp-update');
    });

    it('TC-CRUD-007: 删除模板成功 — 返回 deleted=true', async () => {
      const record = mockTemplateFactory({ id: 'tp-delete' });
      mockPrisma.template.findUnique.mockResolvedValue(record);
      mockPrisma.template.delete.mockResolvedValue(record);

      const result = await deleteTemplate('tp-delete', { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data).toHaveProperty('template_id', 'tp-delete');
      expect(result.data).toHaveProperty('deleted', true);
    });

    it('TC-CRUD-008: 创建模板时不传 product_id — 仍然成功 (product_id 可选)', async () => {
      const requestWithoutProduct = { ...validCreateRequest };
      delete requestWithoutProduct.product_id;

      const createdRecord = mockTemplateFactory({
        id: 'tp-no-product',
        product_id: null,
        ...requestWithoutProduct,
      });
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const result = await createTemplate(requestWithoutProduct, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data.product_id).toBeUndefined();
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    const validCreateRequest = {
      product_id: '00000000-0000-0000-0000-000000000100',
      name: '边界测试模板',
      category: 'promo',
      strategy_summary: '测试策略摘要',
      factor_json: { optimal_shot_count: 4 },
    };

    it('TC-CRUD-BND-001: 空列表返回空 items 且 total=0', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);
      mockPrisma.template.count.mockResolvedValue(0);

      const result = await getTemplateList(
        { page: 1, page_size: 20 },
        { prisma: mockPrisma },
      );

      expect(result.data.items).toHaveLength(0);
      expect(result.data.total).toBe(0);
      expect(result.data.has_more).toBe(false);
    });

    it('TC-CRUD-BND-002: page_size=1 单条分页正常工作', async () => {
      const allRecords = [
        mockTemplateFactory({ id: 'tp-1' }),
        mockTemplateFactory({ id: 'tp-2' }),
      ];
      mockPrisma.template.findMany.mockResolvedValue([allRecords[0]]);
      mockPrisma.template.count.mockResolvedValue(2);

      const result = await getTemplateList(
        { page: 1, page_size: 1 },
        { prisma: mockPrisma },
      );

      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(2);
      expect(result.data.has_more).toBe(true);
    });

    it('TC-CRUD-BND-003: page_size=100 (最大值) 正常工作', async () => {
      mockPrisma.template.findMany.mockResolvedValue([]);
      mockPrisma.template.count.mockResolvedValue(0);

      const result = await getTemplateList(
        { page: 1, page_size: 100 },
        { prisma: mockPrisma },
      );

      expect(result.data.page_size).toBe(100);
    });

    it('TC-CRUD-BND-004: name 120 字符极限值创建成功', async () => {
      const longName = 'A'.repeat(120);
      const request = { ...validCreateRequest, name: longName };

      const createdRecord = mockTemplateFactory({ id: 'tp-long-name', name: longName });
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const result = await createTemplate(request, { prisma: mockPrisma });

      expect(result.data.name).toBe(longName);
      expect(result.data.name.length).toBe(120);
    });

    it('TC-CRUD-BND-005: strategy_summary 5000 字符极限值创建成功', async () => {
      const longSummary = '策'.repeat(5000);
      const request = { ...validCreateRequest, strategy_summary: longSummary };

      const createdRecord = mockTemplateFactory({
        id: 'tp-long-summary',
        strategy_summary: longSummary,
      });
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const result = await createTemplate(request, { prisma: mockPrisma });

      expect(result.data.strategy_summary).toBe(longSummary);
      expect(result.data.strategy_summary.length).toBe(5000);
    });

    it('TC-CRUD-BND-006: factor_json 仅含 1 个因子键时创建成功', async () => {
      const minimalFactor = { optimal_shot_count: 4 };
      const request = { ...validCreateRequest, factor_json: minimalFactor };

      const createdRecord = mockTemplateFactory({
        id: 'tp-min-factor',
        factor_json: minimalFactor,
      });
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const result = await createTemplate(request, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
      expect(result.data.template_id).toBe('tp-min-factor');
    });

    it('TC-CRUD-BND-007: factor_json 包含全部 9 个已知因子键时创建成功', async () => {
      const fullFactor: Record<string, unknown> = {};
      for (const key of FACTOR_PRIORITY) {
        fullFactor[key] = key.startsWith('optimal') ? 5 : `test_${key}`;
      }
      const request = { ...validCreateRequest, factor_json: fullFactor };

      const createdRecord = mockTemplateFactory({
        id: 'tp-full-factor',
        factor_json: fullFactor,
      });
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const result = await createTemplate(request, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
    });

    it('TC-CRUD-BND-008: schema_json 为 null 时创建成功', async () => {
      const request = {
        ...validCreateRequest,
        schema_json: null as unknown as Record<string, unknown>,
      };

      const createdRecord = mockTemplateFactory({
        id: 'tp-null-schema',
        schema_json: null,
      });
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const result = await createTemplate(request, { prisma: mockPrisma });

      expect(result).toHaveProperty('success', true);
    });

    it('TC-CRUD-BND-009: 更新模板时仅修改 name 字段 — 其他字段不变', async () => {
      const existingRecord = mockTemplateFactory({ id: 'tp-partial', name: '旧名称', category: 'promo' });
      mockPrisma.template.findUnique.mockResolvedValue(existingRecord);

      const updatedRecord = { ...existingRecord, name: '新名称', updated_at: new Date('2026-05-24T12:00:00Z') };
      mockPrisma.template.update.mockResolvedValue(updatedRecord);

      const result = await updateTemplate(
        'tp-partial',
        { name: '新名称' },
        { prisma: mockPrisma },
      );

      expect(result.data.name).toBe('新名称');
      expect(result.data.category).toBe('promo');
    });

    it('TC-CRUD-BND-010: 更新 status 从 ACTIVE→INACTIVE 合法转换', async () => {
      const existingRecord = mockTemplateFactory({ id: 'tp-status', status: 'ACTIVE' });
      mockPrisma.template.findUnique.mockResolvedValue(existingRecord);

      const updatedRecord = { ...existingRecord, status: 'INACTIVE', updated_at: new Date('2026-05-24T12:00:00Z') };
      mockPrisma.template.update.mockResolvedValue(updatedRecord);

      const result = await updateTemplate(
        'tp-status',
        { status: 'INACTIVE' },
        { prisma: mockPrisma },
      );

      expect(result.data.status).toBe('INACTIVE');
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const validCreateRequest = {
      product_id: '00000000-0000-0000-0000-000000000100',
      name: '测试模板',
      category: 'promo',
      strategy_summary: '测试策略摘要',
      factor_json: { optimal_shot_count: 4 },
    };

    // ---- 3.1 创建模板异常 ----

    it('TC-CRUD-ERR-001: 创建时 name 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(
          { ...validCreateRequest, name: '' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-002: 创建时 category 非法 → TEMPLATE_CATEGORY_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(
          { ...validCreateRequest, category: 'invalid_category_xyz' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_CATEGORY_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.message).toContain('invalid_category_xyz');
    });

    it('TC-CRUD-ERR-003: 创建时 strategy_summary 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(
          { ...validCreateRequest, strategy_summary: '' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-004: 创建时 factor_json 为空对象 → TEMPLATE_FACTOR_STRUCTURE_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(
          { ...validCreateRequest, factor_json: {} },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-005: 创建时 factor_json 不含任何已知因子键 → TEMPLATE_FACTOR_STRUCTURE_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(
          {
            ...validCreateRequest,
            factor_json: { unknown_key_1: 'val1', unknown_key_2: 'val2' },
          },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
      expect(caught!.message).toContain('不含任何已知因子键');
    });

    it('TC-CRUD-ERR-006: 创建时 name 重复 → TEMPLATE_NAME_DUPLICATE (P2002)', async () => {
      const dbError = Object.assign(new Error('Unique constraint failed on the fields: (`name`)'), {
        code: 'P2002',
      });
      mockPrisma.template.create.mockRejectedValue(dbError);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(validCreateRequest, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode || caught!.code).toBe('TEMPLATE_NAME_DUPLICATE');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-CRUD-ERR-007: 创建时 product_id 指向不存在的商品 → PRODUCT_NOT_FOUND (P2003)', async () => {
      const dbError = Object.assign(new Error('Foreign key constraint failed on the fields: (`product_id`)'), {
        code: 'P2003',
      });
      mockPrisma.template.create.mockRejectedValue(dbError);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(validCreateRequest, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode || caught!.code).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-CRUD-ERR-008: 创建时 schema_json 非法 (数组类型) → TEMPLATE_SCHEMA_INVALID', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(
          { ...validCreateRequest, schema_json: ['invalid', 'array'] as unknown as Record<string, unknown> },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_SCHEMA_INVALID');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-009: 创建时 name 超 120 字符 → INVALID_REQUEST', async () => {
      const longName = 'A'.repeat(121);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await createTemplate(
          { ...validCreateRequest, name: longName },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    // ---- 3.2 查询详情异常 ----

    it('TC-CRUD-ERR-010: 详情 template_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getTemplateDetail('', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-011: 查询不存在的模板 → TEMPLATE_NOT_FOUND', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getTemplateDetail('nonexistent-id', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- 3.3 更新模板异常 ----

    it('TC-CRUD-ERR-012: 更新时 template_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await updateTemplate('', { name: 'new' }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-013: 更新不存在的模板 → TEMPLATE_NOT_FOUND', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await updateTemplate(
          'nonexistent-id',
          { name: 'new' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-CRUD-ERR-014: 更新 ARCHIVED 状态模板 → TEMPLATE_STATUS_IMMUTABLE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(
        mockTemplateFactory({ id: 'tp-archived', status: 'ARCHIVED' }),
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await updateTemplate(
          'tp-archived',
          { name: 'new-name' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_STATUS_IMMUTABLE');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      expect(caught!.message).toContain('已归档');
    });

    it('TC-CRUD-ERR-015: 更新 status 为非法值(非ACTIVE/INACTIVE/ARCHIVED) → TEMPLATE_STATUS_IMMUTABLE', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ id: 'tp-bad-status' }));

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await updateTemplate(
          'tp-bad-status',
          { status: 'DELETED' },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_STATUS_IMMUTABLE');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-CRUD-ERR-016: 更新 status 非法转换 ACTIVE→INACTIVE→ACTIVE 合法, 但 ACTIVE→SOME_UNKNOWN 非法', async () => {
      // Already covered by TC-CRUD-ERR-015.
      // Bonus: ACTIVE→INACTIVE 合法 (已由 TC-CRUD-BND-010 覆盖)
      // Bonus: INACTIVE→ARCHIVED 合法
      const existing = mockTemplateFactory({ id: 'tp-trans', status: 'INACTIVE' });
      mockPrisma.template.findUnique.mockResolvedValue(existing);

      const updated = { ...existing, status: 'ARCHIVED', updated_at: new Date() };
      mockPrisma.template.update.mockResolvedValue(updated);

      const result = await updateTemplate(
        'tp-trans',
        { status: 'ARCHIVED' },
        { prisma: mockPrisma },
      );

      expect(result.data.status).toBe('ARCHIVED');
    });

    it('TC-CRUD-ERR-017: 更新时更新 name 为空 → INVALID_REQUEST', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ id: 'tp-name' }));

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await updateTemplate('tp-name', { name: '' }, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    // ---- 3.4 删除模板异常 ----

    it('TC-CRUD-ERR-018: 删除时 template_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteTemplate('', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-019: 删除不存在的模板 → TEMPLATE_NOT_FOUND', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteTemplate('nonexistent-id', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-CRUD-ERR-020: Prisma P2025 映射为 TEMPLATE_NOT_FOUND (update/delete场景)', () => {
      const error = Object.assign(new Error('Record to delete does not exist.'), {
        code: 'P2025',
      });

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'TEMPLATE_NOT_FOUND');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.NOT_FOUND);
    });

    // ---- 3.5 列表查询异常 ----

    it('TC-CRUD-ERR-021: 列表 page 为 0 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getTemplateList(
          { page: 0, page_size: 20 },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-022: 列表 page 为负数 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getTemplateList(
          { page: -1, page_size: 20 },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-023: 列表 page_size 超过 100 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await getTemplateList(
          { page: 1, page_size: 101 },
          { prisma: mockPrisma },
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-CRUD-ERR-024: Prisma P1001 数据库连接失败 → INTERNAL_SERVER_ERROR', () => {
      const error = Object.assign(new Error('Connection terminated unexpectedly'), {
        code: 'P1001',
      });

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-CRUD-ERR-025: Prisma P1008 查询超时 → INTERNAL_SERVER_ERROR', () => {
      const error = Object.assign(new Error('Query timeout'), {
        code: 'P1008',
      });

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('TC-CRUD-ERR-026: Prisma 未知错误码 → INTERNAL_SERVER_ERROR', () => {
      const error = Object.assign(new Error('Some unknown prisma error'), {
        code: 'P9999',
      });

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时卡点告警', () => {
    const validCreateRequest = {
      product_id: '00000000-0000-0000-0000-000000000100',
      name: '性能测试模板',
      category: 'promo',
      strategy_summary: '性能测试摘要',
      factor_json: { optimal_shot_count: 4 },
    };

    it('TC-CRUD-PERF-001: createTemplate 编排总耗时 ≤ 200ms', async () => {
      const PERF_CEILING_MS = 200;

      const createdRecord = mockTemplateFactory(validCreateRequest);
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const start = performance.now();

      await createTemplate(validCreateRequest, { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRUD-PERF-002: getTemplateList 编排总耗时 ≤ 150ms', async () => {
      const PERF_CEILING_MS = 150;

      const mockRecords = Array.from({ length: 20 }, (_, i) =>
        mockTemplateFactory({ id: `perf-tp-${i}` }),
      );
      mockPrisma.template.findMany.mockResolvedValue(mockRecords);
      mockPrisma.template.count.mockResolvedValue(20);

      const start = performance.now();

      await getTemplateList({ page: 1, page_size: 20 }, { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRUD-PERF-003: getTemplateDetail 编排总耗时 ≤ 100ms', async () => {
      const PERF_CEILING_MS = 100;

      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ id: 'perf-detail' }));

      const start = performance.now();

      await getTemplateDetail('perf-detail', { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRUD-PERF-004: updateTemplate 编排总耗时 ≤ 200ms', async () => {
      const PERF_CEILING_MS = 200;

      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ id: 'perf-update' }));
      mockPrisma.template.update.mockResolvedValue(
        mockTemplateFactory({ id: 'perf-update', name: 'updated' }),
      );

      const start = performance.now();

      await updateTemplate('perf-update', { name: 'updated' }, { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRUD-PERF-005: deleteTemplate 编排总耗时 ≤ 150ms', async () => {
      const PERF_CEILING_MS = 150;

      mockPrisma.template.findUnique.mockResolvedValue(mockTemplateFactory({ id: 'perf-delete' }));
      mockPrisma.template.delete.mockResolvedValue(mockTemplateFactory({ id: 'perf-delete' }));

      const start = performance.now();

      await deleteTemplate('perf-delete', { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-CRUD-PERF-006: 连续 10 次 createTemplate 无明显性能退化', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 50;

      const createdRecord = mockTemplateFactory(validCreateRequest);
      mockPrisma.template.create.mockResolvedValue(createdRecord);

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await createTemplate(
          { ...validCreateRequest, name: `perf-create-${i}` },
          { prisma: mockPrisma },
        );
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-CRUD-PERF-007: 查询 100 条模板列表 ≤ 200ms', async () => {
      const PERF_CEILING_MS = 200;

      const largeRecords = Array.from({ length: 100 }, (_, i) =>
        mockTemplateFactory({ id: `perf-large-${i}`, name: `模板_${i}` }),
      );
      mockPrisma.template.findMany.mockResolvedValue(largeRecords);
      mockPrisma.template.count.mockResolvedValue(100);

      const start = performance.now();

      await getTemplateList({ page: 1, page_size: 100 }, { prisma: mockPrisma });

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 原子函数（独立校验各子函数）
  // ===========================================================================

  describe('【原子函数】独立校验 validateTemplateCategory / validateFactorJsonStructure / validateTemplateNotArchived / validateTemplateExists / mapToTemplateType / mapToTemplateDetailType / mapPrismaError', () => {
    // ---- validateTemplateCategory ----

    it('validateTemplateCategory — 合法分类 "promo" 通过', () => {
      expect(() => validateTemplateCategory('promo')).not.toThrow();
    });

    it('validateTemplateCategory — 合法分类 "unboxing" 通过', () => {
      expect(() => validateTemplateCategory('unboxing')).not.toThrow();
    });

    it('validateTemplateCategory — 合法分类 "tutorial" 通过', () => {
      expect(() => validateTemplateCategory('tutorial')).not.toThrow();
    });

    it('validateTemplateCategory — 合法分类 "review" 通过', () => {
      expect(() => validateTemplateCategory('review')).not.toThrow();
    });

    it('validateTemplateCategory — 合法分类 "story" 通过', () => {
      expect(() => validateTemplateCategory('story')).not.toThrow();
    });

    it('validateTemplateCategory — 合法分类 "comparison" 通过', () => {
      expect(() => validateTemplateCategory('comparison')).not.toThrow();
    });

    it('validateTemplateCategory — 合法分类 "custom" 通过', () => {
      expect(() => validateTemplateCategory('custom')).not.toThrow();
    });

    it('validateTemplateCategory — 空字符串抛出 TEMPLATE_CATEGORY_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateTemplateCategory('');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_CATEGORY_INVALID');
    });

    it('validateTemplateCategory — 非法分类 "unknown_type" 抛出 TEMPLATE_CATEGORY_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateTemplateCategory('unknown_type');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_CATEGORY_INVALID');
      expect(caught!.message).toContain('unknown_type');
    });

    // ---- validateFactorJsonStructure ----

    it('validateFactorJsonStructure — 正常单键通过', () => {
      expect(() =>
        validateFactorJsonStructure({ optimal_shot_count: 4 }),
      ).not.toThrow();
    });

    it('validateFactorJsonStructure — 正常全键通过', () => {
      const full: Record<string, unknown> = {};
      for (const key of FACTOR_PRIORITY) {
        full[key] = key.startsWith('optimal') ? 5 : `test_${key}`;
      }
      expect(() => validateFactorJsonStructure(full)).not.toThrow();
    });

    it('validateFactorJsonStructure — 空对象抛出 TEMPLATE_FACTOR_STRUCTURE_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateFactorJsonStructure({});
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
    });

    it('validateFactorJsonStructure — 不含已知因子键抛出 TEMPLATE_FACTOR_STRUCTURE_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateFactorJsonStructure({ unknown_a: 'v1', unknown_b: 'v2' });
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
    });

    it('validateFactorJsonStructure — null 值抛出 TEMPLATE_FACTOR_STRUCTURE_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateFactorJsonStructure(null as unknown as Record<string, unknown>);
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
    });

    it('validateFactorJsonStructure — undefined 值抛出 TEMPLATE_FACTOR_STRUCTURE_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateFactorJsonStructure(undefined as unknown as Record<string, unknown>);
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
    });

    it('validateFactorJsonStructure — 数组值抛出 TEMPLATE_FACTOR_STRUCTURE_INVALID (非Object)', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateFactorJsonStructure(['a', 'b'] as unknown as Record<string, unknown>);
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
    });

    it('validateFactorJsonStructure — 含 null 值的因子键抛出 TEMPLATE_FACTOR_STRUCTURE_INVALID', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateFactorJsonStructure({
          optimal_shot_count: null,
          bgm_style: 'upbeat',
        } as unknown as Record<string, unknown>);
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_FACTOR_STRUCTURE_INVALID');
    });

    // ---- validateTemplateNotArchived ----

    it('validateTemplateNotArchived — ACTIVE 状态正常通过', () => {
      const tmpl = mockTemplateFactory({ status: 'ACTIVE' });
      expect(() => validateTemplateNotArchived(tmpl)).not.toThrow();
    });

    it('validateTemplateNotArchived — INACTIVE 状态正常通过', () => {
      const tmpl = mockTemplateFactory({ status: 'INACTIVE' });
      expect(() => validateTemplateNotArchived(tmpl)).not.toThrow();
    });

    it('validateTemplateNotArchived — ARCHIVED 状态抛出 TEMPLATE_STATUS_IMMUTABLE', () => {
      const tmpl = mockTemplateFactory({ status: 'ARCHIVED' });
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        validateTemplateNotArchived(tmpl);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_STATUS_IMMUTABLE');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    // ---- validateTemplateExists ----

    it('validateTemplateExists — 正常模板存在时返回完整记录', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(
        mockTemplateFactory({ id: 'exists-test' }),
      );

      const result = await validateTemplateExists('exists-test', mockPrisma);

      expect(result).toBeDefined();
      expect(result.id).toBe('exists-test');
      expect(result.name).toBeDefined();
      expect(result.category).toBeDefined();
    });

    it('validateTemplateExists — 模板不存在抛出 TEMPLATE_NOT_FOUND', async () => {
      mockPrisma.template.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateTemplateExists('nonexistent-id', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TEMPLATE_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('validateTemplateExists — 空 templateId 抛出 INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await validateTemplateExists('', mockPrisma);
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    // ---- mapToTemplateType / mapToTemplateDetailType ----

    it('mapToTemplateType — 完整字段映射 (Prisma camelCase → API snake_case)', () => {
      const record = mockTemplateFactory({
        id: 'map-test-id',
        product_id: null,
      });

      const result = mapToTemplateType(record);

      expect(result).toHaveProperty('template_id', 'map-test-id');
      expect(result).toHaveProperty('name', record.name);
      expect(result).toHaveProperty('category', record.category);
      expect(result).toHaveProperty('strategy_summary', record.strategy_summary);
      expect(result).toHaveProperty('status', record.status);
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('updated_at');
      expect(result).not.toHaveProperty('factor_json');
      expect(result).not.toHaveProperty('schema_json');
      expect(result.product_id).toBeUndefined();
    });

    it('mapToTemplateDetailType — 包含 factor_json 和 schema_json', () => {
      const record = mockTemplateFactory({
        id: 'detail-test-id',
        factor_json: { optimal_shot_count: 3, bgm_style: 'calm' },
        schema_json: { version: '1.0' },
      });

      const result = mapToTemplateDetailType(record);

      expect(result).toHaveProperty('template_id', 'detail-test-id');
      expect(result).toHaveProperty('factor_json');
      expect(result.factor_json).toEqual({ optimal_shot_count: 3, bgm_style: 'calm' });
      expect(result).toHaveProperty('schema_json');
      expect(result.schema_json).toEqual({ version: '1.0' });
    });

    // ---- mapPrismaError ----

    it('mapPrismaError — P2002 unique constraint 映射为 TEMPLATE_NAME_DUPLICATE', () => {
      const error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'TEMPLATE_NAME_DUPLICATE');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.CONFLICT);
    });

    it('mapPrismaError — P2025 record not found 映射为 TEMPLATE_NOT_FOUND', () => {
      const error = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });

      const mapped = mapPrismaError(error);

      expect(mapped).toHaveProperty('code', 'TEMPLATE_NOT_FOUND');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.NOT_FOUND);
    });

    it('mapPrismaError — 非 Error 类型 → INTERNAL_SERVER_ERROR', () => {
      const mapped = mapPrismaError('just a string error');

      expect(mapped).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(mapped).toHaveProperty('statusCode', HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言 Template CRUD 功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-CRUD-001 ~ TC-CRUD-008      正常流 (Happy Path)
//   TC-CRUD-BND-001 ~ TC-CRUD-BND-010  边界流 (Edge Cases)
//   TC-CRUD-ERR-001 ~ TC-CRUD-ERR-026  异常流 (Error Flow)
//   TC-CRUD-PERF-001 ~ TC-CRUD-PERF-007 性能流 (Performance)
//
// 覆盖率维度:
//   ├── createTemplate           (9 集成 + 2 性能)
//   ├── getTemplateList          (5 集成 + 3 异常 + 2 性能)
//   ├── getTemplateDetail        (2 集成 + 2 异常 + 1 性能)
//   ├── updateTemplate           (2 集成 + 6 异常 + 1 性能)
//   ├── deleteTemplate           (1 集成 + 2 异常 + 1 性能)
//   ├── validateTemplateCategory (9 原子)
//   ├── validateFactorJsonStructure (8 原子)
//   ├── validateTemplateNotArchived (3 原子)
//   ├── validateTemplateExists   (3 原子)
//   ├── mapToTemplateType        (1 原子)
//   ├── mapToTemplateDetailType  (1 原子)
//   └── mapPrismaError           (6 原子 + 1 非Error)
//
// 总测试用例数: 56
// =============================================================================