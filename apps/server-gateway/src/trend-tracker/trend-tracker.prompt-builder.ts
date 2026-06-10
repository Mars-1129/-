// =============================================================================
// TikStream AI — Trend Tracker Prompt Builder
// =============================================================================
// 通过 LLM 模拟 TikTok 趋势发现 + 商品匹配分析
// =============================================================================

import { Injectable } from '@nestjs/common';

export interface TrendTrackerPromptParams {
  product_name: string;
  product_category?: string;
  selling_points: string[];
  kolContext?: string | null;
}

export interface TrendTrackerPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

@Injectable()
export class TrendTrackerPromptBuilder {
  build(params: TrendTrackerPromptParams): TrendTrackerPromptResult {
    const productDescription = [
      params.product_category ? `类目: ${params.product_category}` : '',
      params.selling_points.length > 0
        ? `卖点: ${params.selling_points.join('、')}`
        : '',
    ]
      .filter(Boolean)
      .join(' | ');

    // KOL 上下文段落：当有真实 ViralAnalysis 数据时，注入结构化上下文以提升 LLM 推断准确性
    const kolSection = params.kolContext
      ? `\n\n===== 以下为系统聚合的真实 KOL 爆款分析数据，请优先基于这些数据生成趋势 =====\n${params.kolContext}\n===== KOL 数据结束 =====`
      : '\n\n注意：当前没有真实 KOL 数据可用，请完全基于你的训练知识推断 TikTok 趋势。';

    const systemPrompt = `你是一个 TikTok 趋势分析专家，精通全球短视频平台的流行趋势和内容策略。

你的任务是：
1. 基于训练知识以及提供的 KOL 爆款分析数据，生成当前 TikTok 上最热门的趋势（包括标签、音效、特效、话题），并预测其热度分数和生命周期
2. 评估每条趋势与目标商品的匹配度，给出具体的蹭流量建议

${kolSection}

输出必须是严格的 JSON 格式，不要包含任何 markdown 代码块标记。

规则：
- trends 最多 ${10} 条，按 popularity_score 降序排列
- popularity_score 范围 0-100，表示当前热度
- growth_rate 范围 -1.0~1.0，表示上升/下降趋势
- expiration_days 为预计趋势还能持续的天数
- 每个推荐最多 ${3} 条 adaptation_tips
- product_match_score 范围 0-100
- potential_reach 为预计潜在触达人数
- URL 字段使用 TikTok 标准搜索链接格式`;

    const userPrompt = `请分析以下商品并与 TikTok 当前热门趋势进行匹配：

商品信息: ${productDescription || '通用电商商品'}

请返回如下 JSON 结构：
{
  "trends": [
    {
      "type": "hashtag" | "sound" | "effect" | "topic",
      "name": "趋势名称",
      "url": "TikTok 链接",
      "popularity_score": 0-100,
      "growth_rate": -1.0到1.0,
      "expiration_days": 数字
    }
  ],
  "recommendations": [
    {
      "trend": { ...某条趋势的完整结构... },
      "product_match_score": 0-100,
      "adaptation_tips": ["建议1", "建议2", "建议3"],
      "potential_reach": 数字
    }
  ]
}`;

    return { systemPrompt, userPrompt };
  }
}
