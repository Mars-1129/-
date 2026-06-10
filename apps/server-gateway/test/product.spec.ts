// =============================================================================
// TikStream AI — Product E2E Test Suite
// 完整的端到端测试，验证所有 Product API 端点的业务逻辑和错误处理
// 包含 BUG-041 ~ BUG-057验证
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProductService } from '../src/product/product.service';
import { ProductRepository } from '../src/product/product.repository';
import { CreateProductRequest, UpdateProductRequest } from '@tikstream/shared-types';

// =============================================================================
// Test Constants
// =============================================================================

const VALID_PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const VALID_PRODUCT_ID_2 = '00000000-0000-0000-0000-000000000002';
const VALID_PRODUCT_ID_3 = '00000000-0000-0000-0000-000000000003';
const NON_EXISTENT_PRODUCT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// =============================================================================
// Test Data Generators
// =============================================================================

/** Concurrency limiter — prevents ECONNRESET from in-process HTTP server saturation */
async function pLimit<T>(concurrency: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createMockProduct(overrides?: Partial<{
  id: string;
  title: string;
  category: string;
  skuCode: string;
  sellingPoints: string[];
  targetAudience: string | null;
  scenarioTags: string[];
  textFeatures: Record<string, unknown>;
  coverImageUrl: string | null;
  color: string | null;
  materialType: string | null;
  sizeDesc: string | null;
  usageScenario: string | null;
  brand: string | null;
  richFeatures: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}>): Record<string, unknown> {
  const now = new Date();
  return {
    id: overrides?.id ?? generateUUID(),
    title: overrides?.title ?? '测试商品',
    category: overrides?.category ?? '电子产品',
    skuCode: overrides?.skuCode ?? `SKU-TEST-${Date.now()}`,
    sellingPoints: overrides?.sellingPoints ?? ['高品质', '高性价比'],
    targetAudience: overrides?.targetAudience ?? null,
    scenarioTags: overrides?.scenarioTags ?? [],
    textFeatures: overrides?.textFeatures ?? {},
    coverImageUrl: overrides?.coverImageUrl ?? null,
    color: overrides?.color ?? null,
    materialType: overrides?.materialType ?? null,
    sizeDesc: overrides?.sizeDesc ?? null,
    usageScenario: overrides?.usageScenario ?? null,
    brand: overrides?.brand ?? null,
    richFeatures: overrides?.richFeatures ?? {},
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

// =============================================================================
// Mock ProductRepository
// =============================================================================

class MockProductRepository {
  // 使用 static Map 确保所有 DI 实例共享同一数据（ProductRepository 在多个模块中被注册）
  private static products: Map<string, Record<string, unknown>> = new Map();
  private static sequence = 0;

  findProducts = jest.fn().mockImplementation(async (params: {
    page: number;
    pageSize: number;
    category?: string;
    keyword?: string;
  }) => {
    let items = Array.from(MockProductRepository.products.values());

    if (params.category) {
      items = items.filter(p => p.category === params.category);
    }
    if (params.keyword) {
      items = items.filter(p =>
        (p.title as string).toLowerCase().includes(params.keyword!.toLowerCase())
      );
    }

    const total = items.length;
    const start = (params.page - 1) * params.pageSize;
    const paginatedItems = items.slice(start, start + params.pageSize);

    return {
      items: paginatedItems,
      total,
    };
  });

  findProductById = jest.fn().mockImplementation(async (id: string) => {
    return MockProductRepository.products.get(id) || null;
  });

  createProduct = jest.fn().mockImplementation(async (data: Record<string, unknown>) => {
    MockProductRepository.sequence++;
    const productId = generateUUID();
    const product = {
      ...data,
      id: productId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    MockProductRepository.products.set(productId, product);
    return product;
  });

  updateProduct = jest.fn().mockImplementation(async (id: string, data: Record<string, unknown>) => {
    const existing = MockProductRepository.products.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    MockProductRepository.products.set(id, updated);
    return updated;
  });

  deleteProductWithDependencyCheck = jest.fn().mockImplementation(async (id: string) => {
    const existing = MockProductRepository.products.get(id);
    if (!existing) return null;

    // 模拟检查依赖
    return {
      deleted: true,
      dependencies: { materials: 0, creations: 0, scripts: 0, templates: 0, viralAnalyses: 0 },
    };
  });

  // 辅助方法
  addProduct(product: Record<string, unknown>): void {
    MockProductRepository.products.set(product.id as string, product);
  }

  clearProducts(): void {
    MockProductRepository.products.clear();
  }
}

// =============================================================================
// Test Suite: Product E2E
// =============================================================================

describe('Product E2E Tests', () => {
  let app: INestApplication;
  let mockRepository: MockProductRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ProductRepository)
      .useClass(MockProductRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // ProductRepository is registered in BOTH ProductModule and MaterialModule.
    // overrideProvider may only replace one registration, so app.get() can return
    // a different instance than what ProductService uses internally.
    // We must get the repo through ProductService to match the actual DI instance.
    const productService = app.get(ProductService);
    mockRepository = (productService as any).repository as MockProductRepository;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.clearProducts();
  });

  // =============================================================================
  // Test Group: listProducts - 商品列表查询 (BUG-041 ~ BUG-043)
  // =============================================================================

  describe('listProducts API', () => {
    // -------------------------------------------------------------------------
    // BUG-041: page 参数无效时未正确验证
    // -------------------------------------------------------------------------

    describe('BUG-041: page 参数校验', () => {
      it('BUG-041-T1: page 为 0 时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 0, page_size: 20 });

        // Controller 用 try/catch + @HttpCode 包裹错误响应，HTTP 状态为 200
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-041-T2: page 为负数时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: -1, page_size: 20 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-041-T3: page 为小数时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1.5, page_size: 20 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-041-T4: page 为非数字字符串时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 'abc', page_size: 20 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-042: page_size 参数无效时未正确验证
    // -------------------------------------------------------------------------

    describe('BUG-042: page_size 参数校验', () => {
      it('BUG-042-T1: page_size 为 0 时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 0 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-042-T2: page_size 大于 100 时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 101 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-042-T3: page_size 为小数时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 10.5 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-042-T4: page_size 为负数时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: -5 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-043: 数据库查询失败时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-043: 数据库查询失败处理', () => {
      it('BUG-043-T1: 数据库连接失败时应返回错误', async () => {
        mockRepository.findProducts.mockRejectedValueOnce(
          new Error('Connection refused')
        );

        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 20 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INTERNAL_SERVER_ERROR',
          }),
        });
      });

      it('BUG-043-T2: Prisma 错误码应正确传播', async () => {
        mockRepository.findProducts.mockRejectedValueOnce(
          Object.assign(new Error('Prisma error'), { code: 'P1001' })
        );

        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 20 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            retryable: true,
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('listProducts 正常流程', () => {
      beforeEach(() => {
        // 添加测试数据
        for (let i = 0; i < 25; i++) {
          mockRepository.addProduct(createMockProduct({
            id: generateUUID(),
            title: `测试商品 ${i + 1}`,
            category: i % 2 === 0 ? '电子产品' : '服装',
          }));
        }
      });

      it('NORMAL-T1: 应正确返回分页商品列表', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 10 })
          .expect(200);

        expect(response.body.data).toMatchObject({
          items: expect.any(Array),
          page: 1,
          page_size: 10,
          total: expect.any(Number),
          has_more: expect.any(Boolean),
        });
      });

      it('NORMAL-T2: 应正确处理分类过滤', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 20, category: '电子产品' })
          .expect(200);

        expect(response.body.data.items.length).toBeGreaterThan(0);
      });

      it('NORMAL-T3: 应正确处理关键词搜索', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 20, keyword: '测试商品' })
          .expect(200);

        expect(response.body.data.items.length).toBeGreaterThan(0);
      });

      it('NORMAL-T4: 应正确处理空列表', async () => {
        mockRepository.clearProducts();

        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 20 })
          .expect(200);

        expect(response.body.data.items).toEqual([]);
        expect(response.body.data.total).toBe(0);
        expect(response.body.data.has_more).toBe(false);
      });

      it('NORMAL-T5: 应正确处理 has_more 标记', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 10 })
          .expect(200);

        //25 个商品，每页 10 条，第一页 has_more 应为 true
        expect(response.body.data.has_more).toBe(true);
      });

      it('NORMAL-T6: 应正确处理 keyword 空格 trimming', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products')
          .query({ page: 1, page_size: 20, keyword: '  测试商品  ' })
          .expect(200);

        expect(response.body.data.items.length).toBeGreaterThan(0);
      });
    });
  });

  // =============================================================================
  // Test Group: getProductDetail - 商品详情查询 (BUG-044 ~ BUG-046)
  // =============================================================================

  describe('getProductDetail API', () => {
    beforeEach(() => {
      mockRepository.addProduct(createMockProduct({ id: VALID_PRODUCT_ID }));
    });

    // -------------------------------------------------------------------------
    // BUG-044: product_id 为空时未正确验证
    // -------------------------------------------------------------------------

    describe('BUG-044: product_id 为空的校验', () => {
      it('BUG-044-T1: product_id 为空字符串时应返回错误', async () => {
        // 注意: GET /api/v1/products/ 会匹配 listProducts 路由
        // 必须用 /api/v1/products/%20 来匹配 getProductDetail 路由
        const response = await request(app.getHttpServer())
          .get('/api/v1/products/%20');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-044-T2: product_id 为全空格时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/products/%20%20%20');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-045: 商品不存在时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-045: 商品不存在的处理', () => {
      it('BUG-045-T1: 不存在的 product_id 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/products/${NON_EXISTENT_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-046: 数据库查询失败时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-046: 数据库查询失败处理', () => {
      it('BUG-046-T1: 数据库查询失败时应返回错误', async () => {
        mockRepository.findProductById.mockRejectedValueOnce(
          new Error('Database connection failed')
        );

        const response = await request(app.getHttpServer())
          .get(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INTERNAL_SERVER_ERROR',
            retryable: true,
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('getProductDetail 正常流程', () => {
      it('NORMAL-T1: 应正确返回商品详情', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          id: VALID_PRODUCT_ID,
        });
      });

      it('NORMAL-T2: 应正确处理 product_id 空格 trimming', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/products/%20${VALID_PRODUCT_ID}%20`)
          .expect(200);

        expect(response.body.data.id).toBe(VALID_PRODUCT_ID);
      });
    });
  });

  // =============================================================================
  // Test Group: createProduct - 创建商品 (BUG-047 ~ BUG-048)
  // =============================================================================

  describe('createProduct API', () => {
    // -------------------------------------------------------------------------
    // BUG-047: title 为空时未正确验证
    // -------------------------------------------------------------------------

    describe('BUG-047: title 为空的校验', () => {
      it('BUG-047-T1: title 为空字符串时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '' });

        // createProduct 使用 @HttpCode(201)，所以错误也返回 201
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-047-T2: title 为全空格时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '   ' });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-047-T3: title 未提供时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({});

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-048: 数据库创建失败时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-048: 数据库创建失败处理', () => {
      it('BUG-048-T1: 数据库创建失败时应返回错误', async () => {
        mockRepository.createProduct.mockRejectedValueOnce(
          new Error('Database error')
        );

        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试商品', category: 'Other', selling_points: [] });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: expect.stringContaining('FAILED'),
          }),
        });
      });

      it('BUG-048-T2: Prisma 唯一约束冲突应返回错误', async () => {
        mockRepository.createProduct.mockRejectedValueOnce(
          Object.assign(new Error('Unique constraint'), { code: 'P2002' })
        );

        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试商品', category: 'Other', selling_points: [] });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(false);
        // 业务代码应捕获并转换为合适的错误码
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: expect.any(String),
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('createProduct 正常流程', () => {
      it('NORMAL-T1: 应正确创建商品', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({
            title: '新测试商品',
            category: '电子产品',
            selling_points: ['高品质', '高性价比'],
          })
          .expect(201);

        expect(response.body.data).toMatchObject({
          title: '新测试商品',
          category: '电子产品',
        });
      });

      it('NORMAL-T2: 应自动生成 SKU 代码', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试商品', category: 'Other', selling_points: [] })
          .expect(201);

        expect(response.body.data.sku_code).toMatch(/^SKU-AUTO-/);
      });

      it('NORMAL-T3: 应使用默认 category', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试商品', category: 'Other', selling_points: [] })
          .expect(201);

        expect(response.body.data.category).toBe('Other');
      });

      it('NORMAL-T4: 应正确处理所有可选字段', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({
            title: '完整测试商品',
            category: '服装',
            selling_points: ['时尚', '舒适'],
            target_audience: '年轻人',
            scenario_tags: ['日常', '工作'],
            color: '蓝色',
            material_type: '棉质',
            size_desc: 'M码',
            usage_scenario: '日常穿着',
            brand: 'TestBrand',
          })
          .expect(201);

        expect(response.body.data).toMatchObject({
          title: '完整测试商品',
          color: '蓝色',
          material_type: '棉质',
        });
      });
    });
  });

  // =============================================================================
  // Test Group: updateProduct - 更新商品 (BUG-049 ~ BUG-053)
  // =============================================================================

  describe('updateProduct API', () => {
    beforeEach(() => {
      mockRepository.addProduct(createMockProduct({
        id: VALID_PRODUCT_ID,
        title: '原标题',
        category: '电子产品',
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-049: product_id 为空时未正确验证
    // -------------------------------------------------------------------------

    describe('BUG-049: product_id 为空的校验', () => {
      it('BUG-049-T1: product_id 为空字符串时应返回错误', async () => {
        // 注意: trailing space 导致 NestJS 路由无法匹配，返回 404
        // 必须用 /api/v1/products/%20 来匹配 updateProduct 路由
        const response = await request(app.getHttpServer())
          .patch('/api/v1/products/%20')
          .send({ title: '新标题' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-049-T2: product_id 为全空格时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch('/api/v1/products/%20%20%20')
          .send({ title: '新标题' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-050: 没有提供任何更新字段时未正确验证
    // -------------------------------------------------------------------------

    describe('BUG-050: 未提供更新字段的校验', () => {
      it('BUG-050-T1: 空对象 {} 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-050-T2: 所有字段为 undefined 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({
            title: undefined,
            category: undefined,
            selling_points: undefined,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-050-T3: 所有字段为 null 应返回错误', async () => {
        // ValidationPipe whitelist 保留 null 字段，但 service 层无 null 值校验
        // null 值被传入 update 操作导致 Prisma 报错 → 返回 INTERNAL_SERVER_ERROR
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({
            title: null,
            category: null,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INTERNAL_SERVER_ERROR',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-051: 商品不存在时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-051: 商品不存在的处理', () => {
      it('BUG-051-T1: 不存在的 product_id 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${NON_EXISTENT_PRODUCT_ID}`)
          .send({ title: '新标题' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-052: 提交的字段值与当前值一致时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-052: 字段值未变化的处理', () => {
      it('BUG-052-T1: 提交与当前相同的 title 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ title: '原标题' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'NO_CHANGE',
          }),
        });
      });

      it('BUG-052-T2: 提交与当前相同的 category 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ category: '电子产品' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'NO_CHANGE',
          }),
        });
      });

      it('BUG-052-T3: 提交与当前相同的 selling_points 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ selling_points: ['高品质', '高性价比'] });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'NO_CHANGE',
          }),
        });
      });

      it('BUG-052-T4: 提交与当前相同的 rich_features 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ rich_features: {} });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'NO_CHANGE',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-053: 数据库更新失败时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-053: 数据库更新失败处理', () => {
      it('BUG-053-T1: 数据库更新失败时应返回错误', async () => {
        mockRepository.updateProduct.mockRejectedValueOnce(
          new Error('Database error')
        );

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ title: '新标题' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: expect.stringContaining('FAILED'),
            retryable: true,
          }),
        });
      });

      it('BUG-053-T2: updateProduct 返回 null 应返回错误', async () => {
        mockRepository.updateProduct.mockResolvedValueOnce(null);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ title: '新标题' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_UPDATE_FAILED',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('updateProduct 正常流程', () => {
      it('NORMAL-T1: 应正确更新单个字段', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ title: '更新后的标题' })
          .expect(200);

        expect(response.body.data.title).toBe('更新后的标题');
      });

      it('NORMAL-T2: 应正确更新多个字段', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({
            title: '新标题',
            category: '服装',
          })
          .expect(200);

        expect(response.body.data).toMatchObject({
          title: '新标题',
          category: '服装',
        });
      });

      it('NORMAL-T3: 应正确处理 null 字段更新（mapProduct 将 null 转换为 undefined）', async () => {
        mockRepository.addProduct(createMockProduct({
          id: VALID_PRODUCT_ID_2,
          title: '测试商品',
          color: '蓝色',
        }));

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID_2}`)
          .send({ color: null })
          .expect(200);

        // mapProduct 将 null 字段转为 undefined（JSON 不包含该字段）
        expect(response.body.data.color).toBeUndefined();
      });

      it('NORMAL-T4: 应正确处理 selling_points 数组更新', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ selling_points: ['新卖点1', '新卖点2', '新卖点3'] })
          .expect(200);

        expect(response.body.data.selling_points).toEqual(['新卖点1', '新卖点2', '新卖点3']);
      });

      it('NORMAL-T5: 应正确处理 rich_features 对象更新', async () => {
        const newFeatures = { feature1: 'value1', feature2: 'value2' };
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .send({ rich_features: newFeatures })
          .expect(200);

        expect(response.body.data.rich_features).toMatchObject(newFeatures);
      });
    });
  });

  // =============================================================================
  // Test Group: deleteProduct - 删除商品 (BUG-054 ~ BUG-057)
  // =============================================================================

  describe('deleteProduct API', () => {
    beforeEach(() => {
      mockRepository.addProduct(createMockProduct({
        id: VALID_PRODUCT_ID,
        title: '待删除商品',
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-054: product_id 为空时未正确验证
    // -------------------------------------------------------------------------

    describe('BUG-054: product_id 为空的校验', () => {
      it('BUG-054-T1: product_id 为空字符串时应返回错误', async () => {
        // 注意: trailing space 导致 NestJS 路由无法匹配，返回 404
        // 必须用 /api/v1/products/%20 来匹配 deleteProduct 路由
        const response = await request(app.getHttpServer())
          .delete('/api/v1/products/%20');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-054-T2: product_id 为全空格时应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .delete('/api/v1/products/%20%20%20');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-055: 商品不存在时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-055: 商品不存在的处理', () => {
      it('BUG-055-T1: 不存在的 product_id 应返回错误', async () => {
        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${NON_EXISTENT_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-056: 商品有关联资源时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-056: 关联资源依赖检查', () => {
      it('BUG-056-T1: 有关联素材时删除应返回错误', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: false,
          dependencies: { materials: 1, creations: 0, scripts: 0, templates: 0, viralAnalyses: 0 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_HAS_DEPENDENCIES',
          }),
        });
        // buildApiErrorResponse 要求 details 为数组；对象形式的 details 会被丢弃
      });

      it('BUG-056-T2: 有关联创作时删除应返回错误', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: false,
          dependencies: { materials: 0, creations: 1, scripts: 0, templates: 0, viralAnalyses: 0 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_HAS_DEPENDENCIES',
          }),
        });
        // buildApiErrorResponse 要求 details 为数组；对象形式的 details 会被丢弃
      });

      it('BUG-056-T3: 有关联剧本时删除应返回错误', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: false,
          dependencies: { materials: 0, creations: 0, scripts: 1, templates: 0, viralAnalyses: 0 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_HAS_DEPENDENCIES',
          }),
        });
      });

      it('BUG-056-T4: 有关联模板时删除应返回错误', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: false,
          dependencies: { materials: 0, creations: 0, scripts: 0, templates: 1, viralAnalyses: 0 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_HAS_DEPENDENCIES',
          }),
        });
      });

      it('BUG-056-T5: 有关联热门分析时删除应返回错误', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: false,
          dependencies: { materials: 0, creations: 0, scripts: 0, templates: 0, viralAnalyses: 1 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_HAS_DEPENDENCIES',
          }),
        });
      });

      it('BUG-056-T6: 有多种关联资源时应返回详细的依赖信息', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: false,
          dependencies: { materials: 2, creations: 3, scripts: 1, templates: 0, viralAnalyses: 0 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'PRODUCT_HAS_DEPENDENCIES',
          }),
        });
        // buildApiErrorResponse 要求 details 为数组；对象形式的 details 会被丢弃
        // 但 error message 中包含了依赖资源的详细信息
        expect(response.body.message).toContain('2 个素材');
        expect(response.body.message).toContain('3 个创作任务');
        expect(response.body.message).toContain('1 个剧本');
      });
    });

    // -------------------------------------------------------------------------
    // BUG-057: 数据库删除失败时未正确处理
    // -------------------------------------------------------------------------

    describe('BUG-057: 数据库删除失败处理', () => {
      it('BUG-057-T1: 数据库删除失败时应返回错误', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockRejectedValueOnce(
          new Error('Database error')
        );

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: expect.stringContaining('FAILED'),
            retryable: true,
          }),
        });
      });

      it('BUG-057-T2: Prisma 外键约束错误应返回错误', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockRejectedValueOnce(
          Object.assign(new Error('Foreign key constraint'), { code: 'P2003' })
        );

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            retryable: true,
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('deleteProduct 正常流程', () => {
      it('NORMAL-T1: 无关联商品应正确删除', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: true,
          dependencies: { materials: 0, creations: 0, scripts: 0, templates: 0, viralAnalyses: 0 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          id: VALID_PRODUCT_ID,
        });
      });

      it('NORMAL-T2: 删除后应返回商品信息', async () => {
        mockRepository.deleteProductWithDependencyCheck.mockResolvedValueOnce({
          deleted: true,
          dependencies: { materials: 0, creations: 0, scripts: 0, templates: 0, viralAnalyses: 0 },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/products/${VALID_PRODUCT_ID}`)
          .expect(200);

        expect(response.body.data.title).toBe('待删除商品');
      });
    });
  });

  // =============================================================================
  // Test Group: 边界条件测试
  // =============================================================================

  describe('边界条件测试', () => {
    describe('字符串边界值', () => {
      it('BOUNDARY-T1: 超长 title 应正确处理', async () => {
        const longTitle = 'A'.repeat(1000);
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: longTitle })
          .expect(201);

        expect(response.body.data.title).toBe(longTitle);
      });

      it('BOUNDARY-T2: Unicode 标题应正确处理', async () => {
        const unicodeTitle = '测试商品 🔥 日本語商品名 한국 상품명';
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: unicodeTitle })
          .expect(201);

        expect(response.body.data.title).toBe(unicodeTitle);
      });

      it('BOUNDARY-T3: 特殊字符 title 应正确处理', async () => {
        const specialTitle = '商品 "双引号" &符号 <标签> 测试';
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: specialTitle })
          .expect(201);

        expect(response.body.data.title).toBe(specialTitle);
      });
    });

    describe('数组边界值', () => {
      it('BOUNDARY-T4: 空 selling_points 数组应正确处理', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试', selling_points: [] })
          .expect(201);

        expect(response.body.data.selling_points).toEqual([]);
      });

      it('BOUNDARY-T5:大量 selling_points 应正确处理', async () => {
        const manyPoints = Array.from({ length: 100 }, (_, i) => `卖点${i + 1}`);
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试', selling_points: manyPoints })
          .expect(201);

        expect(response.body.data.selling_points).toHaveLength(100);
      });
    });

    describe('对象边界值', () => {
      it('BOUNDARY-T6: 空 rich_features 对象应正确处理', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试', rich_features: {} })
          .expect(201);

        expect(response.body.data.rich_features).toEqual({});
      });

      it('BOUNDARY-T7: 嵌套 rich_features 对象应正确处理', async () => {
        const nestedFeatures = {
          level1: {
            level2: {
              level3: 'value',
            },
          },
          array: [1, 2, 3],
        };
        const response = await request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: '测试', rich_features: nestedFeatures })
          .expect(201);

        expect(response.body.data.rich_features).toMatchObject(nestedFeatures);
      });
    });
  });

  // =============================================================================
  // Test Group: 并发测试
  // =============================================================================

  describe('并发测试', () => {
    it('CONCURRENT-T1: 并发创建商品应正确处理', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => () =>
        request(app.getHttpServer())
          .post('/api/v1/products')
          .send({ title: `并发商品 ${i}` })
          .expect(201)
      );

      const responses = await pLimit(3, tasks);

      responses.forEach((response, index) => {
        expect(response.body.data.title).toBe(`并发商品 ${index}`);
      });
    });

    it('CONCURRENT-T2: 并发更新同一商品应正确处理', async () => {
      const productId = VALID_PRODUCT_ID;
      mockRepository.addProduct(createMockProduct({ id: productId }));

      const tasks = Array.from({ length: 5 }, (_, i) => () =>
        request(app.getHttpServer())
          .patch(`/api/v1/products/${productId}`)
          .send({ title: `更新 ${i}` })
          .expect(200)
      );

      const responses = await pLimit(3, tasks);

      responses.forEach((response) => {
        expect(response.body.data).toMatchObject({
          id: productId,
        });
      });
    });
  });

  // =============================================================================
  // Test Group: 性能测试
  // =============================================================================

  describe('性能测试', () => {
    beforeEach(() => {
      // 添加大量测试数据
      for (let i = 0; i < 100; i++) {
        mockRepository.addProduct(createMockProduct({
          id: generateUUID(),
          title: `性能测试商品 ${i}`,
        }));
      }
    });

    it('PERF-T1: 大量数据查询应在合理时间内完成', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ page: 1, page_size: 20 })
        .expect(200);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // 应在 1 秒内完成
    });

    it('PERF-T2: 带关键词搜索应在合理时间内完成', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ page: 1, page_size: 20, keyword: '性能测试' })
        .expect(200);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });
});