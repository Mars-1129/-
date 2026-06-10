// =============================================================================
// TikStream AI — Sensitivity Constants
// 多平台敏感词规则库（TikTok / Instagram / YouTube / Shopee / Lazada）
//
// 规则来源：
// - TikTok Ads Policy (2024)
// - Shopee Seller Guidelines (SEA)
// - Lazada Content Policy (SEA)
// - Facebook/Instagram Ad Policy
// - YouTube Ad Guidelines
// =============================================================================

import type { SensitivityRule, Platform } from './sensitivity.types';

// =============================================================================
// 1. 违禁词 — 各平台绝对禁止的词汇
// =============================================================================
const PROHIBITED_KEYWORDS: SensitivityRule[] = [
  // -- TikTok 广告政策违禁词 --
  {
    pattern: '保证赚钱',
    type: 'prohibited',
    severity: 'critical',
    platforms: ['tiktok', 'instagram'],
    reason: '违反广告真实性原则：不得承诺收益',
    alternatives: ['提升销量', '增加曝光', '高效转化'],
  },
  {
    pattern: '100%有效',
    type: 'prohibited',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '违反广告法：不得做出绝对化功效承诺',
    alternatives: ['多数用户反馈有效', '改善效果明显'],
  },
  {
    pattern: '立竿见影',
    type: 'prohibited',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '功效承诺类广告法禁止用语',
    alternatives: ['见效快', '短期内改善'],
  },
  {
    pattern: '治愈',
    type: 'prohibited',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'youtube', 'shopee', 'lazada'],
    reason: '医疗功效词禁止在所有平台使用',
    alternatives: ['缓解', '改善', '调理'],
  },
  {
    pattern: '根治',
    type: 'prohibited',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'youtube', 'shopee', 'lazada'],
    reason: '医疗功效绝对词禁止使用',
    alternatives: ['持续改善', '有效缓解'],
  },
  {
    pattern: '不用就后悔',
    type: 'prohibited',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '情感胁迫类营销话术，违反平台内容规范',
    alternatives: ['值得试试', '错过可惜'],
  },
  {
    pattern: '最后机会',
    type: 'prohibited',
    severity: 'warning',
    platforms: ['shopee', 'lazada'],
    reason: '虚假紧迫感制造（Shopee/Lazada 限时活动需走 Activity API）',
    alternatives: ['库存有限', '热门款式'],
  },
  {
    pattern: '限时抢购',
    type: 'prohibited',
    severity: 'warning',
    platforms: ['tiktok'],
    reason: 'TikTok 禁止非官方限时促销用语',
    alternatives: ['爆款推荐', '人气单品'],
  },
  {
    pattern: '马上抢',
    type: 'prohibited',
    severity: 'warning',
    platforms: ['tiktok', 'instagram'],
    reason: '诱导紧迫感，平台限制使用',
    alternatives: ['立即了解', '优先体验'],
  },
  {
    pattern: '免费送',
    type: 'prohibited',
    severity: 'critical',
    platforms: ['tiktok'],
    reason: 'TikTok 禁止免费赠送类促销话术',
    alternatives: ['超值优惠', '买赠活动'],
  },
];

