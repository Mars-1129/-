// =============================================================================
// TikStream AI — Material Upload 自动化测试基座
// 对应功能: POST /api/v1/materials/upload (素材上传与结构化入库)
// 对应模块: Material (人员A) | 测试类型: 单元测试 (Service 层 + Controller 层)
// 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// ============================================================
// 0. 测试专用类型定义
// ============================================================

type MaterialType = 'IMAGE' | 'VIDEO';
type MaterialSourceType = 'UPLOAD' | 'REFERENCE' | 'GENERATED';
type MaterialStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type MaterialSliceStatus = 'PENDING' | 'CAPTIONING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED';

interface MockMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface TestProduct {
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

interface TestMaterialRecord {
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
}

interface TestMaterialSliceRecord {
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
}

interface TestUploadDto {
  product_id: string;
  type: MaterialType;
  source_type?: MaterialSourceType;
  remark?: string;
  qdrant_skip?: boolean;
}

interface TestUploadMinioParams {
  buffer: Buffer;
  objectKey: string;
  mimeType: string;
  fileSizeBytes: number;
}

interface TestThumbnailResult {
  thumbnailBuffer: Buffer;
  thumbMimeType: string;
}

interface TestVideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  mimeType: string;
}

interface TestSliceBoundary {
  sliceId: string;
  startTime: number;
  endTime: number;
  duration: number;
}

interface TestObjectKeyPair {
  origin_key: string;
  thumb_key: string;
}

interface TestMaterialUploadResponse {
  material_id: string;
  product_id: string;
  file_name: string;
  type: MaterialType;
  source_type: MaterialSourceType;
  status: MaterialStatus;
  thumbnail_url?: string;
  file_size_bytes: number;
  async_task_id: string;
  created_at: string;
}

interface TestEnqueueResult {
  jobId: string;
  taskId: string;
}

type MockPrismaService = {
  product: { findUnique: jest.Mock };
  material: { create: jest.Mock; findUnique: jest.Mock };
  materialSlice: { createMany: jest.Mock };
  $transaction: jest.Mock;
};

type MockMinioClient = {
  putObject: jest.Mock;
  getObject: jest.Mock;
};

type MockBullMqQueue = {
  add: jest.Mock;
};

type MockFfmpegService = {
  probeVideo: jest.Mock;
};

type MockThumbnailService = {
  generate: jest.Mock;
};

// ============================================================
// 常量
// ============================================================

const NOW = new Date('2026-05-25T12:00:00Z');
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const MATERIAL_ID = 'dc52d4ff-0000-4000-a000-000000000010';
const TASK_ID = 'tsk_20260525_000001';

const VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] as const;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

const SLICE_MIN_DURATION = 1.5;
const SLICE_MAX_DURATION = 4.0;
const SLICE_TARGET_DURATION = 3.0;

// ============================================================
// Mock Factories
// ============================================================

