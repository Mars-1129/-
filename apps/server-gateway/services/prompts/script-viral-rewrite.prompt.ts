// =============================================================================
// TikStream AI — Script Viral Rewrite Prompt Builder
// =============================================================================

import { Injectable } from '@nestjs/common';
import { SCRIPT_CONSTANTS } from '../../src/script/script.constants';

export interface ViralRewritePromptResult {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
}

export interface ViralRewritePromptParams {
  selling_points: string[];
  style_vibe: string;
  target_audience?: string;
  language: string;
  aspect_ratio: string;
  constraint_list: string[];
  viral_strategy: Record<string, unknown>;
  viral_factors: Record<string, unknown>;
  viral_hook_type: string;
  viral_report?: Record<string, unknown>;
  title?: string;
  product_brief?: string;
  preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
  preference_remark?: string;
  /** 素材上下文信息 */
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
}

@Injectable()
export class ScriptViralRewritePromptBuilder {
  build(params: ViralRewritePromptParams): ViralRewritePromptResult {
    const {
      selling_points,
      style_vibe,
      target_audience,
      language = SCRIPT_CONSTANTS.DEFAULT_LANGUAGE,
      aspect_ratio = SCRIPT_CONSTANTS.DEFAULT_ASPECT_RATIO,
      constraint_list = [],
      viral_strategy,
      viral_factors,
      viral_hook_type,
      viral_report,
      title,
      product_brief,
      preferences,
      preference_remark,
      material_contexts,
    } = params;

    const systemPrompt = this.buildSystemPrompt({
      language,
      aspect_ratio,
      viral_strategy,
      viral_factors,
      viral_hook_type,
      viral_report,
      preferences,
      product_brief,
    });

    const userPrompt = this.buildUserPrompt({
      selling_points,
      style_vibe,
      target_audience,
      constraint_list,
      title,
      product_brief,
      preferences,
      preference_remark,
      material_contexts,
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
    viral_strategy,
    viral_factors,
    viral_hook_type,
    viral_report,
    preferences,
    product_brief,
  }: {
    language: string;
    aspect_ratio: string;
    viral_strategy: Record<string, unknown>;
    viral_factors: Record<string, unknown>;
    viral_hook_type: string;
    viral_report?: Record<string, unknown>;
    preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
    product_brief?: string;
  }): string {
    const truncatedFactors = this.truncateFactorKeys(
      viral_factors,
      SCRIPT_CONSTANTS.VIRAL_REWRITE.MAX_REFERENCE_FACTOR_COUNT,
    );

    const parts: string[] = [];

    parts.push('你是一名专业的 TikTok Shop 短视频脚本创作专家。');
    parts.push('你正在执行「爆款仿写」任务。');
    parts.push(`输出语言: ${language}。`);
    parts.push(`画面比例: ${aspect_ratio}。`);
    parts.push('');

    parts.push('═══════════════════════════════════════');
    parts.push('以下是一段已被验证为高转化的爆款视频的结构化拆解数据：');
    parts.push('═══════════════════════════════════════');
    parts.push('');

    if (viral_hook_type) {
      parts.push(`【爆款 Hook 类型】${viral_hook_type}`);
      parts.push('');
    }

    parts.push('【爆款叙事策略】');
    parts.push(JSON.stringify(viral_strategy, null, 2));
    parts.push('');

    parts.push('【爆款关键成功因子（前6项）】');
    parts.push(JSON.stringify(truncatedFactors, null, 2));
    parts.push('');

    if (viral_report && Object.keys(viral_report).length > 0) {
      parts.push('【爆款表现数据（参考）】');
      parts.push(JSON.stringify(viral_report, null, 2));
      parts.push('');
    }

    parts.push('═══════════════════════════════════════');
    parts.push('仿写核心要求：');
    parts.push('═══════════════════════════════════════');
    parts.push('');
    parts.push('1. 叙事结构必须仿照上述爆款的 hook 策略、分镜段落节奏、情感曲线。');
    parts.push('2. 所有文案必须 100% 原创，绝对禁止复制原爆款视频的任何旁白、字幕或营销话术。');
    parts.push('3. 将新商品的卖点无缝嵌入爆款的叙事框架中，保持相似的节奏密度。');
    parts.push('4. 根据爆款关键因子的 optimal_shot_count 和 optimal_total_duration 调整分镜数量与总时长。');
    parts.push('5. 如爆款有 camera_patterns / transition_preference / bgm_style，优先参考但不强制一致。');
    parts.push('');
    parts.push('═══════════════════════════════════════');
    parts.push('产品-爆款适配要求：');
    parts.push('═══════════════════════════════════════');
    parts.push('6. 所有 visual_description 必须体现目标产品的实际特征（颜色、材质、形状、使用方式），不可使用模糊的通用描述。');
    parts.push('7. voiceover_text 的卖点切入角度必须与产品信息中提供的卖点一致，不可虚构产品不具备的功能。');
    parts.push('8. 如提供了产品约束（product_category, usage_scenario 等），分镜场景必须匹配。');
    parts.push('');

    parts.push('═══════════════════════════════════════');
    parts.push('你必须严格按照以下 JSON Schema 格式输出脚本:');
    parts.push('═══════════════════════════════════════');
    parts.push('{');
    parts.push('  "title": "脚本标题",');
    parts.push('  "video_duration": 14.5,');
    parts.push('  "style_vibe": "风格描述",');
    parts.push('  "narrative_framework": {');
    parts.push('    "narrative_arc": "问题引入→痛点放大→解决方案→信任背书→行动号召",');
    parts.push('    "tension_curve": "低→中→高→缓→收",');
    parts.push('    "emotional_beat": ["好奇", "焦虑", "期待", "信任", "冲动"]');
    parts.push('  },');
    parts.push('  "visual_style": {');
    parts.push('    "color_palette": "暖色调/冷色调/高对比/柔和",');
    parts.push('    "visual_tempo": "快节奏切换/舒缓流畅/慢推情绪",');
    parts.push('    "lighting_style": "自然光/影棚光/暗调氛围/逆光高亮"');
    parts.push('  },');
    parts.push('  "applied_constraints": ["total_duration<=15s", "avoid_absolute_claims"],');
    parts.push('  "shots": [');
    parts.push('    {');
    parts.push('      "shot_index": 1,');
    parts.push('      "duration": 3.0,');
    parts.push('      "scene_description_query": "英文搜索查询词",');
    parts.push('      "visual_description": "中文视觉描述",');
    parts.push('      "camera_movement": "Static/Dolly_In_Fast/Dolly_Out/Pan_Left/Tilt_Up",');
    parts.push('      "transition_type": "None/Fade_In/Dissolve/Wipe",');
    parts.push('      "voiceover_text": "旁白文字",');
    parts.push('      "subtitle_text": "字幕文字",');
    parts.push('      "safe_zone_bounding_box": [0.1, 0.7, 0.9, 0.9],');
    parts.push('      "bgm_segment": {');
    parts.push('        "style": "轻快电子/舒缓钢琴/激昂鼓点/自然氛围",');
    parts.push('        "energy_level": "low/mid/high",');
    parts.push('        "beat_pattern": "渐进/稳定/渐弱"');
    parts.push('      }');
    parts.push('    }');
    parts.push('  ]');
    parts.push('}');
    parts.push('');

    parts.push('规则要求:');
    parts.push(`1. 视频总时长必须严格控制在 ${SCRIPT_CONSTANTS.MAX_VIDEO_DURATION_SECONDS} 秒以内。`);
    parts.push(`2. 每个分镜时长必须在 ${SCRIPT_CONSTANTS.MIN_SHOT_DURATION_SECONDS} 到 ${SCRIPT_CONSTANTS.MAX_SHOT_DURATION_SECONDS} 秒之间。`);
    parts.push(`3. 分镜数量必须在 ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT} 到 ${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT} 个之间。`);
    parts.push('4. camera_movement 只能是: Static, Dolly_In_Fast, Dolly_Out, Pan_Left, Tilt_Up');
    parts.push('5. transition_type 只能是: None, Fade_In, Dissolve, Wipe');
    parts.push('6. safe_zone_bounding_box 必须是 [x1, y1, x2, y2] 格式（归一化安全区左上角和右下角坐标），值在 0-1 之间，且必须满足 x1 < x2 和 y1 < y2');
    parts.push('7. 旁白和字幕不能包含绝对化用语（最好、第一、全网、唯一、顶级、最高、永久、万能）');
    parts.push('8. 旁白和字幕不能包含禁止性促销表达（免费送、点击领取、限时抢购、马上抢）');
    parts.push('9. 输出必须是标准 JSON 格式，不要包含任何 markdown 标记或额外说明。');

    if (preferences && preferences.length > 0) {
      const winners = preferences.filter(p => p.type === 'WINNER').map(p => p.text);
      const losers = preferences.filter(p => p.type === 'LOSER').map(p => p.text);
      if (winners.length > 0) {
        parts.push(`规则 10：Winner 风格参考 — 请模仿这类表达方式：${winners.join('；')}`);
        parts.push('这些 Winner 文案的特点是：口语化、有节奏感、有行动号召力、制造紧迫感或好奇心');
      }
      if (losers.length > 0) {
        parts.push(`规则 11：Loser 避免模式 — 请避免这类表达方式：${losers.join('；')}`);
        parts.push('这些 Loser 文案的问题是：说明书式平铺、缺乏情感、无节奏变化、生硬的专业术语堆砌');
      }
      parts.push('规则 12：旁白和字幕的文案语调必须对齐 Winner 风格，避免 Loser 模式');
    }

    return parts.join('\n');
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
      parts.push('请确保每个分镜的 scene_description_query 和 visual_description 与上述素材的画面特征匹配。');
    }

    parts.push('');
    parts.push('请基于上述爆款视频的叙事结构，为新商品生成一份全新带货剧本。');
    parts.push(`生成 ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT}-${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT} 个分镜。`);
    parts.push('输出 ONLY valid JSON。');

    if (preferences && preferences.length > 0) {
      const winners = preferences.filter(p => p.type === 'WINNER');
      const losers = preferences.filter(p => p.type === 'LOSER');
      if (winners.length > 0) {
        parts.push(`\n【高转化文案示例 - 请模仿此类风格】\n${winners.map((w, i) => `${i + 1}. ${w.text}`).join('\n')}`);
      }
      if (losers.length > 0) {
        parts.push(`\n【需避免的低转化文案示例】\n${losers.map((l, i) => `${i + 1}. ${l.text}`).join('\n')}`);
      }
    }
    if (preference_remark) {
      parts.push(`\n【文案风格偏好】\n${preference_remark}`);
    }

    return parts.filter(Boolean).join('\n');
  }

