// =============================================================================
// TikStream AI — Script Template Prompt Builder
// =============================================================================

import { Injectable } from '@nestjs/common';
import { SCRIPT_CONSTANTS } from '../../src/script/script.constants';

export interface TemplatePromptResult {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
}

export interface TemplatePromptParams {
  selling_points: string[];
  style_vibe: string;
  target_audience?: string;
  language: string;
  aspect_ratio: string;
  constraint_list: string[];
  strategy_summary: string;
  factor_json: Record<string, unknown>;
  schema_json?: Record<string, unknown> | null;
  title?: string;
  product_brief?: string;
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
}

@Injectable()
export class ScriptTemplatePromptBuilder {
  build(params: TemplatePromptParams): TemplatePromptResult {
    const {
      selling_points,
      style_vibe,
      target_audience,
      language = SCRIPT_CONSTANTS.DEFAULT_LANGUAGE,
      aspect_ratio = SCRIPT_CONSTANTS.DEFAULT_ASPECT_RATIO,
      constraint_list = [],
      strategy_summary,
      factor_json,
      schema_json,
      title,
      product_brief,
      preferences,
      preference_remark,
      material_contexts,
    } = params;

    const systemPrompt = this.buildSystemPrompt({
      language,
      aspect_ratio,
      strategy_summary,
      factor_json,
      schema_json,
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
    strategy_summary,
    factor_json,
    schema_json,
    preferences,
    product_brief,
  }: {
    language: string;
    aspect_ratio: string;
    strategy_summary: string;
    factor_json: Record<string, unknown>;
    schema_json?: Record<string, unknown> | null;
    preferences?: Array<{ type: 'WINNER' | 'LOSER'; text: string }>;
    product_brief?: string;
  }): string {
    const truncatedFactors = this.truncateFactorKeys(
      factor_json,
      SCRIPT_CONSTANTS.TEMPLATE.MAX_FACTOR_KEYS,
    );

    const parts: string[] = [];

    parts.push('你是一名专业的 TikTok Shop 短视频脚本创作专家。');
    parts.push('你正在执行「模板驱动」脚本生成任务。');
    parts.push(`输出语言: ${language}。`);
    parts.push(`画面比例: ${aspect_ratio}。`);
    parts.push('');

    parts.push('═══════════════════════════════════════');
    parts.push('以下是一个已验证的高转化剧作模板的策略摘要与关键因子配置：');
    parts.push('═══════════════════════════════════════');
    parts.push('');

    parts.push('【模板策略摘要】');
    parts.push(strategy_summary);
    parts.push('');

    parts.push('【模板关键因子配置（前6项）】');
    parts.push(JSON.stringify(truncatedFactors, null, 2));
    parts.push('');

    parts.push('═══════════════════════════════════════');
    parts.push('模板生成要求：');
    parts.push('═══════════════════════════════════════');
    parts.push('');

    parts.push('1. 严格遵循模板的叙事结构、节奏模式和情感曲线。');
    parts.push('2. 使用模板指定的运镜偏好(camera_patterns)、转场偏好(transition_preference)、BGM风格(bgm_style)。');
    parts.push('3. 将新商品的卖点无缝嵌入模板叙事框架中，所有文案必须 100% 原创。');
    parts.push('4. 遵循模板的 CTA 放置策略(cta_placement)和 Hook 风格(hook_style)。');
    parts.push('5. 根据模板 optimal_shot_count 和 optimal_total_duration 调整分镜数量与总时长，限制在 4-6 分镜 / ≤15s 范围内。');
    parts.push('');
    parts.push('═══════════════════════════════════════');
    parts.push('产品-模板适配要求：');
    parts.push('═══════════════════════════════════════');
    parts.push('6. 所有 visual_description 必须体现目标产品的具体特征（颜色、材质、形状、使用方式），避免模糊的通用描述。');
    parts.push('7. voiceover_text 的卖点切入角度必须与【产品信息】中提供的卖点一致，不可虚构产品不具备的功能。');
    parts.push('8. 如提供了产品约束（product_category, usage_scenario 等），分镜场景必须匹配。');
    parts.push('');

    parts.push('═══════════════════════════════════════');
    parts.push('你必须严格按照以下 JSON Schema 格式输出脚本:');
    parts.push('═══════════════════════════════════════');
    parts.push(this.buildOutputSchema(schema_json));
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

    parts.push('');
    parts.push('连贯性要求（CRITICAL — 分镜必须形成统一的叙事整体）:');
    parts.push('- 叙事连贯性：旁白文案必须形成一条完整的叙事弧线，分镜之间逻辑递进（问题→需求→方案→证明→行动），不可各自孤立。');
    parts.push('- 转场连贯性：transition_type 必须匹配叙事节奏——开头 Fade_In 引导、中间 Cut 快节奏推进、情绪高点 Dissolve 过渡、结尾 Cut/Wipe 收束。');
    parts.push('- 视觉连贯性：color_palette 和 lighting_style 全部分镜保持一致，visual_tempo 跟随 tension_curve 变化而不突变。');
    parts.push('- 听觉连贯性：bgm_segment 的 energy_level 和 beat_pattern 必须跟随 tension_curve——渐进式 buildup 匹配"低→中→高"、稳定维持匹配"缓"、渐弱收束匹配"收"。');
    parts.push('- 文案语气连贯：voiceover_text 的语速和情绪强度应跟随 emotional_beat 变化，不可前后割裂。');

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

    parts.push('请基于上述模板的策略摘要与因子配置，为新商品生成一份带货剧本。');

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
    const keys = Object.keys(factors);
    if (keys.length <= maxKeys) {
      return factors;
    }

    const priorityOrder = SCRIPT_CONSTANTS.TEMPLATE.FACTOR_PRIORITY as readonly string[];

    const sortedKeys = keys.sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a);
      const bIdx = priorityOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    const truncated: Record<string, unknown> = {};
    for (let i = 0; i < Math.min(maxKeys, sortedKeys.length); i++) {
      truncated[sortedKeys[i]] = factors[sortedKeys[i]];
    }

    return truncated;
  }

