// =============================================================================
// TikStream AI — Product Recognition Provider
// 多模态：Doubao Vision 视觉分析 (P0) + Doubao Text 文本推断 (P1 降级)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { DoubaoTextProvider } from './doubao-text.provider';
import { DoubaoVisionProvider } from './doubao-vision.provider';
import type { ProductRecognitionResult } from '@tikstream/shared-types';

interface RecognitionContext {
  file_name: string;
  file_type: 'IMAGE' | 'VIDEO';
  remark?: string;
  /** 素材图片URL，用于视觉分析 (需求2) */
  image_url?: string;
}

const SYSTEM_PROMPT = `你是一个电商商品分析专家。根据用户提供的素材文件名和备注，推断该素材所展示的商品信息。

请严格返回 JSON 格式，包含以下字段：
- title: 商品主体名称（中文，简明扼要，如"无线卷发棒"、"保湿面霜"）
- category: 所属电商类目（从下列类目中选择最匹配的：Beauty/PersonalCare, Fashion/Clothing, Electronics, Home/Garden, Sports/Outdoors, Food/Beverage, Health/Wellness, Toys/Games, Automotive, Office/Stationery, Other）
- selling_points: 可以从素材中推断出的视觉卖点列表（3-5 条，中文短语，每条 10 字以内）
- color: 商品主体颜色（中文，如"银白色"、"深空灰"，无法推断则为 null）
- material_type: 商品主体材质（中文，如"铝合金"、"陶瓷涂层"，无法推断则为 null）
- usage_scenario: 最典型使用场景（中文，如"居家美发"、"户外运动"，无法推断则为 null）
- brand: 可辨识的品牌名（中文/英文，无法辨识则为 null）
- rich_features: 其他视觉特征（JSON 对象，如 {"shape":"圆柱形","has_led":true}，无则返回 {}）

返回示例：
{"title":"无线卷发棒","category":"Beauty/PersonalCare","selling_points":["3档智能控温","便携无线设计","防烫陶瓷涂层","快速加热"],"color":"银白色","material_type":"陶瓷涂层","usage_scenario":"居家美发","brand":null,"rich_features":{"shape":"圆柱形","has_led":true}}

请仅返回 JSON，不要包含任何其他内容。`;

/**
 * 视觉分析专用 Prompt：从图片内容中深度提取商品属性 (需求2+3)
 */
const VISION_SYSTEM_PROMPT = `你是一个电商商品视觉分析专家。请仔细分析图片内容，提取以下商品信息。

请严格返回 JSON 格式：
- title: 商品主体名称（中文，简明扼要）
- category: 电商类目（Beauty/PersonalCare, Fashion/Clothing, Electronics, Home/Garden, Sports/Outdoors, Food/Beverage, Health/Wellness, Toys/Games, Automotive, Office/Stationery, Other）
- selling_points: 3-5 条视觉卖点（中文短语，10字以内）
- color: 主体颜色（中文，如"银白色"、"深空灰"）
- material_type: 主体材质（中文，如"铝合金"、"陶瓷涂层"）
- usage_scenario: 典型使用场景（中文，如"居家美发"、"户外运动"）
- brand: 可辨识品牌名（无法辨识返回 null）
- rich_features: 视觉特征 JSON（如 {"shape":"圆柱形","has_led":true}，无则返回 {}）

仅返回 JSON，不要包含其他内容。`;

const FALLBACK_CATEGORIES = [
  'Beauty/PersonalCare',
  'Fashion/Clothing',
  'Electronics',
  'Home/Garden',
  'Sports/Outdoors',
  'Food/Beverage',
  'Health/Wellness',
  'Toys/Games',
  'Automotive',
  'Office/Stationery',
  'Other',
];

/**
 * 启发式降级：当 AI 不可用时，从文件名推测商品信息
 */
function heuristicRecognize(context: RecognitionContext): ProductRecognitionResult {
  const name = context.file_name
    .replace(/\.[^.]+$/, '') // 去掉扩展名
    .replace(/[_\-]+/g, ' ') // 下划线/连字符替换为空格
    .replace(/([A-Z])/g, ' $1') // 驼峰分割
    .replace(/\s+/g, ' ')
    .trim();

  // 简单关键词 → 类目映射
  const categoryHints: Array<[RegExp, string]> = [
    [/卷发|美发|护发|洗发|染发|造型|美容|护肤|面膜|口红|粉底|美妆|化妆|化妆品|beauty|hair|skin|makeup/i, 'Beauty/PersonalCare'],
    [/衣服|服装|裙子|裤子|上衣|外套|鞋|帽|包|首饰|fashion|clothing|dress|shirt|shoe/i, 'Fashion/Clothing'],
    [/手机|耳机|充电|蓝牙|音箱|电脑|平板|电子|USB|wireless|phone|earphone|speaker/i, 'Electronics'],
    [/家具|灯|厨具|花园|装饰|home|garden|kitchen|lamp|decor/i, 'Home/Garden'],
    [/运动|健身|瑜伽|户外|camp|sport|yoga|fitness|outdoor/i, 'Sports/Outdoors'],
    [/食品|零食|饮料|咖啡|茶|food|drink|coffee|tea|snack/i, 'Food/Beverage'],
    [/玩具|游戏|toy|game|puzzle/i, 'Toys/Games'],
  ];

  let category = 'Other';
  for (const [regex, cat] of categoryHints) {
    if (regex.test(name)) {
      category = cat;
      break;
    }
  }

  if (context.remark) {
    for (const [regex, cat] of categoryHints) {
      if (regex.test(context.remark)) {
        category = cat;
        break;
      }
    }
  }

  const selling_points: string[] = [];
  const remarkParts = (context.remark || name).split(/[,;，；]/);
  for (const part of remarkParts) {
    const trimmed = part.trim();
    if (trimmed && trimmed.length <= 15) {
      selling_points.push(trimmed);
    }
  }
  if (selling_points.length === 0) {
    selling_points.push('品质可靠', '设计精良');
  }

  return {
    title: name || '未命名商品',
    category,
    selling_points: selling_points.slice(0, 5),
    color: undefined,
    material_type: undefined,
    usage_scenario: undefined,
    brand: undefined,
    rich_features: {},
  };
}

