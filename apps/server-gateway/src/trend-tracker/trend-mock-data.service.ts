// =============================================================================
// TikStream AI — Trend Mock Data Service
//
// 生成高质量、品类化的模拟 TikTok 趋势数据，用于：
//   1. 算法验证和演示
//   2. LLM 不可用时的降级方案
//   3. 开发环境数据填充
//
// 生成的趋势数据具有：
//   - 真实的多维度指标（提及量、互动率、创作者采用率）
//   - 品类相关性（与 6 大商品品类匹配）
//   - 多种生命周期阶段（emerging/rising/peak/declining/dying）
//   - 历史快照用于速度/加速度计算
// =============================================================================

import { Injectable } from '@nestjs/common';
import type {
  TrendDataPoint,
  TrendHistoryPoint,
  TrendLifecycleStage,
  TrendType,
} from './algorithms';

/** 全局 Mock 趋势定义 */
export interface MockTrendTemplate {
  name: string;
  type: TrendType;
  url: string;
  /** 趋势关联品类 */
  categories: string[];
  /** 趋势关键词 */
  keywords: string[];
  /** 受众标签 */
  audienceTags: string[];
  /** 生命周期阶段 */
  lifecycleStage: TrendLifecycleStage;
  /** 当前热度 (0-100, 实际指标由模拟器根据此值生成) */
  baseHeat: number;
}

@Injectable()
export class TrendMockDataService {
  // =========================================================================
  // 跨品类全局趋势模板库
  // =========================================================================

