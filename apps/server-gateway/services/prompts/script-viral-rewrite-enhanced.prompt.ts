// =============================================================================
// TikStream AI — Script Viral Rewrite Prompt Builder (Enhanced)
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
  /** 产品简介文本（由 buildProductContext 构建） */
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

// Hook 类型定义
const HOOK_TYPES = {
  PAIN_POINT: '痛点前置型 - 开门见山指出用户痛点，引发共鸣',
  BENEFIT_FIRST: '利益前置型 - 先展示产品能带来的好处，吸引注意',
  SUSPENSE: '悬念型 - 设置悬念或问题，引导用户看完寻找答案',
  CONTRAST: '对比型 - 展示使用前后对比，视觉冲击强烈',
  EMOTIONAL: '情绪型 - 触动情感，引发情感共鸣',
  VISUAL_CONTRAST: '视觉对比型 - 通过画面变化展示效果',
  CURIOSITY_QUESTION: '好奇问题型 - 以问题开场引发思考',
  PRICE_URGENCY: '价格紧迫型 - 以优惠价格吸引注意',
  SOCIAL_PROOF: '社会证明型 - "闺蜜推荐"、"亲测有效"',
  PRODUCT_REVEAL: '产品亮相型 - 高质感产品展示吸引目光',
  LIFESTYLE_ASPIRATION: '生活方式向往型 - 展示令人向往的场景',
  TRANSFORMATION_BUILDUP: '转变累积型 - 逐步建立期待最后揭示',
} as const;

type HookType = keyof typeof HOOK_TYPES;

// 叙事弧线类型
const NARRATIVE_ARCS = {
  HOOK_PAIN: '痛点Hook - 开场指出痛点',
  HOOK_BEFORE: '之前状态 - 展示"之前"的困境',
  HOOK_RECOMMEND: '推荐开场 - "朋友推荐"或"自己发现"',
  HOOK_QUESTION: '问题开场 - 以问题引发好奇',
  HOOK_PRICE: '价格钩子 - 优惠信息吸引注意',
  HOOK_PACKAGE: '包裹开场 - 展示快递/包装',
  HOOK_REVEAL: '产品亮相 - 高质感展示产品',
  HOOK_TRANSFORMATION: '转变开场 - 快速展示转变',
  EMOTIONAL_RESONANCE: '情感共鸣 - 讲述故事引发共鸣',
  PAIN_POINT: '痛点呈现 - 放大用户面临的问题',
  PROBLEM_STATEMENT: '问题说明 - 清晰解释问题',
  PROBLEM_EXPLAIN: '问题解释 - 深入说明痛点',
  PRODUCT_DEMO: '产品展示 - 演示产品如何解决问题',
  SOLUTION_DEMO: '方案演示 - 展示解决方案',
  SOLUTION_REVEAL: '方案揭示 - 揭示解决方案',
  TRANSITION: '转变过程 - 展示变化过程',
  FEATURE_HIGHLIGHT: '功能强调 - 突出产品特性',
  FEATURE_DEMO: '功能演示 - 演示产品功能',
  BENEFIT_HIGHLIGHT: '利益强调 - 强调购买好处',
  USAGE_DEMO: '使用演示 - 展示产品使用方法',
  RESULT_SHARE: '结果分享 - 分享使用后的效果',
  AFTER_REVEAL: '之后展示 - 展示"之后"的美好状态',
  AFTER_SHOWCASE: '之后展示 - 展示改变后的效果',
  SOCIAL_PROOF: '社会证明 - "很多人都在用"等',
  PROOF: '证据展示 - 展示产品效果证据',
  PRICE_REVEAL: '价格揭示 - 揭示优惠价格',
  LIFESTYLE: '生活方式 - 展示融入生活的场景',
  MOOD_BUILD: '氛围营造 - 营造向往氛围',
  FIRST_IMPRESSION: '第一印象 - 表达初印象',
  UNBOXING_TENSION: '开箱悬念 - 逐步展示产品',
  PRODUCT_REVEAL_2: '产品揭示 - 完整展示产品',
  FULL_ASSEMBLY: '完整组装 - 展示完整产品',
  CTA: '行动号召 - 引导购买或关注',
  CTA_LINK: 'CTA链接 - 引导到购买页面',
  BUY_NOW: '立即购买 - 直接催促下单',
  FOLLOW_CTA: '关注CTA - 引导关注账号',
  CTA_ASPIRATION: '向往CTA - "你也值得拥有"',
  URGENCY_CTA: '紧迫CTA - "限时"、"别错过"',
  WANT_ONE_CTA: '想要CTA - "你也想要吗"',
  ELEGANT_DISCOVER: '优雅发现 - "发现美好事物"',
  COMMUNITY_FOLLOW: '社区关注 - "加入我们"',
  LIMITED_TIME_OFFER: '限时优惠 - "今天特惠"',
  SOCIAL_PROOF_INTEGRATED: '整合社会证明 - 融入推荐',
} as const;

