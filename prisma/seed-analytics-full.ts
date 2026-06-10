// =============================================================================
// TikStream AI — Analytics Mock Data Complete Seed
// 为所有缺失分析数据的商品补全全链路数据
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rf(min: number, max: number, d = 2): number { return +((Math.random() * (max - min) + min).toFixed(d)); }
function ri(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(days: number): Date {
  const d = new Date(); d.setDate(d.getDate() - days);
  d.setHours(ri(8, 22), ri(0, 59), ri(0, 59)); return d;
}

const CAMERA = ['Static','Dolly_In_Fast','Dolly_Out','Pan_Left','Tilt_Up'] as const;
const TRANS = ['None','Fade_In','Dissolve','Wipe'] as const;
const GEN_MODES = ['PROMPT_DRIVEN','TEMPLATE_DRIVEN','VIRAL_REWRITE','HYBRID'] as const;
const BGMS = ['快节奏电子','舒缓钢琴','激昂管弦','轻松吉他','无BGM'] as const;
const VIBES_BY_CAT: Record<string,string[]> = {
  beauty:['fresh','elegant','minimal','vibrant'],
  electronics:['tech','futuristic','sleek','bold'],
  fashion:['trendy','chic','street','luxury'],
  food:['appetizing','warm','fun','artisanal'],
  fitness:['energetic','motivational','raw','dynamic'],
  home:['cozy','zen','modern','warm'],
  health:['clean','natural','calm','fresh'],
  office:['modern','minimal','professional','clean'],
  travel:['adventurous','dynamic','scenic','bold'],
};
const VO_BY_CAT: Record<string,string[][]> = {
  beauty:[
    ['你是否也在为暗沉肤色烦恼？','今天带你解锁发光肌的秘密','看这精华液的质地多清爽','一抹就吸收，完全不黏腻','现在下单立减50'],
    ['你还在用刺激性的护肤品吗？','温和修护才是关键','这款敏感肌也能安心用','零酒精零香精配方','限时买2送1，赶紧入手'],
  ],
  electronics:[
    ['通勤路上噪音太多？','这款耳机降噪深度达48dB','戴上瞬间安静得像在图书馆','续航40小时，一周充一次','链接在评论区，现在下单有惊喜'],
    ['户外聚会还缺氛围感？','这个蓝牙音箱带你嗨翻全场','360环绕音质饱满震撼','防水防尘，下雨也不怕','两台串联更震撼'],
  ],
  fashion:[
    ['这件外套也太好看了吧','80年代复古水洗工艺','每件都独一无二','Oversize版型超显瘦','现在下单送同款帆布袋'],
    ['这条裤子一穿气质拉满','高腰垂感设计显腿长','四季百搭怎么穿都好看','料子超舒服不起球','优惠最后一天速冲'],
  ],
  food:[
    ['馋零食了又不想出门？','这款最地道的味道直发','配料超多，酸笋腐竹花生米','5分钟搞定宵夜神器','囤货价79/4袋速度冲'],
    ['嘴巴闲不住还怕胖？','这个每天一包刚刚好','多重营养科学配比','无添加健康零负担','上班族必备就靠它'],
  ],
  fitness:[
    ['宅家也能高效燃脂','自动计数跳绳太方便了','蓝牙连接APP随时记录','有绳无绳随意切换','现在下单送运动毛巾'],
    ['健身房关门怎么办？','居家神器一用就上瘾','无声无味不扰家人','每天15分钟暴汗燃脂','限时特惠仅此一次'],
  ],
  home:[
    ['桌面上总是乱七八糟？','这个收纳神器解决你的烦恼','一物多用灵活组合','承重30斤稳如泰山','买了就后悔没早买'],
    ['打扫卫生太麻烦？','这款智能神器解放双手','红外感应自动开合','12L窄缝不占空间','耗电极省每月不到1块'],
  ],
  health:[
    ['换季容易感冒怎么办？','每天一杯增强抵抗力','好喝的香橙味全家都爱','独立包装携带方便','现在买2送1太划算了'],
    ['肠胃总不舒服？','益生菌调理内外兼修','30条装一个月刚刚好','进口菌株活性保障','坚持喝明显改善'],
  ],
  office:[
    ['办公效率总提不上去？','这个神器让你效率翻倍','多设备同时连无线投屏','1080P超清画质','办公娱乐两不误'],
    ['桌面线缆乱七八糟？','一支搞定所有设备','无线快充+数据传输','颜值在线告别凌乱','同事都问在哪买'],
  ],
  travel:[
    ['出门行李太重？','这个超轻可收纳不占空间','叠起来只有巴掌大','展开抗寒真的暖','出差旅行必备'],
    ['户外活动没热水？','便携烧水杯解决一切','3分钟沸腾自动保温','小巧不占空间','出门也能喝热水'],
  ],
};
const SUBS_BY_CAT: Record<string,string[][]> = {
  beauty:[
    ['肤色暗沉？','发光肌的秘密','清爽质地','吸收不黏腻','下单立减50'],
    ['还在用刺激品？','温和修护是关键','敏肌安心用','零酒精零香精','买2送1'],
  ],
  electronics:[
    ['通勤噪音多？','降噪深度48dB','图书馆级安静','续航40小时','现在下单有惊喜'],
    ['缺氛围感？','嗨翻全场','360环绕音质','防水防尘','串联更震撼'],
  ],
  fashion:[
    ['外套好看到哭','复古水洗工艺','独一无二','Oversize显瘦','送帆布袋'],
    ['裤子气质拉满','高腰垂感显腿长','四季百搭','超舒服不起球','优惠最后一天'],
  ],
  food:[
    ['馋零食了？','地道原味直发','配料超多','5分钟搞定','79/4袋速度冲'],
    ['嘴巴闲不住？','每天一包','多重营养配比','无添加零负担','上班族必备'],
  ],
  fitness:[
    ['宅家高效燃脂','自动计数太方便','蓝牙连接APP','有绳无绳随意','送运动毛巾'],
    ['健身房关门？','居家神器上瘾','无声无味','15分钟暴汗','限时特惠'],
  ],
  home:[
    ['桌面乱？','收纳神器一物多用','灵活组合','承重30斤','后悔没早买'],
    ['扫地麻烦？','智能解放双手','红外自动开合','12L窄缝省空间','耗电极省'],
  ],
  health:[
    ['易感冒？','增强抵抗力','香橙味全家爱','独立包装方便','买2送1'],
    ['肠胃不舒服？','益生菌调理','30条一个月','进口菌株保障','坚持喝改善明显'],
  ],
  office:[
    ['效率提不上去？','效率翻倍','多设备无线投屏','1080P超清','办公娱乐两不误'],
    ['线缆乱？','一支搞定','无线快充+数据','颜值在线','同事都问链接'],
  ],
  travel:[
    ['行李重？','超轻可收纳','巴掌大','展开抗寒保暖','出差旅行必备'],
    ['没热水？','便携烧水杯','3分钟沸腾保温','小巧不占空间','出门喝热水'],
  ],
};

function mapCategory(cat: string): string {
  if (cat.includes('beauty') || cat.includes('美')) return 'beauty';
  if (cat.includes('electronic') || cat.includes('电') || cat.includes('耳机') || cat.includes('音箱') || cat.includes('投影')) return 'electronics';
  if (cat.includes('fashion') || cat.includes('衣') || cat.includes('裤') || cat.includes('外套') || cat.includes('马甲')) return 'fashion';
  if (cat.includes('food') || cat.includes('食') || cat.includes('螺蛳') || cat.includes('坚果') || cat.includes('牛肉')) return 'food';
  if (cat.includes('fitness') || cat.includes('健身') || cat.includes('跳绳')) return 'fitness';
  if (cat.includes('home') || cat.includes('家居') || cat.includes('置物架') || cat.includes('衣架') || cat.includes('垃圾桶')) return 'home';
  if (cat.includes('health') || cat.includes('保健') || cat.includes('益生') || cat.includes('维生素') || cat.includes('眼罩')) return 'health';
  return 'home';
}

async function main(): Promise<void> {
  console.log('========================================');
  console.log('TikStream AI — Analytics Complete Seed');
  console.log('========================================\n');

  // 找到所有没有剧本的商品
  const bareProducts = await prisma.product.findMany({
    where: { scripts: { none: {} } },
    select: { id: true, title: true, category: true },
    orderBy: { title: 'asc' },
  });

  if (bareProducts.length === 0) {
    console.log('All products already have scripts. Nothing to do.');
    return;
  }

  console.log(`Found ${bareProducts.length} products without scripts:\n`);
  bareProducts.forEach(p => console.log(`  - ${p.title} [${p.category}]`));

  let totalScripts = 0, totalShots = 0, totalCreations = 0, totalRenders = 0, totalChecks = 0;

  for (const product of bareProducts) {
    const cat = mapCategory(product.category || '');
    const vibes = VIBES_BY_CAT[cat] || ['modern', 'clean'];
    const vos = VO_BY_CAT[cat] || [['精彩看点','核心亮点','细节展示','使用体验','立即下单']];
    const subs = SUBS_BY_CAT[cat] || [['看点','亮点','细节','体验','下单']];

    console.log(`\n--- ${product.title} ---`);

    for (let si = 0; si < 2; si++) {
      const scriptId = randUUID();
      const vibe = vibes[si % vibes.length];
      const genMode = GEN_MODES[si % GEN_MODES.length];

      await prisma.script.create({
        data: {
          id: scriptId, productId: product.id,
          title: `${product.title} - ${vibe}风格${genMode}`,
          language: 'zh-CN', targetAudience: '18-45岁',
          videoDuration: rf(10, 16), aspectRatio: 'NINE_SIXTEEN',
          styleVibe: vibe, generationMode: genMode as any,
          constraintList: [],
          rawJson: { narrative_framework: { style: vibe, mode: genMode },
            visual_style: { color_palette: pick(['warm','cool','neutral','vibrant','monochrome']), visual_tempo: pick(['fast','medium','slow']) } },
        },
      });
      totalScripts++;

      const shotIds: string[] = [];
      const v = si % vos.length, s = si % subs.length;

      for (let sx = 0; sx < 5; sx++) {
        const sid = randUUID();
        shotIds.push(sid);
        const bgm = pick(BGMS);
        await prisma.scriptShot.create({
          data: {
            id: sid, scriptId, shotIndex: sx + 1,
            duration: rf(1.8, 4.5),
            sceneDescriptionQuery: `${product.title} shot ${sx + 1}`,
            visualDescription: `${vibe}风格${sx + 1}`,
            cameraMovement: pick(CAMERA) as any,
            transitionType: pick(TRANS) as any,
            voiceoverText: vos[v][sx] || `分镜${sx + 1}旁白`,
            subtitleText: subs[s][sx] || `分镜${sx + 1}字幕`,
            safeZoneBoundingBox: [0.1, 0.7, 0.9, 0.9] as any,
            complianceStatus: 'PASSED',
            localFactorPatch: { bgm_segment: { style: bgm, energy_level: pick(['low','mid','high']), beat_pattern: pick(['渐进','循环','爆发','退潮']) },
              camera_preference: pick(CAMERA), transition_preference: pick(TRANS) },
            bgmSegment: { style: bgm, energy_level: pick(['low','mid','high']), beat_pattern: pick(['渐进','循环','爆发','退潮']) } as any,
          },
        });
        totalShots++;
      }

      // 每个剧本创建 2 个 Creation
      for (let ci = 0; ci < 2; ci++) {
        const cid = randUUID();
        const statusRoll = ri(1, 5);
        const status = statusRoll <= 3 ? 'FINISHED' : statusRoll === 4 ? 'PROCESSING' : 'FAILED';
        const isFinished = status === 'FINISHED';
        const isProcessing = status === 'PROCESSING';
        const createdAt = daysAgo(ri(3, 55));
        const startedAt = new Date(createdAt.getTime() + ri(1, 5) * 60000);
        const finishedAt = isFinished ? new Date(startedAt.getTime() + ri(2, 10) * 60000) : null;
        const progress = isFinished ? 100 : isProcessing ? ri(30, 75) : ri(5, 20);

        await prisma.creation.create({
          data: {
            id: cid, productId: product.id, scriptId,
            taskId: `tsk_${createdAt.toISOString().slice(0,10).replace(/-/g,'')}_${ri(1000000000,9999999999)}`,
            engineMode: 'SCRIPT_DRIVEN', targetResolution: '1080x1920', exportFormat: 'MP4',
            status: status as any, progress,
            currentStage: (isFinished?'FINISHED':isProcessing?'TTS_GENERATING':'FAILED') as any,
            videoUrl: isFinished ? `http://localhost:9000/tikstream-assets/demo/analytics/${cid}.mp4` : null,
            fileSizeBytes: isFinished ? BigInt(ri(5000000, 30000000)) : null,
            traceId: `trc_full_${cid.slice(0,8)}`, preferAiVideo: ci === 0,
            errorCode: status === 'FAILED' ? pick(['TTS_TIMEOUT','RENDER_FAILED','STITCH_ERROR']) : null,
            errorMessage: status === 'FAILED' ? pick(['TTS合成超时','渲染节点异常','音视频合成失败']) : null,
            startedAt, finishedAt, createdAt,
            watermarkConfig: { enabled: true, position: 'bottom-right', opacity: 0.3 } as any,
          },
        });
        totalCreations++;

        for (let sx = 0; sx < shotIds.length; sx++) {
          const renderStatus = isFinished ? 'FINISHED' : isProcessing ? (ri(0,1)===0?'FINISHED':'PROCESSING') : 'PENDING';
          await prisma.shotRender.create({
            data: {
              id: randUUID(), creationId: cid, scriptShotId: shotIds[sx], shotIndex: sx + 1,
              cacheHash: isFinished ? `cache_${randUUID().slice(0,12)}` : null,
              renderPath: isFinished ? `/renders/${cid}/shot_${sx+1}.mp4` : null,
              renderDurationMs: isFinished ? ri(8000, 45000) : null,
              retryCount: ri(0,2), source: pick(['RENDERED','CACHE_HIT']),
              status: renderStatus as any,
            },
          });
          totalRenders++;
        }
        totalChecks += 2; // placeholder for later
      }
    }
    console.log(`  OK 2 scripts, 10 shots, 4 creations, ~20 renders`);
  }

  // Originality Checks
  console.log('\n--- Creating Originality Checks ---');
  let ocCreated = 0;
  const finishedCreations = await prisma.creation.findMany({
    where: { status: 'FINISHED', originalityChecks: { none: {} } },
    select: { id: true }, orderBy: { createdAt: 'desc' }, take: 200,
  });

  for (const c of finishedCreations) {
    if (Math.random() > 0.85) continue;
    const sb = rf(60, 99); const dup = sb < 70;
    await prisma.originalityCheck.create({
      data: {
        id: randUUID(), creationId: c.id, scoreBefore: sb,
        scoreAfter: dup ? rf(75, 99) : null,
        similarVideos: dup ? [{ source: `src_${ri(1,99)}`, similarity: rf(.7,.95) }] : [],
        duplicateSections: dup ? [{ time_range: [ri(0,5),ri(6,14)], similarity: rf(.7,.9) }] : [],
        optimizationSuggestions: dup ? [{ type: 're_shoot', shot_index: ri(1,5), reason: '与已有内容相似度过高' }] : [],
        status: dup ? 'DUPLICATE_DETECTED' : 'PASSED',
        remark: dup ? `原创度${sb}%低于阈值` : null,
      },
    });
    ocCreated++;
  }

  // Summary
  const counts = await Promise.all([
    prisma.product.count(), prisma.script.count(), prisma.creation.count(),
    prisma.shotRender.count(), prisma.originalityCheck.count(),
  ]);

  console.log('\n========================================');
  console.log('Seed Complete');
  console.log(`  New Scripts:    ${totalScripts}`);
  console.log(`  New Shots:      ${totalShots}`);
  console.log(`  New Creations:  ${totalCreations}`);
  console.log(`  New Renders:    ${totalRenders}`);
  console.log(`  New OrigChecks: ${ocCreated}`);
  console.log('---');
  console.log(`  Total Products: ${counts[0]}`);
  console.log(`  Total Scripts:  ${counts[1]}`);
  console.log(`  Total Creations:${counts[2]}`);
  console.log(`  Total Renders:  ${counts[3]}`);
  console.log(`  Total OrigChks: ${counts[4]}`);
  console.log('========================================');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
