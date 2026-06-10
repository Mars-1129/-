// =============================================================================
// TikStream AI — Analytics Mock Data Seed
// 为分析模块生成充足的 mock 数据：商品、剧本、创作、分镜渲染
//
// 生成规模：
//   15 商品 × 6 类目 × 2-3 剧本/商品 = 30 剧本
//   × 5 分镜/剧本 = 150 ScriptShot
//   × 2 创作/剧本 = 60 Creation
//   × 150 (每个分镜一个 ShotRender) = 150 ShotRender
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ===========================================================================
// 常量定义
// ===========================================================================

const CATEGORIES = ['beauty', 'electronics', 'fashion', 'food', 'fitness', 'home'] as const;
type Category = (typeof CATEGORIES)[number];

const STYLE_VIBES: Record<Category, string[]> = {
  beauty: ['fresh', 'elegant', 'minimal', 'vibrant'],
  electronics: ['tech', 'futuristic', 'sleek', 'bold'],
  fashion: ['trendy', 'chic', 'street', 'luxury'],
  food: ['appetizing', 'warm', 'fun', 'artisanal'],
  fitness: ['energetic', 'motivational', 'raw', 'dynamic'],
  home: ['cozy', 'zen', 'modern', 'warm'],
};

const BGJA_STYLES: Record<Category, string[]> = {
  beauty: ['soft pop', 'lofi', 'acoustic', 'ambient'],
  electronics: ['electronic', 'synthwave', 'techno', 'industrial'],
  fashion: ['hip hop', 'rnb', 'house', 'chill'],
  food: ['jazz', 'bossa nova', 'lofi', 'acoustic'],
  fitness: ['rock', 'edm', 'hip hop', 'drum & bass'],
  home: ['classical', 'ambient', 'lofi', 'folk'],
};

const CAMERA_MOVEMENTS = [
  'Static',
  'Dolly_In_Fast',
  'Dolly_Out',
  'Pan_Left',
  'Tilt_Up',
] as const;

const TRANSITION_TYPES = [
  'None',
  'Fade_In',
  'Dissolve',
  'Wipe',
] as const;

const GENERATION_MODES = [
  'PROMPT_DRIVEN',
  'TEMPLATE_DRIVEN',
  'VIRAL_REWRITE',
  'HYBRID',
] as const;

const CREATION_STATUSES = ['FINISHED', 'FINISHED', 'FINISHED', 'PROCESSING', 'FAILED'] as const;
const CREATION_STAGES: Record<string, string> = {
  FINISHED: 'FINISHED',
  PROCESSING: 'TTS_GENERATING',
  FAILED: 'FAILED',
};

const RETENTION_REASONS: Record<number, string> = {
  1: '开场吸引力不足',
  2: 'BGM与画面风格不匹配',
  3: '旁白节奏过慢',
  4: '转场突兀',
  5: 'CT文案不够紧迫',
};

// ===========================================================================
// 辅助函数
// ===========================================================================

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

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
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
// 商品数据模板
// ===========================================================================

