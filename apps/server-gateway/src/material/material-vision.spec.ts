/**
 * Material Service — analyzeMaterialVision() 单元测试
 */

import { HttpStatus } from '@nestjs/common';

// ---- Mock 所有外部模块（必须与 material.service.ts 的 import 路径精确匹配） ----
jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => ({
    status: 'ready',
    connect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
    duplicate: jest.fn().mockReturnThis(),
    scanStream: jest.fn().mockReturnValue({ on: jest.fn() }),
  }));
  return {
    __esModule: true,
    default: MockRedis,
  };
});
jest.mock('../../services/ai/siliconflow-vision.provider');
jest.mock('../../services/ai/doubao-vision.provider');
jest.mock('../../services/ai/doubao-text.provider');
jest.mock('../../services/ai/product-recognition.provider');
jest.mock('../../services/ai/qdrant-client.service');
jest.mock('../../services/ai/imagebind-client.service');
jest.mock('../../services/storage/minio-client.service');
jest.mock('../../services/media/media-probe.service');
jest.mock('../../services/media/thumbnail.service');
jest.mock('../services/synonym/synonym.service');
jest.mock('../product/product.repository');
jest.mock('./material.repository');
jest.mock('../../services/queue/queue.constants', () => ({
  QUEUE_CONSTANTS: { GPU_SLICING: 'gpu-slicing' },
}));
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({})),
}));

import { MaterialService } from './material.service';
import { VisionAnalysisResult } from '../../services/ai/siliconflow-vision.provider';

describe('MaterialService.analyzeMaterialVision', () => {
  let service: MaterialService;
  let mockPrisma: any;
  let mockVision: any;

  const mockMaterialId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    mockPrisma = {
      findMaterialById: jest.fn(),
    };

    mockVision = {
      analyzeMaterialImage: jest.fn(),
    };

    service = new (MaterialService as any)(
      mockPrisma,  // prisma (MaterialRepository)
      {},          // productRepo
      {},          // minio
      {},          // mediaProbe
      {},          // thumbnailService
      {},          // qdrant
      {},          // imageBind
      {},          // productRecognition
      {},          // synonym
      {},          // doubaoText
      mockVision,  // siliconflowVision
      {},          // gpuSlicingQueue
    );
  });

  it('should throw NOT_FOUND when material does not exist', async () => {
    mockPrisma.findMaterialById.mockResolvedValue(null);

    await expect(
      service.analyzeMaterialVision(mockMaterialId),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { error: { code: 'MATERIAL_NOT_FOUND' } },
    });
  });

  it('should throw BAD_REQUEST when material has no image URL', async () => {
    mockPrisma.findMaterialById.mockResolvedValue({
      material_id: mockMaterialId,
      originUrl: null,
      origin_url: null,
    });

    await expect(
      service.analyzeMaterialVision(mockMaterialId),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { error: { code: 'MATERIAL_NO_IMAGE' } },
    });
  });

  it('should call vision provider with correct context', async () => {
    const mockMaterial = {
      material_id: mockMaterialId,
      originUrl: 'https://cdn.example.com/imgs/test.jpg',
      file_name: 'test_image.jpg',
      product: {
        title: '测试商品',
        selling_points: ['卖点1', '卖点2'],
      },
    };

    const mockResult: VisionAnalysisResult = {
      product_features: ['白色'],
      visual_selling_points: ['时尚'],
      shot_suggestions: [{ shot_type: '特写', description: '', priority: 1 }],
      style_tags: ['简约'],
      quality_assessment: { clarity: 'high', lighting: '好', composition: '好' },
    };

    mockPrisma.findMaterialById.mockResolvedValue(mockMaterial);
    mockVision.analyzeMaterialImage.mockResolvedValue(mockResult);

    const result = await service.analyzeMaterialVision(mockMaterialId);

    expect(mockVision.analyzeMaterialImage).toHaveBeenCalledWith(
      'https://cdn.example.com/imgs/test.jpg',
      {
        material_filename: 'test_image.jpg',
        product_title: '测试商品',
        existing_selling_points: ['卖点1', '卖点2'],
      },
    );
    expect(result).toEqual(mockResult);
  });

  it('should throw BAD_GATEWAY when vision API fails', async () => {
    mockPrisma.findMaterialById.mockResolvedValue({
      material_id: mockMaterialId,
      originUrl: 'https://cdn.example.com/img.jpg',
      file_name: 'test.jpg',
    });
    mockVision.analyzeMaterialImage.mockRejectedValue(new Error('API error'));

    await expect(
      service.analyzeMaterialVision(mockMaterialId),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: { error: { code: 'VISION_ANALYSIS_FAILED' } },
    });
  });

  it('should work without product context', async () => {
    const mockMaterial = {
      material_id: mockMaterialId,
      originUrl: 'https://cdn.example.com/i.jpg',
      file_name: 'simple.jpg',
      product: null as any,
    };

    mockPrisma.findMaterialById.mockResolvedValue(mockMaterial);
    mockVision.analyzeMaterialImage.mockResolvedValue({
      product_features: [],
      visual_selling_points: [],
      shot_suggestions: [],
      style_tags: [],
      quality_assessment: { clarity: 'medium', lighting: '', composition: '' },
    });

    const result = await service.analyzeMaterialVision(mockMaterialId);
    expect(mockVision.analyzeMaterialImage).toHaveBeenCalledWith(
      'https://cdn.example.com/i.jpg',
      { material_filename: 'simple.jpg' },
    );
    expect(result).toBeDefined();
  });
});
