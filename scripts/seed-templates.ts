/**
 * TikStream AI — Template Market Seed Script
 * Populates 55 high-quality, diverse video templates for TikTok Shop.
 */
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

interface TemplateSeed {
  name: string;
  category: string;
  strategy_summary: string;
  factor_json: Record<string, unknown>;
  schema_json?: Record<string, unknown>;
  country?: string;
  product_type?: string;
}

const templates: TemplateSeed[] = [
  // ========== US MARKET — BEAUTY & SKINCARE (5) ==========
  {
    name: 'US Beauty - 3s Glow Transformation',
    category: 'promo',
    strategy_summary: 'Opening with a dull/bright split-screen, instantly showing the "before/after" transformation. Mid-section demonstrates product texture and application close-up. End with glowing result + direct CTA.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.0, camera_patterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'upbeat-electronic', cta_placement: 'end', hook_style: '对比反差', narrative_tone: 'bold', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'en-US', tone: 'energetic' },
    country: 'US', product_type: 'beauty'
  },
  {
    name: 'US Skincare - Problem-Solution Routine',
    category: 'tutorial',
    strategy_summary: 'Start by highlighting a common skin problem (acne/dryness). Then show the 3-step routine with the product: cleanse → apply → result. Each step gets a dedicated shot with text overlay. Close-up of final skin texture as social proof.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Static', 'Dolly_In_Fast', 'Pan_Left'], transition_preference: 'Wipe', bgm_style: 'calm', cta_placement: 'spread', hook_style: '问题前置型', narrative_tone: 'professional', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'en-US', tone: 'educational' },
    country: 'US', product_type: 'beauty'
  },
  {
    name: 'US Makeup - Get Ready With Me',
    category: 'story',
    strategy_summary: 'First-person POV of applying makeup step by step. Start with bare face → foundation → eyes → lips. Use fast cuts and text captions for each product name. Natural lighting, cozy bedroom vibe. End with full look reveal + mirror check.',
    factor_json: { optimal_shot_count: 7, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Tilt_Up', 'Dolly_In_Fast'], transition_preference: 'Fade_In', bgm_style: 'playful', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'authentic', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text'], output_language: 'en-US', tone: 'casual' },
    country: 'US', product_type: 'beauty'
  },
  {
    name: 'US Beauty - 24H Wear Test Review',
    category: 'review',
    strategy_summary: 'Start with application timestamp. Fast-forward through 4/8/12/24 hour check-ins. Each check-in shows face close-up and oil-blotting paper test. Use data-style text overlays showing hours elapsed. End with verdict and link in bio.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'mid', hook_style: '对比反差型', narrative_tone: 'honest', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'review-style' },
    country: 'US', product_type: 'beauty'
  },
  {
    name: 'US Beauty - Viral Dupe vs Original',
    category: 'comparison',
    strategy_summary: 'Split screen: left = expensive original ($68), right = affordable dupe ($12). Show texture, application, finish side by side. Zoom in on identical results. Text overlay shows price comparison. End: "Save $56 — link in bio!"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 12.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '对比反差型', narrative_tone: 'bold', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'comparison' },
    country: 'US', product_type: 'beauty'
  },

  // ========== US MARKET — ELECTRONICS & GADGETS (4) ==========
  {
    name: 'US Tech - 60s Unboxing Challenge',
    category: 'unboxing',
    strategy_summary: 'Timer counts down from 60s. Fast-paced unboxing: slice seal → lift lid → reveal device → peel film → first boot. ASMR focus on packaging sounds. Every 5 seconds a new feature revealed via text overlay. Ends with "Full review tomorrow — follow!"',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Wipe', bgm_style: 'upbeat-electronic', cta_placement: 'end', hook_style: '悬念递进型', narrative_tone: 'energetic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'en-US', tone: 'tech-enthusiast' },
    country: 'US', product_type: 'electronics'
  },
  {
    name: 'US Tech - Feature Showdown',
    category: 'comparison',
    strategy_summary: 'Side-by-side comparison of two competing gadgets. Split-screen shows: design → speed test → camera samples → battery 🔋 test. Each category gets a score card overlay (🏆). End with winner announcement and price comparison table.',
    factor_json: { optimal_shot_count: 7, optimal_total_duration: 14.5, camera_patterns: ['Static', 'Pan_Left', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'upbeat-electronic', cta_placement: 'mid', hook_style: '对比反差型', narrative_tone: 'professional', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'analytical' },
    country: 'US', product_type: 'electronics'
  },
  {
    name: 'US Tech - Desk Setup Transformation',
    category: 'story',
    strategy_summary: 'Show a messy, dated desk. Then "Day 1" → "Day 2" → "Day 3" transformation sequence. Each day introduces a new tech product (monitor, keyboard, cable management). Satisfying before/after shots. End with full aesthetic desk reveal + product tags.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.0, camera_patterns: ['Pan_Left', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'spread', hook_style: '故事叙述型', narrative_tone: 'inspiring', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'aesthetic' },
    country: 'US', product_type: 'electronics'
  },
  {
    name: 'US Tech - Why I Returned It',
    category: 'review',
    strategy_summary: 'Start with purchase receipt and 30-day return window. Show 3 things you loved, then 2 deal-breakers. Use circle/highlight overlays for specific features. Honest, balanced take. End with "who this IS and ISNT for" and alternative recommendation.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'calm', cta_placement: 'end', hook_style: '问题前置型', narrative_tone: 'honest', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'en-US', tone: 'balanced-review' },
    country: 'US', product_type: 'electronics'
  },

  // ========== US MARKET — FASHION & APPAREL (4) ==========
  {
    name: 'US Fashion - 5 Ways to Style',
    category: 'tutorial',
    strategy_summary: 'One clothing piece styled 5 different ways. Each look gets a quick transition (spin/snap/arm swipe). Show the full outfit from head to toe. Overlay each style name: "Office", "Brunch", "Date Night", "Casual", "Travel". End with "Which look is your fave?" poll prompt.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 12.0, camera_patterns: ['Static', 'Tilt_Up', 'Pan_Left'], transition_preference: 'Wipe', bgm_style: 'playful', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'playful', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'trendy' },
    country: 'US', product_type: 'fashion'
  },
  {
    name: 'US Fashion - Haul & Try-On',
    category: 'unboxing',
    strategy_summary: 'Shopping bags on bed → pull out each item dramatically → try on with mirror shots → rate 1-10. Quick cuts showing each piece. Use ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????Rating overlay for each item. End with top 3 picks and total spend.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '悬念递进型', narrative_tone: 'enthusiastic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'excited' },
    country: 'US', product_type: 'fashion'
  },
  {
    name: 'US Fashion - Capsule Wardrobe Challenge',
    category: 'story',
    strategy_summary: 'Show overflowing closet → satisfaction of donating old clothes → 15-piece capsule wardrobe reveal → 7 days of outfits montage. Each day shows the outfit with accessories. End with "capsule wardrobe changed my life" message and brand tags.',
    factor_json: { optimal_shot_count: 7, optimal_total_duration: 14.5, camera_patterns: ['Pan_Left', 'Static', 'Dolly_In_Fast'], transition_preference: 'Fade_In', bgm_style: 'inspirational', cta_placement: 'spread', hook_style: '故事叙述型', narrative_tone: 'inspiring', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text'], output_language: 'en-US', tone: 'minimalist' },
    country: 'US', product_type: 'fashion'
  },
  {
    name: 'US Fashion - Styling by Body Type',
    category: 'tutorial',
    strategy_summary: 'Start with question: "Do you know your body type?" Show 4 body types (hourglass, pear, apple, rectangle) with side-by-side flattering vs unflattering outfits for each. Use body shape outlines as overlays. End with "check link for full guide" CTA.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'calm', cta_placement: 'end', hook_style: '问题前置型', narrative_tone: 'educational', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'helpful' },
    country: 'US', product_type: 'fashion'
  },

  // ========== US MARKET — HOME & KITCHEN (3) ==========
  {
    name: 'US Home - 30s Kitchen Hack',
    category: 'tutorial',
    strategy_summary: 'Problem: messy kitchen / difficult task. Then BAM — product swoops in and solves it in seconds. Split-screen: without vs with product. Satisfying results in 15s. End with product name + "Link in bio — 50% off today!" urgency.',
    factor_json: { optimal_shot_count: 4, optimal_total_duration: 10.5, camera_patterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '问题前置型', narrative_tone: 'urgent', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'fast-paced' },
    country: 'US', product_type: 'home'
  },
  {
    name: 'US Home - Room Makeover B&A',
    category: 'story',
    strategy_summary: 'Pan across messy/dark room → countdown 3-2-1 → reveal stunning transformation. Use smooth camera pans to show every detail: lighting, storage, decor. Each zone gets a "what I used" text tag. End with total budget breakdown and satisfaction smile.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Pan_Left', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Fade_In', bgm_style: 'inspirational', cta_placement: 'spread', hook_style: '故事叙述型', narrative_tone: 'inspiring', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'cozy' },
    country: 'US', product_type: 'home'
  },
  {
    name: 'US Home - 3 Gadgets Under $20',
    category: 'review',
    strategy_summary: 'Count up from #3 to #1. Each gadget gets: unbox → demo → verdict in 12s. Use price tag overlay and ?? rating for each. End with #1 reveal (the best one) + "All links in bio - swipe up!" Call-to-action with urgency.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'upbeat-electronic', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'enthusiastic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'budget-friendly' },
    country: 'US', product_type: 'home'
  },

  // ========== INDONESIA MARKET — BEAUTY & SKINCARE (3) ==========
  {
    name: 'ID Beauty - Glowing Dalam 7 Hari',
    category: 'review',
    strategy_summary: 'Hari 1 sampai Hari 7 transformasi kulit. Setiap hari close-up wajah tanpa filter. Tunjukkan tekstur produk dan cara pakai. Overlay teks: "Hari 3 — mulai glowing!", "Hari 7 — jerawat hilang!". Akhiri dengan before/after split-screen dan "Link di bio — diskon 50%!"',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '问题前置型', narrative_tone: 'authentic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'id-ID', tone: 'authentic' },
    country: 'ID', product_type: 'beauty'
  },
  {
    name: 'ID Skincare - Rutin Skincare Pagi Malam',
    category: 'tutorial',
    strategy_summary: 'Tampilkan AM routine (5 langkah) dan PM routine (5 langkah). Setiap langkah nama produk + fungsi muncul sebagai overlay. ASMR suara aplikasi produk. Gunakan close-up tangan untuk setiap step. Akhiri dengan rekomendasi budget-friendly alternative.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Static', 'Dolly_In_Fast', 'Pan_Left'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'spread', hook_style: '清单罗列型', narrative_tone: 'professional', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'id-ID', tone: 'educational' },
    country: 'ID', product_type: 'beauty'
  },
  {
    name: 'ID Fashion - OOTD Kekinian Under 200rb',
    category: 'comparison',
    strategy_summary: 'Bandingkan outfit branded (mahal) vs thrift find (murah). Tunjukkan detail kain, jahitan, dan cara styling. Overlay harga untuk perbandingan. Akhiri dengan "Mahal bukan berarti lebih bagus!" dan ajakan ke toko online.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 12.5, camera_patterns: ['Static', 'Tilt_Up', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '对比反差型', narrative_tone: 'playful', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'id-ID', tone: 'trendy' },
    country: 'ID', product_type: 'fashion'
  },

  // ========== THAILAND MARKET (3) ==========
  {
    name: 'TH Beauty - 3-Step Glass Skin Routine',
    category: 'tutorial',
    strategy_summary: 'เปิดด้วย close-up ผิวที่ไม่เรียบเนียน → แสดง 3 ขั้นตอน: โทนเนอร์ → เซรั่ม → มอยส์เจอไรเซอร์ → close-up ผิว Glass Skin ที่เปล่งประกาย ใช้แสงธรรมชาติในการถ่าย Overlay ชื่อผลิตภัณฑ์และราคา จบด้วย "คลิกลิงก์ในไบโอ — โปรโมชั่นพิเศษ!"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'beauty', cta_placement: 'end', hook_style: '问题前置型', narrative_tone: 'luxurious', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'th-TH', tone: 'beauty-expert' },
    country: 'TH', product_type: 'beauty'
  },
  {
    name: 'TH Food - Street Food Review 5 ?',
    category: 'review',
    strategy_summary: 'เดินตลาด → ซื้ออาหาร 5 อย่าง → ชิมแต่ละอย่าง พร้อมให้คะแนน ? Overlay ชื่อร้าน + ราคา + คะแนน close-up ของอาหารตอนกัด/ตัก คำบรรยายความรู้สึกแต่ละจาน จบด้วยอันดับ 1 และพิกัดร้าน',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.0, camera_patterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'playful', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'enthusiastic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'th-TH', tone: 'foodie' },
    country: 'TH', product_type: 'food'
  },
  {
    name: 'TH Fashion - Mix & Match 7 Days',
    category: 'story',
    strategy_summary: 'One week, one suitcase, unlimited outfits. จันทร์ถึงอาทิตย์ แต่ละวันแสดงชุดที่แตกต่างกัน ใช้เทคนิค snap transition เปลี่ยนชุด Overlay วันและสไตล์: "วันจันทร์ — Office Look", "วันเสาร์ — Brunch Vibes" จบด้วย suitcase packing tip',
    factor_json: { optimal_shot_count: 7, optimal_total_duration: 14.5, camera_patterns: ['Static', 'Tilt_Up', 'Pan_Left'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'playful', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'th-TH', tone: 'trendy' },
    country: 'TH', product_type: 'fashion'
  },

  // ========== VIETNAM MARKET (3) ==========
  {
    name: 'VN Beauty - 7 Ngày Dưỡng Trắng Da',
    category: 'review',
    strategy_summary: 'Bắt đầu bằng close-up da sạm màu → mỗi ngày ghi lại quá trình dưỡng da → kết quả cuối tuần với before/after rõ rệt. Sử dụng ánh sáng tự nhiên, không filter. Overlay text từng bước sử dụng sản phẩm. Kết thúc với "Mua ngay — giảm 40%!"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'calm', cta_placement: 'end', hook_style: '问题前置型', narrative_tone: 'authentic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'vi-VN', tone: 'honest' },
    country: 'VN', product_type: 'beauty'
  },
  {
    name: 'VN Tech - ???p H?p ?? Th?',
    category: 'unboxing',
    strategy_summary: 'H?p hàng trên bàn → c?t b?ng keo ASMR → l?y s?n ph?m ra t? t? → b?c film b?o v? → kh?i ??ng l?n ??u → th? nghi?m 3 tính n?ng chính. M?i tính n?ng có overlay text gi?i thích. K?t thúc v?i "?? l?i bình lu?n ?? nh?n link gi?m giá!"',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Wipe', bgm_style: 'upbeat-electronic', cta_placement: 'end', hook_style: '悬念递进型', narrative_tone: 'enthusiastic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'vi-VN', tone: 'tech-enthusiast' },
    country: 'VN', product_type: 'electronics'
  },
  {
    name: 'VN Food - ? Quán Ngon Review 2024',
    category: 'review',
    strategy_summary: 'Quay c?nh quán ?n → g?i món ?i?n hình → quay close-up món ?n ???c d?n ra → c?n m?t mi?ng, bi?u c?m hài lòng → ?ánh giá sao ? và giá ti?n. Overlay ??a ch? và gi? m? c?a. K?t thúc v?i top 3 món ngon nh?t.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Dolly_In_Fast', 'Static', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'playful', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'authentic', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'vi-VN', tone: 'foodie' },
    country: 'VN', product_type: 'food'
  },

  // ========== PHILIPPINES MARKET (3) ==========
  {
    name: 'PH Beauty - Affordable Glow Up Challenge',
    category: 'tutorial',
    strategy_summary: 'Start with "SKL" (Share Ko Lang) format. Show bare face → apply affordable products step by step → reveal the glow up. Tag each product with price in PHP. Use natural window lighting. End with complete look + "Lahat ito under ₱500!" and shop link.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Fade_In', bgm_style: 'playful', cta_placement: 'end', hook_style: '问题前置型', narrative_tone: 'authentic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-PH', tone: 'relatable' },
    country: 'PH', product_type: 'beauty'
  },
  {
    name: 'PH Food - Pasalubong Haul Taste Test',
    category: 'review',
    strategy_summary: 'Unbox local delicacies one by one. Close-up shots of each food item. Try and rate each one out of 10 with fun reactions. Overlay: product name, origin, price in PHP. End with "Which one??s your fave? Comment below!" and giveaway announcement.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'playful', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-PH', tone: 'fun' },
    country: 'PH', product_type: 'food'
  },
  {
    name: 'PH Fashion - Thrift Flip Challenge',
    category: 'story',
    strategy_summary: 'Go to ukay-ukay → find hidden gems → show before (original) → DIY/alteration process timelapse → after (styled). Each piece has price tag (₱50-₱200). End with full wardrobe reveal and total cost. "Sulit na sulit!" energy throughout.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Pan_Left', 'Static', 'Dolly_In_Fast'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'authentic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-PH', tone: 'creative' },
    country: 'PH', product_type: 'fashion'
  },

  // ========== MALAYSIA MARKET (3) ==========
  {
    name: 'MY Beauty - Tudung-Friendly Skincare Routine',
    category: 'tutorial',
    strategy_summary: 'Specifically for hijabi audience. Morning routine: cleanse → tone → serum → moisturize → sunscreen. Show how products work well under tudung (no stickiness, no white cast). Close-up of skin texture. End with "Semua produk ni halal-certified!"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'warm', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'ms-MY', tone: 'inclusive' },
    country: 'MY', product_type: 'beauty'
  },
  {
    name: 'MY Food - Bazaar Ramadan Favourites',
    category: 'review',
    strategy_summary: 'Walk through Ramadan bazaar → visit 5 stalls → buy iconic dishes → taste and rate each one. Overlay: dish name, stall name, price in RM. Use mouth-watering close-ups. End with top 3 picks and "Selamat Berbuka!" greeting.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.0, camera_patterns: ['Dolly_In_Fast', 'Static', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'dramatic', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'warm', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ms-MY', tone: 'festive' },
    country: 'MY', product_type: 'food'
  },
  {
    name: 'MY Tech - Gadget Murah Tapi Power',
    category: 'comparison',
    strategy_summary: 'Compare budget gadgets from Shopee/Lazada. 3 picks under RM100. Each: unbox → test → rate. Highlight key features vs price. Use "Best Value" badges. End with winner announcement and direct shop links. "Jangan lupa click link di bio!"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'upbeat-electronic', cta_placement: 'end', hook_style: '对比反差型', narrative_tone: 'enthusiastic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ms-MY', tone: 'budget-savvy' },
    country: 'MY', product_type: 'electronics'
  },

  // ========== BRAZIL MARKET (3) ==========
  {
    name: 'BR Beauty - Rotina de Skincare Completa',
    category: 'tutorial',
    strategy_summary: 'Rotina diurna (5 passos) e noturna (5 passos). Cada passo com close-up do produto e demonstração de aplicação. Dicas de especialista: "Nunca pule o protetor solar!", "Hidrate sempre do centro para fora". Finalize com resultado glowing e link na bio.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Static', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'spread', hook_style: '清单罗列型', narrative_tone: 'professional', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'pt-BR', tone: 'professional' },
    country: 'BR', product_type: 'beauty'
  },
  {
    name: 'BR Fashion - Looks para o Fim de Semana',
    category: 'story',
    strategy_summary: 'Sexta, sábado e domingo — 3 dias, 3 looks diferentes. Sexta: happy hour casual → sábado: praia/piscina → domingo: almo?o em família. Use transitions rápidas (giro/snap). Overlay com nome da pe?a e pre?o em R$. Finalize com "Qual look voc?? prefere?"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.0, camera_patterns: ['Tilt_Up', 'Static', 'Pan_Left'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'playful', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'pt-BR', tone: 'vibrant' },
    country: 'BR', product_type: 'fashion'
  },
  {
    name: 'BR Fitness - Treino em Casa 15 Minutos',
    category: 'tutorial',
    strategy_summary: 'Sem equipamento, 15 minutos. 5 exercícios: agachamento → flexão → prancha → afundo → polichinelo. Timer na tela para cada exercício. Demonstre forma correta e variação para iniciantes. Finalize com "Salve para treinar depois!" e link do app fitness.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Tilt_Up'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '直接展示型', narrative_tone: 'motivational', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'pt-BR', tone: 'energetic' },
    country: 'BR', product_type: 'fitness'
  },

  // ========== MEXICO MARKET (2) ==========
  {
    name: 'MX Beauty - Maquillaje en 5 Minutos',
    category: 'tutorial',
    strategy_summary: 'Timer: 5 minutos en pantalla. Paso 1: base → 2: corrector → 3: rubor → 4: máscara → 5: labial. Cada paso cronometrado, ritmo rápido. Overlay de producto + precio en MXN. Final: antes/después en split-screen + "Productos en el link de mi perfil!"',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 12.0, camera_patterns: ['Dolly_In_Fast', 'Static'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '直接展示型', narrative_tone: 'energetic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'es-MX', tone: 'fast-beauty' },
    country: 'MX', product_type: 'beauty'
  },
  {
    name: 'MX Food - Receta Fácil en 30 Seg',
    category: 'tutorial',
    strategy_summary: 'Mano mostrando ingredientes (3-5 items) → preparación rápida en time-lapse → plato final con presentación atractiva. Cada ingrediente con nombre y cantidad en overlay. Sonido ASMR de cocción. Final: "Guarda esta receta para la cena!" y follow.',
    factor_json: { optimal_shot_count: 4, optimal_total_duration: 10.0, camera_patterns: ['Tilt_Up', 'Static'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '直接展示型', narrative_tone: 'warm', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'es-MX', tone: 'homemade' },
    country: 'MX', product_type: 'food'
  },

  // ========== JAPAN MARKET (3) ==========
  {
    name: 'JP Beauty - Minimalist Morning Routine',
    category: 'tutorial',
    strategy_summary: 'Japanese minimalist aesthetic. Clean white background, soft lighting. 4 products only: cleanse → lotion → serum → UV. Emphasize texture and packaging beauty. Use slow, elegant camera movements. End with "Simple is best" philosophy and product links.',
    factor_json: { optimal_shot_count: 4, optimal_total_duration: 12.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'luxurious', caption_density: 'low' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ja-JP', tone: 'minimalist' },
    country: 'JP', product_type: 'beauty'
  },
  {
    name: 'JP Tech - Gadget Unboxing ASMR',
    category: 'unboxing',
    strategy_summary: 'Pure ASMR focus: box cutting → plastic peeling → first touch of device. No voice, no music for first 10s. Then soft background music fades in. Use macro lens for texture details. End with elegant product display shot and specs overlay.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'end', hook_style: '悬念递进型', narrative_tone: 'professional', caption_density: 'low' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ja-JP', tone: 'zen' },
    country: 'JP', product_type: 'electronics'
  },
  {
    name: 'JP Food - Bento Box Art Tutorial',
    category: 'tutorial',
    strategy_summary: 'Top-down camera on cutting board. Show 5 bento ingredients being prepared and arranged with artistic precision. Close-up of each character/cute food element. Color-coded sections. End with complete bento reveal + "?????" overlay.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'playful', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'artistic', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ja-JP', tone: 'kawaii' },
    country: 'JP', product_type: 'food'
  },

  // ========== KOREA MARKET (3) ==========
  {
    name: 'KR Beauty - ???? 10?? ????',
    category: 'tutorial',
    strategy_summary: '???? ???????? ?? ? ? 10?? ?? ??: ??? → ??? → ??? → ??? → ??. ? ??? ??? ??? ???? ??? ??? ????. ???? ??? + ???? ??? ????. ???: "K-Beauty ???? ??? ??? ????!"? ??? ??? ?? ????.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Fade_In', bgm_style: 'beauty', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'professional', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ko-KR', tone: 'trendy' },
    country: 'KR', product_type: 'beauty'
  },
  {
    name: 'KR Fashion - ???? ????',
    category: 'comparison',
    strategy_summary: '?? vs ?? — ? ?? ?? ??? ??? ???? ????. ???: ??? ??/??/?? ???? ???? ?? ????. ????: ???? ?? (????/???). ?? ??: "?????? ?? ???? ??!" ???? ?? ? ?? ??.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 12.0, camera_patterns: ['Static', 'Tilt_Up', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '对比反差型', narrative_tone: 'playful', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ko-KR', tone: 'trendy' },
    country: 'KR', product_type: 'fashion'
  },
  {
    name: 'KR Food - ??? Mukbang Style',
    category: 'review',
    strategy_summary: '???? ??? ??? → ???? ??? ?? → ? ? ??? ???? ???. ASMR ?? ????? ??? ????. ???? ???? + ?? + ?? ????. ???: "????? ?????"?? ??? ??.',
    factor_json: { optimal_shot_count: 4, optimal_total_duration: 11.5, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Wipe', bgm_style: 'playful', cta_placement: 'end', hook_style: '直接展示型', narrative_tone: 'enthusiastic', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'ko-KR', tone: 'fun' },
    country: 'KR', product_type: 'food'
  },

  // ========== UK MARKET (2) ==========
  {
    name: 'UK Home - Satisfying Cleaning ASMR',
    category: 'story',
    strategy_summary: 'Show the mess → satisfying cleaning process → pristine result. Use ASMR sounds: scrubbing, spraying, wiping. Each area gets a timelapse transformation. Use product labels as overlays. End with relaxing overview shot + "Products linked in bio — 20% off this week!"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Pan_Left', 'Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'calm', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'calm', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-GB', tone: 'satisfying' },
    country: 'UK', product_type: 'home'
  },
  {
    name: 'UK Fashion - Charity Shop to Chic',
    category: 'story',
    strategy_summary: 'Browse a charity shop → find hidden gems → try on → style each piece 2 ways. Show price tags (??-??). Use UK high street as background. End with final look + "Sustainable fashion doesn??t mean boring!" and thrift account tag.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Pan_Left', 'Static', 'Tilt_Up'], transition_preference: 'Fade_In', bgm_style: 'inspirational', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'authentic', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-GB', tone: 'vintage' },
    country: 'UK', product_type: 'fashion'
  },

  // ========== SINGAPORE MARKET (2) ==========
  {
    name: 'SG Food - Hawker Centre Guide',
    category: 'review',
    strategy_summary: 'Visit 3 iconic hawker stalls → show queue → order the must-try dish → close-up of food → first bite reaction. Overlay: stall name, dish, price in SGD, Michelin rating if any. End with "Save this for your next SG trip!" and map link.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Dolly_In_Fast', 'Static', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'enthusiastic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-SG', tone: 'food-guide' },
    country: 'SG', product_type: 'food'
  },
  {
    name: 'SG Tech - Smart Home Setup Tour',
    category: 'story',
    strategy_summary: 'Tour a fully automated HDB flat. Room by room: show smart lights → robot vacuum → smart lock → automated blinds. Each device demoed with voice command. Use futuristic transitions. End with "Total cost: under $500" and affiliate links for each device.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Pan_Left', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'upbeat-electronic', cta_placement: 'spread', hook_style: '悬念递进型', narrative_tone: 'professional', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-SG', tone: 'tech-savvy' },
    country: 'SG', product_type: 'electronics'
  },

  // ========== CROSS-BORDER / GLOBAL (6) ==========
  {
    name: 'Global - Flash Sale Countdown',
    category: 'promo',
    strategy_summary: 'COUNTDOWN TIMER: 24h → 12h → 6h → 1h → NOW! Each beat shows a new discount level (10% → 20% → 30% → 50% OFF). Use flashing text overlays and urgency-inducing music. Show product in action each beat. End: "Swipe up — sale ends in 5 minutes!" red banner.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 10.0, camera_patterns: ['Dolly_In_Fast', 'Static'], transition_preference: 'Wipe', bgm_style: 'dramatic', cta_placement: 'spread', hook_style: '悬念递进型', narrative_tone: 'urgent', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'sales' },
    country: 'GLOBAL', product_type: 'general'
  },
  {
    name: 'Global - Before & After Transformation',
    category: 'promo',
    strategy_summary: 'Split screen: LEFT = dull/broken/messy BEFORE, RIGHT = vibrant/fixed/clean AFTER. Use a dramatic reveal mechanism (swipe, curtain pull, snap). Show transformation from multiple angles. End with product reveal + "Get your transformation — link in bio!"',
    factor_json: { optimal_shot_count: 4, optimal_total_duration: 10.5, camera_patterns: ['Dolly_In_Fast', 'Static'], transition_preference: 'Wipe', bgm_style: 'inspirational', cta_placement: 'end', hook_style: '对比反差型', narrative_tone: 'motivational', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'inspiring' },
    country: 'GLOBAL', product_type: 'general'
  },
  {
    name: 'Global - 3 Reasons Why',
    category: 'promo',
    strategy_summary: 'Start with bold claim → reveal reason #1 → visual proof → reason #2 → testimonial/demo → reason #3 → comparison → end with all 3 reasons summarized + CTA. Each reason gets its own distinct visual style. Numbered countdown on screen.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 12.0, camera_patterns: ['Static', 'Dolly_In_Fast', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '清单罗列型', narrative_tone: 'bold', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'convincing' },
    country: 'GLOBAL', product_type: 'general'
  },
  {
    name: 'Global - Customer Testimonial Montage',
    category: 'review',
    strategy_summary: '3-4 diverse customers share their honest experience. Each testimonial: 4s clip with customer + text quote overlay. Intercut with product B-roll showing results. End with "Join 50,000+ happy customers" social proof number + CTA.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Static'], transition_preference: 'Fade_In', bgm_style: 'inspirational', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'warm', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'social-proof' },
    country: 'GLOBAL', product_type: 'general'
  },
  {
    name: 'Global - Product Demo in 20s',
    category: 'tutorial',
    strategy_summary: 'Ultra-condensed demo format. 5s problem → 10s solution in action → 5s result. No talking, only text overlays and visual demonstration. Use speed ramps for repetitive actions. End with product name and "Link in bio" in bold.',
    factor_json: { optimal_shot_count: 3, optimal_total_duration: 8.0, camera_patterns: ['Dolly_In_Fast', 'Static'], transition_preference: 'Wipe', bgm_style: 'upbeat-electronic', cta_placement: 'end', hook_style: '直接展示型', narrative_tone: 'energetic', caption_density: 'low' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'fast-demo' },
    country: 'GLOBAL', product_type: 'general'
  },
  {
    name: 'Global - A Day in the Life Product Placement',
    category: 'story',
    strategy_summary: 'Vlog-style format showing how the product fits naturally into daily life. Morning routine → commute/work → afternoon break → evening wind-down. Product appears naturally in 3-4 moments. End with "This product changed my daily routine!" genuine endorsement.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Static', 'Pan_Left', 'Tilt_Up'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'spread', hook_style: '故事叙述型', narrative_tone: 'authentic', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text'], output_language: 'en-US', tone: 'vlog-style' },
    country: 'GLOBAL', product_type: 'general'
  },

  // ========== FASHION CROSS-COUNTRY (2) ==========
  {
    name: 'Global Fashion - Transition Outfit Challenge',
    category: 'story',
    strategy_summary: 'Use outfit transition trend (snap/clap/jump). 5 transitions: work → gym → dinner → party → lounge. Each transition uses identical filming position for seamless cuts. Music syncs with each transition beat. End with "Shop all looks — link in bio!"',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 11.0, camera_patterns: ['Static', 'Tilt_Up'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '悬念递进型', narrative_tone: 'trendy', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'trendy' },
    country: 'GLOBAL', product_type: 'fashion'
  },
  {
    name: 'Global Fashion - Sustainable Swap Series',
    category: 'comparison',
    strategy_summary: 'Each episode replaces one fast fashion item with a sustainable alternative. Show: original item → its environmental impact → sustainable swap → side-by-side comparison → cost analysis. End with "Small swaps, big impact" and sustainable brand links.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'inspirational', cta_placement: 'end', hook_style: '对比反差型', narrative_tone: 'educational', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'eco-conscious' },
    country: 'GLOBAL', product_type: 'fashion'
  },

  // ========== ELECTRONICS CROSS-COUNTRY (2) ==========
  {
    name: 'Global Tech - Speed Test Battle',
    category: 'comparison',
    strategy_summary: 'Three devices lined up. Test boot-up speed → app launch → camera → battery drain. Side-by-side real-time comparison. Use timer overlay for each test. Scoreboard updates after each round. End with final ranking and "Which surprised you most?" engagement.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Dissolve', bgm_style: 'dramatic', cta_placement: 'end', hook_style: '对比反差型', narrative_tone: 'professional', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'tech-battle' },
    country: 'GLOBAL', product_type: 'electronics'
  },
  {
    name: 'Global Tech - What??s in My Tech Bag',
    category: 'story',
    strategy_summary: 'Open bag → pull out items one by one → explain each: laptop, charger, cable organizer, power bank, earbuds. Each item gets a close-up shot + price + where to buy. Arrange items neatly for final flatlay shot. "Link to everything in my bio!"',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 13.5, camera_patterns: ['Static', 'Dolly_In_Fast', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'calm', cta_placement: 'spread', hook_style: '清单罗列型', narrative_tone: 'authentic', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text', 'subtitle_text'], output_language: 'en-US', tone: 'tech-lifestyle' },
    country: 'GLOBAL', product_type: 'electronics'
  },

  // ========== FITNESS & SPORTS (3) ==========
  {
    name: 'Global Fitness - 30 Day Challenge Results',
    category: 'story',
    strategy_summary: 'Day 1: before photo + starting measurement → Day 7: first visible change → Day 14: mid-point motivation → Day 21: major progress → Day 30: final transformation. Each beat shows side-by-side progression. Use motivating music build. End with full program reveal.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'inspirational', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'motivational', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'motivational' },
    country: 'GLOBAL', product_type: 'fitness'
  },
  {
    name: 'Global Fitness - 5 Minute Home Workout',
    category: 'tutorial',
    strategy_summary: 'No equipment needed. 5 exercises x 45s work + 15s rest. Timer overlay throughout. Show proper form for each exercise with side-view and front-view. Beginner modification in PIP (picture-in-picture). End with "Save this for tomorrow!" and program link.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 11.0, camera_patterns: ['Static', 'Tilt_Up'], transition_preference: 'Wipe', bgm_style: 'upbeat', cta_placement: 'end', hook_style: '直接展示型', narrative_tone: 'energetic', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'fitness-coach' },
    country: 'GLOBAL', product_type: 'fitness'
  },
  {
    name: 'Global Fitness - Athlete Morning Routine',
    category: 'story',
    strategy_summary: '6:00 AM wake-up → hydration → stretch → workout → protein shake → cold plunge → ready for day. Cinematic shots of each moment. Use natural morning light. End with "Champions are made in the morning" quote and gear links.',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.5, camera_patterns: ['Pan_Left', 'Tilt_Up', 'Static'], transition_preference: 'Fade_In', bgm_style: 'inspirational', cta_placement: 'spread', hook_style: '故事叙述型', narrative_tone: 'motivational', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text'], output_language: 'en-US', tone: 'cinematic' },
    country: 'GLOBAL', product_type: 'fitness'
  },

  // ========== PET PRODUCTS (2) ==========
  {
    name: 'Global Pets - Cute Unboxing with Doggo',
    category: 'unboxing',
    strategy_summary: 'Show the package → let the dog sniff and get excited → unbox while dog watches → reveal toy/treat → dog goes crazy with joy. Multiple angles: dog POV, owner POV, wide shot. End with happy dog + product name + "Your pup deserves this!"',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 12.5, camera_patterns: ['Dolly_In_Fast', 'Static', 'Tilt_Up'], transition_preference: 'Dissolve', bgm_style: 'playful', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'playful', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'adorable' },
    country: 'GLOBAL', product_type: 'pet'
  },
  {
    name: 'Global Pets - Grooming Session ASMR',
    category: 'tutorial',
    strategy_summary: 'Start with slightly messy pet → brush time (satisfying ASMR) → shampoo lather → rinse → blow dry → trim → final reveal. Use macro shots for before/after fur texture. Overlay product names and tools used. End with "Full grooming kit linked in bio!"',
    factor_json: { optimal_shot_count: 6, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Dolly_In_Fast', 'Pan_Left'], transition_preference: 'Dissolve', bgm_style: 'calm', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'warm', caption_density: 'high' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'satisfying' },
    country: 'GLOBAL', product_type: 'pet'
  },

  // ========== BABY & KIDS (2) ==========
  {
    name: 'Global Kids - Educational Toy Demo',
    category: 'tutorial',
    strategy_summary: 'Parent and child interaction. Show unboxing → child discovers toy → demonstrate 3 ways to play → child learning moment → happy reaction. Use warm lighting, genuine interactions. Overlay age range and skill development tags. End with "Perfect for ages X-Y!" CTA.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 13.0, camera_patterns: ['Static', 'Dolly_In_Fast'], transition_preference: 'Fade_In', bgm_style: 'playful', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'warm', caption_density: 'medium' },
    schema_json: { required_fields: ['visual_description', 'subtitle_text'], output_language: 'en-US', tone: 'family-friendly' },
    country: 'GLOBAL', product_type: 'baby_kids'
  },
  {
    name: 'Global Kids - Before Sleep Routine',
    category: 'story',
    strategy_summary: 'Evening routine montage: bathtime → pajamas → storybook time with product → baby falls asleep peacefully. Soft, warm lighting. Use slow fades between shots. Show parents gentle touch. End with peaceful sleeping baby + "Sweet dreams start here" and product link.',
    factor_json: { optimal_shot_count: 5, optimal_total_duration: 14.0, camera_patterns: ['Static', 'Tilt_Up'], transition_preference: 'Fade_In', bgm_style: 'calm', cta_placement: 'end', hook_style: '故事叙述型', narrative_tone: 'gentle', caption_density: 'low' },
    schema_json: { required_fields: ['visual_description', 'voiceover_text'], output_language: 'en-US', tone: 'peaceful' },
    country: 'GLOBAL', product_type: 'baby_kids'
  },
];

async function seed() {
  let created = 0;
  let failed = 0;
  for (const tpl of templates) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tpl.name,
          category: tpl.category,
          strategy_summary: tpl.strategy_summary,
          factor_json: tpl.factor_json,
          schema_json: tpl.schema_json,
          status: 'ACTIVE',
        }),
      });
      const data = await res.json() as { success?: boolean; message?: string; data?: { template_id?: string } };
      if (res.status === 201 || (data.success && data.data?.template_id)) {
        created++;
        console.log(`[${created}/${templates.length}] CREATED: ${tpl.name} (${tpl.country || 'GLOBAL'}/${tpl.product_type})`);
      } else {
        failed++;
        console.log(`[FAIL] ${tpl.name}: ${data.message || res.status}`);
      }
    } catch (err) {
      failed++;
      console.log(`[ERROR] ${tpl.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Small delay to not overwhelm
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`\nDone! Created ${created}, Failed ${failed}, Total ${templates.length}`);
}

seed();
