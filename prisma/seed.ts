import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
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
      coverImageUrl: '/api/v1/demo/ecom-product-skincare.jpg',
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
      coverImageUrl: '/api/v1/demo/ecom-product-skincare.jpg',
    },
  });

  const existingTemplate = await prisma.template.findFirst({
    where: { name: 'TikStream 快速带货演示模板' },
  });

  const templateData = {
    productId: product.id,
    name: 'TikStream 快速带货演示模板',
    category: 'promo',
    strategySummary: '前三秒以强视觉钩子展示痛点，中段用真实使用场景解释核心卖点，结尾给出清晰行动号召。',
    factorJson: {
      optimal_shot_count: 5,
      optimal_total_duration: 14.5,
      camera_patterns: ['Dolly_In_Fast', 'Static', 'Pan_Left'],
      transition_preference: 'Dissolve',
      bgm_style: 'upbeat-electronic',
      cta_placement: 'last_2_seconds',
    },
    schemaJson: {
      required_fields: ['scene_description_query', 'visual_description', 'voiceover_text', 'subtitle_text'],
      max_total_duration_seconds: 15,
    },
    status: 'ACTIVE' as const,
  };

  if (existingTemplate) {
    await prisma.template.update({
      where: { id: existingTemplate.id },
      data: templateData,
    });
  } else {
    await prisma.template.create({ data: templateData });
  }

  const viralWhere = {
    sourcePlatform: 'tiktok',
    externalVideoId: 'demo-viral-video-001',
  };
  const existingViralAnalysis = await prisma.viralVideoAnalysis.findFirst({
    where: viralWhere,
  });

  const viralData = {
    productId: product.id,
    sourcePlatform: 'tiktok',
    sourceUrl: 'https://www.tiktok.com/@tikstream_demo/video/7350000000000000001',
    externalVideoId: 'demo-viral-video-001',
    title: 'TikStream 爆款结构演示视频',
    hookType: 'visual_contrast',
    strategyJson: {
      opening_hook: '快速展示使用前后对比',
      narrative_arc: ['pain_point', 'product_demo', 'social_proof', 'cta'],
      pacing: 'fast_cut',
    },
    factorJson: {
      optimalShotCount: 5,
      cameraPatterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up'],
      bgmStyle: 'high_energy_pop',
      ctaTiming: 'final_two_seconds',
    },
    reportJson: {
      retention_peak_second: 3,
      drop_risk_second: 11,
      recommendation: '保持前三秒强对比，结尾压缩CTA文案。',
    },
    declaredPublicSource: true,
  };

  if (existingViralAnalysis) {
    await prisma.viralVideoAnalysis.update({
      where: { id: existingViralAnalysis.id },
      data: viralData,
    });
  } else {
    await prisma.viralVideoAnalysis.create({ data: viralData });
  }
}

main()
  .then(async () => {
    // 全量模板体系种子数据
    try {
      const { seedTemplates } = await import('./seed-templates');
      await seedTemplates();
    } catch (err) {
      console.warn('⚠ 模板种子数据写入跳过（可能文件未编译）:', (err as Error).message);
    }
    await prisma.$disconnect();
    console.log('TikStream AI seed data initialized.');
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error('TikStream AI seed failed.', error);
    process.exit(1);
  });