type NarrativeArc = keyof typeof NARRATIVE_ARCS;

// BGM 风格
const BGM_STYLES = {
  UPTEMPO_TRENDY: '快节奏流行 - 活力四射，适合促销',
  HIGH_ENERGY_POP: '高能流行 - 节奏感强，适合快剪',
  UPTEMPO_ELECTRONIC: '电子流行 - 现代感强',
  TRANSFORMATION_BUILDUP: '转变累积 - 逐步升高，最后释放',
  HIGH_ENERGY_PROMO: '促销高能 - 紧迫感强，促销专用',
  UPBEAT: '轻快节奏 - 活力轻快',
  WARM_LIFESTYLE: '温暖生活 - 亲切温馨',
  CHILL_LIFESTYLE: '休闲放松 - 轻松惬意',
  CHILL_AESTHETIC: '美学休闲 - 有格调、文艺',
  TECH_UPTEMPO: '科技快节奏 - 现代科技感',
  DRAMATIC: '戏剧性 - 起伏大，适合故事',
  EMOTIONAL: '情感类 - 触动人心',
  SILENT: '无背景音乐 - 纯人声旁白',
} as const;

type BgmStyle = keyof typeof BGM_STYLES;

// CTA 风格
const CTA_STYLES = {
  DIRECT_BUY: '直接购买 - "立即下单"、"点击购买"',
  DIRECT_URGENCY: '直接紧迫 - "限时优惠"、"马上抢"',
  LIMITED_TIME_OFFER: '限时优惠 - "仅此今天"',
  PRICE_HIGHLIGHT: '价格强调 - 突出价格优惠',
  ELEGANT_DISCOVER: '优雅发现 - "发现更多"',
  COMMUNITY_FOLLOW: '社区关注 - "关注获取更多"',
  SOCIAL_PROOF_INTEGRATED: '社会证明 - "大家都在买"',
  WANT_ONE_CTA: '想要型 - "你也想要吗？"',
  SOFT_DISCOVER: '软引导 - "了解更多"',
  CTA_ASPIRATION: '向往型 - "你也可以拥有"',
} as const;