  // =========================================================================
  // 跨品类全局趋势模板库（109 条）—— 真实 TikTok 电商视频趋势
  // =========================================================================
  private readonly globalTrends: MockTrendTemplate[] = [
    // BEAUTY (美妆护肤) — 15 条
    { name: '#GlassSkinChallenge', type: 'hashtag', url: 'https://www.tiktok.com/tag/glass-skin-challenge', categories: ['beauty', 'lifestyle'], keywords: ['玻璃肌', '水光感', '护肤routine', '裸妆', '透明感', '光泽肌', '补水'], audienceTags: ['18-35女性', '护肤爱好者', '美妆达人', '学生党', '干皮'], lifecycleStage: 'peak', baseHeat: 88 },
    { name: '早C晚A护肤法', type: 'topic', url: '', categories: ['beauty', 'health'], keywords: ['VC精华', 'A醇', '抗老', '护肤搭配', '成分党', '日间抗氧化', '夜间修复'], audienceTags: ['25-40女性', '成分党', '护肤进阶', '高消费力', '熟龄肌'], lifecycleStage: 'peak', baseHeat: 82 },
    { name: '#SkinBarrierRepair', type: 'hashtag', url: 'https://www.tiktok.com/tag/skin-barrier-repair', categories: ['beauty', 'health'], keywords: ['屏障修复', '敏感肌', '神经酰胺', '修复霜', '换季', '泛红', '维稳'], audienceTags: ['敏感肌人群', '护肤新手', '18-40女性', '干敏皮', '刷酸后修复'], lifecycleStage: 'rising', baseHeat: 72 },
    { name: '清透伪素颜妆', type: 'topic', url: '', categories: ['beauty', 'fashion'], keywords: ['清透妆', '伪素颜', '淡妆', '日常妆', '快速出门', '素颜霜', '裸妆'], audienceTags: ['18-30女性', '学生党', '上班族', '化妆新手', '通勤族'], lifecycleStage: 'rising', baseHeat: 78 },
    { name: '#KbeautyHaul', type: 'hashtag', url: 'https://www.tiktok.com/tag/kbeauty-haul', categories: ['beauty', 'lifestyle'], keywords: ['韩系护肤', '开箱', '好物分享', '平价替代', '韩国美妆', 'OliveYoung', '防晒'], audienceTags: ['18-30女性', '韩流粉丝', '学生党', '海淘族'], lifecycleStage: 'declining', baseHeat: 45 },
    { name: '#GRWM_Skincare', type: 'hashtag', url: 'https://www.tiktok.com/tag/grwm-skincare', categories: ['beauty', 'lifestyle'], keywords: ['GRWM', '护肤vlog', '聊天式', '晚间护肤', '沉浸式', '护肤步骤'], audienceTags: ['18-35女性', 'vlog爱好者', '护肤党', 'ASMR爱好者'], lifecycleStage: 'rising', baseHeat: 75 },
    { name: '#DupeAlert美妆平替', type: 'hashtag', url: 'https://www.tiktok.com/tag/dupe-alert', categories: ['beauty', 'lifestyle'], keywords: ['平替', '大牌平替', '性价比', '成分对比', '学生党友好', '口红平替', '粉底平替'], audienceTags: ['16-28女性', '学生党', '预算党', '成分党'], lifecycleStage: 'rising', baseHeat: 68 },
    { name: '#3DaySkincareTest', type: 'hashtag', url: 'https://www.tiktok.com/tag/3day-skincare-test', categories: ['beauty', 'health'], keywords: ['测评', '三天', '前后对比', '真实使用', '功效测试', '祛痘', '美白'], audienceTags: ['18-40女性', '理性消费', '测评党', '痘痘肌'], lifecycleStage: 'emerging', baseHeat: 48 },
    { name: '#MaskReviewDaily', type: 'hashtag', url: 'https://www.tiktok.com/tag/mask-review', categories: ['beauty', 'lifestyle'], keywords: ['面膜', '测评', '贴片面膜', '涂抹面膜', '补水', '美白', '清洁'], audienceTags: ['18-35女性', '面膜党', '护肤入门', '学生党'], lifecycleStage: 'emerging', baseHeat: 52 },
    { name: '#LipCombo_Trending', type: 'hashtag', url: 'https://www.tiktok.com/tag/lip-combo', categories: ['beauty', 'fashion'], keywords: ['唇妆', '口红叠涂', '唇釉', '镜面唇', '哑光唇', '唇线笔'], audienceTags: ['16-30女性', '美妆新手', '口红控', '学生党'], lifecycleStage: 'declining', baseHeat: 38 },
    // --- Beauty 扩展：季节性/工具型/急救型趋势 ---
    { name: '#SunscreenEveryday', type: 'hashtag', url: 'https://www.tiktok.com/tag/sunscreen-everyday', categories: ['beauty', 'health'], keywords: ['防晒', '365天', '通勤', 'SPF', '不粘腻', '妆前', '抗光老'], audienceTags: ['全年龄女性', '通勤族', '成分党', '学生党', '户外党'], lifecycleStage: 'rising', baseHeat: 78 },
    { name: '#FacialGuaSha', type: 'hashtag', url: 'https://www.tiktok.com/tag/facial-gua-sha', categories: ['beauty', 'health'], keywords: ['刮痧', '面部', '按摩', '提拉', '水肿', '玉石', '教程'], audienceTags: ['25-40女性', '护肤进阶', '脸部浮肿', '养生族', '亚洲'], lifecycleStage: 'rising', baseHeat: 62 },
    { name: '#PimplePatchReview', type: 'hashtag', url: 'https://www.tiktok.com/tag/pimple-patch-review', categories: ['beauty', 'health'], keywords: ['痘痘贴', '测评', '真实', '遮瑕', '修复', '急救', '隐形'], audienceTags: ['16-30岁', '痘痘肌', '学生党', '护肤入门', '油皮'], lifecycleStage: 'peak', baseHeat: 70 },
    { name: '#5MinMorningMakeup', type: 'hashtag', url: 'https://www.tiktok.com/tag/5min-morning-makeup', categories: ['beauty', 'lifestyle'], keywords: ['5分钟', '快速', '出门', '上班', '通勤妆', '极简', '步骤'], audienceTags: ['22-35女性', '上班族', '宝妈', '懒人', '通勤族'], lifecycleStage: 'rising', baseHeat: 72 },
    { name: '#CleanBeautyCheck', type: 'hashtag', url: 'https://www.tiktok.com/tag/clean-beauty-check', categories: ['beauty', 'health'], keywords: ['成分安全', '纯净', '无添加', '有机', 'vegan', '环保包装', '敏感肌'], audienceTags: ['25-40女性', '敏感肌', '环保人士', '宝妈', '成分党'], lifecycleStage: 'emerging', baseHeat: 50 },
    // FITNESS (健身运动) — 15 条
    { name: '#75HardChallenge', type: 'hashtag', url: 'https://www.tiktok.com/tag/75hard-challenge', categories: ['fitness', 'health', 'lifestyle'], keywords: ['健身挑战', '自律', '减脂', '每日打卡', '75天', '户外运动', '饮食控制'], audienceTags: ['20-40岁', '健身爱好者', '减脂人群', '自律党', '新手'], lifecycleStage: 'rising', baseHeat: 85 },
    { name: '#Zone2Cardio', type: 'hashtag', url: 'https://www.tiktok.com/tag/zone2-cardio', categories: ['fitness', 'health'], keywords: ['有氧', '心率训练', '燃脂', '慢跑', '科学健身', 'MAF训练', '低强度'], audienceTags: ['25-45岁', '健身进阶', '跑步爱好者', '科技健身', '中年'], lifecycleStage: 'emerging', baseHeat: 55 },
    { name: '#ViralDanceFitness', type: 'hashtag', url: 'https://www.tiktok.com/music/viral-dance-fitness', categories: ['fitness', 'entertainment'], keywords: ['舞蹈', '减脂舞', '有氧操', '跟练', '燃脂', 'Kpop舞蹈', '尊巴'], audienceTags: ['15-30岁', '舞蹈爱好者', '减脂人群', 'Z世代', '女性'], lifecycleStage: 'peak', baseHeat: 92 },
    { name: '#10MinHomeWorkout', type: 'hashtag', url: 'https://www.tiktok.com/tag/10min-workout', categories: ['fitness', 'home'], keywords: ['家庭健身', '10分钟', '无器械', '高效', 'HIIT', '碎片时间', '上班族'], audienceTags: ['20-40岁', '上班族', '宝妈', '健身新手', '宅家族'], lifecycleStage: 'peak', baseHeat: 78 },
    { name: '#YogaFlowMorning', type: 'hashtag', url: 'https://www.tiktok.com/tag/yoga-flow', categories: ['fitness', 'health'], keywords: ['瑜伽', '流瑜伽', '晨练', '拉伸', '柔韧', '冥想', '正念'], audienceTags: ['20-45女性', '瑜伽爱好者', '减压族', '办公室久坐'], lifecycleStage: 'rising', baseHeat: 65 },
    { name: '#HomeGymTour', type: 'hashtag', url: 'https://www.tiktok.com/tag/home-gym-setup', categories: ['fitness', 'home'], keywords: ['家庭健身房', '器械', '哑铃', '瑜伽垫', '布置', '预算', '小空间'], audienceTags: ['25-45岁', '健身爱好者', '家有闲置房', '男性', '高消费力'], lifecycleStage: 'emerging', baseHeat: 58 },
    { name: '#RecoveryRoutine', type: 'hashtag', url: 'https://www.tiktok.com/tag/recovery-routine', categories: ['fitness', 'health'], keywords: ['恢复', '拉伸', '筋膜枪', '泡沫轴', '冷水浴', '运动后', '肌肉酸痛'], audienceTags: ['25-50岁', '运动康复', '跑者', '健身老手', '办公室久坐'], lifecycleStage: 'emerging', baseHeat: 52 },
    { name: '#SmartWatchFitness', type: 'hashtag', url: 'https://www.tiktok.com/tag/smartwatch-fitness', categories: ['fitness', 'tech'], keywords: ['智能手表', '运动数据', '心率', '卡路里', '睡眠', 'AppleWatch', 'Garmin'], audienceTags: ['22-45岁', '科技健身', '上班族', '数据控', '跑步者'], lifecycleStage: 'rising', baseHeat: 60 },
    { name: '#ProteinRecipeWeek', type: 'hashtag', url: 'https://www.tiktok.com/tag/protein-recipe', categories: ['fitness', 'food'], keywords: ['高蛋白', '健身餐', '鸡胸肉', '蛋白粉', '增肌', '减脂餐', 'mealprep'], audienceTags: ['20-35岁', '健身人群', '增肌党', '减脂党', '厨房新手'], lifecycleStage: 'declining', baseHeat: 42 },
    { name: '#GymProgress_30Days', type: 'hashtag', url: 'https://www.tiktok.com/tag/gym-progress', categories: ['fitness', 'lifestyle'], keywords: ['健身变化', '30天', '前后对比', '增肌', '减脂', '新手', '激励'], audienceTags: ['18-35岁', '健身新手', '减脂人群', '增肌党', '学生'], lifecycleStage: 'peak', baseHeat: 66 },
    // --- Fitness 扩展：装备测评/恢复/小众运动 ---
    { name: '#PilatesRingWorkout', type: 'hashtag', url: 'https://www.tiktok.com/tag/pilates-ring', categories: ['fitness', 'health'], keywords: ['普拉提圈', '塑形', '核心', '小器械', '居家', '精准', '柔韧'], audienceTags: ['20-40女性', '塑形', '居家健身', '办公室久坐', '产后'], lifecycleStage: 'emerging', baseHeat: 48 },
    { name: '#JumpRopeBeforeAfter', type: 'hashtag', url: 'https://www.tiktok.com/tag/jump-rope-transformation', categories: ['fitness', 'lifestyle'], keywords: ['跳绳', '前后对比', '减脂', '一月', '变化', '高效', '塑形'], audienceTags: ['18-35岁', '减脂人群', '学生', '宝妈', '无器械'], lifecycleStage: 'rising', baseHeat: 70 },
    { name: '#RunningGearCheck', type: 'hashtag', url: 'https://www.tiktok.com/tag/running-gear-check', categories: ['fitness', 'tech', 'lifestyle'], keywords: ['跑鞋', '装备', '测评', '马拉松', '缓震', '碳板', '夜跑'], audienceTags: ['22-45岁', '跑步爱好者', '装备党', '马拉松', '户外'], lifecycleStage: 'rising', baseHeat: 58 },
    { name: '#ColdPlungeRecovery', type: 'hashtag', url: 'https://www.tiktok.com/tag/cold-plunge', categories: ['fitness', 'health'], keywords: ['冷水浴', '冰浴', '恢复', '消肿', '抗炎', '意志力', '早晨'], audienceTags: ['25-45岁', '健身进阶', 'biohacking', '高消费力', '男性'], lifecycleStage: 'emerging', baseHeat: 45 },
    { name: '#StretchingForSplits', type: 'hashtag', url: 'https://www.tiktok.com/tag/stretching-for-splits', categories: ['fitness', 'health'], keywords: ['劈叉', '拉伸', '柔韧', '教程', '30天', '每天', '挑战'], audienceTags: ['15-30女性', '舞蹈爱好者', '学生', '柔韧训练', '瑜伽'], lifecycleStage: 'declining', baseHeat: 32 },
    // FOOD (食品) — 16 条
    { name: '#MukbangASMR', type: 'hashtag', url: 'https://www.tiktok.com/tag/mukbang-asmr', categories: ['food', 'entertainment'], keywords: ['吃播', 'ASMR', '美食', '大份量', '咀嚼音', '火鸡面', '海鲜'], audienceTags: ['18-35岁', '美食爱好者', 'ASMR爱好者', '夜宵党', '学生'], lifecycleStage: 'peak', baseHeat: 86 },
    { name: '#CleanLabel零食', type: 'hashtag', url: 'https://www.tiktok.com/tag/clean-label', categories: ['food', 'health'], keywords: ['配料干净', '无添加', '健康零食', '成分表', '减糖', '天然', '儿童零食'], audienceTags: ['25-45岁', '健康饮食', '宝妈', '中产', '成分党'], lifecycleStage: 'rising', baseHeat: 70 },
    { name: '高蛋白零食测评', type: 'topic', url: '', categories: ['food', 'fitness'], keywords: ['高蛋白', '零食测评', '健身零食', '代餐', '低卡', '蛋白棒', '鸡胸肉薯片'], audienceTags: ['20-35岁', '健身人群', '减脂人群', '上班族', '学生'], lifecycleStage: 'rising', baseHeat: 65 },
    { name: '#HotPotAtHome', type: 'hashtag', url: 'https://www.tiktok.com/tag/hotpot-at-home', categories: ['food', 'home'], keywords: ['火锅', '宅家', '底料测评', '聚会', '速食', '自热锅', '火锅食材'], audienceTags: ['18-45岁', '火锅爱好者', '宅家族', '聚会族', '独居'], lifecycleStage: 'declining', baseHeat: 40 },
    { name: '#WhatIEatInADay', type: 'hashtag', url: 'https://www.tiktok.com/tag/whatieatinaday', categories: ['food', 'lifestyle'], keywords: ['一天吃什么', 'vlog', '减脂餐', '日常饮食', '卡路里', '记录', '真实'], audienceTags: ['16-35女性', '减脂人群', 'vlog爱好者', '学生', '上班族'], lifecycleStage: 'peak', baseHeat: 88 },
    { name: '#SnackHaul开箱', type: 'hashtag', url: 'https://www.tiktok.com/tag/snack-haul', categories: ['food', 'lifestyle'], keywords: ['零食', '开箱', '测评', '囤货', '进口零食', '拼多多零食', '追剧零食'], audienceTags: ['16-30岁', '学生党', '零食控', 'Z世代', '追剧族'], lifecycleStage: 'rising', baseHeat: 72 },
    { name: '#MealPrepSunday', type: 'hashtag', url: 'https://www.tiktok.com/tag/meal-prep', categories: ['food', 'lifestyle'], keywords: ['备餐', 'mealprep', '上班族', '减脂', '高效', '保鲜', '一周备餐'], audienceTags: ['22-40岁', '上班族', '减脂人群', '健身人群', '独居'], lifecycleStage: 'peak', baseHeat: 68 },
    { name: '#InstantNoodleHack', type: 'hashtag', url: 'https://www.tiktok.com/tag/instant-noodle-hack', categories: ['food', 'home'], keywords: ['泡面', '方便面', '神仙吃法', '速食', '改良', '芝士', '牛奶'], audienceTags: ['16-30岁', '学生党', '宅家族', '独居', '懒人'], lifecycleStage: 'rising', baseHeat: 62 },
    { name: '#FoodReviewRealTalk', type: 'hashtag', url: 'https://www.tiktok.com/tag/food-review', categories: ['food', 'entertainment'], keywords: ['真实测评', '避雷', '种草', '踩雷', '跟风', '网红食品', '实话'], audienceTags: ['18-40岁', '理性消费', '吃货', '测评党', '跟风族'], lifecycleStage: 'rising', baseHeat: 58 },
    { name: '#LateNightCravings', type: 'hashtag', url: 'https://www.tiktok.com/tag/late-night-cravings', categories: ['food', 'lifestyle'], keywords: ['夜宵', '深夜', '外卖', '速食', '罪恶感', '泡面', '炸鸡'], audienceTags: ['18-35岁', '夜猫子', '学生党', '独居', '熬夜族'], lifecycleStage: 'peak', baseHeat: 75 },
    { name: '#CloudBreadFail', type: 'hashtag', url: 'https://www.tiktok.com/tag/cloud-bread', categories: ['food', 'entertainment'], keywords: ['云朵面包', '翻车', '烘焙', '网红食谱', '挑战', '失败'], audienceTags: ['16-30岁', '烘焙新手', '挑战者', 'Z世代'], lifecycleStage: 'dying', baseHeat: 25 },
    { name: '#RegionalSnackSwap', type: 'hashtag', url: 'https://www.tiktok.com/tag/regional-snack-swap', categories: ['food', 'lifestyle'], keywords: ['地方零食', '特产', '互换', '开箱', '文化', '东北', '四川', '广东'], audienceTags: ['18-40岁', '零食爱好者', '文化体验', '好奇党', '特产控'], lifecycleStage: 'emerging', baseHeat: 48 },
    // --- Food 扩展：小家电食谱/DIY饮品/挑战型 ---
    { name: '#AirFryerRecipeHack', type: 'hashtag', url: 'https://www.tiktok.com/tag/airfryer-recipe', categories: ['food', 'home'], keywords: ['空气炸锅', '食谱', '懒人', '快手', '低油', '鸡翅', '甜点'], audienceTags: ['20-45岁', '懒人', '厨房新手', '独居', '减肥人群'], lifecycleStage: 'peak', baseHeat: 85 },
    { name: '#BobaKitAtHome', type: 'hashtag', url: 'https://www.tiktok.com/tag/boba-kit-at-home', categories: ['food', 'lifestyle'], keywords: ['奶茶', '自制', '珍珠', '测评', '奶茶店', '省钱', 'DIY'], audienceTags: ['16-30岁', '奶茶控', '学生党', 'Z世代', '宅家族'], lifecycleStage: 'rising', baseHeat: 62 },
    { name: '#SpicyNoodleChallenge', type: 'hashtag', url: 'https://www.tiktok.com/tag/spicy-noodle-challenge', categories: ['food', 'entertainment'], keywords: ['辣', '挑战', '火鸡面', '辣度', '反应', '搞笑', '速食'], audienceTags: ['16-30岁', '挑战爱好者', '学生', 'Z世代', '吃播'], lifecycleStage: 'declining', baseHeat: 38 },
    { name: '#OvernightOatsPrep', type: 'hashtag', url: 'https://www.tiktok.com/tag/overnight-oats', categories: ['food', 'health', 'lifestyle'], keywords: ['隔夜燕麦', '备餐', '早餐', '健康', 'mealprep', '分层', '高颜值'], audienceTags: ['20-35女性', '上班族', '减脂人群', '学生', '仪式感'], lifecycleStage: 'declining', baseHeat: 40 },
    // TECH (科技数码) — 14 条
    { name: '#ANCShowdown降噪横评', type: 'hashtag', url: 'https://www.tiktok.com/tag/anc-showdown', categories: ['tech', 'entertainment'], keywords: ['降噪', '耳机横评', 'TWS', '音质', '对比', 'Sony', 'Bose', 'AirPods'], audienceTags: ['18-40岁', '数码爱好者', '通勤族', '学生', '音质党'], lifecycleStage: 'peak', baseHeat: 78 },
    { name: '百元数码好物', type: 'topic', url: '', categories: ['tech', 'lifestyle'], keywords: ['平价数码', '好物推荐', '学生党', '百元', '性价比', '拼多多', '1688'], audienceTags: ['16-30岁', '学生党', '数码入门', '预算有限', 'Z世代'], lifecycleStage: 'rising', baseHeat: 74 },
    { name: '#SmartHomeDIY', type: 'hashtag', url: 'https://www.tiktok.com/tag/smart-home-setup', categories: ['tech', 'home'], keywords: ['智能家居', '全屋智能', '米家', 'HomeKit', '自动化', '传感器', '语音控制'], audienceTags: ['25-45岁', '科技爱好者', '新房装修', '极客', '懒人'], lifecycleStage: 'emerging', baseHeat: 52 },
    { name: '#TechUnboxingFirst', type: 'hashtag', url: 'https://www.tiktok.com/tag/tech-unboxing', categories: ['tech', 'entertainment'], keywords: ['开箱', '数码', '首发', '新机', 'iPhone', '轻薄本', '手柄'], audienceTags: ['18-40岁', '数码控', '首发党', '男性为主', '科技博主'], lifecycleStage: 'peak', baseHeat: 82 },
    { name: '#DeskTourBattle', type: 'hashtag', url: 'https://www.tiktok.com/tag/desk-tour', categories: ['tech', 'home', 'lifestyle'], keywords: ['桌面', '桌搭', 'RGB', '显示器', '机械键盘', '极简', '线材'], audienceTags: ['18-35岁', '桌搭爱好者', '程序员', '学生', '男性为主'], lifecycleStage: 'rising', baseHeat: 70 },
    { name: '#WirelessEarbuds2026', type: 'hashtag', url: 'https://www.tiktok.com/tag/wireless-earbuds', categories: ['tech', 'lifestyle'], keywords: ['无线耳机', 'TWS', '排行', '性价比', '通话', '游戏', '运动'], audienceTags: ['16-40岁', '学生', '通勤族', '健身人群', '游戏玩家'], lifecycleStage: 'peak', baseHeat: 72 },
    { name: '#BudgetVsFlagship', type: 'hashtag', url: 'https://www.tiktok.com/tag/budget-vs-flagship', categories: ['tech', 'entertainment'], keywords: ['对比', '性价比', '旗舰', '千元机', '盲测', '拍照', '体验'], audienceTags: ['18-40岁', '理性消费', '学生', '数码入门', '性价比党'], lifecycleStage: 'rising', baseHeat: 65 },
    { name: '#CableManagementWin', type: 'hashtag', url: 'https://www.tiktok.com/tag/cable-management', categories: ['tech', 'home'], keywords: ['理线', '线材', '整洁', '强迫症', '桌面', '收纳', '充电'], audienceTags: ['20-40岁', '桌搭党', '强迫症', '极简主义者', '办公族'], lifecycleStage: 'emerging', baseHeat: 48 },
    { name: '#PhonePhotographyTip', type: 'hashtag', url: 'https://www.tiktok.com/tag/phone-camera-tips', categories: ['tech', 'lifestyle'], keywords: ['手机摄影', '拍照技巧', '构图', '调色', '夜景', '人像', '教程'], audienceTags: ['16-40岁', '摄影入门', '朋友圈达人', '旅游爱好者', '女性'], lifecycleStage: 'declining', baseHeat: 44 },
    // --- Tech 扩展：外设声效/平价电竞/配件测评 ---
    { name: '#MechanicalKeyboardSound', type: 'sound', url: 'https://www.tiktok.com/music/mechanical-keyboard-typing', categories: ['tech', 'lifestyle'], keywords: ['机械键盘', '打字音', 'ASMR', '轴体', '办公', '程序员', '解压'], audienceTags: ['18-35岁', '程序员', '办公族', '桌搭', 'ASMR爱好者'], lifecycleStage: 'rising', baseHeat: 65 },
    { name: '#BudgetGamingSetup', type: 'hashtag', url: 'https://www.tiktok.com/tag/budget-gaming-setup', categories: ['tech', 'entertainment'], keywords: ['平价', '电竞', '千元', '学生', '配置', '二手', '性价比'], audienceTags: ['16-25岁', '学生', '游戏玩家', '预算有限', 'Z世代'], lifecycleStage: 'rising', baseHeat: 68 },
    { name: '#PhoneGimbalReview', type: 'hashtag', url: 'https://www.tiktok.com/tag/phone-gimbal-review', categories: ['tech', 'lifestyle'], keywords: ['手机云台', '稳定器', '测评', 'vlog', '拍摄', 'DJI', '防抖'], audienceTags: ['18-35岁', 'vlogger', '摄影入门', '旅游', '创作者'], lifecycleStage: 'emerging', baseHeat: 52 },
    { name: '#WebcamQualityTest', type: 'hashtag', url: 'https://www.tiktok.com/tag/webcam-quality', categories: ['tech', 'lifestyle'], keywords: ['摄像头', '画质', '会议', '远程', '美颜', '灯光', '对比'], audienceTags: ['22-45岁', '远程办公', '主播', '视频会议', '上班族'], lifecycleStage: 'emerging', baseHeat: 48 },
    { name: '#PowerBankShowdown', type: 'hashtag', url: 'https://www.tiktok.com/tag/power-bank-showdown', categories: ['tech', 'lifestyle'], keywords: ['充电宝', '横评', '容量', '快充', '磁吸', '便携', '户外'], audienceTags: ['18-40岁', '学生', '旅游爱好者', '数码党', '通勤'], lifecycleStage: 'declining', baseHeat: 35 },
    // HOME (家居生活) — 15 条
    { name: '#RoomMakeover小户型', type: 'hashtag', url: 'https://www.tiktok.com/tag/room-makeover', categories: ['home', 'lifestyle'], keywords: ['房间改造', '收纳', '软装', '小户型', '租房改造', '平替', '低成本'], audienceTags: ['18-35岁', '租房党', '装修新手', '独居', '女性'], lifecycleStage: 'peak', baseHeat: 90 },
    { name: '#DeskSetupBattle', type: 'hashtag', url: 'https://www.tiktok.com/tag/desk-setup', categories: ['home', 'tech', 'lifestyle'], keywords: ['桌搭', '布置', '办公', 'RGB', '极简', '电竞', '程序员'], audienceTags: ['20-35岁', '办公族', '桌搭爱好者', '程序员', '男性为主'], lifecycleStage: 'rising', baseHeat: 76 },
    { name: '治愈系晚间routine', type: 'topic', url: '', categories: ['home', 'lifestyle', 'beauty'], keywords: ['睡前', '仪式感', '香薰', '护肤', '放松', '泡脚', '冥想'], audienceTags: ['20-35岁', '女性', '独居', '生活仪式感', '焦虑族'], lifecycleStage: 'rising', baseHeat: 68 },
    { name: '#DiffuserCollection', type: 'hashtag', url: 'https://www.tiktok.com/tag/diffuser-aesthetics', categories: ['home', 'beauty'], keywords: ['香薰机', '雾化', '精油', '氛围感', '加湿', 'MUJI', '无印良品'], audienceTags: ['20-40岁', '女性', '香薰爱好者', '家居', '独居'], lifecycleStage: 'declining', baseHeat: 42 },
    { name: '#CleaningTok解压', type: 'hashtag', url: 'https://www.tiktok.com/tag/cleaning-tok', categories: ['home', 'lifestyle'], keywords: ['清洁', '收纳', '大扫除', '解压', '工具', '妙招', '前后对比'], audienceTags: ['全年龄', '主妇', '独居', '洁癖', '解压族'], lifecycleStage: 'peak', baseHeat: 85 },
    { name: '#OrganizationHack', type: 'hashtag', url: 'https://www.tiktok.com/tag/organization-hack', categories: ['home', 'lifestyle'], keywords: ['收纳', '整理', '分类', '标签', '抽屉', '衣橱', '厨房'], audienceTags: ['25-45岁', '主妇', '收纳达人', '宝妈', '独居'], lifecycleStage: 'rising', baseHeat: 72 },
    { name: '#PlantParentLife', type: 'hashtag', url: 'https://www.tiktok.com/tag/plant-parent', categories: ['home', 'lifestyle'], keywords: ['绿植', '盆栽', '养护', '浇水', '多肉', '龟背竹', '室内植物'], audienceTags: ['20-40岁', '植物爱好者', '独居', '女性为主', '阳台党'], lifecycleStage: 'emerging', baseHeat: 55 },
    { name: '#RentalFriendlyDIY', type: 'hashtag', url: 'https://www.tiktok.com/tag/rental-friendly-diy', categories: ['home', 'lifestyle'], keywords: ['租房', '改造', '免打孔', '可移除', 'DIY', '省钱', '创意'], audienceTags: ['20-35岁', '租房党', '学生', '独居', '预算有限'], lifecycleStage: 'rising', baseHeat: 60 },
    { name: '#MiniHomeAppliance', type: 'hashtag', url: 'https://www.tiktok.com/tag/mini-appliance', categories: ['home', 'food', 'lifestyle'], keywords: ['小家电', '迷你', '独居', '一人食', '电煮锅', '三明治机', '空气炸锅'], audienceTags: ['20-35岁', '独居', '学生', '租房党', '懒人'], lifecycleStage: 'rising', baseHeat: 70 },
    { name: '#BedroomLighting', type: 'hashtag', url: 'https://www.tiktok.com/tag/bedroom-lighting', categories: ['home', 'lifestyle'], keywords: ['卧室', '灯光', '氛围灯', 'RGB', '日落灯', '串灯', '投影'], audienceTags: ['18-30岁', '女性', '学生', '独居', '氛围感族'], lifecycleStage: 'emerging', baseHeat: 52 },
    // --- Home 扩展：冰箱收纳/阳台/声香/租房改造 ---
    { name: '#FridgeRestockOrganization', type: 'hashtag', url: 'https://www.tiktok.com/tag/fridge-restock', categories: ['home', 'food', 'lifestyle'], keywords: ['冰箱', '收纳', '整理', '保鲜', '分类', '美观', '饮品'], audienceTags: ['22-40女性', '家居爱好者', '收纳达人', '宝妈', '独居'], lifecycleStage: 'peak', baseHeat: 82 },
    { name: '#BalconyGardenTour', type: 'hashtag', url: 'https://www.tiktok.com/tag/balcony-garden', categories: ['home', 'lifestyle'], keywords: ['阳台', '花园', '盆栽', '多肉', '小空间', 'DIY', '治愈'], audienceTags: ['20-40岁', '植物爱好者', '租房党', '独居', '女性'], lifecycleStage: 'rising', baseHeat: 60 },
    { name: '#HomeScentReview', type: 'hashtag', url: 'https://www.tiktok.com/tag/home-scent-review', categories: ['home', 'beauty'], keywords: ['香薰', '蜡烛', '无火', '扩香', '测评', '气味', '品牌'], audienceTags: ['22-40女性', '家居控', '仪式感族', '高消费力', '送礼'], lifecycleStage: 'emerging', baseHeat: 46 },
    { name: '#RentalKitchenMakeover', type: 'hashtag', url: 'https://www.tiktok.com/tag/rental-kitchen-diy', categories: ['home', 'food', 'lifestyle'], keywords: ['租房', '厨房', '改造', '免打孔', '收纳', '清洁', '低成本'], audienceTags: ['20-35岁', '租房党', '独居', '预算有限', '学生'], lifecycleStage: 'rising', baseHeat: 62 },
    { name: '#MoodLampUnboxing', type: 'hashtag', url: 'https://www.tiktok.com/tag/mood-lamp', categories: ['home', 'tech'], keywords: ['氛围灯', '日落灯', 'RGB', '卧室', '投影', '开箱', '测评'], audienceTags: ['16-30岁', '学生', '独居', '氛围感族', '女性'], lifecycleStage: 'declining', baseHeat: 44 },
    // PET (宠物) — 14 条
    { name: '#CatReacts_Funny', type: 'hashtag', url: 'https://www.tiktok.com/tag/cat-reacts', categories: ['pet', 'entertainment'], keywords: ['猫咪', '反应', '好笑', '萌宠', '猫奴', '橘猫', '布偶'], audienceTags: ['全年龄', '猫奴', '萌宠爱好者', '解压族'], lifecycleStage: 'peak', baseHeat: 88 },
    { name: '宠物智能产品测评', type: 'topic', url: '', categories: ['pet', 'tech'], keywords: ['智能猫砂盆', '自动喂食器', '饮水机', '摄像头', '宠物科技', '解放双手'], audienceTags: ['25-45岁', '养宠人群', '科技爱好者', '上班族铲屎官', '懒人'], lifecycleStage: 'rising', baseHeat: 72 },
    { name: '#RawFeedCat生骨肉', type: 'hashtag', url: 'https://www.tiktok.com/tag/raw-feed-cat', categories: ['pet', 'health', 'food'], keywords: ['生骨肉', '猫饭', '鲜食', '营养', '成分', 'BARF', '冻干'], audienceTags: ['25-40岁', '科学养宠', '高消费力', '猫奴', '成分党'], lifecycleStage: 'emerging', baseHeat: 50 },
    { name: '#DogTraining101', type: 'hashtag', url: 'https://www.tiktok.com/tag/dog-training', categories: ['pet', 'lifestyle'], keywords: ['训狗', '口令', '坐下', '随行', '大小便', '社会化', '奖励'], audienceTags: ['20-50岁', '狗主', '新手养狗', '家庭', '有耐心'], lifecycleStage: 'peak', baseHeat: 76 },
    { name: '#PetASMREating', type: 'hashtag', url: 'https://www.tiktok.com/tag/pet-asmr', categories: ['pet', 'food'], keywords: ['宠物', '吃播', 'ASMR', '狗粮', '冻干', '咀嚼', '可爱'], audienceTags: ['全年龄', '宠物爱好者', 'ASMR爱好者', '解压族'], lifecycleStage: 'rising', baseHeat: 64 },
    { name: '#AdoptDontShop', type: 'hashtag', url: 'https://www.tiktok.com/tag/adopt-dont-shop', categories: ['pet', 'lifestyle'], keywords: ['领养', '流浪', '救助', '代替购买', '中华田园猫', '中华田园犬', '公益'], audienceTags: ['全年龄', '爱心人士', '动物保护', '年轻人', '志愿者'], lifecycleStage: 'peak', baseHeat: 70 },
    { name: '#PetBakingHomemade', type: 'hashtag', url: 'https://www.tiktok.com/tag/pet-baking', categories: ['pet', 'food'], keywords: ['宠物烘焙', '自制', '宠物零食', '鸡胸肉干', '奶酪', '健康', '无添加'], audienceTags: ['22-40岁', '养宠人群', '动手达人', '女性为主', '高消费力'], lifecycleStage: 'emerging', baseHeat: 45 },
    { name: '#PetFashionShow', type: 'hashtag', url: 'https://www.tiktok.com/tag/pet-fashion', categories: ['pet', 'fashion', 'entertainment'], keywords: ['宠物穿搭', '衣服', '项圈', '配饰', '可爱', '小型犬', '猫咪'], audienceTags: ['18-35女性', '宠物控', '时尚爱好者', '拍照党'], lifecycleStage: 'declining', baseHeat: 38 },
    { name: '#MultiPetHousehold', type: 'hashtag', url: 'https://www.tiktok.com/tag/multi-pet-household', categories: ['pet', 'lifestyle'], keywords: ['多宠', '猫狗双全', '相处', '打架', '甜蜜', '日常', '铲屎'], audienceTags: ['20-45岁', '多宠家庭', '猫奴', '狗主', '有房族'], lifecycleStage: 'rising', baseHeat: 56 },
    // --- Pet 扩展：用品测评/居家美容/老年护理 ---
    { name: '#CatToyDestructionTest', type: 'hashtag', url: 'https://www.tiktok.com/tag/cat-toy-test', categories: ['pet', 'entertainment'], keywords: ['猫玩具', '耐久', '测评', '破坏', '猫薄荷', '逗猫棒', '有趣'], audienceTags: ['全年龄', '猫奴', '铲屎官', '搞笑', '养猫新手'], lifecycleStage: 'rising', baseHeat: 64 },
    { name: '#DogGroomingHome', type: 'hashtag', url: 'https://www.tiktok.com/tag/dog-grooming-home', categories: ['pet', 'lifestyle'], keywords: ['狗狗', '美容', '剃毛', '指甲', '洗澡', '教程', '省钱'], audienceTags: ['25-50岁', '狗主', '动手达人', '家庭', '女性'], lifecycleStage: 'rising', baseHeat: 56 },
    { name: '#PetCameraHighlights', type: 'hashtag', url: 'https://www.tiktok.com/tag/pet-camera', categories: ['pet', 'tech'], keywords: ['宠物摄像头', '监控', '独自在家', '搞笑', '拆家', '可爱', '远程'], audienceTags: ['25-45岁', '上班族铲屎官', '科技养宠', '猫奴狗主', '焦虑型'], lifecycleStage: 'emerging', baseHeat: 50 },
    { name: '#CatTreeSetupDIY', type: 'hashtag', url: 'https://www.tiktok.com/tag/cat-tree-diy', categories: ['pet', 'home'], keywords: ['猫爬架', 'DIY', '自制', '省钱', '猫咪', '攀爬', '收纳'], audienceTags: ['22-40岁', '猫奴', '动手达人', '租房党', '预算有限'], lifecycleStage: 'emerging', baseHeat: 42 },
    { name: '#SeniorPetsDaily', type: 'hashtag', url: 'https://www.tiktok.com/tag/senior-pets', categories: ['pet', 'health'], keywords: ['老年宠物', '护理', '关节炎', '饮食', '陪伴', '暖心', '推荐'], audienceTags: ['30-60岁', '养宠多年', '爱心', '高消费力', '家庭'], lifecycleStage: 'emerging', baseHeat: 44 },
    // E-COMMERCE & CROSS-CATEGORY (电商+跨品类) — 30 条
    { name: '#TikTokMadeMeBuyIt', type: 'hashtag', url: 'https://www.tiktok.com/tag/tiktokmademebuyit', categories: ['lifestyle', 'beauty', 'food', 'tech', 'home', 'pet'], keywords: ['种草', '推荐', '好物', '冲动消费', '开箱', '跟风', '爆款'], audienceTags: ['全年龄', 'Z世代', '网购族', '跟风党', '冲动型'], lifecycleStage: 'peak', baseHeat: 95 },
    { name: '#UnboxWithMe开箱', type: 'hashtag', url: 'https://www.tiktok.com/tag/unbox-with-me', categories: ['lifestyle', 'beauty', 'tech', 'food'], keywords: ['开箱', '拆箱', '快递', '购物分享', '第一手', '仪式感', '满足'], audienceTags: ['全年龄', '购物爱好者', '种草族', 'ASMR爱好者', '女性'], lifecycleStage: 'peak', baseHeat: 85 },
    { name: '#SmallBizCheck国货', type: 'hashtag', url: 'https://www.tiktok.com/tag/small-biz-check', categories: ['lifestyle', 'food', 'home', 'beauty'], keywords: ['小众品牌', '独立品牌', '支持国货', '创业者', '手作', '品质', '差异化'], audienceTags: ['20-40岁', '支持国货', '品质消费者', 'Z世代', '女性'], lifecycleStage: 'rising', baseHeat: 70 },
    { name: '沉浸式ASMR', type: 'sound', url: 'https://www.tiktok.com/music/asmr-satisfying', categories: ['lifestyle', 'food', 'beauty', 'home'], keywords: ['ASMR', '解压', '治愈', '声音', '舒适', '沉浸式', '白噪音'], audienceTags: ['全年龄', 'ASMR爱好者', '解压人群', '失眠族', '学生'], lifecycleStage: 'peak', baseHeat: 80 },
    { name: '#SlowLiving慢生活', type: 'hashtag', url: 'https://www.tiktok.com/tag/slow-living', categories: ['lifestyle', 'home', 'health'], keywords: ['慢生活', '极简', '治愈', 'vlog', '日常', '田园', '手工'], audienceTags: ['25-40岁', '都市白领', '追求品质生活', '极简主义者', '焦虑族'], lifecycleStage: 'emerging', baseHeat: 58 },
    { name: '#TikTokShopFinds', type: 'hashtag', url: 'https://www.tiktok.com/tag/tiktokshop-finds', categories: ['lifestyle', 'beauty', 'tech', 'home', 'food'], keywords: ['TikTokShop', '购物', '发现', '低价', '限时', '直播', '带货'], audienceTags: ['18-45岁', 'TikTok用户', '网购族', '冲动消费', '全品类'], lifecycleStage: 'peak', baseHeat: 90 },
    { name: '#BeforeAfterWow', type: 'hashtag', url: 'https://www.tiktok.com/tag/before-after', categories: ['lifestyle', 'beauty', 'home', 'fitness'], keywords: ['前后对比', '变化', '改造', '效果', '惊人', '一周', '一月'], audienceTags: ['全年龄', '改变族', '护肤', '健身', '家居'], lifecycleStage: 'peak', baseHeat: 88 },
    { name: '#AmazonFinds2026', type: 'hashtag', url: 'https://www.tiktok.com/tag/amazon-finds', categories: ['lifestyle', 'tech', 'home', 'pet'], keywords: ['Amazon', '好物', '推荐', '海外', 'PrimeDay', '收纳', '小工具'], audienceTags: ['20-40岁', '海外华人', '网购族', 'Prime会员', '中产'], lifecycleStage: 'peak', baseHeat: 82 },
    { name: '#SheinHaul开箱', type: 'hashtag', url: 'https://www.tiktok.com/tag/shein-haul', categories: ['lifestyle', 'fashion', 'beauty', 'home'], keywords: ['Shein', '快时尚', '开箱', '便宜', '试穿', '翻车', '惊喜'], audienceTags: ['16-30女性', '学生', '快时尚', '预算有限', 'Z世代'], lifecycleStage: 'declining', baseHeat: 48 },
    { name: '#SatisfyingPackaging', type: 'hashtag', url: 'https://www.tiktok.com/tag/satisfying-packaging', categories: ['lifestyle', 'beauty', 'food', 'home'], keywords: ['包装', '开箱', '仪式感', '精美', '环保', '奢侈品', '拆包'], audienceTags: ['18-40女性', '仪式感族', '颜控', '购物爱好者', '高消费'], lifecycleStage: 'rising', baseHeat: 72 },
    { name: '#DupeOrNah平替鉴定', type: 'hashtag', url: 'https://www.tiktok.com/tag/dupe-or-nah', categories: ['lifestyle', 'beauty', 'tech'], keywords: ['平替', '大牌', '对比', '值不值', '省钱', '智商税', '成分'], audienceTags: ['18-35岁', '性价比党', '学生', '理性消费', '成分党'], lifecycleStage: 'rising', baseHeat: 68 },
    { name: '#AestheticHaul美拉德', type: 'hashtag', url: 'https://www.tiktok.com/tag/aesthetic-haul', categories: ['lifestyle', 'fashion', 'beauty', 'home'], keywords: ['美学', '配色', '风格', '购物', '美拉德', '多巴胺', '格雷系'], audienceTags: ['16-30女性', '审美党', '时尚爱好者', 'Z世代', '小红书用户'], lifecycleStage: 'peak', baseHeat: 78 },
    { name: '#ShoppingAddict坦白局', type: 'hashtag', url: 'https://www.tiktok.com/tag/shopping-addict', categories: ['lifestyle', 'entertainment'], keywords: ['购物', '上瘾', '剁手', '快递', '账单', '后悔', '断舍离'], audienceTags: ['18-35女性', '网购族', '冲动消费', '学生', '上班族'], lifecycleStage: 'declining', baseHeat: 40 },
    { name: '#ViralProductTest', type: 'hashtag', url: 'https://www.tiktok.com/tag/viral-product-test', categories: ['lifestyle', 'beauty', 'tech', 'food', 'home'], keywords: ['测评', '爆款', '验证', '真实', '打假', '种草', '拔草'], audienceTags: ['18-40岁', '理性消费', '测评党', '跟风族', '全品类'], lifecycleStage: 'peak', baseHeat: 85 },
    { name: '#LastMinuteGift', type: 'hashtag', url: 'https://www.tiktok.com/tag/last-minute-gift', categories: ['lifestyle', 'tech', 'beauty', 'home'], keywords: ['送礼', '最后时刻', '生日', '节日', '创意', 'DIY', '预算'], audienceTags: ['18-35岁', '拖延症', '学生', '情侣', '送礼困难户'], lifecycleStage: 'rising', baseHeat: 60 },
    { name: '#ColorAnalysis四季型', type: 'hashtag', url: 'https://www.tiktok.com/tag/color-analysis', categories: ['lifestyle', 'beauty', 'fashion'], keywords: ['色彩', '四季', '穿搭', '肤色', '发色', '化妆', '测色'], audienceTags: ['18-35女性', '时尚', '美妆', '自我认知', '韩系'], lifecycleStage: 'rising', baseHeat: 62 },
    { name: '#MicroTrend快闪', type: 'hashtag', url: 'https://www.tiktok.com/tag/micro-trend', categories: ['lifestyle', 'fashion', 'entertainment'], keywords: ['微趋势', '快速', '流行', '短暂', 'Z世代', '一周', '过气'], audienceTags: ['16-25岁', 'Z世代', '潮流先锋', '快时尚', '学生'], lifecycleStage: 'emerging', baseHeat: 45 },
    { name: '#1MinProductDemo', type: 'hashtag', url: 'https://www.tiktok.com/tag/1min-demo', categories: ['lifestyle', 'tech', 'beauty', 'home'], keywords: ['一分钟', '演示', '功能', '快速', '高效', '卖点', '短视频'], audienceTags: ['18-40岁', '快节奏', 'IT族', '学生', '耐心有限'], lifecycleStage: 'rising', baseHeat: 70 },
    { name: '#LiveShoppingHaul', type: 'hashtag', url: 'https://www.tiktok.com/tag/live-shopping', categories: ['lifestyle', 'fashion', 'beauty', 'food'], keywords: ['直播', '带货', '抢购', '限时', '折扣', '主播', '秒杀'], audienceTags: ['20-45女性', '直播购物', '冲动消费', '价格敏感', '信任型'], lifecycleStage: 'rising', baseHeat: 75 },
    { name: '#EcoSwapSaveEarth', type: 'hashtag', url: 'https://www.tiktok.com/tag/eco-swap', categories: ['lifestyle', 'home', 'food'], keywords: ['环保', '可持续', '替代', '减塑', '零浪费', '竹制品', '蜂蜡'], audienceTags: ['20-40岁', '环保主义者', 'Z世代', '宝妈', '中产'], lifecycleStage: 'emerging', baseHeat: 50 },
    // --- E-Commerce 扩展：闪购/盲盒/送礼/拔草/二手改造 ---
    { name: '#FlashSaleHaul战利品', type: 'hashtag', url: 'https://www.tiktok.com/tag/flash-sale-haul', categories: ['lifestyle', 'beauty', 'food', 'home'], keywords: ['闪购', '秒杀', '折扣', '低价', '直播', '抢到', '划算'], audienceTags: ['18-40女性', '价格敏感', '网购族', '学生', '冲动型'], lifecycleStage: 'peak', baseHeat: 78 },
    { name: '#WorthItReview值不值', type: 'hashtag', url: 'https://www.tiktok.com/tag/worth-it-review', categories: ['lifestyle', 'beauty', 'tech'], keywords: ['测评', '价值', '性价比', '真实', '大牌', '智商税', '推荐'], audienceTags: ['18-40岁', '理性消费', '测评党', '学生', '跟风族'], lifecycleStage: 'peak', baseHeat: 80 },
    { name: '#BuyOrPass买不买', type: 'hashtag', url: 'https://www.tiktok.com/tag/buy-or-pass', categories: ['lifestyle', 'beauty', 'tech', 'food'], keywords: ['推荐', '避雷', '选择', '对比', '预算', '决策', '购物'], audienceTags: ['18-35岁', '犹豫族', '学生', '理性消费', '跟风'], lifecycleStage: 'rising', baseHeat: 68 },
    { name: '#ThriftFlipUpcycle改造', type: 'hashtag', url: 'https://www.tiktok.com/tag/thrift-flip', categories: ['lifestyle', 'fashion', 'home'], keywords: ['二手', '改造', '节俭', '创意', 'DIY', '复古', '可持续'], audienceTags: ['18-30岁', 'Z世代', '环保', '创意', '预算有限'], lifecycleStage: 'emerging', baseHeat: 52 },
    { name: '#GiftGuideForHim送他', type: 'hashtag', url: 'https://www.tiktok.com/tag/gift-guide-for-him', categories: ['lifestyle', 'tech', 'fashion'], keywords: ['送礼', '男友', '老公', '父亲', '节日', '创意', '预算'], audienceTags: ['20-40女性', '送礼党', '情侣', '家庭', '选择困难'], lifecycleStage: 'rising', baseHeat: 58 },
    { name: '#AntiHaul拔草', type: 'hashtag', url: 'https://www.tiktok.com/tag/anti-haul', categories: ['lifestyle', 'beauty', 'tech', 'food'], keywords: ['拔草', '不买', '后悔', '智商税', '真实', '避雷', '退坑'], audienceTags: ['18-35岁', '理性消费', '购物达人', '学生', '女性'], lifecycleStage: 'emerging', baseHeat: 52 },
    { name: '#DollarStoreMakeover', type: 'hashtag', url: 'https://www.tiktok.com/tag/dollar-store-diy', categories: ['lifestyle', 'home'], keywords: ['一元店', '省钱', '改造', '收纳', 'DIY', '平价', '创意'], audienceTags: ['18-35岁', '学生', '预算有限', 'DIY党', '家庭'], lifecycleStage: 'rising', baseHeat: 58 },
    { name: '#SubscriptionBoxTrial', type: 'hashtag', url: 'https://www.tiktok.com/tag/subscription-box', categories: ['lifestyle', 'beauty', 'food'], keywords: ['订阅', '盲盒', '月度', '开箱', '惊喜', '测评', '值不值'], audienceTags: ['22-35女性', '尝鲜族', '中产', '懒人', '购物爱好者'], lifecycleStage: 'emerging', baseHeat: 44 },
    { name: '#SeasonalWardrobeRefresh', type: 'hashtag', url: 'https://www.tiktok.com/tag/seasonal-wardrobe', categories: ['lifestyle', 'fashion', 'beauty'], keywords: ['换季', '衣橱', '收纳', '断舍离', '穿搭', '更新', '购物'], audienceTags: ['20-40女性', '爱美', '中产', '季节', '整理控'], lifecycleStage: 'peak', baseHeat: 65 },
    { name: '#MysteryBoxUnboxing盲盒', type: 'hashtag', url: 'https://www.tiktok.com/tag/mystery-box', categories: ['lifestyle', 'entertainment'], keywords: ['盲盒', '开箱', '惊喜', '玩具', '收藏', 'IP', '潮玩'], audienceTags: ['16-30岁', 'Z世代', '潮玩爱好者', '学生', '收藏控'], lifecycleStage: 'declining', baseHeat: 42 },
  ];

