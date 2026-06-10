// =============================================================================
// TikStream AI — Regenerate Script Prompt Builder
// =============================================================================
// 用于 Prompt 微调重生成——接收原始脚本 + 覆盖参数，重新生成优化版剧本
// =============================================================================

import { Injectable } from '@nestjs/common';
import { SCRIPT_CONSTANTS } from '../../src/script/script.constants';

export interface RegeneratePromptParams {
  original_script_json: Record<string, unknown>;
  style_vibe: string;
  selling_points: string[];
  target_audience?: string;
  language: string;
  aspect_ratio: string;
  constraint_list: string[];
  title?: string;
  /** 产品简介文本（由 buildProductContext 构建） */
  product_brief?: string;
  extra_instruction?: string;
}

export interface RegeneratePromptResult {
  systemPrompt: string;
  userPrompt: string;
}

@Injectable()
export class RegenerateScriptPromptBuilder {
  build(params: RegeneratePromptParams): RegeneratePromptResult {
    const {
      original_script_json,
      selling_points,
      style_vibe,
      target_audience,
      language = 'zh-CN',
      aspect_ratio = '9:16',
      constraint_list = [],
      title,
      product_brief,
      extra_instruction,
    } = params;

    const systemPrompt = this.buildSystemPrompt({
      language,
      aspect_ratio,
      selling_points,
      style_vibe,
      target_audience,
      constraint_list,
      extra_instruction,
      product_brief,
    });

    const userPrompt = this.buildUserPrompt({
      original_script_json,
      selling_points,
      style_vibe,
      target_audience,
      constraint_list,
      title,
      product_brief,
    });

    return { systemPrompt, userPrompt };
  }

  private buildSystemPrompt(opts: {
    language: string;
    aspect_ratio: string;
    selling_points: string[];
    style_vibe: string;
    target_audience?: string;
    constraint_list: string[];
    extra_instruction?: string;
    product_brief?: string;
  }): string {
    const parts: string[] = [];

    parts.push('你是一名专业的短视频剧本优化师。');
    parts.push('你的任务是基于一个已有剧本，根据优化参数重新生成一版更优的剧本。');
    parts.push('');
    parts.push(`语言: ${opts.language}`);
    parts.push(`画面比例: ${opts.aspect_ratio}`);
    parts.push(`风格: ${opts.style_vibe}`);
    parts.push(`卖点: ${opts.selling_points.join('、')}`);
    if (opts.target_audience) {
      parts.push(`目标受众: ${opts.target_audience}`);
    }

    // 产品信息注入
    if (opts.product_brief) {
      parts.push('');
      parts.push('【产品信息 — 必须基于此产品特征优化剧本】');
      parts.push(opts.product_brief);
    }

    if (opts.constraint_list.length > 0) {
      parts.push('');
      parts.push('【必须遵守的约束条件】');
      opts.constraint_list.forEach((c) => parts.push(`  - ${c}`));
    }
    if (opts.extra_instruction) {
      parts.push(`特殊要求: ${opts.extra_instruction}`);
    }
    parts.push('');
    parts.push('保留原剧本的叙事框架和情感节拍，但根据新参数调整风格和细节。');
    parts.push('');
    parts.push('产品关联要求:');
    parts.push('- 所有 visual_description 必须体现产品的实际特征（颜色、材质、形状、使用方式），不可使用模糊的通用描述。');
    parts.push('- voiceover_text 的卖点切入角度必须与产品信息中提供的卖点一致，不可虚构产品不具备的功能。');
    parts.push('- 如有产品约束（product_category, usage_scenario 等），分镜场景必须与约束匹配。');
    parts.push('');
    parts.push('连贯性要求（CRITICAL — 分镜必须形成统一的叙事整体）:');
    parts.push('- 叙事连贯性：旁白文案必须形成一条完整的叙事弧线，分镜之间逻辑递进，不可各自孤立。');
    parts.push('- 转场连贯性：transition_type 必须匹配叙事节奏——开头 Fade_In 引导、中间 Cut 快节奏推进、情绪高点 Dissolve 过渡、结尾 Cut/Wipe 收束。');
    parts.push('- 视觉连贯性：color_palette 和 lighting_style 全部分镜保持一致，visual_tempo 跟随 tension_curve 变化而不突变。');
    parts.push('- 听觉连贯性：bgm_segment 的 energy_level 和 beat_pattern 必须跟随 tension_curve——渐进式 buildup 匹配"低→中→高"、稳定维持匹配"缓"、渐弱收束匹配"收"。');
    parts.push('- 文案语气连贯：voiceover_text 的语速和情绪强度应跟随 emotional_beat 变化，不可前后割裂。');
    parts.push('');
    parts.push('输出 ONLY valid JSON，不含 markdown 标记。');
    parts.push(this.buildOutputSchema());

    return parts.join('\n');
  }

  private buildUserPrompt(opts: {
    original_script_json: Record<string, unknown>;
    selling_points: string[];
    style_vibe: string;
    target_audience?: string;
    constraint_list: string[];
    title?: string;
    product_brief?: string;
  }): string {
    const parts: string[] = [];

    // 产品信息区
    if (opts.product_brief) {
      parts.push(`【产品信息】${opts.product_brief}`);
    }
    if (opts.title && !opts.product_brief) {
      parts.push(`商品: ${opts.title}`);
    }

    parts.push('以下是需要优化的原始剧本：');
    parts.push('```json');
    parts.push(JSON.stringify(opts.original_script_json, null, 2));
    parts.push('```');
    parts.push('');
    parts.push('请根据以下新的参数重新生成：');
    parts.push(`- 新风格: ${opts.style_vibe}`);
    parts.push(`- 卖点: ${opts.selling_points.join('、')}`);
    if (opts.target_audience) {
      parts.push(`- 目标受众: ${opts.target_audience}`);
    }
    if (opts.constraint_list.length > 0) {
      parts.push('');
      parts.push('【必须遵守的约束条件】');
      opts.constraint_list.forEach((c) => parts.push(`  - ${c}`));
    }
    if (opts.title) {
      parts.push(`- 标题: ${opts.title}`);
    }

    return parts.join('\n');
  }

  private buildOutputSchema(): string {
    return [
      '{',
      '  "title": "脚本标题",',
      '  "video_duration": 13.5,',
      '  "style_vibe": "风格描述",',
      '  "narrative_framework": {',
      '    "narrative_arc": "叙事弧线",',
      '    "tension_curve": "张力曲线",',
      '    "emotional_beat": ["情感节拍"]',
      '  },',
      '  "visual_style": {',
      '    "color_palette": "色调",',
      '    "visual_tempo": "视觉节奏",',
      '    "lighting_style": "光影风格"',
      '  },',
      '  "applied_constraints": ["约束"],',
      '  "shots": [',
      '    {',
      '      "shot_index": 1,',
      '      "duration": 3.0,',
      '      "scene_description_query": "英文搜索查询词",',
      '      "visual_description": "中文视觉描述",',
      '      "camera_movement": "Static/Dolly_In_Fast/Dolly_Out/Pan_Left/Tilt_Up",',
      '      "transition_type": "None/Fade_In/Dissolve/Wipe",',
      '      "voiceover_text": "旁白文字",',
      '      "subtitle_text": "字幕文字",',
      '      "safe_zone_bounding_box": [0.1, 0.7, 0.9, 0.9],',
      '      "bgm_segment": {',
      '        "style": "BGM风格",',
      '        "energy_level": "low/mid/high",',
      '        "beat_pattern": "节拍模式"',
      '      }',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }
}
