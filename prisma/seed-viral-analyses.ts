/**
 * TikStream AI — 爆款视频分析 Seed 数据 (大规模真实模拟版)
 *
 * 变更点:
 *  - 每个类目 3 个产品（不同 SKU）
 *  - 每产品 6-10 条分析记录，含真实 shotsDecomposition
 *  - 多种源平台：tiktok_US / tiktok_ID / tiktok_TH / douyin
 *  - 每类目总计 24-30 条记录 → 全量 ~160 条
 *  - shot 级分解 + 数值指标多样化 + 多市场语言
 *
 * 运行: npx tsx prisma/seed-viral-analyses.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ===========================================================================
// 类目定义 — 每类目 3 个不同产品
// ===========================================================================
const CATEGORIES: Record<string, Array<{
  skuCode: string;
  title: string;
  sellingPoints: string[];
  targetAudience: string;
}>> = {
  beauty: [
    {
      skuCode: 'TKS-VIRAL-BEAUTY-001',
      title: '烟酰胺焕颜精华液 - 14天肤色提亮',
      sellingPoints: ['14天可见效果', '5%烟酰胺', '敏感肌适用'],
      targetAudience: '25-40岁注重护肤女性',
    },
    {
      skuCode: 'TKS-VIRAL-BEAUTY-002',
      title: '玻尿酸保湿面膜 5片装',
      sellingPoints: ['三重玻尿酸', '急速补水', '无添加香精'],
      targetAudience: '18-30岁学生/初入职场女性',
    },
    {
      skuCode: 'TKS-VIRAL-BEAUTY-003',
      title: '防晒隔离乳 SPF50+ PA++++',
      sellingPoints: ['清爽不闷痘', '物化结合', '可当妆前乳'],
      targetAudience: '通勤化妆党/敏感肌人群',
    },
  ],
  electronics: [
    {
      skuCode: 'TKS-VIRAL-ELEC-001',
      title: '无线降噪耳机 Pro Max',
      sellingPoints: ['45dB主动降噪', '40小时续航', 'Hi-Res认证'],
      targetAudience: '数码爱好者/通勤族',
    },
    {
      skuCode: 'TKS-VIRAL-ELEC-002',
      title: '便携蓝牙音箱 防水低音炮',
      sellingPoints: ['IPX7防水', '30W大功率', 'TWS串联'],
      targetAudience: '户外派对/露营爱好者',
    },
    {
      skuCode: 'TKS-VIRAL-ELEC-003',
      title: '1080P投影仪 家庭影院',
      sellingPoints: ['自动对焦', '梯形校正', '200寸巨幕'],
      targetAudience: '租房族/电影爱好者',
    },
  ],
  fashion: [
    {
      skuCode: 'TKS-VIRAL-FASHION-001',
      title: '秋冬100%羊毛双面呢大衣',
      sellingPoints: ['100%澳洲羊毛', '显瘦H版型', '6色可选'],
      targetAudience: '25-35岁职场女性',
    },
    {
      skuCode: 'TKS-VIRAL-FASHION-002',
      title: '高腰显瘦垂感西装裤',
      sellingPoints: ['不易皱面料', '遮肉显腿长', '通勤约会皆宜'],
      targetAudience: '通勤/面试/日常穿搭女性',
    },
    {
      skuCode: 'TKS-VIRAL-FASHION-003',
      title: '轻薄羽绒马甲 可收纳',
      sellingPoints: ['90%白鸭绒', '掌心可收纳', '防风防泼水'],
      targetAudience: '户外/通勤/旅行群体',
    },
  ],
  food: [
    {
      skuCode: 'TKS-VIRAL-FOOD-001',
      title: '内蒙古手作牛肉干 麻辣/五香',
      sellingPoints: ['真材实料', '独立真空包装', '2斤鲜肉出1斤肉干'],
      targetAudience: '零食爱好者/上班族/宝妈',
    },
    {
      skuCode: 'TKS-VIRAL-FOOD-002',
      title: '每日坚果混合装 30小包',
      sellingPoints: ['6种坚果+果干', '科学配比', '无添加油盐'],
      targetAudience: '健身/减脂/养生人群',
    },
    {
      skuCode: 'TKS-VIRAL-FOOD-003',
      title: '螺蛳粉 柳州原产地直发',
      sellingPoints: ['酸笋够味', '辣椒油现熬', '12小时熬汤底'],
      targetAudience: '重口味零食/夜宵党',
    },
  ],
  home: [
    {
      skuCode: 'TKS-VIRAL-HOME-001',
      title: '免打孔卫生间置物架 加厚款',
      sellingPoints: ['免打孔安装', '承重20kg', '304不锈钢'],
      targetAudience: '租房族/收纳控',
    },
    {
      skuCode: 'TKS-VIRAL-HOME-002',
      title: '多功能衣架 一挂8件',
      sellingPoints: ['横竖两用', '不鼓包', '省80%空间'],
      targetAudience: '衣柜不够用的居住者',
    },
    {
      skuCode: 'TKS-VIRAL-HOME-003',
      title: '智能感应垃圾桶 12L窄缝款',
      sellingPoints: ['红外感应', '静音缓降', '黑白双色'],
      targetAudience: '注重家居颜值/科技感用户',
    },
  ],
  health: [
    {
      skuCode: 'TKS-VIRAL-HEALTH-001',
      title: '复合益生菌固体饮料 30条装',
      sellingPoints: ['500亿CFU/条', '7种菌株', '0蔗糖'],
      targetAudience: '肠道健康关注者/久坐上班族',
    },
    {
      skuCode: 'TKS-VIRAL-HEALTH-002',
      title: '维生素C泡腾片 香橙味 20粒',
      sellingPoints: ['1000mg维C/粒', '0糖0卡', '独立密封管装'],
      targetAudience: '免疫力提升/不喜吞片剂人群',
    },
    {
      skuCode: 'TKS-VIRAL-HEALTH-003',
      title: '蒸汽热敷眼罩 洋甘菊香 10片',
      sellingPoints: ['40℃恒温25分钟', '洋甘菊精油', '安神助眠'],
      targetAudience: '熬夜党/手机重度用户/失眠人群',
    },
  ],
};

// ===========================================================================
// Hook 模板 — 每类目 9-11 种 hook
// ===========================================================================
const HOOK_TEMPLATES: Record<string, Array<{ hook: string; title: string; summary: string }>> = {
  beauty: [
    { hook: 'visual_contrast', title: 'Day1 vs Day14肤色变化', summary: '肤色对比抓住眼球→展示成分体系→科学解析烟酰胺作用→真人28天追踪' },
    { hook: 'pain_point', title: '脸颊泛红起皮的救星', summary: '放大敏感肌痛点→引出烟酰胺温和配方→展示舒缓实验→对比市面刺激产品' },
    { hook: 'social_proof', title: '同事问我最近用了什么', summary: '第三人称社交验证→展示产品使用感→同事追问环节→公开购物车' },
    { hook: 'tutorial', title: '精华液正确涂抹顺序', summary: 'Step by Step教学→特写涂抹手法→强调"轻轻按压不揉搓"→前后肤质仪数据对比' },
    { hook: 'lifestyle_aspiration', title: '精致女孩睡前护肤Vlog', summary: '营造氛围→融入冥想/香薰/精华→仪式感拉满→观众产生"我也要那样精致"的渴望' },
    { hook: 'emotional_story', title: '长痘三年终于找到对的', summary: '真实自述→展示自卑时期→转折点→现在自信状态→鼓励同样困境的人' },
    { hook: 'feature_highlight', title: '显微镜下看你的精华液', summary: '显微特写→烟酰胺微囊展示→对比普通精华渗透速度→科普透皮吸收技术' },
    { hook: 'unboxing_experience', title: '精华开箱仪式感', summary: '撕开封印→逐层展示→滴管设计→质地流动→首推体验' },
    { hook: 'comparison', title: '3款热门面膜红黑榜', summary: '横向对比→敷面膜前后水分仪→粘腻度测试纸巾→客观结论' },
    { hook: 'price_urgency', title: '买2送3 一年最低价', summary: '倒计时→限时优惠→库存下降→成本拆解→最后机会' },
    { hook: 'live_testing', title: '防水测试：防晒遇水会怎样', summary: '喷水前后防晒膜→纸巾吸油测试→户外紫外线仪→结论：不用频繁补涂' },
  ],
  electronics: [
    { hook: 'unboxing_experience', title: '千元耳机开箱天花板', summary: '高级开箱→逐层展示→配件精致→首戴舒适感→与千元区间对比突出质价比' },
    { hook: 'comparison', title: '4款降噪耳机对决', summary: '分贝仪实测→地铁/咖啡厅/工地→白噪音对比→续航/音质综合打分→唯一推荐' },
    { hook: 'before_after_noise', title: '从80分贝→耳边私语', summary: '真实通勤噪音分贝测量→戴上耳机瞬间静音→夸张反应"世界安静了"→技术原理解释' },
    { hook: 'tech_spec_highlight', title: '45dB降噪深度什么概念', summary: '分贝公式→通俗比喻→对比竞品降噪深度→45dB沉浸式体验→Hi-Res小金标' },
    { hook: 'lifestyle_integration', title: '通勤/学习/健身全靠它', summary: '清晨地铁→午休听白噪音→健身房撸铁→晚上关降噪通透→全天挂耳不夹头' },
    { hook: 'durability_test', title: '扔进水里还能响?', summary: 'IPX7洗耳机→水龙头冲→包裹扔进行李箱→冰水浸泡→吹干继续听→质量疯狂' },
    { hook: 'gift_idea', title: '送礼不出错选择清单', summary: '男生/女生/学生/上班族四种场景→分别推荐→包装开箱→"后悔没早点看到"评论' },
    { hook: 'expert_check', title: '声学工程师盲测', summary: '邀请专业工程师→盲测三款→打分频响/声场→"这个像3000元音质"→揭晓价格' },
    { hook: 'problem_solution', title: '地铁刷视频外放尴尬终结者', summary: '外放社死场景→旁人白眼特写→戴上耳机→私密空间→沉浸式体验→"通勤幸福感暴涨"' },
    { hook: 'user_comment_read', title: '"女朋友以为我送了个2000块的"', summary: '读用户真实评论→展示各种使用场景→评论区狂欢→社交传播→建立信任' },
  ],
  fashion: [
    { hook: 'outfit_styling', title: '一件大衣穿一周新款', summary: '周一通勤→周二约会→周三逛街→周四面试→周五聚会→5种搭配全镜面展示' },
    { hook: 'fabric_quality', title: '火烧/放大镜/摩擦 全纪录', summary: '火烧法测纯毛→放大镜下纤维→大力摩擦不起球→揉搓无褶皱→比商场3000元' },
    { hook: 'transformation', title: '程序员→韩系欧巴 一穿即成', summary: '变装视频→脱宽松卫衣→穿大衣瞬间气质提升→弹幕"这是同一个人??"' },
    { hook: 'runway_inspired', title: '秀场20000元平替 同款面料', summary: '秀场图对比→同款面料溯源→挂拍→上身→商场同款2折→超细节展示扣子/内衬' },
    { hook: 'small_person', title: '155cm小个子别再错过', summary: '各身高实测效果→对比长大衣压个子→专注小个子短款→详细数据→评论区狂@朋友' },
    { hook: 'celebrity_style', title: 'Wendy/Seulgi都穿过这个版型', summary: '明星机场街拍→提取同款版型→对比图→"白菜价买明星同款面料"→吸引粉丝' },
    { hook: 'sustainable_fashion', title: '一件穿10年不坏的大衣', summary: '消费反思→展示磨损测试→缝线→里布抗静电→买少买精→每年穿3个月→算算单次成本' },
    { hook: 'temperature_test', title: '-20℃户外实测保温效果', summary: '冰天雪地穿着实测→热成像仪对比→"外面零下里面春天"→对比羽绒服厚重→轻便保暖' },
    { hook: 'before_after_color', title: '你总觉得黑白灰显瘦?大错特错!', summary: '同一人穿黑白灰 vs 驼色/焦糖色→颠覆认知→颜色显白测试→"衣柜必须有件彩色的"' },
  ],
  food: [
    { hook: 'taste_test', title: '切开能看见牛肉丝纹', summary: '撕开袋→特写纹理→夸张好吃→汁水展示→"越嚼越香根本停不下来"' },
    { hook: 'behind_the_scenes', title: '走进牛肉干加工车间', summary: '全透明参观→挑肉→腌制→风干→真空→卫生口罩→黄马甲质检→安心' },
    { hook: 'ingredient_focus', title: '翻遍配料表只有这些', summary: '放大镜看配料→对比超市牛肉干配料→各种添加剂列表→"这款只有牛肉+盐+香辛料"' },
    { hook: 'price_value', title: '我算了一下 一斤肉干=2斤鲜肉', summary: 'Cost Breakdown→鲜牛肉价格→人工→风干失重→包装→物流→"每克成本透明 不坑你"' },
    { hook: 'portion_perfect', title: '我的工位抽屉有20包', summary: '独立包装便利→不同场景开袋→办公室→地铁→看电影→追剧→不脏手→社交分享' },
    { hook: 'flavor_showdown', title: '整个编辑部PK辣度', summary: '多人盲测→辣度计→中辣vs特辣vs变态辣→真实反应→吃哭了的同事→"普通人都能吃"' },
    { hook: 'user_control', title: '"已经复购8次了"', summary: '老用户截图展示→各种自定义吃法→泡面搭档→配啤酒→沙拉加肉→"无限回购"' },
    { hook: 'limited_batch', title: '本批次只有800袋', summary: '限量→手作→这是最后一批→展示全部800袋→即将售罄→FOMO→按钮闪烁' },
    { hook: 'asmr_food', title: '听这个撕开的声音|ASMR', summary: '沉浸式→撕包装→肉干碰撞→咀嚼脆→全是原声→无旁白→极度舒适→加购' },
    { hook: 'size_comparison', title: '跟扑克牌一样大', summary: '用扑克牌/手机/手掌对比肉干大小→多次对比→视觉冲击→"这么大一块才9.9?"→性价比感' },
  ],
  home: [
    { hook: 'before_after_room', title: '杂乱→极简 3分钟魔法', summary: '脏乱洗手台→安装收纳架→所有物品归位→干净整洁→时间压缩→强烈视觉对比' },
    { hook: 'organization_hack', title: '房东都说看不出是出租屋', summary: '收纳前后对比→物品多但整洁→轻松取用→不破坏墙面→搬家可以带走' },
    { hook: 'durability_demo', title: '挂满12瓶水 稳如泰山', summary: '空瓶→加一瓶→一直加→吸水纸测试晃不晃→"都不敢相信这东西不用打孔"' },
    { hook: 'small_space_living', title: '3㎡卫生间创下奇迹', summary: '狭小洗手台→测量→选架子→安装→镜柜旁→门后→墙上都利用→"像换了个卫生间"' },
    { hook: 'asmr_setup', title: '安装全过程|ASMR', summary: '撕背胶→贴上墙→拧螺丝→扣上→放进瓶罐→全原声→无旁白→极度愉悦' },
    { hook: 'product_design', title: '为什么是三角形不是方形', summary: '设计师访谈→角落利用→三角形比方形增加30%空间→排水不积水→防发霉→"设计师是处女座?"' },
    { hook: 'install_easy', title: '一个女生5分钟安装2个', summary: '全程安装→量尺寸→撕背胶→粘上→手拧→完成→"力气小的女生也可以单独完成"' },
    { hook: 'use_cases', title: '一个架子解决6个场景', summary: '卫生间→厨房调料→梳妆台化妆品→书桌→阳台花盆→门上钥匙→极致多功能→高价值感' },
    { hook: 'spring_cleaning', title: '春季大扫除必备清单TOP1', summary: '换季清洁→翻出杂物→需要收纳→这个架子反复利用→重新规划家→"像把家重新装修一遍"' },
  ],
  health: [
    { hook: 'health_anxiety', title: '你的肠道可能比实际年龄老10岁', summary: '肠道老化信号→便秘/口臭/长痘→自测问卷→结果焦虑→引出益生菌→肠龄逆转' },
    { hook: 'before_after_health', title: '记录60天：从便秘7天→每日通畅', summary: 'D0自拍→D30肠道菌群检测→D60身体变化→排便日记→皮肤→精力→体重→"像换了个人"' },
    { hook: 'doctor_recommendation', title: '肛肠科医生会自己吃哪种', summary: '医生采访→白大褂→"市面上益生菌差别很大"→指出5点判断标准→推荐→公信力拉满' },
    { hook: 'comparison_chart', title: 'TOP10益生菌体检报告', summary: '10款大牌列队→CFU检测→冲饮测试→耐酸测试→留到最后的→"这个才是真的有效"' },
    { hook: 'science_explain', title: '500亿活菌不是越多越好 要看定植率', summary: '3D动画→胃酸→小肠→定植→"很多菌会在胃酸中死亡"→专利包埋技术→"活着到达肠道"' },
    { hook: 'easy_routine', title: '早晨刷牙+1条 30秒搞定', summary: '生活化融入→刷牙时拿一条→温水冲→喝下→无感→"坚持靠的不是意志力 是简单"' },
    { hook: 'lifestyle_change', title: '戒掉奶茶30天后发生了什么', summary: '戒奶茶动机→前7天→15天→30天→对比皮肤/体重/精力→搭配益生菌→开启健康生活' },
    { hook: 'testimonial_wall', title: '"吃了两周现在一天两次🚽"', summary: '读100条用户评价→筛选最有代表性的→展示前后对比→"用户不会撒谎"' },
    { hook: 'holiday_save', title: '国庆胡吃海喝后来一包', summary: '假期暴饮暴食→月饼/粽子/烧烤→肠道不堪重负→益生菌急救→"第二天不腹胀"' },
    { hook: 'family_health', title: '一家三口的调理方案', summary: '小孩便秘→成人腹胀→老人消化不良→一人买全家吃→性价比→家庭习惯养成' },
  ],
};

// ===========================================================================
// 市场 → 平台 + 语言 映射
// ===========================================================================
const MARKET_CONFIGS = [
  { market: 'US', platform: 'tiktok', lang: 'en-US' },
  { market: 'ID', platform: 'tiktok', lang: 'id-ID' },
  { market: 'TH', platform: 'tiktok', lang: 'th-TH' },
  { market: 'VN', platform: 'tiktok', lang: 'vi-VN' },
  { market: 'JP', platform: 'tiktok', lang: 'ja-JP' },
  { market: 'CN', platform: 'douyin', lang: 'zh-CN' },
];

// ===========================================================================
// 策略 JSON 生成 — 不同类型 hook 的叙事策略
// ===========================================================================
function buildStrategyJson(hookType: string): Record<string, unknown> {
  const base: Record<string, { opening: string; narrative: string[]; pacing: string; trigger: string; cta: string }> = {
    visual_contrast: { opening: '强烈视觉对比，制造"想变这样"的渴望', narrative: ['BEFORE_REVEAL', 'PROBLEM', 'SOLUTION', 'AFTER', 'CTA'], pacing: 'medium_fast', trigger: 'transformation_desire', cta: 'final_2s_link' },
    pain_point: { opening: '放大痛点，制造焦虑后给方案', narrative: ['PAIN_HOOK', 'RESONANCE', 'SAVIOR', 'PROOF', 'CTA'], pacing: 'steady_build', trigger: 'relief_anticipation', cta: 'final_2s_buy' },
    social_proof: { opening: '三人成虎，社交认同驱动', narrative: ['TRUST_OPEN', 'STORY', 'USAGE', 'CONFIRM', 'CTA_SHARE'], pacing: 'natural_flow', trigger: 'trust', cta: 'final_2s_link' },
    tutorial: { opening: '知识型价值吸引精准人群', narrative: ['TUTORIAL_HOOK', 'STEP_1', 'STEP_2', 'PRODUCT_FIT', 'CTA_SAVE'], pacing: 'clear_step', trigger: 'learning_value', cta: 'final_3s_save' },
    lifestyle_aspiration: { opening: '营造向往的生活方式', narrative: ['LIFESTYLE_OPEN', 'MOOD', 'PRODUCT', 'DREAM', 'INSPIRE_CTA'], pacing: 'slow_aesthetic', trigger: 'aspiration', cta: 'final_3s_soft' },
    emotional_story: { opening: '共情带入，建立深度连接', narrative: ['STORY_OPEN', 'STRUGGLE', 'TURN', 'NEW_LIFE', 'ENCOURAGE_CTA'], pacing: 'emotional_build', trigger: 'empathy', cta: 'final_3s_encourage' },
    feature_highlight: { opening: '硬核科技展示', narrative: ['FEATURE_OPEN', 'TECH_DETAIL', 'VISUAL_PROOF', 'VS_OTHERS', 'CTA_LEARN'], pacing: 'tech_paced', trigger: 'innovation_interest', cta: 'final_3s_detail' },
    unboxing_experience: { opening: '拆箱满足好奇心', narrative: ['PACKAGE_HOOK', 'LAYER_1', 'LAYER_2', 'FIRST_TOUCH', 'CTA_WANT'], pacing: 'unboxing_rhythm', trigger: 'unbox_satisfaction', cta: 'final_2s_buy' },
    comparison: { opening: '帮用户做出选择', narrative: ['CHOICE_HOOK', 'OPTION_A', 'OPTION_B', 'VERDICT', 'CTA_CHOOSE'], pacing: 'comparison_flow', trigger: 'decision_ease', cta: 'final_2s_link' },
    before_after_noise: { opening: '噪音→寂静 直接冲击', narrative: ['NOISE_HOOK', 'PAIN', 'SOLUTION', 'SILENCE', 'CTA'], pacing: 'contrast_punch', trigger: 'peace_desire', cta: 'final_2s_buy' },
    tech_spec_highlight: { opening: '把专业参数翻译成人话', narrative: ['SPEC_HOOK', 'EXPLAIN_SIMPLE', 'TEST', 'COMPARE', 'CTA'], pacing: 'edu_rhythm', trigger: 'tech_confidence', cta: 'final_3s_save' },
    lifestyle_integration: { opening: '产品=我生活中的一部分', narrative: ['SCENE_1', 'SCENE_2', 'SCENE_3', 'CANT_LIVE_WITHOUT', 'CTA'], pacing: 'day_flow', trigger: 'want_same_life', cta: 'final_2s_buy' },
    durability_test: { opening: '暴力测试建立绝对信任', narrative: ['CHALLENGE_HOOK', 'TEST_1', 'TEST_2', 'TEST_3', 'CTA_TRUST'], pacing: 'test_beats', trigger: 'durability_confidence', cta: 'final_2s_buy' },
    gift_idea: { opening: '解决送礼选礼焦虑', narrative: ['GIFT_HOOK', 'WHY_PERFECT', 'UNBOX', 'HAPPY_FACE', 'CTA_GIFT'], pacing: 'gift_journey', trigger: 'gift_solution', cta: 'final_2s_buy' },
    outfit_styling: { opening: '1件单品解决一周穿搭', narrative: ['STYLE_HOOK', 'MONDAY', 'WEDNESDAY', 'FRIDAY', 'CTA_SHOP'], pacing: 'fashion_flow', trigger: 'style_inspiration', cta: 'final_2s_buy' },
    transformation: { opening: '快速变装冲击力', narrative: ['BEFORE', '321', 'AFTER_BOOM', 'DETAILS', 'CTA'], pacing: 'fast_transform', trigger: 'wow_effect', cta: 'final_2s_buy' },
    problem_solution: { opening: '问题开场→快速解决', narrative: ['PROBLEM', 'FEELING', 'SOLUTION', 'SATISFIED', 'CTA_GET'], pacing: 'problem_solve', trigger: 'relief', cta: 'final_2s_buy' },
    taste_test: { opening: '入口即化 一口上瘾', narrative: ['TASTE_OPEN', 'TEXTURE_CLOSEUP', 'CHEW_REACT', 'FLAVOR_DESC', 'CTA_TRY'], pacing: 'mouth_watering', trigger: 'hunger', cta: 'final_2s_buy' },
    ingredient_focus: { opening: '配料透明就是最好的营销', narrative: ['LABEL_HOOK', 'ZOOM_IN', 'VS_COMPETITOR', 'RESULT', 'CTA_TRUST'], pacing: 'transparent_beats', trigger: 'trust_material', cta: 'final_3s_buy' },
  };

  const s = base[hookType] ?? {
    opening: '开场即种草',
    narrative: ['HOOK', 'BUILD', 'HIGHLIGHT', 'PROOF', 'CTA'],
    pacing: 'medium_fast',
    trigger: 'curiosity',
    cta: 'final_2s_link',
  };

  return {
    opening_hook: s.opening,
    narrative_arc: s.narrative,
    pacing: s.pacing,
    emotional_trigger: s.trigger,
    key_moments: [
      { timestamp: 0, action: s.narrative[0], importance: 'HIGH' },
      { timestamp: 3, action: s.narrative[1], importance: 'MEDIUM' },
      { timestamp: 6, action: s.narrative[2], importance: 'HIGH' },
      { timestamp: 8, action: 'SECOND_CLIMAX', importance: 'HIGH' },
      { timestamp: 10, action: s.narrative[3], importance: 'HIGH' },
      { timestamp: 13, action: 'CTA', importance: fromCTALevel(s.cta) },
    ],
    text_overlay_strategy: ['key_words', 'full_captions', 'periodic_labels'][Math.floor(Math.random() * 3)],
    cta_placement: s.cta,
  };
}

function fromCTALevel(cta: string): string {
  if (cta.includes('buy') || cta.includes('TRY')) return 'HIGH';
  if (cta.includes('link') || cta.includes('SHOP')) return 'MEDIUM';
  return 'LOW';
}

// ===========================================================================
// 因子 JSON 生成 — 增强版，填充 BPM / 镜头停留 / 话密度
// ===========================================================================
function buildFactorJson(hookType: string): Record<string, unknown> {
  const cameraSets: Record<string, string[]> = {
    visual_contrast: ['Dolly_In_Fast', 'Static', 'Tilt_Up', 'Pan_Left'],
    pain_point: ['Static', 'Pan_Left', 'Dolly_In_Fast'],
    social_proof: ['Static', 'Pan_Left', 'Tilt_Up'],
    tutorial: ['Static', 'Tilt_Up', 'Dolly_In_Fast'],
    lifestyle_aspiration: ['Static', 'Pan_Left', 'Dolly_Out'],
    emotional_story: ['Static', 'Pan_Left', 'Tilt_Up'],
    feature_highlight: ['Dolly_In_Fast', 'Static', 'Tilt_Up', 'Pan_Left'],
    unboxing_experience: ['Dolly_In_Fast', 'Dolly_Out', 'Static', 'Tilt_Up'],
    comparison: ['Static', 'Dolly_In_Fast', 'Pan_Left', 'Tilt_Up'],
    before_after_noise: ['Dolly_In_Fast', 'Static', 'Tilt_Up'],
    tech_spec_highlight: ['Static', 'Dolly_In_Fast', 'Pan_Left'],
    transformation: ['Dolly_In_Fast', 'Static', 'Pan_Left'],
    taste_test: ['Dolly_In_Fast', 'Static', 'Pan_Left'],
    default: ['Static', 'Dolly_In_Fast', 'Pan_Left', 'Tilt_Up'],
  };

  const cameras = cameraSets[hookType as keyof typeof cameraSets] ?? cameraSets.default;
  const bgmStyles = ['upbeat_trendy', 'chill_aesthetic', 'high_energy', 'warm_vlog', 'cinematic_ambient', 'soft_piano'];
  const bpmMap: Record<string, number> = { upbeat_trendy: 128, chill_aesthetic: 92, high_energy: 145, warm_vlog: 84, cinematic_ambient: 72, soft_piano: 65 };
  const bgmStyle = bgmStyles[Math.floor(Math.random() * bgmStyles.length)];
  const bpm = bpmMap[bgmStyle] ?? 110;

  const cameraWeights: Record<string, number> = {};
  cameras.forEach((c, i) => { cameraWeights[c] = 1.0 - i * 0.12; });

  return {
    optimalShotCount: 5 + Math.floor(Math.random() * 6),
    optimalTotalDuration: 12 + Math.random() * 6,
    cameraPatterns: cameras,
    cameraPreferencesWeight: cameraWeights,
    transitionPreferences: { 'Cut': 0.4, 'Dissolve': 0.35, 'Fade_In': 0.15, 'Wipe': 0.1 },
    bgmStyle,
    bgmBpm: bpm + Math.floor((Math.random() - 0.5) * 10),
    captionDensity: 0.35 + Math.random() * 0.55,
    captionStyle: ['dynamic_highlight', 'minimal_mood', 'feature_labels', 'conversational'][Math.floor(Math.random() * 4)],
    ctaTiming: 'final_two_seconds',
    hookRetentionBoost: 0.65 + Math.random() * 0.25,
    avgShotDuration: 1.8 + Math.random() * 3.2,
    textOverlayRatio: 0.25 + Math.random() * 0.55,
    transitionsCount: 2 + Math.floor(Math.random() * 5),
    productFocusMode: ['demo_centric', 'lifestyle_integration', 'feature_highlight'][Math.floor(Math.random() * 3)],
  };
}

// ===========================================================================
// 报告 JSON 生成 — 更真实的指标分布
// ===========================================================================
function buildReportJson(hookType: string): Record<string, unknown> {
  // 不同类型 hook 有不同的指标特征
  const hookStats: Record<string, { engRange: [number, number]; ctrRange: [number, number]; watchRange: [number, number] }> = {
    visual_contrast: { engRange: [0.045, 0.09], ctrRange: [0.025, 0.05], watchRange: [10, 14] },
    pain_point: { engRange: [0.04, 0.08], ctrRange: [0.02, 0.04], watchRange: [9, 13] },
    social_proof: { engRange: [0.05, 0.095], ctrRange: [0.03, 0.055], watchRange: [11, 14] },
    tutorial: { engRange: [0.035, 0.07], ctrRange: [0.015, 0.035], watchRange: [8, 12] },
    emotional_story: { engRange: [0.055, 0.1], ctrRange: [0.02, 0.04], watchRange: [10, 14] },
    comparison: { engRange: [0.04, 0.08], ctrRange: [0.025, 0.05], watchRange: [9, 13] },
    before_after_noise: { engRange: [0.05, 0.09], ctrRange: [0.03, 0.055], watchRange: [11, 14] },
    taste_test: { engRange: [0.05, 0.1], ctrRange: [0.03, 0.06], watchRange: [11, 14] },
    transformation: { engRange: [0.06, 0.12], ctrRange: [0.035, 0.07], watchRange: [12, 14] },
    durability_test: { engRange: [0.055, 0.1], ctrRange: [0.03, 0.055], watchRange: [10, 14] },
    health_anxiety: { engRange: [0.045, 0.08], ctrRange: [0.025, 0.045], watchRange: [10, 13] },
  };

  const stats = hookStats[hookType] ?? { engRange: [0.03, 0.07], ctrRange: [0.015, 0.04], watchRange: [8, 12] };
  const engagement = Math.round((stats.engRange[0] + Math.random() * (stats.engRange[1] - stats.engRange[0])) * 1000) / 1000;
  const conversion = Math.round((stats.ctrRange[0] + Math.random() * (stats.ctrRange[1] - stats.ctrRange[0])) * 1000) / 1000;
  const watchTime = Math.round(stats.watchRange[0] + Math.random() * (stats.watchRange[1] - stats.watchRange[0]));

  const retention = 0.55 + Math.random() * 0.35;
  return {
    retentionPeakSecond: Math.floor(Math.random() * 3) + 1,
    dropRiskSecond: Math.floor(Math.random() * 5) + 7,
    avgWatchTime: watchTime,
    engagementRate: engagement,
    estimatedConversion: conversion,
    recommendation: getRecommendation(hookType, retention),
    successFactors: [
      retention > 0.85 ? 'STRONG_HOOK' : 'GOOD_HOOK',
      'CLEAR_VALUE_PROP',
      'FAST_PACED_EDITING',
      'SOCIAL_PROOF',
      'CONCISE_CTA',
    ],
    audienceEngagement: {
      peakRetention: Math.round(retention * 1000) / 1000,
      completionRate: Math.round((watchTime / 15) * 1000) / 1000,
      avgReplayRate: Math.round((0.02 + Math.random() * 0.08) * 1000) / 1000,
    },
  };
}

function getRecommendation(hookType: string, _retention: number): string {
  const recs: Record<string, string> = {
    visual_contrast: '对比冲击力强，建议前2秒展示最极端对比，3-6秒安排产品解析，末2秒露出CTA',
    pain_point: '痛点共情效果显著，前3秒放大痛点，第5-8秒给解决方案，第12秒亮出产品',
    comparison: '横向对比帮助决策，第2秒展示对比图，第6秒各项数据，10秒结论推荐',
    taste_test: '试吃反应是最强转化点，前1秒撕开包装，2-4秒试吃反应，6-10秒讲解口感',
    transformation: '变装冲击力极强，前1秒Before，1.5秒过渡，2秒After，后续看细节',
  };
  return recs[hookType] ?? '保持前三秒强钩子，确保产品核心卖点在6秒内出现，CTA文案简洁有力';
}

// ===========================================================================
// 镜头分解生成 — 真实 shot 级数据
// ===========================================================================
function buildShotsDecomposition(hookType: string, cameras: string[], totalShots: number): Array<Record<string, unknown>> {
  const transitions = ['Cut', 'Dissolve', 'Fade_In', 'Wipe'];
  const result: Array<Record<string, unknown>> = [];

  for (let i = 0; i < totalShots; i++) {
    const cam = cameras[i % cameras.length];
    const transition = i === totalShots - 1 ? null : transitions[i % transitions.length];
    const duration = 1.5 + Math.random() * 2.5;

    result.push({
      shotIndex: i,
      camera: cam,
      transition: transition ?? undefined as unknown as string,
      durationSeconds: Math.round(duration * 10) / 10,
      description: getShotDescription(hookType, i, totalShots),
      textOverlay: i === 0 || i === 2 || i === totalShots - 1
        ? getOverlayText(hookType, i)
        : null,
      effect: i === 0 ? 'zoom_in' : i === totalShots - 2 ? 'slow_motion' : 'none',
    });
  }

  return result;
}

function getShotDescription(hookType: string, idx: number, total: number): string {
  if (idx === 0) return 'HOOK opening shot — grab attention with strong visual';
  if (idx === total - 1) return 'CTA end card with product display';
  if (idx === total - 2) return 'Product detail close-up macro shot';
  if (idx === Math.floor(total / 2)) return 'Mid-video climax / emotional peak';
  return `Transition shot ${idx} — ${hookType} visual narrative`;
}

function getOverlayText(hookType: string, idx: number): string {
  if (idx === 0) {
    const texts: Record<string, string> = {
      visual_contrast: 'BEFORE → AFTER',
      pain_point: '你的皮肤在求救!',
      taste_test: '一口就上瘾!',
      transformation: '从路人 → 女神',
      comparison: '盲测PK!谁赢了?',
    };
    return texts[hookType] ?? '你一定要知道...';
  }
  if (idx === 2) return '看细节 👀';
  return '抓紧购买!';
}

// ===========================================================================
// 主函数
// ===========================================================================
async function main(): Promise<void> {
  console.log('🌱 Seeding Viral Video Analyses (大规模真实模拟版)...\n');

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalShots = 0;

  for (const [category, products] of Object.entries(CATEGORIES)) {
    for (const productDef of products) {
      // 确保产品存在
      const product = await prisma.product.upsert({
        where: { skuCode: productDef.skuCode },
        update: {
          title: productDef.title,
          category,
          sellingPoints: productDef.sellingPoints,
          targetAudience: productDef.targetAudience,
          scenarioTags: [category, 'viral-seed', productDef.targetAudience.slice(0, 10)],
        },
        create: {
          title: productDef.title,
          skuCode: productDef.skuCode,
          category,
          sellingPoints: productDef.sellingPoints,
          targetAudience: productDef.targetAudience,
          scenarioTags: [category, 'viral-seed'],
          textFeatures: { tone: 'energetic', locale: 'zh-CN' },
          coverImageUrl: `https://picsum.photos/seed/${encodeURIComponent(category)}/400/400`,
        },
      });
      console.log(`  📦 [${category}] product: ${productDef.title} (${product.id.slice(0, 8)}...)`);

      const hooks = HOOK_TEMPLATES[category] || [];
      let hookIndex = 0;

      for (const template of hooks) {
        // 为每条记录分配一个市场→平台组合
        const mkt = MARKET_CONFIGS[hookIndex % MARKET_CONFIGS.length];
        const externalId = `viral-${productDef.skuCode}-${template.hook}`;

        const strategyJson = buildStrategyJson(template.hook);
        const factorJson = buildFactorJson(template.hook);
        const reportJson = buildReportJson(template.hook);
        const shotsDecomposition = buildShotsDecomposition(
          template.hook,
          (factorJson.cameraPatterns as string[]) || ['Static', 'Dolly_In_Fast'],
          (factorJson.optimalShotCount as number) || 6,
        );
        totalShots += shotsDecomposition.length;

        const existing = await prisma.viralVideoAnalysis.findFirst({
          where: { externalVideoId: externalId },
        });

        const data = {
          productId: product.id,
          sourcePlatform: mkt.platform,
          sourceUrl: `https://www.${mkt.platform}.com/@${category}_viral/video/${Math.random().toString(36).slice(2, 15)}`,
          externalVideoId: externalId,
          title: template.title,
          hookType: template.hook,
          strategyJson,
          factorJson,
          reportJson,
          sellingPoints: productDef.sellingPoints,
          shotsDecomposition,
          declaredPublicSource: true,
        };

        if (existing) {
          await prisma.viralVideoAnalysis.update({ where: { id: existing.id }, data });
          totalUpdated++;
        } else {
          await prisma.viralVideoAnalysis.create({ data });
          totalCreated++;
          console.log(`    ✅ [${mkt.market}] ${template.hook}: ${template.title} (${shotsDecomposition.length} shots)`);
        }

        hookIndex++;
      }
    }
  }

  const totalProducts = Object.values(CATEGORIES).reduce((s, p) => s + p.length, 0);
  const totalRecords = totalCreated + totalUpdated;

  console.log(`\n🎉 Done!`);
  console.log(`   Products: ${totalProducts} (${Object.keys(CATEGORIES).length} categories)`);
  console.log(`   Viral Analyses: ${totalRecords} (${totalCreated} new, ${totalUpdated} updated)`);
  console.log(`   Avg shots per analysis: ${totalRecords > 0 ? Math.round(totalShots / totalRecords) : 0}`);
  console.log('   Run: npx tsx prisma/seed-viral-analyses.ts');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