// =============================================================================
// 2. 限流词 — 可能降低内容推荐的词汇
// =============================================================================
const RESTRICTED_KEYWORDS: SensitivityRule[] = [
  // -- TikTok 限流词 --
  {
    pattern: '点击链接',
    type: 'restricted',
    severity: 'warning',
    platforms: ['tiktok'],
    reason: 'TikTok 算法对直接引流话术限流',
    alternatives: ['详情见主页', '了解更多'],
  },
  {
    pattern: '加微信',
    type: 'restricted',
    severity: 'warning',
    platforms: ['tiktok'],
    reason: '跨平台引流将导致推荐降权',
    alternatives: ['私信联系', '主页咨询'],
  },
  {
    pattern: '看主页',
    type: 'restricted',
    severity: 'warning',
    platforms: ['instagram'],
    reason: 'Instagram 对直接引导到主页的帖子限制曝光',
    alternatives: ['了解更多信息'],
  },
  {
    pattern: '关注我',
    type: 'restricted',
    severity: 'info',
    platforms: ['tiktok', 'instagram'],
    reason: '直接求关注可能导致算法降权',
    alternatives: ['记得看下期内容'],
  },
  {
    pattern: '薅羊毛',
    type: 'restricted',
    severity: 'warning',
    platforms: ['tiktok', 'shopee', 'lazada'],
    reason: '暗示平台漏洞或不正当获利，平台反感',
    alternatives: ['超值好物', '精选推荐'],
  },
  {
    pattern: '刷单',
    type: 'restricted',
    severity: 'critical',
    platforms: ['tiktok', 'shopee', 'lazada', 'instagram'],
    reason: '涉及虚假交易行为，平台严格禁止',
    alternatives: ['真实好评', '用户反馈'],
  },
  {
    pattern: '转发抽奖',
    type: 'restricted',
    severity: 'warning',
    platforms: ['instagram'],
    reason: '未授权抽奖活动违规',
    alternatives: ['参与活动', '互动福利'],
  },
];

// =============================================================================
// 3. 品牌词 — 第三方品牌侵权风险
// =============================================================================
const BRAND_KEYWORDS: SensitivityRule[] = [
  {
    pattern: 'iPhone',
    type: 'brand',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '未经授权引用他人注册商标',
    alternatives: ['智能手机', '手机壳'],
  },
  {
    pattern: 'AirPods',
    type: 'brand',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '未经授权引用他人注册商标',
    alternatives: ['无线耳机', '蓝牙耳机'],
  },
  {
    pattern: 'Gucci',
    type: 'brand',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'shopee', 'lazada'],
    reason: '未经授权引用奢侈品牌——高法律风险',
    alternatives: ['轻奢风', '大牌同款面料'],
  },
  {
    pattern: 'LV',
    type: 'brand',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'shopee', 'lazada'],
    reason: '未经授权引用奢侈品牌——高法律风险',
    alternatives: ['经典格纹', '复古箱包'],
  },
  {
    pattern: 'Nike',
    type: 'brand',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'shopee'],
    reason: '未经授权引用运动品牌商标',
    alternatives: ['运动风', '透气面料'],
  },
  {
    pattern: 'Adidas',
    type: 'brand',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'shopee'],
    reason: '未经授权引用运动品牌商标',
    alternatives: ['三叶草风格', '缓震鞋底'],
  },
  {
    pattern: 'Supreme',
    type: 'brand',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'shopee', 'lazada'],
    reason: '潮流品牌商标保护极严',
    alternatives: ['街头潮流', '个性印花'],
  },
  {
    pattern: 'Dyson',
    type: 'brand',
    severity: 'warning',
    platforms: ['tiktok', 'shopee', 'lazada'],
    reason: '未经授权引用品牌名',
    alternatives: ['高速吹风', '无绳吸尘'],
  },
  {
    pattern: 'Starbucks',
    type: 'brand',
    severity: 'warning',
    platforms: ['tiktok', 'instagram'],
    reason: '未经授权引用品牌名',
    alternatives: ['咖啡杯', '随行杯'],
  },
  {
    pattern: 'Apple Watch',
    type: 'brand',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube', 'shopee', 'lazada'],
    reason: '未经授权引用苹果商标',
    alternatives: ['智能手表', '表带'],
  },
];