  private truncateFactorKeys(
    factors: Record<string, unknown>,
    maxKeys: number,
  ): Record<string, unknown> {
    const entries = Object.entries(factors);
    if (entries.length <= maxKeys) {
      return factors;
    }

    // 优先级列表：排在前的 key 不会被丢弃；后续 key 按自然顺序保留至 maxKeys
    const priorityOrder = [
      'optimal_shot_count',
      'optimal_total_duration',
      'camera_patterns',
      'transition_preference',
      'bgm_style',
      'caption_density',
      'cta_placement',
      'hook_retention_boost',
    ];
    const prioritySet = new Set(priorityOrder);

    const priorityEntries: [string, unknown][] = [];
    const otherEntries: [string, unknown][] = [];

    for (const [k, v] of entries) {
      if (prioritySet.has(k)) {
        priorityEntries.push([k, v]);
      } else {
        otherEntries.push([k, v]);
      }
    }

    // 优先级条目按 priorityOrder 排序
    priorityEntries.sort((a, b) => priorityOrder.indexOf(a[0]) - priorityOrder.indexOf(b[0]));

    const merged = [...priorityEntries, ...otherEntries];
    const result: Record<string, unknown> = {};
    for (let i = 0; i < Math.min(maxKeys, merged.length); i++) {
      result[merged[i][0]] = merged[i][1];
    }
    return result;
  }
}
