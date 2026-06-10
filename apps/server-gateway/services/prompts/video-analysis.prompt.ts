// =============================================================================
// TikStream AI — Viral Video Analysis Prompt Builder
// =============================================================================
// AI 视频拆解：从爆款视频 URL/缩略图 提取 Hook、策略、因子、分镜结构
// =============================================================================

import { Injectable } from '@nestjs/common';

export interface VideoAnalysisPromptResult {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
}

export interface VideoAnalysisPromptParams {
  source_url: string;
  source_platform: string;
  title?: string;
  /** 视觉分析结果（来自 Doubao Vision 分析缩略图） */
  vision_analysis?: string;
  /** 商品上下文（类目/卖点），帮助 AI 理解内容领域 */
  product_context?: {
    category?: string;
    title?: string;
  };
  /** 页面元数据（从 OpenGraph/Twitter Card 抓取的标题/描述，用于文本推断） */
  page_metadata?: {
    title?: string;
    description?: string;
    image_url?: string;
  };
}

const HOOK_TYPES = [
  '问题型', '好奇型', '对比型', '反转型', '情感型', '恐吓型',
  '利益型', '悬念型', '故事型', '身份认同型', '挑战型', '其他',
];

@Injectable()
export class ViralVideoAnalysisPromptBuilder {
  build(params: VideoAnalysisPromptParams): VideoAnalysisPromptResult {
    const { source_url, source_platform, title, vision_analysis, product_context, page_metadata } = params;

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt({
      source_url,
      source_platform,
      title,
      vision_analysis,
      product_context,
      page_metadata,
    });

    return {
      systemPrompt,
      userPrompt,
      fullPrompt: `${systemPrompt}\n\n${userPrompt}`,
    };
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [];

    parts.push('你是一名专业的短视频结构分析师。');
    parts.push('你的任务是对一段带货爆款视频进行深度结构化拆解。');
    parts.push('');
    parts.push('拆解维度包括：');
    parts.push('1. Hook 类型识别 — 视频最开始的吸引力机制');
    parts.push(`   可选类型: ${HOOK_TYPES.join('、')}`);
    parts.push('2. 叙事策略分析 — 视频的故事线、节奏、转化漏斗');
    parts.push('3. 关键成功因子 — 分镜数、时长、运镜、转场、BGM、字幕密度等');
    parts.push('4. 分镜逐镜拆解 — 每个镜头的场景描述、运镜、转场、视觉/音频元素');
    parts.push('5. 综合报告 — 传播力评估、病毒因子、改进建议');
    parts.push('');
    parts.push('═══════════════════════════════════════');
    parts.push('输出格式（严格遵守 JSON Schema）:');
    parts.push('═══════════════════════════════════════');
    parts.push('{');
    parts.push('  "title": "推断的视频标题",');
    parts.push('  "hook_type": "问题型",');
    parts.push('  "strategy_json": {');
    parts.push('    "narrative_structure": "叙事结构描述（开门见山→痛点放大→产品方案→信任背书→CTA",');
    parts.push('    "rhythm_pattern": "节奏模式（快慢快/渐强/三幕式/悬念递进）",');
    parts.push('    "conversion_funnel": "转化漏斗（好奇→共鸣→渴望→行动）",');
    parts.push('    "target_audience_profile": "目标受众画像"');
    parts.push('  },');
    parts.push('  "factor_json": {');
    parts.push('    "optimal_shot_count": 8,');
    parts.push('    "optimal_total_duration": 14.5,');
    parts.push('    "camera_patterns": ["Static", "Dolly_In_Fast"],');
    parts.push('    "transition_preference": "Dissolve",');
    parts.push('    "bgm_style": "轻快电子",');
    parts.push('    "caption_density": "high",');
    parts.push('    "cta_placement": "末尾强引导",');
    parts.push('    "hook_style": "好奇型+对比型混合",');
    parts.push('    "narrative_tone": "轻松活泼+权威背书"');
    parts.push('  },');
    parts.push('  "report_json": {');
    parts.push('    "estimated_engagement": "高",');
    parts.push('    "selling_points": ["核心卖点1", "核心卖点2", "核心卖点3"],');
    parts.push('    "virality_factors": ["强情绪钩子", "快节奏剪辑", "高密度信息"],');
    parts.push('    "improvement_suggestions": ["可增强CTA引导力度", "字幕可更大字号"],');
    parts.push('    "content_maturity": "成熟/中等/初级"');
    parts.push('  },');
    parts.push('  "shots": [');
    parts.push('    {');
    parts.push('      "shot_index": 1,');
    parts.push('      "duration": 2.5,');
    parts.push('      "scene_description": "场景描述（中文）",');
    parts.push('      "camera_movement": "Static/Dolly_In_Fast/Dolly_Out/Pan_Left/Tilt_Up",');
    parts.push('      "transition_type": "None/Fade_In/Dissolve/Wipe",');
    parts.push('      "visual_elements": "画面中的关键视觉元素",');
    parts.push('      "audio_elements": "背景音乐/音效/人声特征"');
    parts.push('    }');
    parts.push('  ]');
    parts.push('}');
    parts.push('');
    parts.push('规则要求:');
    parts.push('1. hook_type 必须从上述 12 种类型中选择最匹配的一个。');
    parts.push('2. camera_movement 只能是: Static, Dolly_In_Fast, Dolly_Out, Pan_Left, Tilt_Up。');
    parts.push('3. transition_type 只能是: None, Fade_In, Dissolve, Wipe。');
    parts.push('4. caption_density 只能是: low, mid, high。');
    parts.push('5. optimal_shot_count 建议 4-15 之间。');
    parts.push('6. optimal_total_duration 建议 8-60 秒之间。');
    parts.push('7. 输出必须是标准 JSON 格式，不要包含任何 markdown 标记或额外说明。');
    parts.push('8. 如果你无法确定某个字段，请给出合理的推断值而不是 null 或空字符串。');

    return parts.join('\n');
  }

