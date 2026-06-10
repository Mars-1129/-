// =============================================================================
// TikStream AI — Factor Remix Script Prompt Builder
// =============================================================================
// 用于因子局部替换——根据指定因子覆盖重新生成分镜，支持任意因子的精细替换
// =============================================================================

import { Injectable } from '@nestjs/common';

export interface FactorRemixPromptParams {
  original_script_json: Record<string, unknown>;
  factor_overrides: Record<string, unknown>;
  preserve_voiceover: boolean;
  language: string;
  aspect_ratio: string;
  extra_instruction?: string;
  /** 产品简介文本（由 buildProductContext 构建） */
  product_brief?: string;
  /** 产品卖点列表 */
  selling_points?: string[];
  /** 目标受众 */
  target_audience?: string;
  /** 约束条件列表 */
  constraint_list?: string[];
  /** 产品标题 */
  title?: string;
}

export interface FactorRemixPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

@Injectable()
export class FactorRemixPromptBuilder {
  build(params: FactorRemixPromptParams): FactorRemixPromptResult {
    const systemPrompt = this.buildSystemPrompt(params);
    const userPrompt = this.buildUserPrompt(params);
    return { systemPrompt, userPrompt };
  }

  private buildSystemPrompt(params: FactorRemixPromptParams): string {
    const parts: string[] = [];
    const overrideKeys = Object.keys(params.factor_overrides);

    parts.push('你是一名专业的短视频创作导演，擅长根据精细的创作因子调整视频剧本。');
    parts.push('你的任务是根据指定的因子覆盖，重新生成一个带货视频剧本的分镜内容。');
    if (params.preserve_voiceover) {
      parts.push('**严格保留所有配音文字(voiceover_text)和字幕文字(subtitle_text)不变**。');
    }
    parts.push('');

    // 产品信息注入
    if (params.product_brief) {
      parts.push('【产品信息 — 必须基于此产品特征生成视觉描述】');
      parts.push(params.product_brief);
      parts.push('');
    }
    if (params.selling_points && params.selling_points.length > 0) {
      parts.push(`商品核心卖点: ${params.selling_points.join('；')}`);
    }
    if (params.target_audience) {
      parts.push(`目标受众: ${params.target_audience}`);
    }
    if (params.constraint_list && params.constraint_list.length > 0) {
      parts.push('【必须遵守的约束条件】');
      params.constraint_list.forEach((c) => parts.push(`  - ${c}`));
    }
    parts.push('');

    parts.push('以下因子被覆盖，需要根据新值调整对应的分镜属性：');
    parts.push('');
    parts.push(this.buildFactorOverrideInstructions(params.factor_overrides));
    parts.push('');
    parts.push(`语言: ${params.language}`);
    parts.push(`画面比例: ${params.aspect_ratio}`);
    if (params.extra_instruction) {
      parts.push(`特殊要求: ${params.extra_instruction}`);
    }
    parts.push('');
    parts.push('你需要根据上述因子覆盖调整对应分镜的：');
    parts.push('1. scene_description_query（英文素材搜索词，需匹配调整后的风格）');
    parts.push('2. visual_description（中文视觉描述，需匹配调整后的视觉风格）');
    parts.push('3. camera_movement（运镜方式，需匹配调整后的运镜模式）');
    parts.push('4. transition_type（转场类型，需匹配调整后的转场偏好）');
    parts.push('5. bgm_segment（BGM 信息，需匹配调整后的 BGM 风格）');
    if (!params.preserve_voiceover) {
      parts.push('6. voiceover_text（旁白文案，需匹配调整后的叙事语调）');
      parts.push('7. subtitle_text（字幕文案，需匹配调整后的字幕风格）');
    }
    parts.push('');
    parts.push('对于每个被覆盖的因子，应用以下规则：');
    parts.push('- bgm_style 被覆盖 → 调整每个分镜的 bgm_segment');
    parts.push('- camera_patterns 被覆盖 → 调整每个分镜的 camera_movement');
    parts.push('- transition_preference 被覆盖 → 调整每个分镜的 transition_type');
    parts.push('- narrative_tone 被覆盖 → 调整 visual_description 和 voiceover_text 的语调');
    parts.push('- hook_style 被覆盖 → 调整开场分镜的视觉和文案');
    parts.push('- visual_style 被覆盖 → 调整 scene_description_query 和 visual_description');
    parts.push('- 阶段级因子被覆盖 → 仅调整对应阶段的分镜');
    parts.push('');
    parts.push('保留不变的字段：shot_index、duration、safe_zone_bounding_box。');
    if (params.preserve_voiceover) {
      parts.push('保留不变的字段：voiceover_text、subtitle_text。');
    }
    parts.push('');
    parts.push('═══════════════════════════════════════');
    parts.push('产品-因子适配要求（CRITICAL）：');
    parts.push('═══════════════════════════════════════');
    parts.push('1. 所有 visual_description 必须体现产品的实际特征（颜色、材质、形状、使用方式），不可使用模糊的通用描述。');
    parts.push('2. scene_description_query 必须匹配产品的实际展示角度和使用场景。');
    parts.push('3. 如有产品约束（product_category, usage_scenario 等），分镜场景必须与约束匹配。');
    parts.push('4. 如 voiceover_text 需要调整（preserve_voiceover=false），卖点切入角度必须与产品信息一致，不可虚构产品不具备的功能。');
    parts.push('');
    parts.push('输出 ONLY valid JSON，不含 markdown 标记。');
    parts.push(this.buildOutputSchema(overrideKeys));

    return parts.join('\n');
  }

