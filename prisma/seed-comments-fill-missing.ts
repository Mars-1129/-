/**
 * 为缺少评论的商品补充 40-60 条 Mock 评论 + 预分析
 * 执行: docker exec tikstream-server-gateway sh -c "cd /workspace && npx tsx prisma/seed-comments-fill-missing.ts"
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const PRE_ANALYZE = true;
const MIN_COMMENTS = 40;
const MAX_COMMENTS = 60;

// =============================================================================
// 精简评论池 (跨品类通用 + 按品类定制)
// =============================================================================
interface SentimentPool {
  positive: string[];
  neutral: string[];
  negative: string[];
}

const GENERIC_COMMENTS: SentimentPool = {
  positive: [
    '用了几天效果真的很不错！会回购的',
    '性价比很高，这个价格能买到这个品质很值',
    '物流超快，包装也很用心',
    '已经推荐给朋友了，她也下单了',
    '品质很好，超出预期',
    '第二次购买了，一如既往的好',
    '客服态度超好，有问题马上解决了',
    '比实体店便宜太多了',
    '用了一个月了效果很好，满意',
    '实物比图片还好看，惊喜',
  ],
  neutral: [
    '刚收到还没用，包装不错',
    '效果还行，可能需要多用一段时间',
    '价格有点小贵，希望能多做活动',
    '物流有点慢，等了几天才到',
    '颜色和图片有一点点色差',
    '容量不是很大，用不了多久',
    '功能挺多的，有些用不上',
    '希望出更多颜色选择',
  ],
  negative: [
    '用了几天没什么效果，有点失望',
    '质量一般，不太值这个价',
    '发货太慢了，催了好几次',
    '包装简陋，收到的时候盒子都压坏了',
    '和描述不太一样，色差挺大的',
    '性价比不高，不如其他家',
    '用了一周就出问题了',
    '退货流程太麻烦了',
    '感觉买贵了，刚买就降价',
    '实物做工比较粗糙',
  ],
};

interface CategoryComments {
  positive: string[];
  neutral: string[];
  negative: string[];
}

const CATEGORY_COMMENTS: Record<string, CategoryComments> = {
  beauty: {
    positive: [
      '质地很清爽不油腻，油皮也能用',
      '补水效果一流，第二天上妆超服帖',
      '敏感肌用了没有过敏，成分很温和',
      '味道好好闻，淡淡的玫瑰香',
      '精华液吸收很快，涂完不黏腻',
      '使用一周毛孔明显变小了',
      '眼霜用了一个月细纹真的淡了',
      '防晒不搓泥不假白，爱了爱了',
    ],
    neutral: [
      '味道有点浓，希望出无香版',
      '用了两周变化不太明显，继续观察',
      '量不大，一瓶估计用不了太久',
    ],
    negative: [
      '用了一次就过敏了，敏感肌慎入',
      '感觉没什么效果，不如之前用的牌子',
      '酒精味好重，不敢用了',
      '用了疯狂长闭口，停用后好转了',
      '保质期只剩半年了，感觉是库存货',
    ],
  },
  electronics: {
    positive: [
      '音质真的很棒，低音震撼',
      '续航真的强，充一次电用了好几天',
      '连接稳定，没有断连过',
      '做工精致，手感很好',
      '降噪效果一流，地铁上很安静',
      '操作简单，上手很快',
    ],
    neutral: [
      'App界面可以再优化一下',
      '触控有时不太灵敏',
      '充电口位置设计不太合理',
    ],
    negative: [
      '用了两个月就坏了，质量堪忧',
      '充电接口接触不良',
      '续航缩水，和宣传的差很多',
      '噪音有点大，晚上没法用',
      '宣传的功能实际体验一般',
    ],
  },
  food: {
    positive: [
      '味道超赞，回购定了',
      '配料表很干净，吃着放心',
      '分量很足，一包能吃好久',
      '辣度刚好，很过瘾',
      '包装很严实，没有压碎',
    ],
    neutral: [
      '甜度可以再调整一下',
      '希望出小包装试吃',
      '保质期有点短',
    ],
    negative: [
      '太辣了，完全受不了',
      '包装破了，洒了一地',
      '味道一般，不值这个价',
      '分量感觉变少了',
      '吃了肚子不舒服',
    ],
  },
  fashion: {
    positive: [
      '面料很舒服，穿着很柔软',
      '版型很好，显瘦显高',
      '做工精细，没有线头',
      '颜色很正，和图片一样',
      '洗了几次不变形不掉色',
    ],
    neutral: [
      '尺码偏大，建议买小一号',
      '面料比想象中薄一点',
      '颜色选择太少了',
    ],
    negative: [
      '色差严重，和图片完全不一样',
      '穿了一次就起球了',
      '线头太多了，做工粗糙',
      '洗了缩水严重',
      '拉链卡顿，不太好拉',
    ],
  },
  home: {
    positive: [
      '颜值很高，放在家里很好看',
      '出雾很细腻，效果很好',
      '静音效果不错，不影响睡眠',
      '做工精细，细节处理很好',
      '收纳方便，不占地方',
    ],
    neutral: [
      '容量比预期小一点',
      '灯光有点太亮了',
      '定时功能时间有点短',
    ],
    negative: [
      '用了几天就有异响了',
      '漏水！把桌子都弄湿了',
      '塑料感比较重',
      '按键不灵敏，要按好几次',
      '使用一周后底部发霉了',
    ],
  },
  health: {
    positive: [
      '效果确实有，坚持用了半个月',
      '成分很安全，没有副作用',
      '是正品，品质有保障',
      '客服很专业，耐心解答',
    ],
    neutral: [
      '刚开始用，效果还不太明显',
      '颗粒有点大不太容易吞',
    ],
    negative: [
      '吃了半个月一点效果都没有',
      '有副作用，胃不舒服',
      '价格太贵了',
      '味道太苦了，喝不下去',
      '包装破损，洒了不少',
    ],
  },
};

interface CategoryAnalysis {
  positiveTopics: string[];
  neutralTopics: string[];
  negativeTopics: string[];
  painPoints: string[];
  featureRequests: string[];
}

const CATEGORY_ANALYSIS_DATA: Record<string, CategoryAnalysis> = {
  beauty: {
    positiveTopics: ['补水效果好', '成分温和', '包装精致', '性价比高', '回购多次', '敏感肌友好', '上妆服帖'],
    neutralTopics: ['物流速度', '价格适中', '容量大小', '香味偏好', '使用教程', '色差问题'],
    negativeTopics: ['不适合敏感肌', '包装简陋', '效果不明显', '保质期短', '价格偏高'],
    painPoints: ['用后过敏', '保湿不持久', '瓶口设计不好', '香味刺鼻', '酒精味重', '长闭口'],
    featureRequests: ['出无香版本', '增加旅行装', '优化包装防漏', '推出大容量装', '分肤质定制'],
  },
  electronics: {
    positiveTopics: ['音质出色', '续航持久', '连接稳定', '做工精致', '降噪效果好', '操作简单'],
    neutralTopics: ['APP体验', '触控灵敏度', '充电设计', '外观款式', '功能使用率'],
    negativeTopics: ['质量不稳', '充电问题', '续航虚标', '噪音偏大', '功能缩水'],
    painPoints: ['容易损坏', '充电困难', '续航不足', '噪音过大', '触控失灵'],
    featureRequests: ['优化连接稳定性', '提升续航', '降低噪音', '改善做工', '增加功能'],
  },
  food: {
    positiveTopics: ['味道超赞', '配料干净', '分量充足', '包装严实', '辣度刚好', '回购意愿强'],
    neutralTopics: ['甜度偏好', '份量大小', '包装开合', '保质期'],
    negativeTopics: ['太辣了', '包装破损', '分量太少', '保质期短', '味道一般', '品控不稳'],
    painPoints: ['辣度过高', '包装碎裂', '份量不足', '味道不符', '快递暴力'],
    featureRequests: ['出微辣版本', '独立小包装', '增加试吃装', '推出混合口味', '加大分量'],
  },
  fashion: {
    positiveTopics: ['面料舒适', '版型显瘦', '做工精细', '颜色正', '洗后不变形'],
    neutralTopics: ['尺码偏差', '颜色差异', '面料薄厚', '物流速度'],
    negativeTopics: ['色差严重', '起球', '线头多', '面料差', '尺码不准', '拉链卡顿'],
    painPoints: ['色差', '起球', '线头多', '缩水', '退货麻烦'],
    featureRequests: ['增加尺码', '提供试穿服务', '出加长版', '优化退换流程', '增加面料说明'],
  },
  home: {
    positiveTopics: ['颜值高', '出雾细腻', '静音效果好', '做工精细', '收纳方便'],
    neutralTopics: ['容量大小', '灯光亮度', '颜色款式', '定时时长'],
    negativeTopics: ['有异响', '漏水', '喷雾差', '塑料感', '发霉'],
    painPoints: ['机器异响', '漏水', '出雾量小', '外壳粗糙', '按键失灵', '发霉'],
    featureRequests: ['增加容量', '可调灯光亮度', '深色款式', '遥控器控制', '增加定时选项'],
  },
  health: {
    positiveTopics: ['效果明显', '成分安全', '品质正品', '物流快', '客服好', '回购多次'],
    neutralTopics: ['价格偏高', '效果待观察', '颗粒大小', '味道接受度'],
    negativeTopics: ['没有效果', '副作用', '价格虚高', '包装破损', '口感差'],
    painPoints: ['无效', '胃不适', '太贵', '味道苦', '包装损坏'],
    featureRequests: ['出小包装试用', '优化口感', '分剂型选择', '增加服用指南', '推出订阅制'],
  },
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function getCategoryComments(category: string): SentimentPool {
  const cat = CATEGORY_COMMENTS[category];
  const gen = GENERIC_COMMENTS;
  if (!cat) {
    return gen;
  }
  // Merge category-specific with generic
  return {
    positive: [...gen.positive, ...cat.positive],
    neutral: [...gen.neutral, ...(cat.neutral || [])],
    negative: [...gen.negative, ...(cat.negative || [])],
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('填充缺失评论 — 仅处理 0 评论的商品');
  console.log('='.repeat(60));

  // 1. 找到有0条评论的商品
  const productsWithCount = await prisma.$queryRawUnsafe<Array<{ id: string; title: string; category: string; comment_count: string }>>(
    `SELECT p.id, p.title, p.category, COUNT(c.id)::text AS comment_count
     FROM products p
     LEFT JOIN comments c ON c.product_id = p.id
     GROUP BY p.id, p.title, p.category
     HAVING COUNT(c.id) = 0`
  );

  if (productsWithCount.length === 0) {
    console.log('所有商品都已有评论数据。');
    await prisma.$disconnect();
    return;
  }

  console.log(`找到 ${productsWithCount.length} 个缺少评论的商品\n`);

  // 2. 为每个商品生成评论
  const sentimentRatio: Array<'positive' | 'neutral' | 'negative'> = [
    ...Array(6).fill('positive' as const),
    ...Array(2).fill('neutral' as const),
    ...Array(2).fill('negative' as const),
  ];

  let totalComments = 0;
  let totalAnalyses = 0;

  for (const product of productsWithCount) {
    const count = randomInt(MIN_COMMENTS, MAX_COMMENTS);
    const category = (product.category || 'home').toLowerCase();
    const pool = getCategoryComments(category);
    const analysis = CATEGORY_ANALYSIS_DATA[category] || CATEGORY_ANALYSIS_DATA.home;

    console.log(`  [${product.title}] 品类=${category}, 生成 ${count} 条评论...`);

    // 去重 externalId
    const usedExternalIds = new Set<string>();

    for (let i = 0; i < count; i++) {
      const sentiment = sentimentRatio[i % sentimentRatio.length];
      const contents = pool[sentiment];
      const content = contents[i % contents.length] + (i >= contents.length ? ` (${Math.floor(i / contents.length) + 1})` : '');

      const externalId = `cmt_${product.id}_${String(i).padStart(4, '0')}`;
      if (usedExternalIds.has(externalId)) continue;
      usedExternalIds.add(externalId);

      // prepare analysis data
      let keyTopics: string[] = [];
      let painPoints: string[] = [];
      let featureRequests: string[] = [];
      let purchasingIntent = 0.0;

      if (sentiment === 'positive') {
        keyTopics = pick(analysis.positiveTopics, randomInt(1, 3));
        purchasingIntent = Math.round((0.65 + Math.random() * 0.35) * 100) / 100;
      } else if (sentiment === 'neutral') {
        keyTopics = pick(analysis.neutralTopics, randomInt(1, 2));
        purchasingIntent = Math.round((0.3 + Math.random() * 0.4) * 100) / 100;
      } else {
        keyTopics = pick(analysis.negativeTopics, randomInt(1, 3));
        painPoints = pick(analysis.painPoints, randomInt(1, 2));
        featureRequests = pick(analysis.featureRequests, randomInt(0, 2));
        purchasingIntent = Math.round(Math.random() * 0.3 * 100) / 100;
      }

      // Create comment
      const comment = await prisma.comment.create({
        data: {
          productId: product.id,
          platform: 'tiktok',
          externalId,
          authorName: `user_${randomInt(1000, 9999)}`,
          content,
          likeCount: randomInt(1, 120),
          replyCount: randomInt(0, 15),
          commentedAt: new Date(Date.now() - randomInt(1, 60) * 86400000),
        },
      });

      // Create analysis if PRE_ANALYZE
      if (PRE_ANALYZE) {
        await prisma.commentAnalysis.create({
          data: {
            commentId: comment.id,
            sentiment,
            keyTopics,
            painPoints,
            featureRequests,
            purchasingIntent,
            confidence: Math.round((0.75 + Math.random() * 0.25) * 100) / 100,
            analyzedAt: new Date(),
            modelUsed: 'doubao-seed-2-0-pro-251130',
          },
        });
        totalAnalyses++;
      }

      totalComments++;
    }

    console.log(`    完成: ${count} 条评论 + ${PRE_ANALYZE ? count : 0} 条分析`);
  }

  console.log(`\n总计: ${totalComments} 条评论, ${totalAnalyses} 条分析`);
  console.log('完成!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('种子失败:', err);
  prisma.$disconnect();
  process.exit(1);
});
