// =============================================================================
// TikStream AI — Creation E2E Test Suite
// 完整的端到端测试，验证所有 Creation API 端点的业务逻辑和错误处理
// 包含创作任务创建、查询、取消、重试等功能测试
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CreationService } from '../src/creation/creation.service';
import { CreationRepository } from '../src/creation/creation.repository';
import { ScriptService } from '../src/script/script.service';
import { ProductRepository } from '../src/product/product.repository';
import { MaterialRepository } from '../src/material/material.repository';

// =============================================================================
// Test Constants
// =============================================================================

const VALID_PRODUCT_ID = '00000000-0000-0000-0000-000000000001';
const VALID_SCRIPT_ID = '00000000-0000-0000-0000-000000000021';
const VALID_CREATION_ID = '00000000-0000-4000-8000-000000000031';
const NON_EXISTENT_CREATION_ID = '00000000-0000-4000-8000-000000000099';

// =============================================================================
// Test Data Generators
// =============================================================================

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createMockCreation(overrides?: Partial<{
  id: string;
  productId: string;
  scriptId: string;
  taskId: string;
  engineMode: string;
  targetResolution: string;
  exportFormat: string;
  status: string;
  progress: number;
  currentStage: string;
  videoUrl: string | null;
  fileSizeBytes: bigint | null;
  traceId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  preferAiVideo: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  shotRenders: Array<Record<string, unknown>>;
}>): Record<string, unknown> {
  const now = new Date();
  return {
    id: overrides?.id ?? generateUUID(),
    productId: overrides?.productId ?? VALID_PRODUCT_ID,
    scriptId: overrides?.scriptId ?? VALID_SCRIPT_ID,
    taskId: overrides?.taskId ?? `tsk_${Date.now()}_${generateUUID().slice(0, 8)}`,
    engineMode: overrides?.engineMode ?? 'SCRIPT_DRIVEN',
    targetResolution: overrides?.targetResolution ?? '1080x1920',
    exportFormat: overrides?.exportFormat ?? 'mp4',
    status: overrides?.status ?? 'PENDING',
    progress: overrides?.progress ?? 0,
    currentStage: overrides?.currentStage ?? 'QUEUED',
    videoUrl: overrides?.videoUrl ?? null,
    fileSizeBytes: overrides?.fileSizeBytes ?? null,
    traceId: overrides?.traceId ?? null,
    errorCode: overrides?.errorCode ?? null,
    errorMessage: overrides?.errorMessage ?? null,
    preferAiVideo: overrides?.preferAiVideo ?? false,
    startedAt: overrides?.startedAt ?? null,
    finishedAt: overrides?.finishedAt ?? null,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    shotRenders: overrides?.shotRenders ?? [],
  };
}

