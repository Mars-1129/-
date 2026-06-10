// =============================================================================
// TikStream AI — Product Service完整单元测试
// 测试覆盖率：ProductService 所有公开方法和核心私有方法
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductRepository } from './product.repository';
import { CreateProductRequest, UpdateProductRequest } from '@tikstream/shared-types';
import { createMockProduct, generateMockUUID } from '../test/setup';

// =============================================================================
// Test Constants
// =============================================================================

const VALID_PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

// =============================================================================
// Mock Classes
// =============================================================================

class MockProductRepository {
  findProducts = jest.fn();
  findProductById = jest.fn();
  createProduct = jest.fn();
  updateProduct = jest.fn();
  deleteProductWithDependencyCheck = jest.fn();
}

// =============================================================================
// Test Suite: ProductService
// =============================================================================

describe('ProductService', () => {
  let service: ProductService;
  let repository: jest.Mocked<MockProductRepository>;

  // =============================================================================
  // Before Each
  // =============================================================================

  beforeEach(async () => {
    jest.clearAllMocks();

    repository = {
      findProducts: jest.fn(),
      findProductById: jest.fn(),
      createProduct: jest.fn(),
      updateProduct: jest.fn(),
      deleteProductWithDependencyCheck: jest.fn(),
    } as unknown as jest.Mocked<MockProductRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  // =============================================================================
  // Test Group: listProducts - 商品列表查询
  // =============================================================================

  describe('listProducts', () => {
    // -------------------------------------------------------------------------
    // BUG-041: page 参数无效时未正确验证
    // -------------------------------------------------------------------------

    it('BUG-041: page 小于 1 时应该抛出错误', async () => {
      await expect(
        service.listProducts({ page: 0 }),
      ).rejects.toThrow();
    });

    it('BUG-041: page 为负数时应该抛出错误', async () => {
      await expect(
        service.listProducts({ page: -1 }),
      ).rejects.toThrow();
    });

    it('BUG-041: page 为小数时应该抛出错误', async () => {
      await expect(
        service.listProducts({ page: 1.5 }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-042: page_size 参数无效时未正确验证
    // -------------------------------------------------------------------------

    it('BUG-042: page_size 小于 1 时应该抛出错误', async () => {
      await expect(
        service.listProducts({ page_size: 0 }),
      ).rejects.toThrow();
    });

    it('BUG-042: page_size 大于 100 时应该抛出错误', async () => {
      await expect(
        service.listProducts({ page_size: 101 }),
      ).rejects.toThrow();
    });

    it('BUG-042: page_size 为小数时应该抛出错误', async () => {
      await expect(
        service.listProducts({ page_size: 10.5 }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-043: 数据库查询失败时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-043: 数据库查询失败时应该抛出错误', async () => {
      repository.findProducts.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        service.listProducts({ page: 1, page_size: 20 }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    it('应该正确返回商品列表', async () => {
      const mockProducts = [
        createMockProduct({ id: VALID_PRODUCT_ID }),
        createMockProduct({ id: generateMockUUID() }),
      ];
      repository.findProducts.mockResolvedValue({
        items: mockProducts as never[],
        total: 2,
      });

      const result = await service.listProducts({ page: 1, page_size: 20 });

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.has_more).toBe(false);
    });

    it('应该正确处理分页', async () => {
      const mockProducts = [createMockProduct({ id: VALID_PRODUCT_ID })];
      repository.findProducts.mockResolvedValue({
        items: mockProducts as never[],
        total: 50,
      });

      const result = await service.listProducts({ page: 1, page_size: 20 });

      expect(result.has_more).toBe(true);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
    });

    it('应该正确处理空列表', async () => {
      repository.findProducts.mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await service.listProducts({ page: 1, page_size: 20 });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });

    it('应该使用默认分页参数', async () => {
      repository.findProducts.mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await service.listProducts({});

      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
    });

    it('应该正确处理 keyword 参数', async () => {
      repository.findProducts.mockResolvedValue({
        items: [],
        total: 0,
      });

      await service.listProducts({ page: 1, page_size: 20, keyword: '测试商品' });

      expect(repository.findProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: '测试商品',
        }),
      );
    });

    it('应该去除 keyword 的前后空格', async () => {
      repository.findProducts.mockResolvedValue({
        items: [],
        total: 0,
      });

      await service.listProducts({ page: 1, page_size: 20, keyword: '  测试商品  ' });

      expect(repository.findProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: '测试商品',
        }),
      );
    });
  });

  // =============================================================================
  // Test Group: getProductDetail - 商品详情查询
  // =============================================================================

  describe('getProductDetail', () => {
    // -------------------------------------------------------------------------
    // BUG-044: product_id 为空时未正确验证
    // -------------------------------------------------------------------------

    it('BUG-044: product_id 为空字符串时应该抛出错误', async () => {
      await expect(
        service.getProductDetail(''),
      ).rejects.toThrow();
    });

    it('BUG-044: product_id 全空格时应该抛出错误', async () => {
      await expect(
        service.getProductDetail('   '),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-045: 商品不存在时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-045: 商品不存在时应该抛出错误', async () => {
      repository.findProductById.mockResolvedValue(null);

      await expect(
        service.getProductDetail(VALID_PRODUCT_ID),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-046: 数据库查询失败时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-046: 数据库查询失败时应该抛出错误', async () => {
      repository.findProductById.mockRejectedValue(new Error('Database error'));

      await expect(
        service.getProductDetail(VALID_PRODUCT_ID),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    it('应该正确返回商品详情', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const result = await service.getProductDetail(VALID_PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(VALID_PRODUCT_ID);
    });

    it('应该去除 product_id 的前后空格', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      await service.getProductDetail(` ${VALID_PRODUCT_ID}  `);

      expect(repository.findProductById).toHaveBeenCalledWith(VALID_PRODUCT_ID);
    });
  });

  // =============================================================================
  // Test Group: createProduct - 创建商品
  // =============================================================================

  describe('createProduct', () => {
    // -------------------------------------------------------------------------
    // BUG-047: title 为空时未正确验证
    // -------------------------------------------------------------------------

    it('BUG-047: title 为空字符串时应该抛出错误', async () => {
      await expect(
        service.createProduct({ title: '', category: 'Other', selling_points: [] }),
      ).rejects.toThrow();
    });

    it('BUG-047: title 全空格时应该抛出错误', async () => {
      await expect(
        service.createProduct({ title: '   ', category: 'Other', selling_points: [] }),
      ).rejects.toThrow();
    });

    it('BUG-047: title 未提供时应该抛出错误', async () => {
      await expect(
        service.createProduct({ category: 'Other', selling_points: [] } as unknown as CreateProductRequest),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-048: 数据库创建失败时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-048: 数据库创建失败时应该抛出错误', async () => {
      repository.createProduct.mockRejectedValue(new Error('Database error'));

      await expect(
        service.createProduct({ title: '测试商品', category: 'Other', selling_points: [] }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    it('应该正确创建商品', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.createProduct.mockResolvedValue(mockProduct as never);

      const dto: CreateProductRequest = {
        title: '测试商品',
        category: '电子产品',
        selling_points: ['高品质', '高性价比'],
      };

      const result = await service.createProduct(dto);

      expect(result).toBeDefined();
      expect(result.title).toBe('测试商品');
    });

    it('应该自动生成 SKU 代码', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.createProduct.mockResolvedValue(mockProduct as never);

      const dto: CreateProductRequest = {
        title: '测试商品',
        category: 'Other',
        selling_points: [],
      };

      await service.createProduct(dto);

      expect(repository.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          skuCode: expect.stringMatching(/^SKU-AUTO-/),
        }),
      );
    });

    it('应该使用默认 category', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.createProduct.mockResolvedValue(mockProduct as never);

      const dto: CreateProductRequest = {
        title: '测试商品',
        category: 'Other',
        selling_points: [],
      };

      await service.createProduct(dto);

      expect(repository.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'Other',
        }),
      );
    });
  });

  // =============================================================================
  // Test Group: updateProduct - 更新商品
  // =============================================================================

  describe('updateProduct', () => {
    // -------------------------------------------------------------------------
    // BUG-049: product_id 为空时未正确验证
    // -------------------------------------------------------------------------

    it('BUG-049: product_id 为空字符串时应该抛出错误', async () => {
      await expect(
        service.updateProduct('', { title: '新标题' }),
      ).rejects.toThrow();
    });

    it('BUG-049: product_id 全空格时应该抛出错误', async () => {
      await expect(
        service.updateProduct('   ', { title: '新标题' }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-050: 没有提供任何更新字段时未正确验证
    // -------------------------------------------------------------------------

    it('BUG-050: 没有提供任何更新字段时应该抛出错误', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      await expect(
        service.updateProduct(VALID_PRODUCT_ID, {}),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-051: 商品不存在时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-051: 商品不存在时应该抛出错误', async () => {
      repository.findProductById.mockResolvedValue(null);

      await expect(
        service.updateProduct(VALID_PRODUCT_ID, { title: '新标题' }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-052: 提交的字段值与当前值一致时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-052: 提交的字段值与当前值一致时应该抛出错误', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        title: '测试商品',
      });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      await expect(
        service.updateProduct(VALID_PRODUCT_ID, { title: '测试商品' }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-053: 数据库更新失败时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-053: 数据库更新失败时应该抛出错误', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        title: '测试商品',
      });
      repository.findProductById.mockResolvedValue(mockProduct as never);
      repository.updateProduct.mockRejectedValue(new Error('Database error'));

      await expect(
        service.updateProduct(VALID_PRODUCT_ID, { title: '新标题' }),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    it('应该正确更新商品', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        title: '测试商品',
      });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const updatedProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        title: '新标题',
      });
      repository.updateProduct.mockResolvedValue(updatedProduct as never);

      const dto: UpdateProductRequest = {
        title: '新标题',
      };

      const result = await service.updateProduct(VALID_PRODUCT_ID, dto);

      expect(result).toBeDefined();
      expect(repository.updateProduct).toHaveBeenCalled();
    });

    it('应该正确处理 category 更新', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        category: '电子产品',
      });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const updatedProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        category: '服装',
      });
      repository.updateProduct.mockResolvedValue(updatedProduct as never);

      await service.updateProduct(VALID_PRODUCT_ID, { category: '服装' });

      expect(repository.updateProduct).toHaveBeenCalledWith(
        VALID_PRODUCT_ID,
        expect.objectContaining({
          category: '服装',
        }),
      );
    });
  });

  // =============================================================================
  // Test Group: deleteProduct - 删除商品
  // =============================================================================

  describe('deleteProduct', () => {
    // -------------------------------------------------------------------------
    // BUG-054: product_id 为空时未正确验证
    // -------------------------------------------------------------------------

    it('BUG-054: product_id 为空字符串时应该抛出错误', async () => {
      await expect(
        service.deleteProduct(''),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-055: 商品不存在时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-055: 商品不存在时应该抛出错误', async () => {
      repository.findProductById.mockResolvedValue(null);

      await expect(
        service.deleteProduct(VALID_PRODUCT_ID),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-056: 商品有关联资源时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-056: 商品有关联素材时应该抛出错误', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);
      repository.deleteProductWithDependencyCheck.mockResolvedValue({
        deleted: false,
        dependencies: { materials: 1, creations: 0, scripts: 0, templates: 0, viralAnalyses: 0 },
      });

      await expect(
        service.deleteProduct(VALID_PRODUCT_ID),
      ).rejects.toThrow();
    });

    it('BUG-056: 商品有关联创作时应该抛出错误', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);
      repository.deleteProductWithDependencyCheck.mockResolvedValue({
        deleted: false,
        dependencies: { materials: 0, creations: 1, scripts: 0, templates: 0, viralAnalyses: 0 },
      });

      await expect(
        service.deleteProduct(VALID_PRODUCT_ID),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // BUG-057: 数据库删除失败时未正确处理
    // -------------------------------------------------------------------------

    it('BUG-057: 数据库删除失败时应该抛出错误', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);
      repository.deleteProductWithDependencyCheck.mockRejectedValue(new Error('Database error'));

      await expect(
        service.deleteProduct(VALID_PRODUCT_ID),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    it('应该正确删除商品', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);
      repository.deleteProductWithDependencyCheck.mockResolvedValue({
        deleted: true,
        dependencies: { materials: 0, creations: 0, scripts: 0, templates: 0, viralAnalyses: 0 },
      });

      const result = await service.deleteProduct(VALID_PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(VALID_PRODUCT_ID);
    });
  });

  // =============================================================================
  // Test Group: mapProduct - 私有方法测试
  // =============================================================================

  describe('mapProduct', () => {
    it('应该正确映射商品数据', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        title: '测试商品',
        category: '电子产品',
      });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const result = await service.getProductDetail(VALID_PRODUCT_ID);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('测试商品');
      expect(result.category).toBe('电子产品');
    });

    it('应该正确处理 selling_points 数组', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        sellingPoints: ['高品质', '高性价比'],
      });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const result = await service.getProductDetail(VALID_PRODUCT_ID);

      expect(result.selling_points).toHaveLength(2);
    });

    it('应该正确处理空 selling_points', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        sellingPoints: [],
      });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const result = await service.getProductDetail(VALID_PRODUCT_ID);

      expect(result.selling_points).toEqual([]);
    });

    it('应该正确处理 null selling_points', async () => {
      const mockProduct = createMockProduct({
        id: VALID_PRODUCT_ID,
        sellingPoints: [],
      });
      // @ts-ignore -模拟数据库返回 null 的情况
      mockProduct.sellingPoints = null;
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const result = await service.getProductDetail(VALID_PRODUCT_ID);

      expect(result.selling_points).toEqual([]);
    });

    it('应该正确返回 created_at 格式', async () => {
      const mockProduct = createMockProduct({ id: VALID_PRODUCT_ID });
      repository.findProductById.mockResolvedValue(mockProduct as never);

      const result = await service.getProductDetail(VALID_PRODUCT_ID);

      expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});