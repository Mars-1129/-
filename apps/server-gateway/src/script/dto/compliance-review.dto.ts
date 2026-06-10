// =============================================================================
// TikStream AI — Compliance AI Review DTO
// =============================================================================

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class ComplianceReviewDto {
  @ApiPropertyOptional({
    description: '是否启用 AI 语义二审（默认 false，仅执行正则检查）',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enable_ai_review?: boolean;

  @ApiPropertyOptional({
    description: '商品类目（辅助 AI 判定违规语境）',
  })
  @IsOptional()
  @IsString()
  product_category?: string;
}

/** 合规审查进度事件（SSE 流式推送） */
export interface ComplianceReviewProgressEvent {
  stage:
    | 'init'
    | 'basic_check_start'
    | 'basic_check_applying_regex'
    | 'basic_check_applying_nlp'
    | 'basic_check_applying_sensitivity'
    | 'basic_check_applying_db_rules'
    | 'basic_check_done'
    | 'ai_review_start'
    | 'ai_review_building_prompt'
    | 'ai_review_llm_connected'
    | 'ai_review_sending'
    | 'ai_review_waiting_response'
    | 'ai_review_received'
    | 'ai_review_parsing'
    | 'ai_review_done'
    | 'synthing_verdict'
    | 'complete';
  message: string;
  progress: number; // 0-100
  /** 可选扩展数据（由各阶段自行填充） */
  data?: {
    /** 基础检查命中数 */
    basic_violations?: number;
    /** 审查候选数 */
    candidate_count?: number;
    /** 提示词大小（字符数） */
    prompt_length?: number;
    /** LLM 响应耗时（毫秒） */
    llm_latency_ms?: number;
    /** LLM 原始响应长度 */
    llm_response_length?: number;
    /** LLM 模型名（内部日志，不暴露 endpoint） */
    llm_model?: string;
    /** 违规统计 */
    blocked_count?: number;
    warn_count?: number;
    false_positive_count?: number;
    /** 审查维度 */
    review_dimensions?: string[];
    /** 调用的规则数量 */
    rule_count?: number;
    /** 各阶段详情 */
    [key: string]: unknown;
  };
}