interface ProductTemplate {
  title: string;
  skuCode: string;
  category: Category;
  sellingPoints: string[];
  targetAudience: string;
  scenarioTags: string[];
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    title: '烟酰胺亮肤精华液',
    skuCode: 'ANA-BEA-001',
    category: 'beauty',
    sellingPoints: ['28天焕亮肤色', '5%高浓度烟酰胺', '零刺激敏肌可用', '真空锁鲜瓶'],
    targetAudience: '22-40岁关注美白的女性',
    scenarioTags: ['skincare', 'whitening', 'daily'],
  },
  {
    title: '氨基酸温和洁面泡沫',
    skuCode: 'ANA-BEA-002',
    category: 'beauty',
    sellingPoints: ['日本进口氨基酸表活', '泡沫绵密不紧绷', '卸妆清洁二合一', '200ml大容量'],
    targetAudience: '18-35岁全肤质女性',
    scenarioTags: ['cleansing', 'gentle', 'daily'],
  },
  {
    title: '智能降噪无线耳机',
    skuCode: 'ANA-ELC-001',
    category: 'electronics',
    sellingPoints: ['ANC主动降噪48dB', '40小时超长续航', 'LDAC高清音频', 'IPX5防水'],
    targetAudience: '20-38岁通勤族和游戏玩家',
    scenarioTags: ['commute', 'gaming', 'sports'],
  },
  {
    title: '便携式蓝牙音箱',
    skuCode: 'ANA-ELC-002',
    category: 'electronics',
    sellingPoints: ['360°环绕立体声', '20小时播放时长', 'IP67防水防尘', 'TWS串联'],
    targetAudience: '18-35岁户外爱好者和聚会达人',
    scenarioTags: ['outdoor', 'party', 'travel'],
  },
  {
    title: '复古宽松牛仔外套',
    skuCode: 'ANA-FAS-001',
    category: 'fashion',
    sellingPoints: ['80年代复古水洗工艺', '100%新疆长绒棉', 'oversize版型显瘦', '四季百搭款'],
    targetAudience: '18-30岁追求个性的年轻女性',
    scenarioTags: ['streetwear', 'retro', 'daily'],
  },
  {
    title: '轻薄防晒皮肤衣',
    skuCode: 'ANA-FAS-002',
    category: 'fashion',
    sellingPoints: ['UPF50+ 防晒认证', '仅重80g超轻便携', '凉感冰丝面料', '8色可选'],
    targetAudience: '20-45岁户外运动女性',
    scenarioTags: ['outdoor', 'sunscreen', 'summer'],
  },
  {
    title: '柳州螺蛳粉礼盒装',
    skuCode: 'ANA-FOD-001',
    category: 'food',
    sellingPoints: ['柳州直发地道风味', '8种配料超丰富', '5分钟即食', '聚餐必备'],
    targetAudience: '18-35岁速食爱好者',
    scenarioTags: ['instant', 'spicy', 'snack'],
  },
  {
    title: '每日坚果混合装',
    skuCode: 'ANA-FOD-002',
    category: 'food',
    sellingPoints: ['7种坚果科学配比', '无添加无油炸', '独立小包装', '30天量贩装'],
    targetAudience: '25-45岁注重健康的上班族',
    scenarioTags: ['healthy', 'snack', 'office'],
  },
  {
    title: '智能计数跳绳',
    skuCode: 'ANA-FIT-001',
    category: 'fitness',
    sellingPoints: ['LED实时计数显示', '蓝牙连接APP', '无绳/有绳双模式', '续航90天'],
    targetAudience: '20-40岁居家健身人群',
    scenarioTags: ['home workout', 'cardio', 'smart'],
  },
  {
    title: '瑜伽垫防滑加厚款',
    skuCode: 'ANA-FIT-002',
    category: 'fitness',
    sellingPoints: ['双面防滑纹理', '6mm加厚缓冲', '环保TPE材质', '附赠收纳绑带'],
    targetAudience: '22-35岁瑜伽初学者和爱好者',
    scenarioTags: ['yoga', 'home', 'beginner'],
  },
  {
    title: '超声波静音加湿器',
    skuCode: 'ANA-HOM-001',
    category: 'home',
    sellingPoints: ['4L超大容量', '35dB静音运行', '定时关机功能', '七彩氛围灯'],
    targetAudience: '25-45岁注重生活品质的家庭',
    scenarioTags: ['bedroom', 'office', 'winter'],
  },
  {
    title: '魔方插座扩展器',
    skuCode: 'ANA-HOM-002',
    category: 'home',
    sellingPoints: ['一转多USB+插孔', '防雷防过载', '小巧不占空间', '儿童安全门'],
    targetAudience: '20-50岁家庭和办公人群',
    scenarioTags: ['desk', 'travel', 'home'],
  },
  {
    title: '孕妇安全护肤套装',
    skuCode: 'ANA-BEA-003',
    category: 'beauty',
    sellingPoints: ['孕产期专用配方', '零香精零酒精', '权威机构检测', '保湿修护二合一'],
    targetAudience: '25-38岁孕期及产后女性',
    scenarioTags: ['pregnancy', 'safe', 'repair'],
  },
  {
    title: '磁吸快充充电宝',
    skuCode: 'ANA-ELC-003',
    category: 'electronics',
    sellingPoints: ['10000mAh大容量', 'MagSafe磁吸快充', '20W PD双向快充', 'LED数显电量'],
    targetAudience: '18-35岁iPhone用户',
    scenarioTags: ['travel', 'daily', 'iphone'],
  },
  {
    title: '全自动宠物饮水机',
    skuCode: 'ANA-HOM-003',
    category: 'home',
    sellingPoints: ['3重过滤净化', '2.5L大容量', '超静音水泵', '缺水自动断电'],
    targetAudience: '25-40岁养宠家庭',
    scenarioTags: ['pet', 'smart', 'health'],
  },
];

// ===========================================================================
// 主逻辑
// ===========================================================================

