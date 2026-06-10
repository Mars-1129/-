// =============================================================================
// TikStream AI — Script Quick Prompt Builder
// =============================================================================

import { Injectable } from '@nestjs/common';
import { SCRIPT_CONSTANTS } from '../../src/script/script.constants';

export interface PromptResult {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
}

export interface PromptParams {
  selling_points: string[];
  style_vibe: string;
  target_audience?: string;
  language?: string;
  aspect_ratio?: string;
  constraint_list?: string[];
  title?: string;
  /** FR-9: Winner/Loser 偏好示例对，用于文案风格对齐 */
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
  preference_remark?: string;
  /** 素材上下文信息，用于 LLM 基于真实素材生成更精准的剧本 */
  material_contexts?: Array<{
    material_id: string;
    filename: string;
    type: string;
    captions: string[];
    scene_descriptions: string[];
    dominant_colors: string[];
    objects: string[];
    product_angles: string[];
  }>;
  /** 图片视觉分析文本（由视觉模型生成），用于增强 IMAGE_DRIVEN 剧本准确性 */
  image_analysis?: string;
  /** 产品简介文本（由 buildProductContext 构建） */
  product_brief?: string;
}

@Injectable()
export class ScriptQuickPromptBuilder {
  build(params: PromptParams): PromptResult {
    const {
      selling_points,
      style_vibe,
      target_audience,
      language = SCRIPT_CONSTANTS.DEFAULT_LANGUAGE,
      aspect_ratio = SCRIPT_CONSTANTS.DEFAULT_ASPECT_RATIO,
      constraint_list = [],
      title,
      preferences,
      preference_remark,
      material_contexts,
      image_analysis,
    } = params;

    const systemPrompt = this.buildSystemPrompt({ language, aspect_ratio, preferences });
    const userPrompt = this.buildUserPrompt({
      selling_points,
      style_vibe,
      target_audience,
      constraint_list,
      title,
      preferences,
      preference_remark,
      material_contexts,
      image_analysis,
    });

    return {
      systemPrompt,
      userPrompt,
      fullPrompt: `${systemPrompt}\n\n${userPrompt}`,
    };
  }

