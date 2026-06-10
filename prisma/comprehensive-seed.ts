import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * TikStream AI — Comprehensive Seed Data
 *
 * 完整的测试数据填充脚本，包含以下数据:
 * 1. 商品 (Product) -多个类目
 * 2. 素材 (Material & MaterialSlice) - 模拟视频切段
 * 3. 剧本 (Script & ScriptShot) - 不同风格的脚本
 * 4. 创作 (Creation & ShotRender) - 创作记录
 * 5. 模板 (Template) - 多种类型模板
 * 6. 爆款视频分析 (ViralVideoAnalysis) - 结构化分析数据
 * 7. 因子/策略/约束 (Factor/Strategy/Constraint) - 创作参数
 * 8. 趋势快照 (TrendSnapshot) - 趋势追踪数据
 * 9. 评论数据 (Comment & CommentAnalysis) - 用户反馈
 * 10. DNA模式 (DnaPattern) - 爆款DNA
 * 11. A/B测试会话 (AutoAbSession) - 实验数据
 * 12. 搜索日志 (UserSearchLog) - 搜索行为数据
 */

async function main(): Promise<void> {
  console.log('========================================');
  console.log('TikStream AI - Comprehensive Seed Data');
  console.log('========================================\n');

  // ===========================================================================
  // 1. 商品数据 -覆盖多个类目
  // ===========================================================================
  console.log('[1/12] Creating products...');

  const products = [
    {
      skuCode: 'BEA-001',
      title: '玻尿酸保湿面膜',
      category: 'beauty',
      sellingPoints: ['深层补水', '15分钟见效', '医美级成分'],
      targetAudience: '18-35岁女性，注重护肤',
      scenarioTags: ['skincare', 'daily', 'hydrating'],
      textFeatures: { tone: 'fresh', locale: 'zh-CN', style: 'warm' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/beauty-001.jpg',
      brand: '水光肌',
      color: '透明',
      materialType: ' skincare',
      sizeDesc: '5片装',
    },
    {
      skuCode: 'BEA-002',
      title: '防蓝光护肤精华液',
      category: 'beauty',
      sellingPoints: ['抵抗屏幕辐射', '修护肌肤屏障', '清爽不油腻'],
      targetAudience: '白领上班族，长期面对电脑',
      scenarioTags: ['anti-blue-light', 'office', 'repair'],
      textFeatures: { tone: 'professional', locale: 'zh-CN', style: 'tech-forward' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/beauty-002.jpg',
      brand: '科技护肤',
      color: '淡紫色',
      materialType: 'serum',
      sizeDesc: '30ml',
    },
    {
      skuCode: 'FIT-001',
      title: '智能健身手环',
      category: 'fitness',
      sellingPoints: ['心率监测', '睡眠分析', '30天续航'],
      targetAudience: '健身爱好者，20-45岁',
      scenarioTags: ['wearable', 'health', 'smart'],
      textFeatures: { tone: 'energetic', locale: 'zh-CN', style: 'modern' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/fitness-001.jpg',
      brand: '动力星',
      color: '黑色',
      materialType: 'electronics',
      sizeDesc: '标准款',
    },
    {
      skuCode: 'FIT-002',
      title: '便携阻力带套装',
      category: 'fitness',
      sellingPoints: ['在家健身', '5种阻力等级', '收纳方便'],
      targetAudience: '居家健身人群',
      scenarioTags: ['home-workout', 'portable', 'beginner-friendly'],
      textFeatures: { tone: 'friendly', locale: 'zh-CN', style: 'approachable' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/fitness-002.jpg',
      brand: '动起来',
      color: '多彩',
      materialType: 'equipment',
      sizeDesc: '5件套',
    },
    {
      skuCode: 'FOOD-001',
      title: '有机坚果能量棒',
      category: 'food',
      sellingPoints: ['纯天然成分', '高蛋白低糖', '随时补充能量'],
      targetAudience: '健康饮食人群，加班党',
      scenarioTags: ['healthy-snack', 'organic', 'energy'],
      textFeatures: { tone: 'healthy', locale: 'zh-CN', style: 'natural' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/food-001.jpg',
      brand: '森林之选',
      color: '原味棕',
      materialType: 'food',
      sizeDesc: '12根/盒',
    },
    {
      skuCode: 'FOOD-002',
      title: '网红螺蛳粉组合',
      category: 'food',
      sellingPoints: ['地道柳州味', '料足过瘾', '5分钟即食'],
      targetAudience: '年轻吃货，爱尝鲜',
      scenarioTags: ['instant-noodle', 'trending', 'spicy'],
      textFeatures: { tone: 'fun', locale: 'zh-CN', style: 'trendy' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/food-002.jpg',
      brand: '嗦嗨',
      color: '红油',
      materialType: 'food',
      sizeDesc: '3包装',
    },
    {
      skuCode: 'HOME-001',
      title: '超声波香薰机',
      category: 'home',
      sellingPoints: ['静音设计', '7色氛围灯', '大容量可持续8小时'],
      targetAudience: '追求生活品质的都市人群',
      scenarioTags: ['aromatherapy', 'home-decor', 'relaxation'],
      textFeatures: { tone: 'zen', locale: 'zh-CN', style: 'peaceful' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/home-001.jpg',
      brand: '呼吸间',
      color: '白',
      materialType: 'appliance',
      sizeDesc: '500ml',
    },
    {
      skuCode: 'HOME-002',
      title: '多功能收纳盒套装',
      category: 'home',
      sellingPoints: ['抽屉分隔', '透明可视', '食品级材质'],
      targetAudience: '注重收纳的年轻家庭',
      scenarioTags: ['organization', 'kitchen', 'practical'],
      textFeatures: { tone: 'practical', locale: 'zh-CN', style: 'minimalist' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/home-002.jpg',
      brand: '整洁家',
      color: '透明',
      materialType: 'storage',
      sizeDesc: '5件套',
    },
    {
      skuCode: 'TECH-001',
      title: '迷你无线蓝牙耳机',
      category: 'tech',
      sellingPoints: ['主动降噪', '32小时续航', 'IPX5防水'],
      targetAudience: '音乐爱好者，通勤族',
      scenarioTags: ['audio', 'wireless', 'commute'],
      textFeatures: { tone: 'cool', locale: 'zh-CN', style: 'premium' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/tech-001.jpg',
      brand: '音浪',
      color: '星空灰',
      materialType: 'electronics',
      sizeDesc: '单只耳机',
    },
    {
      skuCode: 'TECH-002',
      title: '磁吸充电数据线',
      category: 'tech',
      sellingPoints: ['盲插设计', '快充30W', '1.2米线长'],
      targetAudience: '苹果/安卓双持用户',
      scenarioTags: ['charging', 'universal', 'convenient'],
      textFeatures: { tone: 'tech', locale: 'zh-CN', style: 'smart' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/tech-002.jpg',
      brand: '闪电侠',
      color: '银色',
      materialType: 'accessories',
      sizeDesc: '1.2米',
    },
    {
      skuCode: 'PET-001',
      title: '全自动智能猫砂盆',
      category: 'pet',
      sellingPoints: ['自动除臭', 'APP远程监控', '超低噪音'],
      targetAudience: '养猫白领，出差族',
      scenarioTags: ['pet-tech', 'automatic', 'smart-home'],
      textFeatures: { tone: 'caring', locale: 'zh-CN', style: 'innovative' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/pet-001.jpg',
      brand: '喵星人',
      color: '白色',
      materialType: 'pet-equipment',
      sizeDesc: '大型号',
    },
    {
      skuCode: 'PET-002',
      title: '天然猫罐头组合',
      category: 'pet',
      sellingPoints: ['0添加剂', '深海鱼配方', '挑嘴猫也爱吃'],
      targetAudience: '猫咪铲屎官',
      scenarioTags: ['cat-food', 'premium', 'healthy'],
      textFeatures: { tone: 'loving', locale: 'zh-CN', style: 'pet-friendly' },
      coverImageUrl: 'http://localhost:9000/tikstream-assets/demo/products/pet-002.jpg',
      brand: '毛孩子',
      color: '金黄',
      materialType: 'pet-food',
      sizeDesc: '12罐装',
    },
  ];

  const createdProducts: { id: string; skuCode: string; title: string; category: string }[] = [];

  for (const productData of products) {
    const existing = await prisma.product.findUnique({
      where: { skuCode: productData.skuCode },
    });

    if (existing) {
      const updated = await prisma.product.update({
        where: { skuCode: productData.skuCode },
        data: productData,
      });
      createdProducts.push(updated);
    } else {
      const created = await prisma.product.create({ data: productData });
      createdProducts.push(created);
    }
  }
  console.log(`✓ Created/updated ${createdProducts.length} products\n`);

  // ===========================================================================
  // 2. 素材数据 (Material & MaterialSlice)
  // ===========================================================================
  console.log('[2/12] Creating materials and slices...');

  const materialTypes = ['IMAGE', 'VIDEO', 'PRODUCT_MAIN_IMAGE'] as const;
  const materialStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
  const sliceStatuses = ['PENDING', 'CAPTIONING', 'EMBEDDING', 'COMPLETED', 'FAILED'] as const;

  let materialCount = 0;
  let sliceCount = 0;

  for (const product of createdProducts) {
    // 每个商品创建 5-10 个素材
    const materialCountPerProduct = 5 + Math.floor(Math.random() * 6);

    for (let i = 0; i < materialCountPerProduct; i++) {
      const isVideo = Math.random() > 0.3;
      const materialType = isVideo ? materialTypes[1] : materialTypes[0];
      const status = materialStatuses[Math.floor(Math.random() * 2) + 2]; // 主要是 COMPLETED
      const duration = isVideo ? 5 + Math.random() * 25 : null;
      const slicesCount = isVideo ? 3 + Math.floor(Math.random() * 8) : 0;

      const material = await prisma.material.create({
        data: {
          productId: product.id,
          fileName: `${product.skuCode}_${Date.now()}_${i}.${isVideo ? 'mp4' : 'jpg'}`,
          type: materialType,
          sourceType: 'UPLOAD',
          originUrl: `http://localhost:9000/tikstream-assets/demo/materials/${product.skuCode}/${i}.${isVideo ? 'mp4' : 'jpg'}`,
          thumbnailUrl: `http://localhost:9000/tikstream-assets/demo/thumbnails/${product.skuCode}/${i}.jpg`,
          fileSizeBytes: BigInt(Math.floor(1000000 + Math.random() * 20000000)),
          durationSeconds: duration ? parseFloat(duration.toFixed(2)) : null,
          width: 1080 + Math.floor(Math.random() * 4) * 108,
          height: 1920,
          mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
          status,
          slicesCount,
          summary: `${product.title} 演示视频素材，${isVideo ? '包含多个精彩片段' : '高清产品图'}`,
          copyrightStatus: 'VERIFIED',
        },
      });
      materialCount++;

      // 创建切片数据
      if (isVideo && status === 'COMPLETED') {
        for (let s = 0; s < slicesCount; s++) {
          const startTime = s * 3;
          const sliceDuration = 2 + Math.random() * 4;

          await prisma.materialSlice.create({
            data: {
              materialId: material.id,
              sliceId: `${material.id.slice(0, 8)}_slice_${s}`,
              startTime: parseFloat(startTime.toFixed(2)),
              endTime: parseFloat((startTime + sliceDuration).toFixed(2)),
              duration: parseFloat(sliceDuration.toFixed(2)),
              denseCaption: generateRandomCaption(product.category),
              tags: generateRandomTags(product.category),
              productDimensionTags: generateProductTags(product.category),
              videoDimensionTags: generateVideoTags(),
              sliceDimensionTags: generateSliceTags(),
              streamUrl: `http://localhost:9000/tikstream-assets/demo/streams/${material.id}/slice_${s}.m3u8`,
              keyFrameUrl: `http://localhost:9000/tikstream-assets/demo/keyframes/${material.id}/slice_${s}.jpg`,
              embeddingVersion: 'v1.0',
              status: sliceStatuses[3], // COMPLETED
              usageCount: Math.floor(Math.random() * 50),
              lastUsedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
            },
          });
          sliceCount++;
        }
      }
    }
  }
  console.log(`✓ Created ${materialCount} materials and ${sliceCount} slices\n`);

  // ===========================================================================
  // 3. 爆款视频分析 (ViralVideoAnalysis)
  // ===========================================================================
  console.log('[3/12] Creating viral video analyses...');

  const viralAnalyses = [
    {
      productSku: 'BEA-001',
      sourcePlatform: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@skincare_expert/video/7350010000001',
      externalVideoId: 'viral-beauty-hydra-001',
      title: '【爆款揭秘】面膜使用前后对比，太惊艳了！',
      hookType: 'before_after',
      strategyJson: {
        opening_hook: '展示使用前干燥的肌肤状态',
        narrative_arc: ['BEFORE_STATE', 'PROBLEM_PAINT', 'PRODUCT_REVEAL', 'APPLICATION', 'AFTER_RESULT', 'CTA'],
        pacing: 'medium',
        emotional_trigger: 'transformation_curiosity',
        key_moments: [
          { timestamp: 0, action: 'BEFORE_STATE', importance: 'HIGH' },
          { timestamp: 3, action: 'PROBLEM_PAINT', importance: 'MEDIUM' },
          { timestamp: 6, action: 'PRODUCT_REVEAL', importance: 'HIGH' },
          { timestamp: 9, action: 'APPLICATION', importance: 'HIGH' },
          { timestamp: 12, action: 'AFTER_RESULT', importance: 'HIGH' },
          { timestamp: 14, action: 'CTA', importance: 'MEDIUM' },
        ],
        cta_placement: 'final_2_seconds',
      },
      factorJson: {
        optimalShotCount: 5,
        optimalTotalDuration: 14.5,
        cameraPatterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up'],
        bgmStyle: 'upbeat_pop',
        captionDensity: 0.9,
        hookRetentionBoost: 0.82,
      },
      reportJson: {
        retentionPeakSecond: 2,
        dropRiskSecond: 11,
        avgWatchTime: 12.8,
        engagementRate: 0.095,
        estimatedConversion: 0.042,
        successFactors: ['VISUAL_TRANSFORMATION', 'BEFORE_AFTER_CLEAR', 'AUTHENTIC_REACTION'],
      },
      sellingPoints: ['快速见效', '即时水润', '肌肤透亮'],
      shotsDecomposition: {
        total_shots: 5,
        avg_shot_duration: 2.9,
        transitions: ['dissolve', 'wipe', 'fade'],
      },
    },
    {
      productSku: 'FIT-001',
      sourcePlatform: 'douyin',
      sourceUrl: 'https://www.douyin.com/video/7350010000002',
      externalVideoId: 'viral-fitness-smart-001',
      title: '智能手环记录我一天的运动，数据太准了！',
      hookType: 'curiosity_data',
      strategyJson: {
        opening_hook: '展示手环记录的运动数据界面',
        narrative_arc: ['DATA_REVEAL', 'WORKOUT_START', 'REAL_TIME_TRACKING', 'RESULTS_SHOWCASE', 'CTA'],
        pacing: 'steady',
        emotional_trigger: 'data_curiosity',
        key_moments: [
          { timestamp: 0, action: 'DATA_REVEAL', importance: 'HIGH' },
          { timestamp: 4, action: 'WORKOUT_START', importance: 'MEDIUM' },
          { timestamp: 8, action: 'REAL_TIME_TRACKING', importance: 'HIGH' },
          { timestamp: 12, action: 'RESULTS_SHOWCASE', importance: 'HIGH' },
        ],
        cta_placement: 'final_3_seconds',
      },
      factorJson: {
        optimalShotCount: 4,
        optimalTotalDuration: 13.0,
        cameraPatterns: ['Static', 'Pan_Left'],
        bgmStyle: 'tech_upbeat',
        captionDensity: 1.1,
        hookRetentionBoost: 0.75,
      },
      reportJson: {
        retentionPeakSecond: 1,
        dropRiskSecond: 9,
        avgWatchTime: 10.5,
        engagementRate: 0.078,
        estimatedConversion: 0.035,
        successFactors: ['DATA_VISUALIZATION', 'REAL_TIME_FEEDBACK', 'HEALTH_FOCUS'],
      },
      sellingPoints: ['全方位监测', '数据精准', '续航持久'],
      shotsDecomposition: {
        total_shots: 4,
        avg_shot_duration: 3.25,
        transitions: ['none', 'fade'],
      },
    },
    {
      productSku: 'FOOD-002',
      sourcePlatform: 'xiaohongshu',
      sourceUrl: 'https://www.xiaohongshu.com/explore/7350010000003',
      externalVideoId: 'viral-food-spicy-001',
      title: '挑战嗦一碗超辣的螺蛳粉！吃到第三口直接破防...',
      hookType: 'challenge_reaction',
      strategyJson: {
        opening_hook: '超大特写螺蛳粉红油汤底',
        narrative_arc: ['FOOD_REVEAL', 'FIRST_BITE', 'REACTION_BUILD', 'FINAL_COMMENT', 'CTA'],
        pacing: 'fast',
        emotional_trigger: 'food_excitement',
        key_moments: [
          { timestamp: 0, action: 'FOOD_REVEAL', importance: 'HIGH' },
          { timestamp: 3, action: 'FIRST_BITE', importance: 'HIGH' },
          { timestamp: 7, action: 'REACTION_BUILD', importance: 'HIGH' },
          { timestamp: 12, action: 'FINAL_COMMENT', importance: 'MEDIUM' },
        ],
        cta_placement: 'soft_cta',
      },
      factorJson: {
        optimalShotCount: 5,
        optimalTotalDuration: 14.0,
        cameraPatterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up', 'Pan_Left'],
        bgmStyle: 'high_energy',
        captionDensity: 1.3,
        hookRetentionBoost: 0.88,
      },
      reportJson: {
        retentionPeakSecond: 0,
        dropRiskSecond: 10,
        avgWatchTime: 13.2,
        engagementRate: 0.12,
        estimatedConversion: 0.055,
        successFactors: ['FOOD_ASMR', 'GENUINE_REACTION', 'TRENDING_CHALLENGE'],
      },
      sellingPoints: ['辣得过瘾', '料足味正', '还原堂食'],
      shotsDecomposition: {
        total_shots: 5,
        avg_shot_duration: 2.8,
        transitions: ['wipe', 'dissolve'],
      },
    },
    {
      productSku: 'TECH-001',
      sourcePlatform: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@tech_reviewer/video/7350010000004',
      externalVideoId: 'viral-tech-earbuds-001',
      title: '把AirPods扔进洗衣机测试防水？结果出乎意料！',
      hookType: 'shock_stunt',
      strategyJson: {
        opening_hook: '耳机被扔进洗衣机的瞬间',
        narrative_arc: ['STUNT_REVEAL', 'MACHINE_RUN', 'SUSPENSE_BUILD', 'RESULT_REVEAL', 'SPECS_SHOWCASE', 'CTA'],
        pacing: 'dramatic',
        emotional_trigger: 'shock_curiosity',
        key_moments: [
          { timestamp: 0, action: 'STUNT_REVEAL', importance: 'HIGH' },
          { timestamp: 3, action: 'MACHINE_RUN', importance: 'MEDIUM' },
          { timestamp: 8, action: 'SUSPENSE_BUILD', importance: 'HIGH' },
          { timestamp: 11, action: 'RESULT_REVEAL', importance: 'HIGH' },
          { timestamp: 13, action: 'SPECS_SHOWCASE', importance: 'MEDIUM' },
        ],
        cta_placement: 'final_2_seconds',
      },
      factorJson: {
        optimalShotCount: 6,
        optimalTotalDuration: 14.5,
        cameraPatterns: ['Dolly_In_Fast', 'Static'],
        bgmStyle: 'tension_build',
        captionDensity: 0.7,
        hookRetentionBoost: 0.92,
      },
      reportJson: {
        retentionPeakSecond: 0,
        dropRiskSecond: 12,
        avgWatchTime: 14.0,
        engagementRate: 0.15,
        estimatedConversion: 0.048,
        successFactors: ['STUNT_HOOK', 'SHOCK_VALUE', 'PRODUCT_PROOF'],
      },
      sellingPoints: ['IPX5防水', '主动降噪', '音质纯净'],
      shotsDecomposition: {
        total_shots: 6,
        avg_shot_duration: 2.4,
        transitions: ['cut', 'fade'],
      },
    },
    {
      productSku: 'HOME-001',
      sourcePlatform: 'douyin',
      sourceUrl: 'https://www.douyin.com/video/7350010000005',
      externalVideoId: 'viral-home-aroma-001',
      title: '睡前用这个香薰机，室友说我整个人都治愈了',
      hookType: 'lifestyle_aspiration',
      strategyJson: {
        opening_hook: '柔和灯光下的香薰机特写',
        narrative_arc: ['AMBIANCE_REVEAL', 'MOMENT_CREATE', 'MOOD_BUILD', 'RESULT_FEELING', 'SOFT_CTA'],
        pacing: 'slow_aesthetic',
        emotional_trigger: 'relaxation_desire',
        key_moments: [
          { timestamp: 0, action: 'AMBIANCE_REVEAL', importance: 'HIGH' },
          { timestamp: 4, action: 'MOMENT_CREATE', importance: 'MEDIUM' },
          { timestamp: 9, action: 'MOOD_BUILD', importance: 'HIGH' },
          { timestamp: 13, action: 'RESULT_FEELING', importance: 'MEDIUM' },
        ],
        cta_placement: 'soft_cta',
      },
      factorJson: {
        optimalShotCount: 4,
        optimalTotalDuration: 14.0,
        cameraPatterns: ['Static', 'Dolly_Out', 'Tilt_Up'],
        bgmStyle: 'chill_ambient',
        captionDensity: 0.4,
        hookRetentionBoost: 0.68,
      },
      reportJson: {
        retentionPeakSecond: 3,
        dropRiskSecond: 8,
        avgWatchTime: 11.0,
        engagementRate: 0.062,
        estimatedConversion: 0.028,
        successFactors: ['AESTHETIC_VISUALS', 'MOOD_MATCHING', 'LIFESTYLE_ASPIRATION'],
      },
      sellingPoints: ['静音设计', '7色氛围灯', '8小时持久'],
      shotsDecomposition: {
        total_shots: 4,
        avg_shot_duration: 3.5,
        transitions: ['fade', 'dissolve'],
      },
    },
    {
      productSku: 'PET-001',
      sourcePlatform: 'xiaohongshu',
      sourceUrl: 'https://www.xiaohongshu.com/explore/7350010000006',
      externalVideoId: 'viral-pet-smart-001',
      title: '出差3天猫咪独自在家，这个猫砂盆让我全程放心！',
      hookType: 'solution_problem',
      strategyJson: {
        opening_hook: '展示空荡荡的家和焦急的猫咪',
        narrative_arc: ['PROBLEM_SETUP', 'SOLUTION_REVEAL', 'FEATURE_HIGHLIGHT', 'APP_SHOWCASE', 'PET_APPEAL', 'CTA'],
        pacing: 'emotional',
        emotional_trigger: 'pet_love',
        key_moments: [
          { timestamp: 0, action: 'PROBLEM_SETUP', importance: 'HIGH' },
          { timestamp: 3, action: 'SOLUTION_REVEAL', importance: 'HIGH' },
          { timestamp: 6, action: 'FEATURE_HIGHLIGHT', importance: 'MEDIUM' },
          { timestamp: 10, action: 'APP_SHOWCASE', importance: 'MEDIUM' },
          { timestamp: 13, action: 'PET_APPEAL', importance: 'HIGH' },
        ],
        cta_placement: 'end_cta',
      },
      factorJson: {
        optimalShotCount: 5,
        optimalTotalDuration: 14.0,
        cameraPatterns: ['Static', 'Pan_Left', 'Tilt_Up'],
        bgmStyle: 'warm_emotional',
        captionDensity: 0.8,
        hookRetentionBoost: 0.78,
      },
      reportJson: {
        retentionPeakSecond: 2,
        dropRiskSecond: 10,
        avgWatchTime: 12.3,
        engagementRate: 0.088,
        estimatedConversion: 0.038,
        successFactors: ['PET_CONTENT', 'PROBLEM_SOLUTION', 'TECH_CONVENIENCE'],
      },
      sellingPoints: ['自动除臭', '远程监控', '超低噪音'],
      shotsDecomposition: {
        total_shots: 5,
        avg_shot_duration: 2.8,
        transitions: ['dissolve', 'wipe'],
      },
    },
  ];

  for (const viralData of viralAnalyses) {
    const product = createdProducts.find((p) => p.skuCode === viralData.productSku);
    if (!product) continue;

    const existing = await prisma.viralVideoAnalysis.findFirst({
      where: { externalVideoId: viralData.externalVideoId },
    });

    const data = {
      productId: product.id,
      sourcePlatform: viralData.sourcePlatform,
      sourceUrl: viralData.sourceUrl,
      externalVideoId: viralData.externalVideoId,
      title: viralData.title,
      hookType: viralData.hookType,
      strategyJson: viralData.strategyJson,
      factorJson: viralData.factorJson,
      reportJson: viralData.reportJson,
      sellingPoints: viralData.sellingPoints,
      shotsDecomposition: viralData.shotsDecomposition,
      declaredPublicSource: true,
    };

    if (existing) {
      await prisma.viralVideoAnalysis.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.viralVideoAnalysis.create({ data });
    }
  }
  console.log(`✓ Created/updated ${viralAnalyses.length} viral video analyses\n`);

  // ===========================================================================
  // 4. 模板数据 (Template)
  // ===========================================================================
  console.log('[4/12] Creating templates...');

  const templates = [
    {
      name: '痛点放大-解决方案模板',
      category: 'product_demo',
      productSku: 'BEA-001',
      strategySummary: '前三秒通过痛点放大抓住用户注意力，中段展示产品如何解决该痛点，结尾给出明确CTA。',
      factorJson: {
        hook_type: 'PAIN_POINT',
        hook_duration_range: [2.0, 3.0],
        narrative_arc: ['HOOK_PAIN', 'EMOTIONAL_RESONANCE', 'PRODUCT_DEMO', 'PROOF', 'CTA'],
        emotional_curve: [0.9, 0.7, 0.85, 0.6, 1.0],
        pacing_score: 8,
        camera_pattern_weights: { Dolly_In_Fast: 0.3, Static: 0.4, Pan_Left: 0.2, Tilt_Up: 0.1 },
        shot_count_range: [4, 6],
        total_duration_target: 14.5,
        bgm_style: 'UPTEMPO_TRENDY',
        cta_placement: 'END',
      },
      status: 'ACTIVE' as const,
    },
    {
      name: '前后对比-转变冲击模板',
      category: 'comparison',
      productSku: 'BEA-001',
      strategySummary: '通过强烈的视觉对比展示产品效果，前三秒建立"之前"的痛点状态，中段展示转变过程。',
      factorJson: {
        hook_type: 'CONTRAST_REVEAL',
        hook_duration_range: [1.5, 2.5],
        narrative_arc: ['HOOK_BEFORE', 'PAIN_POINT', 'TRANSITION', 'AFTER_REVEAL', 'CTA'],
        emotional_curve: [0.7, 0.5, 0.6, 0.95, 1.0],
        pacing_score: 9,
        camera_pattern_weights: { Dolly_In_Fast: 0.4, Dolly_Out: 0.2, Static: 0.2, Tilt_Up: 0.2 },
        shot_count_range: [4, 5],
        total_duration_target: 13.0,
        bgm_style: 'TRANSFORMATION_BUILDUP',
        cta_placement: 'END',
      },
      status: 'ACTIVE' as const,
    },
    {
      name: '紧迫感促销模板',
      category: 'promo',
      productSku: 'FIT-001',
      strategySummary: '制造紧迫感，强调限时优惠力度。前三秒用价格钩子吸引注意，中段展示产品价值。',
      factorJson: {
        hook_type: 'PRICE_URGENCY',
        hook_duration_range: [1.0, 2.0],
        narrative_arc: ['HOOK_PRICE', 'VALUE_DEMO', 'BENEFIT_HIGHLIGHT', 'PRICE_REVEAL', 'URGENCY_CTA'],
        emotional_curve: [1.0, 0.6, 0.8, 0.9, 1.0],
        pacing_score: 10,
        camera_pattern_weights: { Dolly_In_Fast: 0.5, Static: 0.3, Pan_Left: 0.1, Tilt_Up: 0.1 },
        shot_count_range: [5, 6],
        total_duration_target: 14.0,
        bgm_style: 'HIGH_ENERGY_PROMO',
        cta_placement: 'END',
      },
      status: 'ACTIVE' as const,
    },
    {
      name: '真实体验-种草口碑模板',
      category: 'testimonial',
      productSku: 'FOOD-002',
      strategySummary: '模拟真实用户体验分享，建立信任感。前三秒以"亲测有效"开场，中段展示真实使用感受。',
      factorJson: {
        hook_type: 'SOCIAL_PROOF',
        hook_duration_range: [2.0, 3.0],
        narrative_arc: ['HOOK_RECOMMEND', 'PERSONAL_STORY', 'USAGE_DEMO', 'RESULT_SHARE', 'FOLLOW_CTA'],
        emotional_curve: [0.8, 0.9, 0.7, 0.85, 0.9],
        pacing_score: 7,
        camera_pattern_weights: { Static: 0.5, Pan_Left: 0.25, Dolly_In_Fast: 0.15, Tilt_Up: 0.1 },
        shot_count_range: [4, 5],
        total_duration_target: 14.0,
        bgm_style: 'WARM_LIFESTYLE',
        cta_placement: 'END',
      },
      status: 'ACTIVE' as const,
    },
    {
      name: '开箱惊喜-体验分享模板',
      category: 'unboxing',
      productSku: 'TECH-001',
      strategySummary: '模拟开箱体验，满足好奇心。前三秒展示包裹/包装吸引注意，中段逐步展示产品配件。',
      factorJson: {
        hook_type: 'CURIOSITY_BUILD',
        hook_duration_range: [2.0, 3.0],
        narrative_arc: ['HOOK_PACKAGE', 'UNBOXING_TENSION', 'PRODUCT_REVEAL', 'FULL_ASSEMBLY', 'FIRST_IMPRESSION'],
        emotional_curve: [0.8, 0.7, 0.9, 0.85, 0.9],
        pacing_score: 6,
        camera_pattern_weights: { Pan_Left: 0.3, Dolly_In_Fast: 0.3, Static: 0.2, Tilt_Up: 0.2 },
        shot_count_range: [5, 6],
        total_duration_target: 14.5,
        bgm_style: 'EXCITING_UNBOXING',
        cta_placement: 'END',
      },
      status: 'ACTIVE' as const,
    },
    {
      name: '生活场景植入模板',
      category: 'lifestyle',
      productSku: 'HOME-001',
      strategySummary: '将产品自然融入日常生活场景，展示使用效果和生活品质提升。',
      factorJson: {
        hook_type: 'LIFESTYLE_SCENE',
        hook_duration_range: [2.0, 3.5],
        narrative_arc: ['SCENE_SETUP', 'PRODUCT_INTEGRATION', 'BENEFIT_SHOWCASE', 'MOOD_BUILD', 'CTA'],
        emotional_curve: [0.75, 0.8, 0.85, 0.9, 0.85],
        pacing_score: 5,
        camera_pattern_weights: { Static: 0.45, Dolly_Out: 0.25, Tilt_Up: 0.2, Pan_Left: 0.1 },
        shot_count_range: [4, 5],
        total_duration_target: 14.0,
        bgm_style: 'CHILL_LIFESTYLE',
        cta_placement: 'SOFT_CTA',
      },
      status: 'ACTIVE' as const,
    },
    {
      name: '宠物治愈系模板',
      category: 'pet',
      productSku: 'PET-001',
      strategySummary: '以宠物为主角展示产品功能，结合萌宠内容和实用信息。',
      factorJson: {
        hook_type: 'PET_APPEAL',
        hook_duration_range: [1.5, 2.5],
        narrative_arc: ['PET_INTRO', 'PROBLEM_SETUP', 'PRODUCT_SOLUTION', 'PET_REACTION', 'CTA'],
        emotional_curve: [0.9, 0.7, 0.8, 0.95, 0.85],
        pacing_score: 7,
        camera_pattern_weights: { Static: 0.4, Tilt_Up: 0.3, Dolly_In_Fast: 0.2, Pan_Left: 0.1 },
        shot_count_range: [4, 5],
        total_duration_target: 14.0,
        bgm_style: 'CUTE_PLAYFUL',
        cta_placement: 'END',
      },
      status: 'ACTIVE' as const,
    },
  ];

  for (const templateData of templates) {
    const product = createdProducts.find((p) => p.skuCode === templateData.productSku);
    const existing = await prisma.template.findFirst({
      where: { name: templateData.name },
    });

    const data = {
      productId: product?.id,
      name: templateData.name,
      category: templateData.category,
      strategySummary: templateData.strategySummary,
      factorJson: templateData.factorJson,
      status: templateData.status,
    };

    if (existing) {
      await prisma.template.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.template.create({ data });
    }
  }
  console.log(`✓ Created/updated ${templates.length} templates\n`);

  // ===========================================================================
  // 5. 因子/策略/约束数据 (Factor/Strategy/Constraint)
  // ===========================================================================
  console.log('[5/12] Creating factors, strategies, and constraints...');

  const factors = [
    { key: 'hook_type', name: '开场钩子类型', category: 'NARRATIVE', defaultValue: 'PAIN_POINT', description: '视频开场使用的吸引用户注意力的方式' },
    { key: 'hook_duration', name: '开场时长', category: 'PARAMETER', defaultValue: 2.5, description: '开场钩子持续的时间(秒)' },
    { key: 'optimal_shot_count', name: '最佳镜头数', category: 'PARAMETER', defaultValue: 5, description: '视频应该包含的镜头数量' },
    { key: 'camera_patterns', name: '镜头运动模式', category: 'PARAMETER', defaultValue: ['Static', 'Dolly_In_Fast'], description: '使用的镜头运动类型' },
    { key: 'transition_preference', name: '转场偏好', category: 'PARAMETER', defaultValue: 'Dissolve', description: '镜头之间转场的方式' },
    { key: 'bgm_style', name: 'BGM风格', category: 'NARRATIVE', defaultValue: 'UPTEMPO_TRENDY', description: '背景音乐的风格类型' },
    { key: 'pacing_score', name: '节奏评分', category: 'PARAMETER', defaultValue: 7, description: '视频节奏紧凑程度(1-10)' },
    { key: 'cta_placement', name: 'CTA位置', category: 'NARRATIVE', defaultValue: 'END', description: '行动号召在视频中的位置' },
    { key: 'emotional_curve', name: '情感曲线', category: 'NARRATIVE', defaultValue: [0.8, 0.6, 0.8, 0.7, 1.0], description: '视频各阶段的情感强度变化' },
    { key: 'narrative_arc', name: '叙事弧线', category: 'NARRATIVE', defaultValue: ['HOOK', 'PROBLEM', 'SOLUTION', 'PROOF', 'CTA'], description: '视频叙事的结构框架' },
  ];

  for (const factor of factors) {
    await prisma.factor.upsert({
      where: { key: factor.key },
      update: factor,
      create: factor,
    });
  }
  console.log(`✓ Created/updated ${factors.length} factors`);

  const strategies = [
    { key: 'pain_point_amplify', name: '痛点放大策略', category: 'narrative', summary: '通过强调用户痛点引发共鸣，然后展示产品解决方案', description: '适合功能性产品，突出产品核心价值' },
    { key: 'before_after_transformation', name: '前后对比策略', category: 'visual', summary: '使用强烈的视觉对比展示产品效果', description: '适合美容、健身类产品' },
    { key: 'urgency_promo', name: '紧迫感促销策略', category: 'conversion', summary: '通过限时优惠等方式制造购买紧迫感', description: '适合电商大促场景' },
    { key: 'social_proof', name: '社会认同策略', category: 'trust', summary: '通过用户评价、销量数据等建立信任', description: '适合需要建立信任感的产品' },
    { key: 'lifestyle_integration', name: '生活场景植入策略', category: 'aspiration', summary: '将产品自然融入目标用户的生活场景', description: '适合提升生活品质类产品' },
    { key: 'curiosity_hook', name: '好奇心钩子策略', category: 'engagement', summary: '通过悬念或问题引发用户好奇心', description: '适合科技类产品' },
    { key: 'pet_appeal', name: '萌宠吸引策略', category: 'emotional', summary: '以宠物为主角引发情感共鸣', description: '适合宠物相关产品' },
  ];

  for (const strategy of strategies) {
    await prisma.strategy.upsert({
      where: { key: strategy.key },
      update: strategy,
      create: strategy,
    });
  }
  console.log(`✓ Created/updated ${strategies.length} strategies`);

  const constraints = [
    { key: 'max_duration', name: '最大时长约束', category: 'time', ruleType: 'HARD', ruleConfig: { max_seconds: 15, unit: 'seconds' }, description: '视频总时长不能超过15秒' },
    { key: 'min_shot_count', name: '最小镜头数约束', category: 'structure', ruleType: 'SOFT', ruleConfig: { min_shots: 4, unit: 'shots' }, description: '建议至少包含4个镜头' },
    { key: 'cta_required', name: 'CTA必须约束', category: 'conversion', ruleType: 'HARD', ruleConfig: { required: true, position: 'last_3_seconds' }, description: '视频必须包含明确的行动号召' },
    { key: 'copyright_check', name: '版权检查约束', category: 'compliance', ruleType: 'HARD', ruleConfig: { check_bgm: true, check_video: true }, description: 'BGM和视频素材必须无版权问题' },
    { key: 'sensitive_words', name: '敏感词过滤约束', category: 'compliance', ruleType: 'HARD', ruleConfig: { enabled: true, categories: ['politics', 'medical', 'financial'] }, description: '禁止出现敏感词' },
    { key: 'aspect_ratio', name: '画幅比例约束', category: 'format', ruleType: 'HARD', ruleConfig: { ratio: '9:16', unit: 'aspect' }, description: '必须使用9:16竖版画幅' },
  ];

  for (const constraint of constraints) {
    await prisma.constraint.upsert({
      where: { key: constraint.key },
      update: constraint,
      create: constraint,
    });
  }
  console.log(`✓ Created/updated ${constraints.length} constraints\n`);

  // ===========================================================================
  // 6. 剧本数据 (Script & ScriptShot)
  // ===========================================================================
  console.log('[6/12] Creating scripts and shots...');

  const allTemplates = await prisma.template.findMany();
  const allViralAnalyses = await prisma.viralVideoAnalysis.findMany();

  const scriptData = [
    { productSku: 'BEA-001', title: '玻尿酸面膜15秒带货脚本', generationMode: 'PROMPT_DRIVEN' as const, styleVibe: 'fresh' },
    { productSku: 'BEA-001', title: '防蓝光精华液种草脚本', generationMode: 'TEMPLATE_DRIVEN' as const, styleVibe: 'professional' },
    { productSku: 'FIT-001', title: '智能手环开箱脚本', generationMode: 'VIRAL_REWRITE' as const, styleVibe: 'tech' },
    { productSku: 'FOOD-002', title: '螺蛳粉挑战脚本', generationMode: 'HYBRID' as const, styleVibe: 'fun' },
    { productSku: 'HOME-001', title: '香薰机生活场景脚本', generationMode: 'TEMPLATE_DRIVEN' as const, styleVibe: 'zen' },
    { productSku: 'PET-001', title: '智能猫砂盆测评脚本', generationMode: 'PROMPT_DRIVEN' as const, styleVibe: 'caring' },
    { productSku: 'TECH-001', title: '蓝牙耳机防水测试脚本', generationMode: 'VIRAL_REWRITE' as const, styleVibe: 'shock' },
    { productSku: 'FIT-002', title: '阻力带居家健身脚本', generationMode: 'TEMPLATE_DRIVEN' as const, styleVibe: 'energetic' },
  ];

  for (const scriptInfo of scriptData) {
    const product = createdProducts.find((p) => p.skuCode === scriptInfo.productSku);
    if (!product) continue;

    const template = allTemplates[Math.floor(Math.random() * allTemplates.length)];
    const viral = allViralAnalyses[Math.floor(Math.random() * allViralAnalyses.length)];

    const shots = generateScriptShots(5);

    const script = await prisma.script.create({
      data: {
        productId: product.id,
        title: scriptInfo.title,
        language: 'zh-CN',
        targetAudience: product.targetAudience || '通用人群',
        videoDuration: parseFloat((12 + Math.random() * 3).toFixed(2)),
        aspectRatio: 'NINE_SIXTEEN',
        styleVibe: scriptInfo.styleVibe,
        generationMode: scriptInfo.generationMode,
        templateId: template?.id,
        viralVideoId: viral?.id,
        constraintList: [
          { key: 'max_duration', value: 15 },
          { key: 'min_shot_count', value: 4 },
        ],
        preferences: {
          preferredCamera: 'Dolly_In_Fast',
          preferredBGM: 'upbeat',
          subtitleStyle: 'bold',
        },
        rawJson: {
          scenes: shots.map((s, i) => ({
            index: i,
            description: s.sceneDescriptionQuery,
            duration: parseFloat(s.duration.toString()),
          })),
        },
        predictedCtr: 0.05 + Math.random() * 0.08,
        predictedCvr: 0.02 + Math.random() * 0.05,
        predictedRetention: 0.6 + Math.random() * 0.35,
        predictedAt: new Date(),
        predictionModel: 'ctr-v2',
      },
    });

    // 创建镜头数据
    for (const shot of shots) {
      await prisma.scriptShot.create({
        data: {
          scriptId: script.id,
          shotIndex: shot.shotIndex,
          duration: shot.duration,
          sceneDescriptionQuery: shot.sceneDescriptionQuery,
          visualDescription: shot.visualDescription,
          cameraMovement: shot.cameraMovement,
          transitionType: shot.transitionType,
          voiceoverText: shot.voiceoverText,
          subtitleText: shot.subtitleText,
          safeZoneBoundingBox: { x: 0, y: 0, width: 1080, height: 1920 },
          localFactorPatch: {},
          bgmSegment: {
            startTime: 0,
            endTime: 14,
            volume: 0.7,
          },
          complianceStatus: 'PASSED',
        },
      });
    }

    // 创建剧本版本
    await prisma.scriptVersion.create({
      data: {
        scriptId: script.id,
        versionNumber: 1,
        snapshot: { shots: shots.length, createdAt: new Date().toISOString() },
        triggerAction: 'INITIAL_CREATE',
      },
    });
  }
  console.log(`✓ Created ${scriptData.length} scripts with shots\n`);

  // ===========================================================================
  // 7. 创作数据 (Creation & ShotRender)
  // ===========================================================================
  console.log('[7/12] Creating creations and shot renders...');

  const allScripts = await prisma.script.findMany();
  const creationStatuses = ['PENDING', 'PROCESSING', 'FINISHED', 'FAILED'] as const;
  const creationStages = ['QUEUE_ALLOCATION', 'ASSET_MATCHING', 'AI_VIDEO_GENERATING', 'TTS_GENERATING', 'FFMPEG_STITCHING', 'ORIGINALITY_CHECK', 'FINISHED'] as const;

  let creationCount = 0;

  for (const script of allScripts) {
    const status = Math.random() > 0.2 ? 'FINISHED' : creationStatuses[Math.floor(Math.random() * 4)];
    const currentStage = status === 'FINISHED' ? 'FINISHED' : creationStages[Math.floor(Math.random() * 5)];
    const progress = status === 'FINISHED' ? 100 : Math.floor(Math.random() * 90);

    const creation = await prisma.creation.create({
      data: {
        productId: script.productId!,
        scriptId: script.id,
        taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        engineMode: 'SCRIPT_DRIVEN',
        targetResolution: '1080x1920',
        exportFormat: 'MP4',
        status,
        progress,
        currentStage,
        videoUrl: status === 'FINISHED' ? `http://localhost:9000/tikstream-assets/demo/videos/${script.id}.mp4` : null,
        fileSizeBytes: status === 'FINISHED' ? BigInt(Math.floor(5000000 + Math.random() * 15000000)) : null,
        preferAiVideo: Math.random() > 0.5,
        watermarkConfig: {
          enabled: true,
          position: 'bottom-right',
          opacity: 0.3,
        },
        startedAt: status !== 'PENDING' ? new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000) : null,
        finishedAt: status === 'FINISHED' ? new Date() : null,
      },
    });
    creationCount++;

    // 创建镜头渲染记录
    const shots = await prisma.scriptShot.findMany({
      where: { scriptId: script.id },
    });

    for (const shot of shots) {
      const shotStatus = status === 'FINISHED' ? 'FINISHED' : (Math.random() > 0.9 ? 'FAILED' : 'PROCESSING');
      await prisma.shotRender.create({
        data: {
          creationId: creation.id,
          scriptShotId: shot.id,
          shotIndex: shot.shotIndex,
          cacheHash: `hash_${Math.random().toString(36).slice(2, 10)}`,
          renderPath: shotStatus === 'FINISHED' ? `/renders/${creation.id}/shot_${shot.shotIndex}.mp4` : null,
          renderDurationMs: shotStatus === 'FINISHED' ? Math.floor(3000 + Math.random() * 5000) : null,
          retryCount: Math.floor(Math.random() * 3),
          status: shotStatus,
        },
      });
    }

    // 原创度检查
    if (status === 'FINISHED') {
      await prisma.originalityCheck.create({
        data: {
          creationId: creation.id,
          scoreBefore: parseFloat((0.5 + Math.random() * 0.45).toFixed(3)),
          scoreAfter: parseFloat((0.7 + Math.random() * 0.28).toFixed(3)),
          similarVideos: generateSimilarVideos(),
          duplicateSections: [],
          optimizationSuggestions: [
            '建议增加画面元素多样性',
            '可尝试不同的转场效果',
          ],
          status: 'PASSED',
        },
      });
    }
  }
  console.log(`✓ Created ${creationCount} creations with shot renders\n`);

  // ===========================================================================
  // 8. 趋势快照数据 (TrendSnapshot)
  // ===========================================================================
  console.log('[8/12] Creating trend snapshots...');

  for (const product of createdProducts.slice(0, 5)) {
    const trends = [
      { topic: '护肤routine', heat: 85, trend: 'rising' },
      { topic: '早C晚A', heat: 72, trend: 'stable' },
      { topic: '成分党', heat: 68, trend: 'rising' },
      { topic: '平价替代', heat: 65, trend: 'stable' },
    ];

    await prisma.trendSnapshot.create({
      data: {
        productId: product.id,
        trendsJson: {
          current: trends,
          predicted: trends.map((t) => ({ ...t, heat: t.heat + 10 })),
        },
        recommendationsJson: {
          hooks: ['before_after', 'ingredient_explain', 'user_review'],
          bgm: ['upbeat_pop', 'relaxing_asmr'],
          duration: '12-15s',
        },
        generatedBy: 'AI',
        ttlSeconds: 3600,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }
  console.log(`✓ Created trend snapshots for ${createdProducts.slice(0, 5).length} products\n`);

  // ===========================================================================
  // 9. 评论数据 (Comment & CommentAnalysis)
  // ===========================================================================
  console.log('[9/12] Creating comments and analysis...');

  const commentTemplates = {
    beauty: [
      '用了之后皮肤真的变好了，会回购！',
      '包装很高档，送人很合适',
      '效果一般，可能不适合我的肤质',
      '性价比超高，这个价格能买到这个品质很值',
      '质地很清爽，不会油腻',
      '味道很好闻，淡淡的香味',
      '使用方便，懒人友好',
    ],
    fitness: [
      '数据很准，和专业设备对比过',
      '续航真的强，充一次电用了一个月',
      'App体验一般，希望能优化',
      '佩戴舒适，戴一整天也不累',
      '外观好看，颜值党满意',
      '操作简单，上手就会',
    ],
    food: [
      '味道绝了，根本停不下来',
      '包装用心，到货没有任何破损',
      '性价比超高，大包装超划算',
      '口感偏甜，不太适合我',
      '配料表很干净，成分党放心',
      '物流超快，第二天就到了',
    ],
    tech: [
      '降噪效果超出预期，地铁上也能安静听歌',
      '音质很棒，低音效果震撼',
      '连接稳定，没有断联过',
      '做工精致，细节处理很好',
      '电池续航有点虚，实际使用时间比宣传短',
      '佩戴舒适度一般，耳朵有点疼',
    ],
  };

  const sentiments = ['positive', 'neutral', 'negative'];

  for (const product of createdProducts.slice(0, 6)) {
    const commentsCount = 5 + Math.floor(Math.random() * 10);
    const categoryComments = commentTemplates[product.category as keyof typeof commentTemplates] || commentTemplates.beauty;

    for (let i = 0; i < commentsCount; i++) {
      const content = categoryComments[Math.floor(Math.random() * categoryComments.length)];
      const sentiment = sentiments[Math.floor(Math.random() * 3)];

      const comment = await prisma.comment.create({
        data: {
          productId: product.id,
          platform: Math.random() > 0.5 ? 'tiktok' : 'douyin',
          externalId: `ext_${Date.now()}_${i}_${product.skuCode}`,
          videoUrl: `https://example.com/videos/${Math.random().toString(36).slice(2, 10)}`,
          authorName: `用户${Math.floor(1000 + Math.random() * 9000)}`,
          content,
          likeCount: Math.floor(Math.random() * 5000),
          replyCount: Math.floor(Math.random() * 200),
          commentedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        },
      });

      // 评论分析
      await prisma.commentAnalysis.create({
        data: {
          commentId: comment.id,
          sentiment,
          keyTopics: generateKeyTopics(sentiment),
          painPoints: sentiment === 'negative' ? ['效果不明显', '价格偏高'] : [],
          featureRequests: sentiment === 'neutral' ? ['希望增加容量', '建议推出新口味'] : [],
          purchasingIntent: sentiment === 'positive' ? 0.8 + Math.random() * 0.2 : sentiment === 'neutral' ? 0.3 + Math.random() * 0.3 : Math.random() * 0.2,
          rawAnalysis: {
            keywords: content.slice(0, 10).split(''),
            emotionScore: sentiment === 'positive' ? 0.85 : sentiment === 'neutral' ? 0.5 : 0.2,
          },
          confidence: 0.7 + Math.random() * 0.3,
          modelUsed: 'sentiment-v3',
        },
      });
    }
  }
  console.log(`✓ Created comments and analysis for ${createdProducts.slice(0, 6).length} products\n`);

  // ===========================================================================
  // 10. DNA模式数据 (DnaPattern)
  // ===========================================================================
  console.log('[10/12] Creating DNA patterns...');

  const dnaPatterns = [
    {
      productCategory: 'beauty',
      market: 'GLOBAL',
      dnaJson: {
        dominantHookTypes: ['before_after', 'transformation', 'ingredient_focus'],
        avgOptimalDuration: 14.5,
        winningCameraPatterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up'],
        winningBGMStyles: ['upbeat_pop', 'chill_asmr', 'emotional_acoustic'],
        commonNarrativeArcs: ['problem_solution', 'transformation', 'social_proof'],
        avgShotCount: 5,
        ctaStyles: ['buy_now', 'link_in_bio', 'swipe_up'],
      },
      sampleCount: 156,
      confidence: 0.89,
    },
    {
      productCategory: 'fitness',
      market: 'GLOBAL',
      dnaJson: {
        dominantHookTypes: ['challenge', 'before_after', 'data_proof'],
        avgOptimalDuration: 13.5,
        winningCameraPatterns: ['Static', 'Dolly_In_Fast', 'Pan_Left'],
        winningBGMStyles: ['high_energy', 'workout_beat', 'motivation_speech'],
        commonNarrativeArcs: ['challenge_complete', 'progress_tracking', 'result_proof'],
        avgShotCount: 4,
        ctaStyles: ['shop_now', 'link_below', 'tap_to_buy'],
      },
      sampleCount: 89,
      confidence: 0.82,
    },
    {
      productCategory: 'food',
      market: 'CN',
      dnaJson: {
        dominantHookTypes: ['asmr_eating', 'reaction', 'taste_test'],
        avgOptimalDuration: 14.0,
        winningCameraPatterns: ['Dolly_In_Fast', 'Static', 'Macro_Close'],
        winningBGMStyles: ['satisfying_asmr', 'upbeat_fun', 'food_tension'],
        commonNarrativeArcs: ['flavor_reveal', 'eating_reaction', 'compare_contrast'],
        avgShotCount: 5,
        ctaStyles: ['buy_link', 'comment_996', 'save_for_later'],
      },
      sampleCount: 234,
      confidence: 0.92,
    },
    {
      productCategory: 'tech',
      market: 'GLOBAL',
      dnaJson: {
        dominantHookTypes: ['stunt_test', 'unboxing', 'feature_reveal'],
        avgOptimalDuration: 14.0,
        winningCameraPatterns: ['Static', 'Pan_Left', 'Dolly_In_Fast'],
        winningBGMStyles: ['tech_upbeat', 'tension_build', 'reveal_impact'],
        commonNarrativeArcs: ['problem_solution', 'feature_demo', 'comparison'],
        avgShotCount: 5,
        ctaStyles: ['shop_link', 'description_link', 'tap_to_learn'],
      },
      sampleCount: 112,
      confidence: 0.86,
    },
  ];

  for (const pattern of dnaPatterns) {
    await prisma.dnaPattern.create({
      data: pattern,
    });
  }
  console.log(`✓ Created ${dnaPatterns.length} DNA patterns\n`);

  // ===========================================================================
  // 11. A/B测试会话数据 (AutoAbSession)
  // ===========================================================================
  console.log('[11/12] Creating A/B test sessions...');

  const abSessions = [
    {
      variantConfigs: {
        A: { hookDuration: 2.0, shotCount: 4, bgmStyle: 'upbeat' },
        B: { hookDuration: 3.0, shotCount: 5, bgmStyle: 'chill' },
        C: { hookDuration: 2.5, shotCount: 4, bgmStyle: 'dramatic' },
      },
      status: 'COMPLETED',
      progress: 1.0,
    },
    {
      variantConfigs: {
        A: { ctaStyle: 'direct', ctaPlacement: 'END' },
        B: { ctaStyle: 'soft', ctaPlacement: 'MIDDLE' },
      },
      status: 'PROCESSING',
      progress: 0.65,
    },
    {
      variantConfigs: {
        A: { cameraPattern: 'Dolly_In_Fast', transition: 'dissolve' },
        B: { cameraPattern: 'Static', transition: 'fade' },
        C: { cameraPattern: 'Tilt_Up', transition: 'wipe' },
      },
      status: 'PENDING',
      progress: 0,
    },
  ];

  for (let i = 0; i < abSessions.length; i++) {
    const script = allScripts[i % allScripts.length];
    await prisma.autoAbSession.create({
      data: {
        baseScriptId: script.id,
        status: abSessions[i].status,
        variantConfigs: abSessions[i].variantConfigs,
        progress: abSessions[i].progress,
        resultJson: abSessions[i].status === 'COMPLETED' ? {
          variantA: { ctr: 0.065, cvr: 0.032, retention: 0.78 },
          variantB: { ctr: 0.072, cvr: 0.038, retention: 0.82 },
          variantC: { ctr: 0.058, cvr: 0.028, retention: 0.71 },
          winner: 'variantB',
        } : null,
        completedAt: abSessions[i].status === 'COMPLETED' ? new Date() : null,
      },
    });
  }
  console.log(`✓ Created ${abSessions.length} A/B test sessions\n`);

  // ===========================================================================
  // 12. 搜索日志数据 (UserSearchLog)
  // ===========================================================================
  console.log('[12/12] Creating user search logs...');

  const searchQueries = [
    '保湿面膜推荐',
    '运动手环 续航',
    '好吃的零食',
    '香薰机 静音',
    '猫砂盆 自动',
    '蓝牙耳机 降噪',
    '螺蛳粉 辣',
    '健身器材 家用',
    '护肤品 成分',
    '科技好物 开箱',
    '护肤技巧',
    '健身计划',
    '美食推荐',
    '家居好物',
    '数码测评',
  ];

  for (let i = 0; i < 100; i++) {
    await prisma.userSearchLog.create({
      data: {
        query: searchQueries[Math.floor(Math.random() * searchQueries.length)],
        userId: `user_${Math.floor(Math.random() * 100)}`,
        source: Math.random() > 0.3 ? 'material_search' : 'script_search',
        hitCount: Math.floor(Math.random() * 20),
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log(`✓ Created 100 search logs\n`);

  // ===========================================================================
  // 完成
  // ===========================================================================
  console.log('========================================');
  console.log('Comprehensive Seed Data Complete!');
  console.log('========================================');
  console.log(`
  数据统计:
  - ${createdProducts.length} 个商品
  - ${materialCount} 个素材
  - ${sliceCount} 个素材切片
  - ${viralAnalyses.length} 个爆款视频分析
  - ${templates.length} 个模板
  - ${factors.length} 个因子
  - ${strategies.length} 个策略
  - ${constraints.length} 个约束
  - ${scriptData.length} 个剧本
  - ${creationCount} 个创作
  - 5 个趋势快照
  - 评论分析数据
  - ${dnaPatterns.length} 个DNA模式
  - ${abSessions.length} 个A/B测试会话
  - 100 条搜索日志
  `);
}

//辅助函数
function generateRandomCaption(category: string): string {
  const captions: Record<string, string[]> = {
    beauty: ['水润透亮质感', '轻柔涂抹体验', '肌肤吸收瞬间', '包装设计精美'],
    fitness: ['实时数据监测', '运动状态记录', '健身动作指导', '体能数据展示'],
    food: ['开袋香气扑鼻', '口感酥脆可口', '色泽诱人金黄', '配料丰富实在'],
    tech: ['精密做工展示', '功能按键操作', '连接配对过程', '音质效果体验'],
    home: ['温馨氛围营造', '静音运行状态', '氛围灯光展示', '使用场景还原'],
    pet: ['猫咪好奇探索', '舒适休息状态', '进食过程记录', '玩耍互动时刻'],
  };
  const categoryCabs = captions[category] || captions.beauty;
  return categoryCabs[Math.floor(Math.random() * categoryCabs.length)];
}

function generateRandomTags(category: string): string[] {
  const tagSets: Record<string, string[][]> = {
    beauty: [['护肤', '保湿'], ['测评', '推荐'], ['素颜', '对比']],
    fitness: [['运动', '健身'], ['数据', '监测'], ['装备', '开箱']],
    food: [['美食', '零食'], ['测评', '试吃'], ['开袋', '分享']],
    tech: [['数码', '测评'], ['开箱', '体验'], ['功能', '介绍']],
  };
  const sets = tagSets[category] || tagSets.beauty;
  return sets[Math.floor(Math.random() * sets.length)];
}

function generateProductTags(category: string): string[] {
  const tags: Record<string, string[]> = {
    beauty: ['功效', '成分', '肤感', '包装'],
    fitness: ['功能', '数据', '续航', '佩戴'],
    food: ['口味', '口感', '配料', '包装'],
    tech: ['功能', '音质', '续航', '设计'],
    home: ['功能', '容量', '噪音', '外观'],
    pet: ['功能', '容量', '清洁', '安全'],
  };
  return tags[category] || tags.beauty;
}

function generateVideoTags(): string[] {
  const allTags = ['开场', '特写', '使用', '效果', '结尾', '转场', '高潮', '铺垫'];
  return allTags.slice(0, 2 + Math.floor(Math.random() * 3));
}

function generateSliceTags(): string[] {
  const allTags = ['高光', '关键', '过渡', '核心', '补充'];
  return allTags.slice(0, 1 + Math.floor(Math.random() * 3));
}

function generateScriptShots(count: number) {
  const cameraMovements = ['Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up'] as const;
  const transitionTypes = ['None', 'Fade_In', 'Dissolve', 'Wipe'] as const;

  return Array.from({ length: count }, (_, i) => ({
    shotIndex: i,
    duration: parseFloat((2 + Math.random() * 2).toFixed(2)),
    sceneDescriptionQuery: `场景${i + 1}描述查询`,
    visualDescription: `视觉描述：${['产品特写', '使用场景', '效果展示', '对比画面', '总结号召'][i % 5]}`,
    cameraMovement: cameraMovements[Math.floor(Math.random() * cameraMovements.length)],
    transitionType: transitionTypes[Math.floor(Math.random() * transitionTypes.length)],
    voiceoverText: `旁白文案${i + 1}：${['强调产品核心卖点', '展示使用效果', '建立情感共鸣', '引导购买决策', '强化行动号召'][i % 5]}`,
    subtitleText: `字幕文字${i + 1}`,
  }));
}

function generateKeyTopics(sentiment: string): string[] {
  const positiveTopics = ['效果好', '性价比', '品质优', '回购', '推荐'];
  const neutralTopics = ['使用体验', '包装设计', '物流速度', '客服服务'];
  const negativeTopics = ['效果一般', '性价比低', '有异味', '不符合预期'];

  if (sentiment === 'positive') return positiveTopics.slice(0, 2 + Math.floor(Math.random() * 3));
  if (sentiment === 'negative') return negativeTopics.slice(0, 1 + Math.floor(Math.random() * 2));
  return neutralTopics.slice(0, 2 + Math.floor(Math.random() * 2));
}

function generateSimilarVideos(): object[] {
  return Array.from({ length: 2 + Math.floor(Math.random() * 3) }, (_, _i) => ({
    videoId: `similar_${Math.random().toString(36).slice(2, 10)}`,
    similarity: parseFloat((0.6 + Math.random() * 0.35).toFixed(3)),
    matchedSections: ['opening_hook', 'cta_placement'],
  }));
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed process completed.');
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error('Seed failed:', error);
    process.exit(1);
  });