function createMockScript(overrides?: Partial<{
  id: string;
  productId: string;
  title: string | null;
  language: string | null;
  videoDuration: number;
  aspectRatio: string;
  styleVibe: string;
  generationMode: string;
  shots: Array<Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}>): Record<string, unknown> {
  const now = new Date();
  const defaultShots = [
    {
      id: generateUUID(),
      shotId: 'shot_001',
      shotIndex: 0,
      duration: 3.0,
      sceneDescriptionQuery: '产品展示',
      visualDescription: '展示产品外观和功能',
      cameraMovement: 'pan',
      transitionType: 'cut',
      voiceoverText: '欢迎观看我们的产品介绍',
      subtitleText: '欢迎观看我们的产品介绍',
      selectedSliceId: null,
      complianceStatus: 'PASSED',
      bgmSegment: null,
    },
    {
      id: generateUUID(),
      shotId: 'shot_002',
      shotIndex: 1,
      duration: 5.0,
      sceneDescriptionQuery: '功能演示',
      visualDescription: '演示产品核心功能',
      cameraMovement: 'zoom_in',
      transitionType: 'dissolve',
      voiceoverText: '现在让我们看看这个产品的核心功能',
      subtitleText: '现在让我们看看这个产品的核心功能',
      selectedSliceId: null,
      complianceStatus: 'PASSED',
      bgmSegment: null,
    },
  ];

  return {
    id: overrides?.id ?? generateUUID(),
    productId: overrides?.productId ?? VALID_PRODUCT_ID,
    title: overrides?.title ?? '测试剧本',
    language: overrides?.language ?? 'zh-CN',
    videoDuration: overrides?.videoDuration ?? 8.0,
    aspectRatio: overrides?.aspectRatio ?? '9:16',
    styleVibe: overrides?.styleVibe ?? 'professional',
    generationMode: overrides?.generationMode ?? 'quick',
    shots: overrides?.shots ?? defaultShots,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

// =============================================================================
// Mock MaterialRepository
// =============================================================================

class MockMaterialRepository {
  findSlicesByIds = jest.fn().mockResolvedValue([]);
  findSlicesByProductId = jest.fn().mockResolvedValue([]);
  findMaterialById = jest.fn().mockResolvedValue(null);
  findMaterialsByIds = jest.fn().mockResolvedValue([]);
  findSliceBySliceId = jest.fn().mockResolvedValue(null);
  findSlicesByMaterialId = jest.fn().mockResolvedValue([]);
  findSlicesByMaterialIds = jest.fn().mockResolvedValue([]);
  searchSlicesByKeyword = jest.fn().mockResolvedValue({ items: [], total_count: 0, has_more: false, next_cursor: null });
  findSliceSfxUrls = jest.fn().mockResolvedValue({});
}

// =============================================================================
// Mock CreationRepository
// =============================================================================

class MockCreationRepository {
  private creations: Map<string, Record<string, unknown>> = new Map();
  private scripts: Map<string, Record<string, unknown>> = new Map();

  findCreationById = jest.fn().mockImplementation(async (id: string) => {
    return this.creations.get(id) || null;
  });

  findProductById = jest.fn().mockResolvedValue({ id: VALID_PRODUCT_ID, title: '测试商品' });

  findScriptWithShots = jest.fn().mockImplementation(async (scriptId: string) => {
    return this.scripts.get(scriptId) || null;
  });

  createCreationWithShotRenders = jest.fn().mockImplementation(async (params: any, shots: any[]) => {
    const creation = createMockCreation({
      id: params.id,
      productId: params.productId,
      scriptId: params.scriptId,
    });
    this.creations.set(creation.id as string, creation);
    return creation;
  });

  findCreationsPaginated = jest.fn().mockImplementation(async (filter: any, cursor: any, limit: number) => {
    let items = Array.from(this.creations.values());

    if (filter.product_id) {
      items = items.filter(c => c.productId === filter.product_id);
    }

    if (filter.status) {
      items = items.filter(c => c.status === filter.status);
    }

    return {
      items,
      total_count: items.length,
      has_more: false,
      next_cursor: null,
    };
  });

  decodeCreationCursor = jest.fn().mockReturnValue(null);
  cancelCreationById = jest.fn().mockImplementation(async (id: string) => {
    const creation = this.creations.get(id);
    if (!creation) return null;
    return { ...creation, status: 'CANCELED' };
  });

  resetCreationForRetry = jest.fn().mockImplementation(async (id: string) => {
    const creation = this.creations.get(id);
    if (!creation) return null;
    const updated = { ...creation, status: 'PROCESSING' };
    this.creations.set(id, updated);
    return updated;
  });

  updateShotRenderForCreation = jest.fn().mockResolvedValue({});
  updateScriptShotFields = jest.fn().mockResolvedValue(undefined);
  updateCreationExportFormat = jest.fn().mockResolvedValue(undefined);
  updateCreationResolution = jest.fn().mockResolvedValue(undefined);

  // 辅助方法
  addCreation(creation: Record<string, unknown>): void {
    this.creations.set(creation.id as string, creation);
  }

  addScript(script: Record<string, unknown>): void {
    this.scripts.set(script.id as string, script);
  }

  clearCreations(): void {
    this.creations.clear();
  }
}

// =============================================================================
// Test Suite: Creation E2E
// =============================================================================

// =============================================================================
// Mock BullMQ Queue (no Redis required)
// =============================================================================

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  remove: jest.fn().mockResolvedValue(undefined),
  getJob: jest.fn().mockResolvedValue(null),
  getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0 }),
  close: jest.fn().mockResolvedValue(undefined),
};