async function main(): Promise<void> {
  console.log('========================================');
  console.log('TikStream AI — Analytics Mock Data Seed');
  console.log('========================================\n');

  // =========================================================================
  // Step 1: 创建 15 个商品
  // =========================================================================
  console.log('[1/4] Creating 15 products...');
  const products: Array<{ id: string; skuCode: string; title: string; category: string }> = [];

  for (const tpl of PRODUCT_TEMPLATES) {
    const id = randomUUID();
    await prisma.product.create({
      data: {
        id,
        skuCode: tpl.skuCode,
        title: tpl.title,
        category: tpl.category,
        sellingPoints: tpl.sellingPoints,
        targetAudience: tpl.targetAudience,
        scenarioTags: tpl.scenarioTags,
      },
    });
    products.push({ id, skuCode: tpl.skuCode, title: tpl.title, category: tpl.category });
    console.log(`  ✓ ${tpl.title} (${tpl.skuCode})`);
  }

  // =========================================================================
  // Step 2: 为每个商品创建 2 个剧本（不同风格），每个剧本 5 个分镜
  // =========================================================================
  console.log('\n[2/4] Creating scripts & shots...');
  const scripts: Array<{
    id: string;
    productId: string;
    shotIds: string[];
    styleVibe: string;
    generationMode: string;
  }> = [];

  const SHOT_VOICEOVERS: Record<Category, string[][]> = {
    beauty: [
      ['你是否也在为暗沉肤色烦恼？', '今天带你解锁发光肌的秘密', '看这精华液的质地多清爽', '一抹就吸收，完全不黏腻', '28天效果，现在下单立减50'],
      ['你还在用刺激性的美白产品吗？', '温和也能白，选对成分才关键', '烟酰胺+玻尿酸黄金配比', '敏肌实测100%通过刺激性测试', '限时买2送1，赶紧入手'],
    ],
    electronics: [
      ['通勤路上噪音太多？', '这款耳机降噪深度达48dB', '戴上瞬间安静得像在图书馆', '续航40小时，一周充一次', '链接在评论区，现在下单有惊喜'],
      ['户外聚会还缺氛围感？', '这个蓝牙音箱带你嗨翻全场', '360°环绕音质饱满震撼', 'IP67防水，下雨也不怕', 'TWS串联两台更震撼！'],
    ],
    fashion: [
      ['这件牛仔外套也太好看了吧', '复古水洗工艺，每件都独一无二', 'oversize版型超显瘦', '搭裙子搭裤子都能驾驭', '现在下单送同款帆布袋'],
      ['夏天出门怕晒黑？', '这件防晒衣UPF50+冰感面料', '叠起来比手机还小', '8种颜色总有你喜欢的', '趁优惠赶紧囤一件！'],
    ],
    food: [
      ['馋螺蛳粉了但不想出门？', '柳州直发，味道跟店里一模一样', '配料超多，酸笋腐竹花生米', '5分钟搞定，宵夜神器', '囤货价79/4袋，速度冲'],
      ['健身嘴馋又怕胖？', '这个坚果每天一包刚刚好', '7种坚果科学配比', '无糖无油炸，吃得健康', '上班族必备零食，下方购买'],
    ],
    fitness: [
      ['宅家也能高效燃脂', '这个跳绳自动计数太方便了', '蓝牙连APP记录运动数据', '有绳无绳随意切换', '现在下单还送运动毛巾'],
      ['瑜伽新手还在纠结买什么垫子？', '这个加厚防滑垫是你的最佳选择', '双面纹理抓地力超强', '环保材质零异味', '附赠收纳绑带超方便'],
    ],
    home: [
      ['冬天皮肤干痒嗓子疼？', '有了这个加湿器再也不用担心', '4L超大容量一晚上不用加水', '35dB静音睡觉不打扰', '七彩氛围灯助眠神器'],
      ['桌面上插头总是不够用？', '这个魔方插座解决你的烦恼', '一个变多个，充电同时插电', '防雷防过载安全保障', '小巧不占空间出差也带着'],
    ],
  };

  const SUBTITLES: Record<Category, string[][]> = {
    beauty: [
      ['肤色暗沉？', '发光肌的秘密', '精华液清爽质地', '一抹吸收不黏腻', '28天见效立减50'],
      ['还在用刺激产品？', '温和变白选对成分', '烟酰胺+玻尿酸', '敏肌100%通过测试', '买2送1限时'],
    ],
    electronics: [
      ['通勤噪音太多？', '降噪深度48dB', '图书馆级安静', '续航40小时', '链接在评论区'],
      ['户外缺氛围感？', '嗨翻全场', '360°环绕音质', 'IP67防水', 'TWS串联更震撼'],
    ],
    fashion: [
      ['牛仔外套好看到哭', '复古水洗独一无二', 'oversize显瘦版型', '搭什么都好看', '送同款帆布袋'],
      ['夏天怕晒黑？', 'UPF50+冰感防晒衣', '比手机还小', '8种颜色可选', '趁优惠快囤'],
    ],
    food: [
      ['馋螺蛳粉？', '柳州直发店里同款', '配料超多', '5分钟宵夜神器', '79/4袋速度冲'],
      ['怕胖还嘴馋？', '每天一包刚刚好', '7种坚果配比', '无糖无油炸', '上班族必备'],
    ],
    fitness: [
      ['宅家高效燃脂', '自动计数太方便', '蓝牙连接APP', '有绳无绳随意', '送运动毛巾'],
      ['瑜伽新手？', '加厚防滑最佳选择', '双面纹理抓地强', '环保零异味', '附赠收纳带'],
    ],
    home: [
      ['冬天皮肤干痒？', '加湿器拯救你', '4L一晚上不加水', '35dB安静入睡', '七彩氛围灯'],
      ['插头不够用？', '魔方插座神器', '一变多充电+插电', '防雷防过载', '出差都带着'],
    ],
  };

  let totalShots = 0;

  for (const product of products) {
    const cat = product.category as Category;
    const voiceovers = SHOT_VOICEOVERS[cat] || [['测试旁白1', '测试旁白2', '测试旁白3', '测试旁白4', '测试旁白5']];
    const subtitles = SUBTITLES[cat] || [['字幕1', '字幕2', '字幕3', '字幕4', '字幕5']];
    const vibes = STYLE_VIBES[cat];

    for (let si = 0; si < 2; si++) {
      const scriptId = randomUUID();
      const styleVibe = vibes[si % vibes.length];
      const genMode = GENERATION_MODES[si % GENERATION_MODES.length];
      const v = si % voiceovers.length;
      const s = si % subtitles.length;

      await prisma.script.create({
        data: {
          id: scriptId,
          productId: product.id,
          title: `${product.title} - ${styleVibe}风格${genMode}`,
          language: 'zh-CN',
          targetAudience: '18-35岁',
          videoDuration: randomFloat(10, 15),
          aspectRatio: 'NINE_SIXTEEN',
          styleVibe,
          generationMode: genMode,
          constraintList: [],
          rawJson: {
            narrative_framework: { style: styleVibe, mode: genMode },
            visual_style: {
              color_palette: pick(['warm', 'cool', 'neutral', 'vibrant', 'monochrome']),
              visual_tempo: pick(['fast', 'medium', 'slow']),
            },
          },
        },
      });

      const shotIds: string[] = [];
      for (let shotIdx = 0; shotIdx < 5; shotIdx++) {
        const shotId = randomUUID();
        shotIds.push(shotId);
        const cm = pick(CAMERA_MOVEMENTS);
        const tt = pick(TRANSITION_TYPES);
        const bgmStyle = pick(BGJA_STYLES[cat]);

        await prisma.scriptShot.create({
          data: {
            id: shotId,
            scriptId,
            shotIndex: shotIdx + 1,
            duration: randomFloat(1.8, 4.5),
            sceneDescriptionQuery: `${product.title} shot ${shotIdx + 1}`,
            visualDescription: `${styleVibe}风格${shotIdx + 1}`,
            cameraMovement: cm as any,
            transitionType: tt as any,
            voiceoverText: voiceovers[v][shotIdx] || `分镜${shotIdx + 1}旁白`,
            subtitleText: subtitles[s][shotIdx] || `分镜${shotIdx + 1}字幕`,
            safeZoneBoundingBox: [0.1, 0.7, 0.9, 0.9] as any,
            complianceStatus: 'PASSED',
            localFactorPatch: {
              bgm_segment: {
                style: bgmStyle,
                energy_level: pick(['low', 'mid', 'high']),
                beat_pattern: pick(['渐进', '循环', '爆发', '退潮']),
              },
              camera_preference: cm,
              transition_preference: tt,
            },
            bgmSegment: {
              style: bgmStyle,
              energy_level: pick(['low', 'mid', 'high']),
              beat_pattern: pick(['渐进', '循环', '爆发', '退潮']),
            } as any,
          },
        });
        totalShots++;
      }

      scripts.push({
        id: scriptId,
        productId: product.id,
        shotIds,
        styleVibe,
        generationMode: genMode,
      });
    }
  }
  console.log(`  ✓ 30 scripts, ${totalShots} shots created`);

  // =========================================================================
  // Step 3: 为每个剧本创建 2 个 Creation（不同状态），附带 ShotRender
  // =========================================================================
  console.log('\n[3/4] Creating creations & shot renders...');
  let totalCreations = 0;
  let totalRenders = 0;

  for (const script of scripts) {
    const product = products.find((p) => p.id === script.productId)!;
    const cat = product.category as Category;

    for (let ci = 0; ci < 2; ci++) {
      const creationId = randomUUID();
      const statusIdx = (scripts.indexOf(script) * 2 + ci) % CREATION_STATUSES.length;
      const status = CREATION_STATUSES[statusIdx];
      const currentStage = CREATION_STAGES[status];
      const isFinished = status === 'FINISHED';
      const isProcessing = status === 'PROCESSING';

      const createdAt = daysAgo(randomInt(3, 60));
      const startedAt = new Date(createdAt.getTime() + randomInt(1, 5) * 60000);
      const finishedAt = isFinished
        ? new Date(startedAt.getTime() + randomInt(2, 10) * 60000)
        : null;

      const progress = isFinished ? 100 : isProcessing ? randomInt(30, 70) : randomInt(5, 20);
      const errorCode = status === 'FAILED' ? pick(['TTS_TIMEOUT', 'RENDER_FAILED', 'STITCH_ERROR']) : null;
      const errorMessage =
        status === 'FAILED'
          ? pick(['TTS合成超时，请重试', '渲染节点异常，素材不足', '音视频合成失败，格式不兼容'])
          : null;

      await prisma.creation.create({
        data: {
          id: creationId,
          productId: script.productId,
          scriptId: script.id,
          taskId: `tsk_${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}_${randomInt(1000000000, 9999999999)}`,
          engineMode: 'SCRIPT_DRIVEN',
          targetResolution: '1080x1920',
          exportFormat: 'MP4',
          status: status as any,
          progress,
          currentStage: currentStage as any,
          videoUrl: isFinished ? `http://localhost:9000/tikstream-assets/demo/analytics/${creationId}.mp4` : null,
          fileSizeBytes: isFinished ? BigInt(randomInt(5000000, 30000000)) : null,
          traceId: `trc_analytics_${creationId.slice(0, 8)}`,
          preferAiVideo: ci === 1,
          errorCode,
          errorMessage,
          startedAt,
          finishedAt,
          createdAt,
          watermarkConfig: { enabled: true, position: 'bottom-right', opacity: 0.3 } as any,
        },
      });

      // 为每个分镜创建 ShotRender
      for (const shotId of script.shotIds) {
        const shotIdx = script.shotIds.indexOf(shotId) + 1;
        const renderStatus = isFinished
          ? 'FINISHED'
          : isProcessing
            ? randomInt(0, 1) === 0
              ? 'FINISHED'
              : 'PROCESSING'
            : 'PENDING';

        await prisma.shotRender.create({
          data: {
            id: randomUUID(),
            creationId,
            scriptShotId: shotId,
            shotIndex: shotIdx,
            cacheHash: isFinished ? `cache_${randomUUID().slice(0, 12)}` : null,
            renderPath: isFinished ? `/renders/${creationId}/shot_${shotIdx}.mp4` : null,
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
  console.log(`  ✓ ${totalCreations} creations, ${totalRenders} shot renders created`);

  // =========================================================================
  // Step 4: 创建 OriginalityCheck（原创度检测）记录
  // =========================================================================
  console.log('\n[4/4] Creating originality checks...');
  let totalChecks = 0;

  const finishedCreations = await prisma.creation.findMany({
    where: { status: 'FINISHED' },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  for (const creation of finishedCreations) {
    if (Math.random() > 0.9) continue;
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
  const totalCreations_ = await prisma.creation.count();
  const totalShotRenders = await prisma.shotRender.count();

  console.log('\n========================================');
  console.log('Seed Analytics Complete');
  console.log(`  Products:      ${totalProducts}`);
  console.log(`  Scripts:       ${totalScripts}`);
  console.log(`  Creations:     ${totalCreations_}`);
  console.log(`  ShotRenders:   ${totalShotRenders}`);
  console.log(`  OrigChecks:    ${totalChecks}`);
  console.log('========================================');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