  private buildOutputSchema(schemaJson?: Record<string, unknown> | null): string {
    if (schemaJson && typeof schemaJson === 'object' && Object.keys(schemaJson).length > 0) {
      return this.buildSchemaInstructions(schemaJson);
    }

    return this.defaultOutputSchema();
  }

  /** 将 schema_json 元数据转换为可执行的 Prompt 指令 */
  private buildSchemaInstructions(schemaJson: Record<string, unknown>): string {
    const parts: string[] = [];

    // 如果 schema_json 包含完整的 output_json_schema，直接使用
    if (schemaJson.output_json_schema && typeof schemaJson.output_json_schema === 'object') {
      parts.push('你必须严格按照以下 JSON Schema 输出剧本数据：');
      parts.push(JSON.stringify(schemaJson.output_json_schema, null, 2));
      return parts.join('\n');
    }

    // 必填字段提示
    const required = schemaJson.required_fields;
    if (Array.isArray(required) && required.length > 0) {
      parts.push(`输出 JSON 中每个 shot 必须包含以下字段: ${required.join(', ')}。`);
    }

    // 可选字段提示
    const optional = schemaJson.optional_fields;
    if (Array.isArray(optional) && optional.length > 0) {
      parts.push(`可选字段（根据内容需要可省略）: ${optional.join(', ')}。`);
    }

    // 输出语言
    if (schemaJson.output_language && typeof schemaJson.output_language === 'string') {
      parts.push(`所有文案（旁白、字幕、标题）必须使用 ${schemaJson.output_language} 输出。`);
    }

    // 语调
    if (schemaJson.tone && typeof schemaJson.tone === 'string') {
      parts.push(`文案语调要求: ${schemaJson.tone}。`);
    }

    // 如果有 additional_instructions（具体约束）
    if (schemaJson.additional_instructions && typeof schemaJson.additional_instructions === 'string') {
      parts.push(`额外生成约束: ${schemaJson.additional_instructions}`);
    }

    // 最后挂载默认 Schema 作为兜底格式参考
    parts.push('');
    parts.push('参考输出格式（请严格遵循）：');
    parts.push(this.defaultOutputSchema());

    return parts.join('\n');
  }

  private defaultOutputSchema(): string {
    return [
      '{',
      '  "title": "脚本标题",',
      '  "video_duration": 13.5,',
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
    ].join('\n');
  }
}
