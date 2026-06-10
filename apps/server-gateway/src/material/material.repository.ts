import { Injectable, Logger } from '@nestjs/common';
import { MaterialStatus, MaterialType, MaterialSourceType, MaterialSliceStatus as PrismaMaterialSliceStatus, PrismaClient, Prisma } from '@prisma/client';
import { HttpStatus } from '@nestjs/common';
import { serviceException } from '../common/service-exception';
import { InjectPrisma } from '@nestjs/prisma';
import { MaterialSliceStatus } from '@tikstream/shared-types';

export interface CreateMaterialParams {
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
  referenced_material_id?: string | null;
  reference_category?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMaterialSliceParams {
  material_id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  status: string;
  tags: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
}

export interface PersistResult {
  material: Record<string, unknown>;
  slices: Array<Record<string, unknown>>;
}

export type MaterialListSortField = 'created_at' | 'file_size_bytes' | 'duration_seconds' | 'usage_count';

export type MaterialListSortOrder = 'ASC' | 'DESC';

/** findMaterialById 查询返回类型（含 slices + product 关联） */
export type MaterialWithRelations = Prisma.MaterialGetPayload<{
  include: {
    slices: true;
    product: { select: { id: true; title: true; category: true; sellingPoints: true } };
  };
}>;

/** findProductById 查询返回类型 */
export type ProductRow = Prisma.ProductGetPayload<Record<string, never>>;

export interface MaterialListFilter {
  product_id: string;
  type?: string;
  status?: string;
  source_type?: string;
  file_name_contains?: string;
  keyword?: string;
  keyword_synonyms?: string[];
  created_at_gte?: Date;
  created_at_lte?: Date;
  sort_by: MaterialListSortField;
  sort_order: MaterialListSortOrder;
  limit: number;
  cursor?: string;
}

export interface DecodedCursor {
  id: string;
  sort_value: string | number;
  sort_field: MaterialListSortField;
}

export interface PaginatedMaterialResult {
  items: MaterialRow[];
  total_count: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface MaterialRow {
  id: string;
  productId: string;
  fileName: string;
  type: string;
  sourceType: string;
  originUrl: string;
  thumbnailUrl: string | null;
  fileSizeBytes: bigint;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  status: string;
  slicesCount: number;
  remark: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: string;
    title: string;
    category: string;
    sellingPoints: string[];
  } | null;
  _count?: {
    slices: number;
  };
}

@Injectable()
export class MaterialRepository {
  private readonly logger = new Logger(MaterialRepository.name);

  constructor(@InjectPrisma() private readonly prisma: PrismaClient) {}

  async persistMaterialWithSlices(
    materialParams: CreateMaterialParams,
    sliceParams: CreateMaterialSliceParams[],
  ): Promise<PersistResult> {
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount < maxRetries) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const material = await tx.material.upsert({
            where: { id: materialParams.id },
            create: {
              id: materialParams.id,
              productId: materialParams.product_id,
              fileName: materialParams.file_name,
              type: materialParams.type as MaterialType,
              sourceType: materialParams.source_type as MaterialSourceType,
              originUrl: materialParams.origin_url,
              thumbnailUrl: materialParams.thumbnail_url,
              fileSizeBytes: materialParams.file_size_bytes,
              durationSeconds: materialParams.duration_seconds,
              width: materialParams.width,
              height: materialParams.height,
              mimeType: materialParams.mime_type,
              status: materialParams.status as MaterialStatus,
              slicesCount: materialParams.slices_count,
              remark: materialParams.remark,
              createdAt: materialParams.created_at,
              updatedAt: materialParams.updated_at,
            },
            update: {
              productId: materialParams.product_id,
              fileName: materialParams.file_name,
              type: materialParams.type as MaterialType,
              sourceType: materialParams.source_type as MaterialSourceType,
              originUrl: materialParams.origin_url,
              thumbnailUrl: materialParams.thumbnail_url,
              fileSizeBytes: materialParams.file_size_bytes,
              durationSeconds: materialParams.duration_seconds,
              width: materialParams.width,
              height: materialParams.height,
              mimeType: materialParams.mime_type,
              status: materialParams.status as MaterialStatus,
              slicesCount: materialParams.slices_count,
              remark: materialParams.remark,
              updatedAt: new Date(),
            },
          });

          if (sliceParams.length > 0) {
            // 先删除该素材的所有旧切片（防止重复上传时残留数据导致 P2002）
            await tx.materialSlice.deleteMany({
              where: { materialId: materialParams.id },
            });

            await tx.materialSlice.createMany({
              data: sliceParams.map((p) => ({
                sliceId: p.slice_id,
                materialId: p.material_id,
                startTime: p.start_time,
                endTime: p.end_time,
                duration: p.duration,
                status: p.status as PrismaMaterialSliceStatus,
                tags: p.tags as any,
                createdAt: p.created_at,
                updatedAt: p.updated_at,
              })) as any,
            });
          }

