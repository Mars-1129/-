/**
 * TikStream AI — 预填充 DNA 模式 Seed 数据 (大规模版)
 *
 * 为 6 个类目 × 多个市场 各预置 6-8 个 DNA 模式，
 * 确保 DNA 管理页面列表/详情/统计面板有丰富数据。
 *
 * 运行: npx tsx prisma/seed-dna.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DnaSeedEntry {
  productCategory: string;
  market: string;
  sampleCount: number;
  confidence: number;
  dnaJson: Record<string, unknown>;
}

// ===========================================================================
// 跨市场区域枚举
// ===========================================================================
const MARKETS = ['GLOBAL', 'US', 'ID', 'TH', 'VN', 'JP'];

// ===========================================================================
// 各市场风格偏移
// ===========================================================================
const MARKET_STYLES: Record<string, { colorPalette: string[]; bgmGenre: string; ctaTemplates: string[]; hookElements: string[] }> = {
  GLOBAL: { colorPalette: ['玫瑰金', '象牙白', '浅粉'], bgmGenre: '轻奢氛围感', ctaTemplates: ['立即购买', '限时优惠'], hookElements: ['美颜渴望', '对比冲击'] },
  US: { colorPalette: ['霓虹蓝', '哑光黑', '电光紫'], bgmGenre: 'Hip-Hop Beat', ctaTemplates: ['Shop Now', 'Limited Drop'], hookElements: ['confidence_boost', 'social_proof'] },
  ID: { colorPalette: ['暖橙', '翡翠绿', '金黄'], bgmGenre: 'Dangdut Pop', ctaTemplates: ['Beli Sekarang', 'Promo Terbatas'], hookElements: ['transformasi', 'hemat'] },
  TH: { colorPalette: ['泰式金', '清迈蓝', '暹罗粉'], bgmGenre: 'T-Pop Chill', ctaTemplates: ['สั่งเลย', 'โปรพิเศษ'], hookElements: ['สวยปัง', 'must_have'] },
  VN: { colorPalette: ['黛青', '朱红', '珍珠白'], bgmGenre: 'V-Pop Ballad', ctaTemplates: ['Mua Ngay', 'Ưu Đãi'], hookElements: ['lột_xác', 'giá_tốt'] },
  JP: { colorPalette: ['樱花粉', '抹茶绿', '靛蓝'], bgmGenre: 'City Pop Lo-fi', ctaTemplates: ['今すぐ購入', '限定セール'], hookElements: ['激変', 'お得'] },
};

// ===========================================================================
// Hook 模板数据池
// ===========================================================================
type HookDef = { type: string; title: string; duration_seconds: number; word_count: number; emotional_hooks: string[]; action_verbs: string[]; retention_avg: number; ctr_avg: number; completion_avg: number };
type VisualDef = { style: string; camera_patterns: string[]; transition_sequence: string[]; shot_count_range: [number, number]; duration_range: [number, number]; text_overlay_ratio: number };
type BgmDef = { bpm_range: [number, number]; energy_curve: number[]; intro_s: number; peak_s: number; fade_s: number };
type CtaDef = { placement_type: string; delay_from_end: number; visual_intensity: number; effectiveness_avg: number };

interface CategoryTemplates {
  hooks: HookDef[];
  visuals: VisualDef[];
  bgms: BgmDef[];
  ctas: CtaDef[];
  hookDist: Record<string, number>;
}

// ---------- beauty ----------
const beautyTemplates: CategoryTemplates = {
  hooks: [
    { type: 'visual_contrast', title: '前后对比：暗沉→透亮', duration_seconds: 3.5, word_count: 12, emotional_hooks: ['对比冲击', '美颜渴望'], action_verbs: ['发现', '改变'], retention_avg: 0.88, ctr_avg: 0.12, completion_avg: 0.74 },
    { type: 'emotional_story', title: '从自卑到自信的护肤故事', duration_seconds: 4.2, word_count: 18, emotional_hooks: ['自卑→自信', '情感共鸣'], action_verbs: ['尝试', '焕变'], retention_avg: 0.85, ctr_avg: 0.10, completion_avg: 0.72 },
    { type: 'tutorial', title: '精华液正确涂抹手法', duration_seconds: 5.0, word_count: 15, emotional_hooks: ['学习的价值', '仪式感'], action_verbs: ['学习', '改变'], retention_avg: 0.80, ctr_avg: 0.09, completion_avg: 0.68 },
    { type: 'social_proof', title: '闺蜜说用了两周变白了', duration_seconds: 4.0, word_count: 14, emotional_hooks: ['信任感', '从众心理'], action_verbs: ['分享', '推荐'], retention_avg: 0.82, ctr_avg: 0.11, completion_avg: 0.70 },
    { type: 'product_reveal', title: '开箱：年度精华红黑榜', duration_seconds: 3.8, word_count: 10, emotional_hooks: ['好奇期待', '惊喜感'], action_verbs: ['开箱', '揭晓'], retention_avg: 0.83, ctr_avg: 0.10, completion_avg: 0.71 },
    { type: 'pain_point', title: '敏感肌的救星找到了', duration_seconds: 3.2, word_count: 13, emotional_hooks: ['焦虑→释然', '需求认同'], action_verbs: ['拯救', '呵护'], retention_avg: 0.79, ctr_avg: 0.095, completion_avg: 0.69 },
  ],
  visuals: [
    { style: '高级质感展示', camera_patterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up', 'Pan_Left'], transition_sequence: ['Dissolve', 'Fade_In', 'Wipe'], shot_count_range: [8, 14], duration_range: [25, 40], text_overlay_ratio: 0.35 },
    { style: '自然光实拍', camera_patterns: ['Static', 'Pan_Left', 'Tilt_Up'], transition_sequence: ['Dissolve', 'Cut'], shot_count_range: [6, 10], duration_range: [20, 30], text_overlay_ratio: 0.28 },
    { style: '护肤Vlog', camera_patterns: ['Static', 'Pan_Left', 'Dolly_In_Fast'], transition_sequence: ['Cut', 'Dissolve', 'Fade_In'], shot_count_range: [10, 18], duration_range: [30, 50], text_overlay_ratio: 0.42 },
  ],
  bgms: [
    { bpm_range: [105, 125], energy_curve: [0.3, 0.5, 0.8, 0.7], intro_s: 1.8, peak_s: 13, fade_s: 2.5 },
    { bpm_range: [85, 105], energy_curve: [0.2, 0.4, 0.7, 0.5], intro_s: 2.0, peak_s: 18, fade_s: 3.0 },
  ],
  ctas: [
    { placement_type: 'ending', delay_from_end: 2.5, visual_intensity: 0.75, effectiveness_avg: 0.78 },
    { placement_type: 'mid_video', delay_from_end: 8, visual_intensity: 0.65, effectiveness_avg: 0.70 },
  ],
  hookDist: { visual_contrast: 3, emotional_story: 2, tutorial: 2, social_proof: 2, product_reveal: 2, pain_point: 1 },
};

// ---------- electronics ----------
const electronicsTemplates: CategoryTemplates = {
  hooks: [
    { type: 'comparison', title: '降噪耳机横评：谁是王者', duration_seconds: 3.0, word_count: 10, emotional_hooks: ['决策焦虑', '理性选择'], action_verbs: ['对比', '选择'], retention_avg: 0.90, ctr_avg: 0.14, completion_avg: 0.76 },
    { type: 'tech_spec_highlight', title: '40dB降噪是什么概念', duration_seconds: 2.8, word_count: 8, emotional_hooks: ['技术追求', '专业认同'], action_verbs: ['了解', '体验'], retention_avg: 0.86, ctr_avg: 0.13, completion_avg: 0.72 },
    { type: 'unboxing_experience', title: '开箱千元降噪耳机天花板', duration_seconds: 5.0, word_count: 16, emotional_hooks: ['拆箱兴奋', '仪式感'], action_verbs: ['开箱', '体验'], retention_avg: 0.84, ctr_avg: 0.12, completion_avg: 0.68 },
    { type: 'before_after_noise', title: '戴上前vs戴上后噪音对比', duration_seconds: 3.5, word_count: 9, emotional_hooks: ['烦躁→安静', '解脱感'], action_verbs: ['戴上', '感受'], retention_avg: 0.87, ctr_avg: 0.125, completion_avg: 0.73 },
    { type: 'lifestyle_integration', title: '通勤族/学生党必备好物', duration_seconds: 4.5, word_count: 15, emotional_hooks: ['依赖感', '品质生活'], action_verbs: ['随身', '享受'], retention_avg: 0.81, ctr_avg: 0.10, completion_avg: 0.67 },
    { type: 'durability_test', title: '暴力测试：摔不坏的耳机', duration_seconds: 3.2, word_count: 7, emotional_hooks: ['震撼', '信任建立'], action_verbs: ['摔', '看'], retention_avg: 0.88, ctr_avg: 0.13, completion_avg: 0.75 },
  ],
  visuals: [
    { style: '科技感极简', camera_patterns: ['Dolly_In_Fast', 'Static', 'Pan_Left'], transition_sequence: ['Wipe', 'Dissolve'], shot_count_range: [7, 12], duration_range: [22, 35], text_overlay_ratio: 0.38 },
    { style: '沉浸式开箱', camera_patterns: ['Static', 'Dolly_In_Fast', 'Tilt_Up', 'Dolly_Out'], transition_sequence: ['Cut', 'Dissolve', 'Fade_In'], shot_count_range: [12, 20], duration_range: [35, 55], text_overlay_ratio: 0.31 },
  ],
  bgms: [
    { bpm_range: [120, 145], energy_curve: [0.35, 0.65, 0.92, 0.7], intro_s: 1.5, peak_s: 11, fade_s: 2.0 },
    { bpm_range: [95, 115], energy_curve: [0.25, 0.45, 0.75, 0.6], intro_s: 2.2, peak_s: 16, fade_s: 2.8 },
  ],
  ctas: [
    { placement_type: 'ending', delay_from_end: 2, visual_intensity: 0.82, effectiveness_avg: 0.82 },
    { placement_type: 'scattered', delay_from_end: 5, visual_intensity: 0.60, effectiveness_avg: 0.72 },
  ],
  hookDist: { comparison: 2, tech_spec_highlight: 2, unboxing_experience: 2, before_after_noise: 1, lifestyle_integration: 1, durability_test: 1 },
};

// ---------- fashion ----------
const fashionTemplates: CategoryTemplates = {
  hooks: [
    { type: 'outfit_styling', title: '一件大衣搞定一周穿搭', duration_seconds: 3.8, word_count: 11, emotional_hooks: ['穿搭灵感', '想变美'], action_verbs: ['搭配', '打造'], retention_avg: 0.86, ctr_avg: 0.11, completion_avg: 0.73 },
    { type: 'transformation', title: '普通女孩变韩系小姐姐', duration_seconds: 2.5, word_count: 6, emotional_hooks: ['变装冲击', '惊喜感'], action_verbs: ['变身', '看'], retention_avg: 0.91, ctr_avg: 0.15, completion_avg: 0.78 },
    { type: 'fabric_quality', title: '教你辨别100%纯羊毛', duration_seconds: 4.5, word_count: 15, emotional_hooks: ['识货能力', '品质追求'], action_verbs: ['识别', '辨别'], retention_avg: 0.78, ctr_avg: 0.09, completion_avg: 0.66 },
    { type: 'runway_inspired', title: '2024秀场同款平替', duration_seconds: 3.0, word_count: 10, emotional_hooks: ['高级感', '捡漏心理'], action_verbs: ['发现', '拥有'], retention_avg: 0.82, ctr_avg: 0.12, completion_avg: 0.70 },
    { type: 'seasonal_essential', title: '秋冬衣橱必备经典款', duration_seconds: 3.5, word_count: 12, emotional_hooks: ['实用主义', '极简美学'], action_verbs: ['投资', '拥有'], retention_avg: 0.80, ctr_avg: 0.10, completion_avg: 0.68 },
    { type: 'celebrity_style', title: '明星同款大衣get', duration_seconds: 2.8, word_count: 8, emotional_hooks: ['粉丝心理', '模仿欲'], action_verbs: ['get', '穿'], retention_avg: 0.84, ctr_avg: 0.13, completion_avg: 0.72 },
  ],
  visuals: [
    { style: '时尚大片风', camera_patterns: ['Pan_Left', 'Dolly_In_Fast', 'Tilt_Up', 'Static'], transition_sequence: ['Dissolve', 'Wipe', 'Cut'], shot_count_range: [10, 16], duration_range: [25, 40], text_overlay_ratio: 0.29 },
    { style: '慢生活氛围', camera_patterns: ['Static', 'Tilt_Up', 'Pan_Left'], transition_sequence: ['Fade_In', 'Dissolve'], shot_count_range: [6, 10], duration_range: [20, 32], text_overlay_ratio: 0.25 },
  ],
  bgms: [
    { bpm_range: [110, 130], energy_curve: [0.3, 0.55, 0.85, 0.65], intro_s: 1.6, peak_s: 14, fade_s: 2.2 },
    { bpm_range: [75, 95], energy_curve: [0.2, 0.35, 0.6, 0.45], intro_s: 2.5, peak_s: 20, fade_s: 3.2 },
  ],
  ctas: [
    { placement_type: 'ending', delay_from_end: 3.0, visual_intensity: 0.78, effectiveness_avg: 0.77 },
    { placement_type: 'ending', delay_from_end: 4.0, visual_intensity: 0.55, effectiveness_avg: 0.65 },
  ],
  hookDist: { outfit_styling: 2, transformation: 2, fabric_quality: 1, runway_inspired: 1, seasonal_essential: 1, celebrity_style: 1 },
};

// ---------- food ----------
const foodTemplates: CategoryTemplates = {
  hooks: [
    { type: 'taste_test', title: '一口就上瘾的牛肉干', duration_seconds: 2.8, word_count: 8, emotional_hooks: ['食欲', '满足感'], action_verbs: ['尝', '发现'], retention_avg: 0.89, ctr_avg: 0.13, completion_avg: 0.75 },
    { type: 'behind_the_scenes', title: '探秘牛肉干工厂', duration_seconds: 5.5, word_count: 20, emotional_hooks: ['好奇', '安全信赖'], action_verbs: ['探访', '了解'], retention_avg: 0.81, ctr_avg: 0.10, completion_avg: 0.69 },
    { type: 'ingredient_focus', title: '配料表只有牛肉和盐', duration_seconds: 3.5, word_count: 14, emotional_hooks: ['健康焦虑', '纯天然追求'], action_verbs: ['发现', '辨别'], retention_avg: 0.82, ctr_avg: 0.11, completion_avg: 0.70 },
    { type: 'portion_perfect', title: '追剧/办公室必备零食', duration_seconds: 3.0, word_count: 10, emotional_hooks: ['场景代入', '便利渴望'], action_verbs: ['拆', '享受'], retention_avg: 0.83, ctr_avg: 0.12, completion_avg: 0.72 },
    { type: 'price_value', title: '一斤鲜牛肉只能做半斤肉干', duration_seconds: 3.2, word_count: 12, emotional_hooks: ['省钱心理', '物超所值'], action_verbs: ['算', '买'], retention_avg: 0.80, ctr_avg: 0.11, completion_avg: 0.68 },
    { type: 'user_reaction', title: '同事试吃反应合集', duration_seconds: 4.0, word_count: 8, emotional_hooks: ['社交验证', '好奇'], action_verbs: ['看', '吃'], retention_avg: 0.86, ctr_avg: 0.14, completion_avg: 0.74 },
  ],
  visuals: [
    { style: '微距美食特写', camera_patterns: ['Dolly_In_Fast', 'Static', 'Pan_Left'], transition_sequence: ['Cut', 'Dissolve'], shot_count_range: [8, 14], duration_range: [18, 30], text_overlay_ratio: 0.32 },
    { style: '工厂生产工艺', camera_patterns: ['Pan_Left', 'Static', 'Dolly_In_Fast', 'Tilt_Up'], transition_sequence: ['Dissolve', 'Cut', 'Fade_In'], shot_count_range: [10, 16], duration_range: [30, 48], text_overlay_ratio: 0.40 },
  ],
  bgms: [
    { bpm_range: [110, 130], energy_curve: [0.35, 0.6, 0.9, 0.75], intro_s: 1.2, peak_s: 10, fade_s: 1.8 },
    { bpm_range: [90, 110], energy_curve: [0.25, 0.45, 0.70, 0.55], intro_s: 2.0, peak_s: 22, fade_s: 2.8 },
  ],
  ctas: [
    { placement_type: 'ending', delay_from_end: 2.0, visual_intensity: 0.85, effectiveness_avg: 0.81 },
    { placement_type: 'ending', delay_from_end: 3.5, visual_intensity: 0.68, effectiveness_avg: 0.73 },
  ],
  hookDist: { taste_test: 2, behind_the_scenes: 2, ingredient_focus: 1, portion_perfect: 1, price_value: 1, user_reaction: 1 },
};

// ---------- home ----------
const homeTemplates: CategoryTemplates = {
  hooks: [
    { type: 'organization_hack', title: '收纳白痴也能学会的方法', duration_seconds: 2.5, word_count: 8, emotional_hooks: ['收纳渴望', '整洁满足'], action_verbs: ['整理', '改变'], retention_avg: 0.90, ctr_avg: 0.14, completion_avg: 0.77 },
    { type: 'before_after_room', title: '男朋友说像换了套房子', duration_seconds: 3.0, word_count: 10, emotional_hooks: ['对比满意', '成就喜悦'], action_verbs: ['改造', '对比'], retention_avg: 0.93, ctr_avg: 0.16, completion_avg: 0.80 },
    { type: 'asmr_setup', title: '超治愈收纳过程 | ASMR', duration_seconds: 6.0, word_count: 2, emotional_hooks: ['治愈满足', 'ASMR快感'], action_verbs: [], retention_avg: 0.76, ctr_avg: 0.08, completion_avg: 0.65 },
    { type: 'small_space_living', title: '10平米出租屋收纳秘籍', duration_seconds: 4.0, word_count: 14, emotional_hooks: ['空间焦虑', '租房共鸣'], action_verbs: ['改造', '利用'], retention_avg: 0.85, ctr_avg: 0.12, completion_avg: 0.72 },
    { type: 'durability_demo', title: '挂满20kg重物实测', duration_seconds: 2.5, word_count: 6, emotional_hooks: ['信任建立', '眼见为实'], action_verbs: ['挂', '看'], retention_avg: 0.87, ctr_avg: 0.13, completion_avg: 0.74 },
    { type: 'diy_creative', title: '一物多用的收纳神架', duration_seconds: 3.5, word_count: 11, emotional_hooks: ['创意灵感', '多功能惊喜'], action_verbs: ['发现', '创造'], retention_avg: 0.82, ctr_avg: 0.10, completion_avg: 0.69 },
  ],
  visuals: [
    { style: '收纳前后对比', camera_patterns: ['Static', 'Pan_Left', 'Dolly_Out'], transition_sequence: ['Cut', 'Dissolve'], shot_count_range: [6, 10], duration_range: [18, 28], text_overlay_ratio: 0.30 },
    { style: '极致ASMR收纳', camera_patterns: ['Static', 'Dolly_In_Fast'], transition_sequence: ['Cut'], shot_count_range: [4, 8], duration_range: [25, 40], text_overlay_ratio: 0.12 },
  ],
  bgms: [
    { bpm_range: [60, 80], energy_curve: [0.2, 0.35, 0.55, 0.4], intro_s: 1.0, peak_s: 16, fade_s: 2.5 },
    { bpm_range: [0, 0], energy_curve: [0.15, 0.25, 0.40, 0.30], intro_s: 0.5, peak_s: 20, fade_s: 1.5 },
  ],
  ctas: [
    { placement_type: 'ending', delay_from_end: 2.5, visual_intensity: 0.72, effectiveness_avg: 0.80 },
    { placement_type: 'mid_video', delay_from_end: 12, visual_intensity: 0.35, effectiveness_avg: 0.62 },
  ],
  hookDist: { organization_hack: 2, before_after_room: 2, asmr_setup: 1, small_space_living: 1, durability_demo: 1, diy_creative: 1 },
};

// ---------- health ----------
const healthTemplates: CategoryTemplates = {
  hooks: [
    { type: 'health_anxiety', title: '你的肠道可能在求救', duration_seconds: 3.2, word_count: 14, emotional_hooks: ['健康焦虑', '自查意识'], action_verbs: ['自查', '关注'], retention_avg: 0.87, ctr_avg: 0.12, completion_avg: 0.73 },
    { type: 'before_after_health', title: '喝了30天益生菌的变化', duration_seconds: 4.0, word_count: 16, emotional_hooks: ['希望', '变化见证'], action_verbs: ['记录', '对比'], retention_avg: 0.84, ctr_avg: 0.11, completion_avg: 0.71 },
    { type: 'doctor_recommendation', title: '消化科医生推荐益生菌', duration_seconds: 4.8, word_count: 18, emotional_hooks: ['专业权威', '信赖感'], action_verbs: ['了解', '选择'], retention_avg: 0.79, ctr_avg: 0.09, completion_avg: 0.67 },
    { type: 'science_explain', title: '500亿活菌是什么概念', duration_seconds: 4.2, word_count: 15, emotional_hooks: ['求知欲', '数据震撼'], action_verbs: ['了解', '对比'], retention_avg: 0.80, ctr_avg: 0.10, completion_avg: 0.68 },
    { type: 'lifestyle_change', title: '戒奶茶一个月后的变化', duration_seconds: 3.8, word_count: 13, emotional_hooks: ['自律自豪', '转变渴望'], action_verbs: ['改变', '坚持'], retention_avg: 0.82, ctr_avg: 0.11, completion_avg: 0.70 },
    { type: 'comparison_chart', title: '益生菌测评红黑榜', duration_seconds: 3.5, word_count: 12, emotional_hooks: ['决策帮助', '不想踩坑'], action_verbs: ['对比', '选择'], retention_avg: 0.83, ctr_avg: 0.12, completion_avg: 0.71 },
  ],
  visuals: [
    { style: '数据可视化科普', camera_patterns: ['Static', 'Dolly_In_Fast', 'Pan_Left'], transition_sequence: ['Dissolve', 'Cut'], shot_count_range: [8, 13], duration_range: [22, 35], text_overlay_ratio: 0.45 },
    { style: '专家讲解', camera_patterns: ['Static', 'Tilt_Up', 'Pan_Left'], transition_sequence: ['Dissolve', 'Fade_In'], shot_count_range: [5, 9], duration_range: [25, 40], text_overlay_ratio: 0.38 },
  ],
  bgms: [
    { bpm_range: [70, 95], energy_curve: [0.25, 0.45, 0.70, 0.55], intro_s: 1.8, peak_s: 15, fade_s: 2.5 },
    { bpm_range: [65, 85], energy_curve: [0.20, 0.35, 0.55, 0.40], intro_s: 2.2, peak_s: 20, fade_s: 3.0 },
  ],
  ctas: [
    { placement_type: 'ending', delay_from_end: 3.0, visual_intensity: 0.70, effectiveness_avg: 0.76 },
    { placement_type: 'ending', delay_from_end: 4.0, visual_intensity: 0.52, effectiveness_avg: 0.64 },
  ],
  hookDist: { health_anxiety: 2, before_after_health: 2, doctor_recommendation: 1, science_explain: 1, lifestyle_change: 1, comparison_chart: 1 },
};

const ALL_CATEGORIES: Record<string, { name: string; productNames: string[]; templates: CategoryTemplates }> = {
  beauty: { name: 'beauty', productNames: ['焕颜精华液 - 14天肤色提亮', '玻尿酸水光面膜'], templates: beautyTemplates },
  electronics: { name: 'electronics', productNames: ['无线降噪耳机 Pro', '便携式蓝牙音箱'], templates: electronicsTemplates },
  fashion: { name: 'fashion', productNames: ['秋冬百搭羊毛大衣', '通勤显瘦西装裤'], templates: fashionTemplates },
  food: { name: 'food', productNames: ['手作牛肉干 麻辣/五香', '有机坚果混合装'], templates: foodTemplates },
  home: { name: 'home', productNames: ['多功能收纳架', '厨房置物架'], templates: homeTemplates },
  health: { name: 'health', productNames: ['益生菌固体饮料', '维生素C泡腾片'], templates: healthTemplates },
};

// ===========================================================================
// DNA 模式构建函数
// ===========================================================================
function generateHookEffectiveness(
  hooks: HookDef[],
  hookDist: Record<string, number>,
): Record<string, { retention: number; ctr: number; completion: number }> {
  const result: Record<string, { retention: number; ctr: number; completion: number }> = {};
  for (const h of hooks) {
    if (h.type in hookDist) {
      result[h.type] = {
        retention: Math.round((h.retention_avg + (Math.random() - 0.5) * 0.02) * 1000) / 1000,
        ctr: Math.round((h.ctr_avg + (Math.random() - 0.5) * 0.01) * 1000) / 1000,
        completion: Math.round((h.completion_avg + (Math.random() - 0.5) * 0.02) * 1000) / 1000,
      };
    }
  }
  return result;
}

function buildDnaEntry(
  category: string,
  market: string,
  categoryInfo: { productNames: string[]; templates: CategoryTemplates },
  patternIndex: number,
): DnaSeedEntry {
  const tmpl = categoryInfo.templates;
  const mkt = MARKET_STYLES[market] || MARKET_STYLES.GLOBAL;

  // 选取主 Hook（轮转）
  const mainHook = tmpl.hooks[patternIndex % tmpl.hooks.length];
  const visualIdx = patternIndex % tmpl.visuals.length;
  const bgmIdx = patternIndex % tmpl.bgms.length;
  const ctaIdx = patternIndex % tmpl.ctas.length;
  const visual = tmpl.visuals[visualIdx];
  const bgm = tmpl.bgms[bgmIdx];
  const cta = tmpl.ctas[ctaIdx];

  // 每个模式包含 2-3 个备选 hook
  const selectedHooks = tmpl.hooks.filter(
    (_, i) => i === patternIndex % tmpl.hooks.length || i === (patternIndex + 1) % tmpl.hooks.length,
  );

  const sampleCount = 6 + Math.floor(Math.random() * 6);
  const confidence = Math.round((0.68 + Math.random() * 0.24) * 100) / 100;
  const compositeScore = Math.round((0.62 + Math.random() * 0.25) * 100) / 100;

  // 各指标
  const engMax = Math.round((0.048 + Math.random() * 0.03) * 1000) / 1000;
  const engMed = Math.round((engMax * 0.7 + Math.random() * 0.01) * 1000) / 1000;
  const engMean = Math.round((engMed * 1.05) * 1000) / 1000;

  const ctrMax = Math.round((0.032 + Math.random() * 0.025) * 1000) / 1000;
  const ctrMed = Math.round((ctrMax * 0.68 + Math.random() * 0.005) * 1000) / 1000;
  const ctrMean = Math.round((ctrMed * 1.08) * 1000) / 1000;

  const compMax = Math.round((0.78 + Math.random() * 0.15) * 1000) / 1000;
  const compMed = Math.round((compMax * 0.82 + Math.random() * 0.05) * 1000) / 1000;
  const compMean = Math.round((compMed * 1.04) * 1000) / 1000;

  const avgShots = 6 + Math.floor(Math.random() * 10);
  const avgDuration = 18 + Math.floor(Math.random() * 30);

  const diversityVar = Math.round((0.55 + Math.random() * 0.4) * 100) / 100;
  const ci95 = Math.round((0.10 + Math.random() * 0.1) * 1000) / 1000;

  const dnaId = `dna-${category}-${market.toLowerCase()}-${String(patternIndex + 1).padStart(2, '0')}`;

  return {
    productCategory: category,
    market,
    sampleCount,
    confidence,
    dnaJson: {
      dna_id: dnaId,
      category,
      market,
      product_names: categoryInfo.productNames,
      composite_score: compositeScore,
      sample_count: sampleCount,
      confidence,
      hooks: selectedHooks.map((h) => ({
        type: h.type,
        structure: {
          duration_seconds: h.duration_seconds,
          word_count: h.word_count,
          emotional_hooks: [...new Set([...h.emotional_hooks, ...mkt.hookElements.slice(0, 2)])],
          action_verbs: h.action_verbs,
        },
        effectiveness: {
          retention_rate_avg: Math.round(h.retention_avg * 100) / 100,
          ctr_avg: Math.round(h.ctr_avg * 100) / 100,
          completion_rate_avg: Math.round(h.completion_avg * 100) / 100,
        },
      })),
      visual_styles: [{
        style: visual.style,
        camera_patterns: visual.camera_patterns,
        transition_sequence: visual.transition_sequence,
        shot_count_range: visual.shot_count_range,
        duration_range: visual.duration_range,
        color_palette: mkt.colorPalette,
        text_overlay_ratio: visual.text_overlay_ratio,
      }],
      bgm_patterns: [{
        genre: mkt.bgmGenre,
        bpm_range: bgm.bpm_range,
        energy_curve: bgm.energy_curve,
        intro_duration_seconds: bgm.intro_s,
        peak_timestamp_seconds: bgm.peak_s,
        fade_out_duration_seconds: bgm.fade_s,
      }],
      pacing_patterns: [{
        avg_shot_duration_seconds: Math.round((2.2 + Math.random() * 2.5) * 10) / 10,
        duration_variance: Math.round((0.25 + Math.random() * 0.4) * 100) / 100,
        tempo_curve: [1.0, 1.05 + Math.random() * 0.2, 1.2 + Math.random() * 0.3, 0.8 + Math.random() * 0.15],
        engagement_peaks: [
          2 + Math.floor(Math.random() * 4),
          8 + Math.floor(Math.random() * 10),
          18 + Math.floor(Math.random() * 15),
        ],
      }],
      cta_styles: [{
        placement_type: cta.placement_type,
        delay_from_end_seconds: cta.delay_from_end,
        visual_intensity: Math.round(cta.visual_intensity * 100) / 100,
        text_templates: mkt.ctaTemplates,
        effectiveness_avg: cta.effectiveness_avg,
      }],
      statistics: {
        sample_size: sampleCount,
        hook_type_distribution: tmpl.hookDist,
        avg_shot_count: avgShots,
        avg_duration_seconds: avgDuration,
        engagement: { max: engMax, median: engMed, mean: engMean },
        ctr: { max: ctrMax, median: ctrMed, mean: ctrMean },
        completion: { max: compMax, median: compMed, mean: compMean },
        hook_type_effectiveness: generateHookEffectiveness(tmpl.hooks, tmpl.hookDist),
        diversity_variance: diversityVar,
        confidence_interval_95: ci95,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

// ===========================================================================
// 批量生成 SEED 数据
// ===========================================================================
function generateAllSeeds(): DnaSeedEntry[] {
  const entries: DnaSeedEntry[] = [];

  for (const [catKey, catInfo] of Object.entries(ALL_CATEGORIES)) {
    for (const market of MARKETS) {
      // 每个市场只为主市场创建数据（GLOBAL全6条，其他市场各2-3条）
      const patternsCount = market === 'GLOBAL' ? 6 : 2 + (Math.floor(Math.random() * 2));
      for (let i = 0; i < patternsCount; i++) {
        entries.push(buildDnaEntry(catKey, market, catInfo, i));
      }
    }
  }

  return entries;
}

const SEED_DATA = generateAllSeeds();

// ===========================================================================
// 主函数
// ===========================================================================
async function main(): Promise<void> {
  console.log('🧬 Seeding DNA Patterns (大规模版)...\n');
  console.log(`   Total entries: ${SEED_DATA.length}\n`);

  let created = 0;
  let updated = 0;

  for (const entry of SEED_DATA) {
    const dnaId = entry.dnaJson.dna_id as string;
    const existing = await prisma.dnaPattern.findFirst({
      where: { dnaJson: { path: ['dna_id'], equals: dnaId } },
    });

    if (existing) {
      await prisma.dnaPattern.update({
        where: { id: existing.id },
        data: {
          productCategory: entry.productCategory,
          market: entry.market,
          sampleCount: entry.sampleCount,
          confidence: entry.confidence,
          dnaJson: entry.dnaJson as any,
        },
      });
      updated++;
      if (updated <= 10 || updated % 20 === 0) {
        console.log(`  🔄 [${entry.productCategory}/${entry.market}] "${dnaId}" updated`);
      }
    } else {
      await prisma.dnaPattern.create({
        data: {
          productCategory: entry.productCategory,
          market: entry.market,
          sampleCount: entry.sampleCount,
          confidence: entry.confidence,
          dnaJson: entry.dnaJson as any,
        },
      });
      created++;
      if (created <= 10 || created % 20 === 0) {
        console.log(`  ✅ [${entry.productCategory}/${entry.market}] "${dnaId}" created`);
      }
    }
  }

  const categories = [...new Set(SEED_DATA.map((e) => e.productCategory))];
  const markets = [...new Set(SEED_DATA.map((e) => e.market))];

  console.log(`\n🧬 Done! Created ${created}, updated ${updated} DNA patterns across ${categories.length} categories × ${markets.length} markets.`);
  console.log('   Run: npx tsx prisma/seed-dna.ts');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => {
    console.error('Seed DNA failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
