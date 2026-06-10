// =============================================================================
// TikStream AI — Posting Time Constants
// 各平台黄金时段 + 竞争基准 + 品类时段修正
// 数据来源：公开行业报告、平台官方创作者指南 (2024-2025)
// =============================================================================

// ---- 平台基础黄金时段 (UTC+8) ----

export interface PlatformGoldenHours {
  platform: string;
  display_name: string;
  timezone: string;
  timezone_offset: number;        // UTC offset (hours)
  weekdays: TimeSlotTemplate[];
  weekends: TimeSlotTemplate[];
}

export interface TimeSlotTemplate {
  label: string;
  start: string;                  // HH:mm (平台时区)
  end: string;
  base_score: number;             // 0-100
  audience_activity: 'peak' | 'moderate' | 'low';
  competition: 'high' | 'medium' | 'low';
  audience_note: string;
}

export const PLATFORM_GOLDEN_HOURS: PlatformGoldenHours[] = [
  {
    platform: 'douyin',
    display_name: '抖音',
    timezone: 'Asia/Shanghai',
    timezone_offset: 8,
    weekdays: [
      { label: '早通勤', start: '07:00', end: '09:00', base_score: 78, audience_activity: 'peak', competition: 'high', audience_note: '上班族通勤刷短视频高峰期' },
      { label: '午休', start: '12:00', end: '13:30', base_score: 72, audience_activity: 'peak', competition: 'medium', audience_note: '午休刷视频放松，互动率高' },
      { label: '下班前摸鱼', start: '17:00', end: '18:00', base_score: 65, audience_activity: 'moderate', competition: 'medium', audience_note: '下班前浏览高峰期' },
      { label: '晚休闲', start: '19:00', end: '20:00', base_score: 85, audience_activity: 'peak', competition: 'high', audience_note: '晚饭后家庭休闲，流量持续至深夜' },
      { label: '晚黄金档', start: '21:00', end: '23:00', base_score: 92, audience_activity: 'peak', competition: 'high', audience_note: '全天流量顶点，完播率最高' },
    ],
    weekends: [
      { label: '周末早晨', start: '08:00', end: '10:00', base_score: 75, audience_activity: 'peak', competition: 'medium', audience_note: '赖床刷视频高峰期' },
      { label: '午间', start: '11:30', end: '13:00', base_score: 70, audience_activity: 'peak', competition: 'medium', audience_note: '周末午间流量稳健' },
      { label: '午后', start: '15:00', end: '17:00', base_score: 62, audience_activity: 'moderate', competition: 'low', audience_note: '休闲时间，竞争较少' },
      { label: '晚黄金档', start: '20:00', end: '23:30', base_score: 95, audience_activity: 'peak', competition: 'high', audience_note: '周末晚间流量顶峰' },
    ],
  },
  {
    platform: 'kuaishou',
    display_name: '快手',
    timezone: 'Asia/Shanghai',
    timezone_offset: 8,
    weekdays: [
      { label: '清晨', start: '06:00', end: '08:00', base_score: 68, audience_activity: 'peak', competition: 'low', audience_note: '下沉市场早起用户活跃' },
      { label: '午间', start: '11:00', end: '13:00', base_score: 74, audience_activity: 'peak', competition: 'medium', audience_note: '午间流量高峰' },
      { label: '傍晚', start: '17:00', end: '19:00', base_score: 78, audience_activity: 'peak', competition: 'medium', audience_note: '晚饭前浏览高峰' },
      { label: '夜间', start: '20:00', end: '22:00', base_score: 88, audience_activity: 'peak', competition: 'high', audience_note: '晚间流量顶点' },
    ],
    weekends: [
      { label: '清晨', start: '06:30', end: '09:00', base_score: 65, audience_activity: 'moderate', competition: 'low', audience_note: '周末早起用户' },
      { label: '午间', start: '11:00', end: '13:00', base_score: 72, audience_activity: 'peak', competition: 'medium', audience_note: '周末午间流量高峰' },
      { label: '夜间', start: '19:30', end: '22:30', base_score: 90, audience_activity: 'peak', competition: 'high', audience_note: '周末晚间流量顶峰' },
    ],
  },
  {
    platform: 'tiktok_us',
    display_name: 'TikTok (美国)',
    timezone: 'America/New_York',
    timezone_offset: -5,
    weekdays: [
      { label: 'Morning commute', start: '07:00', end: '09:00', base_score: 70, audience_activity: 'peak', competition: 'medium', audience_note: '东部通勤+西海岸夜猫子末尾' },
      { label: 'Lunch break', start: '12:00', end: '14:00', base_score: 76, audience_activity: 'peak', competition: 'medium', audience_note: '午休浏览全美活跃' },
      { label: 'After work', start: '18:00', end: '20:00', base_score: 82, audience_activity: 'peak', competition: 'high', audience_note: '全美下班后流量上升' },
      { label: 'Prime evening', start: '20:00', end: '23:00', base_score: 90, audience_activity: 'peak', competition: 'high', audience_note: '全美活跃顶峰期' },
    ],
    weekends: [
      { label: 'Late morning', start: '10:00', end: '12:00', base_score: 74, audience_activity: 'peak', competition: 'medium', audience_note: '周末晚起用户活跃' },
      { label: 'Afternoon', start: '14:00', end: '17:00', base_score: 68, audience_activity: 'moderate', competition: 'low', audience_note: '午后户外活动，竞争较少' },
      { label: 'Prime evening', start: '19:00', end: '23:00', base_score: 93, audience_activity: 'peak', competition: 'high', audience_note: '周末晚间流量顶峰' },
    ],
  },
  {
    platform: 'xiaohongshu',
    display_name: '小红书',
    timezone: 'Asia/Shanghai',
    timezone_offset: 8,
    weekdays: [
      { label: '早晨', start: '08:00', end: '10:00', base_score: 72, audience_activity: 'peak', competition: 'medium', audience_note: '女性用户早间浏览习惯' },
      { label: '午休', start: '12:00', end: '14:00', base_score: 78, audience_activity: 'peak', competition: 'medium', audience_note: '午休种草高峰期' },
      { label: '晚休闲', start: '19:00', end: '20:00', base_score: 82, audience_activity: 'peak', competition: 'high', audience_note: '晚间种草决策高峰期' },
      { label: '夜读', start: '21:00', end: '23:00', base_score: 88, audience_activity: 'peak', competition: 'high', audience_note: '深度种草+购买决策期' },
    ],
    weekends: [
      { label: '早上', start: '09:00', end: '11:00', base_score: 76, audience_activity: 'peak', competition: 'medium', audience_note: '周末悠闲浏览' },
      { label: '午后', start: '14:00', end: '17:00', base_score: 80, audience_activity: 'peak', competition: 'medium', audience_note: '周末攻略种草期' },
      { label: '晚间', start: '20:00', end: '23:00', base_score: 92, audience_activity: 'peak', competition: 'high', audience_note: '周末购买决策顶峰' },
    ],
  },
  {
    platform: 'wechat_channels',
    display_name: '微信视频号',
    timezone: 'Asia/Shanghai',
    timezone_offset: 8,
    weekdays: [
      { label: '早间', start: '07:00', end: '09:00', base_score: 68, audience_activity: 'peak', competition: 'medium', audience_note: '通勤+早餐刷视频号' },
      { label: '午间', start: '12:00', end: '13:30', base_score: 74, audience_activity: 'peak', competition: 'medium', audience_note: '午休社交+视频号浏览' },
      { label: '晚黄金档', start: '20:00', end: '22:30', base_score: 86, audience_activity: 'peak', competition: 'high', audience_note: '社交+内容消费重叠期' },
    ],
    weekends: [
      { label: '上午', start: '08:00', end: '10:00', base_score: 70, audience_activity: 'peak', competition: 'medium', audience_note: '周末上午流量高峰' },
      { label: '午后', start: '14:00', end: '16:00', base_score: 66, audience_activity: 'moderate', competition: 'low', audience_note: '下午茶时间活跃' },
      { label: '晚黄金档', start: '19:00', end: '22:00', base_score: 90, audience_activity: 'peak', competition: 'high', audience_note: '周末社交+内容顶峰' },
    ],
  },
];