  // =========================================================================
  // 品类 -> 趋势映射（快速查找）
  // =========================================================================

  private readonly categoryTrends: Map<string, MockTrendTemplate[]> = new Map();

  constructor() {
    this.buildCategoryIndex();
  }

  private buildCategoryIndex(): void {
    for (const trend of this.globalTrends) {
      for (const cat of trend.categories) {
        if (!this.categoryTrends.has(cat)) {
          this.categoryTrends.set(cat, []);
        }
        this.categoryTrends.get(cat)!.push(trend);
      }
    }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * 获取指定品类的趋势数据点（Top N）
   */
  getTrendsForCategory(
    category: string,
    count: number = 10,
  ): TrendDataPoint[] {
    const categorySpecific = this.categoryTrends.get(category) || [];
    const global = this.globalTrends.filter(
      (t) => !categorySpecific.includes(t),
    );

    // 品类相关趋势优先，全局趋势补充
    const combined = [
      ...categorySpecific.sort((a, b) => b.baseHeat - a.baseHeat),
      ...global.sort((a, b) => b.baseHeat - a.baseHeat),
    ];

    // 去重
    const seen = new Set<string>();
    const unique = combined.filter((t) => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });

    return unique.slice(0, count).map((t) => this.toDataPoint(t));
  }