@Injectable()
export class ProductRecognitionProvider {
  private readonly logger = new Logger(ProductRecognitionProvider.name);

  constructor(
    private readonly doubaoText: DoubaoTextProvider,
    private readonly doubaoVision: DoubaoVisionProvider,
  ) {}

  /**
   * 多模态商品识别：
   * P0: Vision 视觉分析 (当 image_url 可用时)
   * P1: Text 文本推断 (降级)
   * P2: 启发式规则 (最终兜底)
   */
  async recognize(context: RecognitionContext): Promise<ProductRecognitionResult> {
    // P0: Vision 视觉分析 (需求2)
    if (context.image_url) {
      try {
        const result = await this.recognizeWithVision(context);
        this.logger.log(
          `Product recognized via Vision: ${result.title} (${result.category})`,
        );
        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Vision recognition failed: ${msg}, falling back to text`);
      }
    }

    // P1: Text 文本推断
    const userPrompt = this.buildUserPrompt(context);

    try {
      const raw = await this.doubaoText.generateText(SYSTEM_PROMPT, userPrompt);
      const result = this.parseResponse(raw);
      this.logger.log(
        `Product recognized via Text: ${result.title} (${result.category})`,
      );
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Text recognition failed: ${msg}, falling back to heuristic`);
      return heuristicRecognize(context);
    }
  }

  /**
   * Vision 视觉分析: 调用 Doubao Vision 模型从图片内容中提取商品属性 (需求2+3)
   */
  private async recognizeWithVision(context: RecognitionContext): Promise<ProductRecognitionResult> {
    const userPrompt = this.buildVisionUserPrompt(context);
    if (!context.image_url) {
      throw new Error('image_url is required for Vision recognition');
    }
    const raw = await this.doubaoVision.analyzeImage(context.image_url, VISION_SYSTEM_PROMPT + '\n\n' + userPrompt);
    return this.parseResponse(raw);
  }

  private buildVisionUserPrompt(context: RecognitionContext): string {
    const parts: string[] = [];
    if (context.file_name) {
      parts.push(`文件名: ${context.file_name}`);
    }
    if (context.remark?.trim()) {
      parts.push(`用户备注: ${context.remark.trim()}`);
    }
    return parts.length > 0 ? `参考信息：\n${parts.join('\n')}` : '请根据图片内容直接分析。';
  }

  private buildUserPrompt(context: RecognitionContext): string {
    const parts: string[] = [];
    parts.push(`素材文件名: ${context.file_name}`);
    parts.push(`素材类型: ${context.file_type === 'IMAGE' ? '图片' : '视频'}`);
    if (context.remark?.trim()) {
      parts.push(`用户备注: ${context.remark.trim()}`);
    }
    return `请根据以下信息推断商品信息：\n${parts.join('\n')}`;
  }

  private parseResponse(raw: string): ProductRecognitionResult {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const title = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : '未命名商品';

    const rawCategory = typeof parsed.category === 'string' ? parsed.category.trim() : '';
    const category = FALLBACK_CATEGORIES.includes(rawCategory) ? rawCategory : 'Other';

    const selling_points: string[] = Array.isArray(parsed.selling_points)
      ? parsed.selling_points
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim())
          .slice(0, 5)
      : [];

    if (selling_points.length === 0) {
      selling_points.push('品质可靠', '设计精良');
    }

    // 深度属性提取 (需求3)
    const color = typeof parsed.color === 'string' && parsed.color.trim()
      ? parsed.color.trim()
      : undefined;

    const material_type = typeof parsed.material_type === 'string' && parsed.material_type.trim()
      ? parsed.material_type.trim()
      : undefined;

    const size_desc = typeof parsed.size_desc === 'string' && parsed.size_desc.trim()
      ? parsed.size_desc.trim()
      : undefined;

    const usage_scenario = typeof parsed.usage_scenario === 'string' && parsed.usage_scenario.trim()
      ? parsed.usage_scenario.trim()
      : undefined;

    const brand = typeof parsed.brand === 'string' && parsed.brand.trim()
      ? parsed.brand.trim()
      : undefined;

    const rich_features = parsed.rich_features && typeof parsed.rich_features === 'object'
      ? (parsed.rich_features as Record<string, unknown>)
      : {};

    return {
      title,
      category,
      selling_points,
      color,
      material_type,
      size_desc,
      usage_scenario,
      brand,
      rich_features,
    };
  }
}
