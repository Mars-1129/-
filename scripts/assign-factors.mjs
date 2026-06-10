const BASE = 'http://localhost:3000/api/v1';

async function api(url, opts = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

/** Wrap non-object values into an object to satisfy @IsObject() validation */
function wrap(value) {
  if (value === null || value === undefined) return { value };
  if (Array.isArray(value)) return { items: value };
  if (typeof value === 'object') return value;
  return { value };
}

// Fetch all factors
const { data: factors } = await api('/factors');
const byKey = {};
factors.forEach(f => byKey[f.key] = f.factor_id);
console.log(`Loaded ${factors.length} factors`);

// Fetch all active templates
const { data: tplResp } = await api('/templates?page=1&page_size=100&status=ACTIVE');
const templates = tplResp.items;
console.log(`Loaded ${templates.length} templates`);

// Factor assignments per template category/strategy
const categoryAssignments = {
  // 宠物类：萌宠治愈向，柔和节奏，温馨BGM
  pet: {
    narrative_arc: { arc: ["HOOK", "PET_INTRO", "INTERACTION", "PRODUCT_FEATURE", "TRANSFORMATION", "CTA"] },
    opening: { type: "emotional", strategy: "close_up_pet_face", hook: "萌宠第一视角吸引" },
    hook_body: { style: "cute_asmr", focus: "pet_texture", pace: "slow_relaxing" },
    product_showcase: { angle: "pet_uses_product", emphasis: "natural_integration", demo: "before_after" },
    social_proof: { type: "pet_reaction", evidence: "visible_results", testimony: "pet_happiness" },
    cta_closing: { style: "warm", call_to_action: "give_your_pet_the_best", urgency: "low" },
    optimal_shot_count: { value: 8, range: [6, 10] },
    optimal_total_duration: { value: 15, unit: "seconds", range: [12, 20] },
    camera_patterns: { patterns: ["close_up", "tracking", "overhead", "macro"] },
    transition_preference: { styles: ["soft_fade", "dissolve", "match_cut"] },
    bgm_style: { genre: "lofi_calming", tempo: "slow", mood: "warm_cozy" },
    hook_style: { type: "curiosity", element: "cute_pet_moment", duration_secs: 3 },
    narrative_tone: { tone: "gentle_heartwarming", language: "conversational", pace: "relaxed" },
    caption_density: { level: "medium", style: "rounded_soft", color: "warm_white" },
    cta_placement: { position: "last_3_seconds", style: "text_overlay_with_pet" },
    pacing_score: { value: 3, scale: [1, 5], description: "slow_relaxing" },
    emotional_curve: { peaks: ["opening_cute", "product_moment", "happy_pet"], overall: "warm_uplifting" },
    hook_duration: { value: 3, unit: "seconds" },
    hook_type: { primary: "emotional", secondary: "curiosity" },
    opening_instruction: { text: "以宠物近距离大特写开场，柔焦+慢动作，展示萌宠表情或毛发光泽，叠温暖色调，辅以轻柔哼鸣或心跳音效" },
    closing_instruction: { text: "以宠物幸福笑脸或熟睡画面收尾，轻柔字幕'给毛孩子最好的'，品牌logo淡入" },
    visual_focus_instruction: { text: "70%画面聚焦宠物，30%展示产品，多用浅景深虚化背景，色调温暖偏黄" },
    voiceover_tone_instruction: { text: "温柔女声，语速偏慢，像在和朋友聊天，多用'宝贝''小心肝'等亲昵称呼" },
    bgm_atmosphere_instruction: { text: "轻快治愈系纯音乐，钢琴+吉他为主，音量40%，高潮处在产品展示段稍增强" },
    product_display_instruction: { text: "产品自然融入宠物互动场景，不做硬广，展示使用过程和效果对比" },
    pacing_rhythm_instruction: { text: "开场3秒快节奏钩子→中段慢节奏展示→产品段节奏提升→收尾再放缓" },
    subtitle_style_instruction: { text: "圆角气泡字幕，暖白色，宠物台词用萌系字体，产品信息用清晰无衬线体" },
    transition_style_instruction: { text: "多用柔光转场，宠物画面间用交叉溶解，产品段切换到清晰硬切" },
  },

  // 生活场景类
  lifestyle: {
    narrative_arc: { arc: ["HOOK", "DAILY_STRUGGLE", "PRODUCT_INTO", "BETTER_LIFE", "SOCIAL_PROOF", "CTA"] },
    opening: { type: "relatable", strategy: "daily_scene_establishing", hook: "生活痛点或美好向往" },
    hook_body: { style: "slice_of_life", focus: "real_person", pace: "natural" },
    product_showcase: { angle: "lifestyle_integration", emphasis: "effortless_upgrade", demo: "in_use" },
    social_proof: { type: "lifestyle_upgrade", evidence: "visual_comparison", testimony: "user_review" },
    cta_closing: { style: "aspirational", call_to_action: "upgrade_your_life", urgency: "medium" },
    optimal_shot_count: { value: 10, range: [8, 14] },
    optimal_total_duration: { value: 20, unit: "seconds", range: [15, 30] },
    camera_patterns: { patterns: ["medium_shot", "tracking", "over_shoulder", "wide"] },
    transition_preference: { styles: ["cross_dissolve", "match_cut", "whip_pan"] },
    bgm_style: { genre: "acoustic_pop", tempo: "medium", mood: "bright_warm" },
    hook_style: { type: "relatable", element: "everyday_moment", duration_secs: 3 },
    narrative_tone: { tone: "friendly_authentic", language: "conversational", pace: "moderate" },
    caption_density: { level: "medium_low", style: "clean_minimal", color: "white" },
    cta_placement: { position: "last_4_seconds", style: "overlay_on_lifestyle_shot" },
    pacing_score: { value: 3, scale: [1, 5], description: "moderate_natural" },
    emotional_curve: { peaks: ["transformation_moment", "happy_ending"], overall: "aspirational" },
    hook_duration: { value: 3, unit: "seconds" },
    hook_type: { primary: "relatable", secondary: "aspirational" },
    opening_instruction: { text: "以日常生活场景开场（厨房/客厅/办公室），展示一个常见的小困扰或美好时刻，色调自然明亮" },
    closing_instruction: { text: "以主角享受产品场景收尾，微笑自然，字幕'让生活更美好'类积极话语" },
    visual_focus_instruction: { text: "60%人+场景，40%产品特写，保持自然光线，多用中景和过肩镜头" },
    voiceover_tone_instruction: { text: "亲切自然的男女声均可，语速适中，像朋友推荐好物，避免播音腔" },
    bgm_atmosphere_instruction: { text: "轻快流行/民谣纯音乐，音量35%，节奏与剪辑点对齐" },
    product_display_instruction: { text: "产品作为生活场景的一部分自然出现，强调使用前后的体验差异" },
    pacing_rhythm_instruction: { text: "困摄→发现→使用→改变，节奏从缓到快再到缓，情绪递进" },
    subtitle_style_instruction: { text: "简洁白色字幕，关键卖点用放大+加粗，产品名用品牌色" },
    transition_style_instruction: { text: "生活片段间用交叉溶解或匹配剪辑，产品切换用清晰硬切" },
  },

  // 开箱类
  unboxing: {
    narrative_arc: { arc: ["PACKAGE_TEASE", "UNBOXING_RITUAL", "PRODUCT_REVEAL", "FEATURES_DEMO", "FIRST_IMPRESSION", "CTA"] },
    opening: { type: "curiosity", strategy: "package_closeup", hook: "神秘包裹悬念" },
    hook_body: { style: "unboxing_asmr", focus: "packaging_texture", pace: "building_suspense" },
    product_showcase: { angle: "360_reveal", emphasis: "premium_quality", demo: "all_angles" },
    social_proof: { type: "real_reaction", evidence: "first_impression", testimony: "worth_it" },
    cta_closing: { style: "excited", call_to_action: "get_yours_now", urgency: "medium" },
    optimal_shot_count: { value: 12, range: [8, 16] },
    optimal_total_duration: { value: 25, unit: "seconds", range: [15, 45] },
    camera_patterns: { patterns: ["macro", "top_down", "tracking", "handheld"] },
    transition_preference: { styles: ["hard_cut", "speed_ramp", "whip_pan"] },
    bgm_style: { genre: "upbeat_electronic", tempo: "fast", mood: "exciting" },
    hook_style: { type: "curiosity_gap", element: "mystery_package", duration_secs: 2 },
    narrative_tone: { tone: "excited_authentic", language: "enthusiastic", pace: "fast" },
    caption_density: { level: "high", style: "bold_dynamic", color: "vibrant_white" },
    cta_placement: { position: "last_3_seconds", style: "bold_overlay" },
    pacing_score: { value: 4, scale: [1, 5], description: "fast_exciting" },
    emotional_curve: { peaks: ["package_tease", "reveal_moment", "feature_wow"], overall: "exciting" },
    hook_duration: { value: 2, unit: "seconds" },
    hook_type: { primary: "curiosity", secondary: "anticipation" },
    opening_instruction: { text: "以包裹/包装盒大特写开场，手指入画撕开封条或打开盒盖，慢动作+ASMR音效，制造悬念" },
    closing_instruction: { text: "以产品+包装+惊喜表情三格分屏收尾，字幕'在链接里'或'Swipe up to get yours'，品牌logo弹出" },
    visual_focus_instruction: { text: "50%产品特写+30%开箱过程+20%人物反应，多用微距和俯拍镜头" },
    voiceover_tone_instruction: { text: "兴奋真实的人声，像朋友分享新入手好物，可以即兴发挥，配合惊叹和笑声" },
    bgm_atmosphere_instruction: { text: "节奏明快的电子/嘻哈纯音乐，音量45%，高潮处配合产品亮相增强" },
    product_display_instruction: { text: "360度旋转展示产品，微距拍摄材质细节，配件逐一展示，配合字幕标注亮点" },
    pacing_rhythm_instruction: { text: "悬念积累(5s)→开箱过程(8s)→产品亮相(快速剪辑)→功能展示(中速)→收尾催促(快)" },
    subtitle_style_instruction: { text: "动感粗体字幕，产品名用醒目标签样式，价格/优惠用闪烁动画强调" },
    transition_style_instruction: { text: "多用硬切+变速，关键亮相时刻用慢动作，产品细节快速切换" },
  },

  // 种草/口碑类
  testimonial: {
    narrative_arc: { arc: ["PROBLEM_STATEMENT", "PRODUCT_DISCOVERY", "REAL_USE", "RESULTS", "RECOMMENDATION", "CTA"] },
    opening: { type: "honest", strategy: "real_person_intro", hook: "真实用户亲测" },
    hook_body: { style: "testimonial", focus: "real_experience", pace: "natural_conversational" },
    product_showcase: { angle: "real_usage", emphasis: "visible_results", demo: "before_after" },
    social_proof: { type: "before_after", evidence: "visual_proof", testimony: "personal_story" },
    cta_closing: { style: "trustworthy", call_to_action: "try_it_yourself", urgency: "low" },
    optimal_shot_count: { value: 9, range: [6, 12] },
    optimal_total_duration: { value: 25, unit: "seconds", range: [15, 45] },
    camera_patterns: { patterns: ["medium_shot", "close_up", "static", "handheld"] },
    transition_preference: { styles: ["cross_dissolve", "jump_cut", "match_cut"] },
    bgm_style: { genre: "acoustic_folk", tempo: "medium_slow", mood: "sincere_warm" },
    hook_style: { type: "honest", element: "real_person", duration_secs: 4 },
    narrative_tone: { tone: "honest_trustworthy", language: "personal_storytelling", pace: "moderate" },
    caption_density: { level: "medium", style: "clean_handwritten", color: "warm_white" },
    cta_placement: { position: "last_5_seconds", style: "subtle_overlay" },
    pacing_score: { value: 2, scale: [1, 5], description: "calm_trustworthy" },
    emotional_curve: { peaks: ["problem_relate", "aha_moment", "result_wow"], overall: "trust_building" },
    hook_duration: { value: 4, unit: "seconds" },
    hook_type: { primary: "testimonial", secondary: "social_proof" },
    opening_instruction: { text: "以真实人物面对镜头开场，自然光线，素颜或淡妆，语气真诚：'我之前也有这个困扰...'" },
    closing_instruction: { text: "以人物微笑+产品+使用效果三画面收尾，字幕'你也试试看'或'真的有效'，增强信任背书" },
    visual_focus_instruction: { text: "50%人物访谈镜头+30%产品使用镜头+20%效果对比，保持画面真实不刻意" },
    voiceover_tone_instruction: { text: "真实自然的用户声音，可以有口音/停顿，像朋友推荐而非广告推销，语速适中" },
    bgm_atmosphere_instruction: { text: "温馨民谣/轻音乐，音量30%，不抢人声，情绪高潮处微微增强烘托" },
    product_display_instruction: { text: "展示真实使用过程而非广告片质感，强调前后对比，时间标注'使用X天后'" },
    pacing_rhythm_instruction: { text: "问题阐述(缓)→发现有解(中速)→使用过程(自然)→效果展示(慢，给观众消化)→推荐(真诚)" },
    subtitle_style_instruction: { text: "手写风格或圆体字幕，关键数据放大（如'XX天见效'），颜色柔和" },
    transition_style_instruction: { text: "多用跳切(Jump Cut)保持真实感，对比画面用分屏或交叉溶解" },
  },

  // 促销类
  promo: {
    narrative_arc: { arc: ["PRICE_HOOK", "VALUE_SHOW", "LIMITED_OFFER", "SOCIAL_PROOF", "URGENCY", "CTA"] },
    opening: { type: "price_shock", strategy: "discount_reveal", hook: "价格惊喜或限时优惠" },
    hook_body: { style: "promo_energetic", focus: "deal_highlight", pace: "fast_urgent" },
    product_showcase: { angle: "value_proposition", emphasis: "deal_attractiveness", demo: "quick_highlights" },
    social_proof: { type: "selling_fast", evidence: "popularity_metrics", testimony: "customer_rush" },
    cta_closing: { style: "urgent", call_to_action: "buy_now_before_ends", urgency: "high" },
    optimal_shot_count: { value: 14, range: [10, 20] },
    optimal_total_duration: { value: 15, unit: "seconds", range: [10, 25] },
    camera_patterns: { patterns: ["rapid_cuts", "zoom_in", "tracking", "macro"] },
    transition_preference: { styles: ["hard_cut", "flash", "speed_ramp", "glitch"] },
    bgm_style: { genre: "edm_hype", tempo: "fast", mood: "energetic_urgent" },
    hook_style: { type: "number_shock", element: "price_or_discount", duration_secs: 2 },
    narrative_tone: { tone: "urgent_excited", language: "persuasive", pace: "fast" },
    caption_density: { level: "very_high", style: "bold_flash", color: "red_yellow" },
    cta_placement: { position: "throughout", style: "floating_badge" },
    pacing_score: { value: 5, scale: [1, 5], description: "very_fast_urgent" },
    emotional_curve: { peaks: ["price_reveal", "scarcity_alert", "countdown"], overall: "fomo" },
    hook_duration: { value: 2, unit: "seconds" },
    hook_type: { primary: "price", secondary: "scarcity" },
    opening_instruction: { text: "以大字价格/折扣数字冲击开场，配合震撼音效，1秒内抓住注意力，字幕'限时特惠'或'XX%OFF'" },
    closing_instruction: { text: "以倒计时/库存告急视觉+立即下单箭头收尾，字幕'手慢无''错过等明年'等紧迫话语" },
    visual_focus_instruction: { text: "40%产品+30%价格信息+20%使用场景+10%社会证明，画面切换快速，信息密度高" },
    voiceover_tone_instruction: { text: "激昂有力的男声或女声，语速快，重音强调价格和优惠，像电视购物但更现代" },
    bgm_atmosphere_instruction: { text: "高能量EDM/摇滚纯音乐，音量50%，鼓点密集，配合剪辑点制造紧迫节奏" },
    product_display_instruction: { text: "快速展示产品核心亮点，每个卖点不超过2秒，配合价格标签和优惠信息叠加" },
    pacing_rhythm_instruction: { text: "极快节奏贯穿始终，价格/优惠信息每3-5秒重复出现，结尾5秒最强烈的CTA" },
    subtitle_style_instruction: { text: "粗体大字，#FF0000红色价格标签，倒计时动画，库存数字闪烁效果" },
    transition_style_instruction: { text: "快速硬切为主，关键信息用闪白/放缩特效，节奏与BGM鼓点同步" },
  },

  // 对比类
  comparison: {
    narrative_arc: { arc: ["BEFORE_PAIN", "TRANSITION_MOMENT", "AFTER_RESULT", "PRODUCT_MAGIC", "SOCIAL_PROOF", "CTA"] },
    opening: { type: "contrast", strategy: "before_state_establishing", hook: "前后差异悬念" },
    hook_body: { style: "before_after", focus: "transformation", pace: "dramatic_pause" },
    product_showcase: { angle: "transformation_tool", emphasis: "visible_difference", demo: "split_screen" },
    social_proof: { type: "dramatic_result", evidence: "side_by_side", testimony: "can_not_believe" },
    cta_closing: { style: "inspiring", call_to_action: "transform_yourself", urgency: "medium" },
    optimal_shot_count: { value: 8, range: [6, 12] },
    optimal_total_duration: { value: 18, unit: "seconds", range: [12, 30] },
    camera_patterns: { patterns: ["split_screen", "static", "close_up", "dolly_zoom"] },
    transition_preference: { styles: ["split_reveal", "wipe", "match_cut", "cross_dissolve"] },
    bgm_style: { genre: "cinematic_orchestral", tempo: "building", mood: "dramatic_inspiring" },
    hook_style: { type: "shock", element: "before_after_gap", duration_secs: 3 },
    narrative_tone: { tone: "dramatic_inspiring", language: "story_driven", pace: "building" },
    caption_density: { level: "medium", style: "elegant_bold", color: "white_gold" },
    cta_placement: { position: "last_4_seconds", style: "elegant_overlay" },
    pacing_score: { value: 4, scale: [1, 5], description: "dramatic_building" },
    emotional_curve: { peaks: ["pain_realization", "transformation_reveal", "happy_result"], overall: "satisfying" },
    hook_duration: { value: 3, unit: "seconds" },
    hook_type: { primary: "contrast", secondary: "transformation" },
    opening_instruction: { text: "以'之前'状态的大特写开场（暗沉/杂乱/不完美），配合沉重音效或叹息，建立痛点共鸣" },
    closing_instruction: { text: "以左右分屏对比图+产品居中收尾，字幕'你也可以改变'或'你的转变从现在开始'" },
    visual_focus_instruction: { text: "50%分屏对比+30%产品+20%转变过程，灯光从暗到亮渐进，色调从冷到暖过渡" },
    voiceover_tone_instruction: { text: "富有感染力的叙事声音，前半段担忧/困扰语气，后半段惊喜/满足语气，形成戏剧性转变" },
    bgm_atmosphere_instruction: { text: "电影感配乐，前半段低沉紧张，产品引入后逐渐高昂明亮，结尾恢弘" },
    product_display_instruction: { text: "产品作为转变的'魔法棒'出现，强调使用前后的关键差异点，用标注箭头指出改变部位" },
    pacing_rhythm_instruction: { text: "前半段慢（展示问题）→产品引入中速→转变过程加速→结果展示慢（给观众消化）" },
    subtitle_style_instruction: { text: "优雅白色字幕，'之前'标注灰色，'之后'标注金色，关键数据放大" },
    transition_style_instruction: { text: "分屏对比画面用擦除转场，从'之前'擦到'之后'，配合音效增强冲击力" },
  },

  // 产品演示类
  product_demo: {
    narrative_arc: { arc: ["PAIN_AMPLIFY", "PRODUCT_INTRO", "FEATURE_DEMO", "SOLUTION_PROOF", "BENEFITS", "CTA"] },
    opening: { type: "pain_point", strategy: "problem_amplification", hook: "痛点共鸣开场" },
    hook_body: { style: "problem_solution", focus: "pain_to_relief", pace: "building" },
    product_showcase: { angle: "solution_demo", emphasis: "key_features", demo: "step_by_step" },
    social_proof: { type: "problem_solved", evidence: "functional_demo", testimony: "life_changing" },
    cta_closing: { style: "confident", call_to_action: "solve_your_problem", urgency: "medium_high" },
    optimal_shot_count: { value: 10, range: [8, 14] },
    optimal_total_duration: { value: 22, unit: "seconds", range: [15, 35] },
    camera_patterns: { patterns: ["macro", "tracking", "static", "top_down"] },
    transition_preference: { styles: ["hard_cut", "wipe", "zoom_transition", "match_cut"] },
    bgm_style: { genre: "tech_modern", tempo: "medium", mood: "confident_clean" },
    hook_style: { type: "pain_point", element: "common_struggle", duration_secs: 3 },
    narrative_tone: { tone: "educational_confident", language: "clear_direct", pace: "moderate" },
    caption_density: { level: "medium_high", style: "clean_modern", color: "white" },
    cta_placement: { position: "last_5_seconds", style: "clean_overlay" },
    pacing_score: { value: 3, scale: [1, 5], description: "moderate_educational" },
    emotional_curve: { peaks: ["pain_recognition", "solution_aha", "result_satisfaction"], overall: "problem_solved" },
    hook_duration: { value: 3, unit: "seconds" },
    hook_type: { primary: "problem", secondary: "solution" },
    opening_instruction: { text: "以放大版痛点场景开场（灰尘/油腻/混乱特写），配合不满音效或皱眉表情，让观众感同身受" },
    closing_instruction: { text: "以产品使用后完美结果收尾，字幕'告别XXX烦恼'，品牌logo+购买指引清晰" },
    visual_focus_instruction: { text: "40%痛点场景+35%产品解决方案+25%效果对比，画面由脏乱→干净，暗→亮" },
    voiceover_tone_instruction: { text: "专业自信的解说声音，前半段共情语气，后半段笃定解决，逻辑清晰不浮夸" },
    bgm_atmosphere_instruction: { text: "现代科技感纯音乐，音量35%，产品功能段节奏感增强，解决问题段舒缓有力" },
    product_display_instruction: { text: "逐步展示产品功能，配合标注动画（箭头/圈出/放大），每个功能3-4秒，做对比演示" },
    pacing_rhythm_instruction: { text: "痛点放大(快)→解决方案引入(中速)→功能分步展示(慢-清晰)→效果证明(中)→CTA(快)" },
    subtitle_style_instruction: { text: "清晰现代无衬线字体，功能卖点用图标+文字组合，颜色明亮干净" },
    transition_style_instruction: { text: "功能之间用清晰硬切，痛点/解决对比用分屏，关键数据用放大动画" },
  },

  // 教程类
  tutorial: {
    narrative_arc: { arc: ["INTRO", "MATERIALS", "STEP_1", "STEP_2", "STEP_3", "RESULT", "RECAP", "CTA"] },
    opening: { type: "result_tease", strategy: "final_result_preview", hook: "最终效果预告" },
    hook_body: { style: "tutorial", focus: "process_clarity", pace: "steady" },
    product_showcase: { angle: "tool_demo", emphasis: "ease_of_use", demo: "follow_along" },
    social_proof: { type: "result_demo", evidence: "tangible_outcome", testimony: "you_can_do_this" },
    cta_closing: { style: "encouraging", call_to_action: "try_it_yourself", urgency: "low" },
    optimal_shot_count: { value: 10, range: [8, 16] },
    optimal_total_duration: { value: 30, unit: "seconds", range: [20, 60] },
    camera_patterns: { patterns: ["top_down", "close_up", "tracking", "static"] },
    transition_preference: { styles: ["hard_cut", "match_cut", "cross_dissolve"] },
    bgm_style: { genre: "chill_lofi", tempo: "medium_slow", mood: "calm_focused" },
    hook_style: { type: "result_curiosity", element: "finished_look", duration_secs: 3 },
    narrative_tone: { tone: "educational_friendly", language: "instructional", pace: "steady_clear" },
    caption_density: { level: "high", style: "text_overlay_steps", color: "white" },
    cta_placement: { position: "last_5_seconds", style: "clean_overlay" },
    pacing_score: { value: 2, scale: [1, 5], description: "steady_instructional" },
    emotional_curve: { peaks: ["result_tease", "aha_moments", "final_result"], overall: "satisfying_learning" },
    hook_duration: { value: 3, unit: "seconds" },
    hook_type: { primary: "educational", secondary: "result_driven" },
    opening_instruction: { text: "以最终完成效果快速预览开场（2-3秒），然后切入准备工具/材料展示，建立学习期待" },
    closing_instruction: { text: "以成品360度展示收尾，字幕'完整工具在简介'或'Save for later'，加上关键步骤编号回顾" },
    visual_focus_instruction: { text: "70%俯拍/微距操作画面，20%成品展示，10%人物表情，光线均匀明亮" },
    voiceover_tone_instruction: { text: "清晰亲切的教程声音，节奏稳定不赶，每条步骤给观众2-3秒理解时间" },
    bgm_atmosphere_instruction: { text: "舒缓解压纯音乐，音量25%-30%，作为背景不抢听觉，关键步骤处微微增强" },
    product_display_instruction: { text: "以工具角色展示产品，每个步骤标注使用的产品/配件名称，展示操作要点" },
    pacing_rhythm_instruction: { text: "效果预览(快)→工具介绍(中)→分步操作(慢、清晰)→成品展示(中)→回顾CTA(慢)" },
    subtitle_style_instruction: { text: "步骤编号+文字说明组合，位置固定不跳，字体清晰可读，颜色统一" },
    transition_style_instruction: { text: "步骤间用清晰硬切，相似操作用匹配剪辑，保持视觉连贯性" },
  },

  // 故事类
  story: {
    narrative_arc: { arc: ["CHARACTER_INTRO", "MORNING_ROUTINE", "STRUGGLE_OR_CHALLENGE", "BREAKTHROUGH", "TRANSFORMATION", "INSPIRATION", "CTA"] },
    opening: { type: "cinematic", strategy: "atmosphere_establishing", hook: "清晨氛围美感" },
    hook_body: { style: "cinematic_narrative", focus: "character_journey", pace: "slow_cinematic" },
    product_showcase: { angle: "lifestyle_prop", emphasis: "aspirational_quality", demo: "in_context" },
    social_proof: { type: "aspirational_lifestyle", evidence: "visual_storytelling", testimony: "be_the_best" },
    cta_closing: { style: "inspirational", call_to_action: "start_your_journey", urgency: "low" },
    optimal_shot_count: { value: 14, range: [10, 20] },
    optimal_total_duration: { value: 35, unit: "seconds", range: [25, 60] },
    camera_patterns: { patterns: ["wide", "tracking", "slow_motion", "drone", "dolly"] },
    transition_preference: { styles: ["cross_dissolve", "match_cut", "slow_fade", "j_cut"] },
    bgm_style: { genre: "cinematic_epic", tempo: "slow_building", mood: "inspirational" },
    hook_style: { type: "atmospheric", element: "golden_hour_aesthetic", duration_secs: 4 },
    narrative_tone: { tone: "inspirational_poetic", language: "storytelling", pace: "slow_deliberate" },
    caption_density: { level: "low", style: "cinematic_minimal", color: "white_gold" },
    cta_placement: { position: "last_6_seconds", style: "elegant_cinematic" },
    pacing_score: { value: 2, scale: [1, 5], description: "slow_cinematic" },
    emotional_curve: { peaks: ["morning_beauty", "challenge_moment", "breakthrough_victory"], overall: "inspirational_epic" },
    hook_duration: { value: 4, unit: "seconds" },
    hook_type: { primary: "cinematic", secondary: "emotional" },
    opening_instruction: { text: "以清晨金光空镜头开场（晨光/露水/空旷街道），配合深呼吸音效，建立电影感氛围" },
    closing_instruction: { text: "以人物走向远方/阳光中剪影收尾，字幕励志金句'Champions are made in the morning'，品牌logo优雅出现" },
    visual_focus_instruction: { text: "60%氛围+场景镜头，30%人物动作特写，10%产品自然融入，追求电影级画面质感" },
    voiceover_tone_instruction: { text: "深沉有磁性的旁白声音，节奏缓慢有力度，像纪录片或电影预告，每句话有留白" },
    bgm_atmosphere_instruction: { text: "电影史诗级配乐，从轻柔钢琴→弦乐渐强→管弦高潮，情绪与画面叙事同步" },
    product_display_instruction: { text: "产品以道具形式出现在场景中（水壶/装备/服饰），不做刻意图利，追求自然生活感" },
    pacing_rhythm_instruction: { text: "清晨宁静(极慢)→开始行动(缓)→训练过程(节奏递增)→高潮(快)→收尾宁静(极慢)" },
    subtitle_style_instruction: { text: "极少字幕，仅金句用优雅衬线字体，产品名用小字低调呈现" },
    transition_style_instruction: { text: "多用交叉溶解和淡入淡出，匹配剪辑连接不同场景，J-cut先闻声再见画" },
  },
};

// Assign factors to each template
let success = 0;
let failed = 0;

for (const template of templates) {
  const category = template.category?.toLowerCase();
  let assignment = categoryAssignments[category];
  
  // Fallback: try to match by name keywords
  if (!assignment) {
    const name = template.name?.toLowerCase() || '';
    if (name.includes('pet') || name.includes('宠物') || name.includes('dog') || name.includes('cat')) {
      assignment = categoryAssignments.pet;
    } else if (name.includes('unbox') || name.includes('开箱')) {
      assignment = categoryAssignments.unboxing;
    } else if (name.includes('fit') || name.includes('story') || name.includes('morning')) {
      assignment = categoryAssignments.story;
    } else if (name.includes('tutorial') || name.includes('grooming') || name.includes('asmr')) {
      assignment = categoryAssignments.tutorial;
    } else if (name.includes('对比') || name.includes('compar')) {
      assignment = categoryAssignments.comparison;
    } else if (name.includes('痛点') || name.includes('解决方案') || name.includes('demo')) {
      assignment = categoryAssignments.product_demo;
    } else if (name.includes('生活') || name.includes('场景') || name.includes('life')) {
      assignment = categoryAssignments.lifestyle;
    } else if (name.includes('促销') || name.includes('紧迫') || name.includes('promo')) {
      assignment = categoryAssignments.promo;
    } else if (name.includes('种草') || name.includes('口碑') || name.includes('体验')) {
      assignment = categoryAssignments.testimonial;
    } else {
      assignment = categoryAssignments.lifestyle;
    }
  }

  const factorList = Object.entries(assignment).map(([key, value]) => {
    const factorId = byKey[key];
    if (!factorId) return null;
    return { factor_id: factorId, value };
  }).filter(Boolean);

  if (factorList.length === 0) {
    console.log(`SKIP ${template.name} (no matching factors)`);
    continue;
  }

  try {
    await api(`/templates/${template.template_id}/factors`, {
      method: 'PUT',
      body: JSON.stringify({ factors: factorList }),
    });
    console.log(`OK   ${template.name} ← ${factorList.length} factors assigned`);
    success++;
  } catch (e) {
    console.error(`FAIL ${template.name}: ${e.message}`);
    failed++;
  }
}

console.log(`\nDone: ${success} success, ${failed} failed`);