  private buildUserPrompt({
    source_url,
    source_platform,
    title,
    vision_analysis,
    product_context,
    page_metadata,
  }: VideoAnalysisPromptParams): string {
    const parts: string[] = [];

    parts.push('请对以下爆款视频进行深度结构化拆解：');
    parts.push('');
    parts.push(`视频来源平台: ${source_platform}`);
    parts.push(`视频链接: ${source_url}`);

    if (title) {
      parts.push(`视频标题: ${title}`);
    }

    // 注入页面元数据，为文本推断提供更真实的上下文
    if (page_metadata?.title || page_metadata?.description) {
      parts.push('');
      parts.push('═══════════════════════════════════════');
      parts.push('以下是从视频页面提取的元数据（OpenGraph/Twitter Card）：');
      parts.push('═══════════════════════════════════════');
      if (page_metadata.title) {
        parts.push(`页面标题: ${page_metadata.title}`);
      }
      if (page_metadata.description) {
        parts.push(`页面描述: ${page_metadata.description}`);
      }
    }

    if (product_context?.title || product_context?.category) {
      parts.push('商品上下文:');
      if (product_context.title) {
        parts.push(`  商品名称: ${product_context.title}`);
      }
      if (product_context.category) {
        parts.push(`  商品类目: ${product_context.category}`);
      }
    }

    if (vision_analysis) {
      parts.push('');
      parts.push('═══════════════════════════════════════');
      parts.push('以下是从视频缩略图中提取的视觉信息（供参考）：');
      parts.push('═══════════════════════════════════════');
      parts.push(vision_analysis);
    }

    parts.push('');
    parts.push('请根据以上信息，推断该视频的结构化拆解数据。');
    parts.push('输出 ONLY valid JSON，不要包含任何 markdown 标记或额外说明。');

    return parts.join('\n');
  }
}
