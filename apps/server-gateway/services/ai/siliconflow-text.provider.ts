/**
 * SiliconFlow Text Provider — 情感三分类专用
 *
 * 模型: Qwen/Qwen3-4B（4B 参数，中文能力强且速度快，SiliconFlow 免费调用）
 * 用途: 对评论进行 positive / neutral / negative 三分类
 * 区分于 DoubaoTextProvider（大模型，用于深度分析）
 */

import { Injectable, Logger } from '@nestjs/common';
import { siliconFlowRequestWithRetry, SiliconFlowApiError } from './siliconflow-client';

const SILICONFLOW_SENTIMENT_MODEL = 'Qwen/Qwen3-4B';
const SILICONFLOW_SENTIMENT_MAX_TOKENS = 1024;
const SILICONFLOW_SENTIMENT_TEMPERATURE = 0.2; // 低温度，确保分类稳定

export interface SentimentClassificationResult {
  sentiment: 'positive' | 'neutral' | 'negative';
}

@Injectable()
export class SiliconFlowTextProvider {
  private readonly logger = new Logger(SiliconFlowTextProvider.name);

  /**
   * 情感三分类（批量）
   * 每批最多 10 条评论，返回对应的情感标签
   */
  async classifySentimentBatch(
    comments: Array<{ content: string; likeCount: number }>,
  ): Promise<SentimentClassificationResult[]> {
    const systemPrompt = `你是一名专业的 TikTok 电商评论情感分析专家。请对以下用户评论进行精准的三分类（positive / neutral / negative）。

## 分类标准（严格遵循）
### positive（正面）
- 明确表达满意、喜爱、惊喜、赞美
- 表达回购意愿（"会回购""已买第二次""推荐给大家"）
- 对产品品质、效果、物流、包装、客服的具体正面评价
- 中性语气但提到"不错""还行""满意""喜欢""超值""性价比高""好用"等正面词汇均归 positive
- 中文口语化表达如"绝了""爱了""太棒了"→ positive

### neutral（中性）
- 纯询问、咨询（"多少钱""怎么买""什么时候发货"）
- 客观陈述无明显褒贬（"收到了""还没用""刚下单"）
- 包含正面和负面混合的评价且难以判断偏向
- 对产品本身无评价（如只评价快递速度但未评价产品）
- 表达不确定（"不知道好不好""还没试"）

### negative（负面）
- 明确表达不满、失望、后悔、愤怒
- 投诉产品质量、功能缺陷、效果差，抱怨价格过高、"不值这个价"
- 投诉物流慢、包装破损、客服态度差，表达退货意愿
- 中性语气但提到"太差""完全没用""浪费钱""后悔"等负面词汇均归 negative
- 讽刺/反讽语句归 negative（如"真棒👍，用了三天就坏了"）
- 中文口语化表达"踩雷""雷品""翻车"→ negative

## Few-shot 示例
输入：
[1] 这个产品真的好用，已经买第三次了，推荐给朋友了 (点赞:45)
[2] 请问这个支持安卓系统吗？ (点赞:2)
[3] 用了两天就坏了，质量太差，后悔买了 (点赞:18)
[4] 还没收到，等用了再来评价 (点赞:1)
[5] 包装挺精致的，但效果一般般吧 (点赞:5)

输出：
[{"sentiment":"positive"},{"sentiment":"neutral"},{"sentiment":"negative"},{"sentiment":"neutral"},{"sentiment":"neutral"}]

## 输出格式
严格按照顺序输出 JSON 数组，与输入评论一一对应，只包含 sentiment 字段。
只输出 JSON，不要 markdown 标记或额外解释。`;

    const userPrompt = comments
      .map((c, i) => `[${i + 1}] ${c.content} (点赞:${c.likeCount})`)
      .join('\n');

    this.logger.log(`Sending ${comments.length} comments for sentiment classification`);

    try {
      const response = await siliconFlowRequestWithRetry<{
        choices: Array<{ message: { content: string } }>;
      }>(
        '/chat/completions',
        {
          body: {
            model: SILICONFLOW_SENTIMENT_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: SILICONFLOW_SENTIMENT_TEMPERATURE,
            max_tokens: SILICONFLOW_SENTIMENT_MAX_TOKENS,
            top_p: 0.9,
          },
          timeoutMs: 30000,
        },
        2, // 最大重试2次
        500, // 初始延迟500ms
      );

      const rawContent = response.data.choices?.[0]?.message?.content || '';
      return this.parseSentimentResults(rawContent, comments.length);
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error(`SiliconFlow sentiment classification failed: ${err}`);
      throw error;
    }
  }

  /**
   * 解析 LLM 返回的情感分类结果
   */
  private parseSentimentResults(raw: string, expectedCount: number): SentimentClassificationResult[] {
    // 清理可能的 markdown 标记
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        throw new Error('Expected array, got ' + typeof parsed);
      }
      return parsed.slice(0, expectedCount).map((item: Record<string, unknown>) => {
        const sentiment = String(item.sentiment || 'neutral').toLowerCase() as 'positive' | 'neutral' | 'negative';
        return {
          sentiment:
            sentiment === 'positive' || sentiment === 'neutral' || sentiment === 'negative'
              ? sentiment
              : 'neutral',
        };
      });
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse sentiment JSON: ${err}`);
      // 容错：返回默认 neutral
      return Array.from({ length: expectedCount }, () => ({ sentiment: 'neutral' as const }));
    }
  }
}