type CtaStyle = keyof typeof CTA_STYLES;

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

    // 获取 hooks 类型描述
    const hookTypeDesc = this.getHookTypeDescription(viral_hook_type);
    const narrativeArcs = this.extractNarrativeArcs(viral_strategy);
    const bgmStyle = this.extractBgmStyle(viral_factors);
    const ctaStyle = this.extractCtaStyle(viral_factors);

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
      parts.push(`【爆款 Hook 类型】${hookTypeDesc}`);
      parts.push('');
    }

    parts.push('【爆款叙事策略】');
    parts.push(JSON.stringify(viral_strategy, null, 2));
    parts.push('');

    parts.push('【爆款关键成功因子】');
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

    parts.push('1. **叙事结构**：严格仿照爆款的叙事弧线');
    if (narrativeArcs.length > 0) {
      parts.push(`   建议弧线: ${narrativeArcs.join(' → ')}`);
    }
    parts.push('');

    parts.push('2. **Hook 设计**：');
    parts.push(`   - Hook 类型: ${hookTypeDesc}`);
    parts.push(`   - 建议时长: 前 1.5~3 秒必须抓住用户注意力`);
    parts.push('   - 所有文案必须 100% 原创，禁止复制原爆款旁白或字幕');
    parts.push('');

    parts.push('3. **镜头语言**：');
    const cameraPatterns = this.extractCameraPatterns(viral_factors);
    if (cameraPatterns.length > 0) {
      parts.push(`   - 优先使用的运镜: ${cameraPatterns.join(', ')}`);
    }
    const transitions = this.extractTransitions(viral_factors);
    if (transitions.length > 0) {
      parts.push(`   - 偏好的转场: ${transitions.join(', ')}`);
    }
    parts.push('');

    parts.push('4. **节奏控制**：');
    const shotCount = this.extractOptimalShotCount(viral_factors);
    const duration = this.extractOptimalDuration(viral_factors);
    if (shotCount) {
      parts.push(`   - 建议分镜数: ${shotCount}`);
    }
    if (duration) {
      parts.push(`   - 建议总时长: ${duration} 秒`);
    }
    const durationDist = this.extractDurationDistribution(viral_factors);
    if (durationDist && durationDist.length > 0) {
      parts.push(`   - 时长分布模板: [${durationDist.join(', ')}]`);
    }
    parts.push('');

    parts.push('5. **BGM 风格**：');
    if (bgmStyle) {
      parts.push(`   - 建议风格: ${BGM_STYLES[bgmStyle as BgmStyle] || bgmStyle}`);
    }
    parts.push('');

    parts.push('6. **CTA 策略**：');
    if (ctaStyle) {
      parts.push(`   - CTA 风格: ${CTA_STYLES[ctaStyle as CtaStyle] || ctaStyle}`);
    }
    const ctaPlacement = this.extractCtaPlacement(viral_factors);
    if (ctaPlacement) {
      parts.push(`   - 建议位置: ${ctaPlacement}`);
    }
    parts.push('');

    parts.push('7. **字幕/文字**：');
    const captionStyle = this.extractCaptionStyle(viral_factors);
    const captionDensity = this.extractCaptionDensity(viral_factors);
    if (captionStyle) {
      parts.push(`   - 字幕风格: ${captionStyle}`);
    }
    if (captionDensity) {
      parts.push(`   - 字幕密度: ${captionDensity}`);
    }
    parts.push('');

    parts.push('═══════════════════════════════════════');
    parts.push('产品-爆款适配要求（CRITICAL）：');
    parts.push('═══════════════════════════════════════');
    parts.push('8. 所有 visual_description 必须体现目标产品的实际特征（颜色、材质、形状、使用方式），不可使用模糊的通用描述。');
    parts.push('9. voiceover_text 的卖点切入角度必须与产品信息中提供的卖点一致，不可虚构产品不具备的功能。');
    parts.push('10. 如提供了产品约束（product_category, usage_scenario 等），分镜场景必须严格匹配。');
    parts.push('11. 视觉风格应与产品类目和目标受众匹配——例如美妆类偏暖色调/柔和光影，3C类偏冷色调/高对比。');
    parts.push('');

    parts.push('═══════════════════════════════════════');
    parts.push('你必须严格按照以下 JSON Schema 格式输出脚本:');
    parts.push('═══════════════════════════════════════');
    parts.push('{');
    parts.push('  "title": "脚本标题",');
    parts.push('  "video_duration": 14.5,');
    parts.push('  "style_vibe": "风格描述",');
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
    parts.push('10. 每个分镜建议包含 bgm_segment 以指示该镜头的 BGM 风格');
    parts.push('11. **100% 原创**：所有文案必须是你生成的，禁止复制原爆款视频的任何旁白、字幕或营销话术。');

    if (preferences && preferences.length > 0) {
      const winners = preferences.filter(p => p.type === 'WINNER').map(p => p.text);
      const losers = preferences.filter(p => p.type === 'LOSER').map(p => p.text);
      if (winners.length > 0) {
        parts.push(`规则 12：Winner 风格参考 — 请模仿这类表达方式：${winners.join('；')}`);
        parts.push('这些 Winner 文案的特点是：口语化、有节奏感、有行动号召力、制造紧迫感或好奇心');
      }
      if (losers.length > 0) {
        parts.push(`规则 13：Loser 避免模式 — 请避免这类表达方式：${losers.join('；')}`);
        parts.push('这些 Loser 文案的问题是：说明书式平铺、缺乏情感、无节奏变化、生硬的专业术语堆砌');
      }
      parts.push('规则 14：旁白和字幕的文案语调必须对齐 Winner 风格，避免 Loser 模式');
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
    parts.push(`商品卖点: ${selling_points.join('; ')}`);
    parts.push(`目标风格: ${style_vibe}`);

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
    parts.push('【仿写要求】');
    parts.push(`请基于上述爆款视频的叙事结构和成功因子，为新商品生成一份全新带货剧本。`);
    parts.push(`1. 叙事结构: 仿照爆款的叙事弧线设计`);
    parts.push(`2. Hook 设计: 前 1.5~3 秒必须足够吸引人`);
    parts.push(`3. 镜头语言: 优先使用爆款偏好的运镜和转场`);
    parts.push(`4. 节奏控制: 控制在 ${SCRIPT_CONSTANTS.MIN_SHOTS_COUNT}~${SCRIPT_CONSTANTS.MAX_SHOTS_COUNT} 个分镜`);
    parts.push(`5. BGM 风格: 建议使用 ${style_vibe} 风格的背景音乐`);
    parts.push(`6. CTA: 在结尾设计有吸引力的行动号召`);
    parts.push('');
    parts.push('生成 ONLY valid JSON。');

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

    const priorityOrder = [
      'optimalShotCount',
      'optimalTotalDuration',
      'cameraPatterns',
      'transitionPreference',
      'bgmStyle',
      'captionDensity',
      'ctaTiming',
      'hookRetentionBoost',
      'avgShotDuration',
      'textOverlayRatio',
      'productFocusMode',
      'cameraPreferenceWeights',
      'captionStyle',
    ];

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

  // 辅助方法：提取各种因子信息

  private getHookTypeDescription(hookType: string): string {
    const normalized = hookType.toUpperCase().replace(/[_-]/g, '_');
    const typeKey = normalized as HookType;
    return HOOK_TYPES[typeKey] || hookType;
  }

  private extractNarrativeArcs(strategy: Record<string, unknown>): string[] {
    const arc = strategy.narrative_arc || strategy.narrativeArc;
    if (Array.isArray(arc)) {
      return arc.map((a) => NARRATIVE_ARCS[a as NarrativeArc] || String(a));
    }
    return [];
  }

  private extractCameraPatterns(factors: Record<string, unknown>): string[] {
    const patterns = factors.cameraPatterns || factors.camera_patterns;
    if (Array.isArray(patterns)) {
      return patterns.map((p) => String(p));
    }
    return [];
  }

  private extractTransitions(factors: Record<string, unknown>): string[] {
    const pref = factors.transitionPreference || factors.transition_preference;
    if (typeof pref === 'object' && pref !== null) {
      return Object.keys(pref);
    }
    if (Array.isArray(pref)) {
      return pref.map((t) => String(t));
    }
    return [];
  }

  private extractOptimalShotCount(factors: Record<string, unknown>): string | null {
    const count = factors.optimalShotCount || factors.optimal_shot_count;
    return count ? String(count) : null;
  }

  private extractOptimalDuration(factors: Record<string, unknown>): string | null {
    const dur = factors.optimalTotalDuration || factors.optimal_total_duration;
    return dur ? String(dur) : null;
  }

  private extractDurationDistribution(factors: Record<string, unknown>): number[] {
    const dist = factors.durationDistributionTemplate || factors.duration_distribution_template;
    if (Array.isArray(dist)) {
      return dist.map((d) => Number(d));
    }
    return [];
  }

  private extractBgmStyle(factors: Record<string, unknown>): string | null {
    const style = factors.bgmStyle || factors.bgm_style;
    return style ? String(style) : null;
  }

  private extractCtaStyle(factors: Record<string, unknown>): string | null {
    const style = factors.ctaStyle || factors.cta_style;
    return style ? String(style) : null;
  }

  private extractCtaPlacement(factors: Record<string, unknown>): string | null {
    const placement = factors.ctaPlacement || factors.cta_placement || factors.ctaTiming;
    return placement ? String(placement) : null;
  }

  private extractCaptionStyle(factors: Record<string, unknown>): string | null {
    const style = factors.captionStyle || factors.caption_style;
    return style ? String(style) : null;
  }

  private extractCaptionDensity(factors: Record<string, unknown>): string | null {
    const density = factors.captionDensity || factors.caption_density;
    return density ? String(density) : null;
  }
}