  /**
   * 获取全局最热趋势（不限品类）
   */
  getGlobalTopTrends(count: number = 15): TrendDataPoint[] {
    return this.globalTrends
      .sort((a, b) => b.baseHeat - a.baseHeat)
      .slice(0, count)
      .map((t) => this.toDataPoint(t));
  }

  /**
   * 为指定趋势生成历史快照（用于速度和生命周期分析）
   *
   * 根据生命周期阶段模拟不同的历史轨迹：
   *   - emerging: 从接近0开始加速增长
   *   - rising: 持续增长
   *   - peak: 先增后稳定
   *   - declining: 已过峰值，开始下降
   *   - dying: 持续下降至残量
   */
  generateHistory(
    trendName: string,
    trendType: TrendType,
    days: number = 14,
  ): TrendHistoryPoint[] {
    const template = this.globalTrends.find((t) => t.name === trendName);
    const currentHeat = template?.baseHeat ?? 50;
    const stage = template?.lifecycleStage ?? 'peak';

    const points: TrendHistoryPoint[] = [];
    const now = Date.now();

    for (let i = days; i >= 0; i--) {
      const timestamp = new Date(now - i * 24 * 60 * 60 * 1000);
      const t = (days - i) / days; // 0 (最早) 到 1 (最新)
      const heatScore = this.simulateHeatTrajectory(stage, currentHeat, t, days);
      const mentionCount = Math.round(Math.pow(10, (heatScore / 100) * 6));
      const videoCount = Math.round(mentionCount * (0.01 + Math.random() * 0.05));

      points.push({
        name: trendName,
        type: trendType,
        heatScore: Math.round(heatScore * 100) / 100,
        mentionCount,
        videoCount,
        timestamp,
      });
    }

    return points;
  }

