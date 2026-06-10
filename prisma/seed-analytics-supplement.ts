// =============================================================================
// TikStream AI — Analytics Mock Data Supplement
// 为"电脑"和"TikStream 演示商品"补充 Creation + ShotRender + OriginalityCheck
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min: number, max: number, decimals = 2): number {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randomInt(8, 22), randomInt(0, 59), randomInt(0, 59));
  return d;
}

// ===========================================================================
// 主逻辑
// ===========================================================================

async function main(): Promise<void> {
  console.log('========================================');
  console.log('TikStream AI — Analytics Supplement Seed');
  console.log('========================================\n');

  // =========================================================================
  // 获取需要补充的商品
  // =========================================================================
  const demoProduct = await prisma.product.findFirst({ where: { title: 'TikStream 演示商品' } });
  const pcProduct = await prisma.product.findFirst({ where: { title: '电脑' } });

  if (!demoProduct) {
    console.log('  ⚠ TikStream 演示商品 不存在，跳过');
  }
  if (!pcProduct) {
    console.log('  ⚠ 电脑 不存在，跳过');
  }

  let totalCreations = 0;
  let totalRenders = 0;
  let totalChecks = 0;

  // =========================================================================
  // 处理函数：为指定商品的脚本创建 Creation 数据
  // =========================================================================
  async function seedProduct(
    productId: string,
    productTitle: string,
    scriptCount: number,     // 使用几个剧本
    creationsPerScript: number,
  ): Promise<void> {
    console.log(`\n--- Seeding: ${productTitle} ---`);

    // 获取该商品的脚本及其分镜
    const scripts = await prisma.script.findMany({
      where: { productId },
      take: scriptCount,
      orderBy: { createdAt: 'desc' },
      include: {
        shots: {
          orderBy: { shotIndex: 'asc' },
          select: { id: true, shotIndex: true },
        },
      },
    });

    if (scripts.length === 0) {
      console.log(`  ⚠ 无可用剧本`);
      return;
    }

    console.log(`  使用 ${scripts.length} 个剧本`);

    for (const script of scripts) {
      const shotIds = script.shots.map((s) => s.id);
      if (shotIds.length === 0) {
        console.log(`  ⚠ 剧本 ${script.title.slice(0, 20)} 无分镜，跳过`);
        continue;
      }

      for (let ci = 0; ci < creationsPerScript; ci++) {
        const creationId = randomUUID();
        
        // Status distribution: 3 FINISHED : 1 PROCESSING : 1 FAILED
        const statusRoll = randomInt(1, 5);
        const status = statusRoll <= 3 ? 'FINISHED' : statusRoll === 4 ? 'PROCESSING' : 'FAILED';
        const isFinished = status === 'FINISHED';
        const isProcessing = status === 'PROCESSING';

        const createdAt = daysAgo(randomInt(3, 55));
        const startedAt = new Date(createdAt.getTime() + randomInt(1, 5) * 60000);
        const finishedAt = isFinished
          ? new Date(startedAt.getTime() + randomInt(2, 10) * 60000)
          : null;

        const progress = isFinished ? 100 : isProcessing ? randomInt(30, 75) : randomInt(5, 20);
        const errorCode = status === 'FAILED' ? pick(['TTS_TIMEOUT', 'RENDER_FAILED', 'STITCH_ERROR']) : null;
        const errorMessage = status === 'FAILED'
          ? pick(['TTS合成超时，请重试', '渲染节点异常，素材不足', '音视频合成失败，格式不兼容'])
          : null;

        await prisma.creation.create({
          data: {
            id: creationId,
            productId,
            scriptId: script.id,
            taskId: `tsk_${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}_${randomInt(1000000000, 9999999999)}`,
            engineMode: 'SCRIPT_DRIVEN',
            targetResolution: '1080x1920',
            exportFormat: 'MP4',
            status: status as any,
            progress,
            currentStage: (isFinished ? 'FINISHED' : isProcessing ? 'TTS_GENERATING' : 'FAILED') as any,
            videoUrl: isFinished ? `http://localhost:9000/tikstream-assets/demo/analytics/${creationId}.mp4` : null,
            fileSizeBytes: isFinished ? BigInt(randomInt(5000000, 30000000)) : null,
            traceId: `trc_supp_${creationId.slice(0, 8)}`,
            preferAiVideo: ci === 0,
            errorCode,
            errorMessage,
            startedAt,
            finishedAt,
            createdAt,
            watermarkConfig: { enabled: true, position: 'bottom-right', opacity: 0.3 } as any,
          },
        });

        // 为每个分镜创建 ShotRender
        for (const shot of script.shots) {
          const renderStatus = isFinished
            ? 'FINISHED'
            : isProcessing
              ? (randomInt(0, 1) === 0 ? 'FINISHED' : 'PROCESSING')
              : 'PENDING';

          await prisma.shotRender.create({
            data: {
              id: randomUUID(),
              creationId,
              scriptShotId: shot.id,
              shotIndex: shot.shotIndex,
              cacheHash: isFinished ? `cache_${randomUUID().slice(0, 12)}` : null,
              renderPath: isFinished ? `/renders/${creationId}/shot_${shot.shotIndex}.mp4` : null,
              renderDurationMs: isFinished ? randomInt(8000, 45000) : null,
              retryCount: randomInt(0, 2),
              source: pick(['RENDERED', 'CACHE_HIT']),
              status: renderStatus as any,
            },
          });
          totalRenders++;
        }

        totalCreations++;
      }
    }

    console.log(`  ✓ ${scripts.length * creationsPerScript} creations, ${scripts.length * creationsPerScript * (scripts[0]?.shots.length || 5)} renders`);
  }

  // =========================================================================
  // 补充：电脑 (26c85ff0) — 2 scripts × 2 creations = 4 creations
  // =========================================================================
  if (pcProduct) {
    await seedProduct(pcProduct.id, pcProduct.title, 2, 2);
  }

  // =========================================================================
  // 补充：TikStream 演示商品 — 3 scripts × 3 creations = 9 creations
  // =========================================================================
  if (demoProduct) {
    await seedProduct(demoProduct.id, demoProduct.title, 3, 3);
  }

  // =========================================================================
  // 创建 OriginalityCheck（为所有新创建的 FINISHED creation）
  // =========================================================================
  console.log('\n--- Seeding: Originality Checks ---');
  
  const newFinishedCreations = await prisma.creation.findMany({
    where: {
      status: 'FINISHED',
      originalityChecks: { none: {} },  // 只查还没有 originality check 的
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  for (const creation of newFinishedCreations) {
    if (Math.random() > 0.85) continue;
    const scoreBefore = randomFloat(60, 99);
    const isDuplicate = scoreBefore < 70;
    const scoreAfter = isDuplicate ? randomFloat(75, 99) : undefined;
    
    await prisma.originalityCheck.create({
      data: {
        id: randomUUID(),
        creationId: creation.id,
        scoreBefore,
        scoreAfter: scoreAfter ?? null,
        similarVideos: isDuplicate
          ? [{ source: `demo_source_${randomInt(1, 99)}`, similarity: randomFloat(0.7, 0.95) }]
          : [],
        duplicateSections: isDuplicate
          ? [{ time_range: [randomInt(0, 5), randomInt(6, 14)], similarity: randomFloat(0.7, 0.9) }]
          : [],
        optimizationSuggestions: isDuplicate
          ? [{ type: 're_shoot', shot_index: randomInt(1, 5), reason: '与已有内容相似度过高' }]
          : [],
        status: isDuplicate ? 'DUPLICATE_DETECTED' : 'PASSED',
        remark: isDuplicate ? `检测到原创度${scoreBefore}%，低于阈值` : null,
      },
    });
    totalChecks++;
  }

  console.log(`  ✓ ${totalChecks} originality checks created`);

  // =========================================================================
  // 汇总
  // =========================================================================
  const totalProducts = await prisma.product.count();
  const totalScripts = await prisma.script.count();
  const totalCreationsAll = await prisma.creation.count();
  const totalShotRenders = await prisma.shotRender.count();
  const totalOrigChecks = await prisma.originalityCheck.count();

  console.log('\n========================================');
  console.log('Supplement Seed Complete');
  console.log(`  New Creations:   ${totalCreations}`);
  console.log(`  New Renders:     ${totalRenders}`);
  console.log(`  New OrigChecks:  ${totalChecks}`);
  console.log('---');
  console.log(`  Total Products:  ${totalProducts}`);
  console.log(`  Total Scripts:   ${totalScripts}`);
  console.log(`  Total Creations: ${totalCreationsAll}`);
  console.log(`  Total Renders:   ${totalShotRenders}`);
  console.log(`  Total OrigChks:  ${totalOrigChecks}`);
  console.log('========================================');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
