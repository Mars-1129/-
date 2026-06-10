import { Injectable, Logger, Inject, Optional, HttpException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import Redis from 'ioredis';
import { createWriteStream, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { MaterialSliceStatus } from '@tikstream/shared-types';
import { MinioClientService, MinioUploadParams } from '../../services/storage/minio-client.service';
import { MediaProbeService, VideoMetadata } from '../../services/media/media-probe.service';
import { ThumbnailService, ThumbnailResult } from '../../services/media/thumbnail.service';
import { MaterialRepository, CreateMaterialParams, CreateMaterialSliceParams, MaterialListFilter, DecodedCursor, MaterialRow, PaginatedMaterialResult, MaterialListSortField, MaterialListSortOrder } from './material.repository';
import { ProductRepository } from '../product/product.repository';
import { UploadMaterialDto } from './dto/upload-material.dto';
import { ListMaterialsDto } from './dto/list-materials.dto';
import { SearchMaterialsDto } from './dto/search-materials.dto';
import { MATERIAL_CONSTANTS } from './material.constants';
import { rewriteMinioPublicUrl } from '../utils/public-asset-url';
import { QUEUE_CONSTANTS } from '../../services/queue/queue.constants';
import { serviceException } from '../common/service-exception';
import { QdrantClientService } from '../../services/ai/qdrant-client.service';
import { ImageBindClientService } from '../../services/ai/imagebind-client.service';
import { ProductRecognitionProvider } from '../../services/ai/product-recognition.provider';
import { SynonymService } from '../services/synonym/synonym.service';
import { fireAndForget } from '../common/async-utils';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { SiliconFlowVisionProvider, VisionAnalysisResult, ImageCaptionResult } from '../../services/ai/siliconflow-vision.provider';

export interface MaterialUploadResponse {
  material_id: string;
  product_id: string;
  file_name: string;
  type: string;
  source_type: string;
  status: string;
  thumbnail_url?: string;
  file_size_bytes: number;
  async_task_id: string;
  /** AI 生成的稠密描述 (图片上传时同步返回，视频上传时初始为空) */
  dense_caption?: string;
  /** AI 生成的标签 (图片上传时同步返回，视频上传时初始为空) */
  tags?: string[];
  created_at: string;
}

interface ObjectKeyPair {
  origin_key: string;
  thumb_key: string;
}

interface MaterialSliceBoundary {
  sliceId: string;
  startTime: number;
  endTime: number;
  duration: number;
}

interface EnqueueResult {
  jobId: string;
  taskId: string;
}

/** Extended MaterialRow with optional reference fields from Prisma include */
type MaterialRowWithRef = MaterialRow & {
  referencedMaterialId?: string | null;
  referenceCategory?: string | null;
};

export interface SliceCallbackRequest {
  material_id: string;
  slice_id: string;
  status: MaterialSliceStatus;
  stream_url?: string;
  key_frame_url?: string;
  dense_caption?: string;
  tags?: string[];
  start_time?: number;
  end_time?: number;
  duration?: number;
  sfx_url?: string;
  crop_region?: { x: number; y: number; width: number; height: number };
  trace_id: string;
}

export interface MaterialJobFailureCallbackRequest {
  material_id: string;
  status: 'FAILED';
  error_message: string;
  trace_id: string;
}

export interface MaterialListItem {
  material_id: string;
  file_name: string;
  type: string;
  source_type: string;
  status: string;
  origin_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  slices_count: number;
  product_title: string;
  product_category: string;
  referenced_material_id?: string | null;
  reference_category?: string | null;
  created_at: string;
}

export interface CursorPageInfo {
  cursor: string | null;
  has_more: boolean;
  total_count: number;
}

export interface MaterialListResponse {
  items: MaterialListItem[];
  page_info: CursorPageInfo;
}

export interface MaterialDetailItem {
  material_id: string;
  product_id: string;
  file_name: string;
  type: string;
  source_type: string;
  origin_url: string;
  thumbnail_url: string | null;
  file_size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  status: string;
  slices_count: number;
  remark: string | null;
  vision_analysis?: VisionAnalysisResult | null;
  created_at: string;
  updated_at: string;
  product: {
    id: string;
    title: string;
    category: string;
    selling_points: string[];
  } | null;
}

export interface MaterialDetailSlice {
  id: string;
  material_id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  dense_caption: string | null;
  tags: string[];
  product_dimension_tags: string[];
  video_dimension_tags: string[];
  slice_dimension_tags: string[];
  stream_url: string | null;
  key_frame_url: string | null;
  embedding_version: string | null;
  sfx_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MaterialDetailResponse {
  material: MaterialDetailItem;
  slices: MaterialDetailSlice[];
}

export interface MaterialSliceSearchResult {
  id: string;
  material_id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  dense_caption: string | null;
  tags: string[];
  product_dimension_tags: string[];
  video_dimension_tags: string[];
  slice_dimension_tags: string[];
  stream_url: string | null;
  key_frame_url: string | null;
  embedding_version: string | null;
  sfx_url: string | null;
  status: string;
  score: number | null;
  usage_count?: number;
  file_name?: string;
  type?: string;
  search_source?: string;
  /** hybrid 模式下的 material 级聚合数据 */
  material_data?: {
    id: string;
    file_name: string;
    type: string;
    status: string;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    slices_count: number;
    slices: MaterialSliceSearchResult[];
  };
  created_at: string;
  updated_at: string;
}

export interface MaterialSearchResponse {
  items: MaterialSliceSearchResult[];
  page_info: CursorPageInfo;
  search_source: string;
}

export interface MaterialReprocessResponse {
  material_id: string;
  task_id: string;
  status: string;
}

interface MaterialDetailRow {
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
  visionAnalysisJson?: VisionAnalysisResult | null;
  createdAt: Date;
  updatedAt: Date;
  slices?: MaterialDetailSliceRow[];
  product?: {
    id: string;
    title: string;
    category: string;
    sellingPoints: string[];
  } | null;
}

interface MaterialDetailSliceRow {
  id: string;
  materialId: string;
  sliceId: string;
  startTime: number;
  endTime: number;
  duration: number;
  denseCaption: string | null;
  tags: string[] | null;
  productDimensionTags: string[] | null;
  videoDimensionTags: string[] | null;
  sliceDimensionTags: string[] | null;
  streamUrl: string | null;
  keyFrameUrl: string | null;
  embeddingVersion: string | null;
  sfxUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MaterialSearchRow {
  id: string;
  materialId: string;
  sliceId: string;
  startTime: number;
  endTime: number;
  duration: number;
  denseCaption: string | null;
  tags: string[] | null;
  productDimensionTags: string[] | null;
  videoDimensionTags: string[] | null;
  sliceDimensionTags: string[] | null;
  streamUrl: string | null;
  keyFrameUrl: string | null;
  embeddingVersion: string | null;
  sfxUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  material?: {
    id: string;
    fileName: string;
    type: string;
    productId: string;
  };
}

const VALID_SLICE_STATUSES: readonly MaterialSliceStatus[] = [
  'PENDING',
  'CAPTIONING',
  'EMBEDDING',
  'COMPLETED',
  'FAILED',
];

@Injectable()
export class MaterialService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaterialService.name);
  private readonly redis: Redis;
  private static get orphanLogDir(): string {
    return join(
      process.env.MATERIAL_ORPHAN_LOG_DIR || tmpdir(),
      'tikstream',
      'orphans',
    );
  }
  /** 定时器 ID，用于 onModuleDestroy 清理 */
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: MaterialRepository,
    private readonly productRepo: ProductRepository,
    private readonly minio: MinioClientService,
    private readonly mediaProbe: MediaProbeService,
    private readonly thumbnailService: ThumbnailService,
    private readonly qdrant: QdrantClientService,
    private readonly imageBind: ImageBindClientService,
    private readonly productRecognition: ProductRecognitionProvider,
    private readonly synonym: SynonymService,
    private readonly doubaoText: DoubaoTextProvider,
    private readonly siliconflowVision: SiliconFlowVisionProvider,
    @Optional() @Inject('GPU_SLICING_QUEUE') private readonly gpuSlicingQueue: Queue | null,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    });
  }

  private isImageLikeType(type: string): boolean {
    return (MATERIAL_CONSTANTS.IMAGE_LIKE_TYPES as readonly string[]).includes(type);
  }

  private isVideoType(type: string): boolean {
    return (MATERIAL_CONSTANTS.VIDEO_TYPES as readonly string[]).includes(type);
  }

  async uploadMaterial(
    dto: UploadMaterialDto,
    file: Express.Multer.File | undefined,
  ): Promise<MaterialUploadResponse> {
    try {
      return await this.uploadMaterialInternal(dto, file);
    } catch (err) {
      // 如果已经是 serviceException 抛出的 HttpException，直接重新抛出
      if (err instanceof HttpException) {
        throw err;
      }
      // 未预期的内部异常，记录完整堆栈并返回 500
      const error = err as Error;
      this.logger.error(`uploadMaterial unexpected error: ${error.message}`, error.stack);
      throw serviceException(
        {
          message: '素材上传失败，请稍后重试',
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async uploadMaterialInternal(
    dto: UploadMaterialDto,
    file: Express.Multer.File | undefined,
  ): Promise<MaterialUploadResponse> {
    this.validateUploadFile(file, dto.type, dto.source_type);

    // REFERENCE 类型素材必须关联主素材、分类和来源 URL
    if (dto.source_type === 'REFERENCE') {
      if (!dto.reference_material_id) {
        throw serviceException(
          {
            message: '参考素材必须关联主素材（reference_material_id 必填）',
            error: {
              code: 'REFERENCE_MATERIAL_ID_REQUIRED',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!dto.reference_category) {
        throw serviceException(
          {
            message: '参考素材必须指定分类（reference_category 必填）',
            error: {
              code: 'REFERENCE_CATEGORY_REQUIRED',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!dto.origin_url || dto.origin_url.trim().length === 0) {
        throw serviceException(
          {
            message: '参考素材必须提供来源 URL（origin_url 必填）',
            error: {
              code: 'REFERENCE_ORIGIN_URL_REQUIRED',
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      try {
        const parsed = new URL(dto.origin_url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Invalid protocol');
        }
      } catch {
        throw serviceException(
          {
            message: `来源 URL 格式不合法: ${dto.origin_url}`,
            error: {
              code: 'REFERENCE_ORIGIN_URL_INVALID',
              details: { origin_url: dto.origin_url },
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const validatedFile = file as Express.Multer.File;

    // PRODUCT_MAIN_IMAGE 本质是图片类型，MIME 类型应为 image/*
    const expectedBaseType = this.isImageLikeType(dto.type) ? 'IMAGE' : 'VIDEO';
    const inferredType = this.inferMaterialType(validatedFile.mimetype, validatedFile.originalname);
    if (inferredType !== expectedBaseType) {
      throw serviceException(
        {
          message: MATERIAL_CONSTANTS.ERROR_MESSAGES.MIME_TYPE_MISMATCH,
          error: {
            code: 'FILE_FORMAT_NOT_SUPPORTED',
            details: { expected: dto.type, actual_mime: validatedFile.mimetype, actual_type: inferredType },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.validateProductExists(dto.product_id);

    let effectiveProductId = dto.product_id;

    // REFERENCE 素材需验证关联的主素材存在
    if (dto.reference_material_id) {
      await this.validateReferenceMaterialExists(dto.reference_material_id);
    }

    const materialId = this.generateMaterialId();

    const keys = this.generateObjectKey(materialId, validatedFile.originalname, expectedBaseType as 'IMAGE' | 'VIDEO');

    const originUrl = await this.uploadOriginToMinio({
      buffer: validatedFile.buffer,
      objectKey: keys.origin_key,
      mimeType: validatedFile.mimetype,
      fileSizeBytes: validatedFile.size,
    });

    // === 自动商品识别 (需求2+3): 上传完成后触发，可传 image_url 做 Vision 分析 ===
    if (!effectiveProductId && dto.auto_recognize_product) {
      try {
        const recognized = await this.productRecognition.recognize({
          file_name: validatedFile.originalname,
          file_type: expectedBaseType as 'IMAGE' | 'VIDEO',
          remark: dto.remark,
          // 传递图片 URL 以启用 Vision 视觉分析 (需求2)
          image_url: originUrl ?? undefined,
        });
        const product = await this.productRepo.createProduct({
          id: randomUUID(),
          title: recognized.title,
          skuCode: `SKU-AUTO-${randomUUID().slice(0, 8).toUpperCase()}`,
          category: recognized.category,
          sellingPoints: recognized.selling_points,
          color: recognized.color,
          materialType: recognized.material_type,
          sizeDesc: recognized.size_desc,
          usageScenario: recognized.usage_scenario,
          brand: recognized.brand,
          richFeatures: recognized.rich_features,
        });
        const productId = (product as Record<string, unknown>).id;
        if (!productId) {
          throw serviceException(
            {
              message: '商品创建成功但未返回有效产品ID',
              error: { code: 'PRODUCT_CREATION_FAILED', retryable: false },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        effectiveProductId = String(productId);
        this.logger.log(
          `Auto-recognized product: id=${effectiveProductId}, title=${recognized.title}, category=${recognized.category}` +
          (recognized.color ? `, color=${recognized.color}` : '') +
          (recognized.material_type ? `, material=${recognized.material_type}` : ''),
        );
      } catch (err) {
        this.logger.error(`Product auto-recognition failed: ${(err as Error).message}`);
        // Clean up the orphaned MinIO object since the file was already uploaded before recognition failed
        try {
          await this.minio.deleteObject(keys.origin_key);
          this.logger.log(`Cleaned up orphaned MinIO object: ${keys.origin_key}`);
        } catch (cleanupErr) {
          this.logger.warn(
            `Failed to clean up orphaned MinIO object ${keys.origin_key}: ${(cleanupErr as Error).message}`,
          );
        }
        throw serviceException(
          {
            message: '自动商品识别失败，请手动选择商品后重试',
            error: { code: 'PRODUCT_RECOGNITION_FAILED', retryable: false },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (!effectiveProductId) {
      throw serviceException(
        {
          message: 'product_id 为必填字段（或启用 auto_recognize_product 自动识别）',
          error: { code: 'PRODUCT_ID_REQUIRED', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let thumbnailUrl: string | undefined = undefined;
    try {
      const thumbResult = await this.thumbnailService.generate(
        validatedFile.buffer,
        validatedFile.mimetype,
      );
      thumbnailUrl = await this.uploadThumbnailToMinio(
        thumbResult.thumbnailBuffer,
        keys.thumb_key,
        thumbResult.thumbMimeType,
      );
    } catch (thumbnailError) {
      this.logger.warn(`Thumbnail generation/upload failed (non-blocking): ${(thumbnailError as Error).message}`);
      thumbnailUrl = undefined;
    }

    let durationSeconds: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let mimeType: string | null = validatedFile.mimetype;

    if (this.isVideoType(dto.type)) {
      const metadata = await this.probeVideoMetadata(validatedFile.buffer);
      durationSeconds = metadata.durationSeconds;
      width = metadata.width;
      height = metadata.height;
      mimeType = metadata.mimeType;

      if (!durationSeconds || durationSeconds <= 0) {
        throw serviceException(
          {
            message: '无法解析视频时长，请上传有效的 MP4/MOV/WebM 文件',
            error: {
              code: 'INVALID_VIDEO_FILE',
              details: { duration_seconds: durationSeconds },
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (durationSeconds > MATERIAL_CONSTANTS.MAX_VIDEO_DURATION_SECONDS) {
        throw serviceException(
          {
            message: `视频时长 ${durationSeconds.toFixed(1)}s 超过上限 ${MATERIAL_CONSTANTS.MAX_VIDEO_DURATION_SECONDS}s，请截取 15 秒以内片段后重新上传`,
            error: {
              code: 'VIDEO_DURATION_EXCEEDED',
              details: {
                duration_seconds: durationSeconds,
                max_duration_seconds: MATERIAL_CONSTANTS.MAX_VIDEO_DURATION_SECONDS,
              },
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    let slices: MaterialSliceBoundary[] = [];
    if (this.isVideoType(dto.type) && durationSeconds != null && durationSeconds > 0) {
      slices = this.computeInitialSliceBoundaries(durationSeconds, materialId);
    } else if (this.isImageLikeType(dto.type)) {
      slices = [
        {
          sliceId: this.buildSliceId(materialId, 1),
          startTime: 0,
          endTime: 0,
          duration: 0,
        },
      ];
    }

    await this.persistMaterialWithSlices(
      materialId,
      { ...dto, product_id: effectiveProductId },
      validatedFile,
      originUrl,
      thumbnailUrl,
      durationSeconds,
      width,
      height,
      mimeType,
      slices,
    );

    const enqueueResult = this.isVideoType(dto.type)
      ? await this.enqueueGpuSlicingJob(materialId, dto.qdrant_skip || false)
      : {
          jobId: 'image-skip-gpu',
          taskId: `tsk_${this.getCurrentDatePrefix()}_image`,
        };

    let materialStatus: 'PENDING' | 'COMPLETED' = 'PENDING';
    const firstSlice = slices[0];
    let aiResult: { dense_caption: string | null; tags: string[] } | undefined;
    if (this.isImageLikeType(dto.type) && firstSlice?.sliceId) {
      // 查商品上下文，用于 AI 图片分析
      let productContext: { product_title?: string; selling_points?: string[] } | undefined;
      try {
        const product = await this.productRepo.findProductById(effectiveProductId);
        if (product) {
          productContext = {
            product_title: product.title,
            selling_points: Array.isArray(product.sellingPoints)
              ? (product.sellingPoints as string[])
              : undefined,
          };
        }
      } catch (err) {
        this.logger.warn(`Failed to load product context for image material ${materialId}: ${(err as Error).message}`);
      }

      aiResult = await this.completeImageMaterial(
        materialId,
        firstSlice.sliceId,
        originUrl,
        validatedFile.originalname,
        thumbnailUrl,
        productContext,
      );
      materialStatus = 'COMPLETED';
    }

    return this.mapToMaterialUploadResponse(
      {
        id: materialId,
        product_id: effectiveProductId,
        file_name: validatedFile.originalname,
        type: dto.type,
        source_type: dto.source_type || 'UPLOAD',
        origin_url: originUrl,
        thumbnail_url: thumbnailUrl || null,
        file_size_bytes: validatedFile.size,
        duration_seconds: durationSeconds,
        width,
        height,
        mime_type: mimeType,
        status: materialStatus,
        slices_count: slices.length,
        created_at: new Date(),
      },
      enqueueResult.taskId,
      thumbnailUrl,
      aiResult,
    );
  }

  private async completeImageMaterial(
    materialId: string,
    sliceId: string,
    originUrl: string,
    fileName: string,
    thumbnailUrl?: string,
    productContext?: { product_title?: string; selling_points?: string[] },
  ): Promise<{ dense_caption: string | null; tags: string[]; product_features: string[] }> {
    const streamUrl = this.rewriteStorageUrl(originUrl) ?? originUrl;
    const keyFrameUrl = thumbnailUrl ? (this.rewriteStorageUrl(thumbnailUrl) ?? thumbnailUrl) : streamUrl;

    // AI 分析图片：生成 dense_caption + tags（失败时降级，不阻塞上传）
    const { dense_caption, tags, product_features } = await this.analyzeImageAndCaption(
      sliceId,
      streamUrl,
      fileName,
      productContext,
    );

    // product_features 合并到 tags 中统一存储，避免重复
    const allTags = [...new Set([...tags, ...product_features])];

    // 分类标签到三维度（产品/视频/切片），解锁关键字搜索的维度过滤
    const { productDimensionTags, videoDimensionTags, sliceDimensionTags } =
      this.classifyDimensionTags(allTags, product_features);

    // 写入切片记录（含 AI 分析结果 + 维度标签）
    await this.prisma.upsertSlice(materialId, sliceId, {
      status: 'COMPLETED',
      stream_url: streamUrl,
      key_frame_url: keyFrameUrl,
      dense_caption: dense_caption || undefined,
      tags: allTags.length > 0 ? allTags : [],
      product_dimension_tags: productDimensionTags,
      video_dimension_tags: videoDimensionTags,
      slice_dimension_tags: sliceDimensionTags,
      start_time: 0,
      end_time: 0,
      duration: 0,
      updated_at: new Date(),
    });

    await this.prisma.updateMaterialStatus(materialId, 'COMPLETED');

    fireAndForget(this.logger, 'indexSliceToQdrant', this.indexSliceToQdrant(sliceId));

    this.logger.log(
      `IMAGE material ${materialId} marked COMPLETED (slice ${sliceId})` +
      (dense_caption ? ` | caption: ${dense_caption.substring(0, 60)}...` : ' | no caption') +
      (allTags.length > 0 ? ` | tags: ${allTags.length}` : ''),
    );

    return { dense_caption, tags: allTags, product_features };
  }

  /**
   * 对图片素材执行 AI 分析，生成 dense_caption + tags
   * 复用 SiliconFlowVisionProvider 的多模态视觉模型
   * 失败时安全降级：返回空 caption 和空 tags，不抛异常
   */
  private async analyzeImageAndCaption(
    sliceId: string,
    streamUrl: string,
    fileName: string,
    context?: { product_title?: string; selling_points?: string[] },
  ): Promise<{ dense_caption: string | null; tags: string[]; product_features: string[] }> {
    try {
      // 将 MinIO 内网 URL 转为 base64 data URL，外部 API 可访问
      const imageInput = await this.prepareImageForVisionApi(streamUrl);

      const result = await this.siliconflowVision.generateImageCaption(imageInput, {
        product_title: context?.product_title,
        existing_selling_points: context?.selling_points,
        material_filename: fileName,
      });

      this.logger.log(
        `[IMAGE Caption] slice=${sliceId}: dense_caption=${result.dense_caption?.substring(0, 60)}..., tags=${result.tags?.length || 0} items, product_features=${result.product_features?.length || 0} items`,
      );

      return {
        dense_caption: result.dense_caption || null,
        tags: result.tags || [],
        product_features: result.product_features || [],
      };
    } catch (error) {
      this.logger.warn(
        `[IMAGE Caption] Failed for slice=${sliceId}: ${(error as Error).message}, completing without AI caption`,
      );
      return { dense_caption: null, tags: [], product_features: [] };
    }
  }

  /**
   * 将素材图片 URL 转为外部 API 可访问的格式
   * 如果 URL 指向 MinIO 内网地址，下载后转为 base64 data URL
   * 如果 URL 已是公网地址，直接返回
   */
  private async prepareImageForVisionApi(streamUrl: string): Promise<string> {
    const bucketName = process.env.MINIO_BUCKET_NAME || 'tikstream-assets';
    const prefix = `/${bucketName}/`;
    const idx = streamUrl.indexOf(prefix);

    if (idx === -1) {
      // 非 MinIO 地址，直接使用
      return streamUrl;
    }

    const objectKey = streamUrl.substring(idx + prefix.length);
    try {
      const { buffer, contentType } = await this.minio.getObject(objectKey);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;
      this.logger.log(`[IMAGE Caption] Converted MinIO object to data URL: ${objectKey} (${buffer.length} bytes)`);
      return dataUrl;
    } catch (err) {
      this.logger.warn(`[IMAGE Caption] Failed to download from MinIO, falling back to raw URL: ${(err as Error).message}`);
      return streamUrl;
    }
  }

  private validateUploadFile(
    file: Express.Multer.File | undefined,
    declaredType: string,
    sourceType?: string,
  ): void {
    if (!file) {
      throw serviceException(
        {
          message: MATERIAL_CONSTANTS.ERROR_MESSAGES.MATERIAL_FILE_MISSING,
          error: {
            code: 'MATERIAL_FILE_MISSING',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (file.size <= 0) {
      throw serviceException(
        {
          message: `上传文件为空或无效: ${file.size} bytes（至少需要 1 byte）`,
          error: {
            code: 'MATERIAL_FILE_MISSING',
            details: { file_size_bytes: file.size, min_required_bytes: 1 },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const mimeWhitelist: readonly string[] = MATERIAL_CONSTANTS.ALLOWED_MIME_TYPES;
    // 允许 application/octet-stream 通过，后续会根据文件扩展名推断实际类型
    if (!mimeWhitelist.includes(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      throw serviceException(
        {
          message: `${MATERIAL_CONSTANTS.ERROR_MESSAGES.FILE_FORMAT_NOT_SUPPORTED}: ${file.mimetype}`,
          error: {
            code: 'FILE_FORMAT_NOT_SUPPORTED',
            details: { provided_mimetype: file.mimetype, allowed: mimeWhitelist },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // MIME 类型与文件扩展名交叉校验
    const MIME_EXTENSION_MAP: Record<string, string[]> = {
      'video/mp4': ['.mp4'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    };
    const ext = extname(file.originalname).toLowerCase();
    const expectedExtensions = MIME_EXTENSION_MAP[file.mimetype];
    // 当 MIME 为 application/octet-stream 时，跳过扩展名交叉校验（已通过 inferMaterialType 验证）
    if (file.mimetype !== 'application/octet-stream') {
      if (!expectedExtensions || !expectedExtensions.includes(ext)) {
        const expectedInfo = expectedExtensions ? expectedExtensions.join(', ') : '未知';
        throw serviceException(
          {
            message: `文件扩展名 "${ext}" 与 MIME 类型 "${file.mimetype}" 不匹配，期望: ${expectedInfo}`,
            error: {
              code: 'FILE_EXTENSION_MISMATCH',
              details: {
                extension: ext,
                mimetype: file.mimetype,
                expected_extensions: expectedExtensions ?? [],
              },
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // 声明类型与扩展名对齐校验
    if (declaredType === 'VIDEO' && !ext.startsWith('.mp')) {
      throw serviceException(
        {
          message: `素材类型声明为 VIDEO，但文件扩展名 "${ext}" 非视频格式`,
          error: {
            code: 'DECLARED_TYPE_MISMATCH',
            details: {
              declared_type: declaredType,
              file_extension: ext,
              file_mimetype: file.mimetype,
            },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 参考素材有独立的大小限制
    const maxSize = sourceType === 'REFERENCE'
      ? MATERIAL_CONSTANTS.REFERENCE_MAX_BYTES
      : this.isImageLikeType(declaredType)
        ? MATERIAL_CONSTANTS.IMAGE_MAX_BYTES
        : MATERIAL_CONSTANTS.VIDEO_MAX_BYTES;
    if (file.size > maxSize) {
      throw serviceException(
        {
          message: `${MATERIAL_CONSTANTS.ERROR_MESSAGES.FILE_SIZE_EXCEEDED}: ${file.size} bytes (max: ${maxSize} bytes)`,
          error: {
            code: 'FILE_SIZE_EXCEEDED',
            details: { file_size_bytes: file.size, max_allowed_bytes: maxSize },
            retryable: false,
          },
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  private async validateProductExists(productId: string | undefined): Promise<void> {
    if (!productId) return; // 允许为空，由后续自动识别流程处理
    const product = await this.prisma.findProductById(productId);
    if (!product) {
      throw serviceException(
        {
          message: `${MATERIAL_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND}: ${productId}`,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            details: { product_id: productId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async validateReferenceMaterialExists(referenceMaterialId: string): Promise<void> {
    const material = await this.prisma.findMaterialById(referenceMaterialId);
    if (!material) {
      throw serviceException(
        {
          message: `关联的主素材 ${referenceMaterialId} 不存在`,
          error: {
            code: 'REFERENCE_MATERIAL_NOT_FOUND',
            details: { reference_material_id: referenceMaterialId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private inferMaterialType(mimeType: string, originalname?: string): 'IMAGE' | 'VIDEO' {
    if (mimeType.startsWith('image/')) {
      return 'IMAGE';
    }
    if (mimeType.startsWith('video/')) {
      return 'VIDEO';
    }
    // 当 MIME 类型为 application/octet-stream 或无法识别时，根据文件扩展名推断
    if (originalname) {
      const ext = extname(originalname).toLowerCase();
      const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
      const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
      if (IMAGE_EXTS.includes(ext)) return 'IMAGE';
      if (VIDEO_EXTS.includes(ext)) return 'VIDEO';
    }
    throw serviceException(
      {
        message: `${MATERIAL_CONSTANTS.ERROR_MESSAGES.FILE_FORMAT_NOT_SUPPORTED}: ${mimeType}`,
        error: {
          code: 'FILE_FORMAT_NOT_SUPPORTED',
          details: { mime_type: mimeType },
          retryable: false,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private generateMaterialId(): string {
    return randomUUID();
  }

  getCurrentDatePrefix(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  buildSliceId(materialId: string, seq: number, datePrefix?: string): string {
    const prefix = datePrefix ?? this.getCurrentDatePrefix();
    const materialKey = materialId.replace(/-/g, '');
    return `${MATERIAL_CONSTANTS.SLICE_ID_PREFIX}_${prefix}_${materialKey}_${String(seq).padStart(3, '0')}`;
  }

  private generateObjectKey(
    materialId: string,
    originalFileName: string,
    fileType: 'IMAGE' | 'VIDEO',
  ): ObjectKeyPair {
    const datePrefix = this.getCurrentDatePrefix();

    const sanitized = originalFileName
      .replace(MATERIAL_CONSTANTS.CHARACTER_FILTER_REGEX, '_')
      .replace(MATERIAL_CONSTANTS.EXTRA_CHARACTER_FILTER_REGEX, '_')
      .replace(MATERIAL_CONSTANTS.MULTI_UNDERSCORE_REGEX, '_')
      .replace(MATERIAL_CONSTANTS.LEADING_TRAILING_UNDERSCORE_REGEX, '');

    const ext = fileType === 'IMAGE' ? 'webp' : 'mp4';
    const actualExt = sanitized.includes('.')
      ? sanitized.split('.').pop() || ext
      : ext;

    const originKey = `${MATERIAL_CONSTANTS.OBJECT_KEY_PREFIX}/${datePrefix}/${materialId}/${sanitized}.${actualExt}`;
    const thumbKey = `${MATERIAL_CONSTANTS.OBJECT_KEY_PREFIX}/${datePrefix}/${materialId}/thumb.${MATERIAL_CONSTANTS.THUMBNAIL_EXTENSION}`;

    return { origin_key: originKey, thumb_key: thumbKey };
  }

  private async uploadOriginToMinio(params: MinioUploadParams): Promise<string> {
    try {
      return await this.minio.putObject(params);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `${MATERIAL_CONSTANTS.ERROR_MESSAGES.OBJECT_STORAGE_WRITE_FAILED}: ${err.message}`,
        err.stack,
      );
      throw serviceException(
        {
          message: MATERIAL_CONSTANTS.ERROR_MESSAGES.OBJECT_STORAGE_WRITE_FAILED,
          error: {
            code: 'OBJECT_STORAGE_WRITE_FAILED',
            details: { object_key: params.objectKey, file_size_bytes: params.fileSizeBytes },
            retryable: true,
          },
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async uploadThumbnailToMinio(
    thumbnailBuffer: Buffer,
    thumbKey: string,
    thumbMimeType: string,
  ): Promise<string | undefined> {
    try {
      await this.minio.putObject({
        buffer: thumbnailBuffer,
        objectKey: thumbKey,
        mimeType: thumbMimeType,
        fileSizeBytes: thumbnailBuffer.length,
      });

      return this.minio.generatePublicUrl(thumbKey);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Thumbnail MinIO upload failed (non-blocking): ${err.message}`);
      return undefined;
    }
  }

  private async probeVideoMetadata(buffer: Buffer): Promise<VideoMetadata> {
    try {
      return await this.mediaProbe.probeVideo(buffer);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`视频元数据解析失败: ${err.message}`, err.stack);
      throw serviceException(
        {
          message: '视频文件无效，无法解析元数据',
          error: {
            code: 'INVALID_VIDEO_FILE',
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  computeInitialSliceBoundaries(durationSeconds: number, materialId: string): MaterialSliceBoundary[] {
    if (durationSeconds <= 0 || Number.isNaN(durationSeconds)) {
      throw serviceException(
        {
          message: `无效的视频时长: ${durationSeconds}s，无法计算切片边界`,
          error: {
            code: 'MATERIAL_SLICE_COMPUTE_FAILED',
            details: { duration_seconds: durationSeconds },
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const sliceCount = Math.ceil(durationSeconds / MATERIAL_CONSTANTS.SLICE_TARGET_DURATION_SECONDS);
    const sliceDuration = durationSeconds / sliceCount;

    const datePrefix = this.getCurrentDatePrefix();
    const slices: MaterialSliceBoundary[] = [];
    let taskSeq = 1;

    for (let i = 0; i < sliceCount; i++) {
      const startTime = i * sliceDuration;
      const endTime = Math.min((i + 1) * sliceDuration, durationSeconds);
      const currentDuration = Math.round((endTime - startTime) * 100) / 100;

      if (currentDuration < MATERIAL_CONSTANTS.SLICE_MIN_DURATION_SECONDS) {
        const prevSlice = slices[slices.length - 1];
        if (prevSlice) {
          prevSlice.endTime = endTime;
          prevSlice.duration = Math.round((endTime - prevSlice.startTime) * 100) / 100;
        }
        continue;
      }

      slices.push({
        sliceId: this.buildSliceId(materialId, taskSeq, datePrefix),
        startTime,
        endTime,
        duration: currentDuration,
      });
      taskSeq++;
    }

    if (slices.length === 0) {
      this.logger.warn(`Video duration ${durationSeconds}s produced 0 valid slices`);
    }

    return slices;
  }

  /**
   * 将 AI 生成的 tags 按语义分类到三个维度标签字段：
   * - productDimensionTags: 产品物理特征（颜色、材质、形状、部件等）
   * - videoDimensionTags: 视觉风格/氛围（色调、光照、场景、风格等）
   * - sliceDimensionTags: 拍摄技法/镜头语言（角度、运镜、构图等）
   */
  private classifyDimensionTags(
    allTags: string[],
    supplementalProductFeatures: string[],
  ): { productDimensionTags: string[]; videoDimensionTags: string[]; sliceDimensionTags: string[] } {
    const productTags: string[] = [];
    const videoTags: string[] = [];
    const sliceTags: string[] = [];

    // 产品特征关键词（中文 + 英文 snake_case）
    const productPatterns = [
      '颜色', 'color', '材质', 'material', '金属', 'metal', '塑料', 'plastic',
      '玻璃', 'glass', '木质', 'wood', '皮革', 'leather', '布料', 'fabric',
      '形状', 'shape', '圆形', 'round', '方形', 'square', '矩形', 'rectangular',
      '银色', 'silver', '金色', 'gold', '黑色', 'black', '白色', 'white',
      '红色', 'red', '蓝色', 'blue', '绿色', 'green',
      '尺寸', 'size', '英寸', 'inch', '轻薄', 'thin', '便携', 'portable',
      '按键', 'button', '键盘', 'keyboard', '屏幕', 'screen', '显示器', 'display',
      '镜头', 'lens', '接口', 'port', '边框', 'bezel', '触控', 'touch',
      'logo', '标识', '品牌', 'brand', '包装', 'packaging', '瓶身', 'bottle',
      '盖', 'cap', '管', 'tube', '盒', 'box',
      'product_feature', 'product_detail', 'product_texture', 'material_texture',
      'product_showcase',
    ];

    // 视觉风格/氛围关键词
    const videoPatterns = [
      '暖色', 'warm', '冷色', 'cool', '色调', 'tone', '自然光', 'natural_light',
      '室内光', 'indoor', '户外', 'outdoor', '场景', 'scene', '背景', 'background',
      '简约', 'minimal', '极简', 'minimalist', '现代', 'modern', '科技', 'tech',
      '氛围', 'atmosphere', 'mood', '情绪', 'emotion',
      '桌面', 'desk', '办公', 'office', '家居', 'home', '生活', 'lifestyle',
      '清新', 'fresh', '柔和', 'soft', '明亮', 'bright', '暗', 'dark',
      'lighting', 'backlight', 'studio_light', 'ambient',
      'wooden', 'concrete', 'marble',
      'scene_setting', 'environment',
    ];

    // 拍摄技法/镜头语言关键词
    const slicePatterns = [
      '特写', 'close_up', 'macro', '微距', '中景', 'medium_shot',
      '远景', 'wide_shot', '全景', 'full_shot', '俯拍', 'top_down',
      '仰拍', 'low_angle', '平拍', 'eye_level', '侧拍', 'side_angle',
      '角度', 'angle', '构图', 'composition', '运镜', 'camera_movement',
      '旋转', 'rotate', '推拉', 'zoom', '平移', 'pan',
      '展示', '展示类', '对比', 'contrast', '开箱', 'unboxing',
      '使用场景', '使用中', '手持', '使用演示',
      'shot_type', 'camera_angle', 'product_angle',
      'front_view', 'back_view', 'side_view', 'detail_view',
    ];

    const isMatch = (tag: string, patterns: string[]): boolean => {
      const lower = tag.toLowerCase().replace(/[_\-\s]+/g, ' ');
      return patterns.some(p => lower.includes(p.toLowerCase().replace(/[_\-\s]+/g, ' ')));
    };

    for (const tag of allTags) {
      const t = tag.trim();
      if (!t) continue;

      let classified = false;

      if (isMatch(t, productPatterns)) { productTags.push(t); classified = true; }
      if (isMatch(t, videoPatterns)) { videoTags.push(t); classified = true; }
      if (isMatch(t, slicePatterns)) { sliceTags.push(t); classified = true; }

      // 未匹配的标签默认放入 sliceDimensionTags（拍摄技法兜底）
      if (!classified) {
        sliceTags.push(t);
      }
    }

    // 补充 Vision Analysis 的 product_features 到 product 维度
    for (const feat of supplementalProductFeatures) {
      if (!productTags.includes(feat)) {
        productTags.push(feat);
      }
    }

    return {
      productDimensionTags: [...new Set(productTags)],
      videoDimensionTags: [...new Set(videoTags)],
      sliceDimensionTags: [...new Set(sliceTags)],
    };
  }

  private async persistMaterialWithSlices(
    materialId: string,
    dto: UploadMaterialDto,
    file: Express.Multer.File,
    originUrl: string,
    thumbnailUrl: string | undefined,
    durationSeconds: number | null,
    width: number | null,
    height: number | null,
    mimeType: string | null,
    slices: MaterialSliceBoundary[],
  ): Promise<void> {
    const now = new Date();

    const materialParams: CreateMaterialParams = {
      id: materialId,
      product_id: dto.product_id!,
      file_name: file.originalname,
      type: dto.type,
      source_type: dto.source_type || 'UPLOAD',
      origin_url: originUrl,
      thumbnail_url: thumbnailUrl || null,
      file_size_bytes: BigInt(Math.round(file.size)), // file.size 在 Number 安全范围内（< 9 PB）
      duration_seconds: durationSeconds,
      width,
      height,
      mime_type: mimeType,
      status: 'PENDING',
      slices_count: slices.length,
      remark: dto.remark || null,
      referenced_material_id: dto.reference_material_id || null,
      reference_category: dto.reference_category || null,
      created_at: now,
      updated_at: now,
    };

    const slicePrismaParams: CreateMaterialSliceParams[] = slices.map((s) => ({
      material_id: materialId,
      slice_id: s.sliceId,
      start_time: s.startTime,
      end_time: s.endTime,
      duration: s.duration,
      status: 'PENDING',
      tags: [],
      created_at: now,
      updated_at: now,
    }));

    try {
      await this.prisma.persistMaterialWithSlices(materialParams, slicePrismaParams);
      this.logger.log(`Material persisted: ${materialId} with ${slices.length} slices`);
    } catch (error) {
      const err = error as Error & { errorCode?: string; retryable?: boolean };
      const normalizedCode = err.errorCode && /^P\d{4}$/.test(err.errorCode)
        ? 'INTERNAL_SERVER_ERROR'
        : (err.errorCode || 'INTERNAL_SERVER_ERROR');
      this.logger.error(`持久化素材失败: ${err.message}`, err.stack);
      throw serviceException(
        {
          message: '素材保存失败，请稍后重试',
          error: {
            code: normalizedCode,
            details: { material_id: materialId, slice_count: slices.length },
            retryable: err.retryable ?? true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async enqueueGpuSlicingJob(materialId: string, skipQdrant: boolean): Promise<EnqueueResult> {
    try {
      if (!this.gpuSlicingQueue) {
        throw new Error('GPU_SLICING_QUEUE is not available — Redis/BullMQ may be down');
      }
      const job = await this.gpuSlicingQueue.add(
        QUEUE_CONSTANTS.SLICING_JOB_NAME,
        {
          materialId,
          skipQdrant: skipQdrant || false,
          enqueuedAt: new Date().toISOString(),
        },
      );

      const taskId = `tsk_${this.getCurrentDatePrefix()}_${String(job.id).padStart(6, '0')}`;

      this.logger.log(`GPU slicing job enqueued: materialId=${materialId}, jobId=${job.id}, taskId=${taskId}`);

      return {
        jobId: typeof job.id === 'string' ? job.id : String(job.id || 'unknown'),
        taskId,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`GPU slicing job enqueue failed: ${err.message}`);

      // 入队失败后，将素材状态更新为 FAILED，避免永远停留在 PENDING
      try {
        await this.prisma.markMaterialJobFailed(materialId, `GPU slicing job enqueue failed: ${err.message}`);
      } catch (dbError) {
        this.logger.error(`Failed to mark material as FAILED after enqueue failure: ${(dbError as Error).message}`);
      }

      throw serviceException(
        {
          message: `GPU slicing job enqueue failed: ${err.message}`,
          error: {
            code: 'GPU_SLICING_ENQUEUE_FAILED',
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private mapToMaterialUploadResponse(
    material: {
      id: string;
      product_id: string;
      file_name: string;
      type: string;
      source_type: string;
      origin_url: string;
      thumbnail_url: string | null;
      file_size_bytes: number;
      duration_seconds: number | null;
      width: number | null;
      height: number | null;
      mime_type: string | null;
      status: string;
      slices_count: number;
      created_at: Date;
    },
    asyncTaskId: string,
    thumbnailUrl?: string,
    aiResult?: { dense_caption: string | null; tags: string[] },
  ): MaterialUploadResponse {
    return {
      material_id: material.id,
      product_id: material.product_id,
      file_name: material.file_name,
      type: material.type,
      source_type: material.source_type,
      status: material.status || 'PENDING',
      thumbnail_url: thumbnailUrl ? (this.rewriteStorageUrl(thumbnailUrl) ?? thumbnailUrl) : undefined,
      file_size_bytes: Number(material.file_size_bytes),
      async_task_id: asyncTaskId,
      dense_caption: aiResult?.dense_caption || undefined,
      tags: aiResult?.tags?.length ? aiResult.tags : undefined,
      created_at: material.created_at.toISOString(),
    };
  }

  async listMaterials(dto: ListMaterialsDto): Promise<MaterialListResponse> {
    const params = this.resolveListDefaults(dto);

    const normalizedSort = this.validateAndNormalizeSort(
      params.sort_by,
      params.sort_order,
    );
    const normalizedParams = {
      ...params,
      sort_by: normalizedSort.sort_by,
      sort_order: normalizedSort.sort_order,
    };

    const filter = this.buildListFilter(normalizedParams);

    const decodedCursor = normalizedParams.cursor
      ? this.prisma.decodeCursor(normalizedParams.cursor, filter.sort_by)
      : null;

    const { items: rows, total_count, has_more, next_cursor } =
      await this.prisma.findMaterialsPaginated(filter, decodedCursor);

    const materialItems = rows.map((row) => this.mapToMaterialListItem(row));

    const page_info = this.buildPageInfo(
      materialItems,
      has_more,
      next_cursor,
      total_count,
    );

    this.logger.log(
      `Material list query: product_id=${dto.product_id}, returned=${materialItems.length}, total_count=${total_count}, has_more=${has_more}`,
    );

    return { items: materialItems, page_info };
  }

  private resolveListDefaults(dto: ListMaterialsDto): {
    product_id: string;
    type?: string;
    status?: string;
    source_type?: string;
    keyword?: string;
    created_at_start?: string;
    created_at_end?: string;
    sort_by: string;
    sort_order: string;
    limit: number;
    cursor?: string;
  } {
    const limit = dto.limit ?? MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.DEFAULT_LIMIT;

    if (!Number.isInteger(limit) || limit <= 0 || limit > MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.MAX_LIMIT) {
      throw serviceException(
        {
          message: `limit 必须为 1~${MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.MAX_LIMIT} 的正整数，当前为 ${limit}`,
          error: {
            code: 'INVALID_REQUEST',
            details: { field: 'limit', received: dto.limit },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
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
      sort_by: dto.sort_by ?? MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.DEFAULT_SORT_BY,
      sort_order: dto.sort_order ?? MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.DEFAULT_SORT_ORDER,
      limit,
      cursor: dto.cursor,
    };
  }

  private validateAndNormalizeSort(
    sort_by: string,
    sort_order: string,
  ): { sort_by: MaterialListSortField; sort_order: MaterialListSortOrder } {
    const validSortBy = (
      MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.SORTABLE_FIELDS as readonly string[]
    ).includes(sort_by)
      ? (sort_by as MaterialListSortField)
      : (MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.DEFAULT_SORT_BY as MaterialListSortField);

    const validSortOrder = (
      MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.SORT_ORDERS as readonly string[]
    ).includes(sort_order)
      ? (sort_order as MaterialListSortOrder)
      : (MATERIAL_CONSTANTS.MATERIAL_LIST_DEFAULTS.DEFAULT_SORT_ORDER as MaterialListSortOrder);

    return { sort_by: validSortBy, sort_order: validSortOrder };
  }

  private buildListFilter(params: {
    product_id: string;
    type?: string;
    status?: string;
    source_type?: string;
    keyword?: string;
    created_at_start?: string;
    created_at_end?: string;
    sort_by: MaterialListSortField;
    sort_order: MaterialListSortOrder;
    limit: number;
    cursor?: string;
  }): MaterialListFilter {
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
      filter.keyword = params.keyword;
      filter.keyword_synonyms = this.synonym.expandQuery(params.keyword);
    }

    if (params.created_at_start) {
      const parsed = new Date(params.created_at_start);
      if (isNaN(parsed.getTime())) {
        throw serviceException(
          {
            message: `created_at_start 不是有效的 ISO8601 时间: ${params.created_at_start}`,
            error: {
              code: 'INVALID_REQUEST',
              details: { field: 'created_at_start', received: params.created_at_start },
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      filter.created_at_gte = parsed;
    }

    if (params.created_at_end) {
      const parsed = new Date(params.created_at_end);
      if (isNaN(parsed.getTime())) {
        throw serviceException(
          {
            message: `created_at_end 不是有效的 ISO8601 时间: ${params.created_at_end}`,
            error: {
              code: 'INVALID_REQUEST',
              details: { field: 'created_at_end', received: params.created_at_end },
              retryable: false,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      filter.created_at_lte = parsed;
    }

    if (
      filter.created_at_gte &&
      filter.created_at_lte &&
      filter.created_at_gte > filter.created_at_lte
    ) {
      throw serviceException(
        {
          message: MATERIAL_CONSTANTS.ERROR_MESSAGES.INVALID_TIME_RANGE,
          error: {
            code: 'INVALID_REQUEST',
            details: {
              created_at_start: params.created_at_start,
              created_at_end: params.created_at_end,
            },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return filter;
  }

  private rewriteStorageUrl(url: string | null | undefined): string | null {
    return rewriteMinioPublicUrl(url) ?? null;
  }

  private mapToMaterialListItem(row: MaterialRow): MaterialListItem {
    return {
      material_id: row.id,
      file_name: row.fileName,
      type: row.type,
      source_type: row.sourceType,
      status: row.status,
      origin_url: this.rewriteStorageUrl(row.originUrl) ?? row.originUrl,
      thumbnail_url: this.rewriteStorageUrl(row.thumbnailUrl) ?? row.thumbnailUrl ?? null,
      duration_seconds: row.durationSeconds ?? null,
      file_size_bytes: Number(row.fileSizeBytes),
      slices_count: row._count?.slices ?? row.slicesCount ?? 0,
      product_title: row.product?.title ?? 'Unknown',
      product_category: row.product?.category ?? 'Unknown',
      referenced_material_id: (row as MaterialRowWithRef).referencedMaterialId ?? null,
      reference_category: (row as MaterialRowWithRef).referenceCategory ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }

  private buildPageInfo(
    items: MaterialListItem[],
    hasMore: boolean,
    nextCursor: string | null,
    totalCount: number,
  ): CursorPageInfo {
    return {
      cursor: nextCursor,
      has_more: hasMore,
      total_count: totalCount,
    };
  }

  async deleteMaterial(materialId: string): Promise<{ success: boolean }> {
    this.validateMaterialId(materialId);

    let row = null;
    try {
      row = await this.prisma.findMaterialById(materialId, { includeDeleted: true });
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      const isRetryable =
        prismaError.code === 'P1001' ||
        prismaError.code === 'P2024' ||
        prismaError.code === 'P2028';
      throw serviceException(
        {
          message: `Material lookup before delete failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { material_id: materialId, prisma_code: prismaError.code },
            retryable: isRetryable,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!row) {
      throw serviceException(
        {
          message: `素材 ${materialId} 不存在`,
          error: {
            code: 'MATERIAL_NOT_FOUND',
            details: { material_id: materialId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：素材 product_id 非空
    if (!(row as Record<string, unknown>).productId) {
      throw serviceException(
        {
          message: '素材缺少商品归属',
          error: { code: 'MATERIAL_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 软删除：设置 deletedAt，不立即清理存储
    try {
      await this.prisma.softDeleteMaterial(materialId);
    } catch (error) {
      const err = error as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      throw serviceException(
        {
          message: err.message,
          error: {
            code: err.errorCode || 'INTERNAL_SERVER_ERROR',
            details: err.details,
            retryable: err.retryable ?? true,
          },
        },
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 清理 Qdrant 向量数据（切片集合）
    try {
      await this.qdrant.deleteByFilter({
        must: [{ key: 'material_id', match: { value: materialId } }],
      });
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Qdrant slice cleanup failed for material ${materialId}: ${err.message}`);
    }

    // 清理 Qdrant 素材级向量（asset_materials 集合）
    try {
      await this.qdrant.deleteByFilter(
        { must: [{ key: 'material_id', match: { value: materialId } }] },
        this.qdrant.getMaterialCollectionName(),
      );
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Qdrant material cleanup failed for material ${materialId}: ${err.message}`);
    }

    this.logger.log(`Material soft-deleted: material_id=${materialId}`);
    return { success: true };
  }

  // ========== 回收站功能 ==========

  async listTrashMaterials(query: {
    product_id: string;
    limit?: number;
    cursor?: string;
  }): Promise<MaterialListResponse> {
    const { product_id, limit = 20, cursor } = query;

    const filter: MaterialListFilter = {
      product_id,
      sort_by: 'created_at',
      sort_order: 'DESC',
      limit,
    };

    const decodedCursor = cursor ? this.prisma.decodeCursor(cursor, filter.sort_by) : null;
    const result = await this.prisma.findMaterialsPaginated(filter, decodedCursor, true);

    // 过滤出已删除的素材并映射到列表项
    const deletedItems: MaterialListItem[] = [];
    for (const item of result.items) {
      const row = item as unknown as { deletedAt?: Date | null; _count?: { slices?: number }; product?: { title?: string; category?: string }; referencedMaterialId?: string | null; referenceCategory?: string | null; [key: string]: unknown };
      if (row.deletedAt != null) {
        deletedItems.push({
          material_id: row.id as string,
          file_name: row.fileName as string,
          type: row.type as string,
          source_type: row.sourceType as string,
          status: row.status as string,
          origin_url: this.rewriteStorageUrl(row.originUrl as string | null | undefined),
          thumbnail_url: this.rewriteStorageUrl(row.thumbnailUrl as string | null | undefined),
          duration_seconds: row.durationSeconds as number | null ?? null,
          file_size_bytes: Number(row.fileSizeBytes),
          slices_count: row._count?.slices ?? 0,
          product_title: row.product?.title ?? 'Unknown',
          product_category: row.product?.category ?? 'Unknown',
          referenced_material_id: row.referencedMaterialId ?? null,
          reference_category: row.referenceCategory ?? null,
          created_at: (row.createdAt as Date).toISOString(),
        });
      }
    }

    // 单独统计已删除素材的准确数量
    let deletedTotalCount = 0;
    try {
      deletedTotalCount = await this.prisma.countDeletedMaterials(product_id);
    } catch (err) {
      this.logger.warn(`Failed to count deleted materials for product ${product_id}: ${(err as Error).message}`);
    }

    return {
      items: deletedItems,
      page_info: {
        cursor: result.next_cursor,
        has_more: result.has_more,
        total_count: deletedTotalCount,
      },
    };
  }

  async deleteMaterialsByProduct(productId: string): Promise<{ deleted_count: number }> {
    const materialIds = await this.prisma.findDeletedMaterialIdsByProduct(productId);
    if (materialIds.length === 0) {
      return { deleted_count: 0 };
    }

    try {
      const result = await this.prisma.batchDeleteMaterialsByIds(materialIds);
      this.logger.log(`Cleared ${result} materials from trash for product ${productId}`);
      return { deleted_count: result };
    } catch (error) {
      const err = error as Error & { errorCode?: string };
      this.logger.error(`Batch delete for product ${productId} failed: ${err.message}`);
      let deletedCount = 0;
      for (const id of materialIds) {
        try {
          await this.prisma.deleteMaterialById(id);
          deletedCount++;
        } catch (e) {
          this.logger.warn(`Failed to delete material ${id}: ${e}`);
        }
      }
      return { deleted_count: deletedCount };
    }
  }

  async restoreMaterial(materialId: string): Promise<{ success: boolean }> {
    this.validateMaterialId(materialId);

    let row = null;
    try {
      row = await this.prisma.findMaterialById(materialId, { includeDeleted: true });
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      const isRetryable =
        prismaError.code === 'P1001' ||
        prismaError.code === 'P2024' ||
        prismaError.code === 'P2028';
      throw serviceException(
        {
          message: `Material lookup before restore failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { material_id: materialId, prisma_code: prismaError.code },
            retryable: isRetryable,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!row) {
      throw serviceException(
        {
          message: `素材 ${materialId} 不存在`,
          error: {
            code: 'MATERIAL_NOT_FOUND',
            details: { material_id: materialId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：素材 product_id 非空
    if (!(row as Record<string, unknown>).productId) {
      throw serviceException(
        {
          message: '素材缺少商品归属',
          error: { code: 'MATERIAL_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    try {
      await this.prisma.restoreMaterial(materialId);
      this.logger.log(`Material restored: material_id=${materialId}`);
      return { success: true };
    } catch (error) {
      const err = error as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      throw serviceException(
        {
          message: err.message,
          error: {
            code: err.errorCode || 'INTERNAL_SERVER_ERROR',
            details: err.details,
            retryable: err.retryable ?? true,
          },
        },
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async permanentDeleteMaterial(materialId: string): Promise<{ success: boolean }> {
    this.validateMaterialId(materialId);

    let row = null;
    try {
      row = await this.prisma.findMaterialById(materialId, { includeDeleted: true });
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      const isRetryable =
        prismaError.code === 'P1001' ||
        prismaError.code === 'P2024' ||
        prismaError.code === 'P2028';
      throw serviceException(
        {
          message: `Material lookup before permanent delete failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { material_id: materialId, prisma_code: prismaError.code },
            retryable: isRetryable,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!row) {
      throw serviceException(
        {
          message: `素材 ${materialId} 不存在`,
          error: {
            code: 'MATERIAL_NOT_FOUND',
            details: { material_id: materialId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：素材 product_id 非空
    if (!(row as Record<string, unknown>).productId) {
      throw serviceException(
        {
          message: '素材缺少商品归属',
          error: { code: 'MATERIAL_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    try {
      const { materialFiles, sliceFiles } = await this.prisma.permanentDeleteMaterial(materialId);

      // 问题 6: MinIO 清理失败时记录孤立对象到日志文件，供后续运维脚本清理
      try {
        await this.cleanupMinioObjects([...materialFiles, ...sliceFiles]);
      } catch (error) {
        this.logger.warn(
          `MinIO cleanup failed for material ${materialId}: ${(error as Error).message}`,
        );
        this.logOrphanedMinioObjects(materialId, [...materialFiles, ...sliceFiles]);
      }

      // 清理 Qdrant 向量数据（切片集合）
      try {
        await this.qdrant.deleteByFilter({
          must: [{ key: 'material_id', match: { value: materialId } }],
        });
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Qdrant slice cleanup failed for material ${materialId}: ${err.message}`);
      }

      // 清理 Qdrant 素材级向量（asset_materials 集合）
      try {
        await this.qdrant.deleteByFilter(
          { must: [{ key: 'material_id', match: { value: materialId } }] },
          this.qdrant.getMaterialCollectionName(),
        );
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Qdrant material cleanup failed for material ${materialId}: ${err.message}`);
      }

      this.logger.log(`Material permanently deleted: material_id=${materialId}`);
      return { success: true };
    } catch (error) {
      const err = error as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      throw serviceException(
        {
          message: err.message,
          error: {
            code: err.errorCode || 'INTERNAL_SERVER_ERROR',
            details: err.details,
            retryable: err.retryable ?? true,
          },
        },
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private collectMaterialObjectKeys(row: Record<string, unknown>): string[] {
    const keys: string[] = [];

    const originUrl = row.originUrl as string | undefined;
    if (originUrl) {
      const key = this.extractObjectKeyFromUrl(originUrl);
      if (key) {
        keys.push(key);
      }
    }

    const thumbnailUrl = row.thumbnailUrl as string | null | undefined;
    if (thumbnailUrl) {
      const key = this.extractObjectKeyFromUrl(thumbnailUrl);
      if (key) {
        keys.push(key);
      }
    }

    const slices = row.slices as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(slices)) {
      for (const slice of slices) {
        const streamUrl = slice.streamUrl as string | null | undefined;
        if (streamUrl) {
          const key = this.extractObjectKeyFromUrl(streamUrl);
          if (key) {
            keys.push(key);
          }
        }
        const keyFrameUrl = slice.keyFrameUrl as string | null | undefined;
        if (keyFrameUrl) {
          const key = this.extractObjectKeyFromUrl(keyFrameUrl);
          if (key) {
            keys.push(key);
          }
        }
        const sfxUrl = slice.sfxUrl as string | null | undefined;
        if (sfxUrl) {
          const key = this.extractObjectKeyFromUrl(sfxUrl);
          if (key) {
            keys.push(key);
          }
        }
      }
    }

    return [...new Set(keys)].filter(Boolean);
  }

  private extractObjectKeyFromUrl(url: string): string | null {
    try {
      // Use URL parsing first to strip query params (e.g. presigned URLs),
      // then extract the path after the bucket name from pathname
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const bucketName = process.env.MINIO_BUCKET_NAME || 'tikstream-assets';
      const bucketIdx = pathname.indexOf(`/${bucketName}/`);
      if (bucketIdx >= 0) {
        return pathname.slice(bucketIdx + bucketName.length + 2);
      }
      if (pathname && pathname.length > 1) {
        return pathname.replace(/^\//, '');
      }
      return null;
    } catch {
      return null;
    }
  }

  private async cleanupMinioObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    try {
      const results = await Promise.allSettled(
        keys.map((key) => this.minio.deleteObject(key)),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (failed > 0) {
        this.logger.warn(
          `MinIO deletion completed with failures: ${succeeded} succeeded, ${failed} failed`,
        );
      } else {
        this.logger.log(`MinIO cleanup completed: ${succeeded} objects deleted`);
      }
    } catch (error) {
      this.logger.warn(
        `MinIO cleanup batch failed (non-blocking): ${(error as Error).message}`,
      );
    }
  }

  async searchMaterialSlices(dto: SearchMaterialsDto): Promise<MaterialSearchResponse> {
    const params = this.resolveSearchDefaults(dto);

    const { qdrantFilter, pgWhere } = this.buildSearchFilters(params);

    const searchMode = params.search_mode;
    const granularity = params.granularity;

    let result: MaterialSearchResponse;

    // material 级独立向量检索 (需求2): 直接搜索 asset_materials collection
    if (granularity === 'material' && params.query) {
      result = await this.performMaterialVectorSearch(qdrantFilter, params);
      // 向量检索无结果时降级到关键词检索（描述+标签全覆盖）
      if (result.items.length === 0 && params.query) {
        this.logger.log('[MaterialSearch] material vector returned empty, falling back to keyword search');
        result = await this.performKeywordSearch(pgWhere, params, 'all');
      }
    } else if (searchMode === 'FUSION') {
      result = await this.performFusionSearch(pgWhere, qdrantFilter, params);
      if (granularity === 'hybrid') {
        result = await this.performEnhancedHybridAggregation(result, qdrantFilter, params);
      }
    } else if (searchMode === 'KEYWORD') {
      result = await this.performKeywordSearch(pgWhere, params, 'all', 'keyword');
      if (granularity === 'hybrid') {
        result = await this.performHybridAggregation(result);
      }
    } else if (searchMode === 'AUTO' || searchMode === 'VECTOR') {
      result = await this.performVectorOrAutoSearch(pgWhere, qdrantFilter, params);
      if (granularity === 'hybrid') {
        result = await this.performEnhancedHybridAggregation(result, qdrantFilter, params);
      }
    } else {
      result = await this.performKeywordSearch(pgWhere, params);
      if (granularity === 'hybrid') {
        result = await this.performHybridAggregation(result);
      }
    }

    // 需求3: 搜索日志写入 (fire-and-forget，不影响搜索响应)
    fireAndForget(this.logger, 'writeSearchLog', this.writeSearchLog(params.query || '', result.items.length));

    // 严格模式：过滤掉无 dense_caption 的切片（非严格模式不过滤）
    if (params.strictness === 'strict') {
      result.items = result.items.filter((item) => item.dense_caption?.trim());
    }

    // 需求3: 热度加权 + 时间衰减后处理重排序
    result = this.applyHotBoostReRanking(result);

    return result;
  }

  private resolveSearchDefaults(dto: SearchMaterialsDto): {
    product_id: string;
    query?: string;
    type?: string;
    status?: string;
    min_duration?: number;
    max_duration?: number;
    search_mode: string;
    strictness: string;
    granularity: string;
    limit: number;
    cursor?: string;
  } {
    const limit = dto.limit ?? 20;

    if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
      throw serviceException(
        {
          message: `limit 必须为 1~50 的正整数，当前为 ${limit}`,
          error: {
            code: 'INVALID_REQUEST',
            details: { field: 'limit', received: dto.limit },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const query = dto.query?.trim() || undefined;

    if (!query && !dto.type && !dto.status && dto.min_duration === undefined && dto.max_duration === undefined) {
      throw serviceException(
        {
          message: '至少需要一个查询条件：query / type / status / duration range',
          error: {
            code: 'INVALID_REQUEST',
            details: { reason: 'at_least_one_filter_required' },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
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
      strictness: dto.strictness ?? 'relaxed',
      granularity: dto.granularity ?? 'slice',
      limit,
      cursor: dto.cursor,
    };
  }

  private buildSearchFilters(params: {
    product_id: string;
    query?: string;
    type?: string;
    status?: string;
    min_duration?: number;
    max_duration?: number;
  }): {
    qdrantFilter: Record<string, unknown>;
    pgWhere: Record<string, unknown>;
  } {
    const materialFilter: Record<string, unknown> = {
      productId: params.product_id,
    };
    const pgWhere: Record<string, unknown> = {
      material: materialFilter,
      deletedAt: null,
    };

    if (params.type) {
      materialFilter.type = params.type;
    }
    if (params.status) {
      pgWhere.status = params.status;
    }

    if (params.min_duration !== undefined || params.max_duration !== undefined) {
      const durFilter: Record<string, number> = {};
      if (params.min_duration !== undefined) {
        durFilter.gte = params.min_duration;
      }
      if (params.max_duration !== undefined) {
        durFilter.lte = params.max_duration;
      }
      pgWhere.duration = durFilter;
    }

    const qdrantFilter: Record<string, unknown> = { must: [] };
    const mustArr = qdrantFilter.must as Array<Record<string, unknown>>;

    mustArr.push({ key: 'product_id', match: { value: params.product_id } });

    if (params.type) {
      mustArr.push({ key: 'type', match: { value: params.type } });
    }
    if (params.status) {
      mustArr.push({ key: 'status', match: { value: params.status } });
    }
    if (params.min_duration !== undefined || params.max_duration !== undefined) {
      const durRange: Record<string, number> = {};
      if (params.min_duration !== undefined) {
        durRange.gte = params.min_duration;
      }
      if (params.max_duration !== undefined) {
        durRange.lte = params.max_duration;
      }
      mustArr.push({ key: 'duration', range: durRange });
    }

    return { qdrantFilter, pgWhere };
  }

  private async performKeywordSearch(
    pgWhere: Record<string, unknown>,
    params: { query?: string; limit: number; cursor?: string },
    scope: 'all' | 'tags' | 'descriptions' = 'all',
    searchSourceLabel: 'keyword' | 'keyword_fallback' = 'keyword_fallback',
  ): Promise<MaterialSearchResponse> {
    if (params.query) {
      // 同义词扩展: 原词 + 同义变体
      const expandedQueries = this.synonym.expandQuery(params.query);
      this.logger.log(`[KeywordSearch] Synonym expansion: "${params.query}" → [${expandedQueries.join(', ')}]`);

      // 分词：将每个 expanded query 按空格拆分为独立 token，确保单个词也能命中
      const tokenizedQueries = expandedQueries.flatMap((q: string) => {
        const tokens = q.split(/\s+/).filter((t) => t.length > 0);
        return [q, ...tokens.filter((t) => t !== q)];
      });
      const uniqueQueries = [...new Set(tokenizedQueries)];
      this.logger.log(`[KeywordSearch] Tokenized queries (${uniqueQueries.length}): [${uniqueQueries.join(', ')}]`);

      const baseConditions = uniqueQueries.flatMap((term: string) => {
        const conditions: Record<string, unknown>[] = [];
        // 根据 scope 决定检索范围
        if (scope === 'all' || scope === 'descriptions') {
          conditions.push({ denseCaption: { contains: term, mode: 'insensitive' } });
        }
        if (scope === 'all' || scope === 'tags') {
          conditions.push(
            { tags: { path: [], string_contains: term } },
            { productDimensionTags: { path: [], string_contains: term } },
            { videoDimensionTags: { path: [], string_contains: term } },
            { sliceDimensionTags: { path: [], string_contains: term } },
          );
        }
        return conditions;
      });

      (pgWhere as Record<string, unknown>).OR = baseConditions;
    }

    this.logger.log(`[KeywordSearch] pgWhere: ${JSON.stringify(pgWhere)}`);

    const result = await this.prisma.searchSlicesByKeyword(pgWhere, params.limit, params.cursor);
    const rows = this.mapSliceResultToSearchRows(result.items as unknown as Array<Record<string, unknown>>);

    const items = rows.map((row) =>
      this.mapToSearchResult(row, searchSourceLabel, null),
    );

    this.logger.log(`[KeywordSearch] Returned ${items.length} items, total_count=${result.total_count}`);

    return {
      items,
      page_info: {
        cursor: result.next_cursor,
        has_more: result.has_more,
        total_count: result.total_count,
      },
      search_source: searchSourceLabel,
    };
  }

  private async performVectorOrAutoSearch(
    pgWhere: Record<string, unknown>,
    qdrantFilter: Record<string, unknown>,
    params: { query?: string; search_mode: string; limit: number; cursor?: string },
  ): Promise<MaterialSearchResponse> {
    this.logger.log(`[VectorSearch] Starting: query="${params.query}", mode=${params.search_mode}, limit=${params.limit}`);
    this.logger.log(`[VectorSearch] Qdrant filter: ${JSON.stringify(qdrantFilter)}`);

    // 无 query 文本时直接走关键词检索，避免对空字符串生成无意义向量
    if (!params.query || params.query.trim() === '') {
      this.logger.log('[VectorSearch] Empty query, skipping embedding — fallback to keyword search');
      return this.performKeywordSearch(pgWhere, params, 'all');
    }

    const embedding = await this.imageBind.embedQuery({ text: params.query });

    if (!embedding) {
      this.logger.warn(`[VectorSearch] Embedding unavailable, falling back to keyword search`);
      if (params.search_mode === 'VECTOR') {
        throw serviceException(
          {
            message: 'Embedding service unavailable for vector search',
            error: {
              code: 'VECTOR_SEARCH_FAILED',
              retryable: true,
            },
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
      return this.performKeywordSearch(pgWhere, params, 'all');
    }

    this.logger.log(`[VectorSearch] Embedding generated: dim=${embedding.length}`);

    const collectionName = this.qdrant.getCollectionName();
    let qdrantResults;
    try {
      qdrantResults = await this.qdrant.search({
        collectionName,
        vector: embedding,
        filter: qdrantFilter,
        limit: params.limit,
      });
    } catch (qdrantError) {
      this.logger.error(`[VectorSearch] Qdrant search failed: ${qdrantError}`);
      if (params.search_mode === 'VECTOR') {
        const err = qdrantError as Error & { errorCode?: string; retryable?: boolean };
        throw serviceException(
          {
            message: err.message,
            error: {
              code: err.errorCode || 'VECTOR_SEARCH_FAILED',
              retryable: err.retryable ?? true,
            },
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
      return this.performKeywordSearch(pgWhere, params, 'all');
    }

    this.logger.log(`[VectorSearch] Qdrant returned ${qdrantResults?.length || 0} results`);

    if (!qdrantResults || qdrantResults.length === 0) {
      this.logger.log(`[VectorSearch] No results from Qdrant, falling back to keyword`);
      if (params.search_mode === 'VECTOR') {
        return {
          items: [],
          page_info: { cursor: null, has_more: false, total_count: 0 },
          search_source: 'vector',
        };
      }
      return this.performKeywordSearch(pgWhere, params, 'all');
    }

    // 使用 Qdrant point id（UUID），与数据库 id 字段匹配，避免 PostgreSQL UUID 类型转换错误
    const hitIds = qdrantResults.map((r: { id: string; score: number; payload?: Record<string, unknown> }) => r.id);
    this.logger.log(`[VectorSearch] Hit IDs: ${hitIds.join(', ')}`);

    let pgRows;
    try {
      pgRows = await this.prisma.findSlicesByIds(hitIds);
    } catch (error) {
      this.logger.error(`[VectorSearch] PostgreSQL query failed: ${error}`);
      const prismaError = error as Error & { errorCode?: string; retryable?: boolean };
      throw serviceException(
        {
          message: prismaError.message,
          error: {
            code: prismaError.errorCode || 'INTERNAL_SERVER_ERROR',
            retryable: prismaError.retryable ?? true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(`[VectorSearch] PostgreSQL returned ${pgRows?.length || 0} rows`);

    const scoreMap = new Map<string, number>();
    qdrantResults.forEach((r: { id: string; score: number; payload?: Record<string, unknown> }) => {
      // 映射 both id and slice_id for flexible matching
      scoreMap.set(r.id, r.score);
      if (r.payload?.slice_id) {
        scoreMap.set(r.payload.slice_id as string, r.score);
      }
    });

    const rows = this.mapSliceResultToSearchRows(pgRows as unknown as Array<Record<string, unknown>>);
    const items = rows.map((row) =>
      this.mapToSearchResult(row, 'vector', scoreMap.get(row.id) ?? scoreMap.get(row.sliceId) ?? null),
    );

    this.logger.log(`[VectorSearch] Final results: ${items.length} items`);

    return {
      items,
      page_info: { cursor: null, has_more: false, total_count: items.length },
      search_source: 'vector',
    };
  }

  // ===========================================================================
  // FUSION: 并行多路召回 + Reciprocal Rank Fusion (RRF) 融合排序 (需求3)
  // ===========================================================================

  private async performFusionSearch(
    pgWhere: Record<string, unknown>,
    qdrantFilter: Record<string, unknown>,
    params: { query?: string; search_mode: string; limit: number; cursor?: string },
  ): Promise<MaterialSearchResponse> {
    this.logger.log(`[FusionSearch] Starting: query="${params.query}", limit=${params.limit}`);

    // 并行发起两路召回: 语义路径检索素材描述, 关键词路径检索标签
    const [vectorResult, keywordResult] = await Promise.allSettled([
      this.performVectorSearchRaw(qdrantFilter, params),
      this.performKeywordSearchRaw(pgWhere, params, 'all'),
    ]);

    const vectorItems = vectorResult.status === 'fulfilled'
      ? vectorResult.value.items
      : [];
    const keywordItems = keywordResult.status === 'fulfilled'
      ? keywordResult.value.items
      : [];

    this.logger.log(
      `[FusionSearch] Vector=${vectorItems.length} hits, Keyword=${keywordItems.length} hits`,
    );

    if (vectorResult.status === 'rejected') {
      this.logger.warn(`[FusionSearch] Vector path failed: ${vectorResult.reason}`);
    }
    if (keywordResult.status === 'rejected') {
      this.logger.warn(`[FusionSearch] Keyword path failed: ${keywordResult.reason}`);
    }

    // RRF 融合: score = Σ(1 / (k + rank))
    const K = MATERIAL_CONSTANTS.RRF_FUSION_K;
    const vectorRankMap = new Map<string, number>();
    const keywordRankMap = new Map<string, number>();

    vectorItems.forEach((item, idx) => {
      vectorRankMap.set(item.id, idx + 1);
    });
    keywordItems.forEach((item, idx) => {
      keywordRankMap.set(item.id, idx + 1);
    });

    // 合并去重，按 slice_id 聚合 RRF score
    const fusionScoreMap = new Map<string, { item: MaterialSliceSearchResult; rrfScore: number }>();

    for (const item of vectorItems) {
      const vr = vectorRankMap.get(item.id) ?? vectorItems.length + 1;
      const kr = keywordRankMap.get(item.id) ?? keywordItems.length + 1;
      const rrfScore = 1 / (K + vr) + 1 / (K + kr);
      fusionScoreMap.set(item.id, { item: { ...item, score: rrfScore }, rrfScore });
    }
    for (const item of keywordItems) {
      if (fusionScoreMap.has(item.id)) continue;
      const vr = vectorRankMap.get(item.id) ?? vectorItems.length + 1;
      const kr = keywordRankMap.get(item.id) ?? keywordItems.length + 1;
      const rrfScore = 1 / (K + vr) + 1 / (K + kr);
      fusionScoreMap.set(item.id, { item: { ...item, score: rrfScore }, rrfScore });
    }

    // 按 RRF score 降序排列，取 top-N
    const sorted = [...fusionScoreMap.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, params.limit);

    const items = sorted.map((entry) => ({
      ...entry.item,
      // 附加融合元信息
      search_source: 'fusion' as const,
    }));

    // Vision Analysis 增强: 对已执行过 AI 视觉分析的素材，其切片在 FUSION 中获得 1.15x 分数加成
    try {
      const uniqueMaterialIds = [...new Set(items.map(i => (i as any).material_id).filter(Boolean))] as string[];
      if (uniqueMaterialIds.length > 0) {
        const materialPoints = await this.qdrant.getPoints(uniqueMaterialIds, this.qdrant.getMaterialCollectionName());
        const visionMaterialIds = new Set(
          (materialPoints as any[])
            .filter((p: any) => !!p.payload?.has_vision_analysis)
            .map((p: any) => p.id as string),
        );
        if (visionMaterialIds.size > 0) {
          const VISION_BOOST = 1.15;
          for (const item of items) {
            const matId = (item as any).material_id;
            if (matId && visionMaterialIds.has(matId)) {
              (item as any).score = ((item as any).score ?? 0) * VISION_BOOST;
            }
          }
          // 重新按 score 降序排列
          items.sort((a, b) => ((b as any).score ?? 0) - ((a as any).score ?? 0));
          this.logger.log(`[FusionSearch] Vision boost applied: ${visionMaterialIds.size} materials enhanced`);
        }
      }
    } catch (boostErr) {
      // vision boost 失败不阻塞搜索
      this.logger.warn(`[FusionSearch] Vision boost fetch failed, skipping: ${(boostErr as Error).message}`);
    }

    this.logger.log(`[FusionSearch] Final results: ${items.length} items (RRF fused${items.some((i: any) => i.score > 0.1) ? ' + vision boost' : ''})`);

    return {
      items,
      page_info: { cursor: null, has_more: false, total_count: items.length },
      search_source: 'fusion',
    };
  }

  // ===========================================================================
  // material 级独立向量检索: 直接搜索 asset_materials Qdrant collection (需求2)
  // ===========================================================================

  private async performMaterialVectorSearch(
    qdrantFilter: Record<string, unknown>,
    params: { query?: string; limit: number; product_id: string },
  ): Promise<MaterialSearchResponse> {
    this.logger.log(`[MaterialVectorSearch] Starting: query="${params.query}", limit=${params.limit}`);

    try {
      // 生成 query embedding
      const embedding = await this.imageBind.embedQuery({ text: params.query || '' });
      if (!embedding) {
        this.logger.warn('[MaterialVectorSearch] Embedding generation failed, falling back to empty result');
        return { items: [], page_info: { cursor: null, has_more: false, total_count: 0 }, search_source: 'material_vector' };
      }

      // 直接搜索 asset_materials collection
      const materialCollection = this.qdrant.getMaterialCollectionName();
      const qdrantResults = await this.qdrant.search({
        collectionName: materialCollection,
        vector: embedding,
        filter: qdrantFilter,
        limit: params.limit,
      });

      if (!qdrantResults || qdrantResults.length === 0) {
        this.logger.log('[MaterialVectorSearch] No results from Qdrant');
        return { items: [], page_info: { cursor: null, has_more: false, total_count: 0 }, search_source: 'material_vector' };
      }

      // 提取 material_id 列表
      const materialIds = qdrantResults.map(
        (r: { id: string; payload?: Record<string, unknown> }) =>
          (r.payload?.material_id as string) || r.id,
      );

      // 回查 PostgreSQL 获取 material 详情
      const materials = await this.prisma.findMaterialsByIds(materialIds);

      // 构建 score map
      const scoreMap = new Map<string, number>();
      qdrantResults.forEach((r: { id: string; score: number; payload?: Record<string, unknown> }) => {
        const mid = (r.payload?.material_id as string) || r.id;
        scoreMap.set(mid, r.score);
      });

      // 构造返回结果
      const items = materials.map((m) => ({
        id: m.id,
        material_id: m.id,
        slice_id: `material_${m.id.slice(0, 8)}`,
        material_data: {
          id: m.id,
          file_name: m.fileName,
          type: m.type,
          status: m.status,
          thumbnail_url: m.thumbnailUrl,
          duration_seconds: m.durationSeconds ? Number(m.durationSeconds) : null,
          slices_count: m.slicesCount,
          slices: [],
        },
        score: scoreMap.get(m.id) ?? null,
        search_source: 'material_vector' as const,
      } as unknown as MaterialSliceSearchResult));

      this.logger.log(`[MaterialVectorSearch] Returned ${items.length} materials`);
      return {
        items,
        page_info: { cursor: null, has_more: false, total_count: items.length },
        search_source: 'material_vector',
      };
    } catch (error) {
      this.logger.error(`[MaterialVectorSearch] Failed: ${(error as Error).message}`);
      return { items: [], page_info: { cursor: null, has_more: false, total_count: 0 }, search_source: 'material_vector' };
    }
  }

  // ===========================================================================
  // 增强 hybrid: slice 融合结果 + material 向量直接检索 → RRF 融合 (需求2)
  // ===========================================================================

  private async performEnhancedHybridAggregation(
    sliceResult: MaterialSearchResponse,
    qdrantFilter: Record<string, unknown>,
    params: { query?: string; limit: number; product_id: string },
  ): Promise<MaterialSearchResponse> {
    // 并行执行 slice→material 聚合 和 material 直接向量检索
    const [aggregatedResult, materialVectorResult] = await Promise.allSettled([
      this.performHybridAggregation(sliceResult),
      this.performMaterialVectorSearch(qdrantFilter, params),
    ]);

    const aggItems = aggregatedResult.status === 'fulfilled' ? aggregatedResult.value.items : [];
    const mvItems = materialVectorResult.status === 'fulfilled' ? materialVectorResult.value.items : [];

    if (mvItems.length === 0) {
      // material vector 失败或空，退回纯聚合结果
      return aggregatedResult.status === 'fulfilled'
        ? aggregatedResult.value
        : { items: [], page_info: { cursor: null, has_more: false, total_count: 0 }, search_source: 'hybrid' };
    }

    if (aggItems.length === 0) {
      return materialVectorResult.status === 'fulfilled'
        ? materialVectorResult.value
        : { items: [], page_info: { cursor: null, has_more: false, total_count: 0 }, search_source: 'hybrid' };
    }

    // RRF 融合两路 material 级结果
    const K = 60;
    const aggRankMap = new Map<string, number>();
    const mvRankMap = new Map<string, number>();
    aggItems.forEach((item, idx) => aggRankMap.set(item.material_id, idx + 1));
    mvItems.forEach((item, idx) => mvRankMap.set(item.material_id, idx + 1));

    const fusionMap = new Map<string, { item: MaterialSliceSearchResult; rrfScore: number }>();
    for (const item of aggItems) {
      const ar = aggRankMap.get(item.material_id) ?? aggItems.length + 1;
      const mr = mvRankMap.get(item.material_id) ?? mvItems.length + 1;
      const rrf = 1 / (K + ar) + 1 / (K + mr);
      fusionMap.set(item.material_id, { item: { ...item, score: rrf }, rrfScore: rrf });
    }
    for (const item of mvItems) {
      if (fusionMap.has(item.material_id)) continue;
      const ar = aggRankMap.get(item.material_id) ?? aggItems.length + 1;
      const mr = mvRankMap.get(item.material_id) ?? mvItems.length + 1;
      const rrf = 1 / (K + ar) + 1 / (K + mr);
      fusionMap.set(item.material_id, { item: { ...item, score: rrf }, rrfScore: rrf });
    }

    const sorted = [...fusionMap.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, params.limit);

    return {
      items: sorted.map((e) => ({ ...e.item, search_source: 'hybrid' as const })),
      page_info: { cursor: null, has_more: false, total_count: sorted.length },
      search_source: 'hybrid',
    };
  }

  // ===========================================================================
  // hybrid 两阶段检索: slice 搜索结果聚合到 material 级 (需求1)
  // ===========================================================================

  private async performHybridAggregation(
    sliceResult: MaterialSearchResponse,
  ): Promise<MaterialSearchResponse> {
    const materialIds = [...new Set(sliceResult.items.map((item) => item.material_id))];

    if (materialIds.length === 0) {
      return { items: [], page_info: { cursor: null, has_more: false, total_count: 0 }, search_source: 'hybrid' };
    }

    // 查询 material 详情
    const materials = await this.prisma.findMaterialsByIds(materialIds);

    // 构建 material -> slices 映射
    const materialSliceMap = new Map<string, MaterialSliceSearchResult[]>();
    for (const item of sliceResult.items) {
      const existing = materialSliceMap.get(item.material_id) || [];
      existing.push(item);
      materialSliceMap.set(item.material_id, existing);
    }

    // 构造 hybrid 结果: 每个 item 是 material 级，附带 top slice 的 score
    const hybridItems = materials.map((m) => {
      const slices = materialSliceMap.get(m.id) || [];
      const maxScore = Math.max(...slices.map((s) => s.score ?? 0), 0);

      return {
        id: m.id,
        material_id: m.id,
        slice_id: `hybrid_${m.id.slice(0, 8)}`,
        material_data: {
          id: m.id,
          file_name: m.fileName,
          type: m.type,
          status: m.status,
          thumbnail_url: m.thumbnailUrl,
          duration_seconds: m.durationSeconds ? Number(m.durationSeconds) : null,
          slices_count: m.slicesCount,
          slices: slices.slice(0, 10), // 附带该 material 下匹配的 top 10 slices
        },
        score: maxScore,
        search_source: 'hybrid',
      } as unknown as MaterialSliceSearchResult;
    });

    return {
      items: hybridItems,
      page_info: { cursor: null, has_more: false, total_count: hybridItems.length },
      search_source: 'hybrid',
    };
  }

  // ===========================================================================
  // 原始向量检索 (不降级，仅返回结果或 null) — 供 FUSION 模式调用
  // ===========================================================================

  private async performVectorSearchRaw(
    qdrantFilter: Record<string, unknown>,
    params: { query?: string; limit: number },
  ): Promise<{ items: MaterialSliceSearchResult[] }> {
    try {
      const embedding = await this.imageBind.embedQuery({ text: params.query || '' });
      if (!embedding) return { items: [] };

      const collectionName = this.qdrant.getCollectionName();
      const qdrantResults = await this.qdrant.search({
        collectionName,
        vector: embedding,
        filter: qdrantFilter,
        limit: params.limit,
      });

      if (!qdrantResults || qdrantResults.length === 0) return { items: [] };

      const hitIds = qdrantResults.map((r: { id: string; payload?: Record<string, unknown> }) => r.id);

      const pgRows = await this.prisma.findSlicesByIds(hitIds);

      const scoreMap = new Map<string, number>();
      qdrantResults.forEach((r: { id: string; score: number; payload?: Record<string, unknown> }) => {
        scoreMap.set(r.id, r.score);
        if (r.payload?.slice_id) scoreMap.set(r.payload.slice_id as string, r.score);
      });

      const rows = this.mapSliceResultToSearchRows(pgRows as unknown as Array<Record<string, unknown>>);
      const items = rows.map((row) =>
        this.mapToSearchResult(row, 'vector', scoreMap.get(row.id) ?? scoreMap.get(row.sliceId) ?? null),
      );

      return { items };
    } catch (error) {
      this.logger.warn(`[VectorSearchRaw] Failed: ${(error as Error).message}`);
      return { items: [] };
    }
  }

  // ===========================================================================
  // 原始关键词检索 (不降级，仅返回结果) — 供 FUSION 模式调用
  // ===========================================================================

  private async performKeywordSearchRaw(
    pgWhere: Record<string, unknown>,
    params: { query?: string; limit: number; cursor?: string },
    scope: 'all' | 'tags' | 'descriptions' = 'all',
  ): Promise<{ items: MaterialSliceSearchResult[] }> {
    try {
      if (params.query) {
        const expandedQueries = this.synonym.expandQuery(params.query);

        // 分词：将每个 expanded query 按空格拆分为独立 token，确保单个词也能命中
        const tokenizedQueries = expandedQueries.flatMap((q: string) => {
          const tokens = q.split(/\s+/).filter((t) => t.length > 0);
          return [q, ...tokens.filter((t) => t !== q)];
        });
        const uniqueQueries = [...new Set(tokenizedQueries)];

        const orConditions = uniqueQueries.flatMap((term: string) => {
          const conditions: Record<string, unknown>[] = [];
          if (scope === 'all' || scope === 'descriptions') {
            conditions.push({ denseCaption: { contains: term, mode: 'insensitive' } });
          }
          if (scope === 'all' || scope === 'tags') {
            conditions.push(
              { tags: { path: [], string_contains: term } },
              { productDimensionTags: { path: [], string_contains: term } },
              { videoDimensionTags: { path: [], string_contains: term } },
              { sliceDimensionTags: { path: [], string_contains: term } },
            );
          }
          return conditions;
        });
        (pgWhere as Record<string, unknown>).OR = orConditions;
      }

      const result = await this.prisma.searchSlicesByKeyword(pgWhere, params.limit, params.cursor);
      const rows = this.mapSliceResultToSearchRows(result.items as unknown as Array<Record<string, unknown>>);
      const items = rows.map((row) => this.mapToSearchResult(row, 'keyword_fallback', null));
      return { items };
    } catch (error) {
      this.logger.warn(`[KeywordSearchRaw] Failed: ${(error as Error).message}`);
      return { items: [] };
    }
  }

  /**
   * 将 Prisma 切片查询结果显式映射为 MaterialSearchRow[]，消除 as unknown as 双重断言
   */
  private mapSliceResultToSearchRows(raw: Array<Record<string, unknown>>): MaterialSearchRow[] {
    return raw.map((r) => ({
      id: String(r.id ?? ''),
      materialId: String(r.materialId ?? ''),
      sliceId: String(r.sliceId ?? ''),
      startTime: Number(r.startTime ?? 0),
      endTime: Number(r.endTime ?? 0),
      duration: Number(r.duration ?? 0),
      denseCaption: (r.denseCaption as string) ?? null,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : null,
      productDimensionTags: Array.isArray(r.productDimensionTags) ? (r.productDimensionTags as string[]) : null,
      videoDimensionTags: Array.isArray(r.videoDimensionTags) ? (r.videoDimensionTags as string[]) : null,
      sliceDimensionTags: Array.isArray(r.sliceDimensionTags) ? (r.sliceDimensionTags as string[]) : null,
      streamUrl: (r.streamUrl as string) ?? null,
      keyFrameUrl: (r.keyFrameUrl as string) ?? null,
      embeddingVersion: (r.embeddingVersion as string) ?? null,
      sfxUrl: (r.sfxUrl as string) ?? null,
      status: String(r.status ?? 'PENDING'),
      createdAt: r.createdAt as Date,
      updatedAt: r.updatedAt as Date,
      material: r.material as MaterialSearchRow['material'],
    }));
  }

  private mapToSearchResult(
    row: MaterialSearchRow,
    searchSource: string,
    score: number | null,
  ): MaterialSliceSearchResult {
    const rawRow = row as unknown as Record<string, unknown>;
    const materialData = rawRow.material as Record<string, unknown> | undefined;

    return {
      id: rawRow.id as string,
      material_id: rawRow.materialId as string,
      slice_id: rawRow.sliceId as string,
      start_time: Number(rawRow.startTime),
      end_time: Number(rawRow.endTime),
      duration: Number(rawRow.duration),
      dense_caption: (rawRow.denseCaption as string) ?? null,
      tags: Array.isArray(rawRow.tags) ? (rawRow.tags as string[]) : [],
      product_dimension_tags: Array.isArray(rawRow.productDimensionTags) ? (rawRow.productDimensionTags as string[]) : [],
      video_dimension_tags: Array.isArray(rawRow.videoDimensionTags) ? (rawRow.videoDimensionTags as string[]) : [],
      slice_dimension_tags: Array.isArray(rawRow.sliceDimensionTags) ? (rawRow.sliceDimensionTags as string[]) : [],
      stream_url: (rawRow.streamUrl as string) ?? null,
      key_frame_url: (rawRow.keyFrameUrl as string) ?? null,
      embedding_version: (rawRow.embeddingVersion as string) ?? null,
      sfx_url: (rawRow.sfxUrl as string) ?? null,
      status: (rawRow.status as string) || 'PENDING',
      score,
      usage_count: (rawRow.usageCount as number) ?? 0,
      file_name: materialData?.fileName as string | undefined,
      type: materialData?.type as string | undefined,
      created_at: rawRow.createdAt instanceof Date
        ? rawRow.createdAt.toISOString()
        : (typeof rawRow.createdAt === 'string' ? new Date(rawRow.createdAt).toISOString() : String(rawRow.createdAt)),
      updated_at: rawRow.updatedAt instanceof Date
        ? rawRow.updatedAt.toISOString()
        : (typeof rawRow.updatedAt === 'string' ? new Date(rawRow.updatedAt).toISOString() : String(rawRow.updatedAt)),
    };
  }

  async reprocessMaterial(materialId: string): Promise<MaterialReprocessResponse> {
    this.validateMaterialId(materialId);

    let material = null;
    try {
      material = await this.prisma.findMaterialById(materialId);
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      const isRetryable =
        prismaError.code === 'P1001' ||
        prismaError.code === 'P2024' ||
        prismaError.code === 'P2028';
      throw serviceException(
        {
          message: `Material lookup before reprocess failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { material_id: materialId, prisma_code: prismaError.code },
            retryable: isRetryable,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!material) {
      throw serviceException(
        {
          message: `素材 ${materialId} 不存在`,
          error: {
            code: 'MATERIAL_NOT_FOUND',
            details: { material_id: materialId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：素材 product_id 非空
    if (!(material as Record<string, unknown>).productId) {
      throw serviceException(
        {
          message: '素材缺少商品归属',
          error: { code: 'MATERIAL_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const materialRecord = material as Record<string, unknown>;
    const materialStatus = materialRecord.status as string;
    this.validateReprocessStatus(materialId, materialStatus);

    const now = new Date();
    const materialType = materialRecord.type as string;
    // Handle Prisma Decimal type — toNumber() is safer than Number()
    const durationRaw = materialRecord.durationSeconds as { toNumber?: () => number } | number | null;
    const durationSeconds = durationRaw == null
      ? null
      : typeof durationRaw === 'number'
        ? durationRaw
        : typeof (durationRaw as { toNumber?: () => number }).toNumber === 'function'
          ? (durationRaw as { toNumber: () => number }).toNumber()
          : Number(durationRaw);
    const effectiveDuration = durationSeconds ?? 0;
    const slices = this.isVideoType(materialType) && effectiveDuration > 0
      ? this.computeInitialSliceBoundaries(effectiveDuration, materialId)
      : this.isImageLikeType(materialType)
        ? [
            {
              sliceId: this.buildSliceId(materialId, 1),
              startTime: 0,
              endTime: 0,
              duration: 0,
            },
          ]
        : [];

    this.logger.log(
      `[Reprocess] material=${materialId}, type=${materialType}, duration=${durationSeconds}s, slices=${slices.length}`,
    );
    const sliceParams = slices.map((s) => ({
      material_id: materialId,
      slice_id: s.sliceId,
      start_time: s.startTime,
      end_time: s.endTime,
      duration: s.duration,
      status: 'PENDING',
      tags: ([] as string[]),
      created_at: now,
      updated_at: now,
    }));

    try {
      await (this.prisma as MaterialRepository).resetMaterialForReprocess(materialId, sliceParams);
    } catch (error) {
      const err = error as Error & { errorCode?: string; statusCode?: number; retryable?: boolean; details?: unknown };
      throw serviceException(
        {
          message: err.message,
          error: {
            code: err.errorCode || 'INTERNAL_SERVER_ERROR',
            details: err.details,
            retryable: err.retryable ?? true,
          },
        },
        err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // IMAGE 类型素材（含 PRODUCT_MAIN_IMAGE）不需要 GPU 切片，直接 AI 分析后标记完成
    if (this.isImageLikeType(materialType)) {
      const originUrl = materialRecord.originUrl as string;
      const fileName = materialRecord.fileName as string;
      const thumbnailUrl = materialRecord.thumbnailUrl as string | undefined;
      const productId = materialRecord.productId as string;

      // 查商品上下文，用于 AI 图片分析
      let productContext: { product_title?: string; selling_points?: string[] } | undefined;
      try {
        const product = await this.productRepo.findProductById(productId);
        if (product) {
          productContext = {
            product_title: product.title,
            selling_points: Array.isArray(product.sellingPoints)
              ? (product.sellingPoints as string[])
              : undefined,
          };
        }
      } catch (err) {
        this.logger.warn(`[Reprocess] Failed to load product context for material ${materialId}: ${(err as Error).message}`);
      }

      await this.completeImageMaterial(
        materialId,
        slices[0].sliceId,
        originUrl,
        fileName,
        thumbnailUrl,
        productContext,
      );

      this.logger.log(`IMAGE material ${materialId} reprocessed and marked COMPLETED`);
      return {
        material_id: materialId,
        task_id: `tsk_${this.getCurrentDatePrefix()}_image_reprocess`,
        status: 'COMPLETED',
      };
    }

    // VIDEO 类型：入队 GPU 切片任务
    const enqueueResult = await this.enqueueGpuSlicingJob(materialId, false);

    this.logger.log(
      `Material reprocess initiated: material_id=${materialId}, task_id=${enqueueResult.taskId}`,
    );

    return {
      material_id: materialId,
      task_id: enqueueResult.taskId,
      status: 'PENDING',
    };
  }

  private validateReprocessStatus(materialId: string, status: string): void {
    const allowedStatuses: readonly string[] = ['COMPLETED', 'FAILED'];

    if (!allowedStatuses.includes(status)) {
      throw serviceException(
        {
          message: `素材 ${materialId} 当前状态 ${status} 不允许重新处理，仅 COMPLETED/FAILED 状态可重新处理`,
          error: {
            code: 'TASK_STATUS_CONFLICT',
            details: {
              material_id: materialId,
              current_status: status,
              allowed_statuses: allowedStatuses,
            },
            retryable: false,
          },
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  async getMaterialDetail(materialId: string): Promise<MaterialDetailResponse> {
    this.validateMaterialId(materialId);

    let row = null;
    try {
      row = await this.prisma.findMaterialById(materialId);
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      const isRetryable =
        prismaError.code === 'P1001' ||
        prismaError.code === 'P2024' ||
        prismaError.code === 'P2028';
      throw serviceException(
        {
          message: `Material detail query failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { material_id: materialId, prisma_code: prismaError.code },
            retryable: isRetryable,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!row) {
      throw serviceException(
        {
          message: `素材 ${materialId} 不存在`,
          error: {
            code: 'MATERIAL_NOT_FOUND',
            details: { material_id: materialId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：素材 product_id 非空
    if (!(row as Record<string, unknown>).productId) {
      throw serviceException(
        {
          message: '素材缺少商品归属',
          error: { code: 'MATERIAL_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const result = this.mapToMaterialDetail(row as unknown as MaterialDetailRow);

    this.logger.log(`Material detail queried: material_id=${materialId}, slices=${result.slices.length}`);

    return result;
  }

  private validateMaterialId(materialId: string): void {
    if (!materialId || materialId.trim().length === 0) {
      throw serviceException(
        {
          message: 'material_id 为必填字段',
          error: {
            code: 'INVALID_REQUEST',
            details: { field: 'material_id', reason: 'missing_or_empty' },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmed = materialId.trim();
    const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!UUID_V4_REGEX.test(trimmed)) {
      throw serviceException(
        {
          message: `material_id 不是有效的 UUID v4 格式: ${trimmed}`,
          error: {
            code: 'INVALID_REQUEST',
            details: {
              field: 'material_id',
              received: trimmed,
              expected: 'UUID v4 (e.g. 00000000-0000-4000-0000-000000000000)',
            },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private mapToMaterialDetail(row: MaterialDetailRow): MaterialDetailResponse {
    const rawSlices: MaterialDetailSliceRow[] = Array.isArray(row.slices) ? (row.slices as unknown as MaterialDetailSliceRow[]) : [];

    const sortedSlices = [...rawSlices].sort(
      (a, b) => Number(a.startTime ?? 0) - Number(b.startTime ?? 0),
    );

    const material: MaterialDetailItem = {
      material_id: row.id,
      product_id: row.productId,
      file_name: row.fileName,
      type: row.type,
      source_type: row.sourceType,
      origin_url: this.rewriteStorageUrl(row.originUrl) ?? row.originUrl,
      thumbnail_url: this.rewriteStorageUrl(row.thumbnailUrl) ?? row.thumbnailUrl ?? null,
      file_size_bytes: Number(row.fileSizeBytes),
      duration_seconds: row.durationSeconds ?? null,
      width: row.width ?? null,
      height: row.height ?? null,
      mime_type: row.mimeType ?? null,
      status: row.status,
      slices_count: row.slicesCount,
      remark: row.remark ?? null,
      vision_analysis: (row.visionAnalysisJson as VisionAnalysisResult) ?? null,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
      product: row.product
        ? {
            id: row.product.id,
            title: row.product.title,
            category: row.product.category,
            selling_points: row.product.sellingPoints,
          }
        : null,
    };

    const slices: MaterialDetailSlice[] = sortedSlices.map((s) => ({
      id: s.id,
      material_id: s.materialId,
      slice_id: s.sliceId,
      start_time: Number(s.startTime),
      end_time: Number(s.endTime),
      duration: Number(s.duration),
      dense_caption: s.denseCaption ?? null,
      tags: Array.isArray(s.tags) ? s.tags : [],
      product_dimension_tags: Array.isArray(s.productDimensionTags) ? s.productDimensionTags : [],
      video_dimension_tags: Array.isArray(s.videoDimensionTags) ? s.videoDimensionTags : [],
      slice_dimension_tags: Array.isArray(s.sliceDimensionTags) ? s.sliceDimensionTags : [],
      stream_url: this.rewriteStorageUrl(s.streamUrl) ?? s.streamUrl ?? null,
      key_frame_url: this.rewriteStorageUrl(s.keyFrameUrl) ?? s.keyFrameUrl ?? null,
      embedding_version: s.embeddingVersion ?? null,
      sfx_url: this.rewriteStorageUrl(s.sfxUrl) ?? s.sfxUrl ?? null,
      status: s.status,
      created_at: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
      updated_at: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : String(s.updatedAt),
    }));

    return { material, slices };
  }

  async handleJobFailureCallback(callback: MaterialJobFailureCallbackRequest): Promise<void> {
    const { material_id, status, error_message, trace_id } = callback;

    if (!material_id || !status || !error_message || !trace_id) {
      throw serviceException(
        {
          message: 'Missing required fields: material_id, status, error_message, trace_id',
          error: {
            code: 'INVALID_REQUEST',
            details: {
              material_id: material_id || '(missing)',
              status: status || '(missing)',
              error_message: error_message || '(missing)',
              trace_id: trace_id || '(missing)',
            },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (status !== 'FAILED') {
      throw serviceException(
        {
          message: `Invalid material job status: ${status}`,
          error: {
            code: 'INVALID_REQUEST',
            details: { material_id, status, allowed: ['FAILED'] },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.validateMaterialId(material_id);

    try {
      await this.prisma.markMaterialJobFailed(material_id, error_message);
    } catch (error) {
      const prismaError = error as Error & { code?: string };

      if (prismaError.code === 'P2025') {
        throw serviceException(
          {
            message: `Material not found: ${material_id}`,
            error: {
              code: 'MATERIAL_NOT_FOUND',
              details: { material_id },
              retryable: false,
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      throw serviceException(
        {
          message: `Database error during material job failure callback: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { material_id, prisma_code: prismaError.code },
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.error(
      `Material ${material_id} marked FAILED from job-level callback, trace_id=${trace_id}, reason=${error_message}`,
    );
  }

  async handleSliceCallback(callback: SliceCallbackRequest): Promise<void> {
    const { material_id, slice_id, status, stream_url, key_frame_url, dense_caption, tags, start_time, end_time, duration, sfx_url, crop_region, trace_id } = callback;

    this.logger.log(
      `[DEBUG] Slice callback received: material=${material_id}, slice=${slice_id}, status=${status}, trace_id=${trace_id}`,
    );

    if (!material_id || !slice_id || !status) {
      throw serviceException(
        {
          message: 'Missing required fields: material_id, slice_id, status',
          error: {
            code: 'INVALID_REQUEST',
            details: { material_id: material_id || '(missing)', slice_id: slice_id || '(missing)', status: status || '(missing)' },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!VALID_SLICE_STATUSES.includes(status)) {
      throw serviceException(
        {
          message: `Invalid slice status: ${status}`,
          error: {
            code: 'INVALID_REQUEST',
            details: { slice_id, status, allowed: VALID_SLICE_STATUSES },
            retryable: false,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 问题 1: 用 typed repository 调用替代 (this.prisma as any)
    try {
      // 分类标签到三维度（产品/视频/切片），解锁关键字搜索的维度过滤
      const sliceTags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? (tags as string).split(',').map((s: string) => s.trim()) : []);
      const { productDimensionTags, videoDimensionTags, sliceDimensionTags } =
        this.classifyDimensionTags(sliceTags, []);

      await this.prisma.upsertSlice(material_id, slice_id, {
        status,
        stream_url,
        key_frame_url,
        dense_caption,
        tags: tags || undefined,
        product_dimension_tags: productDimensionTags,
        video_dimension_tags: videoDimensionTags,
        slice_dimension_tags: sliceDimensionTags,
        start_time,
        end_time,
        duration,
        sfx_url,
        crop_region,
        updated_at: new Date(),
      });
    } catch (error) {
      const prismaError = error as Error & { code?: string };

      if (prismaError.code === 'P2002') {
        throw serviceException(
          {
            message: `Unique constraint violation for slice: ${slice_id}`,
            error: {
              code: 'MATERIAL_IDEMPOTENCY_CONFLICT',
              details: { slice_id },
              retryable: false,
            },
          },
          HttpStatus.CONFLICT,
        );
      }

      throw serviceException(
        {
          message: `Database error during slice callback: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { slice_id, prisma_code: prismaError.code },
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const allSlices = await this.prisma.findSlicesByMaterialId(material_id);

      if (!allSlices || allSlices.length === 0) {
        return; // 无切片数据，等待后续回调
      }

      const allProcessed = allSlices.every(
        (slice: { status: string }) =>
          slice.status === 'COMPLETED' || slice.status === 'FAILED',
      );

      if (allProcessed) {
        const hasFailed = allSlices.some(
          (slice: { status: string }) => slice.status === 'FAILED',
        );

        // Clean up any leftover PENDING slices that the GPU worker didn't process
        // This handles mismatch between initial slice count and worker segment count
        const cleaned = await this.prisma.deletePendingSlicesForMaterial(material_id);

        // Sync slicesCount to actual non-PENDING slice count
        const actualCount = allSlices.length - cleaned;
        // Allow transition from PENDING or PROCESSING — the material may still be
        // PENDING if GPU worker sends individual slice callbacks without first
        // transitioning the material to PROCESSING.
        const targetStatus = hasFailed ? 'FAILED' : 'COMPLETED';
        await this.prisma.updateMaterialStatus(
          material_id,
          targetStatus,
        );

        this.logger.log(
          `Material ${material_id} status updated to ${hasFailed ? 'FAILED' : 'COMPLETED'} (slices=${actualCount}, cleaned=${cleaned})`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to update material status aggregation for material_id=${material_id} slice_id=${slice_id}: ${err.message}`,
        err instanceof Error ? err.stack : '',
      );
    }

    // 索引 Qdrant（始终索引所有已完成切片，非严格模式下无描述切片降级使用 tags+文件名）
    try {
      if (status === 'COMPLETED') {
        await this.indexSliceToQdrant(slice_id);
        this.logger.debug(`Indexed slice ${slice_id} to Qdrant`);
      }
    } catch (error) {
      this.logger.warn(
        `Qdrant indexing failed for slice ${slice_id}: ${(error as Error).message}`,
      );
    }

    // 索引已完成，继续后续流程
  }

  /**
   * Handle batch-complete callback from GPU worker.
   * After all segments are processed, clean up leftover PENDING slices
   * and ensure the material status is correctly aggregated.
   */
  async handleBatchCallback(materialId: string): Promise<void> {
    this.logger.log(`[BatchCallback] Received for material=${materialId}`);

    try {
      // Clean up leftover PENDING slices that the worker didn't process
      // (handles mismatch between initial DB slice count and worker segment count)
      const cleaned = await this.prisma.deletePendingSlicesForMaterial(materialId);

      if (cleaned > 0) {
        this.logger.log(`[BatchCallback] Cleaned up ${cleaned} unprocessed PENDING slices for material=${materialId}`);
      }

      // Check if all remaining slices are now processed
      const allSlices = await this.prisma.findSlicesByMaterialId(materialId);
      const allProcessed = allSlices.every(
        (slice: { status: string }) =>
          slice.status === 'COMPLETED' || slice.status === 'FAILED',
      );

      if (allProcessed && allSlices.length > 0) {
        const hasFailed = allSlices.some(
          (slice: { status: string }) => slice.status === 'FAILED',
        );

        await this.prisma.updateMaterialStatus(
          materialId,
          hasFailed ? 'FAILED' : 'COMPLETED',
        );

        this.logger.log(
          `[BatchCallback] Material ${materialId} status updated to ${hasFailed ? 'FAILED' : 'COMPLETED'} (slices=${allSlices.length})`,
        );

        if (!hasFailed) {
          fireAndForget(this.logger, 'buildMaterialEmbedding', this.buildMaterialEmbeddingIfCompleted(materialId));
        }
      } else if (allSlices.length === 0) {
        this.logger.warn(
          `[BatchCallback] No slices remaining for material=${materialId} after cleanup`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[BatchCallback] Failed for material=${materialId}: ${err.message}`);
    }
  }

  /**
   * 定时检测 pending 状态超时素材（手动调用版）
   * 每分钟检查超过 10 分钟仍处于 pending 状态的素材，并记录警告日志
   */
  async checkPendingTimeout(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const staleMaterials = await this.prisma.findStalePendingMaterials(staleThreshold, 10);

    if (staleMaterials.length > 0) {
      this.logger.warn(
        `[PENDING_TIMEOUT] Found ${staleMaterials.length} stale PENDING materials (older than 10 minutes): ` +
        staleMaterials.map(m => `${m.id} (${m.fileName})`).join(', '),
      );

      for (const material of staleMaterials) {
        this.logger.warn(
          `[PENDING_TIMEOUT] Material ${material.id} pending since ${material.createdAt.toISOString()}`,
        );
      }
    }
  }

  private static readonly EMBEDDING_VERSION = 'text-embed-v1';

  private parseTagsValue(tags: unknown): string[] {
    if (Array.isArray(tags)) {
      return tags.filter((tag): tag is string => typeof tag === 'string');
    }
    if (typeof tags === 'string') {
      try {
        const parsed = JSON.parse(tags) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((tag): tag is string => typeof tag === 'string');
        }
      } catch {
        // 尝试作为逗号分隔字符串解析（非 JSON 格式标签的兜底）
        const trimmed = tags.trim();
        if (trimmed.length > 0) {
          this.logger.warn(
            `Failed to JSON.parse tags, falling back to comma-split: "${trimmed.substring(0, 200)}"`,
          );
          return trimmed
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        }
        this.logger.warn(`Failed to parse tags as JSON and empty string, returning []`);
        return [];
      }
    }
    return [];
  }

  private buildEmbeddingText(denseCaption: string, tags: string[]): string {
    const tagText = tags.length > 0 ? tags.join(' ') : '';
    return [denseCaption.trim(), tagText].filter(Boolean).join(' ');
  }

  private buildFallbackEmbeddingText(tags: string[], fileName?: string): string {
    const tagText = tags.length > 0 ? tags.join(' ') : '';
    const namePart = fileName ? `${fileName}` : '';
    return [namePart, tagText].filter(Boolean).join(' ');
  }

  async indexSliceToQdrant(sliceId: string): Promise<void> {
    const slice = await this.prisma.findSliceBySliceId(sliceId);
    if (!slice || slice.status !== 'COMPLETED') {
      return;
    }

    const tags = this.parseTagsValue(slice.tags);
    const hasCaption = !!slice.denseCaption?.trim();
    const embedText = hasCaption
      ? this.buildEmbeddingText(slice.denseCaption!, tags)
      : this.buildFallbackEmbeddingText(tags, slice.material?.fileName);
    const embedding = await this.imageBind.embedQuery({ text: embedText });

    if (!embedding) {
      this.logger.warn(`Skip Qdrant upsert for slice ${sliceId}: embedding unavailable`);
      return;
    }

    const material = slice.material;
    // 提取维度标签用于 Qdrant payload 过滤
    const productDimTags = this.parseTagsValue((slice as any).productDimensionTags);
    const videoDimTags = this.parseTagsValue((slice as any).videoDimensionTags);
    const sliceDimTags = this.parseTagsValue((slice as any).sliceDimensionTags);

    await this.qdrant.upsertPoint({
      id: slice.id,
      vector: embedding,
      payload: {
        slice_id: slice.sliceId,
        material_id: slice.materialId,
        product_id: material.productId,
        type: material.type,
        status: slice.status,
        duration: Number(slice.duration),
        // 冗余语义文本，减少搜索时回查 PostgreSQL 的次数
        caption_preview: slice.denseCaption?.substring(0, 200) || undefined,
        tags_sample: tags.slice(0, 8),
        product_dim_tags: productDimTags.slice(0, 5),
        video_dim_tags: videoDimTags.slice(0, 5),
        slice_dim_tags: sliceDimTags.slice(0, 5),
      },
    });

    await this.prisma.updateSliceStatus(sliceId, {
      status: slice.status,
      embedding_version: MaterialService.EMBEDDING_VERSION,
      updated_at: new Date(),
    });

    this.logger.log(`Slice indexed to Qdrant: slice_id=${sliceId}, version=${MaterialService.EMBEDDING_VERSION}`);

    // 素材级 embedding: 检查该 material 下所有 slice 是否都已 COMPLETED (需求1)
    try {
      await this.buildMaterialEmbeddingIfCompleted(slice.materialId);
    } catch (error) {
      this.logger.warn(`Material embedding build check failed for material=${slice.materialId}: ${(error as Error).message}`);
    }
  }

  /**
   * 构建素材级 (material) embedding: mean pooling 所有 COMPLETED slices 的向量 (需求1)
   */
  async buildMaterialEmbeddingIfCompleted(materialId: string): Promise<void> {
    // 检查是否所有 slice 都已 COMPLETED
    const material = await this.prisma.findMaterialById(materialId);
    if (!material) return;

    const allSlices = await this.prisma.findSlicesByMaterialId(materialId);
    const completedSlices = allSlices.filter((s: { status: string }) => s.status === 'COMPLETED');
    const totalSlices = allSlices.length;

    if (completedSlices.length === 0 || completedSlices.length !== totalSlices) {
      // 还有 PENDING/PROCESSING/FAILED 的 slice，等待全部完成
      return;
    }

    // 收集所有 COMPLETED slice 的向量 (从 Qdrant 读取)
    const sliceIds = completedSlices.map((s: any) => s.id ?? s.sliceId);
    const points = await this.qdrant.getPoints(sliceIds);
    const vectors = points.filter((p) => p.vector && p.vector.length > 0).map((p) => p.vector!);

    if (vectors.length === 0) {
      this.logger.warn(`No valid vectors found for material=${materialId}, skipping material embedding`);
      return;
    }

    // Mean pooling: 逐维求均值
    const dim = this.qdrant.getVectorSize();
    const pooledVector: number[] = new Array(dim).fill(0);
    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        pooledVector[i] += vec[i];
      }
    }
    for (let i = 0; i < dim; i++) {
      pooledVector[i] /= vectors.length;
    }

    // L2 归一化
    const norm = Math.sqrt(pooledVector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        pooledVector[i] /= norm;
      }
    }

    // 写入 asset_materials collection
    const materialData = material as Record<string, unknown>;
    await this.qdrant.upsertPoint({
      id: materialId,
      vector: pooledVector,
      payload: {
        material_id: materialId,
        product_id: materialData.productId,
        type: materialData.type,
        status: 'COMPLETED',
        slices_count: completedSlices.length,
      },
    }, this.qdrant.getMaterialCollectionName());

    this.logger.log(
      `Material embedding built: material=${materialId}, slices=${completedSlices.length}/${totalSlices}, dim=${dim}`,
    );

    // 缺口3: 生成 Material 级视频整体摘要 (LLM 聚合所有 slice 的 denseCaption)
    fireAndForget(this.logger, 'generateMaterialSummary', this.generateMaterialSummary(materialId, completedSlices.map((s: { sliceId: string }) => s.sliceId)));
  }

  /**
   * 将 Vision Analysis 的文本特征（product_features + selling_points + style_tags）向量化
   * 并更新到 Qdrant asset_materials collection，使素材级语义检索更精准
   */
  private async indexVisionAnalysisToQdrant(
    materialId: string,
    result: { product_features?: string[]; visual_selling_points?: string[]; style_tags?: string[] },
  ): Promise<void> {
    try {
      const parts: string[] = [];
      if (result.product_features?.length) parts.push(result.product_features.join('，'));
      if (result.visual_selling_points?.length) parts.push(result.visual_selling_points.join('，'));
      if (result.style_tags?.length) parts.push(result.style_tags.join('，'));

      if (parts.length === 0) return;

      const embedText = parts.join('；');
      const embedding = await this.imageBind.embedQuery({ text: embedText });
      if (!embedding || embedding.length === 0) {
        this.logger.warn(`[VisionAnalysis] Skip Qdrant indexing for material ${materialId}: embedding unavailable`);
        return;
      }

      const material = await this.prisma.findMaterialById(materialId);
      if (!material) return;

      await this.qdrant.upsertPoint({
        id: materialId,
        vector: embedding,
        payload: {
          material_id: materialId,
          product_id: (material as any).productId,
          type: (material as any).type,
          status: (material as any).status,
          has_vision_analysis: true,
          style_tags: result.style_tags ?? [],
          product_features: (result.product_features ?? []).slice(0, 6),
        },
      }, this.qdrant.getMaterialCollectionName());

      this.logger.log(`[VisionAnalysis] Indexed vision text to Qdrant for material ${materialId}`);
    } catch (error) {
      this.logger.warn(`[VisionAnalysis] Failed to index vision text for material ${materialId}: ${(error as Error).message}`);
    }
  }

  async reindexEmbeddings(options?: { limit?: number; cursor?: string }): Promise<{
    indexed: number;
    skipped: number;
    failed: number;
    next_cursor: string | null;
    has_more: boolean;
  }> {
    const limit = options?.limit ?? 100;
    const { items, hasMore, nextCursor } = await this.prisma.findCompletedSlicesForReindex(limit, options?.cursor);

    let indexed = 0;
    const skipped = 0;
    let failed = 0;

    for (const slice of items) {
      try {
        await this.indexSliceToQdrant(slice.sliceId);
        indexed += 1;
      } catch (error) {
        failed += 1;
        const err = error as Error;
        this.logger.warn(`Reindex failed for slice ${slice.sliceId}: ${err.message}`);
      }
    }

    return {
      indexed,
      skipped,
      failed,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  // ===========================================================================
  // 分片上传支持
  // ===========================================================================

  private static readonly CHUNK_UPLOAD_PREFIX = 'chunked-uploads';  // MinIO 对象前缀
  private static readonly CHUNK_UPLOAD_EXPIRY_SEC = 24 * 60 * 60;   // Redis TTL: 24h
  private static readonly CHUNK_LOCAL_DIR = '/tmp/uploads/chunks';   // 保留兼容

  /**
   * 初始化分片上传
   */
  async initChunkedUpload(params: {
    upload_id: string;
    file_name: string;
    file_size: number;
    chunk_size: number;
    total_chunks: number;
    product_id: string;
    type: 'IMAGE' | 'VIDEO';
    remark?: string;
  }): Promise<{ upload_id: string; chunk_size: number; total_chunks: number }> {
    const { upload_id, file_name, file_size, chunk_size, total_chunks, product_id, type, remark } = params;

    this.logger.log(`[ChunkedUpload] Initializing: upload_id=${upload_id}, file=${file_name}, size=${file_size}, chunks=${total_chunks}`);

    // 验证商品存在
    const product = await this.prisma.findProductById(product_id);
    if (!product) {
      throw serviceException(
        {
          message: 'PRODUCT_NOT_FOUND: specified product does not exist',
          error: { code: 'PRODUCT_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 保存上传元数据到 Redis
    const metaKey = `chunk:meta:${upload_id}`;
    const metadata = {
      upload_id,
      file_name,
      file_size,
      chunk_size,
      total_chunks,
      product_id,
      type,
      remark,
      created_at: new Date().toISOString(),
      completed_chunks: [] as number[],
      status: 'uploading',
    };
    await this.redis.set(metaKey, JSON.stringify(metadata), 'EX', MaterialService.CHUNK_UPLOAD_EXPIRY_SEC);

    this.logger.log(`[ChunkedUpload] Upload initialized: ${upload_id}`);

    return { upload_id, chunk_size, total_chunks };
  }

  /**
   * 上传单个分片
   */
  async uploadChunk(uploadId: string, chunkIndex: number, chunkBuffer: Buffer): Promise<void> {
    // 从 Redis 读取元数据
    let metadata: Record<string, unknown>;
    const raw = await this.redis.get(`chunk:meta:${uploadId}`);
    if (!raw) {
      throw serviceException(
        {
          message: `Upload not found: ${uploadId}`,
          error: { code: 'UPLOAD_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      metadata = JSON.parse(raw);
    } catch {
      throw serviceException(
        {
          message: `Corrupted chunk metadata for upload: ${uploadId}`,
          error: { code: 'JSON_PARSE_ERROR', retryable: false },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 验证分片索引
    const totalChunks = metadata.total_chunks as number;
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw serviceException(
        {
          message: `Invalid chunk index: ${chunkIndex}, expected 0-${totalChunks - 1}`,
          error: { code: 'INVALID_CHUNK_INDEX', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 上传分片到 MinIO
    const chunkObjectKey = `${MaterialService.CHUNK_UPLOAD_PREFIX}/${uploadId}/chunk_${String(chunkIndex).padStart(6, '0')}`;
    await this.minio.putObject({
      buffer: chunkBuffer,
      objectKey: chunkObjectKey,
      mimeType: 'application/octet-stream',
      fileSizeBytes: chunkBuffer.length,
    });

    // 原子操作：使用 Lua 脚本更新 Redis 中的已完成分片，防止并发写入丢失
    const metaKey = `chunk:meta:${uploadId}`;
    const luaScript = `
      local meta = redis.call('GET', KEYS[1])
      if not meta then return nil end
      local data = cjson.decode(meta)
      local completed = data.completed_chunks or {}
      local chunkIndex = tonumber(ARGV[1])
      local found = false
      for _, v in ipairs(completed) do
        if v == chunkIndex then found = true; break end
      end
      if not found then
        table.insert(completed, chunkIndex)
        table.sort(completed)
        data.completed_chunks = completed
        redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ARGV[2])
      end
      return #completed
    `;
    const completedCount = await this.redis.eval(
      luaScript,
      1,
      metaKey,
      chunkIndex,
      MaterialService.CHUNK_UPLOAD_EXPIRY_SEC,
    );
    if (completedCount === null) {
      this.logger.warn(`[ChunkedUpload] Redis meta key disappeared during chunk update: ${uploadId}`);
    }

    this.logger.log(`[ChunkedUpload] Chunk uploaded: upload_id=${uploadId}, chunk=${chunkIndex}/${totalChunks - 1}, total_completed=${completedCount}`);
  }

  /**
   * 完成分片上传，合并所有分片
   */
  async completeChunkedUpload(uploadId: string): Promise<{ material_id: string; file_name: string; status: string; thumbnail_url?: string }> {
    // 从 Redis 读取元数据
    let metadata: Record<string, unknown>;
    const raw = await this.redis.get(`chunk:meta:${uploadId}`);
    if (!raw) {
      throw serviceException(
        {
          message: `Upload not found: ${uploadId}`,
          error: { code: 'UPLOAD_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      metadata = JSON.parse(raw);
    } catch {
      throw serviceException(
        {
          message: `Corrupted chunk metadata for upload: ${uploadId}`,
          error: { code: 'JSON_PARSE_ERROR', retryable: false },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const totalChunks = metadata.total_chunks as number;
    const completedChunks = metadata.completed_chunks as number[];
    const fileSize = metadata.file_size as number;

    // 验证 totalChunks 合法性
    if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 1000) {
      throw serviceException(
        {
          message: `Invalid total_chunks: ${totalChunks}`,
          error: { code: 'INVALID_CHUNK_COUNT', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 验证所有分片都已上传
    if (completedChunks.length !== totalChunks) {
      throw serviceException(
        {
          message: `Incomplete upload: ${completedChunks.length}/${totalChunks} chunks uploaded`,
          error: { code: 'INCOMPLETE_UPLOAD', retryable: true },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`[ChunkedUpload] Merging chunks from MinIO: upload_id=${uploadId}, chunks=${totalChunks}`);

    // 从 MinIO 逐个拉取分片到内存后合并
    const chunkBuffers: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkObjectKey = `${MaterialService.CHUNK_UPLOAD_PREFIX}/${uploadId}/chunk_${String(i).padStart(6, '0')}`;
      const result = await this.minio.getObject(chunkObjectKey);
      chunkBuffers.push(result.buffer);
    }
    const mergedBuffer = Buffer.concat(chunkBuffers);

    // 验证合并后的文件大小
    if (mergedBuffer.length !== fileSize) {
      throw serviceException(
        {
          message: `File size mismatch: expected ${fileSize}, got ${mergedBuffer.length}`,
          error: { code: 'FILE_SIZE_MISMATCH', retryable: false },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`[ChunkedUpload] Chunks merged in memory: size=${mergedBuffer.length}`);

    // 创建模拟的 Express.Multer.File 对象
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: metadata.file_name as string,
      encoding: '7bit',
      mimetype: this.getMimeType(metadata.file_name as string),
      size: mergedBuffer.length,
      buffer: mergedBuffer,
      stream: null as unknown as import('node:stream').Readable,
      destination: '',
      filename: '',
      path: '',
    };

    // 调用标准的 uploadMaterial 方法
    const dto = {
      product_id: metadata.product_id as string,
      type: metadata.type as 'IMAGE' | 'VIDEO',
      source_type: 'UPLOAD' as const,
      remark: metadata.remark as string | undefined,
      qdrant_skip: false,
    };

    try {
      const result = await this.uploadMaterial(dto, mockFile);

      this.logger.log(`[ChunkedUpload] Upload completed: material_id=${result.material_id}`);

      // 仅在成功时清理，保留分片以便失败时重试
      await this.cleanupChunkedUpload(uploadId);

      return { material_id: result.material_id, file_name: result.file_name, status: result.status, thumbnail_url: result.thumbnail_url };
    } catch (error) {
      this.logger.warn(
        `[ChunkedUpload] Upload failed, chunks preserved for retry: upload_id=${uploadId}, error=${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 获取分片上传状态
   */
  async getChunkedUploadStatus(uploadId: string): Promise<{
    upload_id: string;
    completed_chunks: number[];
    total_chunks: number;
    status: string;
  }> {
    const raw = await this.redis.get(`chunk:meta:${uploadId}`);
    if (!raw) {
      throw serviceException(
        {
          message: `Upload not found: ${uploadId}`,
          error: { code: 'UPLOAD_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const metadata = JSON.parse(raw);
    return {
      upload_id: uploadId,
      completed_chunks: metadata.completed_chunks as number[],
      total_chunks: metadata.total_chunks as number,
      status: metadata.status as string,
    };
  }

  /**
   * 清理分片上传的 MinIO 对象和 Redis 元数据
   */
  private async cleanupChunkedUpload(uploadId: string): Promise<void> {
    try {
      // 尝试读取元数据以获取 total_chunks
      const raw = await this.redis.get(`chunk:meta:${uploadId}`);
      if (raw) {
        const metadata = JSON.parse(raw);
        const totalChunks = metadata.total_chunks as number;

        // 删除 MinIO 中的分片对象
        for (let i = 0; i < totalChunks; i++) {
          const chunkObjectKey = `${MaterialService.CHUNK_UPLOAD_PREFIX}/${uploadId}/chunk_${String(i).padStart(6, '0')}`;
          try {
            await this.minio.deleteObject(chunkObjectKey);
          } catch {
            // 单个分片删除失败不阻断整体流程
            this.logger.warn(`[ChunkedUpload] Failed to delete MinIO chunk: ${chunkObjectKey}`);
          }
        }
      }

      // 删除 Redis 元数据
      await this.redis.del(`chunk:meta:${uploadId}`);

      this.logger.log(`[ChunkedUpload] Cleanup done: ${uploadId}`);
    } catch (error) {
      this.logger.warn(`[ChunkedUpload] Cleanup failed for ${uploadId}: ${error}`);
    }
  }

  /**
   * 搜索日志写入 (需求3: 智能召回基础设施)
   */
  private async writeSearchLog(query: string, hitCount: number): Promise<void> {
    if (!query || query.trim().length === 0) return;
    try {
      await this.prisma.createUserSearchLog({
        query: query.trim(),
        hitCount,
      });
    } catch (error) {
      this.logger.warn(`Write search log failed (non-blocking): ${(error as Error).message}`);
    }
  }

  /**
   * 热度加权 + 时间衰减重新排序 (需求3: 智能召回)
   *
   * 对搜索结果中的 slice 级结果做后处理排序:
   *   finalScore = baseScore * 0.7 + hotBoost * 0.2 + timeDecay * 0.1
   *
   * - baseScore: 原始相似度分数 (Qdrant/RRF/keyword)
   * - hotBoost: 使用热度加权 (log(1+usage_count) 归一化)
   * - timeDecay: 时间衰减 (新素材 boost)
   *
   * 注意: material 级结果 (hybrid/material_vector) 不做此处理
   */
  private applyHotBoostReRanking(result: MaterialSearchResponse): MaterialSearchResponse {
    const items = result.items;
    if (items.length <= 1) return result;

    // 仅对明确定义为 slice 级的搜索来源做热度重排序（白名单，避免 hybrid/material 级误入）
    const sliceLevelSources = new Set(['vector', 'keyword_fallback', 'keyword']);
    const isSliceLevel = sliceLevelSources.has(result.search_source ?? '');
    if (!isSliceLevel) return result;

    const now = Date.now();
    const maxUsageCount = Math.max(...items.map((it) => (it.usage_count ?? 0)), 1);

    const scored = items.map((item) => {
      const baseScore = item.score ?? 0;

      // 热度加权 (log 衰减归一化)
      const usageCount = item.usage_count ?? 0;
      const hotBoost = usageCount > 0 ? Math.log(1 + usageCount) / Math.log(1 + maxUsageCount) : 0;

      // 时间衰减 (新素材 boost): 创建越近权重越高
      let timeDecay = 0.5;
      if (item.created_at) {
        const ageDays = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
        timeDecay = 1 / (1 + ageDays * 0.05);
      }

      const finalScore = baseScore * 0.7 + hotBoost * 0.2 + timeDecay * 0.1;
      return { item, finalScore };
    });

    scored.sort((a, b) => b.finalScore - a.finalScore);

    return {
      ...result,
      items: scored.map((s) => ({ ...s.item, score: s.finalScore })),
    };
  }

  /**
   * 根据文件名获取 MIME 类型
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 缺口3: 生成 Material 级视频整体摘要
   */
  private async generateMaterialSummary(materialId: string, sliceIds: string[]): Promise<void> {
    try {
      const slices = await this.prisma.findSlicesByMaterialId(materialId);
      const completedSlices = slices.filter((s: any) => s.status === 'COMPLETED' && s.denseCaption);
      if (completedSlices.length === 0) return;

      const captions = completedSlices.map((s: any) => s.denseCaption).filter(Boolean);
      const captionsText = captions.map((c: string, i: number) => '[Shot ' + (i + 1) + '] ' + c).join('\n');
      const systemPrompt = '你是电商视频分析助手，请将多个分镜描述聚合为2-3句话的完整视频摘要。';
      const userPrompt = captionsText + '\n\n请生成整体摘要:';
      const summary = await this.doubaoText.generateText(systemPrompt, userPrompt);
      if (!summary || !summary.trim()) return;
      await this.prisma.updateMaterialSummary(materialId, summary.trim());
      this.logger.log('Material summary generated: material=' + materialId);
    } catch (error) {
      this.logger.warn('generateMaterialSummary failed for ' + materialId + ': ' + ((error) as Error).message);
    }
  }

  // =============================================================================
  // 问题 5: 定时孤儿临时文件清理 (OnModuleInit)
  // =============================================================================

  onModuleInit(): void {
    this.logger.log('MaterialService initialized — starting scheduled orphan cleanup');
    this.cleanupIntervalId = setInterval(() => {
      void this.scheduledChunkCleanup().catch((err) => {
        this.logger.warn(`Orphan cleanup failed: ${(err as Error)?.message || err}`);
      });
    }, MATERIAL_CONSTANTS.CHUNK.CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    // 关闭 Redis 客户端，防止连接泄漏
    try { this.redis.disconnect(); } catch { /* 静默忽略关闭异常 */ }
    this.logger.log('MaterialService destroyed — timers and Redis connection cleaned up');
  }

  /**
   * 问题 5: 定期扫描并清理孤儿分片上传（Redis 元数据 + MinIO 分片对象）
   * Redis key 自身有 TTL，此处作为额外保障清理 MinIO 孤儿对象
   */
  private consecutiveRedisScanFailures = 0;

  private async scheduledChunkCleanup(): Promise<void> {
    try {
      let cleaned = 0;
      let cursor = '0';

      do {
        const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'chunk:meta:*', 'COUNT', 100);
        cursor = newCursor;
        this.consecutiveRedisScanFailures = 0;

        for (const key of keys) {
          if (cleaned >= MATERIAL_CONSTANTS.CHUNK.MAX_CLEANUP_PER_RUN) break;

          const uploadId = key.replace('chunk:meta:', '');
          const raw = await this.redis.get(key);
          if (!raw) continue;

          const metadata = JSON.parse(raw);
          const createdAt = new Date(metadata.created_at as string).getTime();
          const now = Date.now();

          if (now - createdAt > MATERIAL_CONSTANTS.CHUNK.ORPHAN_THRESHOLD_MS) {
            // 校验 total_chunks 合法性，防止元数据篡改导致无限循环
            const totalChunks = Math.floor(Number(metadata.total_chunks));
            if (!isFinite(totalChunks) || totalChunks <= 0 || totalChunks > 1000) {
              this.logger.warn(
                `[ChunkCleanup] Skipped orphan ${uploadId}: invalid total_chunks=${metadata.total_chunks}`,
              );
              await this.redis.del(key);
              cleaned++;
              continue;
            }

            // 删除 MinIO 中的分片对象
            for (let i = 0; i < totalChunks; i++) {
              const chunkObjectKey = `${MaterialService.CHUNK_UPLOAD_PREFIX}/${uploadId}/chunk_${String(i).padStart(6, '0')}`;
              await this.minio.deleteObject(chunkObjectKey).catch((err) => {
                this.logger.warn(`MinIO orphan chunk delete failed for ${chunkObjectKey}: ${(err as Error)?.message || err}`);
              });
            }
            // 删除 Redis 元数据
            await this.redis.del(key);
            cleaned++;
            this.logger.log(`[ChunkCleanup] Removed orphan: ${uploadId}`);
          }
        }
      } while (cursor !== '0');

      if (cleaned > 0) {
        this.logger.log(`[ChunkCleanup] Cleaned ${cleaned} orphan chunk uploads`);
      }
    } catch (error) {
      this.consecutiveRedisScanFailures++;
      const level = this.consecutiveRedisScanFailures >= 3 ? 'error' : 'warn';
      this.logger[level](`[ChunkCleanup] Scan failed (consecutive=${this.consecutiveRedisScanFailures}): ${(error as Error).message}`);
    }
  }

  // =============================================================================
  // 问题 6: MinIO 孤立对象日志记录
  // =============================================================================

  /**
   * 问题 6: 当 MinIO 清理失败时，将孤立对象信息写入日志文件
   * 供后续运维脚本批量清理或手动排查
   */
  private logOrphanedMinioObjects(materialId: string, files: string[]): void {
    try {
      if (!existsSync(MaterialService.orphanLogDir)) {
        mkdirSync(MaterialService.orphanLogDir, { recursive: true });
      }
      const logPath = join(MaterialService.orphanLogDir, 'orphan_minio_objects.log');
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        material_id: materialId,
        files,
      });
      appendFileSync(logPath, entry + '\n');
    } catch (writeError) {
      this.logger.error(
        `Failed to log orphan MinIO objects for material ${materialId}: ${(writeError as Error).message}`,
      );
    }
  }

  /**
   * 版权检测 —— 基于素材元数据的多因子启发式检测
   *
   * 不依赖外部版权服务，通过素材来源、关联关系、文件特征等维度综合评分：
   *   - source_type === 'UPLOAD'     → +40 (主动上传)
   *   - source_type === 'REFERENCE'  → +30 (参考素材，已关联)
   *   - source_type === 'SCRAPE'     → -30 (爬取来源)
   *   - 素材关联了 product_id         → +20 (商品自有素材)
   *   - 存在同名 Creation             → +15 (已被脚本使用)
   *   - 文件名含可疑关键词            → -20
   *   - 素材创建 > 7 天               → +5  (老素材更稳定)
   *
   * 阈值：≥50 → CLEAN, ≥0 → SUSPICIOUS, <0 → FLAGGED
   */
  async checkMaterialCopyright(
    materialId: string,
  ): Promise<{ material_id: string; copyright_status: string; message: string; confidence: number }> {
    this.validateMaterialId(materialId);

    let row = null;
    try {
      row = await this.prisma.findMaterialById(materialId);
    } catch (error) {
      const prismaError = error as Error & { code?: string };
      const isRetryable =
        prismaError.code === 'P1001' ||
        prismaError.code === 'P2024' ||
        prismaError.code === 'P2028';
      throw serviceException(
        {
          message: `Material lookup before copyright check failed: ${prismaError.message}`,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            details: { material_id: materialId, prisma_code: prismaError.code },
            retryable: isRetryable,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!row) {
      throw serviceException(
        {
          message: `素材 ${materialId} 不存在`,
          error: {
            code: 'MATERIAL_NOT_FOUND',
            details: { material_id: materialId },
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 安全校验：素材 product_id 非空
    const productId = (row as Record<string, unknown>).productId as string | undefined;
    if (!productId) {
      throw serviceException(
        {
          message: '素材缺少商品归属',
          error: { code: 'MATERIAL_MISSING_PRODUCT', retryable: false },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // -----------------------------------------------------------------------
    // 多因子启发式评分
    // -----------------------------------------------------------------------
    let score = 0;
    const reasons: string[] = [];
    const sourceType = (row as Record<string, unknown>).source_type as string | undefined;
    const fileName = (row as Record<string, unknown>).file_name as string | undefined;
    const createdAt = (row as Record<string, unknown>).created_at as Date | string | undefined;

    // Factor 1: 素材来源类型
    switch (sourceType) {
      case 'UPLOAD':
        score += 40;
        reasons.push('主动上传素材');
        break;
      case 'REFERENCE':
        score += 30;
        reasons.push('参考素材(已关联)');
        break;
      case 'SCRAPE':
        score -= 30;
        reasons.push('爬取来源素材');
        break;
      default:
        reasons.push(`未知来源类型: ${sourceType}`);
    }

    // Factor 2: 商品归属
    if (productId) {
      score += 20;
      reasons.push('已关联商品');
    }

    // Factor 3: 是否已被使用（有 slices 说明已被分析处理 = 高概率被脚本引用）
    const materialRow = row as Record<string, unknown>;
    const slices = materialRow.slices as Array<{ slice_id: string }> | undefined;
    if (slices && slices.length > 0) {
      score += 15;
      reasons.push('素材已有分片(已使用)');
    }

    // 额外检查：如果商品已有 ViralAnalysis（爆款分析），说明该品类有运营数据积累
    try {
      const hasViralAnalysis = await (this.prisma as unknown as { findProductById: (id: string) => Promise<Record<string, unknown> | null> })
        .findProductById?.(productId);
      if (hasViralAnalysis) {
        score += 5;
        reasons.push('商品数据完整');
      }
    } catch {
      // 静默降级
    }

    // Factor 4: 文件名可疑关键词检测
    if (fileName) {
      const lower = fileName.toLowerCase();
      const suspiciousPatterns = [
        'download', 'copy', 'copie', 'rip', '盗版', '盗用',
        '未经授权', '未授权', 'repost', '转载',
      ];
      let suspicious = false;
      for (const pattern of suspiciousPatterns) {
        if (lower.includes(pattern)) {
          suspicious = true;
          break;
        }
      }
      if (suspicious) {
        score -= 20;
        reasons.push('文件名含可疑关键词');
      }
    }

    // Factor 5: 素材年龄（> 7 天）
    if (createdAt) {
      const createdDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
      const ageDays = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 7) {
        score += 5;
        reasons.push(`已存在${Math.floor(ageDays)}天(稳定素材)`);
      }
    }

    // -----------------------------------------------------------------------
    // 评分 → 状态映射
    // -----------------------------------------------------------------------
    let copyrightStatus: string;
    let confidence: number;
    if (score >= 50) {
      copyrightStatus = 'CLEAN';
      confidence = Math.min(0.95, 0.55 + score * 0.004);
    } else if (score >= 0) {
      copyrightStatus = 'SUSPICIOUS';
      confidence = Math.max(0.30, 0.25 + score * 0.01);
    } else {
      copyrightStatus = 'FLAGGED';
      confidence = Math.max(0.05, 0.20 + score * 0.005);
    }

    const message = `版权检测完成 (score=${score}, source=${sourceType || 'unknown'})。因子: ${reasons.join('; ')}`;

    this.logger.log(
      `[Copyright] material=${materialId} status=${copyrightStatus} score=${score} confidence=${confidence.toFixed(2)}`,
    );

    return {
      material_id: materialId,
      copyright_status: copyrightStatus,
      message,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * AI 视觉理解分析 — 使用 SiliconFlow 多模态模型对素材主图进行深度分析
   */
  async analyzeMaterialVision(materialId: string): Promise<VisionAnalysisResult> {
    const material = await this.prisma.findMaterialById(materialId);
    if (!material) {
      throw serviceException(
        {
          message: `素材 ${materialId} 不存在`,
          error: { code: 'MATERIAL_NOT_FOUND' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 检查素材是否有可见的图像 URL
    // 视频类素材优先使用缩略图进行视觉分析
    let publicUrl = (material as any).originUrl || (material as any).origin_url;
    const matType = (material as any).type as string;
    if (matType === 'VIDEO') {
      const thumbnailUrl = (material as any).thumbnailUrl
        || (material as any).thumbnail_url
        || (material as any).poster_url;
      if (thumbnailUrl) {
        publicUrl = thumbnailUrl;
        this.logger.log(`[VisionAnalysis] Using thumbnail for VIDEO material ${materialId}: ${thumbnailUrl}`);
      }
      // fallback: 若无缩略图，仍使用 originUrl（可能被视觉 API 拒绝）
    }
    if (!publicUrl) {
      throw serviceException(
        {
          message: '素材尚未上传图像文件',
          error: { code: 'MATERIAL_NO_IMAGE' },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 获取关联商品信息作为上下文
    const context: {
      product_title?: string;
      existing_selling_points?: string[];
      material_filename?: string;
    } = {
      material_filename: (material as any).file_name || undefined,
    };

    if ((material as any).product) {
      context.product_title = (material as any).product?.title;
      context.existing_selling_points = (material as any).product?.selling_points;
    }

    try {
      // SiliconFlow is an external API — convert MinIO internal URL to base64 data URL
      const imageInput = await this.prepareImageForVisionApi(publicUrl);

      const result = await this.siliconflowVision.analyzeMaterialImage(imageInput, context);

      // 持久化视觉分析结果到 material 记录
      try {
        await this.prisma.updateMaterialVisionAnalysis(
          materialId,
          result as any,
        );
        this.logger.log(`Vision analysis persisted for material ${materialId}`);
      } catch (persistErr) {
        this.logger.warn(`Failed to persist vision analysis for material ${materialId}: ${(persistErr as Error).message}`);
      }

      // fire-and-forget: 将 Vision Analysis 文本向量索引到 Qdrant（增强素材级语义检索）
      fireAndForget(this.logger, 'indexVisionAnalysisToQdrant',
        this.indexVisionAnalysisToQdrant(materialId, result),
      );

      return result;
    } catch (error) {
      this.logger.error(`Vision analysis failed for material ${materialId}: ${(error as Error).message}`);
      throw serviceException(
        {
          message: `视觉分析失败: ${(error as Error).message}`,
          error: { code: 'VISION_ANALYSIS_FAILED', retryable: true },
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