  /**
   * 批量生成多个趋势的历史数据
   */
  generateHistoryBulk(
    trendNames: string[],
    days: number = 14,
  ): TrendHistoryPoint[] {
    const allPoints: TrendHistoryPoint[] = [];
    for (const name of trendNames) {
      const template = this.globalTrends.find((t) => t.name === name);
      allPoints.push(
        ...this.generateHistory(name, template?.type ?? 'hashtag', days),
      );
    }
    return allPoints;
  }

  // =========================================================================
  // Private: Data Point Generation
  // =========================================================================

  /**
   * 将模板转换为带有多维度指标的 TrendDataPoint
   */
  private toDataPoint(template: MockTrendTemplate): TrendDataPoint {
    const heat = template.baseHeat;

    // 基于热度反向推算各项指标
    const mentionCount7d = this.heatToMentions(heat, 7);
    const mentionCount24h = this.heatToMentions(heat, 1) * (1 + this.stageVelocityMultiplier(template.lifecycleStage));

    const videoCount = Math.round(mentionCount7d * 0.05);
    const likeCount = Math.round(mentionCount7d * (20 + Math.random() * 30));
    const shareCount = Math.round(likeCount * (0.05 + Math.random() * 0.1));
    const commentCount = Math.round(likeCount * (0.03 + Math.random() * 0.07));
    const creatorAdoptionRate = this.heatToAdoptionRate(heat, template.lifecycleStage);

    return {
      name: template.name,
      type: template.type,
      url: template.url || undefined,
      mentionCount24h: Math.round(mentionCount24h),
      mentionCount7d: Math.round(mentionCount7d),
      likeCount: Math.round(likeCount),
      shareCount: Math.round(shareCount),
      commentCount: Math.round(commentCount),
      videoCount: Math.round(videoCount),
      creatorAdoptionRate,
      categories: template.categories,
      keywords: template.keywords,
      audienceTags: template.audienceTags,
      timestamp: new Date(),
    };
  }

