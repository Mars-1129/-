/**
 * TikStream AI — 评论分析模块大规模 Mock 数据种子
 *
 * 覆盖品类: beauty / fitness / food / electronics / fashion / home / health
 * 每个产品生成 40-60 条评论 + 预分析 + 内容优化建议
 *
 * 执行: npx tsx prisma/seed-comments-massive.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const PRE_ANALYZE = true;
const GENERATE_OPTIMIZATIONS = true;
const MIN_COMMENTS = 40;
const MAX_COMMENTS = 60;

// =============================================================================
// 品类评论池 (7 品类 x 3 情感 x ~12 条)
// =============================================================================

interface SentimentPool {
  positive: string[];
  neutral: string[];
  negative: string[];
}

const COMMENT_POOLS: Record<string, SentimentPool> = {
  beauty: {
    positive: [
      '用了三天皮肤真的变水润了，会回购！',
      '包装很高档，送闺蜜生日礼物超合适',
      '性价比超高，这个价格能买到这个品质很值',
      '质地很清爽，不油腻，油皮也能用',
      '味道好好闻，淡淡的玫瑰香',
      '使用一周毛孔明显变小了，太惊喜了',
      '补水效果一流，敷完面膜第二天上妆超服帖',
      '敏感肌用了没有过敏，成分很温和',
      '回购第三次了，绝对是真爱',
      '精华液吸收很快，涂完不黏腻',
      '对比大牌完全不输，国货真的崛起了',
      '使用方便，懒人友好，躺着就能护肤',
      '眼霜用了一个月细纹真的淡了！',
      '防晒不搓泥不假白，爱了爱了',
      '唇釉颜色绝美，日常约会都适合',
    ],
    neutral: [
      '效果还行，可能需要多用一段时间',
      '刚收到还没用，包装不错',
      '价格有点小贵，希望能多做活动',
      '味道有点浓，希望出无香版',
      '用了两周变化不太明显，继续观察',
      '物流有点慢，等了五天才到',
      '颜色和图片有一点点色差',
      '量不大，一瓶估计用不了太久',
    ],
    negative: [
      '效果一般，可能不适合我的肤质',
      '用了一次就过敏了，敏感肌慎入',
      '感觉没什么效果，不如之前用的牌子',
      '包装太简陋了，盖子都压坏了',
      '保质期只剩半年了，感觉是库存货',
      '性价比不高，比别的牌子贵',
      '味道太香了，熏得头痛',
      '酒精味好重，不敢用了',
      '用了疯狂长闭口，停用后好转了',
      '瓶子设计太难倒了，每次都倒多',
      '买到假货了，和专柜的完全不一样',
    ],
  },
  fitness: {
    positive: [
      '数据很准，和专业设备对比过误差小于1%',
      '续航真的强，充一次电用了整整一个月',
      '佩戴舒适，戴一整天也不会觉得累',
      '外观太帅了，健身房的教练都问我哪里买的',
      '操作简单，连接APP也很顺畅',
      '睡眠监测功能很实用，改善了我的作息',
      '心率监测很灵敏，运动时数据很稳定',
      '防水功能很好，游泳戴着完全没问题',
      '性价比炸裂，比苹果手表实用多了',
      '运动模式超多，瑜伽模式也有太惊喜了',
      '血氧检测功能在特殊时期真的很让人安心',
      '表盘自定义太好玩了，每天换个新表盘',
    ],
    neutral: [
      'App体验一般，界面可以再优化一下',
      '功能挺多的，但有些功能用不上',
      '表带有点短，手腕粗的要多加一节',
      '计步器偶尔会多算几步',
      '触屏灵敏度一般，湿手不太好操作',
      '颜色选择太少了，希望出个粉色',
    ],
    negative: [
      '用了两个月表带就断了，质量堪忧',
      '充电接口不太好，经常接触不良',
      '屏幕不耐划，才一周就有了划痕',
      '宣传的30天续航实际只有20天左右',
      '客服态度很差，问题解决不了',
      'GPS定位不准，跑步路线画得乱七八糟',
      '心率监测经常不准确，误差很大',
      '系统升级后越来越卡了',
    ],
  },
  food: {
    positive: [
      '味道绝了！根本停不下来，回购回购',
      '包装很用心，到货没有任何破损，物流也快',
      '性价比超高，大包装比超市便宜一半',
      '配料表很干净，没有乱七八糟的添加剂',
      '太好吃了吧！同事吃了都问我要链接',
      '螺蛳粉天花板！比店里吃的还好吃',
      '酸笋够味！腐竹给得也很足',
      '辣度刚好，不是那种纯辣，很有层次',
      '坚果很新鲜，没有哈喇味，颗粒很大',
      '方便速食里最好吃的，加班必备',
      '早上泡一杯就够了，饱腹感很强',
      '给爸妈买了好几箱了，他们都说好',
    ],
    neutral: [
      '口感偏甜，不太适合我这种咸党',
      '份量比想象中少，一个人不够吃',
      '包装太难撕了，每次都要用剪刀',
      '味道中规中矩，没有网上说的那么神',
      '还行吧，尝尝鲜可以，不会特意回购',
      '保质期标注不太清晰',
    ],
    negative: [
      '太辣了！微辣的辣度都受不了',
      '收到时盒子都压扁了，里面碎了好多',
      '味道太重了，吃完一屋子都是味',
      '保质期只有一个月，根本吃不完',
      '感觉不如之前买的那个牌子好吃',
      '吃完胃不舒服，不知道是不是太油',
      '品控不行，这次的明显不如上次',
      '快递暴力运输，包装袋都破了',
      '试了三个口味都很一般',
    ],
  },
  electronics: {
    positive: [
      '降噪效果超出预期，地铁上也能安静听歌',
      '音质太棒了，低音下潜很深，高音不刺耳',
      '连接超稳，用了一周没断联过一次',
      '做工精致，细节处理比大厂还好',
      '续航给力！轻度使用一周充一次',
      '佩戴舒适，戴三小时耳朵也不疼',
      '充电速度飞快，十分钟就能用两小时',
      '防水实测OK，跑步出汗完全没问题',
      '颜值在线，这个颜色真的太高级了',
      '同价位最能打的耳机，没有之一',
      '游戏模式延迟很低，吃鸡无压力',
      '通话降噪也很强，对方听得很清楚',
    ],
    neutral: [
      '音质还行，对得起这个价位',
      '降噪够用但不如宣传的那么好',
      '充电盒有点大，放口袋不太方便',
      '触控太灵敏了，经常误触',
      '说明书太简略，摸索了半天功能',
      '颜色不太经脏',
    ],
    negative: [
      '电池续航虚标，实际使用时间少一半',
      '左耳经常断联，换了几个手机都一样',
      '佩戴舒适度太差了，耳朵疼',
      '用了不到一个月充电仓就充不进电了',
      '客服回复超慢，售后体验很差',
      '蓝牙连接距离太短，隔一堵墙就断了',
      '充电仓盖子松松垮垮的',
      '右耳时不时的会有杂音',
    ],
  },
  fashion: {
    positive: [
      '版型超正！穿上就是行走的衣架子',
      '面料很舒服，完全不扎，贴身穿也OK',
      '颜色和图片一模一样，不是照骗',
      '做工很好，线头都处理得很干净',
      '百搭款！配牛仔裤和裙子都好看',
      '洗了好几次了，不变形不掉色',
      '同事们都说好看，都被我安利了',
      '这个价格买到这种品质太值了',
      '袖子长度刚好，不短不长',
      '很显瘦！遮住了我的小肚子',
    ],
    neutral: [
      '码数偏小，建议拍大一码',
      '颜色比图片暗了一点',
      '物流速度一般，等了四天才到',
      '没有模特穿的好看，但也不差',
      '面料有点薄，夏天穿刚合适',
    ],
    negative: [
      '色差太大了，完全不是一个颜色',
      '面料起球严重，穿了两次就起球',
      '做工很粗糙，到处都是线头',
      '印花裂开了，洗了一次就报废',
      '尺寸偏大太多，S码像M码',
      '退货要自己出运费，不敢再买了',
      '拉链卡卡的，很不顺滑',
      '有股刺鼻的味道，洗了两次还有',
    ],
  },
  home: {
    positive: [
      '颜值太高了！放在卧室氛围感拉满',
      '静音效果超好，睡觉完全听不到声音',
      '出雾很细腻，加一次水能用一整晚',
      '氛围灯很柔和，拍照超好看',
      '收纳盒质量很好，抽屉终于整齐了',
      '做工精细，完全看不出这个价格',
      '精油扩散范围很大，整个房间都能闻到',
      '定时功能很方便，设置好就不用管了',
      '买给妈妈的，她特别喜欢',
      '用了之后真的有变整洁',
    ],
    neutral: [
      '容量比预期小，两天就得加一次水',
      '灯光有点太亮了，不能调得更暗',
      '说明书字太小了看得费劲',
      '白色容易脏，希望能出深色款',
      '自动关闭时间有点短',
    ],
    negative: [
      '用了三天就有异响了，声音越来越大',
      '漏水！把桌子都弄湿了',
      '喷雾效果很差，基本感觉不到',
      '塑料感比较重，跟图片不太一样',
      '按键不灵敏，要按好几次',
      '使用一周后底部发霉了',
      '电源线太短，必须靠近插座放',
    ],
  },
  health: {
    positive: [
      '泡了一周感觉睡眠质量真的有改善',
      '用起来很舒服，味道很天然',
      '效果明显，坚持用了半个月变化很大',
      '成分很安全，孕妇也可以用',
      '包装很好，没有任何破损',
      '是正品，和之前买的品质一样',
      '性价比很高，比代购便宜多了',
      '发货超级快，次日就到了',
      '已经回购第二次了，推荐给朋友了',
      '客服态度很好，耐心回答我的问题',
    ],
    neutral: [
      '刚开始用，效果还不太明显',
      '价格略高但品质看起来不错',
      '颗粒有点大不太容易吞',
      '味道不太好接受但为了效果忍了',
    ],
    negative: [
      '吃了半个月一点效果都没有',
      '有副作用，吃了胃不舒服',
      '价格太贵了，同样的东西别的店便宜一半',
      '味道太苦了，完全喝不下去',
      '包装破损，洒了不少',
      '保质期标注有问题，和生产日期对不上',
    ],
  },
};

// =============================================================================
// 品类分析维度
// =============================================================================

interface CategoryAnalysisData {
  positiveTopics: string[];
  neutralTopics: string[];
  negativeTopics: string[];
  painPoints: string[];
  featureRequests: string[];
}

const CATEGORY_ANALYSIS: Record<string, CategoryAnalysisData> = {
  beauty: {
    positiveTopics: ['补水效果好', '成分温和', '包装精致', '性价比高', '回购多次', '敏感肌友好', '上妆服帖', '急救修复'],
    neutralTopics: ['物流速度', '价格适中', '容量大小', '香味偏好', '使用教程', '色差问题'],
    negativeTopics: ['不适合敏感肌', '包装简陋', '效果不明显', '保质期短', '价格偏高', '产品过期', '瓶身设计'],
    painPoints: ['用后过敏', '保湿不持久', '瓶口设计不好', '精华液太少', '香味刺鼻', '酒精味重', '长闭口'],
    featureRequests: ['出无香版本', '增加旅行装', '优化包装防漏', '推出大容量装', '增加SPF防晒款', '分肤质定制'],
  },
  fitness: {
    positiveTopics: ['数据精准', '续航持久', '佩戴舒适', '功能全面', '防水实用', '外观时尚', '睡眠监测'],
    neutralTopics: ['APP体验', '表带款式', '触屏灵敏度', '重量适中', '颜色选择'],
    negativeTopics: ['表带易断', '充电接触不良', '屏幕易划', '续航缩水', '客服体验', 'GPS不准'],
    painPoints: ['表带断裂', '充电困难', '屏幕划痕', '续航不足', '客服响应慢', '心率不准'],
    featureRequests: ['增加表带颜色', '优化APP界面', '支持血氧检测', '表盘自定义', '增加运动模式', 'GPS精度提升'],
  },
  food: {
    positiveTopics: ['味道超赞', '包装严实', '配料干净', '分量足', '辣度刚好', '回购意愿强'],
    neutralTopics: ['甜度偏好', '份量大小', '包装开合', '复购意愿', '保质期'],
    negativeTopics: ['太辣了', '包装破损', '分量太少', '保质期短', '味道一般', '品控不稳'],
    painPoints: ['辣度过高', '包装碎了', '份量不足', '吃后有不适', '快递暴力', '口味差异'],
    featureRequests: ['出微辣版本', '独立包装', '增加试吃装', '推出混合口味', '简化包装打开方式', '加大分量'],
  },
  electronics: {
    positiveTopics: ['降噪效果好', '音质出色', '连接稳定', '做工精良', '续航给力', '性价比高'],
    neutralTopics: ['充电盒大小', '触控灵敏度', '说明书详细度', '配件齐全度', '颜色耐脏度'],
    negativeTopics: ['续航缩水', '断连频繁', '佩戴不舒适', '充电仓故障', '售后体验差', '蓝牙距离'],
    painPoints: ['续航虚标', '耳机断连', '耳朵疼痛', '充电仓坏了', '声音延迟', '杂音'],
    featureRequests: ['增加无线充电', '优化佩戴设计', 'APP自定义EQ', '增加通透模式', '推出更多颜色', '延长蓝牙距离'],
  },
  fashion: {
    positiveTopics: ['版型好', '面料舒服', '做工精细', '性价比高', '显瘦效果', '颜色好看'],
    neutralTopics: ['尺码偏差', '颜色差异', '面料薄厚', '物流速度'],
    negativeTopics: ['色差严重', '起球', '线头多', '面料差', '尺码不准', '拉链卡顿'],
    painPoints: ['色差', '起球', '线头多', '印花裂', '退货麻烦', '异味'],
    featureRequests: ['增加尺码', '提供试穿服务', '出加长版', '优化退换流程', '增加面料说明'],
  },
  home: {
    positiveTopics: ['颜值高', '出雾细腻', '静音效果好', '氛围灯漂亮', '做工精细', '收纳方便'],
    neutralTopics: ['容量大小', '灯光亮度', '说明书', '颜色款式', '定时时长'],
    negativeTopics: ['有异响', '漏水', '喷雾差', '塑料感', '质量不稳', '发霉'],
    painPoints: ['机器异响', '漏水', '出雾量小', '外壳粗糙', '按键失灵', '发霉'],
    featureRequests: ['增加容量', '可调灯光亮度', '深色款式', '遥控器控制', '增加定时选项', '易清洗结构'],
  },
  health: {
    positiveTopics: ['效果明显', '成分安全', '品质正品', '物流快', '客服好', '回购多次'],
    neutralTopics: ['价格偏高', '效果待观察', '颗粒大小', '味道接受度'],
    negativeTopics: ['没有效果', '副作用', '价格虚高', '包装破损', '保质期问题', '口感差'],
    painPoints: ['无效', '胃不适', '太贵', '味道苦', '包装损坏', '日期对不上'],
    featureRequests: ['出小包装试用', '优化口感', '分剂型选择', '增加服用指南', '推出订阅制'],
  },
};

const DEFAULT_ANALYSIS: CategoryAnalysisData = {
  positiveTopics: ['品质好', '物流快', '性价比高'],
  neutralTopics: ['还行', '一般般', '再看看'],
  negativeTopics: ['不太满意', '质量差', '不值'],
  painPoints: ['品质问题', '物流太慢', '客服态度差'],
  featureRequests: ['改善质量', '加快物流', '优化服务'],
};

// =============================================================================
// 内容优化建议池
// =============================================================================

interface OptimizationTemplate {
  trigger: string;
  suggestionTemplate: string;
}

const OPTIMIZATION_TEMPLATES: Record<string, OptimizationTemplate[]> = {
  beauty: [
    {
      trigger: 'negative_sentiment',
      suggestionTemplate:
        '经分析，${negCount}条负面评论集中在"过敏反应"与"保质期短"两个痛点上。优化方案：\n' +
        '1. 开场：用"敏感肌实测"背书替代直推，增加信任度\n' +
        '2. 中段：增加成分解析画面，降低消费者对成分安全的焦虑\n' +
        '3. 结尾：标注生产日期保证新鲜度，释放库存疑虑\n' +
        '预估 CTR 提升 +12%，负面评论率下降 -25%',
    },
    {
      trigger: 'pain_point',
      suggestionTemplate:
        '核心痛点"保湿不持久"被提及${painCount}次，建议在宣传脚本中增加保湿持久度的实测对比（8小时前后对比），增强证据力。',
    },
    {
      trigger: 'feature_request',
      suggestionTemplate:
        '用户高频需求"无香版本"与"旅行装"，建议在选品页和带货视频中突出"小样试用"与"便携装"选项，降低决策门槛。',
    },
  ],
  electronics: [
    {
      trigger: 'negative_sentiment',
      suggestionTemplate:
        '${negCount}条负面反馈集中在续航虚标和断连问题上。策略调整：\n' +
        '1. 脚本开场加入实测续航数据展示\n' +
        '2. 增加"连接稳定性"的实景演示\n' +
        '3. 末尾加入30天无忧退换降低购买恐惧',
    },
    {
      trigger: 'pain_point',
      suggestionTemplate:
        '痛点"佩戴不舒适"被提及${painCount}次，建议新增佩戴场景展示，并且强调人体工学设计，减少用户对舒适度的担忧。',
    },
    {
      trigger: 'feature_request',
      suggestionTemplate:
        '用户期望"APP自定义EQ"和"无线充电"，可在视频中预告后续固件升级支持，提升产品期待值。',
    },
  ],
};

const DEFAULT_OPTIMIZATIONS: OptimizationTemplate[] = [
  {
    trigger: 'negative_sentiment',
    suggestionTemplate:
      '共${negCount}条负面评论，主要表现为${topPain}。建议在脚本中加强"${fixAction}"的展示，降低消费者疑虑。',
  },
  {
    trigger: 'pain_point',
    suggestionTemplate:
      '"${topPain}"被提及${painCount}次，已触发自动优化。推荐将"${fixAction}"作为视频核心卖点重点突出。',
  },
  {
    trigger: 'feature_request',
    suggestionTemplate:
      '用户呼声最高的是"${topRequest}"，建议在下期脚本中正面回应或预告产品改进，增强品牌亲和力。',
  },
];

// =============================================================================
// 辅助函数
// =============================================================================

const AUTHOR_POOL = [
  '爱吃的小仙女', '数码控Leo', '健身达人M', '美妆博主C', '居家好物分享',
  '猫咪铲屎官', '美食侦探', '护肤小能手', '科技评测君', '运动boy',
  '打工人的日常', '吃瓜群众', '好物推荐官', '旅行中的吃货', '宅家日记',
  '生活家Momo', '野生评论员', '真实测评不踩雷', '小小小仙女🧚', '技术宅Jason',
  '跑马拉松的小王', '极简主义K', '深夜食堂', '宝妈日记', '摄影爱好者',
  '读书人小张', '游戏宅小陈', '穿搭日记M', '职场新人小王', '绿植养护者',
];

/**
 * 从数组中随机取 count 个不重复元素
 */