// =============================================================================
// 4. 竞品词 — 竞品平台/商城引流风险
// =============================================================================
const COMPETITION_KEYWORDS: SensitivityRule[] = [
  {
    pattern: '去淘宝买',
    type: 'competition',
    severity: 'critical',
    platforms: ['tiktok', 'shopee', 'lazada'],
    reason: '引流到竞品平台——严重违反平台规则',
    alternatives: [],
  },
  {
    pattern: '去京东买',
    type: 'competition',
    severity: 'critical',
    platforms: ['tiktok', 'shopee', 'lazada'],
    reason: '引流到竞品平台——严重违反平台规则',
    alternatives: [],
  },
  {
    pattern: '抖音小店',
    type: 'competition',
    severity: 'warning',
    platforms: ['shopee', 'lazada'],
    reason: '平台竞品名——可能被平台审查',
    alternatives: [],
  },
  {
    pattern: '拼多多',
    type: 'competition',
    severity: 'warning',
    platforms: ['tiktok', 'shopee', 'lazada'],
    reason: '平台竞品名——可能被平台审查',
    alternatives: [],
  },
  {
    pattern: '在 Amazon',
    type: 'competition',
    severity: 'warning',
    platforms: ['shopee', 'lazada'],
    reason: '竞品平台引流',
    alternatives: [],
  },
  {
    pattern: '淘宝同款',
    type: 'competition',
    severity: 'info',
    platforms: ['tiktok'],
    reason: '暗示竞品平台存在更低价格',
    alternatives: ['全网热卖', '人气同款'],
  },
  {
    pattern: '比官网便宜',
    type: 'competition',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube', 'shopee', 'lazada'],
    reason: '与官网比价可能涉及不正当竞争',
    alternatives: ['高性价比', '实惠好物'],
  },
  {
    pattern: 'Shein',
    type: 'competition',
    severity: 'warning',
    platforms: ['shopee', 'lazada'],
    reason: '竞品平台引流',
    alternatives: [],
  },
];

// =============================================================================
// 5. 文化敏感性 — 东南亚区域文化/宗教/习俗禁忌
// =============================================================================
const CULTURAL_SENSITIVITY_KEYWORDS: SensitivityRule[] = [
  // -- 东南亚宗教禁忌 --
  {
    pattern: '猪',
    type: 'cultural',
    severity: 'critical',
    platforms: ['shopee', 'lazada', 'tiktok'],
    reason: '伊斯兰教禁忌：马来西亚、印尼等穆斯林国家避免使用猪/猪肉意象',
    alternatives: ['胶原蛋白', 'Q弹口感（无宗教关联描述）'],
  },
  {
    pattern: '猪肉',
    type: 'cultural',
    severity: 'critical',
    platforms: ['shopee', 'lazada', 'tiktok'],
    reason: '清真市场禁忌：马来西亚(61%穆斯林)、印尼(87%穆斯林)',
    alternatives: ['优质蛋白', '精选肉类（标注Halal认证）'],
  },
  {
    pattern: '红烧',
    type: 'cultural',
    severity: 'warning',
    platforms: ['shopee', 'lazada'],
    reason: '可能关联猪肉烹饪方式，东南亚穆斯林用户敏感',
    alternatives: ['酱烧', '慢炖', '浓郁酱汁'],
  },
  {
    pattern: '喝酒',
    type: 'cultural',
    severity: 'critical',
    platforms: ['shopee', 'lazada', 'tiktok'],
    reason: '伊斯兰教禁止饮酒文化',
    alternatives: [],
  },
  {
    pattern: '啤酒',
    type: 'cultural',
    severity: 'critical',
    platforms: ['shopee', 'lazada', 'tiktok'],
    reason: '含酒精饮品在穆斯林市场敏感',
    alternatives: ['气泡饮料', '零度饮品'],
  },
  // -- 东南亚颜色/符号禁忌 --
  {
    pattern: '白色.*赠送',
    type: 'cultural',
    severity: 'warning',
    platforms: ['tiktok'],
    reason: '泰/印尼：白色与丧事关联，避免用于礼物场景',
    alternatives: ['素雅色', '礼品装'],
  },
  {
    pattern: '左脚',
    type: 'cultural',
    severity: 'info',
    platforms: ['shopee', 'lazada'],
    reason: '印度教/伊斯兰教：左脚被视为不洁',
    alternatives: ['另一只脚', '右脚先'],
  },
  {
    pattern: '佛像',
    type: 'cultural',
    severity: 'critical',
    platforms: ['tiktok', 'instagram'],
    reason: '泰国/印尼：佛像商业化使用被严格禁止',
    alternatives: [],
  },
  // -- 东南亚社交礼仪 --
  {
    pattern: '摸头',
    type: 'cultural',
    severity: 'warning',
    platforms: ['tiktok', 'instagram'],
    reason: '泰国文化：头部为神圣部位，触摸是严重冒犯',
    alternatives: ['轻拍肩膀', '亲切问候'],
  },
  // -- 地域歧视/政治 --
  {
    pattern: '东南亚.*落后',
    type: 'cultural',
    severity: 'critical',
    platforms: ['tiktok', 'instagram', 'youtube', 'shopee', 'lazada'],
    reason: '地域歧视表述，严重违反社区准则',
    alternatives: [],
  },
  {
    pattern: 'Made in China.*比',
    type: 'cultural',
    severity: 'warning',
    platforms: ['shopee', 'lazada'],
    reason: '产地比较可能引发民族情绪',
    alternatives: ['高品质制造', '品质认证'],
  },
  // -- 性别敏感性 --
  {
    pattern: '女人就该',
    type: 'cultural',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '性别刻板印象——Instagram/TikTok 社区准则严格禁止',
    alternatives: ['适合注重生活品质的你', '推荐给喜欢的人'],
  },
  {
    pattern: '男人必须',
    type: 'cultural',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '性别刻板印象',
    alternatives: ['追求品质的人', '通勤必备'],
  },
  // -- 身体焦虑 --
  {
    pattern: '胖.*丑',
    type: 'cultural',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '身体羞辱——违反社区准则',
    alternatives: ['遮肉显瘦', '修饰身形'],
  },
  {
    pattern: '太瘦.*不好看',
    type: 'cultural',
    severity: 'warning',
    platforms: ['tiktok', 'instagram', 'youtube'],
    reason: '身体形象负面评价',
    alternatives: ['填充感', '增加曲线'],
  },
];

