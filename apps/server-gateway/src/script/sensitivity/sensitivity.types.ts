// =============================================================================
// TikStream AI — Sensitivity Types
// 文案敏感词检测与替换 — 接口定义
// =============================================================================

/** 支持的平台 */
export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'shopee' | 'lazada';

/** 违规类型 */
export type SensitivityIssueType =
  | 'prohibited'    // 违禁词（强禁止，必须移除）
  | 'restricted'    // 限流词（平台限制曝光）
  | 'brand'         // 品牌词（品牌侵权风险）
  | 'competition'   // 竞品词（竞品引流风险）
  | 'cultural';      // 文化敏感性（区域/宗教/习俗）

/** 严重程度 */
export type SeverityLevel = 'critical' | 'warning' | 'info';

/** 审批状态 */
export type ApprovalStatus = 'approved' | 'needs_review' | 'rejected';

/** 敏感词检测配置 */
export interface SensitivityCheckConfig {
  /** 检测平台 */
  platforms: Platform[];

  /** 检测规则开关 */
  rules: SensitivityCheckRules;

  /** 处理策略 */
  handling: SensitivityHandlingConfig;
}

/** 检测规则 */
export interface SensitivityCheckRules {
  prohibited_words: boolean;
  restricted_words: boolean;
  brand_keywords: boolean;
  competition_keywords: boolean;
  cultural_sensitivity: boolean;
}

/** 处理策略 */
export interface SensitivityHandlingConfig {
  auto_remove: boolean;
  auto_replace: boolean;
  human_review: boolean;
  suggest_alternatives: boolean;
}

/** 敏感词检测项 */
export interface SensitivityIssue {
  type: SensitivityIssueType;
  word: string;
  position: number;
  severity: SeverityLevel;
  platform_impact: Record<string, boolean>;
  reason: string;
}

/** 替换建议 */
export interface ReplacementSuggestion {
  original: string;
  alternatives: string[];
  ai_generated?: string;
}

/** 敏感词检测结果 */
export interface SensitivityCheckResult {
  issues: SensitivityIssue[];
  suggestions: ReplacementSuggestion[];
  overall_risk_score: number;
  approval_status: ApprovalStatus;
}

/** 单条规则定义 */
export interface SensitivityRule {
  /** 匹配模式（字符串包含匹配） */
  pattern: string;
  /** 违规类型 */
  type: SensitivityIssueType;
  /** 严重程度 */
  severity: SeverityLevel;
  /** 适用平台（空 = 所有平台） */
  platforms?: Platform[];
  /** 不适用平台 */
  exclude_platforms?: Platform[];
  /** 违规原因说明 */
  reason: string;
  /** 预设替换词列表 */
  alternatives?: string[];
}

/** 默认配置 */
export const DEFAULT_SENSITIVITY_CONFIG: SensitivityCheckConfig = {
  platforms: ['tiktok', 'shopee'],
  rules: {
    prohibited_words: true,
    restricted_words: true,
    brand_keywords: false,
    competition_keywords: true,
    cultural_sensitivity: true,
  },
  handling: {
    auto_remove: false,
    auto_replace: false,
    human_review: true,
    suggest_alternatives: true,
  },
};