// ---- 品类时段修正系数 ----

export interface CategoryTimingAdjustment {
  category_keywords: string[];
  morning_boost: number;      // 0-1, 晨间额外加分
  noon_boost: number;         // 午间
  evening_boost: number;      // 晚间
  weekend_boost: number;      // 周末
  notes: string;
}

export const CATEGORY_TIMING_ADJUSTMENTS: CategoryTimingAdjustment[] = [
  {
    category_keywords: ['美妆', '护肤', '化妆', '美容', '护肤品', '彩妆', '香水'],
    morning_boost: 0.10,
    noon_boost: 0.05,
    evening_boost: 0.15,
    weekend_boost: 0.12,
    notes: '美妆用户晚间和周末有充裕时间种草+决策',
  },
  {
    category_keywords: ['3C', '数码', '手机', '电脑', '耳机', '电子', '智能'],
    morning_boost: 0.08,
    noon_boost: 0.10,
    evening_boost: 0.08,
    weekend_boost: 0.05,
    notes: '3C数码：午间（参数对比）和工作日白天更活跃',
  },
  {
    category_keywords: ['食品', '零食', '饮料', '餐饮', '美食', '生鲜'],
    morning_boost: 0.05,
    noon_boost: 0.12,
    evening_boost: 0.15,
    weekend_boost: 0.10,
    notes: '食品：饭点前后决策冲动最强（午餐+晚餐前）',
  },
  {
    category_keywords: ['服装', '穿搭', '鞋', '包袋', '服饰', '配饰'],
    morning_boost: 0.05,
    noon_boost: 0.08,
    evening_boost: 0.15,
    weekend_boost: 0.15,
    notes: '服饰：晚间和周末购物浏览时间长，决策周期短',
  },
  {
    category_keywords: ['母婴', '儿童', '宝宝', '婴儿', '玩具'],
    morning_boost: 0.10,
    noon_boost: 0.05,
    evening_boost: 0.10,
    weekend_boost: 0.08,
    notes: '母婴：妈妈群体晨间（孩子醒前）和晚间（孩子睡后）活跃',
  },
  {
    category_keywords: ['健身', '运动', '户外', '瑜伽', '跑步'],
    morning_boost: 0.15,
    noon_boost: 0.00,
    evening_boost: 0.08,
    weekend_boost: 0.10,
    notes: '运动健身：晨间和周末是运动决策高峰',
  },
  {
    category_keywords: ['教育', '课程', '学习', '培训', '书籍'],
    morning_boost: 0.05,
    noon_boost: 0.08,
    evening_boost: 0.12,
    weekend_boost: 0.10,
    notes: '教育：晚间（系统性学习）和周末有较多时间',
  },
];

