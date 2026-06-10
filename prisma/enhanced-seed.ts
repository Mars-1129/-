import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * TikStream AI — Enhanced Seed Data
 *
 * 包含以下种子数据:
 * 1. 演示商品 (Product)
 * 2. 高质量模板 (Templates) - 基于爆款视频分析提炼的策略因子
 * 3. 爆款视频分析 (ViralVideoAnalysis) - 结构化拆解数据
 */

async function main(): Promise<void> {
  console.log('Starting enhanced seed data initialization...');

  // ===========================================================================
  // 1. 演示商品
  // ===========================================================================
  const product = await prisma.product.upsert({
    where: { skuCode: 'TKS-DEMO-SKU-001' },
    update: {
      title: 'TikStream 演示商品',
      category: 'beauty',
      sellingPoints: ['15秒高转化短视频', 'AI自动生成分镜', '适配TikTok Shop'],
      targetAudience: '跨境电商运营团队',
      scenarioTags: ['demo', 'tiktok-shop', 'aigc'],
      textFeatures: {
        tone: 'energetic',
        locale: 'zh-CN',
      },
      coverImageUrl: 'https://example.com/tikstream-demo-cover.jpg',
    },
    create: {
      title: 'TikStream 演示商品',
      skuCode: 'TKS-DEMO-SKU-001',
      category: 'beauty',
      sellingPoints: ['15秒高转化短视频', 'AI自动生成分镜', '适配TikTok Shop'],
      targetAudience: '跨境电商运营团队',
      scenarioTags: ['demo', 'tiktok-shop', 'aigc'],
      textFeatures: {
        tone: 'energetic',
        locale: 'zh-CN',
      },
      coverImageUrl: 'https://example.com/tikstream-demo-cover.jpg',
    },
  });
  console.log(`✓ Product created/updated: ${product.id}`);

  // ===========================================================================
  // 2. 高质量模板 (基于行业最佳实践)
  // ===========================================================================

  const templates = [
    // ---------------------------------------------------------------------------
    // 模板 1: 痛点-解决方案型 (Pain Point → Solution)
    // ---------------------------------------------------------------------------
    {
      productId: product.id,
      name: '痛点放大-解决方案模板',
      category: 'product_demo',
      strategySummary: '前三秒通过痛点放大抓住用户注意力，中段展示产品如何解决该痛点，结尾给出明确CTA。节奏紧凑，信息密度高，适合功能性产品。',
      factorJson: {
        // 叙事因子
        hook_type: 'PAIN_POINT',
        hook_duration_range: [2.0, 3.0],
        narrative_arc: ['HOOK_PAIN', 'EMOTIONAL_RESONANCE', 'PRODUCT_DEMO', 'PROOF', 'CTA'],
        emotional_curve: [0.9, 0.7, 0.85, 0.6, 1.0],
        pacing_score: 8,

        // 视觉因子
        camera_pattern_weights: {
          'Dolly_In_Fast': 0.3,
          'Static': 0.4,
          'Pan_Left': 0.2,
          'Tilt_Up': 0.1,
        },
        transition_preference: {
          'Dissolve': 0.5,
          'Fade_In': 0.3,
          'None': 0.2,
        },
        scene_compositions: ['产品特写', '使用场景', '对比展示'],
        caption_style: 'DYNAMIC_HIGHLIGHT',
        caption_density: 0.8,

        // 节奏因子
        shot_count_range: [4, 6],
        total_duration_target: 14.5,
        duration_distribution_template: [2.5, 3.0, 3.5, 3.0, 2.5],
        fast_cut_ratio: 0.2,

        // 音频因子
        bgm_style: 'UPTEMPO_TRENDY',
        bgm_intensity_template: [0.6, 0.8, 0.9, 0.7, 1.0],
        voice_type: 'FEMALE_CONFIDENT',
        voice_tone: 'ENERGETIC',

        // 转化因子
        cta_placement: 'END',
        cta_style: 'DIRECT_URGENCY',
        urgency_level: 7,
        pain_point_approach: 'PROBLEM_AMPLIFICATION',
      },
      schemaJson: {
        required_fields: ['scene_description_query', 'visual_description', 'voiceover_text', 'subtitle_text'],
        max_total_duration_seconds: 15,
        min_shot_count: 4,
        max_shot_count: 6,
      },
      status: 'ACTIVE' as const,
    },

    // ---------------------------------------------------------------------------
    // 模板 2: 前后对比型 (Before/After Transformation)
    // ---------------------------------------------------------------------------
    {
      productId: product.id,
      name: '前后对比-转变冲击模板',
      category: 'comparison',
      strategySummary: '通过强烈的视觉对比展示产品效果，前三秒建立"之前"的痛点状态，中段展示转变过程，结尾强调"之后"的美好状态。适合美容、健身、家居类产品。',
      factorJson: {
        hook_type: 'CONTRAST_REVEAL',
        hook_duration_range: [1.5, 2.5],
        narrative_arc: ['HOOK_BEFORE', 'PAIN_POINT', 'TRANSITION', 'AFTER_REVEAL', 'CTA'],
        emotional_curve: [0.7, 0.5, 0.6, 0.95, 1.0],
        pacing_score: 9,

        camera_pattern_weights: {
          'Dolly_In_Fast': 0.4,
          'Dolly_Out': 0.2,
          'Static': 0.2,
          'Tilt_Up': 0.2,
        },
        transition_preference: {
          'Wipe': 0.4,
          'Dissolve': 0.4,
          'None': 0.2,
        },
        scene_compositions: ['对比双画面', '产品特写', '场景还原'],
        caption_style: 'BEFORE_AFTER_LABEL',
        caption_density: 1.0,

        shot_count_range: [4, 5],
        total_duration_target: 13.0,
        duration_distribution_template: [2.0, 2.5, 3.5, 2.5, 2.5],
        fast_cut_ratio: 0.4,

        bgm_style: 'TRANSFORMATION_BUILDUP',
        bgm_intensity_template: [0.4, 0.5, 0.7, 0.9, 1.0],
        voice_type: 'NARRATOR_FIRM',
        voice_tone: 'BELIEVABLE',

        cta_placement: 'END',
        cta_style: 'SOCIAL_PROOF_INTEGRATED',
        urgency_level: 5,
        pain_point_approach: 'VISUAL_CONTRAST',
      },
      schemaJson: {
        required_fields: ['scene_description_query', 'visual_description', 'voiceover_text', 'subtitle_text'],
        max_total_duration_seconds: 15,
        min_shot_count: 4,
        max_shot_count: 5,
      },
      status: 'ACTIVE' as const,
    },

    // ---------------------------------------------------------------------------
    // 模板 3: 紧迫感促销型 (Urgency Promotion)
    // ---------------------------------------------------------------------------
    {
      productId: product.id,
      name: '限时优惠-紧迫感模板',
      category: 'promo',
      strategySummary: '制造紧迫感，强调限时优惠力度。前三秒用价格钩子吸引注意，中段展示产品价值，结尾以优惠截止催促下单。适合电商大促、限时特卖场景。',
      factorJson: {
        hook_type: 'PRICE_URGENCY',
        hook_duration_range: [1.0, 2.0],
        narrative_arc: ['HOOK_PRICE', 'VALUE_DEMO', 'BENEFIT_HIGHLIGHT', 'PRICE_REVEAL', 'URGENCY_CTA'],
        emotional_curve: [1.0, 0.6, 0.8, 0.9, 1.0],
        pacing_score: 10,

        camera_pattern_weights: {
          'Dolly_In_Fast': 0.5,
          'Static': 0.3,
          'Pan_Left': 0.1,
          'Tilt_Up': 0.1,
        },
        transition_preference: {
          'None': 0.4,
          'Fade_In': 0.4,
          'Dissolve': 0.2,
        },
        scene_compositions: ['价格特写', '产品展示', '库存场景'],
        caption_style: 'PRICE_HIGHLIGHT',
        caption_density: 1.2,

        shot_count_range: [5, 6],
        total_duration_target: 14.0,
        duration_distribution_template: [1.5, 2.5, 3.0, 2.5, 2.5, 2.0],
        fast_cut_ratio: 0.5,

        bgm_style: 'HIGH_ENERGY_PROMO',
        bgm_intensity_template: [1.0, 0.7, 0.8, 0.9, 1.0],
        voice_type: 'MALE_EXCITED',
        voice_tone: 'URGENT',

        cta_placement: 'END',
        cta_style: 'LIMITED_TIME_OFFER',
        urgency_level: 10,
        pain_point_approach: 'PRICE_SENSITIVITY',
      },
      schemaJson: {
        required_fields: ['scene_description_query', 'visual_description', 'voiceover_text', 'subtitle_text'],
        max_total_duration_seconds: 15,
        min_shot_count: 5,
        max_shot_count: 6,
      },
      status: 'ACTIVE' as const,
    },

    // ---------------------------------------------------------------------------
    // 模板 4: 种草口碑型 (Social Proof / Testimonial)
    // ---------------------------------------------------------------------------
    {
      productId: product.id,
      name: '真实体验-种草口碑模板',
      category: 'testimonial',
      strategySummary: '模拟真实用户体验分享，建立信任感。前三秒以"闺蜜推荐"或"亲测有效"开场，中段展示真实使用感受，结尾引导关注或购买。适合口碑传播型产品。',
      factorJson: {
        hook_type: 'SOCIAL_PROOF',
        hook_duration_range: [2.0, 3.0],
        narrative_arc: ['HOOK_RECOMMEND', 'PERSONAL_STORY', 'USAGE_DEMO', 'RESULT_SHARE', 'FOLLOW_CTA'],
        emotional_curve: [0.8, 0.9, 0.7, 0.85, 0.9],
        pacing_score: 7,

        camera_pattern_weights: {
          'Static': 0.5,
          'Pan_Left': 0.25,
          'Dolly_In_Fast': 0.15,
          'Tilt_Up': 0.1,
        },
        transition_preference: {
          'Dissolve': 0.5,
          'None': 0.3,
          'Fade_In': 0.2,
        },
        scene_compositions: ['第一人称视角', '产品展示', '场景生活化'],
        caption_style: 'CONVERSATIONAL',
        caption_density: 0.6,

        shot_count_range: [4, 5],
        total_duration_target: 14.0,
        duration_distribution_template: [2.5, 3.0, 3.0, 2.5, 3.0],
        fast_cut_ratio: 0.15,

        bgm_style: 'WARM_LIFESTYLE',
        bgm_intensity_template: [0.5, 0.6, 0.5, 0.6, 0.7],
        voice_type: 'FEMALE_WARM',
        voice_tone: 'FRIENDLY',

        cta_placement: 'END',
        cta_style: 'COMMUNITY_FOLLOW',
        urgency_level: 3,
        pain_point_approach: 'PERSONAL_EXPERIENCE',
      },
      schemaJson: {
        required_fields: ['scene_description_query', 'visual_description', 'voiceover_text', 'subtitle_text'],
        max_total_duration_seconds: 15,
        min_shot_count: 4,
        max_shot_count: 5,
      },
      status: 'ACTIVE' as const,
    },

    // ---------------------------------------------------------------------------
    // 模板 5: 产品展示型 (Product Showcase)
    // ---------------------------------------------------------------------------
    {
      productId: product.id,
      name: '高质感-产品展示模板',
      category: 'product_demo',
      strategySummary: '高质感产品展示，适合高端品牌或精致产品。前三秒以产品亮相吸引目光，中段多角度展示产品细节与质感，结尾展示使用效果。节奏舒缓，强调美学。',
      factorJson: {
        hook_type: 'PRODUCT_REVEAL',
        hook_duration_range: [2.0, 3.5],
        narrative_arc: ['HOOK_REVEAL', 'DETAIL_SHOWCASE', 'FEATURE_HIGHLIGHT', 'LIFESTYLE', 'CTA'],
        emotional_curve: [0.85, 0.7, 0.75, 0.8, 0.9],
        pacing_score: 5,

        camera_pattern_weights: {
          'Dolly_In_Fast': 0.3,
          'Dolly_Out': 0.2,
          'Static': 0.3,
          'Tilt_Up': 0.2,
        },
        transition_preference: {
          'Fade_In': 0.4,
          'Dissolve': 0.4,
          'None': 0.2,
        },
        scene_compositions: ['产品静物', '细节特写', '使用场景', '氛围营造'],
        caption_style: 'MINIMAL_ELEGANT',
        caption_density: 0.4,

        shot_count_range: [4, 5],
        total_duration_target: 14.0,
        duration_distribution_template: [2.5, 3.0, 3.0, 3.0, 2.5],
        fast_cut_ratio: 0.1,

        bgm_style: 'CHILL_LIFESTYLE',
        bgm_intensity_template: [0.4, 0.5, 0.5, 0.5, 0.6],
        voice_type: 'NARRATOR_CALM',
        voice_tone: 'SOPHISTICATED',

        cta_placement: 'END',
        cta_style: 'ELEGANT_DISCOVER',
        urgency_level: 2,
        pain_point_approach: 'QUALITY_FOCUS',
      },
      schemaJson: {
        required_fields: ['scene_description_query', 'visual_description', 'voiceover_text', 'subtitle_text'],
        max_total_duration_seconds: 15,
        min_shot_count: 4,
        max_shot_count: 5,
      },
      status: 'ACTIVE' as const,
    },

    // ---------------------------------------------------------------------------
    // 模板 6: 开箱体验型 (Unboxing)
    // ---------------------------------------------------------------------------
    {
      productId: product.id,
      name: '开箱惊喜-体验分享模板',
      category: 'unboxing',
      strategySummary: '模拟开箱体验，满足好奇心。前三秒展示包裹/包装吸引注意，中段逐步展示产品配件和外观，结尾展示完整产品和第一印象。适合新品发布、礼品类场景。',
      factorJson: {
        hook_type: 'CURIOSITY_BUILD',
        hook_duration_range: [2.0, 3.0],
        narrative_arc: ['HOOK_PACKAGE', 'UNBOXING_TENSION', 'PRODUCT_REVEAL', 'FULL_ASSEMBLY', 'FIRST_IMPRESSION'],
        emotional_curve: [0.8, 0.7, 0.9, 0.85, 0.9],
        pacing_score: 6,

        camera_pattern_weights: {
          'Pan_Left': 0.3,
          'Dolly_In_Fast': 0.3,
          'Static': 0.2,
          'Tilt_Up': 0.2,
        },
        transition_preference: {
          'Dissolve': 0.4,
          'Fade_In': 0.3,
          'None': 0.3,
        },
        scene_compositions: ['包装特写', '配件展示', '组装过程', '成品展示'],
        caption_style: 'ANNOTATION_STYLE',
        caption_density: 0.7,

        shot_count_range: [5, 6],
        total_duration_target: 14.5,
        duration_distribution_template: [2.0, 2.5, 3.0, 2.5, 2.5, 2.0],
        fast_cut_ratio: 0.3,

        bgm_style: 'EXCITING_UNBOXING',
        bgm_intensity_template: [0.6, 0.7, 0.8, 0.7, 0.8, 0.9],
        voice_type: 'FEMALE_EXCITED',
        voice_tone: 'GENUINE_EXCITEMENT',

        cta_placement: 'END',
        cta_style: 'WANT_ONE_CTA',
        urgency_level: 4,
        pain_point_approach: 'CURIOSITY_SATISFACTION',
      },
      schemaJson: {
        required_fields: ['scene_description_query', 'visual_description', 'voiceover_text', 'subtitle_text'],
        max_total_duration_seconds: 15,
        min_shot_count: 5,
        max_shot_count: 6,
      },
      status: 'ACTIVE' as const,
    },
  ];

  for (const templateData of templates) {
    const existingTemplate = await prisma.template.findFirst({
      where: { name: templateData.name },
    });

    if (existingTemplate) {
      await prisma.template.update({
        where: { id: existingTemplate.id },
        data: templateData,
      });
      console.log(`✓ Template updated: ${templateData.name}`);
    } else {
      await prisma.template.create({ data: templateData });
      console.log(`✓ Template created: ${templateData.name}`);
    }
  }

  // ===========================================================================
  // 3. 爆款视频分析 (示例数据 - 基于真实爆款视频特征)
  // ===========================================================================

  const viralAnalyses = [
    {
      productId: product.id,
      sourcePlatform: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@beauty_hacks/video/7350000000000000001',
      externalVideoId: 'viral-beauty-hacks-001',
      title: '美妆技巧类爆款视频',
      hookType: 'visual_contrast',
      strategyJson: {
        opening_hook: '快速展示使用前后对比，建立期待感',
        narrative_arc: ['BEFORE_REVEAL', 'PROBLEM_STATEMENT', 'SOLUTION_DEMO', 'AFTER_SHOWCASE', 'CTA_LINK'],
        pacing: 'medium_fast_cut',
        emotional_trigger: 'transformation_expectation',
        key_moments: [
          { timestamp: 0, action: 'BEFORE_REVEAL', importance: 'HIGH' },
          { timestamp: 3, action: 'PROBLEM_STATEMENT', importance: 'MEDIUM' },
          { timestamp: 6, action: 'SOLUTION_DEMO', importance: 'HIGH' },
          { timestamp: 10, action: 'AFTER_SHOWCASE', importance: 'HIGH' },
          { timestamp: 13, action: 'CTA_LINK', importance: 'MEDIUM' },
        ],
        text_overlay_strategy: 'key_words_highlighted',
        cta_placement: 'final_2_seconds',
      },
      factorJson: {
        optimalShotCount: 5,
        optimalTotalDuration: 14.5,
        cameraPatterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up', 'Pan_Left'],
        cameraPreferenceWeights: {
          'Dolly_In_Fast': 0.35,
          'Static': 0.30,
          'Tilt_Up': 0.20,
          'Pan_Left': 0.15,
        },
        transitionPreference: {
          'Dissolve': 0.45,
          'Fade_In': 0.30,
          'None': 0.25,
        },
        bgmStyle: 'upbeat_trendy_pop',
        captionDensity: 0.8,
        captionStyle: 'dynamic_highlight',
        ctaTiming: 'final_two_seconds',
        hookRetentionBoost: 0.85,
        avgShotDuration: 2.9,
        textOverlayRatio: 0.6,
        productFocusMode: 'demo_centric',
      },
      reportJson: {
        retentionPeakSecond: 2,
        dropRiskSecond: 10,
        avgWatchTime: 12.5,
        engagementRate: 0.085,
        recommendation: '保持前三秒强对比，结尾CTA文案简洁有力',
        estimatedConversion: 0.035,
        successFactors: [
          'VISUAL_TRANSFORMATION_CLARITY',
          'FAST_PACED_EDITING',
          'CLEAR_BEFORE_AFTER',
          'CONCISE_CTA',
        ],
      },
      declaredPublicSource: true,
    },

    {
      productId: product.id,
      sourcePlatform: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@tech_gadgets/video/7350000000000000002',
      externalVideoId: 'viral-tech-gadgets-002',
      title: '科技数码类爆款视频',
      hookType: 'curiosity_question',
      strategyJson: {
        opening_hook: '以问题或惊讶表情开场，引发好奇',
        narrative_arc: ['HOOK_QUESTION', 'PROBLEM_EXPLAIN', 'SOLUTION_REVEAL', 'FEATURE_DEMO', 'BUY_NOW'],
        pacing: 'steady_paced',
        emotional_trigger: 'curiosity_and_fomo',
        key_moments: [
          { timestamp: 0, action: 'HOOK_QUESTION', importance: 'HIGH' },
          { timestamp: 4, action: 'PROBLEM_EXPLAIN', importance: 'MEDIUM' },
          { timestamp: 7, action: 'SOLUTION_REVEAL', importance: 'HIGH' },
          { timestamp: 10, action: 'FEATURE_DEMO', importance: 'HIGH' },
          { timestamp: 13, action: 'BUY_NOW', importance: 'MEDIUM' },
        ],
        text_overlay_strategy: 'feature_bullets',
        cta_placement: 'final_3_seconds',
      },
      factorJson: {
        optimalShotCount: 5,
        optimalTotalDuration: 14.0,
        cameraPatterns: ['Static', 'Pan_Left', 'Dolly_In_Fast', 'Tilt_Up'],
        cameraPreferenceWeights: {
          'Static': 0.40,
          'Pan_Left': 0.30,
          'Dolly_In_Fast': 0.20,
          'Tilt_Up': 0.10,
        },
        transitionPreference: {
          'None': 0.40,
          'Dissolve': 0.35,
          'Fade_In': 0.25,
        },
        bgmStyle: 'tech_upbeat',
        captionDensity: 1.0,
        captionStyle: 'feature_labels',
        ctaTiming: 'final_three_seconds',
        hookRetentionBoost: 0.78,
        avgShotDuration: 2.8,
        textOverlayRatio: 0.75,
        productFocusMode: 'feature_highlight',
      },
      reportJson: {
        retentionPeakSecond: 1,
        dropRiskSecond: 8,
        avgWatchTime: 11.2,
        engagementRate: 0.072,
        recommendation: 'Hook问题要足够吸引人，产品功能点要清晰展示',
        estimatedConversion: 0.028,
        successFactors: [
          'CLEAR_VALUE_PROPOSITION',
          'TECH_SPECS_VISIBLE',
          'PRICE_MENTION',
          'COMPARISON_BENEFIT',
        ],
      },
      declaredPublicSource: true,
    },

    {
      productId: product.id,
      sourcePlatform: 'douyin',
      sourceUrl: 'https://www.douyin.com/video/7350000000000000003',
      externalVideoId: 'viral-lifestyle-003',
      title: '生活方式类爆款视频',
      hookType: 'lifestyle_aspiration',
      strategyJson: {
        opening_hook: '展示令人向往的生活方式片段',
        narrative_arc: ['LIFESTYLE_SCENE', 'PRODUCT_INTEGRATION', 'BENEFIT_SHOWCASE', 'MOOD_BUILD', 'CTA_ASPIRATION'],
        pacing: 'slow_aesthetic',
        emotional_trigger: 'aspiration_and_desire',
        key_moments: [
          { timestamp: 0, action: 'LIFESTYLE_SCENE', importance: 'HIGH' },
          { timestamp: 4, action: 'PRODUCT_INTEGRATION', importance: 'MEDIUM' },
          { timestamp: 8, action: 'BENEFIT_SHOWCASE', importance: 'HIGH' },
          { timestamp: 11, action: 'MOOD_BUILD', importance: 'MEDIUM' },
          { timestamp: 13, action: 'CTA_ASPIRATION', importance: 'MEDIUM' },
        ],
        text_overlay_strategy: 'mood_keywords',
        cta_placement: 'soft_cta_final',
      },
      factorJson: {
        optimalShotCount: 4,
        optimalTotalDuration: 13.5,
        cameraPatterns: ['Static', 'Pan_Left', 'Dolly_Out', 'Tilt_Up'],
        cameraPreferenceWeights: {
          'Static': 0.45,
          'Pan_Left': 0.25,
          'Dolly_Out': 0.20,
          'Tilt_Up': 0.10,
        },
        transitionPreference: {
          'Fade_In': 0.40,
          'Dissolve': 0.40,
          'None': 0.20,
        },
        bgmStyle: 'chill_aesthetic',
        captionDensity: 0.5,
        captionStyle: 'minimal_mood',
        ctaTiming: 'soft_final',
        hookRetentionBoost: 0.72,
        avgShotDuration: 3.4,
        textOverlayRatio: 0.4,
        productFocusMode: 'lifestyle_integration',
      },
      reportJson: {
        retentionPeakSecond: 3,
        dropRiskSecond: 9,
        avgWatchTime: 11.8,
        engagementRate: 0.065,
        recommendation: '保持画面美学感，BGM选择要与内容调性一致',
        estimatedConversion: 0.022,
        successFactors: [
          'AESTHETIC_VISUALS',
          'MOOD_MATCHING_BGM',
          'LIFESTYLE_ASPIRATION',
          'SOFT_SELLING_CTA',
        ],
      },
      declaredPublicSource: true,
    },
  ];

  for (const viralData of viralAnalyses) {
    const existingViral = await prisma.viralVideoAnalysis.findFirst({
      where: { externalVideoId: viralData.externalVideoId },
    });

    if (existingViral) {
      await prisma.viralVideoAnalysis.update({
        where: { id: existingViral.id },
        data: viralData,
      });
      console.log(`✓ Viral analysis updated: ${viralData.title}`);
    } else {
      await prisma.viralVideoAnalysis.create({ data: viralData });
      console.log(`✓ Viral analysis created: ${viralData.title}`);
    }
  }

  // ===========================================================================
  // 4. 创建测试用商品 (用于演示不同类目)
  // ===========================================================================

  const testProducts = [
    {
      skuCode: 'TKS-TEST-FOOD-001',
      title: '网红零食测评',
      category: 'food',
      sellingPoints: ['好吃到停不下来', '性价比超高', '无限回购'],
      targetAudience: '年轻吃货群体',
      scenarioTags: ['food', 'snack', 'review'],
    },
    {
      skuCode: 'TKS-TEST-FITNESS-001',
      title: '健身器材推荐',
      category: 'fitness',
      sellingPoints: ['在家也能健身', '效果看得见', '方便收纳'],
      targetAudience: '健身爱好者',
      scenarioTags: ['fitness', 'home_gym', 'health'],
    },
  ];

  for (const productData of testProducts) {
    const existing = await prisma.product.findUnique({
      where: { skuCode: productData.skuCode },
    });

    if (existing) {
      await prisma.product.update({
        where: { skuCode: productData.skuCode },
        data: {
          title: productData.title,
          category: productData.category,
          sellingPoints: productData.sellingPoints,
          targetAudience: productData.targetAudience,
          scenarioTags: productData.scenarioTags,
        },
      });
    } else {
      await prisma.product.create({
        data: {
          ...productData,
          textFeatures: { tone: 'energetic', locale: 'zh-CN' },
          coverImageUrl: 'https://example.com/default-cover.jpg',
        },
      });
    }
    console.log(`✓ Test product created/updated: ${productData.skuCode}`);
  }

  console.log('\n========================================');
  console.log('Enhanced seed data initialization complete!');
  console.log('========================================');
  console.log(`- 1 demo product`);
  console.log(`- ${templates.length} templates`);
  console.log(`- ${viralAnalyses.length} viral video analyses`);
  console.log(`- ${testProducts.length} test products`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error('Seed failed:', error);
    process.exit(1);
  });