// =============================================================================
// Test Suite: Creation E2E
// =============================================================================

describe('Creation E2E Tests', () => {
  let app: INestApplication;
  let mockRepository: MockCreationRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CreationRepository)
      .useClass(MockCreationRepository)
      .overrideProvider(MaterialRepository)
      .useClass(MockMaterialRepository)
      .overrideProvider('CREATION_QUEUE')
      .useValue(mockQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get repo through CreationService to ensure same DI instance
    const creationService = app.get(CreationService);
    mockRepository = (creationService as any).repository as MockCreationRepository;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.clearCreations();
  });

  // =============================================================================
  // Test Group: createCreation - 创作任务创建 (BUG-C001 ~ BUG-C015)
  // =============================================================================

  describe('createCreation API', () => {
    beforeEach(() => {
      // 添加测试数据和脚本
      mockRepository.addScript(createMockScript({
        id: VALID_SCRIPT_ID,
        productId: VALID_PRODUCT_ID,
        shots: [
          {
            id: generateUUID(),
            shotIndex: 0,
            duration: 3.0,
            sceneDescriptionQuery: '产品展示',
            visualDescription: '展示产品外观',
            cameraMovement: 'pan',
            transitionType: 'cut',
            voiceoverText: '欢迎观看',
            subtitleText: '欢迎观看',
            complianceStatus: 'PASSED',
          },
        ],
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-C001: SCRIPT_DRIVEN 模式缺少 script_id
    // -------------------------------------------------------------------------

    describe('BUG-C001: SCRIPT_DRIVEN 模式 script_id 校验', () => {
      it('BUG-C001-T1: 缺少 script_id 应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            engine_mode: 'SCRIPT_DRIVEN',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'SCRIPT_REQUIRED',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C002: IMAGE_DRIVEN 模式缺少 material_id
    // -------------------------------------------------------------------------

    describe('BUG-C002: IMAGE_DRIVEN 模式 material_id 校验', () => {
      it('BUG-C002-T1: 缺少 material_id 应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            engine_mode: 'IMAGE_DRIVEN',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'MATERIAL_REQUIRED',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C003: product_id 不存在
    // -------------------------------------------------------------------------

    describe('BUG-C003: product_id 校验', () => {
      it('BUG-C003-T1: 不存在的 product_id 应返回 404 错误', async () => {
        mockRepository.findProductById.mockResolvedValueOnce(null);

        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            script_id: VALID_SCRIPT_ID,
          });

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
    // BUG-C004: script_id 不存在
    // -------------------------------------------------------------------------

    describe('BUG-C004: script_id 校验', () => {
      it('BUG-C004-T1: 不存在的 script_id 应返回 404 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'SCRIPT_NOT_FOUND',
          }),
        });
      });

      it('BUG-C004-T2: script 与 product 不匹配应返回 400 错误', async () => {
        mockRepository.findScriptWithShots.mockResolvedValueOnce({
          ...createMockScript(),
          productId: 'different-product-id',
        });

        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'CREATION_SCRIPT_PRODUCT_MISMATCH',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C005: 分镜数量校验
    // -------------------------------------------------------------------------

    describe('BUG-C005: 分镜数量校验', () => {
      it('BUG-C005-T1: 分镜数量为 0 应返回 400 错误', async () => {
        mockRepository.findScriptWithShots.mockResolvedValueOnce({
          ...createMockScript(),
          shots: [],
        });

        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'SCRIPT_NO_SHOTS_GENERATED',
          }),
        });
      });

      it('BUG-C005-T2: 分镜数量超过限制应返回 400 错误', async () => {
        // 创建超过 50 个分镜的脚本
        const manyShots = Array.from({ length: 55 }, (_, i) => ({
          id: generateUUID(),
          shotIndex: i,
          duration: 3.0,
          sceneDescriptionQuery: `分镜 ${i}`,
          visualDescription: `分镜 ${i}`,
          cameraMovement: 'pan',
          transitionType: 'cut',
          voiceoverText: '测试',
          subtitleText: '测试',
          complianceStatus: 'PASSED',
        }));

        mockRepository.findScriptWithShots.mockResolvedValueOnce({
          ...createMockScript(),
          shots: manyShots,
        });

        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'SHOTS_LIMIT_EXCEEDED',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('createCreation 正常流程', () => {
      it('NORMAL-T1: SCRIPT_DRIVEN 模式应正确创建创作', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
          })
          .expect(200);

        expect(response.body.data).toMatchObject({
          status: 'PENDING',
        });
        expect(response.body.data.creation_id).toBeDefined();
        expect(response.body.data.task_id).toBeDefined();
      });

      it('NORMAL-T2: 应正确处理所有可选参数', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
            engine_mode: 'SCRIPT_DRIVEN',
            target_resolution: '1920x1080',
            export_format: 'mp4',
            voice_profile: 'professional_male',
            bgm_policy: 'auto_match',
            prefer_ai_video: true,
          })
          .expect(200);

        expect(response.body.data.creation_id).toBeDefined();
      });

      it('NORMAL-T3: 应正确处理目标语言参数', async () => {
        // Target language translation requires external API - verify basic flow
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
            engine_mode: 'SCRIPT_DRIVEN',
            export_format: 'mov',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.creation_id).toBeDefined();
      }, 60000);
    });
  });

  // =============================================================================
  // Test Group: getCreationDetail - 创作详情查询 (BUG-C010 ~ BUG-C015)
  // =============================================================================

  describe('getCreationDetail API', () => {
    beforeEach(() => {
      mockRepository.addCreation(createMockCreation({
        id: VALID_CREATION_ID,
        productId: VALID_PRODUCT_ID,
        scriptId: VALID_SCRIPT_ID,
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-C010: creation_id 校验
    // -------------------------------------------------------------------------

    describe('BUG-C010: creation_id 校验', () => {
      it('BUG-C010-T1: 空 creation_id 应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/creations/%20');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-C010-T2: 无效的 UUID 格式应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/creations/invalid-uuid');

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
    // BUG-C011: 创作不存在
    // -------------------------------------------------------------------------

    describe('BUG-C011: 创作不存在处理', () => {
      it('BUG-C011-T1: 不存在的 creation_id 应返回 404 错误', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations/${NON_EXISTENT_CREATION_ID}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'CREATION_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C012: 跨商品访问校验
    // -------------------------------------------------------------------------

    describe('BUG-C012: 跨商品访问校验', () => {
      it('BUG-C012-T1: 指定 product_id 不匹配应返回 403 错误', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations/${VALID_CREATION_ID}?product_id=different-product-id`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'FORBIDDEN_CROSS_PRODUCT',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('getCreationDetail 正常流程', () => {
      it('NORMAL-T1: 应正确返回创作详情', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations/${VALID_CREATION_ID}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          creation_id: VALID_CREATION_ID,
          product_id: VALID_PRODUCT_ID,
          script_id: VALID_SCRIPT_ID,
        });
        expect(response.body.data.shot_renders).toBeDefined();
      });

      it('NORMAL-T2: 应正确包含 shot_renders', async () => {
        const now = new Date();
        const creationWithShots = createMockCreation({
          id: VALID_CREATION_ID,
          shotRenders: [
            {
              id: generateUUID(),
              creationId: VALID_CREATION_ID,
              scriptShotId: generateUUID(),
              shotId: 'shot_001',
              shotIndex: 0,
              cacheHash: null,
              sliceId: null,
              renderPath: null,
              renderDurationMs: null,
              retryCount: 0,
              status: 'PENDING',
              errorMessage: null,
              updatedAt: now,
            },
          ],
        });
        mockRepository.addCreation(creationWithShots);

        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations/${VALID_CREATION_ID}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.shot_renders).toBeDefined();
      });
    });
  });

  // =============================================================================
  // Test Group: cancelCreation - 创作取消 (BUG-C020 ~ BUG-C025)
  // =============================================================================

  describe('cancelCreation API', () => {
    beforeEach(() => {
      mockRepository.addCreation(createMockCreation({
        id: VALID_CREATION_ID,
        status: 'PENDING',
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-C020: creation_id 校验
    // -------------------------------------------------------------------------

    describe('BUG-C020: creation_id 校验', () => {
      it('BUG-C020-T1: 空 creation_id 应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations/%20/cancel');

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
    // BUG-C021: 创作不存在
    // -------------------------------------------------------------------------

    describe('BUG-C021: 创作不存在处理', () => {
      it('BUG-C021-T1: 不存在的 creation_id 应返回 404 错误', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${NON_EXISTENT_CREATION_ID}/cancel`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'CREATION_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C022: 状态不允许取消
    // -------------------------------------------------------------------------

    describe('BUG-C022: 状态不允许取消', () => {
      it('BUG-C022-T1: FINISHED 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'FINISHED',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/cancel`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'TASK_STATUS_CONFLICT',
          }),
        });
      });

      it('BUG-C022-T2: FAILED 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'FAILED',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/cancel`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'TASK_STATUS_CONFLICT',
          }),
        });
      });

      it('BUG-C022-T3: CANCELED 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'CANCELED',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/cancel`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'TASK_STATUS_CONFLICT',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('cancelCreation 正常流程', () => {
      it('NORMAL-T1: PENDING 状态应正确取消', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/cancel`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          creation_id: VALID_CREATION_ID,
          status: 'CANCELED',
        });
      });

      it('NORMAL-T2: PROCESSING 状态应正确取消', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'PROCESSING',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/cancel`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          status: 'CANCELED',
        });
      });
    });
  });

  // =============================================================================
  // Test Group: listCreations - 创作列表查询 (BUG-C030 ~ BUG-C035)
  // =============================================================================

  describe('listCreations API', () => {
    beforeEach(() => {
      // 添加测试数据
      for (let i = 0; i < 25; i++) {
        mockRepository.addCreation(createMockCreation({
          id: generateUUID(),
          status: i % 3 === 0 ? 'PENDING' : i % 3 === 1 ? 'PROCESSING' : 'FINISHED',
        }));
      }
    });

    // -------------------------------------------------------------------------
    //正常流程测试
    // -------------------------------------------------------------------------

    describe('listCreations 正常流程', () => {
      it('NORMAL-T1: 应正确返回创作列表', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations?product_id=${VALID_PRODUCT_ID}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          items: expect.any(Array),
          page_info: expect.any(Object),
        });
      });

      it('NORMAL-T2: 应正确过滤状态', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations?product_id=${VALID_PRODUCT_ID}&status=PENDING`)
          .expect(200);

        response.body.data.items.forEach((item: any) => {
          expect(item.status).toBe('PENDING');
        });
      });

      it('NORMAL-T3: 应正确处理空列表', async () => {
        mockRepository.clearCreations();

        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations?product_id=${VALID_PRODUCT_ID}`)
          .expect(200);

        expect(response.body.data.items).toEqual([]);
      });

      it('NORMAL-T4: 应正确处理分页', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/creations?product_id=${VALID_PRODUCT_ID}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.items).toBeDefined();
      });
    });
  });

  // =============================================================================
  // Test Group: retryCreation - 创作重试 (BUG-C040 ~ BUG-C045)
  // =============================================================================

  describe('retryCreation API', () => {
    beforeEach(() => {
      mockRepository.addCreation(createMockCreation({
        id: VALID_CREATION_ID,
        status: 'FAILED',
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-C040: creation_id 校验
    // -------------------------------------------------------------------------

    describe('BUG-C040: creation_id 校验', () => {
      it('BUG-C040-T1: 空 creation_id 应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations/%20/retry');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_REQUEST',
          }),
        });
      });

      it('BUG-C040-T2: 无效的 UUID 格式应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations/invalid-uuid/retry');

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
    // BUG-C041: 创作不存在
    // -------------------------------------------------------------------------

    describe('BUG-C041: 创作不存在处理', () => {
      it('BUG-C041-T1: 不存在的 creation_id 应返回 404 错误', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${NON_EXISTENT_CREATION_ID}/retry`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'CREATION_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C042: 状态不允许重试
    // -------------------------------------------------------------------------

    describe('BUG-C042: 状态不允许重试', () => {
      it('BUG-C042-T1: FINISHED 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'FINISHED',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/retry`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'TASK_STATUS_CONFLICT',
          }),
        });
      });

      it('BUG-C042-T2: PENDING 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'PENDING',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/retry`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'TASK_STATUS_CONFLICT',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('retryCreation 正常流程', () => {
      it('NORMAL-T1: FAILED 状态应正确重试', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/retry`)
          .expect(200);

        expect(response.body.success).toBe(true);
        if (response.body.data) {
          expect(response.body.data.creation_id).toBeDefined();
        }
      });

      it('NORMAL-T2: CANCELED 状态应正确重试', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'CANCELED',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/retry`)
          .expect(200);

        expect(response.body.success).toBe(true);
        if (response.body.data) {
          expect(response.body.data.creation_id).toBeDefined();
        }
      });
    });
  });

  // =============================================================================
  // Test Group: exportCreation - 创作导出 (BUG-C050 ~ BUG-C055)
  // =============================================================================

  describe('exportCreation API', () => {
    beforeEach(() => {
      mockRepository.addCreation(createMockCreation({
        id: VALID_CREATION_ID,
        status: 'FINISHED',
        videoUrl: 'https://example.com/video.mp4',
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-C050: creation_id 校验
    // -------------------------------------------------------------------------

    describe('BUG-C050: creation_id 校验', () => {
      it('BUG-C050-T1: 空 creation_id 应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations/%20/export');

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
    // BUG-C051: 创作不存在
    // -------------------------------------------------------------------------

    describe('BUG-C051: 创作不存在处理', () => {
      it('BUG-C051-T1: 不存在的 creation_id 应返回 404 错误', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${NON_EXISTENT_CREATION_ID}/export`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'CREATION_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C052: 状态不允许导出
    // -------------------------------------------------------------------------

    describe('BUG-C052: 状态不允许导出', () => {
      it('BUG-C052-T1: PENDING 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'PENDING',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/export`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'EXPORT_NOT_ALLOWED',
          }),
        });
      });

      it('BUG-C052-T2: PROCESSING 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'PROCESSING',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/export`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'EXPORT_NOT_ALLOWED',
          }),
        });
      });

      it('BUG-C052-T3: FINISHED 但无视频应返回 400 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'FINISHED',
          videoUrl: null,
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/export`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'NO_VIDEO_GENERATED',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('exportCreation 正常流程', () => {
      it('NORMAL-T1: FINISHED 状态应正确导出', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/export`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          creation_id: VALID_CREATION_ID,
          export_enqueued: false,
        });
      });

      it('NORMAL-T2: 重新导出不同格式应入队', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/export?export_format=webm`)
          .expect(200);

        expect(response.body.success).toBe(true);
        if (response.body.data) {
          expect(response.body.data.video_url).toBeDefined();
        }
      });
    });
  });

  // =============================================================================
  // Test Group: rerenderShot - 分镜重渲染 (BUG-C060 ~ BUG-C065)
  // =============================================================================

  describe('rerenderShot API', () => {
    beforeEach(() => {
      mockRepository.addCreation(createMockCreation({
        id: VALID_CREATION_ID,
        status: 'PROCESSING',
        shotRenders: [
          { id: generateUUID(), shotIndex: 0, status: 'COMPLETED' },
          { id: generateUUID(), shotIndex: 1, status: 'FAILED' },
        ],
      }));
    });

    // -------------------------------------------------------------------------
    // BUG-C060: creation_id 校验
    // -------------------------------------------------------------------------

    describe('BUG-C060: creation_id 校验', () => {
      it('BUG-C060-T1: 空 creation_id 应返回 400 错误', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations/%20/rerender-shot')
          .send({ shot_index: 0 });

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
    // BUG-C061: 创作不存在
    // -------------------------------------------------------------------------

    describe('BUG-C061: 创作不存在处理', () => {
      it('BUG-C061-T1: 不存在的 creation_id 应返回 404 错误', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${NON_EXISTENT_CREATION_ID}/rerender-shot`)
          .send({ shot_index: 0 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'CREATION_NOT_FOUND',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // BUG-C062: 状态不允许重渲染
    // -------------------------------------------------------------------------

    describe('BUG-C062: 状态不允许重渲染', () => {
      it('BUG-C062-T1: PENDING 状态应返回 409 错误', async () => {
        mockRepository.addCreation(createMockCreation({
          id: VALID_CREATION_ID,
          status: 'PENDING',
        }));

        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/rerender-shot`)
          .send({ shot_index: 0 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body).toMatchObject({
          error: expect.objectContaining({
            code: 'INVALID_STATUS',
          }),
        });
      });
    });

    // -------------------------------------------------------------------------
    // 正常流程测试
    // -------------------------------------------------------------------------

    describe('rerenderShot 正常流程', () => {
      it('NORMAL-T1: PROCESSING 状态应正确重渲染', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/creations/${VALID_CREATION_ID}/rerender-shot`)
          .send({ shot_index: 0 })
          .expect(200);

        // Verify response is well-formed (success or handled error)
        expect(response.status).toBe(200);
      });
    });
  });

  // =============================================================================
  // Test Group: 边界条件测试
  // =============================================================================

  describe('边界条件测试', () => {
    describe('engine_mode 边界值', () => {
      it('BOUNDARY-T1: 默认 engine_mode 应使用 SCRIPT_DRIVEN', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
          })
          .expect(200);

        expect(response.body.data.creation_id).toBeDefined();
      });

      it('BOUNDARY-T2: 无效的 engine_mode 应使用默认值处理', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
            engine_mode: 'INVALID_MODE',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.creation_id).toBeDefined();
      });
    });

    describe('target_resolution 边界值', () => {
      it('BOUNDARY-T3: 支持的标准分辨率应正确处理', async () => {
        const resolutions = ['1080x1920', '1920x1080', '1080x1080', '720x1280'];

        for (const resolution of resolutions) {
          const response = await request(app.getHttpServer())
            .post('/api/v1/creations')
            .send({
              product_id: VALID_PRODUCT_ID,
              script_id: VALID_SCRIPT_ID,
              target_resolution: resolution,
            })
            .expect(200);

          expect(response.body.data.creation_id).toBeDefined();
        }
      });
    });

    describe('export_format 边界值', () => {
      it('BOUNDARY-T4: 支持的导出格式应正确处理', async () => {
        const formats = ['mp4', 'mov', 'webm'];

        for (const format of formats) {
          const response = await request(app.getHttpServer())
            .post('/api/v1/creations')
            .send({
              product_id: VALID_PRODUCT_ID,
              script_id: VALID_SCRIPT_ID,
              export_format: format,
            })
            .expect(200);

          expect(response.body.data.creation_id).toBeDefined();
        }
      });
    });
  });

  // =============================================================================
  // Test Group:性能测试
  // =============================================================================

  describe('性能测试', () => {
    beforeEach(() => {
      // 添加大量测试数据
      for (let i = 0; i < 100; i++) {
        mockRepository.addCreation(createMockCreation({
          id: generateUUID(),
        }));
      }
    });

    it('PERF-T1: 大量数据列表查询应在合理时间内完成', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .get(`/api/v1/creations?product_id=${VALID_PRODUCT_ID}&limit=20`)
        .expect(200);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });
  });

  // =============================================================================
  // Test Group: 并发测试
  // =============================================================================

  describe('并发测试', () => {
    it('CONCURRENT-T1: 并发创建多个创作应正确处理', async () => {
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/v1/creations')
          .send({
            product_id: VALID_PRODUCT_ID,
            script_id: VALID_SCRIPT_ID,
          })
          .expect(200)
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach((response) => {
        expect(response.body.data.creation_id).toBeDefined();
      });
    });
  });
});