  private buildFactorOverrideInstructions(factorOverrides: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(factorOverrides)) {
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      parts.push(`- ${key}: ${valueStr}`);
    }
    return parts.join('\n');
  }

  private buildUserPrompt(params: FactorRemixPromptParams): string {
    const parts: string[] = [];

    // 产品信息区
    if (params.product_brief) {
      parts.push(`【产品信息】${params.product_brief}`);
    }
    if (params.title && !params.product_brief) {
      parts.push(`商品: ${params.title}`);
    }
    if (params.selling_points && params.selling_points.length > 0) {
      parts.push(`卖点: ${params.selling_points.join('；')}`);
    }
    if (params.target_audience) {
      parts.push(`受众: ${params.target_audience}`);
    }
    if (params.constraint_list && params.constraint_list.length > 0) {
      parts.push('');
      parts.push('【必须遵守的约束条件】');
      params.constraint_list.forEach((c) => parts.push(`  - ${c}`));
    }
    parts.push('');

    parts.push('以下是需要局部替换的原始剧本：');
    parts.push('```json');
    parts.push(JSON.stringify(params.original_script_json, null, 2));
    parts.push('```');
    parts.push('');
    parts.push('因子覆盖内容：');
    for (const [key, value] of Object.entries(params.factor_overrides)) {
      parts.push(`- ${key}: ${JSON.stringify(value)}`);
    }
    parts.push('');
    parts.push('请根据上述因子覆盖调整剧本的分镜内容，并输出完整的剧本 JSON。');
    if (params.preserve_voiceover) {
      parts.push('保留所有分镜的 voiceover_text 和 subtitle_text 完全不变。');
    }

    return parts.join('\n');
  }

  private buildOutputSchema(overrideKeys: string[]): string {
    return [
      '{',
      '  "title": "脚本标题",',
      '  "video_duration": 13.5,',
      '  "style_vibe": "风格描述",',
      '  "narrative_framework": { ... },',
      '  "visual_style": { "color_palette": "...", "visual_tempo": "...", "lighting_style": "..." },',
      '  "applied_constraints": [...],',
      `  "_factor_remix": { "overridden_keys": ${JSON.stringify(overrideKeys)} },`,
      '  "shots": [',
      '    {',
      '      "shot_index": 1,',
      '      "duration": 3.0,',
      '      "scene_description_query": "调整后的英文搜索词",',
      '      "visual_description": "调整后的中文描述",',
      '      "camera_movement": "调整后的运镜方式",',
      '      "transition_type": "调整后的转场方式",',
      '      "voiceover_text": "旁白文案",',
      '      "subtitle_text": "字幕文案",',
      '      "safe_zone_bounding_box": [0.1, 0.7, 0.9, 0.9],',
      '      "bgm_segment": { "style": "BGM风格", "energy_level": "mid", "beat_pattern": "渐进" }',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }
}