  /**
   * 热度 → 提及量映射（对数关系）
   * heat 0 → ~10, heat 50 → ~10K, heat 100 → ~1M
   */
  private heatToMentions(heat: number, days: number): number {
    const dailyBase = Math.pow(10, 1 + (heat / 100) * 5); // 10^1 到 10^6
    const dailyWithNoise = dailyBase * (0.8 + Math.random() * 0.4);
    return dailyWithNoise * days;
  }

  /**
   * 热度 + 生命周期阶段 → 创作者采用率
   */
  private heatToAdoptionRate(heat: number, stage: TrendLifecycleStage): number {
    const baseRate = heat / 100 * 0.5;
    const stageMultiplier: Record<TrendLifecycleStage, number> = {
      emerging: 0.5,
      rising: 0.8,
      peak: 1.0,
      declining: 0.6,
      dying: 0.2,
    };
    return this.clamp(baseRate * (stageMultiplier[stage] || 1), 0, 1);
  }

  /**
   * 生命周期阶段 → 24h速度乘数
   */
  private stageVelocityMultiplier(stage: TrendLifecycleStage): number {
    const multipliers: Record<TrendLifecycleStage, number> = {
      emerging: 0.3,
      rising: 0.15,
      peak: 0.02,
      declining: -0.1,
      dying: -0.3,
    };
    return multipliers[stage] || 0;
  }

