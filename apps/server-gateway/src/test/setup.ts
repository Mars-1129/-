// @ts-nocheck
// Jest globals are available in test environment
// =============================================================================

// =============================================================================
// 全局 Jest 配置
// =============================================================================

// 设置测试超时时间
jest.setTimeout(30000);

// 全局 beforeAll/afterAll 钩子
beforeAll(() => {
  // 初始化测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.MINIO_ENDPOINT = 'localhost:9000';
  process.env.MINIO_BUCKET_NAME = 'tikstream-assets-test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/tikstream_test';
  process.env.DOUBao_API_KEY = 'test-doubao-key';
  process.env.QDRANT_URL = 'http://localhost:6333';
});

afterAll(() => {
  // 清理测试资源
  jest.clearAllMocks();
});

// =============================================================================
// 全局 Mock 配置
// =============================================================================

// Mock Redis
export const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  eval: jest.fn().mockResolvedValue(0),
  scan: jest.fn().mockResolvedValue(['0', []]),
  disconnect: jest.fn().mockResolvedValue(undefined),
};

// Mock Logger
export const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// =============================================================================
// 辅助函数：创建模拟的 Multer File 对象
// =============================================================================

export function createMockMulterFile(options?: {
  fieldname?: string;
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
}): Express.Multer.File {
  const defaultBuffer = Buffer.from('mock-file-content');
  return {
    fieldname: options?.fieldname ?? 'file',
    originalname: options?.originalname ?? 'test-video.mp4',
    encoding: '7bit',
    mimetype: options?.mimetype ?? 'video/mp4',
    size: options?.size ?? 1024000,
    buffer: options?.buffer ?? defaultBuffer,
    // @ts-ignore - Mock stream doesn't need to be a full Readable
    stream: null as unknown as NodeJS.ReadableStream,
    destination: '',
    filename: '',
    path: '',
  };
}

// =============================================================================
// 辅助函数：创建模拟的 UUID
// =============================================================================

export function generateMockUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =============================================================================
// 辅助函数：创建模拟的产品数据
// =============================================================================