// =============================================================================
// 聚合规则表：按规则类型分组
// =============================================================================

/** 所有敏感词规则（按类型分组） */
export const SENSITIVITY_RULES_BY_TYPE: Record<string, SensitivityRule[]> = {
  prohibited: PROHIBITED_KEYWORDS,
  restricted: RESTRICTED_KEYWORDS,
  brand: BRAND_KEYWORDS,
  competition: COMPETITION_KEYWORDS,
  cultural: CULTURAL_SENSITIVITY_KEYWORDS,
};

/** 所有敏感词规则（扁平列表，带内置类型） */
export const ALL_SENSITIVITY_RULES: Array<SensitivityRule & { ruleType: string }> = [
  ...PROHIBITED_KEYWORDS.map((r) => ({ ...r, ruleType: 'prohibited' })),
  ...RESTRICTED_KEYWORDS.map((r) => ({ ...r, ruleType: 'restricted' })),
  ...BRAND_KEYWORDS.map((r) => ({ ...r, ruleType: 'brand' })),
  ...COMPETITION_KEYWORDS.map((r) => ({ ...r, ruleType: 'competition' })),
  ...CULTURAL_SENSITIVITY_KEYWORDS.map((r) => ({ ...r, ruleType: 'cultural' })),
];

/** 快速查询：平台 → 规则列表 */
export const RULES_BY_PLATFORM: Record<Platform, Array<SensitivityRule & { ruleType: string }>> = {
  tiktok: ALL_SENSITIVITY_RULES.filter(
    (r) => !r.platforms || r.platforms.includes('tiktok'),
  ),
  instagram: ALL_SENSITIVITY_RULES.filter(
    (r) => !r.platforms || r.platforms.includes('instagram'),
  ),
  youtube: ALL_SENSITIVITY_RULES.filter(
    (r) => !r.platforms || r.platforms.includes('youtube'),
  ),
  shopee: ALL_SENSITIVITY_RULES.filter(
    (r) => !r.platforms || r.platforms.includes('shopee'),
  ),
  lazada: ALL_SENSITIVITY_RULES.filter(
    (r) => !r.platforms || r.platforms.includes('lazada'),
  ),
};