          return material;
        });

        return {
          material: result as unknown as Record<string, unknown>,
          slices: sliceParams as unknown as Array<Record<string, unknown>>,
        };
      } catch (error) {
        const prismaError = error as Error & { code?: string };

        if (prismaError.code === 'P2002' && retryCount < maxRetries) {
          this.logger.warn(`Prisma P2002 unique constraint violation, retrying (${retryCount + 1}/${maxRetries})`);
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        this.logger.error(`Prisma persistence failed: code=${prismaError.code}, message=${prismaError.message}`);
        throw serviceException(
          {
            message: `persistence failed: ${prismaError.message}`,
            error: {
              code: prismaError.code || 'INTERNAL_SERVER_ERROR',
              details: { prisma_code: prismaError.code },
              retryable: prismaError.code === 'P1001' || prismaError.code === 'P2028',
            },
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    throw serviceException(
      {
        message: 'Persistence retry loop exhausted — all retry attempts failed',
        error: { code: 'PERSISTENCE_RETRY_EXHAUSTED', retryable: true },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async findMaterialById(
    materialId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<MaterialWithRelations | null> {
    const includeDeleted = options?.includeDeleted ?? false;
    return this.prisma.material.findUnique({
      where: {
        id: materialId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      include: {
        slices: includeDeleted
          ? true
          : { where: { deletedAt: null } },
        product: {
          select: {
            id: true,
            title: true,
            category: true,
            sellingPoints: true,
          },
        },
      },
    });
  }

  async findProductById(productId: string): Promise<ProductRow | null> {
    return this.prisma.product.findUnique({
      where: { id: productId },
    });
  }

  async updateSliceStatus(
    sliceId: string,
    update: {
      status: MaterialSliceStatus;
      stream_url?: string;
      key_frame_url?: string;
      dense_caption?: string;
      tags?: string;
      embedding_version?: string;
      updated_at: Date;
    },
  ) {
    const data: Prisma.MaterialSliceUpdateInput = {
      status: update.status as PrismaMaterialSliceStatus,
      updatedAt: update.updated_at,
    };

    if (update.stream_url !== undefined) {
      data.streamUrl = update.stream_url;
    }
    if (update.key_frame_url !== undefined) {
      data.keyFrameUrl = update.key_frame_url;
    }
    if (update.dense_caption !== undefined) {
      data.denseCaption = update.dense_caption;
    }
    if (update.tags !== undefined) {
      data.tags = update.tags;
    }
    if (update.embedding_version !== undefined) {
      data.embeddingVersion = update.embedding_version;
    }

    return this.prisma.materialSlice.update({
      where: { sliceId: sliceId },
      data,
    });
  }

  async findSlicesByMaterialId(materialId: string) {
    return this.prisma.materialSlice.findMany({
      where: { materialId: materialId },
      select: {
        sliceId: true,
        status: true,
        materialId: true,
      },
    });
  }

  async findSlicesByMaterialIds(materialIds: string[]) {
    return this.prisma.materialSlice.findMany({
      where: { materialId: { in: materialIds } },
      select: {
        sliceId: true,
      },
    });
  }

  async findSliceSfxUrls(sliceIds: string[]): Promise<Record<string, string>> {
    if (sliceIds.length === 0) return {};
    const rows = await this.prisma.materialSlice.findMany({
      where: { sliceId: { in: sliceIds }, sfxUrl: { not: null } },
      select: { sliceId: true, sfxUrl: true },
    });
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.sfxUrl) map[r.sliceId] = r.sfxUrl;
    }
    return map;
  }

  async findSlicesByProductId(productId: string, options?: {
    status?: PrismaMaterialSliceStatus;
    minDuration?: number;
    maxDuration?: number;
    limit?: number;
  }): Promise<Array<{
    id: string;
    sliceId: string;
    materialId: string;
    startTime: number;
    endTime: number;
    duration: number;
    streamUrl: string | null;
    keyFrameUrl: string | null;
    denseCaption: string | null;
    tags: Prisma.JsonValue;
    status: string;
  }>> {
    const { status, minDuration, maxDuration, limit = 50 } = options || {};

    const where: Prisma.MaterialSliceWhereInput = {
      material: { productId },
    };

    if (status) {
      where.status = status;
    }

    if (minDuration !== undefined || maxDuration !== undefined) {
      where.duration = {};
      if (minDuration !== undefined) {
        where.duration.gte = minDuration;
      }
      if (maxDuration !== undefined) {
        where.duration.lte = maxDuration;
      }
    }

    try {
      const slices = await this.prisma.materialSlice.findMany({
        where,
        take: limit,
        // Bug 44: 二级排序确保相同 createdAt 时结果稳定，为未来 cursor 分页预留
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          sliceId: true,
          materialId: true,
          startTime: true,
          endTime: true,
          duration: true,
          streamUrl: true,
          keyFrameUrl: true,
          denseCaption: true,
          tags: true,
          status: true,
        },
      });

      return slices.map((s) => ({
        id: s.id,
        sliceId: s.sliceId,
        materialId: s.materialId,
        startTime: Number(s.startTime),
        endTime: Number(s.endTime),
        duration: Number(s.duration),
        streamUrl: s.streamUrl,
        keyFrameUrl: s.keyFrameUrl,
        denseCaption: s.denseCaption,
        tags: s.tags,
        status: s.status,
      }));
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      this.logger.error(`findSlicesByProductId failed: code=${prismaError.code}, message=${prismaError.message}`);
      throw serviceException(
        {
          message: `Failed to fetch slices by product ID: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: prismaError.code },
            retryable:
              prismaError.code === 'P1001' ||
              prismaError.code === 'P2024' ||
              prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** 全局搜索已完成切片（不当 productId 过滤），供素材匹配兜底 */
  async findAllCompletedSlices(limit = 100): Promise<Array<{
    id: string;
    sliceId: string;
    materialId: string;
    startTime: number;
    endTime: number;
    duration: number;
    streamUrl: string | null;
    keyFrameUrl: string | null;
    denseCaption: string | null;
    tags: Prisma.JsonValue;
    status: string;
  }>> {
    try {
      const slices = await this.prisma.materialSlice.findMany({
        where: { status: 'COMPLETED' },
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          sliceId: true,
          materialId: true,
          startTime: true,
          endTime: true,
          duration: true,
          streamUrl: true,
          keyFrameUrl: true,
          denseCaption: true,
          tags: true,
          status: true,
        },
      });
      return slices.map((s) => ({
        id: s.id,
        sliceId: s.sliceId,
        materialId: s.materialId,
        startTime: Number(s.startTime),
        endTime: Number(s.endTime),
        duration: Number(s.duration),
        streamUrl: s.streamUrl,
        keyFrameUrl: s.keyFrameUrl,
        denseCaption: s.denseCaption,
        tags: s.tags,
        status: s.status,
      }));
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      this.logger.error(`findAllCompletedSlices failed: code=${prismaError.code}, message=${prismaError.message}`);
      return [];
    }
  }

  async updateMaterialStatus(
    materialId: string,
    status: MaterialStatus,
    options?: { expectedCurrentStatus?: MaterialStatus },
  ) {
    return this.prisma.material.update({
      where: {
        id: materialId,
        ...(options?.expectedCurrentStatus
          ? { status: options.expectedCurrentStatus }
          : {}),
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  async markMaterialJobFailed(materialId: string, errorMessage: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.materialSlice.updateMany({
        where: {
          materialId,
          status: {
            notIn: [PrismaMaterialSliceStatus.COMPLETED, PrismaMaterialSliceStatus.FAILED],
          },
        },
        data: {
          status: PrismaMaterialSliceStatus.FAILED,
          updatedAt: now,
        },
      });

      return tx.material.update({
        where: { id: materialId },
        data: {
          status: MaterialStatus.FAILED,
          remark: errorMessage,
          updatedAt: now,
        },
      });
    });
  }

  async findMaterialsPaginated(
    filter: MaterialListFilter,
    decodedCursor: DecodedCursor | null,
    includeDeleted = false,
  ): Promise<PaginatedMaterialResult> {
    const where = this.buildListWhere(filter, includeDeleted);
    const orderBy = this.buildListSortConfig(filter.sort_by, filter.sort_order);
    const cursorClause = decodedCursor ? { id: decodedCursor.id } : undefined;
    const skip = cursorClause ? 1 : 0;
    const take = filter.limit + 1;

    let items: MaterialRow[] = [];
    try {
      const queryArgs: Prisma.MaterialFindManyArgs = {
        where,
        orderBy,
        take,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              category: true,
              sellingPoints: true,
            },
          },
          _count: {
            select: {
              slices: true,
            },
          },
        },
      };

      if (cursorClause) {
        queryArgs.cursor = cursorClause;
        queryArgs.skip = skip;
      }

      items = (await this.prisma.material.findMany(queryArgs)) as unknown as MaterialRow[];
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      this.logger.error(
        `Prisma findMany failed: code=${prismaError.code}, message=${prismaError.message}`,
      );
      throw serviceException(
        {
          message: `Material list query failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: prismaError.code },
            retryable:
              prismaError.code === 'P1001' ||
              prismaError.code === 'P2028' ||
              prismaError.code === 'P2024',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let total_count = -1;
    try {
      total_count = await this.prisma.material.count({
        where,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `Material count query failed (non-blocking): ${err.message}`,
      );
      total_count = -1;
    }

    const has_more = items.length > filter.limit;
    if (has_more) {
      items = items.slice(0, filter.limit);
    }

    let next_cursor: string | null = null;
    if (has_more && items.length > 0) {
      const lastItem = items[items.length - 1];
      next_cursor = this.encodeCursor(lastItem, filter.sort_by);
    }

    return { items, total_count, has_more, next_cursor };
  }

  private buildListWhere(filter: MaterialListFilter, includeDeleted = false): Prisma.MaterialWhereInput {
    const where: Prisma.MaterialWhereInput = {
      productId: filter.product_id,
    };

    // 默认排除已删除的素材
    if (!includeDeleted) {
      where.deletedAt = null;
    }

    if (filter.type) {
      where.type = filter.type as MaterialType;
    }
    if (filter.status) {
      where.status = filter.status as MaterialStatus;
    }
    if (filter.source_type) {
      where.sourceType = filter.source_type as MaterialSourceType;
    }
    if (filter.file_name_contains) {
      where.fileName = {
        contains: filter.file_name_contains,
        mode: 'insensitive',
      };
    }
    // 关键词多路搜索：文件名 / 摘要 / 切片描述 / 切片标签（含同义词扩展）
    if (filter.keyword) {
      const terms = [filter.keyword, ...(filter.keyword_synonyms ?? [])];
      where.AND = [
        {
          OR: terms.flatMap((term) => [
            { fileName: { contains: term, mode: 'insensitive' } },
            { summary: { contains: term, mode: 'insensitive' } },
            { slices: { some: { denseCaption: { contains: term, mode: 'insensitive' } } } },
            { slices: { some: { tags: { path: [], string_contains: term } } } },
          ]),
        },
      ];
    }
    if (filter.created_at_gte || filter.created_at_lte) {
      const createdAtFilter: Prisma.DateTimeFilter = {};
      if (filter.created_at_gte) {
        createdAtFilter.gte = filter.created_at_gte;
      }
      if (filter.created_at_lte) {
        createdAtFilter.lte = filter.created_at_lte;
      }
      where.createdAt = createdAtFilter;
    }

    return where;
  }

  private buildListSortConfig(
    sort_by: MaterialListSortField,
    sort_order: MaterialListSortOrder,
  ): Prisma.MaterialOrderByWithRelationInput[] {
    const direction: Prisma.SortOrder = sort_order === 'ASC' ? 'asc' : 'desc';

    switch (sort_by) {
      case 'file_size_bytes':
        return [{ fileSizeBytes: direction }, { id: 'desc' }];
      case 'duration_seconds':
        return [{ durationSeconds: direction }, { id: 'desc' }];
      case 'created_at':
      default:
        return [{ createdAt: direction }, { id: 'desc' }];
    }
  }

  private encodeCursor(item: MaterialRow, sort_by: MaterialListSortField): string {
    let sortValue: string | number;
    switch (sort_by) {
      case 'created_at':
        sortValue = item.createdAt.toISOString();
        break;
      case 'file_size_bytes':
        sortValue = Number(item.fileSizeBytes);
        break;
      case 'duration_seconds':
        sortValue = item.durationSeconds ?? 0;
        break;
      default:
        sortValue = item.createdAt.toISOString();
    }

    const payload = { v: sortValue, i: item.id, sf: sort_by };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  decodeCursor(token: string, sort_by: MaterialListSortField): DecodedCursor | null {
    try {
      const jsonStr = Buffer.from(token, 'base64url').toString('utf-8');
      const parsed = JSON.parse(jsonStr);

      if (!parsed || typeof parsed !== 'object') {
        this.logger.warn(`Cursor decode failed: payload is not a valid object`);
        return null;
      }
      if (!parsed.i || typeof parsed.i !== 'string') {
        this.logger.warn(`Cursor decode failed: missing or invalid 'i' field`);
        return null;
      }
      if (parsed.v === undefined || parsed.v === null) {
        this.logger.warn(`Cursor decode failed: missing 'v' field`);
        return null;
      }
      if (parsed.sf && parsed.sf !== sort_by) {
        this.logger.warn(
          `Cursor decode failed: sort_field mismatch (encoded=${parsed.sf}, requested=${sort_by})`,
        );
        return null;
      }

      return {
        id: parsed.i,
        sort_value: parsed.v,
        sort_field: sort_by,
      };
    } catch (error) {
      this.logger.warn(
        `Cursor decode failed: token=${token.slice(0, 8)}..., error=${(error as Error).message}`,
      );
      return null;
    }
  }

  async deleteMaterialById(materialId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.materialSlice.deleteMany({
          where: { materialId: materialId },
        });
        await tx.material.delete({
          where: { id: materialId },
        });
      });

      this.logger.log(`Material and slices deleted: material_id=${materialId}`);
    } catch (error) {
      const prismaError = error as Error & { code?: string };

      if (prismaError.code === 'P2025') {
        throw serviceException(
          {
            message: `素材 ${materialId} 不存在或已被删除`,
            error: {
              code: 'MATERIAL_NOT_FOUND',
              details: { material_id: materialId },
              retryable: false,
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (prismaError.code === 'P2003') {
        throw serviceException(
          {
            message: `素材 ${materialId} 存在外键约束，无法删除`,
            error: {
              code: 'MATERIAL_DELETE_CONFLICT',
              details: { material_id: materialId, reason: 'foreign_key_constraint' },
              retryable: false,
            },
          },
          HttpStatus.CONFLICT,
        );
      }

      this.logger.error(
        `Material delete transaction failed: material_id=${materialId}, code=${prismaError.code}, message=${prismaError.message}`,
      );

      throw serviceException(
        {
          message: `Material delete failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: prismaError.code },
            retryable:
              prismaError.code === 'P1001' ||
              prismaError.code === 'P2024' ||
              prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findSlicesByIds(sliceIds: string[]): Promise<MaterialRow[]> {
    if (!sliceIds || sliceIds.length === 0) {
      return [];
    }

    try {
      const items = await this.prisma.materialSlice.findMany({
        where: {
          deletedAt: null,
          OR: [
            { id: { in: sliceIds } },
            { sliceId: { in: sliceIds } },
          ],
        },
        include: {
          material: {
            select: {
              id: true,
              fileName: true,
              type: true,
              productId: true,
            },
          },
        },
      });

      const idOrder = new Map(sliceIds.map((id, idx) => [id, idx]));
      items.sort((a, b) => {
        const idxA = idOrder.get(a.id) ?? idOrder.get(a.sliceId) ?? 999;
        const idxB = idOrder.get(b.id) ?? idOrder.get(b.sliceId) ?? 999;
        return idxA - idxB;
      });

      return items as unknown as MaterialRow[];
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      this.logger.error(`findSlicesByIds failed: code=${prismaError.code}, message=${prismaError.message}`);
      throw serviceException(
        {
          message: `Failed to fetch slices by IDs: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: prismaError.code },
            retryable:
              prismaError.code === 'P1001' ||
              prismaError.code === 'P2024' ||
              prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async searchSlicesByKeyword(
    pgWhere: Record<string, unknown>,
    limit: number,
    cursor?: string,
  ): Promise<{
    items: MaterialRow[];
    total_count: number;
    has_more: boolean;
    next_cursor: string | null;
  }> {
    const take = limit + 1;
    const skip = cursor ? 1 : 0;
    const cursorClause = cursor ? { sliceId: cursor } : undefined;

    const queryArgs: Prisma.MaterialSliceFindManyArgs = {
      where: pgWhere as Prisma.MaterialSliceWhereInput,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        material: {
          select: {
            id: true,
            fileName: true,
            type: true,
            productId: true,
          },
        },
      },
    };

    if (cursorClause) {
      queryArgs.cursor = cursorClause;
      queryArgs.skip = skip;
    }

    let items: MaterialRow[] = [];
    try {
      items = (await this.prisma.materialSlice.findMany(queryArgs)) as unknown as MaterialRow[];
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      this.logger.error(`searchSlicesByKeyword findMany failed: code=${prismaError.code}, message=${prismaError.message}`);
      throw serviceException(
        {
          message: `Keyword search failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: prismaError.code },
            retryable:
              prismaError.code === 'P1001' ||
              prismaError.code === 'P2024' ||
              prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let total_count = -1;
    try {
      total_count = await this.prisma.materialSlice.count({
        where: pgWhere,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Keyword search count query failed (non-blocking): ${err.message}`);
      total_count = -1;
    }

    const has_more = items.length > limit;
    if (has_more) {
      items = items.slice(0, limit);
    }

    let next_cursor: string | null = null;
    if (has_more && items.length > 0) {
      const lastItem = items[items.length - 1] as unknown as { sliceId: string };
      next_cursor = lastItem.sliceId;
    }

    return { items, total_count, has_more, next_cursor };
  }

  async resetMaterialForReprocess(materialId: string, sliceParams: CreateMaterialSliceParams[]): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // 检查素材当前状态，防止重置正在处理中的素材
        const existing = await tx.material.findUnique({
          where: { id: materialId },
          select: { status: true },
        });
        if (!existing) {
          throw serviceException(
            {
              message: `素材 ${materialId} 不存在或已被删除`,
              error: { code: 'MATERIAL_NOT_FOUND', retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        }
        if (existing.status === 'PROCESSING') {
          throw serviceException(
            {
              message: `素材 ${materialId} 正在处理中，无法重新处理`,
              error: { code: 'MATERIAL_PROCESSING_CONFLICT', retryable: false },
            },
            HttpStatus.CONFLICT,
          );
        }

        await tx.materialSlice.deleteMany({
          where: { materialId: materialId },
        });

        if (sliceParams.length > 0) {
          await tx.materialSlice.createMany({
            data: sliceParams.map((p) => ({
              sliceId: p.slice_id,
              materialId: p.material_id,
              startTime: p.start_time,
              endTime: p.end_time,
              duration: p.duration,
              status: p.status as PrismaMaterialSliceStatus,
              tags: p.tags as any,
              createdAt: p.created_at,
              updatedAt: p.updated_at,
            })) as any,
          });
        }

        await tx.material.update({
          where: { id: materialId },
          data: {
            status: 'PENDING',
            slicesCount: sliceParams.length,
            remark: null,
            updatedAt: new Date(),
          },
        });
      });

      this.logger.log(`Material reset for reprocess: material_id=${materialId}`);
    } catch (error) {
      const prismaError = error as Error & { code?: string };

      if (prismaError.code === 'P2025') {
        throw serviceException(
          {
            message: `素材 ${materialId} 不存在或已被删除`,
            error: {
              code: 'MATERIAL_NOT_FOUND',
              details: { material_id: materialId },
              retryable: false,
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      this.logger.error(
        `Material reset for reprocess failed: material_id=${materialId}, code=${prismaError.code}, message=${prismaError.message}`,
      );

      throw serviceException(
        {
          message: `Material reset for reprocess failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { prisma_code: prismaError.code },
            retryable:
              prismaError.code === 'P1001' ||
              prismaError.code === 'P2024' ||
              prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findSliceBySliceId(sliceId: string) {
    return this.prisma.materialSlice.findUnique({
      where: { sliceId },
      include: {
        material: {
          select: {
            id: true,
            productId: true,
            type: true,
            fileName: true,
          },
        },
      },
    });
  }

  async findCompletedSlicesForReindex(limit = 200, cursor?: string) {
    const take = limit + 1;
    const queryArgs: Parameters<typeof this.prisma.materialSlice.findMany>[0] = {
      where: {
        status: 'COMPLETED',
      },
      take,
      orderBy: { sliceId: 'asc' },
      include: {
        material: {
          select: {
            id: true,
            productId: true,
            type: true,
          },
        },
      },
    };

    if (cursor) {
      queryArgs.cursor = { sliceId: cursor };
      queryArgs.skip = 1;
    }

    const rows = await this.prisma.materialSlice.findMany(queryArgs);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].sliceId : null;

    return { items, hasMore, nextCursor };
  }

  // ========== 回收站功能 ==========

  /** 软删除素材（设置 deletedAt） */
  async softDeleteMaterial(materialId: string): Promise<void> {
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.materialSlice.updateMany({
          where: { materialId },
          data: { deletedAt: now },
        });
        await tx.material.update({
          where: { id: materialId },
          data: { deletedAt: now },
        });
      });
      this.logger.log(`Material soft-deleted: material_id=${materialId}`);
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      if (prismaError.code === 'P2025') {
        throw serviceException(
          {
            message: `素材 ${materialId} 不存在或已被删除`,
            error: { code: 'MATERIAL_NOT_FOUND', retryable: false },
          },
          HttpStatus.NOT_FOUND,
        );
      }
      this.logger.error(`Soft delete failed: material_id=${materialId}, code=${prismaError.code}`);
      throw serviceException(
        {
          message: `Soft delete failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: prismaError.code === 'P1001' || prismaError.code === 'P2024' || prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** 恢复已删除的素材 */
  async restoreMaterial(materialId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.materialSlice.updateMany({
          where: { materialId, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
        await tx.material.update({
          where: { id: materialId, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
      });
      this.logger.log(`Material restored: material_id=${materialId}`);
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      if (prismaError.code === 'P2025') {
        throw serviceException(
          {
            message: `素材 ${materialId} 不存在或未在回收站中`,
            error: { code: 'MATERIAL_NOT_FOUND', retryable: false },
          },
          HttpStatus.NOT_FOUND,
        );
      }
      this.logger.error(`Restore failed: material_id=${materialId}, code=${prismaError.code}`);
      throw serviceException(
        {
          message: `Restore failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: prismaError.code === 'P1001' || prismaError.code === 'P2024' || prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    async incrementSliceUsageCount(sliceId: string): Promise<void> { try { await this.prisma.materialSlice.update({ where: { sliceId }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } }); } catch (err: unknown) { this.logger.warn?.(`Failed to incrementUsageCount for slice ${sliceId}: ${(err as Error).message}`); } }

  async findMaterialsByIds(materialIds: string[]) {
    if (materialIds.length === 0) return [];
    const records = await this.prisma.material.findMany({ where: { id: { in: materialIds }, deletedAt: null }, include: { slices: { where: { status: 'COMPLETED', deletedAt: null }, take: 10 }, _count: { select: { slices: true } } } });
    return records.map(function(r) { return Object.assign({}, r, { fileName: r.fileName, slices: r.slices || [], slicesCount: r._count?.slices ?? r.slices.length }); });
  }

  async upsertSlice(materialId: string, sliceId: string, data: { start_time: number | undefined; end_time: number | undefined; duration: number | undefined; status: string; tags: string | string[] | undefined; created_at?: Date; updated_at: Date; dense_caption?: string; stream_url?: string; key_frame_url?: string; sfx_url?: string; crop_region?: { x: number; y: number; width: number; height: number }; product_dimension_tags?: string[]; video_dimension_tags?: string[]; slice_dimension_tags?: string[]; }): Promise<void> {
    let tagArray: string[];
    if (Array.isArray(data.tags)) {
      tagArray = data.tags;
    } else {
      try {
        tagArray = JSON.parse(data.tags || '[]');
      } catch {
        this.logger.warn(
          `Failed to parse tags for slice ${sliceId}, raw value: ${JSON.stringify(data.tags)}`,
        );
        if (typeof data.tags === 'string' && data.tags.trim().length > 0) {
          tagArray = data.tags.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        } else {
          tagArray = [];
        }
      }
    }
    const cr = data.crop_region;
    await this.prisma.materialSlice.upsert({ where: { sliceId }, create: { sliceId, materialId, startTime: Number(data.start_time ?? 0), endTime: Number(data.end_time ?? 0), duration: Number(data.duration ?? 0), status: (data.status ?? 'PENDING') as PrismaMaterialSliceStatus, tags: tagArray, productDimensionTags: data.product_dimension_tags ?? [], videoDimensionTags: data.video_dimension_tags ?? [], sliceDimensionTags: data.slice_dimension_tags ?? [], denseCaption: data.dense_caption || null, streamUrl: data.stream_url || null, keyFrameUrl: data.key_frame_url || null, sfxUrl: data.sfx_url || null, cropRegionX: cr?.x ?? null, cropRegionY: cr?.y ?? null, cropRegionW: cr?.width ?? null, cropRegionH: cr?.height ?? null, createdAt: data.created_at, updatedAt: data.updated_at }, update: { materialId, startTime: Number(data.start_time ?? 0), endTime: Number(data.end_time ?? 0), duration: Number(data.duration ?? 0), status: (data.status ?? 'PENDING') as PrismaMaterialSliceStatus, tags: tagArray, productDimensionTags: data.product_dimension_tags ?? [], videoDimensionTags: data.video_dimension_tags ?? [], sliceDimensionTags: data.slice_dimension_tags ?? [], denseCaption: data.dense_caption || null, streamUrl: data.stream_url || null, keyFrameUrl: data.key_frame_url || null, sfxUrl: data.sfx_url || null, cropRegionX: cr?.x ?? null, cropRegionY: cr?.y ?? null, cropRegionW: cr?.width ?? null, cropRegionH: cr?.height ?? null, updatedAt: data.updated_at } });
  }

  async deletePendingSlicesForMaterial(materialId: string): Promise<number> { const r = await this.prisma.materialSlice.deleteMany({ where: { materialId, status: 'PENDING' } }); return r.count; }

  async findStalePendingMaterials(staleThreshold: Date, limit: number): Promise<Array<{ id: string; fileName: string; createdAt: Date }>> { return this.prisma.material.findMany({ where: { status: 'PENDING', createdAt: { lt: staleThreshold }, deletedAt: null }, select: { id: true, fileName: true, createdAt: true }, take: limit }); }

  async findDeletedMaterialIdsByProduct(productId: string): Promise<string[]> { const rows = await this.prisma.material.findMany({ where: { productId, deletedAt: { not: null } }, select: { id: true } }); return rows.map(function(r) { return r.id; }); }

  async countDeletedMaterials(productId: string): Promise<number> { return this.prisma.material.count({ where: { productId, deletedAt: { not: null } } }); }

  async batchDeleteMaterialsByIds(materialIds: string[]): Promise<number> { const r = await this.prisma.$transaction(async (tx) => { await tx.materialSlice.deleteMany({ where: { materialId: { in: materialIds } } }); return tx.material.deleteMany({ where: { id: { in: materialIds } } }); }); return r.count; }

  async createUserSearchLog(data: { query: string; hitCount: number; userId?: string; source?: string; }): Promise<void> { try { await this.prisma.userSearchLog.create({ data: { query: data.query, hitCount: data.hitCount, userId: data.userId || null, source: data.source || 'material_search' } }); } catch (err) { this.logger.warn(`UserSearchLog write failed: ${(err as Error)?.message || err}`); } }

  async updateMaterialSummary(materialId: string, summary: string): Promise<void> { await this.prisma.material.update({ where: { id: materialId }, data: { summary: summary } }); }

  async updateMaterialVisionAnalysis(materialId: string, visionAnalysisJson: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.material.update({ where: { id: materialId }, data: { visionAnalysisJson } as any });
  }

  async createSimpleMaterial(data: { id: string; productId: string; fileName: string; originUrl: string; fileSizeBytes: number; mimeType: string; type?: string; sourceType?: string; status?: string; durationSeconds?: number; width?: number; height?: number; }): Promise<Record<string, unknown>> {
    const record = await this.prisma.material.create({ data: { id: data.id, productId: data.productId, fileName: data.fileName, originUrl: data.originUrl, type: (data.type || 'VIDEO') as any, sourceType: (data.sourceType || 'GENERATED') as any, status: (data.status || 'COMPLETED') as any, mimeType: data.mimeType, fileSizeBytes: BigInt(data.fileSizeBytes), durationSeconds: data.durationSeconds ?? undefined, width: data.width ?? undefined, height: data.height ?? undefined, createdAt: new Date(), updatedAt: new Date() } });
    return record as Record<string, unknown>;
  }

/** 永久删除素材（包括切片和 MinIO 对象） */
  async permanentDeleteMaterial(materialId: string): Promise<{
    materialFiles: string[];
    sliceFiles: string[];
  }> {
    try {
      // 获取素材和切片信息用于清理存储
      const material = await this.prisma.material.findUnique({
        where: { id: materialId },
        include: { slices: true },
      });

      if (!material) {
        throw serviceException(
          {
            message: `素材 ${materialId} 不存在`,
            error: { code: 'MATERIAL_NOT_FOUND', retryable: false },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const materialFiles: string[] = [];
      const sliceFiles: string[] = [];

      // 收集需要删除的文件路径
      if (material.originUrl) materialFiles.push(material.originUrl);
      if (material.thumbnailUrl) materialFiles.push(material.thumbnailUrl);
      for (const slice of material.slices) {
        if (slice.streamUrl) sliceFiles.push(slice.streamUrl);
        if (slice.keyFrameUrl) sliceFiles.push(slice.keyFrameUrl);
        if (slice.sfxUrl) sliceFiles.push(slice.sfxUrl);
      }

      // 从数据库删除
      await this.prisma.$transaction(async (tx) => {
        await tx.materialSlice.deleteMany({ where: { materialId } });
        await tx.material.delete({ where: { id: materialId } });
      });

      this.logger.log(`Material permanently deleted: material_id=${materialId}`);
      return { materialFiles, sliceFiles };
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      if (prismaError.code === 'P2025') {
        throw serviceException(
          {
            message: `素材 ${materialId} 不存在`,
            error: { code: 'MATERIAL_NOT_FOUND', retryable: false },
          },
          HttpStatus.NOT_FOUND,
        );
      }
      if (prismaError.code === 'P2003') {
        throw serviceException(
          {
            message: `素材 ${materialId} 存在外键约束，无法删除`,
            error: { code: 'MATERIAL_DELETE_CONFLICT', retryable: false },
          },
          HttpStatus.CONFLICT,
        );
      }
      this.logger.error(`Permanent delete failed: material_id=${materialId}, code=${prismaError.code}`);
      throw serviceException(
        {
          message: `Permanent delete failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: prismaError.code === 'P1001' || prismaError.code === 'P2024' || prismaError.code === 'P2028',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