  private buildSystemPrompt({
    language,
    aspect_ratio,
    preferences,
  }: {
    language: string;
    aspect_ratio: string;
    preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
  }): string {
    const baseRules = [
      '你是一名专业的 TikTok Shop 短视频脚本创作专家，擅长将产品卖点转化为高转化率的短视频脚本。',
      `输出语言: ${language}。`,
      `画面比例: ${aspect_ratio}。`,
      '你的核心任务是将产品的核心卖点与目标受众的需求精准匹配，通过短视频的节奏、视觉和文案驱动购买转化。',
      '',
      '你必须严格按照以下 JSON Schema 格式输出脚本:',
      '{',
      '  "title": "脚本标题",',
      '  "video_duration": 14.5,',
      '  "style_vibe": "风格描述",',
      '  "narrative_framework": {',
      '    "narrative_arc": "问题引入→痛点放大→解决方案→信任背书→行动号召",',
      '    "tension_curve": "低→中→高→缓→收",',
      '    "emotional_beat": ["好奇", "焦虑", "期待", "信任", "冲动"]',
      '  },',
      '  "visual_style": {',
      '    "color_palette": "暖色调/冷色调/高对比/柔和",',
      '    "visual_tempo": "快节奏切换/舒缓流畅/慢推情绪",',
      '    "lighting_style": "自然光/影棚光/暗调氛围/逆光高亮"',
      '  },',
      '  "applied_constraints": ["total_duration<=15s", "avoid_absolute_claims"],',
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
      '        "style": "轻快电子/舒缓钢琴/激昂鼓点/自然氛围",',
      '        "energy_level": "low/mid/high",',
      '        "beat_pattern": "渐进/稳定/渐弱"',
      '      }',
      '    }',
      '  ]',
      '}',
      '',
      '规则要求:',
      `1. 视频总时长必须严格控制在 ${SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS} 秒以内。`,
      `2. 每个分镜时长必须在 ${SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS} 到 ${SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS} 秒之间。`,
      `3. 分镜数量必须在 ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT} 到 ${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT} 个之间。`,
      `4. camera_movement 只能是: ${SCRIPT_CONSTANTS.CAMERA_MOVEMENTS.join(', ')}`,
      `5. transition_type 只能是: ${SCRIPT_CONSTANTS.TRANSITION_TYPES.join(', ')}`,
      '6. safe_zone_bounding_box 必须是 [x1, y1, x2, y2] 格式（归一化安全区左上角和右下角坐标），值在 0-1 之间，且必须满足 x1 < x2 和 y1 < y2',
      '7. 旁白和字幕不能包含绝对化用语（最好、第一、全网、唯一、顶级、最高、永久、万能）',
      '8. 旁白和字幕不能包含禁止性促销表达（免费送、点击领取、限时抢购、马上抢）',
      '9. 输出必须是标准 JSON 格式，不要包含任何 markdown 标记或额外说明。',
      '',
      '产品关联要求:',
      '10. 如果用户提供了产品信息（名称、卖点、使用场景、颜色、材质等），必须在 visual_description 和 voiceover_text 中体现产品特征。',
      '11. 每个分镜的 visual_description 应描述具体的产品展示角度、使用场景、以及产品与用户互动的画面。',
      '12. 旁白文案必须围绕产品卖点展开，不能脱离产品空谈概念。',
      '',
      '约束遵守要求:',
      '13. 如果用户提供了约束条件（constraint_list 或 创作约束），必须严格遵守，并在 applied_constraints 字段中列出所有已应用的约束。',
      '14. 如果有 product_category 约束，确保视觉风格和目标受众匹配该类目典型消费者。',
      '15. 如果有 usage_scenario 约束，分镜中必须出现对应的使用场景。',
      '',
      '连贯性要求（CRITICAL — 分镜必须形成统一的叙事整体）:',
      '16. 叙事连贯性：旁白文案必须形成一条完整的叙事弧线，分镜之间逻辑递进（问题→需求→方案→证明→行动），不可各自孤立。',
      '17. 转场连贯性：transition_type 必须匹配叙事节奏——开头 Fade_In 引导、中间 Cut 快节奏推进、情绪高点 Dissolve 过渡、结尾 Cut/Wipe 收束。',
      '18. 视觉连贯性：color_palette 和 lighting_style 全部分镜保持一致，visual_tempo 跟随 tension_curve 变化而不突变。',
      '19. 听觉连贯性：bgm_segment 的 energy_level 和 beat_pattern 必须跟随 tension_curve——渐进式 buildup 匹配"低→中→高"、稳定维持匹配"缓"、渐弱收束匹配"收"。',
      '20. 文案语气连贯：voiceover_text 的语速和情绪强度应跟随 emotional_beat 变化，不可前后割裂。',
    ];

    // FR-9: 文案偏好对齐 - 注入 Winner/Loser 风格指引
    if (preferences && preferences.length > 0) {
      const winners = preferences.filter((p) => p.type === 'WINNER').map((p) => p.text);
      const losers = preferences.filter((p) => p.type === 'LOSER').map((p) => p.text);

      baseRules.push('');
      baseRules.push('--- 文案风格偏好对齐规则 ---');
      baseRules.push('10. 请严格对齐用户提供的文案风格偏好：');

      if (winners.length > 0) {
        baseRules.push(`   - **Winner 风格参考**（请模仿这类表达方式）：${winners.join(' | ')}`);
        baseRules.push('     → 风格特征：口语化、有节奏感、有行动号召力、制造紧迫感或好奇心');
      }

      if (losers.length > 0) {
        baseRules.push(`   - **Loser 避免模式**（请避免这类表达方式）：${losers.join(' | ')}`);
        baseRules.push('     → 避免特征：说明书式平铺、缺乏情感、无节奏变化、生硬的专业术语堆砌');
      }

      baseRules.push('11. 旁白和字幕的文案语调必须对齐 Winner 风格，避免 Loser 模式中的表达习惯。');
    }

    return baseRules.join('\n');
  }