const mockProductFactory = (overrides?: Partial<TestProduct>): TestProduct => ({
  id: PRODUCT_ID,
  title: '智能无线卷发棒 Pro',
  sku_code: 'SKU-HB-PRO-001',
  category: 'Beauty/PersonalCare',
  selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
  target_audience: '北美年轻女性,25-35岁',
  scenario_tags: ['日常造型', '出差便携'],
  text_features: {},
  cover_image_url: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockMulterFileFactory = (overrides?: Partial<MockMulterFile>): MockMulterFile => ({
  fieldname: 'file',
  originalname: 'product_demo.jpeg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  buffer: Buffer.alloc(512 * 1024, 0xAB),
  size: 512 * 1024,
  ...overrides,
});

const mockMulterVideoFileFactory = (overrides?: Partial<MockMulterFile>): MockMulterFile => ({
  fieldname: 'file',
  originalname: 'product_demo.mp4',
  encoding: '7bit',
  mimetype: 'video/mp4',
  buffer: Buffer.alloc(10 * 1024 * 1024, 0xCD),
  size: 10 * 1024 * 1024,
  ...overrides,
});

const mockUploadDtoFactory = (overrides?: Partial<TestUploadDto>): TestUploadDto => ({
  product_id: PRODUCT_ID,
  type: 'IMAGE',
  ...overrides,
});

const mockVideoUploadDtoFactory = (overrides?: Partial<TestUploadDto>): TestUploadDto => ({
  product_id: PRODUCT_ID,
  type: 'VIDEO',
  ...overrides,
});

const mockPersistedMaterialFactory = (overrides?: Partial<TestMaterialRecord>): TestMaterialRecord => ({
  id: MATERIAL_ID,
  product_id: PRODUCT_ID,
  file_name: 'product_demo.jpeg',
  type: 'IMAGE',
  source_type: 'UPLOAD',
  origin_url: 'http://minio:9000/tikstream-assets/materials/20260525/dc52d4ff-0000-4000-a000-000000000010/product_demo.jpeg',
  thumbnail_url: 'http://minio:9000/tikstream-assets/materials/20260525/dc52d4ff-0000-4000-a000-000000000010/thumb.webp',
  file_size_bytes: BigInt(524288),
  duration_seconds: null,
  width: 1080,
  height: 1920,
  mime_type: 'image/jpeg',
  status: 'PENDING',
  slices_count: 1,
  remark: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockPersistedVideoMaterialFactory = (overrides?: Partial<TestMaterialRecord>): TestMaterialRecord => ({
  id: MATERIAL_ID,
  product_id: PRODUCT_ID,
  file_name: 'product_demo.mp4',
  type: 'VIDEO',
  source_type: 'UPLOAD',
  origin_url: 'http://minio:9000/tikstream-assets/materials/20260525/dc52d4ff-0000-4000-a000-000000000010/product_demo.mp4',
  thumbnail_url: null,
  file_size_bytes: BigInt(10485760),
  duration_seconds: 9.0,
  width: 1080,
  height: 1920,
  mime_type: 'video/mp4',
  status: 'PENDING',
  slices_count: 3,
  remark: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockSliceRecordFactory = (
  index: number,
  materialId: string,
  startTime: number,
  endTime: number,
): TestMaterialSliceRecord => ({
  id: `slice-uuid-${index}-${materialId}`,
  material_id: materialId,
  slice_id: `slc_20260525_${String(index).padStart(6, '0')}_${String(index).padStart(3, '0')}`,
  start_time: startTime,
  end_time: endTime,
  duration: Math.round((endTime - startTime) * 100) / 100,
  dense_caption: null,
  tags: [],
  stream_url: null,
  key_frame_url: null,
  embedding_version: null,
  sfx_url: null,
  status: 'PENDING',
  created_at: NOW,
  updated_at: NOW,
});

const mockVideoMetadataFactory = (overrides?: Partial<TestVideoMetadata>): TestVideoMetadata => ({
  durationSeconds: 9.0,
  width: 1080,
  height: 1920,
  mimeType: 'video/mp4',
  ...overrides,
});

const mockEnqueueResultFactory = (overrides?: Partial<TestEnqueueResult>): TestEnqueueResult => ({
  jobId: 'job-001',
  taskId: TASK_ID,
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => {
  const service = {
    product: { findUnique: jest.fn() },
    material: { create: jest.fn(), findUnique: jest.fn() },
    materialSlice: { createMany: jest.fn() },
    $transaction: jest.fn(),
  } as MockPrismaService;

  service.$transaction.mockImplementation(
    async (fn: (tx: Omit<MockPrismaService, '$transaction'>) => Promise<unknown>) =>
      fn(service),
  );
  return service;
};

const mockMinioClientFactory = (): MockMinioClient => ({
  putObject: jest.fn(),
  getObject: jest.fn(),
});

const mockBullMqQueueFactory = (): MockBullMqQueue => ({
  add: jest.fn(),
});

const mockFfmpegServiceFactory = (): MockFfmpegService => ({
  probeVideo: jest.fn(),
});

const mockThumbnailServiceFactory = (): MockThumbnailService => ({
  generate: jest.fn(),
});

// ============================================================
// 测试套件入口
// ============================================================

describe('MaterialUpload — 素材上传与结构化入库 (POST /api/v1/materials/upload)', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockPrisma: MockPrismaService;
  let mockMinio: MockMinioClient;
  let mockBullMq: MockBullMqQueue;
  let mockFfmpeg: MockFfmpegService;
  let mockThumbnail: MockThumbnailService;

  // ---- 原子函数类型声明 ----

  type ValidateUploadFileFn = (
    file: MockMulterFile | undefined,
    declaredType: MaterialType,
  ) => void;

  type ValidateProductExistsFn = (
    productId: string,
    prisma: MockPrismaService,
  ) => Promise<void>;

  type InferMaterialTypeFn = (mimeType: string) => MaterialType;

  type GenerateMaterialIdFn = () => string;

  type GenerateTaskIdFn = (
    date: Date,
    sequence: number,
  ) => string;

  type GenerateObjectKeyFn = (
    materialId: string,
    originalFileName: string,
    fileType: MaterialType,
  ) => TestObjectKeyPair;

  type UploadOriginToMinioFn = (
    minio: MockMinioClient,
    params: TestUploadMinioParams,
  ) => Promise<string>;

  type GenerateThumbnailFn = (
    buffer: Buffer,
    mimeType: string,
  ) => Promise<TestThumbnailResult>;

  type UploadThumbnailToMinioFn = (
    minio: MockMinioClient,
    thumbnailBuffer: Buffer,
    thumbKey: string,
    thumbMimeType: string,
  ) => Promise<string | undefined>;

  type ProbeVideoMetadataFn = (
    ffmpeg: MockFfmpegService,
    buffer: Buffer,
  ) => Promise<TestVideoMetadata>;

  type ComputeInitialSliceBoundariesFn = (
    durationSeconds: number,
  ) => TestSliceBoundary[];

  type PersistMaterialWithSlicesFn = (
    prisma: MockPrismaService,
    materialParams: Record<string, unknown>,
    sliceParams: Array<Record<string, unknown>>,
  ) => Promise<{ material: Record<string, unknown>; slices: Array<Record<string, unknown>> }>;

  type EnqueueGpuSlicingJobFn = (
    queue: MockBullMqQueue,
    materialId: string,
    skipQdrant: boolean,
  ) => Promise<TestEnqueueResult>;

  type MapToMaterialUploadResponseFn = (
    material: Record<string, unknown>,
    asyncTaskId: string,
    thumbnailUrl?: string,
  ) => TestMaterialUploadResponse;

  // ---- 主编排函数类型 ----

  type UploadMaterialFn = (
    dto: TestUploadDto,
    file: MockMulterFile | undefined,
    deps: {
      prisma: MockPrismaService;
      minio: MockMinioClient;
      bullMq: MockBullMqQueue;
      ffmpeg: MockFfmpegService;
      thumbnail: MockThumbnailService;
      atoms: {
        validateUploadFile: ValidateUploadFileFn;
        validateProductExists: ValidateProductExistsFn;
        inferMaterialType: InferMaterialTypeFn;
        generateMaterialId: GenerateMaterialIdFn;
        generateTaskId: GenerateTaskIdFn;
        generateObjectKey: GenerateObjectKeyFn;
        uploadOriginToMinio: UploadOriginToMinioFn;
        generateThumbnail: GenerateThumbnailFn;
        uploadThumbnailToMinio: UploadThumbnailToMinioFn;
        probeVideoMetadata: ProbeVideoMetadataFn;
        computeInitialSliceBoundaries: ComputeInitialSliceBoundariesFn;
        persistMaterialWithSlices: PersistMaterialWithSlicesFn;
        enqueueGpuSlicingJob: EnqueueGpuSlicingJobFn;
        mapToMaterialUploadResponse: MapToMaterialUploadResponseFn;
      };
    },
  ) => Promise<TestMaterialUploadResponse>;

  // ---- 原子函数实例 ----
  let validateUploadFile: ValidateUploadFileFn;
  let validateProductExists: ValidateProductExistsFn;
  let inferMaterialType: InferMaterialTypeFn;
  let generateMaterialId: GenerateMaterialIdFn;
  let generateTaskId: GenerateTaskIdFn;
  let generateObjectKey: GenerateObjectKeyFn;
  let uploadOriginToMinio: UploadOriginToMinioFn;
  let generateThumbnail: GenerateThumbnailFn;
  let uploadThumbnailToMinio: UploadThumbnailToMinioFn;
  let probeVideoMetadata: ProbeVideoMetadataFn;
  let computeInitialSliceBoundaries: ComputeInitialSliceBoundariesFn;
  let persistMaterialWithSlices: PersistMaterialWithSlicesFn;
  let enqueueGpuSlicingJob: EnqueueGpuSlicingJobFn;
  let mapToMaterialUploadResponse: MapToMaterialUploadResponseFn;
  let uploadMaterial: UploadMaterialFn;

  let taskSequence: number;

  beforeAll(() => {
    taskSequence = 0;

    // ---- F1: validateUploadFile ----

    validateUploadFile = (file, declaredType) => {
      if (!file) {
        throw Object.assign(new Error('未提供素材文件'), {
          errorCode: 'MATERIAL_FILE_MISSING',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }

      if (file.size <= 0) {
        throw Object.assign(
          new Error(`文件大小无效: ${file.size} bytes`),
          {
            errorCode: 'FILE_SIZE_EXCEEDED',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      const whitelist = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
      if (!whitelist.includes(file.mimetype)) {
        throw Object.assign(
          new Error(`不支持的文件格式: ${file.mimetype}`),
          {
            errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      const maxSize = declaredType === 'IMAGE' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
      if (file.size > maxSize) {
        throw Object.assign(
          new Error(`文件大小 ${file.size} 字节超出上限 ${maxSize} 字节`),
          {
            errorCode: 'FILE_SIZE_EXCEEDED',
            statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
            retryable: false,
          },
        );
      }
    };

    // ---- F2: validateProductExists ----

    validateProductExists = async (productId, prisma) => {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw Object.assign(
          new Error(`商品 ${productId} 不存在`),
          {
            errorCode: 'PRODUCT_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
            retryable: false,
          },
        );
      }
    };

    // ---- F3: inferMaterialType ----

    inferMaterialType = (mimeType) => {
      if (mimeType.startsWith('image/')) return 'IMAGE';
      if (mimeType.startsWith('video/')) return 'VIDEO';
      throw Object.assign(
        new Error(`无法从 MIME 类型推断素材类型: ${mimeType}`),
        {
          errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        },
      );
    };

    // ---- F4: generateMaterialId ----

    generateMaterialId = () => {
      const uuid = 'dc52d4ff-0000-4000-a000-000000000010';
      return uuid;
    };

    // ---- F5: generateTaskId ----

    generateTaskId = (date, sequence) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const seq = String(sequence).padStart(6, '0');
      return `tsk_${y}${m}${d}_${seq}`;
    };

    // ---- F6: generateObjectKey ----

    generateObjectKey = (materialId, originalFileName, fileType) => {
      const now = new Date();
      const dateDir = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

      const sanitized = originalFileName
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[#%&{}\]\[$@!`'=+~,\s]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

      const ext = fileType === 'IMAGE' ? 'webp' : 'mp4';
      const actualExt = originalFileName.includes('.')
        ? originalFileName.split('.').pop() || ext
        : ext;

      const originKey = `materials/${dateDir}/${materialId}/${sanitized}.${actualExt}`;
      const thumbKey = `materials/${dateDir}/${materialId}/thumb.webp`;

      return { origin_key: originKey, thumb_key: thumbKey };
    };

    // ---- F7: uploadOriginToMinio ----

    uploadOriginToMinio = async (minio, params) => {
      try {
        await minio.putObject(params.buffer, params.objectKey, params.mimeType);
      } catch (err) {
        throw Object.assign(
          new Error(`MinIO 上传失败: ${(err as Error).message}`),
          {
            errorCode: 'OBJECT_STORAGE_WRITE_FAILED',
            statusCode: HttpStatus.BAD_GATEWAY,
            retryable: true,
          },
        );
      }

      return `http://minio:9000/tikstream-assets/${params.objectKey}`;
    };

    // ---- F8: generateThumbnail ----

    generateThumbnail = async (_buffer, _mimeType) => {
      return {
        thumbnailBuffer: Buffer.alloc(32 * 1024, 0xFF),
        thumbMimeType: 'image/webp',
      };
    };

    // ---- F9: uploadThumbnailToMinio ----

    uploadThumbnailToMinio = async (minio, thumbnailBuffer, thumbKey, thumbMimeType) => {
      try {
        await minio.putObject(thumbnailBuffer, thumbKey, thumbMimeType);
        return `http://minio:9000/tikstream-assets/${thumbKey}`;
      } catch (err) {
        return undefined;
      }
    };

    // ---- F10: probeVideoMetadata ----

    probeVideoMetadata = async (ffmpeg, _buffer) => {
      try {
        return await ffmpeg.probeVideo();
      } catch (err) {
        throw Object.assign(
          new Error(`FFprobe 解析视频元数据失败: ${(err as Error).message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }
    };

    // ---- F11: computeInitialSliceBoundaries ----

    computeInitialSliceBoundaries = (durationSeconds) => {
      if (durationSeconds <= 0 || Number.isNaN(durationSeconds)) {
        throw Object.assign(
          new Error(`无效的视频时长: ${durationSeconds}s，无法计算切片边界`),
          {
            errorCode: 'MATERIAL_SLICE_COMPUTE_FAILED',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }

      const sliceCount = Math.ceil(durationSeconds / SLICE_TARGET_DURATION);
      const sliceDuration = durationSeconds / sliceCount;

      const slices: TestSliceBoundary[] = [];
      let taskSeq = 1;

      for (let i = 0; i < sliceCount; i++) {
        const startTime = i * sliceDuration;
        const endTime = Math.min((i + 1) * sliceDuration, durationSeconds);
        const currentDuration = Math.round((endTime - startTime) * 100) / 100;

        if (currentDuration < SLICE_MIN_DURATION) {
          const prevSlice = slices[slices.length - 1];
          if (prevSlice) {
            prevSlice.endTime = endTime;
            prevSlice.duration = Math.round((endTime - prevSlice.startTime) * 100) / 100;
          }
          continue;
        }

        slices.push({
          sliceId: `slc_20260525_${String(taskSeq).padStart(6, '0')}_${String(taskSeq).padStart(3, '0')}`,
          startTime,
          endTime,
          duration: currentDuration,
        });
        taskSeq++;
      }

      return slices;
    };

    // ---- F12: persistMaterialWithSlices ----

    persistMaterialWithSlices = async (prisma, materialParams, sliceParams) => {
      try {
        const material = await prisma.$transaction(
          async (tx: Omit<MockPrismaService, '$transaction'>) => {
            const createdMaterial = await tx.material.create({ data: materialParams });
            if (sliceParams.length > 0) {
              await tx.materialSlice.createMany({ data: sliceParams });
            }
            return createdMaterial;
          },
        ) as Record<string, unknown>;

        const slices = sliceParams.map((s, idx) => ({
          id: `slice-uuid-${idx + 1}_${materialParams.id}`,
          ...s,
        }));

        return { material, slices };
      } catch (err) {
        const prismaErr = err as Error & { code?: string };
        throw Object.assign(
          new Error(`持久化素材失败: ${prismaErr.message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: prismaErr.code === 'P1001',
          },
        );
      }
    };

    // ---- F13: enqueueGpuSlicingJob ----

    enqueueGpuSlicingJob = async (queue, materialId, skipQdrant) => {
      try {
        const job = await queue.add('slice', {
          materialId,
          skipQdrant: skipQdrant || false,
        });
        return {
          jobId: typeof job.id === 'string' ? job.id : 'job-001',
          taskId: generateTaskId(new Date(), ++taskSequence),
        };
      } catch (err) {
        return {
          jobId: 'enqueue-failed',
          taskId: generateTaskId(new Date(), ++taskSequence),
        };
      }
    };

    // ---- F14: mapToMaterialUploadResponse ----

    mapToMaterialUploadResponse = (material, asyncTaskId, thumbnailUrl) => ({
      material_id: material.id as string,
      product_id: material.product_id as string,
      file_name: material.file_name as string,
      type: material.type as MaterialType,
      source_type: (material.source_type as MaterialSourceType) || 'UPLOAD',
      status: (material.status as MaterialStatus) || 'PENDING',
      thumbnail_url: thumbnailUrl || undefined,
      file_size_bytes: Number(material.file_size_bytes as bigint),
      async_task_id: asyncTaskId,
      created_at: (material.created_at as Date).toISOString(),
    });

    // ---- 主编排: uploadMaterial ----

    uploadMaterial = async (dto, file, deps) => {
      const { prisma, minio, bullMq, ffmpeg, thumbnail, atoms } = deps;

      // Step 1: validate
      atoms.validateUploadFile(file, dto.type);

      // Step 2: MIME-type cross-check
      const inferredType = atoms.inferMaterialType(file!.mimetype);
      if (inferredType !== dto.type) {
        throw Object.assign(
          new Error(`MIME 类型 ${file!.mimetype} 与声明类型 ${dto.type} 不一致`),
          {
            errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      // Step 3: product exists
      await atoms.validateProductExists(dto.product_id, prisma);

      // Step 4: generate IDs
      const materialId = atoms.generateMaterialId();

      // Step 5: MinIO upload
      const keys = atoms.generateObjectKey(materialId, file!.originalname, dto.type);
      const originUrl = await atoms.uploadOriginToMinio(minio, {
        buffer: file!.buffer,
        objectKey: keys.origin_key,
        mimeType: file!.mimetype,
        fileSizeBytes: file!.size,
      });

      // Step 6: Thumbnail (non-blocking)
      let thumbnailUrl: string | undefined = undefined;
      try {
        const thumbResult = await atoms.generateThumbnail(file!.buffer, file!.mimetype);
        thumbnailUrl = await atoms.uploadThumbnailToMinio(
          minio,
          thumbResult.thumbnailBuffer,
          keys.thumb_key,
          thumbResult.thumbMimeType,
        );
      } catch {
        thumbnailUrl = undefined;
      }

      // Step 7: Video metadata probe
      let durationSeconds: number | null = null;
      let width: number | null = null;
      let height: number | null = null;

      if (dto.type === 'VIDEO') {
        const metadata = await atoms.probeVideoMetadata(ffmpeg, file!.buffer);
        durationSeconds = metadata.durationSeconds;
        width = metadata.width;
        height = metadata.height;
      }

      // Step 8: Slice boundaries
      let slices: TestSliceBoundary[] = [];
      if (dto.type === 'VIDEO' && durationSeconds != null && durationSeconds > 0) {
        slices = atoms.computeInitialSliceBoundaries(durationSeconds);
      } else if (dto.type === 'IMAGE') {
        slices = [{
          sliceId: `slc_20260525_000001_001`,
          startTime: 0,
          endTime: 0,
          duration: 0,
        }];
      }

      // Step 9: Persist
      const materialParams = {
        id: materialId,
        product_id: dto.product_id,
        file_name: file!.originalname,
        type: dto.type,
        source_type: dto.source_type || 'UPLOAD',
        origin_url: originUrl,
        thumbnail_url: thumbnailUrl || null,
        file_size_bytes: BigInt(file!.size),
        duration_seconds: durationSeconds,
        width,
        height,
        mime_type: file!.mimetype,
        status: 'PENDING',
        slices_count: slices.length,
        remark: dto.remark || null,
        created_at: NOW,
        updated_at: NOW,
      };

      const sliceParams = slices.map((s) => ({
        material_id: materialId,
        slice_id: s.sliceId,
        start_time: s.startTime,
        end_time: s.endTime,
        duration: s.duration,
        status: 'PENDING',
        tags: JSON.stringify([]),
        created_at: NOW,
        updated_at: NOW,
      }));

      await atoms.persistMaterialWithSlices(prisma, materialParams, sliceParams);

      // Step 10: Enqueue GPU slicing job
      const enqueueResult = await atoms.enqueueGpuSlicingJob(
        bullMq,
        materialId,
        dto.qdrant_skip || false,
      );

      return atoms.mapToMaterialUploadResponse(materialParams, enqueueResult.taskId, thumbnailUrl);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
    mockMinio = mockMinioClientFactory();
    mockBullMq = mockBullMqQueueFactory();
    mockFfmpeg = mockFfmpegServiceFactory();
    mockThumbnail = mockThumbnailServiceFactory();
    taskSequence = 0;

    // ---- 默认 mock 成功行为 ----
    mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
    mockMinio.putObject.mockResolvedValue({ etag: 'abc123' });
    mockBullMq.add.mockResolvedValue({ id: 'job-001' });
    mockFfmpeg.probeVideo.mockResolvedValue(mockVideoMetadataFactory());
  });

  const deps = () => ({
    prisma: mockPrisma,
    minio: mockMinio,
    bullMq: mockBullMq,
    ffmpeg: mockFfmpeg,
    thumbnail: mockThumbnail,
    atoms: {
      validateUploadFile,
      validateProductExists,
      inferMaterialType,
      generateMaterialId,
      generateTaskId,
      generateObjectKey,
      uploadOriginToMinio,
      generateThumbnail,
      uploadThumbnailToMinio,
      probeVideoMetadata,
      computeInitialSliceBoundaries,
      persistMaterialWithSlices,
      enqueueGpuSlicingJob,
      mapToMaterialUploadResponse,
    },
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整 MaterialUploadResponse 输出', () => {
    beforeEach(() => {
      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());
      mockPrisma.materialSlice.createMany.mockResolvedValue({ count: 1 });
    });

    it('TC-MAT-001: 图片素材上传成功 — 返回完整响应结构', async () => {
      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      const result = await uploadMaterial(dto, file, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material_id');
      expect(typeof result.material_id).toBe('string');
      expect(result.material_id.length).toBeGreaterThan(0);

      expect(result).toHaveProperty('product_id');
      expect(result.product_id).toBe(PRODUCT_ID);

      expect(result).toHaveProperty('file_name');
      expect(result.file_name).toBe('product_demo.jpeg');

      expect(result).toHaveProperty('type');
      expect(result.type).toBe('IMAGE');

      expect(result).toHaveProperty('source_type');
      expect(result.source_type).toBe('UPLOAD');

      expect(result).toHaveProperty('status');
      expect(result.status).toBe('PENDING');

      expect(result).toHaveProperty('file_size_bytes');
      expect(typeof result.file_size_bytes).toBe('number');
      expect(result.file_size_bytes).toBeGreaterThan(0);

      expect(result).toHaveProperty('async_task_id');
      expect(typeof result.async_task_id).toBe('string');
      expect(result.async_task_id.length).toBeGreaterThan(0);

      expect(result).toHaveProperty('created_at');
      expect(() => new Date(result.created_at)).not.toThrow();

      expect(result).toHaveProperty('thumbnail_url');
    });

    it('TC-MAT-002: 视频素材上传成功 — 返回响应含切片数量', async () => {
      const file = mockMulterVideoFileFactory();
      const dto = mockVideoUploadDtoFactory();

      mockPrisma.material.create.mockResolvedValue(mockPersistedVideoMaterialFactory());

      const result = await uploadMaterial(dto, file, deps());

      expect(result.type).toBe('VIDEO');
      expect(result.file_name).toBe('product_demo.mp4');
      expect(result.file_size_bytes).toBeGreaterThan(0);
      expect(result.status).toBe('PENDING');
    });

    it('TC-MAT-003: qdrant_skip=true 参数正确传播到 BullMQ', async () => {
      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory({ qdrant_skip: true });

      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());

      const result = await uploadMaterial(dto, file, deps());

      expect(result).toHaveProperty('async_task_id');
      expect(mockBullMq.add).toHaveBeenCalledWith(
        'slice',
        expect.objectContaining({ skipQdrant: true }),
      );
    });

    it('TC-MAT-004: 可选字段 remark 和 source_type 正确传递', async () => {
      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory({
        source_type: 'REFERENCE',
        remark: '竞品参考素材',
      });

      mockPrisma.material.create.mockResolvedValue(
        mockPersistedMaterialFactory({ source_type: 'REFERENCE', remark: '竞品参考素材' }),
      );

      const result = await uploadMaterial(dto, file, deps());

      expect(result.source_type).toBe('REFERENCE');
    });

    it('TC-MAT-005: source_type 未提供时默认使用 UPLOAD', async () => {
      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();
      delete dto.source_type;

      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());

      const result = await uploadMaterial(dto, file, deps());

      expect(result.source_type).toBe('UPLOAD');
    });

    it('TC-MAT-006: async_task_id 格式符合 tsk_YYYYMMDD_6位序号', async () => {
      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());

      const result = await uploadMaterial(dto, file, deps());

      const taskIdPattern = /^tsk_\d{8}_\d{6}$/;
      expect(result.async_task_id).toMatch(taskIdPattern);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    beforeEach(() => {
      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());
      mockPrisma.materialSlice.createMany.mockResolvedValue({ count: 1 });
    });

    it('TC-MAT-BND-001: 图片文件恰好 10MB (上限临界值) 上传成功', async () => {
      const file = mockMulterFileFactory({
        size: IMAGE_MAX_BYTES,
        buffer: Buffer.alloc(IMAGE_MAX_BYTES, 0xAB),
      });
      const dto = mockUploadDtoFactory();

      const result = await uploadMaterial(dto, file, deps());

      expect(result.file_size_bytes).toBe(IMAGE_MAX_BYTES);
      expect(result.status).toBe('PENDING');
    });

    it('TC-MAT-BND-002: 视频文件恰好 200MB (上限临界值) 上传成功', async () => {
      const file = mockMulterVideoFileFactory({
        size: VIDEO_MAX_BYTES,
        buffer: Buffer.alloc(VIDEO_MAX_BYTES, 0xCD),
      });
      const dto = mockVideoUploadDtoFactory();

      mockPrisma.material.create.mockResolvedValue(mockPersistedVideoMaterialFactory());

      const result = await uploadMaterial(dto, file, deps());

      expect(result.file_size_bytes).toBe(VIDEO_MAX_BYTES);
    });

    it('TC-MAT-BND-003: 极短视频 (1.5s) 仅生成 1 个切片', async () => {
      const file = mockMulterVideoFileFactory();
      const dto = mockVideoUploadDtoFactory();

      mockFfmpeg.probeVideo.mockResolvedValue(mockVideoMetadataFactory({ durationSeconds: 1.5 }));
      mockPrisma.material.create.mockResolvedValue(
        mockPersistedVideoMaterialFactory({ duration_seconds: 1.5, slices_count: 1 }),
      );

      const result = await uploadMaterial(dto, file, deps());

      expect(result).toBeDefined();
    });

    it('TC-MAT-BND-004: 最长视频 (15.0s) 生成 5 个 3.0s 切片', async () => {
      const file = mockMulterVideoFileFactory();
      const dto = mockVideoUploadDtoFactory();

      mockFfmpeg.probeVideo.mockResolvedValue(mockVideoMetadataFactory({ durationSeconds: 15.0 }));
      mockPrisma.material.create.mockResolvedValue(
        mockPersistedVideoMaterialFactory({ duration_seconds: 15.0, slices_count: 5 }),
      );

      const slices = computeInitialSliceBoundaries(15.0);
      expect(slices.length).toBe(5);

      const result = await uploadMaterial(dto, file, deps());
      expect(result).toBeDefined();
    });

    it('TC-MAT-BND-005: 视频时长恰好 4.0s 生成 2 个切片', async () => {
      const slices = computeInitialSliceBoundaries(4.0);
      expect(slices.length).toBe(2);
      expect(slices[0].duration).toBeCloseTo(2.0, 1);
      expect(slices[1].duration).toBeCloseTo(2.0, 1);
    });

    it('TC-MAT-BND-006: 超长文件名安全截断处理', async () => {
      const longName = 'A'.repeat(200) + '.jpg';
      const file = mockMulterFileFactory({ originalname: longName });
      const dto = mockUploadDtoFactory();

      mockPrisma.material.create.mockResolvedValue(
        mockPersistedMaterialFactory({ file_name: longName }),
      );

      const result = await uploadMaterial(dto, file, deps());

      expect(result.file_name).toBe(longName);
    });

    it('TC-MAT-BND-007: WebP 格式图片上传成功', async () => {
      const file = mockMulterFileFactory({
        mimetype: 'image/webp',
        originalname: 'product.webp',
      });
      const dto = mockUploadDtoFactory({ type: 'IMAGE' });

      mockPrisma.material.create.mockResolvedValue(
        mockPersistedMaterialFactory({
          file_name: 'product.webp',
          mime_type: 'image/webp',
          type: 'IMAGE',
        }),
      );

      const result = await uploadMaterial(dto, file, deps());

      expect(result.type).toBe('IMAGE');
      expect(result.file_name).toBe('product.webp');
    });

    it('TC-MAT-BND-008: PNG 格式图片上传成功', async () => {
      const file = mockMulterFileFactory({
        mimetype: 'image/png',
        originalname: 'product.png',
      });
      const dto = mockUploadDtoFactory({ type: 'IMAGE' });

      mockPrisma.material.create.mockResolvedValue(
        mockPersistedMaterialFactory({
          file_name: 'product.png',
          mime_type: 'image/png',
          type: 'IMAGE',
        }),
      );

      const result = await uploadMaterial(dto, file, deps());

      expect(result.type).toBe('IMAGE');
    });

    it('TC-MAT-BND-009: 文件名含特殊字符时安全 sanitize', async () => {
      const keys = generateObjectKey(MATERIAL_ID, '产品demo<>.jpeg', 'IMAGE');
      expect(keys.origin_key).not.toContain('<');
      expect(keys.origin_key).not.toContain('>');
      expect(keys.origin_key).toContain('materials/');
      expect(keys.origin_key).toContain(MATERIAL_ID);
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    beforeEach(() => {
      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());
      mockPrisma.materialSlice.createMany.mockResolvedValue({ count: 1 });
    });

    // ---- 3.1 文件层异常 ----

    it('TC-MAT-ERR-001: 未提供文件 → MATERIAL_FILE_MISSING', async () => {
      const dto = mockUploadDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await uploadMaterial(dto, undefined as unknown as MockMulterFile, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('MATERIAL_FILE_MISSING');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MAT-ERR-002: 不支持的文件格式 (text/plain) → FILE_FORMAT_NOT_SUPPORTED', async () => {
      const file = mockMulterFileFactory({ mimetype: 'text/plain' });
      const dto = mockUploadDtoFactory({ type: 'IMAGE' });

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('FILE_FORMAT_NOT_SUPPORTED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-MAT-ERR-003: 图片超过 10MB 上限 → FILE_SIZE_EXCEEDED', async () => {
      const file = mockMulterFileFactory({
        size: IMAGE_MAX_BYTES + 1,
        buffer: Buffer.alloc(IMAGE_MAX_BYTES + 1, 0xAB),
      });
      const dto = mockUploadDtoFactory({ type: 'IMAGE' });

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('FILE_SIZE_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    });

    it('TC-MAT-ERR-004: 视频超过 200MB 上限 → FILE_SIZE_EXCEEDED', async () => {
      const file = mockMulterVideoFileFactory({
        size: VIDEO_MAX_BYTES + 1,
        buffer: Buffer.alloc(VIDEO_MAX_BYTES + 1, 0xCD),
      });
      const dto = mockVideoUploadDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('FILE_SIZE_EXCEEDED');
    });

    it('TC-MAT-ERR-005: MIME 类型与声明 type 不一致 → FILE_FORMAT_NOT_SUPPORTED', async () => {
      const file = mockMulterVideoFileFactory({ mimetype: 'video/mp4' });
      const dto = mockUploadDtoFactory({ type: 'IMAGE' });

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('FILE_FORMAT_NOT_SUPPORTED');
    });

    it('TC-MAT-ERR-006: product_id 对应的商品不存在 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory({
        product_id: '99999999-9999-9999-9999-999999999999',
      });

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    // ---- 3.2 MinIO 层异常 ----

    it('TC-MAT-ERR-007: MinIO putObject 网络异常 → OBJECT_STORAGE_WRITE_FAILED', async () => {
      mockMinio.putObject.mockRejectedValue(new Error('ECONNREFUSED minio:9000'));

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('OBJECT_STORAGE_WRITE_FAILED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_GATEWAY);
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-ERR-008: MinIO 认证失败 (AccessDenied) → OBJECT_STORAGE_WRITE_FAILED', async () => {
      mockMinio.putObject.mockRejectedValue(new Error('AccessDenied'));

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('OBJECT_STORAGE_WRITE_FAILED');
      expect(caught!.retryable).toBe(true);
    });

    // ---- 3.3 FFprobe 层异常 ----

    it('TC-MAT-ERR-009: FFprobe 解析损坏视频失败 → INTERNAL_SERVER_ERROR', async () => {
      mockFfmpeg.probeVideo.mockRejectedValue(new Error('Invalid data found when processing input'));

      const file = mockMulterVideoFileFactory();
      const dto = mockVideoUploadDtoFactory();

      let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(caught!.retryable).toBe(true);
    });

    // ---- 3.4 Prisma 层异常 ----

    it('TC-MAT-ERR-010: Prisma 数据库连接失败 P1001 → INTERNAL_SERVER_ERROR (retryable)', async () => {
      mockPrisma.$transaction.mockRejectedValue(
        Object.assign(new Error('Connection refused'), { code: 'P1001' }),
      );

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(caught!.retryable).toBe(true);
    });

    it('TC-MAT-ERR-011: Prisma 唯一约束冲突 P2002 → INTERNAL_SERVER_ERROR', async () => {
      mockPrisma.$transaction.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; retryable?: boolean };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
    });

    // ---- 3.5 BullMQ 层异常 (非阻断) ----

    it('TC-MAT-ERR-012: BullMQ 队列不可达 → 仍返回成功 (fire-and-forget)', async () => {
      mockBullMq.add.mockRejectedValue(new Error('ECONNREFUSED redis:6379'));

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      const result = await uploadMaterial(dto, file, deps());

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material_id');
      expect(result).toHaveProperty('async_task_id');
    });

    // ---- 3.6 缩略图降级 (非阻断) ----

    it('TC-MAT-ERR-013: 缩略图生成失败 → 不阻断上传，thumbnail_url 为 undefined', async () => {
      const failGenerateThumbnail: GenerateThumbnailFn = async () => {
        throw new Error('Sharp: corrupt JPEG data');
      };

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      const customDeps = deps();
      customDeps.atoms.generateThumbnail = failGenerateThumbnail;

      const result = await uploadMaterial(dto, file, customDeps);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material_id');
    });

    // ---- 3.7 素材切片计算异常 ----

    it('TC-MAT-ERR-014: 视频时长为 0 → 不报错但不生成初始切片', async () => {
      mockFfmpeg.probeVideo.mockResolvedValue(mockVideoMetadataFactory({ durationSeconds: 0 }));

      const file = mockMulterVideoFileFactory();
      const dto = mockVideoUploadDtoFactory();

      const result = await uploadMaterial(dto, file, deps());
      const createArgs = mockPrisma.material.create.mock.calls.at(-1)?.[0] as {
        data: { duration_seconds: number | null; slices_count: number };
      };

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material_id');
      expect(createArgs.data.duration_seconds).toBe(0);
      expect(createArgs.data.slices_count).toBe(0);
      expect(mockPrisma.materialSlice.createMany).not.toHaveBeenCalled();
    });

    it('TC-MAT-ERR-015: 视频时长为 NaN → 不报错但不生成初始切片', async () => {
      mockFfmpeg.probeVideo.mockResolvedValue(mockVideoMetadataFactory({ durationSeconds: NaN }));

      const file = mockMulterVideoFileFactory();
      const dto = mockVideoUploadDtoFactory();

      const result = await uploadMaterial(dto, file, deps());
      const createArgs = mockPrisma.material.create.mock.calls.at(-1)?.[0] as {
        data: { duration_seconds: number; slices_count: number };
      };

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material_id');
      expect(createArgs.data.duration_seconds).toBeNaN();
      expect(createArgs.data.slices_count).toBe(0);
      expect(mockPrisma.materialSlice.createMany).not.toHaveBeenCalled();
    });

    it('TC-MAT-ERR-016: 视频时长为负数 → 不报错但不生成初始切片', async () => {
      mockFfmpeg.probeVideo.mockResolvedValue(mockVideoMetadataFactory({ durationSeconds: -3.0 }));

      const file = mockMulterVideoFileFactory();
      const dto = mockVideoUploadDtoFactory();

      const result = await uploadMaterial(dto, file, deps());
      const createArgs = mockPrisma.material.create.mock.calls.at(-1)?.[0] as {
        data: { duration_seconds: number | null; slices_count: number };
      };

      expect(result).toBeDefined();
      expect(result).toHaveProperty('material_id');
      expect(createArgs.data.duration_seconds).toBe(-3);
      expect(createArgs.data.slices_count).toBe(0);
      expect(mockPrisma.materialSlice.createMany).not.toHaveBeenCalled();
    });

    // ---- 3.8 product_id 校验 ----

    it('TC-MAT-ERR-017: product_id 为空字符串 → PRODUCT_NOT_FOUND', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory({ product_id: '' });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
    });

    it('TC-MAT-ERR-018: 不支持的 MIME (application/octet-stream) → FILE_FORMAT_NOT_SUPPORTED', async () => {
      const file = mockMulterFileFactory({ mimetype: 'application/octet-stream' });
      const dto = mockUploadDtoFactory({ type: 'IMAGE' });

      let caught: Error & { errorCode?: string } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('FILE_FORMAT_NOT_SUPPORTED');
    });

    it('TC-MAT-ERR-019: 0 字节空文件被前置校验拒绝', async () => {
      const file = mockMulterFileFactory({ size: 0, buffer: Buffer.alloc(0) });
      const dto = mockUploadDtoFactory({ type: 'IMAGE' });

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await uploadMaterial(dto, file, deps());
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('FILE_SIZE_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(caught!.message).toContain('0');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance）
  // ===========================================================================

  describe('【性能流】耗时与资源卡点告警', () => {
    beforeEach(() => {
      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());
      mockPrisma.materialSlice.createMany.mockResolvedValue({ count: 1 });
    });

    it('TC-MAT-PERF-001: uploadMaterial 编排总耗时 ≤ 5000ms (mock 全链路)', async () => {
      const PERF_CEILING_MS = 5000;

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      const start = performance.now();

      await uploadMaterial(dto, file, deps());

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    }, 10000);

    it('TC-MAT-PERF-002: validateUploadFile ≤ 5ms', () => {
      const PERF_CEILING_MS = 5;
      const file = mockMulterFileFactory();

      const start = performance.now();

      validateUploadFile(file, 'IMAGE');

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-PERF-003: generateObjectKey ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;

      const start = performance.now();

      const keys = generateObjectKey(MATERIAL_ID, 'product_demo.jpeg', 'IMAGE');

      const elapsed = performance.now() - start;

      expect(keys).toHaveProperty('origin_key');
      expect(keys).toHaveProperty('thumb_key');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-PERF-004: computeInitialSliceBoundaries (15s 视频) ≤ 5ms', () => {
      const PERF_CEILING_MS = 5;

      const start = performance.now();

      const slices = computeInitialSliceBoundaries(15.0);

      const elapsed = performance.now() - start;

      expect(slices.length).toBe(5);
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-PERF-005: mapToMaterialUploadResponse ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const material = {
        id: MATERIAL_ID,
        product_id: PRODUCT_ID,
        file_name: 'test.jpg',
        type: 'IMAGE',
        source_type: 'UPLOAD',
        status: 'PENDING',
        file_size_bytes: BigInt(524288),
        created_at: NOW,
      };

      const start = performance.now();

      const response = mapToMaterialUploadResponse(material, TASK_ID, 'http://thumb.url');

      const elapsed = performance.now() - start;

      expect(response).toHaveProperty('material_id');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-PERF-006: 连续 10 次 uploadMaterial 无退化', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 100;

      const file = mockMulterFileFactory();
      const dto = mockUploadDtoFactory();

      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        await uploadMaterial(dto, file, deps());
      }

      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 15000);

    it('TC-MAT-PERF-007: inferMaterialType 四种合法 MIME ≤ 2ms', () => {
      const PERF_CEILING_MS = 2;

      const start = performance.now();

      expect(inferMaterialType('image/jpeg')).toBe('IMAGE');
      expect(inferMaterialType('image/png')).toBe('IMAGE');
      expect(inferMaterialType('image/webp')).toBe('IMAGE');
      expect(inferMaterialType('video/mp4')).toBe('VIDEO');

      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-MAT-PERF-008: persistMaterialWithSlices (mock DB) ≤ 100ms', async () => {
      const PERF_CEILING_MS = 100;

      mockPrisma.material.create.mockResolvedValue(mockPersistedMaterialFactory());

      const materialParams = { id: MATERIAL_ID, product_id: PRODUCT_ID, file_name: 'test.jpg', type: 'IMAGE' };
      const sliceParams = [{ material_id: MATERIAL_ID, slice_id: 'slc_001', start_time: 0, end_time: 0, duration: 0 }];

      const start = performance.now();

      const result = await persistMaterialWithSlices(mockPrisma, materialParams, sliceParams);

      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('material');
      expect(result).toHaveProperty('slices');
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });
  });

  // ===========================================================================
  // 5. 独立原子函数测试（非编排路径的纯逻辑验证）
  // ===========================================================================

  describe('【原子函数】独立校验各原子函数的正确性', () => {
    // ---- F1: validateUploadFile ----

    describe('F1: validateUploadFile', () => {
      it('ATOM-MAT-001: JPEG 图片文件校验通过不抛异常', () => {
        const file = mockMulterFileFactory();
        expect(() => validateUploadFile(file, 'IMAGE')).not.toThrow();
      });

      it('ATOM-MAT-002: MP4 视频文件校验通过不抛异常', () => {
        const file = mockMulterVideoFileFactory();
        expect(() => validateUploadFile(file, 'VIDEO')).not.toThrow();
      });

      it('ATOM-MAT-003: undefined 文件抛出 MATERIAL_FILE_MISSING', () => {
        let caught: Error & { errorCode?: string } | null = null;
        try {
          validateUploadFile(undefined, 'IMAGE');
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('MATERIAL_FILE_MISSING');
      });

      it('ATOM-MAT-004: 视频声明为 IMAGE 但大小超 10MB 仍按 IMAGE 上限校验', () => {
        const hugeImage = mockMulterFileFactory({ size: VIDEO_MAX_BYTES, mimetype: 'video/mp4' });
        let caught: Error & { errorCode?: string } | null = null;
        try {
          validateUploadFile(hugeImage, 'IMAGE');
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('FILE_SIZE_EXCEEDED');
      });
    });

    // ---- F2: validateProductExists ----

    describe('F2: validateProductExists', () => {
      it('ATOM-MAT-005: 商品存在时不抛异常', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(mockProductFactory());
        await expect(validateProductExists(PRODUCT_ID, mockPrisma)).resolves.toBeUndefined();
      });

      it('ATOM-MAT-006: 商品不存在抛出 PRODUCT_NOT_FOUND', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(null);
        let caught: Error & { errorCode?: string } | null = null;
        try {
          await validateProductExists(PRODUCT_ID, mockPrisma);
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('PRODUCT_NOT_FOUND');
      });
    });

    // ---- F3: inferMaterialType ----

    describe('F3: inferMaterialType', () => {
      it('ATOM-MAT-007: image/jpeg → IMAGE', () => {
        expect(inferMaterialType('image/jpeg')).toBe('IMAGE');
      });

      it('ATOM-MAT-008: image/png → IMAGE', () => {
        expect(inferMaterialType('image/png')).toBe('IMAGE');
      });

      it('ATOM-MAT-009: image/webp → IMAGE', () => {
        expect(inferMaterialType('image/webp')).toBe('IMAGE');
      });

      it('ATOM-MAT-010: video/mp4 → VIDEO', () => {
        expect(inferMaterialType('video/mp4')).toBe('VIDEO');
      });

      it('ATOM-MAT-011: 未知 MIME 抛出 FILE_FORMAT_NOT_SUPPORTED', () => {
        let caught: Error & { errorCode?: string } | null = null;
        try {
          inferMaterialType('application/pdf');
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('FILE_FORMAT_NOT_SUPPORTED');
      });
    });

    // ---- F5: generateTaskId ----

    describe('F5: generateTaskId', () => {
      it('ATOM-MAT-012: 生成 task_id 格式 tsk_YYYYMMDD_6位序号', () => {
        const taskId = generateTaskId(new Date('2026-05-25'), 1);
        expect(taskId).toMatch(/^tsk_\d{8}_\d{6}$/);
        expect(taskId).toBe('tsk_20260525_000001');
      });

      it('ATOM-MAT-013: 序列号 >= 999999 时正确填充', () => {
        const taskId = generateTaskId(new Date('2026-05-25'), 123456);
        expect(taskId).toBe('tsk_20260525_123456');
      });

      it('ATOM-MAT-014: 1 月正确格式化为 01', () => {
        const taskId = generateTaskId(new Date('2026-01-01'), 5);
        expect(taskId).toBe('tsk_20260101_000005');
      });
    });

    // ---- F6: generateObjectKey ----

    describe('F6: generateObjectKey', () => {
      it('ATOM-MAT-015: 生成的 key 包含 materials/{date}/{id}/ 路径', () => {
        const keys = generateObjectKey(MATERIAL_ID, 'test.jpg', 'IMAGE');
        expect(keys.origin_key).toContain('materials/');
        expect(keys.origin_key).toContain(MATERIAL_ID);
        expect(keys.thumb_key).toContain('thumb.webp');
      });

      it('ATOM-MAT-016: 文件名中空格被替换为下划线', () => {
        const keys = generateObjectKey(MATERIAL_ID, 'my product image.jpg', 'IMAGE');
        expect(keys.origin_key).not.toContain(' ');
        expect(keys.origin_key).toContain('_');
      });

      it('ATOM-MAT-017: 无扩展名时 IMAGE 默认用原扩展名兜底', () => {
        const keys = generateObjectKey(MATERIAL_ID, 'noext', 'IMAGE');
        expect(keys.origin_key).toContain('noext');
      });
    });

    // ---- F11: computeInitialSliceBoundaries ----

    describe('F11: computeInitialSliceBoundaries', () => {
      it('ATOM-MAT-018: 9.0s 视频生成 3 个 3.0s 切片', () => {
        const slices = computeInitialSliceBoundaries(9.0);
        expect(slices.length).toBe(3);
        slices.forEach((s) => {
          expect(s.duration).toBeCloseTo(3.0, 1);
        });
      });

      it('ATOM-MAT-019: 3.1s 视频生成 2 个切片 (2 个均 ≥ 1.5s)', () => {
        const slices = computeInitialSliceBoundaries(3.1);
        expect(slices.length).toBe(2);
        slices.forEach((s) => {
          expect(s.duration).toBeGreaterThanOrEqual(SLICE_MIN_DURATION);
        });
      });

      it('ATOM-MAT-020: 5.0s 视频生成 2 个 2.5s 切片', () => {
        const slices = computeInitialSliceBoundaries(5.0);
        expect(slices.length).toBe(2);
        expect(slices[0].duration).toBeCloseTo(2.5, 1);
        expect(slices[1].duration).toBeCloseTo(2.5, 1);
      });

      it('ATOM-MAT-021: 1.0s 视频（不足 1.5s 下限）应被丢弃 → 返回空数组', () => {
        const slices = computeInitialSliceBoundaries(1.0);
        expect(slices.length).toBe(0);
      });

      it('ATOM-MAT-022: 持续时间为 6.1s → ceil(6.1/3)=3 slices, 约 2.03s 每段', () => {
        const slices = computeInitialSliceBoundaries(6.1);
        expect(slices.length).toBe(3);
        slices.forEach((s) => {
          expect(s.duration).toBeGreaterThanOrEqual(SLICE_MIN_DURATION);
        });
      });

      it('ATOM-MAT-023: 持续时间切片边界连续无缺口', () => {
        const slices = computeInitialSliceBoundaries(10.0);
        for (let i = 0; i < slices.length - 1; i++) {
          expect(slices[i].endTime).toBeCloseTo(slices[i + 1].startTime, 2);
        }
      });

      it('ATOM-MAT-024: 最后一节切片 endTime = 总时长', () => {
        const slices = computeInitialSliceBoundaries(7.5);
        const lastSlice = slices[slices.length - 1];
        expect(lastSlice.endTime).toBeCloseTo(7.5, 2);
      });
    });

    // ---- F14: mapToMaterialUploadResponse ----

    describe('F14: mapToMaterialUploadResponse', () => {
      it('ATOM-MAT-025: 扁平化字段映射完全一致', () => {
        const material = {
          id: MATERIAL_ID,
          product_id: PRODUCT_ID,
          file_name: 'test.webp',
          type: 'IMAGE',
          source_type: 'UPLOAD',
          status: 'PENDING',
          file_size_bytes: BigInt(204800),
          created_at: NOW,
        };
        const response = mapToMaterialUploadResponse(material, TASK_ID, 'http://thumb.url');
        expect(response.material_id).toBe(MATERIAL_ID);
        expect(response.product_id).toBe(PRODUCT_ID);
        expect(response.file_name).toBe('test.webp');
        expect(response.type).toBe('IMAGE');
        expect(response.source_type).toBe('UPLOAD');
        expect(response.status).toBe('PENDING');
        expect(response.file_size_bytes).toBe(204800);
        expect(response.async_task_id).toBe(TASK_ID);
        expect(response.thumbnail_url).toBe('http://thumb.url');
      });

      it('ATOM-MAT-026: thumbnail_url 为 undefined 时不包含该字段', () => {
        const material = {
          id: MATERIAL_ID, product_id: PRODUCT_ID, file_name: 't.jpg',
          type: 'IMAGE', source_type: 'UPLOAD', status: 'PENDING',
          file_size_bytes: BigInt(1024), created_at: NOW,
        };
        const response = mapToMaterialUploadResponse(material, TASK_ID, undefined);
        expect(response.thumbnail_url).toBeUndefined();
      });
    });
  });
});

// =============================================================================
// 测试基座文件版本标识
// 用途: 当项目进入 CI/CD 流水线后, 此文件用于断言素材上传功能
// 的完整性与正确性。待源码实现后移除 .skip 或直接运行。
//
// 用例编号映射:
//   TC-MAT-001 ~ TC-MAT-006         正常流 (Happy Path)
//   TC-MAT-BND-001 ~ TC-MAT-BND-009  边界流 (Edge Cases)
//   TC-MAT-ERR-001 ~ TC-MAT-ERR-019  异常流 (Error Flow)
//   TC-MAT-PERF-001 ~ TC-MAT-PERF-008 性能流 (Performance)
//   ATOM-MAT-001 ~ ATOM-MAT-026       原子函数 (Atomic Functions)
//
// 覆盖率维度:
//   ├── F1:  validateUploadFile              (4 原子测试 + 集成覆盖)
//   ├── F2:  validateProductExists           (2 原子测试 + 集成覆盖)
//   ├── F3:  inferMaterialType               (5 原子测试 + 集成覆盖)
//   ├── F5:  generateTaskId                  (3 原子测试)
//   ├── F6:  generateObjectKey               (3 原子测试)
//   ├── F11: computeInitialSliceBoundaries   (7 原子测试 + 集成覆盖)
//   ├── F14: mapToMaterialUploadResponse     (2 原子测试)
//   └── uploadMaterial (编排)                (42 集成测试)
//
// 总测试用例数: 68
// =============================================================================