import { Injectable } from '@nestjs/common';
import { InjectPrisma } from '@nestjs/prisma';
import { PrismaClient, Prisma, Product } from '@prisma/client';

@Injectable()
export class ProductRepository {
  constructor(@InjectPrisma() private readonly prisma: PrismaClient) {}

  async findProducts(params: {
    page: number;
    pageSize: number;
    category?: string;
    keyword?: string;
  }): Promise<{ items: Product[]; total: number }> {
    const where = {
      ...(params.category ? { category: params.category } : {}),
      ...(params.keyword
        ? {
            OR: [
              { title: { contains: params.keyword, mode: 'insensitive' as const } },
              { skuCode: { contains: params.keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      total,
    };
  }

  async findProductById(productId: string): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    return record ?? null;
  }

  async createProduct(data: {
    id: string;
    title: string;
    skuCode: string;
    category: string;
    sellingPoints: string[];
    targetAudience?: string;
    scenarioTags?: string[];
    coverImageUrl?: string;
    color?: string;
    materialType?: string;
    sizeDesc?: string;
    usageScenario?: string;
    brand?: string;
    richFeatures?: Record<string, unknown>;
  }): Promise<Product> {
    const record = await this.prisma.product.create({
      data: {
        id: data.id,
        title: data.title,
        skuCode: data.skuCode,
        category: data.category,
        sellingPoints: data.sellingPoints,
        targetAudience: data.targetAudience ?? null,
        scenarioTags: data.scenarioTags ?? [],
        coverImageUrl: data.coverImageUrl ?? null,
        textFeatures: {},
        color: data.color ?? null,
        materialType: data.materialType ?? null,
        sizeDesc: data.sizeDesc ?? null,
        usageScenario: data.usageScenario ?? null,
        brand: data.brand ?? null,
        richFeatures: (data.richFeatures ?? {}) as Prisma.InputJsonValue,
      },
    });
    return record;
  }

  async updateProduct(
    productId: string,
    data: {
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
    },
  ): Promise<Product | null> {
    // 只构建有值的字段，避免用 undefined 覆盖已有数据
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.sellingPoints !== undefined) updateData.sellingPoints = data.sellingPoints;
    if (data.targetAudience !== undefined) updateData.targetAudience = data.targetAudience;
    if (data.scenarioTags !== undefined) updateData.scenarioTags = data.scenarioTags;
    if (data.coverImageUrl !== undefined) updateData.coverImageUrl = data.coverImageUrl;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.materialType !== undefined) updateData.materialType = data.materialType;
    if (data.sizeDesc !== undefined) updateData.sizeDesc = data.sizeDesc;
    if (data.usageScenario !== undefined) updateData.usageScenario = data.usageScenario;
    if (data.brand !== undefined) updateData.brand = data.brand;
    if (data.richFeatures !== undefined) updateData.richFeatures = data.richFeatures as Prisma.InputJsonValue;

    const record = await this.prisma.product.update({
      where: { id: productId },
      data: updateData,
    });
    return record;
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.prisma.product.delete({
      where: { id: productId },
    });
  }

  /**
   * 查找引用该 Product 的依赖记录数量
   * 用于删除前的外键约束检查
   */
  async findProductDependencies(productId: string): Promise<{
    materials: number;
    scripts: number;
    creations: number;
    templates: number;
    viralAnalyses: number;
  }> {
    const [materials, scripts, creations, templates, viralAnalyses] = await Promise.all([
      this.prisma.material.count({ where: { productId } }),
      this.prisma.script.count({ where: { productId } }),
      this.prisma.creation.count({ where: { productId } }),
      this.prisma.template.count({ where: { productId } }),
      this.prisma.viralVideoAnalysis.count({ where: { productId } }),
    ]);
    return { materials, scripts, creations, templates, viralAnalyses };
  }

  /**
   * 事务内原子执行依赖检查 + 删除，消除竞态窗口
   * 返回 { deleted: true } 表示成功删除，{ deleted: false } 表示存在依赖
   */
  async deleteProductWithDependencyCheck(productId: string): Promise<{
    deleted: boolean;
    dependencies: {
      materials: number;
      scripts: number;
      creations: number;
      templates: number;
      viralAnalyses: number;
    };
  }> {
    return this.prisma.$transaction(async (tx) => {
      const [materials, scripts, creations, templates, viralAnalyses] = await Promise.all([
        tx.material.count({ where: { productId } }),
        tx.script.count({ where: { productId } }),
        tx.creation.count({ where: { productId } }),
        tx.template.count({ where: { productId } }),
        tx.viralVideoAnalysis.count({ where: { productId } }),
      ]);

      if (materials > 0 || scripts > 0 || creations > 0 || templates > 0 || viralAnalyses > 0) {
        return { deleted: false, dependencies: { materials, scripts, creations, templates, viralAnalyses } };
      }

      await tx.product.delete({ where: { id: productId } });
      return { deleted: true, dependencies: { materials: 0, scripts: 0, creations: 0, templates: 0, viralAnalyses: 0 } };
    });
  }

  async getProductsStats(): Promise<Array<{
    productId: string;
    title: string;
    skuCode: string;
    category: string;
    coverImageUrl: string | null;
    imageCount: number;
    videoCount: number;
    totalSlices: number;
    totalMaterials: number;
  }>> {
    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        title: true,
        skuCode: true,
        category: true,
        coverImageUrl: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (products.length === 0) {
      return [];
    }

    const productIds = products.map((p) => p.id);

    const [materialCounts, sliceCounts] = await Promise.all([
      this.prisma.material.groupBy({
        by: ['productId', 'type'],
        where: { productId: { in: productIds } },
        _count: { id: true },
      }),
      this.prisma.material.findMany({
        where: { productId: { in: productIds } },
        select: {
          productId: true,
          _count: { select: { slices: true } },
        },
      }),
    ]);

    const materialCountMap = new Map<string, { image: number; video: number; total: number }>();
    for (const row of materialCounts) {
      let entry = materialCountMap.get(row.productId);
      if (!entry) {
        entry = { image: 0, video: 0, total: 0 };
        materialCountMap.set(row.productId, entry);
      }
      const count = row._count.id;
      if (row.type === 'VIDEO') {
        entry.video += count;
      } else {
        entry.image += count;
      }
      entry.total += count;
    }

    const sliceCountMap = new Map<string, number>();
    for (const row of sliceCounts) {
      sliceCountMap.set(row.productId, row._count.slices);
    }

    return products.map((p) => {
      const mc = materialCountMap.get(p.id);
      return {
        productId: p.id,
        title: p.title,
        skuCode: p.skuCode,
        category: p.category,
        coverImageUrl: p.coverImageUrl,
        imageCount: mc?.image ?? 0,
        videoCount: mc?.video ?? 0,
        totalSlices: sliceCountMap.get(p.id) ?? 0,
        totalMaterials: mc?.total ?? 0,
      };
    });
  }
}