  private buildUserPrompt({
    selling_points,
    style_vibe,
    target_audience,
    constraint_list,
    title,
    product_brief,
    preferences,
    preference_remark,
    material_contexts,
    image_analysis,
  }: {
    selling_points: string[];
    style_vibe: string;
    target_audience?: string;
    constraint_list?: string[];
    title?: string;
    product_brief?: string;
    preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
    preference_remark?: string;
    material_contexts?: Array<{
      material_id: string;
      filename: string;
      type: string;
      captions: string[];
      scene_descriptions: string[];
      dominant_colors: string[];
      objects: string[];
      product_angles: string[];
    }>;
    image_analysis?: string;
  }): string {
    const parts: string[] = [];

    // 产品信息区
    if (product_brief) {
      parts.push(`【产品信息】${product_brief}`);
    }
    if (title && !product_brief) {
      parts.push(`商品名称: ${title}`);
    }
    if (selling_points.length > 0) {
      parts.push(`商品卖点: ${selling_points.join('; ')}`);
    }
    parts.push(`风格氛围: ${style_vibe}`);

    if (target_audience) {
      parts.push(`目标受众: ${target_audience}`);
    }

    if (constraint_list && constraint_list.length > 0) {
      parts.push('');
      parts.push('【必须遵守的约束条件】');
      constraint_list.forEach((c) => parts.push(`  - ${c}`));
    }

    // FR-9: 文案偏好对齐 - 注入具体 Winner/Loser 示例
    if (preferences && preferences.length > 0) {
      parts.push('');
      const winners = preferences.filter((p) => p.type === 'WINNER');
      const losers = preferences.filter((p) => p.type === 'LOSER');

      if (winners.length > 0) {
        parts.push(`【高转化文案示例 - 请模仿此类风格】`);
        winners.forEach((w, i) => { parts.push(`  Winner${i + 1}: ${w.text}`); });
      }
      if (losers.length > 0) {
        parts.push(`【需避免的低转化文案示例】`);
        losers.forEach((l, i) => { parts.push(`  Loser${i + 1}: ${l.text}`); });
      }
      if (preference_remark) {
        parts.push(`文案风格说明: ${preference_remark}`);
      }
    }

    // 素材视觉参考注入
    if (material_contexts && material_contexts.length > 0) {
      parts.push('');
      parts.push('【可用素材视觉参考 - 请基于以下真实素材生成分镜】');
      material_contexts.forEach((ctx, idx) => {
        parts.push(`素材${idx + 1} "${ctx.filename}":`);
        if (ctx.captions.length > 0) {
          parts.push(`  - 画面内容：${ctx.captions.slice(0, 2).join('；')}`);
        }
        if (ctx.scene_descriptions.length > 0) {
          parts.push(`  - 场景特征：${ctx.scene_descriptions.slice(0, 2).join('；')}`);
        }
        if (ctx.objects.length > 0) {
          parts.push(`  - 可识别物体：${ctx.objects.slice(0, 5).join(', ')}`);
        }
        if (ctx.product_angles.length > 0) {
          parts.push(`  - 商品角度：${ctx.product_angles.join(', ')}`);
        }
        parts.push(`  - 类型：${ctx.type === 'VIDEO' ? '视频素材(可切片)' : '静态图片'}`);
      });
      parts.push('请确保每个分镜的 scene_description_query 和 visual_description 与上述素材的画面特征匹配，避免生成素材无法覆盖的场景描述。');
    }

    // 图片视觉分析注入（IMAGE_DRIVEN 模式）
    if (image_analysis) {
      parts.push('');
      parts.push('【商品图片视觉分析 - 请基于此分析生成匹配的分镜】');
      parts.push(image_analysis);
      parts.push('请确保每个分镜的 visual_description 与上述图片分析中的视觉特征、风格和构图严格匹配，避免生成与商品图片不符的视觉描述。');
    }

    parts.push(`生成 ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT}-${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT} 个分镜。`);
    parts.push('输出 ONLY valid JSON。');

    return parts.filter(Boolean).join('\n');
  }
}