function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/**
 * 初始化品类评论池（确保所有品类都有基础数据）
 */
function ensurePools(category: string): SentimentPool {
  if (COMMENT_POOLS[category]) return COMMENT_POOLS[category];
  // 降级：合并所有品类的评论，去重
  const allPos: string[] = [];
  const allNeu: string[] = [];
  const allNeg: string[] = [];
  for (const cat of Object.values(COMMENT_POOLS)) {
    allPos.push(...cat.positive);
    allNeu.push(...cat.neutral);
    allNeg.push(...cat.negative);
  }
  return {
    positive: [...new Set(allPos)],
    neutral: [...new Set(allNeu)],
    negative: [...new Set(allNeg)],
  };
}

function ensureAnalysis(category: string): CategoryAnalysisData {
  return CATEGORY_ANALYSIS[category] || DEFAULT_ANALYSIS;
}

function ensureOptimizations(category: string): OptimizationTemplate[] {
  return OPTIMIZATION_TEMPLATES[category] || DEFAULT_OPTIMIZATIONS;
}

// =============================================================================
// 主函数
// =============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('TikStream AI — 评论分析模块 大规模 Mock 数据种子');
  console.log('='.repeat(60));
  console.log(`配置: PRE_ANALYZE=${PRE_ANALYZE} | OPTIMIZATIONS=${GENERATE_OPTIMIZATIONS}`);
  console.log(`评论数: ${MIN_COMMENTS}-${MAX_COMMENTS} 条/产品\n`);

  // 1. 清理旧数据
  console.log('[1/5] 清理旧评论数据...');
  const delOpt = await prisma.contentOptimization.deleteMany();
  const delAna = await prisma.commentAnalysis.deleteMany();
  const delCmt = await prisma.comment.deleteMany();
  console.log(`  优化 ${delOpt.count} | 分析 ${delAna.count} | 评论 ${delCmt.count} — 已清空\n`);

  // 2. 读取商品
  console.log('[2/5] 读取已有产品...');
  const products = await prisma.product.findMany();
  if (products.length === 0) {
    console.log('  无产品。请先执行 comprehensive-seed 或手动创建产品。');
    return;
  }
  console.log(`  共 ${products.length} 个产品\n`);

  // 3. 生成评论 + 分析
  console.log('[3/5] 生成评论和预分析...');

  const sentimentRatio = [
    ...Array(6).fill('positive' as const),
    ...Array(2).fill('neutral' as const),
    ...Array(2).fill('negative' as const),
  ];

  let totalComments = 0;
  let totalAnalyses = 0;
  const productNegCounts: Map<string, { negCount: number; painPoints: Map<string, number>; featureRequests: Map<string, number> }> = new Map();

  for (const product of products) {
    const cat = product.category || 'beauty';
    const pools = ensurePools(cat);
    const analysis = ensureAnalysis(cat);
    const count = MIN_COMMENTS + Math.floor(Math.random() * (MAX_COMMENTS - MIN_COMMENTS + 1));

    let negCount = 0;
    const painCounter = new Map<string, number>();
    const featureCounter = new Map<string, number>();

    for (let i = 0; i < count; i++) {
      const sentiment = sentimentRatio[i % sentimentRatio.length];
      if (sentiment === 'negative') negCount++;

      const contentPool = pools[sentiment];
      const content = contentPool[Math.floor(Math.random() * contentPool.length)];
      const authorName = AUTHOR_POOL[Math.floor(Math.random() * AUTHOR_POOL.length)];
      const daysAgo = Math.floor(Math.random() * 90) + 1;
      const likeCount = Math.floor(Math.random() * 2500) + Math.floor(Math.random() * 500);
      const replyCount = Math.floor(Math.random() * 50);

      // 话题、痛点、需求
      const topicPool =
        sentiment === 'positive' ? analysis.positiveTopics :
        sentiment === 'neutral' ? analysis.neutralTopics :
        analysis.negativeTopics;

      const selectedTopics = pickRandom(topicPool, 1 + Math.floor(Math.random() * 3));
      const selectedPainPoints = sentiment === 'negative'
        ? pickRandom(analysis.painPoints, 1 + Math.floor(Math.random() * 3))
        : [];
      const selectedFeatureRequests = (sentiment === 'neutral' || sentiment === 'negative')
        ? pickRandom(analysis.featureRequests, 1 + Math.floor(Math.random() * 2))
        : sentiment === 'positive'
          ? (Math.random() > 0.7 ? pickRandom(analysis.featureRequests, 1) : [])
          : [];

      // 累积统计
      for (const p of selectedPainPoints) painCounter.set(p, (painCounter.get(p) || 0) + 1);
      for (const f of selectedFeatureRequests) featureCounter.set(f, (featureCounter.get(f) || 0) + 1);

      const purchasingIntent =
        sentiment === 'positive' ? round2(0.70 + Math.random() * 0.30) :
        sentiment === 'neutral' ? round2(0.25 + Math.random() * 0.40) :
        round2(Math.random() * 0.22);

      const comment = await prisma.comment.create({
        data: {
          productId: product.id,
          platform: Math.random() > 0.4 ? 'tiktok' : 'douyin',
          externalId: `cmt_${product.skuCode || 'unknown'}_${i}_${randomUUID().slice(0, 8)}`,
          videoUrl: `https://www.tiktok.com/@seller/video/${7350000000000000 + Math.floor(Math.random() * 999999999)}`,
          authorName,
          content,
          likeCount,
          replyCount,
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
            purchasingIntent,
            rawAnalysis: {
              keywords: [...new Set(content.replace(/[，。！？、,.!?\s]/g, '').slice(0, 10).split(''))],
              emotion_score: round2(
                sentiment === 'positive' ? 0.78 + Math.random() * 0.22 :
                sentiment === 'neutral' ? 0.38 + Math.random() * 0.24 :
                Math.random() * 0.28,
              ),
              purchase_signal_words: purchasingIntent > 0.5
                ? pickRandom(['想买', '下单', '回购', '入坑', '推荐', '冲它', '囤货', '好值'], 1 + Math.floor(Math.random() * 4))
                : [],
              review_depth: ['浅层', '一般', '较深', '深度'][Math.floor(Math.random() * 4)],
              review_quality: round2(2 + Math.random() * 3),
            },
            confidence: round2(0.72 + Math.random() * 0.28),
            modelUsed: sentiment === 'negative'
              ? 'doubao-seed-2-0-pro-251130'
              : `sentiment-analyzer-v${Math.floor(Math.random() * 3) + 3}`,
            analyzedAt: new Date(Date.now() - (daysAgo - 0.5) * 24 * 60 * 60 * 1000),
          },
        });
        totalAnalyses++;
      }
      totalComments++;
    }

    productNegCounts.set(product.id, { negCount, painPoints: painCounter, featureRequests: featureCounter });
    console.log(`  ✓ [${cat}] ${product.skuCode || product.id.slice(0, 8)}: ${count} 条评论 (负面 ${negCount})`);
  }
  console.log(`\n  完成: ${totalComments} 评论 + ${totalAnalyses} 分析\n`);

  // 4. 生成内容优化
  if (GENERATE_OPTIMIZATIONS) {
    console.log('[4/5] 生成内容优化建议...');
    let totalOpts = 0;

    for (const product of products) {
      const info = productNegCounts.get(product.id);
      if (!info || info.negCount < 2) continue;

      const cat = product.category || 'beauty';
      const templates = ensureOptimizations(cat);

      // 找最重要的痛点与功能需求
      const topPain = [...info.painPoints.entries()].sort((a, b) => b[1] - a[1])[0];
      const topRequest = [...info.featureRequests.entries()].sort((a, b) => b[1] - a[1])[0];

      for (const tpl of templates) {
        const trigDetail = {
          negative_count: info.negCount,
          top_pain_point: topPain?.[0] || '未知',
          top_feature_request: topRequest?.[0] || '未知',
          total_comments: totalComments,
          trigger_source: 'auto_seed',
        };

        const vars = {
          '${negCount}': String(info.negCount),
          '${painCount}': String(topPain?.[1] || 0),
          '${requestCount}': String(topRequest?.[1] || 0),
          '${topPain}': topPain?.[0] || '品质问题',
          '${topRequest}': topRequest?.[0] || '改善质量',
          '${fixAction}': topPain?.[0] ? `"${topPain[0]}"的解决方案` : '产品质量可靠性',
        };

        let suggestion = tpl.suggestionTemplate;
        for (const [k, v] of Object.entries(vars)) {
          suggestion = suggestion.replace(new RegExp(k.replace(/[${}]/g, '\\$&'), 'g'), v);
        }

        await prisma.contentOptimization.create({
          data: {
            productId: product.id,
            trigger: tpl.trigger,
            triggerDetail: trigDetail,
            suggestion,
            autoApply: false,
            status: Math.random() > 0.6 ? 'applied' : 'pending',
            appliedAt: Math.random() > 0.6 ? new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000) : null,
            appliedBy: Math.random() > 0.6 ? AUTHOR_POOL[Math.floor(Math.random() * AUTHOR_POOL.length)] : null,
            effectMetrics: Math.random() > 0.5 ? {
              ctr_delta: round2(Math.random() * 0.3 - 0.05),
              cvr_delta: round2(Math.random() * 0.2 - 0.03),
              retention_delta: round2(Math.random() * 0.15),
            } : undefined,
          },
        });
        totalOpts++;
      }
    }
    console.log(`  完成: ${totalOpts} 条优化建议\n`);
  } else {
    console.log('[4/5] 跳过优化生成 (GENERATE_OPTIMIZATIONS=false)\n');
  }

  // 5. 输出统计
  console.log('[5/5] 数据统计汇总');
  console.log('─'.repeat(60));
  const stats = await Promise.all([
    prisma.comment.count(),
    prisma.commentAnalysis.count(),
    prisma.contentOptimization.count(),
  ]);
  console.log(`  📝 评论记录:     ${stats[0]}`);
  console.log(`  🔍 分析记录:     ${stats[1]}`);
  console.log(`  💡 优化建议:     ${stats[2]}`);

  // 按情感统计
  const sentimentCounts = await Promise.all([
    prisma.commentAnalysis.count({ where: { sentiment: 'positive' } }),
    prisma.commentAnalysis.count({ where: { sentiment: 'neutral' } }),
    prisma.commentAnalysis.count({ where: { sentiment: 'negative' } }),
  ]);
  console.log(`  🙂 正面: ${sentimentCounts[0]} | 😐 中性: ${sentimentCounts[1]} | 😞 负面: ${sentimentCounts[2]}`);

  // 按品类统计
  const productStats = await prisma.comment.groupBy({
    by: ['productId'],
    _count: { id: true },
  });
  console.log(`  📦 涉及产品: ${productStats.length} 个`);
  console.log('='.repeat(60));
  console.log('✅ 评论分析 Mock 数据种子完成！');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
