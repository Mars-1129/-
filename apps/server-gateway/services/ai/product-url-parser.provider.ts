// =============================================================================
// TikStream AI — Product URL Parser Provider
// 使用 Doubao Text LLM 从商品链接推断结构化 Product 信息
// （不依赖真实网页抓取，从 URL 模式/域名/路径中做 AI 推断）
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { DoubaoTextProvider } from './doubao-text.provider';
import type { ProductRecognitionResult } from '@tikstream/shared-types';

const URL_PARSE_SYSTEM_PROMPT = `你是一个电商商品分析专家。用户会提供一条商品链接（可能是 Amazon、Shopify、TikTok Shop、小红书等平台的 URL）。

请从链接中尽可能推断该商品的信息，严格返回 JSON 格式，包含以下字段：
- title: 商品主体名称（中文，简明扼要，如"无线卷发棒"、"保湿面霜"）
- category: 电商类目（从下列中选择最匹配的：Beauty/PersonalCare, Fashion/Clothing, Electronics, Home/Garden, Sports/Outdoors, Food/Beverage, Health/Wellness, Toys/Games, Automotive, Office/Stationery, Other）
- selling_points: 推断的卖点列表（3-5 条，中文短语，每条 10 字以内）
- color: 主体颜色（中文，无法推断则为 null）
- material_type: 主体材质（中文，无法推断则为 null）
- usage_scenario: 典型使用场景（中文，无法推断则为 null）
- brand: 从 URL/品牌名中可辨识的品牌（中文/英文，无法推断则为 null）
- rich_features: 其他特征（JSON 对象，如 {"shape":"圆柱形","has_led":true}，无则返回 {}）

返回示例：
{"title":"无线卷发棒","category":"Beauty/PersonalCare","selling_points":["3档智能控温","便携无线设计","防烫陶瓷涂层","快速加热"],"color":"银白色","material_type":"陶瓷涂层","usage_scenario":"居家美发","brand":null,"rich_features":{"shape":"圆柱形","has_led":true}}

仅返回 JSON，不要包含其他内容。`;

const VALID_CATEGORIES = [
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

@Injectable()
export class ProductUrlParserProvider {
  private readonly logger = new Logger(ProductUrlParserProvider.name);

  constructor(private readonly doubaoText: DoubaoTextProvider) {}

  /**
   * 从商品链接解析结构化 Product 信息
   */
  async parseUrl(productUrl: string): Promise<ProductRecognitionResult> {
    const userPrompt = `请分析以下商品链接并推断商品信息：\n${productUrl}`;

    try {
      const raw = await this.doubaoText.generateText(URL_PARSE_SYSTEM_PROMPT, userPrompt);
      const result = this.parseResponse(raw);
      this.logger.log(
        `URL parsed: ${result.title} (${result.category}) from ${productUrl.slice(0, 60)}...`,
      );
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`URL parsing failed: ${msg}, returning fallback`);
      return this.fallbackParse(productUrl);
    }
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
    const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'Other';

    const selling_points: string[] = Array.isArray(parsed.selling_points)
      ? parsed.selling_points
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim())
          .slice(0, 5)
      : [];

    if (selling_points.length === 0) {
      selling_points.push('品质可靠', '设计精良');
    }

    return {
      title,
      category,
      selling_points,
      color: typeof parsed.color === 'string' ? parsed.color.trim() : undefined,
      material_type: typeof parsed.material_type === 'string' ? parsed.material_type.trim() : undefined,
      usage_scenario: typeof parsed.usage_scenario === 'string' ? parsed.usage_scenario.trim() : undefined,
      brand: typeof parsed.brand === 'string' ? parsed.brand.trim() : undefined,
      rich_features: parsed.rich_features && typeof parsed.rich_features === 'object'
        ? (parsed.rich_features as Record<string, unknown>)
        : {},
    };
  }

  /**
   * 降级：从 URL 字符串中做简单的启发式提取
   */
  private fallbackParse(productUrl: string): ProductRecognitionResult {
    let urlPath = productUrl;
    try {
      const url = new URL(productUrl);
      urlPath = url.pathname.replace(/\/$/, '');
    } catch {
      // 非标准 URL，直接用原串
    }

    const segments = urlPath.split(/[/-]/).filter(Boolean);
    const lastSegment = segments[segments.length - 1] || urlPath;

    const title = lastSegment
      .replace(/[_-]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/https?:|www\./gi, '')
      .replace(/\.(com|cn|net|org|shop|store|io|co)/gi, '')
      .replace(/\/+/g, ' ')
      .trim()
      .slice(0, 50) || '未命名商品';

    return {
      title,
      category: 'Other',
      selling_points: ['品质可靠', '设计精良'],
      color: undefined,
      material_type: undefined,
      usage_scenario: undefined,
      brand: undefined,
      rich_features: {},
    };
  }
}