// ---- 竞争检测规则 ----

export interface CompetitionRule {
  id: string;
  description: string;
  time_slots: { start: string; end: string };
  affected_platforms: string[];
  competition_factor: number;   // 0-1, 越高越需避开
}

export const COMPETITION_RULES: CompetitionRule[] = [
  {
    id: 'ecommerce_live_evening',
    description: '电商直播晚间大场（20:00-24:00），流量被大主播锁死',
    time_slots: { start: '20:00', end: '24:00' },
    affected_platforms: ['douyin', 'kuaishou'],
    competition_factor: 0.85,
  },
  {
    id: 'douyin_dispatching_rush',
    description: '抖音下午达人集中发布（16:00-18:00），中小号淹没风险高',
    time_slots: { start: '16:00', end: '18:00' },
    affected_platforms: ['douyin'],
    competition_factor: 0.65,
  },
  {
    id: 'tiktok_us_primetime',
    description: 'TikTok 美国 19:00-22:00 全部头部创作者集中发布',
    time_slots: { start: '19:00', end: '22:00' },
    affected_platforms: ['tiktok_us'],
    competition_factor: 0.80,
  },
  {
    id: 'weekend_content_flood',
    description: '周末上午（08:00-10:00）创作者大量投稿，内容供过于求',
    time_slots: { start: '08:00', end: '10:00' },
    affected_platforms: ['douyin', 'kuaishou', 'xiaohongshu'],
    competition_factor: 0.60,
  },
  {
    id: 'festival_overload',
    description: '节假日全天各平台投稿量激增，建议工作日发布',
    time_slots: { start: '00:00', end: '23:59' },
    affected_platforms: ['douyin', 'kuaishou', 'xiaohongshu', 'wechat_channels'],
    competition_factor: 0.75,
  },
];

// ---- 缓存配置 ----

export const POSTING_TIME_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---- 默认平台 ----

export const DEFAULT_PLATFORM = 'douyin';

// ---- 支持的平台列表 ----

export const SUPPORTED_PLATFORMS = PLATFORM_GOLDEN_HOURS.map((p) => ({
  platform: p.platform,
  display_name: p.display_name,
  timezone: p.timezone,
}));
