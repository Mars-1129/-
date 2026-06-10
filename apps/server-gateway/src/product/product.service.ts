import { HttpStatus, HttpException, Injectable, Logger } from '@nestjs/common';
import { PaginatedData, Product as ApiProduct, CreateProductRequest, UpdateProductRequest, ProductStatsResponse } from '@tikstream/shared-types';
import { Product } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ProductRepository } from './product.repository';
import { serviceException } from '../common/service-exception';
import { resolvePublicAssetUrl } from '../utils/public-asset-url';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(private readonly repository: ProductRepository) {}

  async listProducts(query: {
    page?: number;
    page_size?: number;
    category?: string;
    keyword?: string;
  }): Promise<PaginatedData<ApiProduct>> {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.page_size ?? 20);

    if (!Number.isInteger(page) || page <= 0) {
      throw serviceException(
        {
          message: 'page 必须是大于 0 的整数',
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
            details: [{ field: 'page', reason: 'page 必须是大于 0 的整数' }],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 100) {
      throw serviceException(
        {
          message: 'page_size 必须是 1~100 的整数',
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
            details: [{ field: 'page_size', reason: 'page_size 必须是 1~100 的整数' }],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 尝试从数据库查询
    let items: ApiProduct[] = [];
    let total = 0;

    try {
      const result = await this.repository.findProducts({
        page,
        pageSize,
        category: query.category,
        keyword: query.keyword?.trim() || undefined,
      });
      items = result.items.map((item) => this.mapProduct(item));
      total = result.total;
    } catch (error) {
      const err = error as Error & { code?: string };
      this.logger.error(`Database query failed for products: ${err.message}`, err.stack);
      throw serviceException(
        {
          message: '商品列表查询失败，请稍后重试',
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: err.code, original_message: err.message },
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      items,
      page,
      page_size: pageSize,
      total,
      has_more: page * pageSize < total,
    };
  }

  async getProductDetail(productId: string): Promise<ApiProduct> {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: 'product_id 为必填字段',
          error: {
            code: 'INVALID_REQUEST',
            retryable: false,
            details: [{ field: 'product_id', reason: 'product_id 为必填字段' }],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanId = productId.trim();

    // 从数据库查询
    try {
      const record = await this.repository.findProductById(cleanId);
      if (record) {
        return this.mapProduct(record);
      }
    } catch (error) {
      const err = error as Error & { code?: string };
      this.logger.error(`Database query failed for product detail: ${err.message}`, err.stack);
      throw serviceException(
        {
          message: '商品详情查询失败，请稍后重试',
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: err.code, original_message: err.message },
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    throw serviceException(
      {
        message: '商品不存在',
        error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
      },
      HttpStatus.NOT_FOUND,
    );
  }

  private mapProduct(record: Product): ApiProduct {
    return {
      id: String(record.id),
      title: String(record.title ?? ''),
      sku_code: String(record.skuCode ?? ''),
      category: String(record.category ?? ''),
      selling_points: Array.isArray(record.sellingPoints)
        ? (record.sellingPoints as string[]).map((value: string) => String(value))
        : [],
      target_audience: record.targetAudience ? String(record.targetAudience) : undefined,
      scenario_tags: Array.isArray(record.scenarioTags)
        ? (record.scenarioTags as string[]).map((value: string) => String(value))
        : [],
      text_features:
        record.textFeatures && typeof record.textFeatures === 'object'
          ? (record.textFeatures as Record<string, unknown>)
          : {},
      cover_image_url: resolvePublicAssetUrl(record.coverImageUrl ? String(record.coverImageUrl) : null),
      color: record.color ? String(record.color) : undefined,
      material_type: record.materialType ? String(record.materialType) : undefined,
      size_desc: record.sizeDesc ? String(record.sizeDesc) : undefined,
      usage_scenario: record.usageScenario ? String(record.usageScenario) : undefined,
      brand: record.brand ? String(record.brand) : undefined,
      rich_features:
        record.richFeatures && typeof record.richFeatures === 'object'
          ? (record.richFeatures as Record<string, unknown>)
          : {},
      created_at: record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : new Date(String(record.createdAt ?? '')).toISOString(),
      updated_at: record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : new Date(String(record.updatedAt ?? '')).toISOString(),
    };
  }

  async createProduct(dto: CreateProductRequest): Promise<ApiProduct> {
    if (!dto.title?.trim()) {
      throw serviceException(
        {
          message: '商品标题为必填字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const id = randomUUID();
    const skuCode = `SKU-AUTO-${id.slice(0, 8).toUpperCase()}`;

    try {
      const record = await this.repository.createProduct({
        id,
        title: dto.title.trim(),
        skuCode,
        category: dto.category?.trim() || 'Other',
        sellingPoints: dto.selling_points ?? [],
        targetAudience: dto.target_audience,
        scenarioTags: dto.scenario_tags,
        coverImageUrl: dto.cover_image_url,
        color: dto.color,
        materialType: dto.material_type,
        sizeDesc: dto.size_desc,
        usageScenario: dto.usage_scenario,
        brand: dto.brand,
        richFeatures: dto.rich_features,
      });

      this.logger.log(`Product created: id=${id}, title=${dto.title}, category=${dto.category}`);
      return this.mapProduct(record);
    } catch (error) {
      // 若上游已抛 serviceException（如 BUSINESS 校验），直接传播，避免重复包裹
      if (typeof error === 'object' && error !== null && 'response' in error) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create product: ${msg}`);
      throw serviceException(
        {
          message: '创建商品失败，请稍后重试',
          error: { code: 'PRODUCT_CREATE_FAILED', retryable: true },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProduct(productId: string, dto: UpdateProductRequest): Promise<ApiProduct> {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: 'product_id 为必填',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanId = productId.trim();

    // 校验至少有一个字段需要更新
    const hasUpdate =
      dto.title !== undefined ||
      dto.category !== undefined ||
      dto.selling_points !== undefined ||
      dto.target_audience !== undefined ||
      dto.scenario_tags !== undefined ||
      dto.cover_image_url !== undefined ||
      dto.color !== undefined ||
      dto.material_type !== undefined ||
      dto.size_desc !== undefined ||
      dto.usage_scenario !== undefined ||
      dto.brand !== undefined ||
      dto.rich_features !== undefined;

    if (!hasUpdate) {
      throw serviceException(
        {
          message: '请至少提供一个需要更新的字段',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 校验 product 是否存在
    const existing = await this.repository.findProductById(cleanId);
    if (!existing) {
      throw serviceException(
        {
          message: '商品不存在',
          error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 构建只包含实际值变化的字段，避免无意义的 DB 写入
    const updateData: Record<string, unknown> = {};

    if (dto.title !== undefined && dto.title?.trim() !== existing.title) {
      updateData.title = dto.title.trim();
    }
    if (dto.category !== undefined && dto.category?.trim() !== existing.category) {
      updateData.category = dto.category.trim();
    }
    if (dto.selling_points !== undefined && JSON.stringify(dto.selling_points ?? []) !== JSON.stringify(existing.sellingPoints ?? [])) {
      updateData.sellingPoints = dto.selling_points ?? [];
    }
    if (dto.target_audience !== undefined) {
      const newVal = dto.target_audience === null ? null : dto.target_audience?.trim() ?? null;
      if (newVal !== (existing.targetAudience ?? null)) {
        updateData.targetAudience = newVal;
      }
    }
    if (dto.scenario_tags !== undefined && JSON.stringify(dto.scenario_tags ?? []) !== JSON.stringify(existing.scenarioTags ?? [])) {
      updateData.scenarioTags = dto.scenario_tags ?? [];
    }
    if (dto.cover_image_url !== undefined && (dto.cover_image_url === null ? null : dto.cover_image_url) !== (existing.coverImageUrl ?? null)) {
      updateData.coverImageUrl = dto.cover_image_url === null ? null : dto.cover_image_url;
    }
    if (dto.color !== undefined && (dto.color === null ? null : dto.color) !== (existing.color ?? null)) {
      updateData.color = dto.color === null ? null : dto.color;
    }
    if (dto.material_type !== undefined && (dto.material_type === null ? null : dto.material_type) !== (existing.materialType ?? null)) {
      updateData.materialType = dto.material_type === null ? null : dto.material_type;
    }
    if (dto.size_desc !== undefined && (dto.size_desc === null ? null : dto.size_desc) !== (existing.sizeDesc ?? null)) {
      updateData.sizeDesc = dto.size_desc === null ? null : dto.size_desc;
    }
    if (dto.usage_scenario !== undefined && (dto.usage_scenario === null ? null : dto.usage_scenario) !== (existing.usageScenario ?? null)) {
      updateData.usageScenario = dto.usage_scenario === null ? null : dto.usage_scenario;
    }
    if (dto.brand !== undefined && (dto.brand === null ? null : dto.brand) !== (existing.brand ?? null)) {
      updateData.brand = dto.brand === null ? null : dto.brand;
    }
    if (dto.rich_features !== undefined && JSON.stringify(dto.rich_features ?? {}) !== JSON.stringify(existing.richFeatures ?? {})) {
      updateData.richFeatures = dto.rich_features ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      throw serviceException(
        {
          message: '提交的字段值与当前值一致，无需更新',
          error: { code: 'NO_CHANGE', retryable: false },
        },
        HttpStatus.CONFLICT,
      );
    }

    try {
      const record = await this.repository.updateProduct(cleanId, updateData as {
        title?: string;
        category?: string;
        sellingPoints?: string[];
        targetAudience?: string | null;
        scenarioTags?: string[];
        coverImageUrl?: string | null;
        color?: string | null;
        materialType?: string | null;
        sizeDesc?: string | null;
        usageScenario?: string | null;
        brand?: string | null;
        richFeatures?: Record<string, unknown>;
      });

      if (!record) {
        throw serviceException(
          {
            message: 'Product update returned null — record may not exist or has been deleted',
            error: { code: 'PRODUCT_UPDATE_FAILED', retryable: false },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      this.logger.log(`Product updated: id=${cleanId}, fields=${Object.keys(updateData).join(',')}`);
      return this.mapProduct(record);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update product: ${msg}`);
      throw serviceException(
        {
          message: '更新商品失败，请稍后重试',
          error: { code: 'PRODUCT_UPDATE_FAILED', retryable: true },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteProduct(productId: string): Promise<ApiProduct> {
    if (!productId || productId.trim().length === 0) {
      throw serviceException(
        {
          message: 'product_id 为必填',
          error: { code: 'INVALID_REQUEST', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanId = productId.trim();

    // 检查 product 是否存在
    const existing = await this.repository.findProductById(cleanId);
    if (!existing) {
      throw serviceException(
        {
          message: '商品不存在',
          error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      // 事务内原子检查依赖 + 删除，消除竞态窗口
      const deleteResult = await this.repository.deleteProductWithDependencyCheck(cleanId);
      if (!deleteResult.deleted) {
        const deps = deleteResult.dependencies;
        const depMessages: string[] = [];
        if (deps.materials > 0) depMessages.push(`${deps.materials} 个素材`);
        if (deps.creations > 0) depMessages.push(`${deps.creations} 个创作任务`);
        if (deps.scripts > 0) depMessages.push(`${deps.scripts} 个剧本`);
        if (deps.templates > 0) depMessages.push(`${deps.templates} 个模板`);
        if (deps.viralAnalyses > 0) depMessages.push(`${deps.viralAnalyses} 个热门分析`);

        throw serviceException(
          {
            message: `无法删除：该商品被以下资源引用：${depMessages.join('、')}`,
            error: {
              code: 'PRODUCT_HAS_DEPENDENCIES',
              retryable: false,
              details: deps,
            },
          },
          HttpStatus.CONFLICT,
        );
      }

      const productInfo = this.mapProduct(existing);
      this.logger.log(`Product deleted: id=${cleanId}, title=${productInfo.title}`);
      return productInfo;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete product: ${msg}`);
      throw serviceException(
        {
          message: '删除商品失败，请稍后重试',
          error: { code: 'PRODUCT_DELETE_FAILED', retryable: true },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getProductStats(): Promise<ProductStatsResponse> {
    try {
      const stats = await this.repository.getProductsStats();
      return {
        products: stats.map((s) => ({
          product_id: s.productId,
          product_title: s.title,
          sku_code: s.skuCode,
          category: s.category,
          cover_image_url: resolvePublicAssetUrl(s.coverImageUrl),
          image_count: s.imageCount,
          video_count: s.videoCount,
          total_slices: s.totalSlices,
          total_materials: s.totalMaterials,
        })),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get product stats: ${msg}`);
      throw serviceException(
        {
          message: '获取商品统计失败，请稍后重试',
          error: { code: 'INTERNAL_SERVER_ERROR', retryable: true },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
