import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 是否在 seed 时预生成 CommentAnalysis。
 * 设为 false 时评论处于"待分析"状态，需通过页面批量分析按钮触发分析流程 */
const PRE_ANALYZE = true;

async function main(): Promise<void> {
  console.log('========================================');
  console.log('Comment Seed — Mock Data Generator');
  console.log('========================================\n');

  // 1. 清理旧评论数据
  console.log('[1] Cleaning old comment data...');
  await prisma.contentOptimization.deleteMany();
  await prisma.commentAnalysis.deleteMany();
  await prisma.comment.deleteMany();
  console.log('  Done.\n');

  // 2. 读取已有商品
  console.log('[2] Reading existing products...');
  const products = await prisma.product.findMany();
  if (products.length === 0) {
    console.log('  No products found. Please run comprehensive-seed first.');
    return;
  }
  console.log(`  Found ${products.length} products.\n`);

  // 3. 按品类的评论模板（情感与内容语义一致）
  const commentPools: Record<string, { positive: string[]; neutral: string[]; negative: string[] }> = {
    beauty: {
      positive: [
        '用了三天皮肤真的变水润了，会回购！', '包装很高档，送闺蜜生日礼物超合适', '性价比超高，这个价格能买到这个品质很值',
        '质地很清爽，不油腻，油皮也能用', '味道好好闻，淡淡的玫瑰香', '使用一周毛孔明显变小了，太惊喜了',
        '补水效果一流，敷完面膜第二天上妆超服帖', '敏感肌用了没有过敏，成分很温和', '回购第三次了，绝对是真爱',
        '精华液吸收很快，涂完不黏腻', '对比大牌完全不输，国货真的崛起了', '使用方便，懒人友好，躺着就能护肤',
      ],
      neutral: [
        '效果还行，可能需要多用一段时间', '刚收到还没用，包装不错', '价格有点小贵，希望能多做活动',
        '味道有点浓，希望出无香版', '用了两周变化不太明显，继续观察', '物流有点慢，等了五天才到',
      ],
      negative: [
        '效果一般，可能不适合我的肤质', '用了一次就过敏了，敏感肌慎入', '感觉没什么效果，不如之前用的牌子',
        '包装太简陋了，盖子都压坏了', '保质期只剩半年了，感觉是库存货', '性价比不高，比别的牌子贵',
      ],
    },
    fitness: {
      positive: [
        '数据很准，和专业设备对比过误差小于1%', '续航真的强，充一次电用了整整一个月', '佩戴舒适，戴一整天也不会觉得累',
        '外观太帅了，健身房的教练都问我哪里买的', '操作简单，连接APP也很顺畅', '睡眠监测功能很实用，改善了我的作息',
        '心率监测很灵敏，运动时数据很稳定', '防水功能很好，游泳戴着完全没问题', '性价比炸裂，比苹果手表实用多了',
      ],
      neutral: [
        'App体验一般，界面可以再优化一下', '功能挺多的，但有些功能用不上', '表带有点短，手腕粗的要多加一节',
        '计步器偶尔会多算几步', '触屏灵敏度一般，湿手不太好操作',
      ],
      negative: [
        '用了两个月表带就断了，质量堪忧', '充电接口不太好，经常接触不良', '屏幕不耐划，才一周就有了划痕',
        '宣传的30天续航实际只有20天左右', '客服态度很差，问题解决不了',
      ],
    },
    food: {
      positive: [
        '味道绝了！根本停不下来，回购回购', '包装很用心，到货没有任何破损，物流也快', '性价比超高，大包装比超市便宜一半',
        '配料表很干净，没有乱七八糟的添加剂', '太好吃了吧！同事吃了都问我要链接', '螺蛳粉天花板！比店里吃的还好吃',
        '酸笋够味！腐竹给得也很足', '辣度刚好，不是那种纯辣，很有层次', '坚果很新鲜，没有哈喇味',
      ],
      neutral: [
        '口感偏甜，不太适合我这种咸党', '份量比想象中少，一个人不够吃', '包装太难撕了，每次都要用剪刀',
        '味道中规中矩，没有网上说的那么神', '还行吧，尝尝鲜可以，不会特意回购',
      ],
      negative: [
        '太辣了！微辣的辣度都受不了', '收到时盒子都压扁了，里面碎了好多', '味道太重了，吃完一屋子都是味',
        '保质期只有一个月，根本吃不完', '感觉不如之前买的那个牌子好吃',
      ],
    },
    tech: {
      positive: [
        '降噪效果超出预期，地铁上也能安静听歌', '音质太棒了，低音下潜很深，高音不刺耳', '连接超稳，用了一周没断联过一次',
        '做工精致，细节处理比大厂还好', '续航给力！轻度使用一周充一次', '佩戴舒适，戴三小时耳朵也不疼',
        '充电速度飞快，十分钟就能用两小时', '防水实测OK，跑步出汗完全没问题', '颜值在线，这个颜色真的太高级了',
      ],
      neutral: [
        '音质还行，对得起这个价位', '降噪够用但不如宣传的那么好', '充电盒有点大，放口袋不太方便',
        '触控太灵敏了，经常误触', '说明书太简略，摸索了半天功能',
      ],
      negative: [
        '电池续航虚标，实际使用时间少一半', '左耳经常断联，换了几个手机都一样', '佩戴舒适度太差了，耳朵疼',
        '用了不到一个月充电仓就充不进电了', '客服回复超慢，售后体验很差',
      ],
    },
    home: {
      positive: [
        '颜值太高了！放在卧室氛围感拉满', '静音效果超好，睡觉完全听不到声音', '出雾很细腻，加一次水能用一整晚',
        '氛围灯很柔和，拍照超好看', '收纳盒质量很好，抽屉终于整齐了', '做工精细，完全看不出这个价格',
        '精油扩散范围很大，整个房间都能闻到', '定时功能很方便，设置好就不用管了', '买给妈妈的，她特别喜欢',
      ],
      neutral: [
        '容量比预期小，两天就得加一次水', '灯光有点太亮了，不能调得更暗', '说明书字太小了看得费劲',
        '白色容易脏，希望能出深色款',
      ],
      negative: [
        '用了三天就有异响了，声音越来越大', '漏水！把桌子都弄湿了', '喷雾效果很差，基本感觉不到',
        '塑料感比较重，跟图片不太一样',
      ],
    },
    pet: {
      positive: [
        '猫咪终于肯乖乖上厕所了！太神奇了', '出差三天回来猫砂盆干干净净，太满意了', '噪音很小，猫咪不害怕',
        '自动铲屎功能真的很方便，解放双手', '猫咪超爱吃！挑嘴猫也光盘了', 'APP监控功能太实用，出门也能看猫咪',
        '除臭效果一流，家里一点味道都没有', '罐头打开就是大块的肉，料很实在', '做工很好，边角圆润不伤猫',
      ],
      neutral: [
        '空间有点小，大猫转身不太方便', '猫粮颗粒有点大，小猫吃不了', '价格偏高，希望能有促销活动',
      ],
      negative: [
        '感应器不太灵敏，有时候不会自动清理', '用了没几天电机声音变得很响', '猫咪完全不吃这个罐头，浪费了',
        '猫砂盆的盖子卡住了好几次', 'APP经常掉线，推送延迟严重',
      ],
    },
  };

  const categoryAnalysis: Record<string, {
    positiveTopics: string[]; neutralTopics: string[]; negativeTopics: string[];
    painPoints: string[]; featureRequests: string[];
  }> = {
    beauty: {
      positiveTopics: ['补水效果好', '成分温和', '包装精致', '性价比高', '回购多次', '敏感肌友好'],
      neutralTopics: ['物流速度', '价格适中', '容量大小', '香味偏好', '使用教程'],
      negativeTopics: ['不适合敏感肌', '包装简陋', '效果不明显', '保质期短', '价格偏高'],
      painPoints: ['用后过敏', '保湿不持久', '瓶口设计不好', '精华液太少', '香味刺鼻'],
      featureRequests: ['出无香版本', '增加旅行装', '优化包装防漏', '推出大容量装', '增加SPF防晒款'],
    },
    fitness: {
      positiveTopics: ['数据精准', '续航持久', '佩戴舒适', '功能全面', '防水实用'],
      neutralTopics: ['APP体验', '表带款式', '触屏灵敏度', '重量适中'],
      negativeTopics: ['表带易断', '充电接触不良', '屏幕易划', '续航缩水', '客服体验'],
      painPoints: ['表带断裂', '充电困难', '屏幕划痕', '续航不足', '客服响应慢'],
      featureRequests: ['增加表带颜色', '优化APP界面', '支持血氧检测', '表盘自定义', '增加运动模式'],
    },
    food: {
      positiveTopics: ['味道超赞', '包装严实', '配料干净', '分量足', '辣度刚好'],
      neutralTopics: ['甜度偏好', '份量大小', '包装开合', '复购意愿'],
      negativeTopics: ['太辣了', '包装破损', '分量太少', '保质期短', '味道一般'],
      painPoints: ['辣度过高', '包装碎了', '份量不足', '吃后有不适', '味道与描述不符'],
      featureRequests: ['出微辣版本', '单独包装', '增加试吃装', '推出混合口味', '简化包装打开方式'],
    },
    tech: {
      positiveTopics: ['降噪效果好', '音质出色', '连接稳定', '做工精良', '续航给力'],
      neutralTopics: ['充电盒大小', '触控灵敏度', '说明书详细度', '配件齐全度'],
      negativeTopics: ['续航缩水', '断连频繁', '佩戴不舒适', '充电仓故障', '售后体验差'],
      painPoints: ['续航虚标', '耳机断连', '耳朵疼痛', '充电仓坏了', '声音延迟'],
      featureRequests: ['增加无线充电', '优化佩戴设计', 'APP自定义EQ', '增加通透模式', '推出更多颜色'],
    },
    home: {
      positiveTopics: ['颜值高', '出雾细腻', '静音效果好', '氛围灯漂亮', '做工精细'],
      neutralTopics: ['容量大小', '灯光亮度', '说明书', '颜色款式'],
      negativeTopics: ['有异响', '漏水', '喷雾差', '塑料感', '质量不稳'],
      painPoints: ['机器异响', '漏水', '出雾量小', '外壳粗糙', '按键失灵'],
      featureRequests: ['增加容量', '可调灯光亮度', '深色款式', '遥控器控制', '增加定时选项'],
    },
    pet: {
      positiveTopics: ['猫咪喜欢', '自动清洁方便', '噪音低', '除臭效果好', 'APP好用'],
      neutralTopics: ['空间大小', '猫粮颗粒', '价格接受度'],
      negativeTopics: ['感应失灵', '电机噪音', '猫不吃', '盖子卡住', 'APP断连'],
      painPoints: ['感应迟钝', '电机异响', '猫拒食', '结构卡住', 'APP推送延迟'],
      featureRequests: ['加大内部空间', '优化感应灵敏度', '增加猫品种适配', '推出试用装', '远程固件升级'],
    },
  };

  const defaultAnalysis = {
    positiveTopics: ['品质好', '物流快', '性价比高'],
    neutralTopics: ['还行', '一般般', '再看看'],
    negativeTopics: ['不太满意', '质量差', '不值'],
    painPoints: ['品质问题', '物流太慢', '客服态度差'],
    featureRequests: ['改善质量', '加快物流', '优化服务'],
  };

  const allSentiments: Array<'positive' | 'neutral' | 'negative'> = [
    'positive', 'positive', 'positive', 'positive', 'positive', 'positive',
    'neutral', 'neutral',
    'negative', 'negative',
  ];

  const authorPool = ['爱吃的小仙女', '数码控Leo', '健身达人M', '美妆博主C', '居家好物分享',
    '猫咪铲屎官', '美食侦探', '护肤小能手', '科技评测君', '运动boy', '打工人的日常', '吃瓜群众',
    '好物推荐官', '旅行中的吃货', '宅家日记', '生活家Momo', '野生评论员', '真实测评不踩雷'];

  let totalComments = 0;
  let totalAnalyses = 0;

  console.log('[3] Generating comments for all products...\n');

  for (const product of products) {
    const cat = product.category as keyof typeof commentPools;
    const pools = commentPools[cat] || commentPools.beauty;
    const analysis = categoryAnalysis[cat] || defaultAnalysis;
    const commentsCount = 18 + Math.floor(Math.random() * 8);

    for (let i = 0; i < commentsCount; i++) {
      const sentiment = allSentiments[i % allSentiments.length];
      const contentPool = pools[sentiment];
      const content = contentPool[Math.floor(Math.random() * contentPool.length)];
      const authorName = authorPool[Math.floor(Math.random() * authorPool.length)];
      const daysAgo = Math.floor(Math.random() * 60) + 1;

      const topicPool = sentiment === 'positive' ? analysis.positiveTopics :
        sentiment === 'neutral' ? analysis.neutralTopics : analysis.negativeTopics;

      const selectedTopics = topicPool.slice(0, 1 + Math.floor(Math.random() * 3));
      const selectedPainPoints = sentiment === 'negative'
        ? analysis.painPoints.slice(0, 1 + Math.floor(Math.random() * 2))
        : [];
      const selectedFeatureRequests = sentiment === 'neutral'
        ? analysis.featureRequests.slice(0, 1 + Math.floor(Math.random() * 2))
        : [];

      const purchasingIntent = sentiment === 'positive'
        ? 0.7 + Math.random() * 0.3
        : sentiment === 'neutral'
          ? 0.25 + Math.random() * 0.35
          : Math.random() * 0.2;

      const comment = await prisma.comment.create({
        data: {
          productId: product.id,
          platform: Math.random() > 0.3 ? 'tiktok' : 'douyin',
          externalId: `cmt_${product.skuCode}_${i}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          videoUrl: `https://www.tiktok.com/@seller/video/${Math.floor(7350000000000000 + Math.random() * 999999)}`,
          authorName,
          content,
          likeCount: Math.floor(Math.random() * 800),
          replyCount: Math.floor(Math.random() * 30),
          commentedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        },
      });

      if (PRE_ANALYZE) {
        await prisma.commentAnalysis.create({
          data: {
            commentId: comment.id,
            sentiment,
            keyTopics: selectedTopics,
            painPoints: selectedPainPoints,
            featureRequests: selectedFeatureRequests,
            purchasingIntent: Math.round(purchasingIntent * 100) / 100,
            rawAnalysis: {
              keywords: content.replace(/[，。！？、,.!?\s]/g, '').slice(0, 6).split(''),
              emotion_score: sentiment === 'positive' ? 0.8 + Math.random() * 0.2 : sentiment === 'neutral' ? 0.4 + Math.random() * 0.2 : Math.random() * 0.3,
              purchase_signal_words: purchasingIntent > 0.5 ? ['想买', '下单', '回购'].slice(0, Math.floor(Math.random() * 3) + 1) : [],
              review_quality: Math.floor(Math.random() * 5) + 1,
            },
            confidence: 0.75 + Math.random() * 0.25,
            modelUsed: 'doubao-seed-2-0-pro-251130',
            analyzedAt: new Date(Date.now() - (daysAgo - 1) * 24 * 60 * 60 * 1000),
          },
        });
        totalAnalyses++;
      }
      totalComments++;
    }
    console.log(`  ✓ ${product.skuCode} (${product.category}): ${commentsCount} comments`);
  }
  console.log(`\nDone! Created ${totalComments} comments and ${totalAnalyses} analyses for ${products.length} products.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
