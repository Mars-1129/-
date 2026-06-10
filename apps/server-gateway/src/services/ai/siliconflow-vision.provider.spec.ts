/**
 * SiliconFlow Vision Provider 单元测试
 *
 * 测试：Prompt 构建、JSON 响应解析、空结果处理、批量分析
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SiliconFlowVisionProvider, VisionAnalysisResult } from '../../../services/ai/siliconflow-vision.provider';

// Mock siliconflow-client 模块
jest.mock('../../../services/ai/siliconflow-client', () => ({
  siliconFlowRequestWithRetry: jest.fn(),
  SiliconFlowApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  getSiliconFlowApiKey: jest.fn().mockReturnValue('sk-test'),
  clearSiliconFlowApiKeyCache: jest.fn(),
}));

// Mock env — support default value fallback
jest.mock('../../common/env', () => ({
  env: (key: string, _legacy?: string, defaultValue?: string) => {
    if (key === 'SILICONFLOW_API_KEY') return 'sk-test';
    return defaultValue || '';
  },
}));

const { siliconFlowRequestWithRetry } = require('../../../services/ai/siliconflow-client');

describe('SiliconFlowVisionProvider', () => {
  let provider: SiliconFlowVisionProvider;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SiliconFlowVisionProvider],
    }).compile();

    provider = module.get<SiliconFlowVisionProvider>(SiliconFlowVisionProvider);
  });

  describe('parseVisionResponse', () => {
    it('should parse valid JSON response correctly', () => {
      const mockResponse = JSON.stringify({
        product_features: ['白色外观', '金属材质', '小巧便携'],
        visual_selling_points: ['质感高级', '外观时尚'],
        shot_suggestions: [
          { shot_type: '产品特写', description: '近距离展示产品细节', priority: 1 },
          { shot_type: '使用场景', description: '展示实际使用效果', priority: 2 },
        ],
        style_tags: ['极简风', '白底棚拍'],
        quality_assessment: {
          clarity: 'high',
          lighting: '均匀柔和',
          composition: '中心对称',
        },
      });

      // Access private method via any
      const result = (provider as any).parseVisionResponse(mockResponse);

      expect(result.product_features).toEqual(['白色外观', '金属材质', '小巧便携']);
      expect(result.visual_selling_points).toEqual(['质感高级', '外观时尚']);
      expect(result.shot_suggestions).toHaveLength(2);
      expect(result.shot_suggestions[0].shot_type).toBe('产品特写');
      expect(result.shot_suggestions[0].priority).toBe(1);
      expect(result.style_tags).toEqual(['极简风', '白底棚拍']);
      expect(result.quality_assessment.clarity).toBe('high');
    });

    it('should handle JSON with surrounding text (model output wrapping)', () => {
      const mockResponse = `以下是分析结果：\n${JSON.stringify({
        product_features: ['测试'],
        visual_selling_points: [],
        shot_suggestions: [],
        style_tags: [],
        quality_assessment: { clarity: 'medium', lighting: '自然光', composition: '三分法' },
      })}\n分析完成。`;

      const result = (provider as any).parseVisionResponse(mockResponse);
      expect(result.product_features).toEqual(['测试']);
      expect(result.quality_assessment.clarity).toBe('medium');
    });

    it('should return empty result on invalid JSON', () => {
      const result = (provider as any).parseVisionResponse('这不是 JSON');
      expect(result.product_features).toEqual([]);
      expect(result.style_tags).toEqual([]);
      expect(result.quality_assessment.clarity).toBe('medium');
    });

    it('should handle missing fields gracefully', () => {
      const result = (provider as any).parseVisionResponse('{}');
      expect(result.product_features).toEqual([]);
      expect(result.visual_selling_points).toEqual([]);
      expect(result.shot_suggestions).toEqual([]);
      expect(result.style_tags).toEqual([]);
    });

    it('should validate clarity enum', () => {
      const result = (provider as any).parseVisionResponse(
        JSON.stringify({
          product_features: [],
          visual_selling_points: [],
          shot_suggestions: [],
          style_tags: [],
          quality_assessment: { clarity: 'invalid', lighting: '', composition: '' },
        }),
      );
      // Should fallback to 'medium'
      expect(result.quality_assessment.clarity).toBe('medium');
    });

    it('should handle malformed shot_suggestions', () => {
      const result = (provider as any).parseVisionResponse(
        JSON.stringify({
          product_features: [],
          visual_selling_points: [],
          shot_suggestions: [{ type: 'wrong' }],
          style_tags: [],
          quality_assessment: { clarity: 'high', lighting: '', composition: '' },
        }),
      );
      expect(result.shot_suggestions[0].shot_type).toBe('');
      expect(result.shot_suggestions[0].priority).toBe(1);
    });
  });

  describe('buildVisionPrompt', () => {
    it('should build base prompt without context', () => {
      const prompt = (provider as any).buildVisionPrompt();
      expect(prompt).toContain('你是一个电商视频制作的视觉分析专家');
      expect(prompt).toContain('product_features');
      expect(prompt).toContain('shot_suggestions');
      expect(prompt).not.toContain('参考信息');
    });

    it('should include product title in prompt', () => {
      const prompt = (provider as any).buildVisionPrompt({
        product_title: '测试商品',
      });
      expect(prompt).toContain('商品名称: 测试商品');
    });

    it('should include selling points in prompt', () => {
      const prompt = (provider as any).buildVisionPrompt({
        existing_selling_points: ['卖点1', '卖点2'],
      });
      expect(prompt).toContain('卖点1, 卖点2');
    });

    it('should include filename in prompt', () => {
      const prompt = (provider as any).buildVisionPrompt({
        material_filename: 'product_photo.jpg',
      });
      expect(prompt).toContain('product_photo.jpg');
    });

    it('should include all context fields in prompt', () => {
      const prompt = (provider as any).buildVisionPrompt({
        product_title: '智能手表',
        existing_selling_points: ['防水', '长续航'],
        material_filename: 'watch.png',
      });
      expect(prompt).toContain('智能手表');
      expect(prompt).toContain('防水, 长续航');
      expect(prompt).toContain('watch.png');
    });
  });

  describe('emptyResult', () => {
    it('should return default empty vision result', () => {
      const result = (provider as any).emptyResult();
      expect(result.product_features).toEqual([]);
      expect(result.visual_selling_points).toEqual([]);
      expect(result.shot_suggestions).toEqual([]);
      expect(result.style_tags).toEqual([]);
      expect(result.quality_assessment.clarity).toBe('medium');
    });

    it('should include raw response when provided', () => {
      const result = (provider as any).emptyResult('raw text');
      expect(result.raw_response).toBe('raw text');
    });
  });

  describe('analyzeMaterialImage', () => {
    it('should call API with correct parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                product_features: ['白色'],
                visual_selling_points: ['时尚'],
                shot_suggestions: [],
                style_tags: ['简约'],
                quality_assessment: { clarity: 'high', lighting: '好的', composition: '好的' },
              }),
            },
          }],
        },
        headers: new Headers(),
      };

      siliconFlowRequestWithRetry.mockResolvedValue(mockResponse);

      const result = await provider.analyzeMaterialImage('https://example.com/img.jpg');

      expect(siliconFlowRequestWithRetry).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            model: 'Qwen/Qwen3-VL-32B-Instruct',
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: 'user',
                content: expect.arrayContaining([
                  expect.objectContaining({ type: 'image_url' }),
                  expect.objectContaining({ type: 'text' }),
                ]),
              }),
            ]),
          }),
          timeoutMs: 60_000,
        }),
      );

      expect(result.product_features).toEqual(['白色']);
    });

    it('should throw on empty API response', async () => {
      siliconFlowRequestWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        data: { choices: [] },
        headers: new Headers(),
      });

      await expect(
        provider.analyzeMaterialImage('https://example.com/img.jpg'),
      ).rejects.toThrow('Empty response');
    });
  });

  describe('analyzeBatch', () => {
    it('should return results for successful and failed analyses', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                product_features: ['test'],
                visual_selling_points: [],
                shot_suggestions: [],
                style_tags: [],
                quality_assessment: { clarity: 'medium', lighting: '', composition: '' },
              }),
            },
          }],
        },
        headers: new Headers(),
      };

      siliconFlowRequestWithRetry
        .mockResolvedValueOnce(mockResponse)
        .mockRejectedValueOnce(new Error('Network error'));

      const results = await provider.analyzeBatch([
        { url: 'https://example.com/good.jpg' },
        { url: 'https://example.com/bad.jpg' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].product_features).toEqual(['test']);
      expect(results[1].product_features).toEqual([]); // fallback on error
    });
  });
});
