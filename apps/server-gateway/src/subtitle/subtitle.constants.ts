// =============================================================================
// TikStream AI — Subtitle Translation Constants
// =============================================================================

export const SUBTITLE_CONSTANTS = {
  DEFAULT_SOURCE_LANG: 'zh-CN' as const,

  /** 出海目标语种 */
  TARGET_LANGUAGES: [
    { code: 'en-US', name: '英语', region: '美国/菲律宾' },
    { code: 'id-ID', name: '印尼语', region: '印尼' },
    { code: 'th-TH', name: '泰语', region: '泰国' },
    { code: 'vi-VN', name: '越南语', region: '越南' },
    { code: 'ms-MY', name: '马来语', region: '马来西亚' },
  ] as const,

  /** 翻译并发上限（降低以避免超过火山方舟 API 100RPM 限制） */
  MAX_CONCURRENT_TRANSLATIONS: 2,

  /** 翻译重试次数 */
  MAX_TRANSLATION_RETRIES: 2,

  /** 字幕文本最大长度（超出后分片翻译） */
  MAX_SUBTITLE_SEGMENT_LENGTH: 200,

  /** 语言代码 → 本地化名称 */
  LANG_CODE_TO_NAME: {
    'zh-CN': '中文',
    'en-US': '英语',
    'id-ID': '印尼语',
    'th-TH': '泰语',
    'vi-VN': '越南语',
    'ms-MY': '马来语',
    'ja-JP': '日语',
    'ko-KR': '韩语',
    'es-ES': '西班牙语',
  } as Record<string, string>,

  /** 文化分析 System Prompt */
  CULTURAL_ANALYSIS_SYSTEM_PROMPT: `你是一名跨文化电商营销专家。分析以下带货视频字幕文本，针对每个目标市场输出文化适配建议。

要求：
1. 识别可能引起文化误解的表述（禁忌、歧义、不恰当的表达）
2. 识别需要本地化的内容（节日、货币、单位、习语）
3. 为每个目标市场提供具体改写建议
4. 以 JSON 格式返回：
[
  { "region": "en-US", "original": "...", "adapted_text": "...", "reason": "..." },
  ...
]`,

  /** 翻译 System Prompt */
  TRANSLATION_SYSTEM_PROMPT: (langName: string, targetLang: string, culturalRules: string): string =>
    `你是一名专业电商翻译与本地化专家。将用户输入的中文短视频带货字幕翻译成${langName}（语种代码：${targetLang}）。

翻译要求：
1. 翻译自然流畅，符合${langName}短视频带货口播习惯
2. 长度控制在原文字数的 ±30% 内（短视频字幕空间限制）
3. 保持原文的营销调性和感染力
4. 应用以下文化适配规则：
${culturalRules}
5. 仅返回翻译后的文本，不要添加任何解释或前缀`,

  /** 各市场文化适配规则 */
  CULTURAL_RULES: {
    'en-US': [
      '"立即购买" 翻译为 "Shop Now" 而非 "Buy Now"',
      '折扣表达使用 "% off"',
      '避免英式拼写（colour→color, favourite→favorite）',
      '使用 "Free Shipping" 而非 "Free Delivery"',
      '价格单位转换为 "$"',
    ].join('\n'),
    'id-ID': [
      '涉及食品需暗示 Halal 认证',
      '女性出镜描述避免过于暴露',
      '货币单位使用 "Rp"',
      '使用 "Gratis Ongkir" (包邮)、"COD" (货到付款) 等本地术语',
      '营销语调温暖、亲切、家庭导向',
    ].join('\n'),
    'th-TH': [
      '句末加 "ค่ะ" (女声) / "ครับ" (男声) 礼貌词',
      '价格用 "฿"',
      '禁止提及皇室、政治、佛教相关敏感内容',
      '"โปรโมชั่น" 用于促销、"จัดส่งฟรี" 用于包邮',
      '使用泰国本地电商平台惯用语',
    ].join('\n'),
    'vi-VN': [
      '价格单位用 "đ" (越南盾)',
      '使用亲昵称谓 "bạn" / "chị" / "anh"',
      '使用 "Freeship"、"Miễn phí vận chuyển" 等本地电商术语',
      '涉及食品注意越南口味偏好（酸甜、鱼露）',
    ].join('\n'),
    'ms-MY': [
      '使用 "RM" (马来西亚林吉特) 货币',
      '提及 Ramadan / Raya / Hari Raya 促销节点',
      '避免猪肉、酒精相关表述',
      '使用 "Penghantaran Percuma" (包邮)、"Bayar Semasa Terima" (COD)',
      '马来语与英语混合使用符合本地习惯',
    ].join('\n'),
  } as Record<string, string>,

  /** 质量回检阈值 */
  QUALITY_CHECK: {
    MAX_SUBTITLE_LENGTH: 40,        // 单条字幕最大字符数
    MIN_TRANSLATION_LENGTH: 1,       // 最小翻译长度
    CHINESE_RESIDUAL_PATTERN: /[\u4e00-\u9fff]/,  // 不应残留的中文字符
    MAX_CHINESE_RESIDUAL_RATIO: 0.30, // 中文字符占比超过 30% 才视为翻译失败（个别品牌名/人名可保留中文）
  },

  ERROR_MESSAGES: {
    SCRIPT_NOT_FOUND: '剧本不存在',
    TRANSLATION_FAILED: '翻译失败',
    TRANSLATION_EMPTY: '翻译结果为空',
    CULTURAL_ANALYSIS_FAILED: '文化分析失败',
  },
} as const;
