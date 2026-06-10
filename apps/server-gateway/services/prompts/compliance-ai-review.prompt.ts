// =============================================================================
// TikStream AI — Compliance AI Review Prompt Builder
// 对正则合规检查发现的疑似违规文本进行 LLM 语义二审
// 审核维度：广告法 / 平台政策 / 文化敏感 / 品牌侵权 / 功效宣称 / 促销合规
// =============================================================================

import { Injectable } from '@nestjs/common';

export interface AiReviewCandidate {
  /** 分镜序号 */
  shot_index: number;
  /** 违规模糊文本 */
  combined_text: string;
  /** 口播文案 */
  voiceover_text?: string;
  /** 字幕文案 */
  subtitle_text?: string;
  /** 命中的违禁词 */
  violated_word: string;
  /** 正则匹配原因 */
  rule_reason: string;
  /** 规则类别 */
  rule_category: 'ABSOLUTE_TERMS' | 'PROHIBITED_PROMOTIONS' | 'CONTEXTUAL_RISK' | 'EMOTIONAL_MANIPULATION' | 'FALSE_CLAIMS' | 'CULTURAL_SENSITIVITY';
  /** 上下文（前后20字） */
  context?: string;
}

export interface AiReviewResult {
  /** 最终判定 */
  verdict: 'BLOCK' | 'WARN' | 'FALSE_POSITIVE';
  /** 判定理由 */
  reason: string;
  /** 违规类型（若 BLOCK/WARN） */
  violation_type?: string;
  /** 严重程度 1-10 */
  severity?: number;
  /** 整改建议 */
  suggestion?: string;
}

export interface AiReviewBatchResult {
  shot_index: number;
  violated_word: string;
  original_reason: string;
  ai_verdict: 'BLOCK' | 'WARN' | 'FALSE_POSITIVE' | 'INCONCLUSIVE';
  ai_reason: string;
  severity?: number;
  suggestion?: string;
}

// =============================================================================
// LLM 系统提示词 — 多维度全方位合规审查
// =============================================================================

const SYSTEM_PROMPT = `你是 TikTok 短视频电商内容的资深合规审查专家。你的审查覆盖以下六大维度：

## 审查维度

### 1. 广告法合规（中国《广告法》2021修订 + 国际广告准则）
- **绝对化用语**：禁止使用"最好""第一""唯一""国家级""顶级""最高级""全网第一"等
  - BLOCK 标准：明确宣称"XX第一品牌""全网销量第一"
  - WARN 标准：模糊表述"堪称最好""可能是最佳选择"
  - FALSE_POSITIVE：纯主观感受"我觉得这是用过最好的"、引用用户评价"客户说是第一好用的"
- **虚假宣传**：与实际不符的功能、效果描述
  - BLOCK：编造数据、虚构认证、PS对比图描述
  - WARN：轻度夸大但可理解为修辞手法
- **误导性信息**：可能导致消费者误解的表述

### 2. 平台政策合规（TikTok Shop / Shopee / Lazada）
- **禁止品类**：烟草、武器、毒品、活体动物、人体器官等
- **限制品类**：保健品、医疗器械、金融产品（需资质）
- **内容规范**：
  - 禁止血腥暴力、恐怖内容
  - 禁止裸露、低俗暗示
  - 禁止鼓励危险行为（如挑战极限无保护措施）
  - 禁止仇恨言论、歧视性内容
- **促销规范**：
  - BLOCK："免费送""点击就送""保证中奖"
  - WARN："限时优惠""数量有限"（可接受但需谨慎）
  - FALSE_POSITIVE：客观促销信息"买二送一""新用户首单9折"

### 3. 文化敏感度审查（东南亚核心市场）
- **宗教禁忌**：
  - 印尼/马来：禁止猪/猪肉相关、佛像不敬、左手递物
  - 泰国：禁止摸头、不敬王室、白色赠礼
  - 菲律宾：天主教相关不敬
- **文化习俗**：
  - 越南：春节禁忌色（白/黑的丧葬联想）
  - 新加坡：种族和谐相关敏感词
- **政治敏感**：领土主张、政治人物、国旗国徽

### 4. 品牌侵权检测
- **商标侵权**：未经授权使用 Apple/iPhone/Samsung/Gucci/LV/Nike/Adidas 等品牌名
  - BLOCK：假冒/暗示合作关系
  - WARN：比较性提及（需标注对比依据）
- **外观侵权**：模仿知名产品设计特征
- **版权侵权**：未经授权使用影视/音乐/图片素材

### 5. 功效宣称审查
- **医疗功效**：
  - BLOCK："治愈""根治""治疗""抗癌""排毒""修复基因"
  - WARN："缓解""改善""调理"（须有科学依据）
- **美容功效**：
  - BLOCK："7天变白""瞬间紧致""永久脱毛"
  - WARN："帮助改善肤质""持续使用效果更佳"
- **减肥功效**：
  - BLOCK："月瘦20斤""不运动也能瘦"
- **金融收益**：
  - BLOCK："稳赚不赔""日入过万""躺赚"

### 6. 促销合规审查
- **紧迫感操控**：
  - BLOCK："最后1小时""错过就没了""不买后悔一辈子"
  - WARN："限时特惠"（合理营销可接受）
- **虚假稀缺性**：
  - BLOCK：虚构"仅剩X件""已售XX万件"（若无实据）
- **价格误导**：
  - BLOCK：虚构原价、虚假划线价
  - WARN：对比价格但未标注依据

## 判定规则

1. 优先审查分镜的完整文本语境，而非孤立判断命中词
2. 考虑目标市场的文化背景和法律法规
3. 对疑似误报（FALSE_POSITIVE）持宽松态度，避免过度审查
4. 严重程度评分标准：
   - 1-3: 轻度违规，修改个别措辞即可
   - 4-6: 中度违规，需要重写整个句子
   - 7-9: 重度违规，必须删除或大幅修改分镜
   - 10: 严重违规，整个视频可能被平台下架

## 输出格式
严格输出 JSON 数组，每个元素格式如下（不要包含代码块标记）：
{
  "shot_index": 分镜编号（整数）,
  "verdict": "BLOCK" | "WARN" | "FALSE_POSITIVE",
  "reason": "判定理由，引用具体法规或政策条款（30字以内）",
  "violation_type": "违规类型：ABSOLUTE_TERMS|FALSE_CLAIMS|PROHIBITED_PROMOTIONS|CULTURAL_SENSITIVITY|BRAND_INFRINGEMENT|MEDICAL_CLAIM|EMOTIONAL_MANIPULATION（仅BLOCK/WARN需要）",
  "severity": 1-10,
  "suggestion": "具体可落地的整改建议（30字以内）"
}`;

