// =============================================================================
// TikStream AI — Restyle Script Prompt Builder
// =============================================================================
// 用于视觉风格替换——保留配音/字幕不变，仅替换视觉维度
// =============================================================================

import { Injectable } from '@nestjs/common';

export interface RestylePromptParams {
  original_script_json: Record<string, unknown>;
  color_palette: string;
  visual_tempo: string;
  lighting_style: string;
  preserve_audio: boolean;
  language: string;
  aspect_ratio: string;
  extra_instruction?: string;
  /** 产品简介文本（由 buildProductContext 构建） */
  product_brief?: string;
  /** 约束条件列表 */
  constraint_list?: string[];
}

export interface RestylePromptResult {
  systemPrompt: string;
  userPrompt: string;
}

@Injectable()
export class RestyleScriptPromptBuilder {
  build(params: RestylePromptParams): RestylePromptResult {
    const systemPrompt = this.buildSystemPrompt(params);
    const userPrompt = this.buildUserPrompt(params);
    return { systemPrompt, userPrompt };
  }

  private buildSystemPrompt(params: RestylePromptParams): string {
    const parts: string[] = [];

    parts.push('你是一名专业的短视频视觉导演。');
    parts.push('你的任务是将一个已有的带货视频剧本替换为新的视觉风格，');
    if (params.preserve_audio) {
      parts.push('**严格保留所有配音文字(voiceover_text)和字幕文字(subtitle_text)不变**。');
    }
    parts.push('');

    // 产品信息注入
    if (params.product_brief) {
      parts.push('【产品信息 — 视觉描述必须基于此产品特征】');
      parts.push(params.product_brief);
      parts.push('');
    }

    parts.push(`新视觉风格定义：`);
    parts.push(`- 色调: ${params.color_palette}`);
    parts.push(`- 视觉节奏: ${params.visual_tempo}`);
    parts.push(`- 光影风格: ${params.lighting_style}`);
    parts.push('');

    if (params.constraint_list && params.constraint_list.length > 0) {
      parts.push('【必须遵守的约束条件】');
      params.constraint_list.forEach((c) => parts.push(`  - ${c}`));
      parts.push('');
    }

    parts.push(`语言: ${params.language}`);
    parts.push(`画面比例: ${params.aspect_ratio}`);
    if (params.extra_instruction) {
      parts.push(`特殊要求: ${params.extra_instruction}`);
    }
    parts.push('');
    parts.push('你需要根据新视觉风格调整每个分镜的：');
    parts.push('1. scene_description_query（英文素材搜索词，需匹配新视觉风格）');
    parts.push('2. visual_description（中文视觉描述，需匹配新视觉风格，且必须体现产品的实际特征）');
    parts.push('3. camera_movement（运镜方式，需匹配新视觉节奏）');
    parts.push('4. transition_type（转场类型，需匹配新视觉节奏）');
    parts.push('5. bgm_segment（BGM 信息，需匹配新氛围）');
    parts.push('');
    parts.push('产品-视觉适配要求（CRITICAL）：');
    parts.push('1. visual_description 必须体现产品的颜色、材质、形状和使用方式，不可用模糊通用描述。');
    parts.push('2. scene_description_query 应基于产品实际特征生成，确保素材搜索精准匹配。');
    parts.push('3. 如提供了产品约束（product_category, usage_scenario 等），视觉场景必须符合约束。');
    parts.push('');
    parts.push('保留不变的字段：shot_index、duration、voiceover_text、subtitle_text、safe_zone_bounding_box。');
    parts.push('');
    parts.push('输出 ONLY valid JSON，不含 markdown 标记。');
    parts.push(this.buildOutputSchema());

    return parts.join('\n');
  }

  private buildUserPrompt(params: RestylePromptParams): string {
    const parts: string[] = [];

    // 产品信息区
    if (params.product_brief) {
      parts.push(`【产品信息】${params.product_brief}`);
      parts.push('');
    }

    parts.push('以下是需要替换视觉风格的原始剧本：');
    parts.push('```json');
    parts.push(JSON.stringify(params.original_script_json, null, 2));
    parts.push('```');
    parts.push('');
    parts.push(`请将上述剧本的视觉风格替换为：色调=${params.color_palette}，视觉节奏=${params.visual_tempo}，光影=${params.lighting_style}`);
    parts.push('保留所有分镜的 shot_index、duration、voiceover_text 和 subtitle_text 完全不变。');

    return parts.join('\n');
  }

  private buildOutputSchema(): string {
    return [
      '{',
      '  "title": "脚本标题",',
      '  "video_duration": 13.5,',
      '  "style_vibe": "风格描述",',
      '  "narrative_framework": { ... },',
      '  "visual_style": { "color_palette": "...", "visual_tempo": "...", "lighting_style": "..." },',
      '  "applied_constraints": [...],',
      '  "shots": [',
      '    {',
      '      "shot_index": 1,        // 保留不变',
      '      "duration": 3.0,       // 保留不变',
      '      "scene_description_query": "新视觉风格的英文搜索词",',
      '      "visual_description": "新视觉风格的中文描述",',
      '      "camera_movement": "新运镜方式",',
      '      "transition_type": "新转场方式",',
      '      "voiceover_text": "保留不变的旁白",',
      '      "subtitle_text": "保留不变的字幕",',
      '      "safe_zone_bounding_box": [0.1, 0.7, 0.9, 0.9],',
      '      "bgm_segment": { "style": "新BGM", "energy_level": "mid", "beat_pattern": "渐进" }',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }
}