  /**
   * 模拟热度历史轨迹
   *
   * @param stage 生命周期阶段
   * @param currentHeat 当前热度
   * @param t 归一化时间 0最早→1最新
   * @param totalDays 总天数
   */
  private simulateHeatTrajectory(
    stage: TrendLifecycleStage,
    currentHeat: number,
    t: number,
    totalDays: number,
  ): number {
    const noise = (Math.random() - 0.5) * 3; // ±1.5 随机波动

    switch (stage) {
      case 'emerging':
        // 从 5 加速增长到 currentHeat
        return 5 + (currentHeat - 5) * Math.pow(t, 1.5) + noise;

      case 'rising':
        // 从 currentHeat * 0.3 线性增长到 currentHeat
        return currentHeat * 0.3 + currentHeat * 0.7 * t + noise;

      case 'peak':
        // 先增后稳：先涨到 currentHeat * 1.1 再回落到 currentHeat
        if (t < 0.6) {
          return currentHeat * 0.7 + currentHeat * 0.4 * (t / 0.6) + noise;
        }
        return currentHeat * 1.1 - currentHeat * 0.1 * ((t - 0.6) / 0.4) + noise;

      case 'declining':
        // 从 currentHeat * 1.3 下降到 currentHeat
        return currentHeat * 1.3 - currentHeat * 0.3 * t + noise;

      case 'dying':
        // 从 currentHeat * 1.5 快速下降到 currentHeat
        return currentHeat * 1.5 - currentHeat * 0.5 * Math.pow(t, 0.7) + noise;

      default:
        return currentHeat * (0.8 + 0.2 * t) + noise;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