export function createMockProduct(overrides?: {
  id?: string;
  title?: string;
  category?: string;
  sellingPoints?: string[];
}): Record<string, unknown> {
  const now = new Date();
  return {
    id: overrides?.id ?? generateMockUUID(),
    title: overrides?.title ?? '测试商品',
    category: overrides?.category ?? '电子产品',
    sellingPoints: overrides?.sellingPoints ?? ['高品质', '高性价比'],
    skuCode: `SKU-TEST-${Date.now()}`,
    targetAudience: null,
    scenarioTags: [],
    textFeatures: {},
    coverImageUrl: null,
    color: null,
    materialType: null,
    sizeDesc: null,
    usageScenario: null,
    brand: null,
    richFeatures: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// =============================================================================
// 辅助函数：创建模拟的素材数据
// =============================================================================

export function createMockMaterial(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  const now = new Date();
  return {
    id: overrides?.id ?? generateMockUUID(),
    productId: overrides?.productId ?? generateMockUUID(),
    fileName: overrides?.fileName ?? 'test-video.mp4',
    type: overrides?.type ?? 'VIDEO',
    sourceType: 'UPLOAD',
    originUrl: 'https://minio.test/bucket/path/video.mp4',
    thumbnailUrl: null,
    fileSizeBytes: overrides?.fileSizeBytes ?? BigInt(1024000),
    durationSeconds: 30.5,
    width: 1920,
    height: 1080,
    mimeType: 'video/mp4',
    status: overrides?.status ?? 'PENDING',
    slicesCount: 3,
    remark: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

// =============================================================================
// 辅助函数：创建模拟的切片数据
// =============================================================================

export function createMockSlice(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  const now = new Date();
  return {
    id: overrides?.id ?? generateMockUUID(),
    materialId: overrides?.materialId ?? generateMockUUID(),
    sliceId: overrides?.sliceId ?? `SLI_${Date.now()}_001`,
    startTime: 0,
    endTime: 10.5,
    duration: 10.5,
    denseCaption: '测试视频片段描述',
    tags: ['product_demo', 'close-up'],
    productDimensionTags: ['product', 'showcase'],
    videoDimensionTags: ['camera_pan', 'smooth'],
    sliceDimensionTags: ['macro', 'detail'],
    streamUrl: 'https://minio.test/bucket/path/stream.mp4',
    keyFrameUrl: 'https://minio.test/bucket/path/keyframe.jpg',
    embeddingVersion: null,
    sfxUrl: null,
    status: overrides?.status ?? 'COMPLETED',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// =============================================================================
// 辅助函数：创建模拟的剧本数据
// =============================================================================

export function createMockScript(overrides?: {
  id?: string;
  productId?: string;
  shots?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  const now = new Date();
  const defaultShots = [
    {
      id: generateMockUUID(),
      shotId: `shot_${Date.now()}_001`,
      shotIndex: 0,
      duration: 3.0,
      sceneDescriptionQuery: '产品展示',
      visualDescription: '展示产品外观和功能',
      cameraMovement: 'pan',
      transitionType: 'cut',
      voiceoverText: '欢迎观看我们的产品介绍',
      subtitleText: '欢迎观看我们的产品介绍',
      selectedSliceId: null,
      complianceStatus: 'APPROVED',
      bgmSegment: null,
    },
    {
      id: generateMockUUID(),
      shotId: `shot_${Date.now()}_002`,
      shotIndex: 1,
      duration: 5.0,
      sceneDescriptionQuery: '功能演示',
      visualDescription: '演示产品核心功能',
      cameraMovement: 'zoom_in',
      transitionType: 'dissolve',
      voiceoverText: '现在让我们看看这个产品的核心功能',
      subtitleText: '现在让我们看看这个产品的核心功能',
      selectedSliceId: null,
      complianceStatus: 'APPROVED',
      bgmSegment: null,
    },
  ];

  return {
    id: overrides?.id ?? generateMockUUID(),
    productId: overrides?.productId ?? generateMockUUID(),
    title: '测试剧本',
    language: 'zh-CN',
    videoDuration: 8.0,
    aspectRatio: '9:16',
    styleVibe: 'professional',
    generationMode: 'quick',
    shots: overrides?.shots ?? defaultShots,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// =============================================================================
// 辅助函数：创建模拟的创作数据
// =============================================================================

export function createMockCreation(overrides?: {
  id?: string;
  productId?: string;
  scriptId?: string;
  status?: string;
}): Record<string, unknown> {
  const now = new Date();
  return {
    id: overrides?.id ?? generateMockUUID(),
    productId: overrides?.productId ?? generateMockUUID(),
    scriptId: overrides?.scriptId ?? generateMockUUID(),
    taskId: `tsk_${Date.now()}_${generateMockUUID().slice(0, 8)}`,
    engineMode: 'SCRIPT_DRIVEN',
    targetResolution: '1080x1920',
    exportFormat: 'mp4',
    status: overrides?.status ?? 'PENDING',
    progress: 0,
    currentStage: 'QUEUED',
    videoUrl: null,
    fileSizeBytes: null,
    traceId: `trc_${Date.now()}_creation`,
    errorCode: null,
    errorMessage: null,
    preferAiVideo: false,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    shotRenders: [],
    ...overrides,
  };
}

// =============================================================================
// 辅助函数：创建模拟的 BullMQ Queue
// =============================================================================

export function createMockQueue(): {
  add: jest.Mock;
  getJob: jest.Mock;
  remove: jest.Mock;
} {
  return {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJob: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 MinioClientService
// =============================================================================

export function createMockMinioClient(): {
  putObject: jest.Mock;
  getObject: jest.Mock;
  deleteObject: jest.Mock;
  generatePublicUrl: jest.Mock;
} {
  return {
    putObject: jest.fn().mockResolvedValue('https://minio.test/bucket/path/file.mp4'),
    getObject: jest.fn().mockResolvedValue({ buffer: Buffer.from('mock-content') }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    generatePublicUrl: jest.fn().mockReturnValue('https://minio.test/bucket/path/file.mp4'),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 QdrantClientService
// =============================================================================

export function createMockQdrantClient(): {
  search: jest.Mock;
  upsertPoint: jest.Mock;
  deleteByFilter: jest.Mock;
  getPoints: jest.Mock;
  getCollectionName: jest.Mock;
  getMaterialCollectionName: jest.Mock;
  getVectorSize: jest.Mock;
} {
  return {
    search: jest.fn().mockResolvedValue([]),
    upsertPoint: jest.fn().mockResolvedValue(undefined),
    deleteByFilter: jest.fn().mockResolvedValue(undefined),
    getPoints: jest.fn().mockResolvedValue([]),
    getCollectionName: jest.fn().mockReturnValue('asset_slices'),
    getMaterialCollectionName: jest.fn().mockReturnValue('asset_materials'),
    getVectorSize: jest.fn().mockReturnValue(512),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 ImageBindClientService
// =============================================================================

export function createMockImageBindClient(): {
  embedQuery: jest.Mock;
  embedImage: jest.Mock;
} {
  const mockEmbedding = new Array(512).fill(0).map(() => Math.random() * 2 - 1);
  return {
    embedQuery: jest.fn().mockResolvedValue(mockEmbedding),
    embedImage: jest.fn().mockResolvedValue(mockEmbedding),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 DoubaoTextProvider
// =============================================================================

export function createMockDoubaoTextProvider(): {
  generateText: jest.Mock;
  generate: jest.Mock;
} {
  return {
    generateText: jest.fn().mockResolvedValue('测试生成的文本内容'),
    generate: jest.fn().mockResolvedValue({ text: '测试生成的文本内容' }),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 MediaProbeService
// =============================================================================

export function createMockMediaProbeService(): {
  probeVideo: jest.Mock;
} {
  return {
    probeVideo: jest.fn().mockResolvedValue({
      durationSeconds: 30.5,
      width: 1920,
      height: 1080,
      mimeType: 'video/mp4',
    }),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 ThumbnailService
// =============================================================================

export function createMockThumbnailService(): {
  generate: jest.Mock;
} {
  return {
    generate: jest.fn().mockResolvedValue({
      thumbnailBuffer: Buffer.from('mock-thumbnail'),
      thumbMimeType: 'image/webp',
    }),
  };
}

// =============================================================================
// 辅助函数：验证错误是否抛出
// =============================================================================

export async function expectThrowsAsync(
  fn: () => Promise<unknown>,
  expectedErrorCode?: string,
): Promise<Error> {
  let thrownError: Error | null = null;
  try {
    await fn();
  } catch (error) {
    thrownError = error as Error;
  }

  expect(thrownError).toBeDefined();
  if (expectedErrorCode) {
    const errorWithCode = thrownError as unknown as { response?: { body?: { error?: { code?: string } } } };
    expect(errorWithCode?.response?.body?.error?.code).toBe(expectedErrorCode);
  }

  return thrownError!;
}

// =============================================================================
// 辅助函数：创建模拟的 MetricsService
// =============================================================================

export function createMockMetricsService(): {
  httpRequestsTotal: { inc: jest.Mock };
  httpRequestDurationSeconds: { observe: jest.Mock };
  scriptGenerateDurationSeconds: { observe: jest.Mock };
  creationRequestsTotal: { inc: jest.Mock };
  creationStageTransitionsTotal: { inc: jest.Mock };
  creationFailuresTotal: { inc: jest.Mock };
} {
  return {
    httpRequestsTotal: { inc: jest.fn() },
    httpRequestDurationSeconds: { observe: jest.fn() },
    scriptGenerateDurationSeconds: { observe: jest.fn() },
    creationRequestsTotal: { inc: jest.fn() },
    creationStageTransitionsTotal: { inc: jest.fn() },
    creationFailuresTotal: { inc: jest.fn() },
  };
}

// =============================================================================
// 辅助函数：创建模拟的 Prisma Repository
// =============================================================================

export function createMockMaterialRepository(): {
  findMaterialById: jest.Mock;
  findProductById: jest.Mock;
  findSlicesByIds: jest.Mock;
  findSlicesByMaterialId: jest.Mock;
  findSlicesByProductId: jest.Mock;
  persistMaterialWithSlices: jest.Mock;
  updateSliceStatus: jest.Mock;
  updateMaterialStatus: jest.Mock;
  softDeleteMaterial: jest.Mock;
  restoreMaterial: jest.Mock;
  permanentDeleteMaterial: jest.Mock;
  findMaterialsPaginated: jest.Mock;
  decodeCursor: jest.Mock;
  searchSlicesByKeyword: jest.Mock;
  findMaterialsByIds: jest.Mock;
  updateMaterialSummary: jest.Mock;
  findStalePendingMaterials: jest.Mock;
  findCompletedSlicesForReindex: jest.Mock;
  upsertSlice: jest.Mock;
  findSliceBySliceId: jest.Mock;
  markMaterialJobFailed: jest.Mock;
  deletePendingSlicesForMaterial: jest.Mock;
  resetMaterialForReprocess: jest.Mock;
  createUserSearchLog: jest.Mock;
  findDeletedMaterialIdsByProduct: jest.Mock;
  batchDeleteMaterialsById: jest.Mock;
  deleteMaterialById: jest.Mock;
  incrementSliceUsageCount: jest.Mock;
} {
  return {
    findMaterialById: jest.fn().mockResolvedValue(null),
    findProductById: jest.fn().mockResolvedValue(null),
    findSlicesByIds: jest.fn().mockResolvedValue([]),
    findSlicesByMaterialId: jest.fn().mockResolvedValue([]),
    findSlicesByProductId: jest.fn().mockResolvedValue([]),
    persistMaterialWithSlices: jest.fn().mockResolvedValue(undefined),
    updateSliceStatus: jest.fn().mockResolvedValue(undefined),
    updateMaterialStatus: jest.fn().mockResolvedValue(undefined),
    softDeleteMaterial: jest.fn().mockResolvedValue(undefined),
    restoreMaterial: jest.fn().mockResolvedValue(undefined),
    permanentDeleteMaterial: jest.fn().mockResolvedValue({ materialFiles: [], sliceFiles: [] }),
    findMaterialsPaginated: jest.fn().mockResolvedValue({
      items: [],
      total_count: 0,
      has_more: false,
      next_cursor: null,
    }),
    decodeCursor: jest.fn().mockReturnValue(null),
    searchSlicesByKeyword: jest.fn().mockResolvedValue({
      items: [],
      total_count: 0,
      next_cursor: null,
      has_more: false,
    }),
    findMaterialsByIds: jest.fn().mockResolvedValue([]),
    updateMaterialSummary: jest.fn().mockResolvedValue(undefined),
    findStalePendingMaterials: jest.fn().mockResolvedValue([]),
    findCompletedSlicesForReindex: jest.fn().mockResolvedValue({
      items: [],
      hasMore: false,
      nextCursor: null,
    }),
    upsertSlice: jest.fn().mockResolvedValue(undefined),
    findSliceBySliceId: jest.fn().mockResolvedValue(null),
    markMaterialJobFailed: jest.fn().mockResolvedValue(undefined),
    deletePendingSlicesForMaterial: jest.fn().mockResolvedValue(0),
    resetMaterialForReprocess: jest.fn().mockResolvedValue(undefined),
    createUserSearchLog: jest.fn().mockResolvedValue(undefined),
    findDeletedMaterialIdsByProduct: jest.fn().mockResolvedValue([]),
    batchDeleteMaterialsById: jest.fn().mockResolvedValue(0),
    deleteMaterialById: jest.fn().mockResolvedValue(undefined),
    incrementSliceUsageCount: jest.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 CreationRepository
// =============================================================================

export function createMockCreationRepository(): {
  findCreationById: jest.Mock;
  findProductById: jest.Mock;
  findScriptWithShots: jest.Mock;
  createCreationWithShotRenders: jest.Mock;
  findCreationsPaginated: jest.Mock;
  decodeCreationCursor: jest.Mock;
  cancelCreationById: jest.Mock;
  updateShotRenderForCreation: jest.Mock;
  updateScriptShotFields: jest.Mock;
  updateCreationExportFormat: jest.Mock;
  updateCreationResolution: jest.Mock;
} {
  return {
    findCreationById: jest.fn().mockResolvedValue(null),
    findProductById: jest.fn().mockResolvedValue(null),
    findScriptWithShots: jest.fn().mockResolvedValue(null),
    createCreationWithShotRenders: jest.fn().mockResolvedValue({}),
    findCreationsPaginated: jest.fn().mockResolvedValue({
      items: [],
      total_count: 0,
      has_more: false,
      next_cursor: null,
    }),
    decodeCreationCursor: jest.fn().mockReturnValue(null),
    cancelCreationById: jest.fn().mockResolvedValue(null),
    updateShotRenderForCreation: jest.fn().mockResolvedValue({}),
    updateScriptShotFields: jest.fn().mockResolvedValue(undefined),
    updateCreationExportFormat: jest.fn().mockResolvedValue(undefined),
    updateCreationResolution: jest.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// 辅助函数：创建模拟的 ScriptService
// =============================================================================

export function createMockScriptService(): {
  generateQuickScript: jest.Mock;
  generateViralScript: jest.Mock;
  generateTemplateScript: jest.Mock;
  generateComposedScript: jest.Mock;
  generateHybridScript: jest.Mock;
  batchGenerateScripts: jest.Mock;
} {
  return {
    generateQuickScript: jest.fn().mockResolvedValue({
      script_id: generateMockUUID(),
      product_id: generateMockUUID(),
      title: '测试剧本',
      shots: [
        {
          id: generateMockUUID(),
          shot_index: 0,
          duration: 3.0,
          scene_description_query: '产品展示',
          visual_description: '展示产品外观',
          camera_movement: 'pan',
          transition_type: 'cut',
          voiceover_text: '欢迎观看',
          subtitle_text: '欢迎观看',
        },
      ],
    }),
    generateViralScript: jest.fn(),
    generateTemplateScript: jest.fn(),
    generateComposedScript: jest.fn(),
    generateHybridScript: jest.fn(),
    batchGenerateScripts: jest.fn(),
  };
}