export interface ComplianceAiReviewPromptParams {
  candidates: AiReviewCandidate[];
  product_category?: string;
}

@Injectable()
export class ComplianceAiReviewPromptBuilder {
  /**
   * 构建 LLM 二审系统提示词
   */
  buildSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  /**
   * 构建单条用户提示词
   */
  buildUserPrompt(params: ComplianceAiReviewPromptParams): string {
    const { candidates, product_category } = params;

    if (candidates.length === 0) {
      return '';
    }

    const categoryInfo = product_category
      ? `\n商品类目：${product_category}（请判断该表述在该类目中是否属于广告法违规）`
      : '';

    const candidatesText = candidates
      .map((c, i) => {
        const parts: string[] = [];
        parts.push(`### 候选 ${i + 1}（分镜${c.shot_index}）`);
        parts.push(`- 规则类别：${c.rule_category}`);
        parts.push(`- 命中词：${c.violated_word}`);
        parts.push(`- 正则原因：${c.rule_reason}`);
        if (c.context) {
          parts.push(`- 上下文：${c.context}`);
        }
        parts.push(`- 完整文本：\`\`\`${c.combined_text}\`\`\``);
        return parts.join('\n');
      })
      .join('\n\n');

    return `请对以下 ${candidates.length} 条疑似违规文本进行二审判定。${categoryInfo}

考虑因素：
1. 该表述是商业广告宣称还是主观感受/客观描述？
2. 受众是否会因此产生误解？
3. 是否存在修饰语缓和了绝对化程度？
4. 该文案的整体语境是什么？

${candidatesText}

请逐条给出JSON格式判定，用数组返回：\n[\n  { "shot_index": 分镜号, "verdict": "BLOCK|WARN|FALSE_POSITIVE", "reason": "...", ... },\n  ...\n]`;
  }

  /**
   * 解析 LLM 返回的 JSON 结果
   */
  parseResult(rawJson: string): AiReviewBatchResult[] {
    try {
      // 尝试提取 JSON 数组
      const trimmed = rawJson.trim();
      const bracketStart = trimmed.indexOf('[');
      const bracketEnd = trimmed.lastIndexOf(']');

      if (bracketStart === -1 || bracketEnd === -1) {
        // 可能返回的是单个对象
        const objStart = trimmed.indexOf('{');
        const objEnd = trimmed.lastIndexOf('}');
        if (objStart === -1) return [];
        const single = JSON.parse(trimmed.slice(objStart, objEnd + 1));
        return [this.normalizeResult(single)];
      }

      const jsonStr = trimmed.slice(bracketStart, bracketEnd + 1);
      const parsed = JSON.parse(jsonStr) as Array<Record<string, unknown>>;
      return parsed.map((item) => this.normalizeResult(item));
    } catch {
      // 解析失败：尝试一行一行解析
      try {
        const lines = rawJson
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('{') && (l.endsWith(',') || l.endsWith('},')));
        const results: AiReviewBatchResult[] = [];
        for (const line of lines) {
          try {
            const obj = JSON.parse(line.replace(/,$/, ''));
            results.push(this.normalizeResult(obj));
          } catch {
            // skip unparseable line
          }
        }
        return results;
      } catch {
        return [];
      }
    }
  }

  private normalizeResult(item: Record<string, unknown>): AiReviewBatchResult {
    const rawVerdict = item.verdict as string | undefined;
    let aiVerdict: 'BLOCK' | 'WARN' | 'FALSE_POSITIVE' | 'INCONCLUSIVE';

    if (rawVerdict === 'BLOCK' || rawVerdict === 'WARN' || rawVerdict === 'FALSE_POSITIVE') {
      aiVerdict = rawVerdict;
    } else if (rawVerdict === 'PASS' || rawVerdict === 'OK') {
      aiVerdict = 'FALSE_POSITIVE';
    } else {
      if (rawVerdict) {
        console.warn(`[compliance-ai-review] Unexpected AI verdict: "${rawVerdict}", marking INCONCLUSIVE`);
      }
      aiVerdict = 'INCONCLUSIVE';
    }

    return {
      shot_index: (item.shot_index ?? item.shotIndex) as number,
      violated_word: (item.violated_word ?? '') as string,
      original_reason: (item.original_reason ?? '') as string,
      ai_verdict: aiVerdict,
      ai_reason: (item.reason ?? '无法判定') as string,
      severity: (item.severity as number) ?? undefined,
      suggestion: (item.suggestion as string) ?? undefined,
    };
  }
}
