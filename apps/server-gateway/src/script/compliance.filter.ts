// =============================================================================
// TikStream AI — Compliance Filter
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { SCRIPT_CONSTANTS } from './script.constants';
import { NlpComplianceChecker, ComplianceViolation as NlpViolation } from './nlp-compliance';
import { ComplianceAiReviewPromptBuilder, AiReviewCandidate, AiReviewBatchResult } from '../../services/prompts/compliance-ai-review.prompt';
import { SensitivityChecker } from './sensitivity/sensitivity-checker';
import { DEFAULT_SENSITIVITY_CONFIG } from './sensitivity/sensitivity.types';
import type { SensitivityCheckConfig } from './sensitivity/sensitivity.types';

export interface ComplianceViolation {
  shot_index: number;
  violated_word: string;
  reason: string;
  /** AI 二审结果（仅启用 aiReview 时有值） */
  ai_verdict?: 'BLOCK' | 'WARN' | 'FALSE_POSITIVE' | 'INCONCLUSIVE';
  ai_reason?: string;
  severity?: number;
  suggestion?: string;
}

export interface ComplianceResult {
  passed: boolean;
  violations: ComplianceViolation[];
  /** AI 二审详情（仅启用时返回） */
  ai_review_result?: AiReviewBatchResult[];
}

export interface ComplianceCheckOptions {
  /** 是否启用 AI 语义二审 */
  enableAiReview?: boolean;
  /** AI 文本生成器（执行 LLM 调用） */
  aiTextGenerator?: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** 商品类目（辅助 AI 判定） */
  productCategory?: string;
  /** 敏感词检测配置（启用则进行多平台敏感词扫描） */
  sensitivityConfig?: SensitivityCheckConfig;
}

@Injectable()
export class ComplianceFilter {
  private readonly logger = new Logger(ComplianceFilter.name);
  private readonly nlpChecker: NlpComplianceChecker;
  private readonly sensitivityChecker: SensitivityChecker;
  private readonly aiReviewPromptBuilder: ComplianceAiReviewPromptBuilder;
  private dbRules: Array<{
    key: string;
    category: string;
    ruleType: string;
    ruleConfig: Record<string, unknown>;
  }> = [];

  constructor(
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {
    this.nlpChecker = new NlpComplianceChecker();
    this.sensitivityChecker = new SensitivityChecker();
    this.aiReviewPromptBuilder = new ComplianceAiReviewPromptBuilder();
    // Load DB rules on construction
    this.loadDbRules().catch((err) => {
      this.logger.error(
        `[ComplianceFilter] 初始加载 DB 规则失败: ${err?.message ?? err}。合规过滤将仅使用硬编码规则，请稍后调用 reload() 恢复。`,
      );
    });
  }

  async loadDbRules(): Promise<void> {
    const constraints = await this.prisma.constraint.findMany({
      where: { ruleType: 'HARD' },
      select: { key: true, category: true, ruleType: true, ruleConfig: true },
    });
    this.dbRules = constraints as unknown as typeof this.dbRules;
  }

  async reload(): Promise<void> {
    await this.loadDbRules();
  }

  check(shots: Array<Record<string, unknown>>): ComplianceResult {
    const violations: ComplianceViolation[] = [];

    const allRules = [
      ...SCRIPT_CONSTANTS.ABSOLUTE_TERMS,
      ...SCRIPT_CONSTANTS.PROHIBITED_PROMOTIONS,
    ];

    for (const shot of shots) {
      const shotIndex = Number(shot.shot_index);
      if (Number.isNaN(shotIndex)) {
        continue;
      }
      const combinedText = `${shot.voiceover_text || ''} ${shot.subtitle_text || ''}`;

      // 基础正则规则检查
      for (const rule of allRules) {
        const match = combinedText.match(rule.pattern);
        if (match && match.length > 0) {
          violations.push({
            shot_index: shotIndex,
            violated_word: match[0],
            reason: rule.reason,
          });
        }
      }

      // NLP 语境合规检查
      const nlpViolations = this.nlpChecker.check(combinedText);
      for (const v of nlpViolations) {
        violations.push({
          shot_index: shotIndex,
          violated_word: v.word,
          reason: v.reason,
        });
      }

      // 多平台敏感词检测（默认启用 TikTok + Shopee）
      const sensitivityResult = this.sensitivityChecker.check(
        combinedText,
        DEFAULT_SENSITIVITY_CONFIG,
      );
      for (const issue of sensitivityResult.issues) {
        // 仅 critical 级别敏感词阻断流程，warning/info 级别仅记录日志（如 iPhone/AirPods 等常见品牌词）
        if (issue.severity === 'critical') {
          violations.push({
            shot_index: shotIndex,
            violated_word: issue.word,
            reason: `[${issue.type}] ${issue.reason}`,
          });
        } else {
          this.logger.warn(
            `[Compliance] ${issue.severity}-level sensitivity issue skipped: ` +
            `shot=${shotIndex} word="${issue.word}" type=${issue.type} reason="${issue.reason}"`,
          );
        }
      }
    }

    // Apply DB HARD rules
    for (const rule of this.dbRules) {
      const config = rule.ruleConfig;
      if (config.check === 'voiceover_content' || config.check === 'visual_content') {
        if (Array.isArray(config.forbidden_patterns)) {
          const patterns = config.forbidden_patterns as string[];
          for (const shot of shots) {
            const shotIndex = Number(shot.shot_index);
            if (Number.isNaN(shotIndex)) {
              continue;
            }
            if (shot.voiceover_text) {
              for (const pattern of patterns) {
                if (String(shot.voiceover_text).includes(pattern)) {
                  violations.push({
                    shot_index: shotIndex,
                    violated_word: pattern,
                    reason: `违禁词: ${pattern}`,
                  });
                }
              }
            }
            if (shot.subtitle_text) {
              for (const pattern of patterns) {
                if (String(shot.subtitle_text).includes(pattern)) {
                  violations.push({
                    shot_index: shotIndex,
                    violated_word: pattern,
                    reason: `违禁词: ${pattern}`,
                  });
                }
              }
            }
          }
        }
      }
    }

    return { passed: violations.length === 0, violations };
  }

  checkSingleShot(
    shot: Record<string, unknown>,
    shotIndex: number,
  ): ComplianceResult {
    const violations: ComplianceViolation[] = [];

    const allRules = [
      ...SCRIPT_CONSTANTS.ABSOLUTE_TERMS,
      ...SCRIPT_CONSTANTS.PROHIBITED_PROMOTIONS,
    ];

    const combinedText = `${shot.voiceover_text || ''} ${shot.subtitle_text || ''}`;

    for (const rule of allRules) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(combinedText);
      if (match) {
        violations.push({
          shot_index: shotIndex,
          violated_word: match[0],
          reason: rule.reason,
        });
      }
    }

    // NLP 语境合规检查
    const nlpViolations = this.nlpChecker.check(combinedText);
    for (const v of nlpViolations) {
      violations.push({
        shot_index: shotIndex,
        violated_word: v.word,
        reason: v.reason,
      });
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * 深度检查 - 包括场景描述
   */
  checkWithSceneDescription(
    shots: Array<{ voiceover_text?: string; subtitle_text?: string; scene_description_query?: string }>,
  ): ComplianceResult {
    const violations: ComplianceViolation[] = [];

    const allRules = [
      ...SCRIPT_CONSTANTS.ABSOLUTE_TERMS,
      ...SCRIPT_CONSTANTS.PROHIBITED_PROMOTIONS,
    ];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const shotIndex = i;

      // 检查口播文案
      if (shot.voiceover_text) {
        for (const rule of allRules) {
          rule.pattern.lastIndex = 0;
          const match = rule.pattern.exec(shot.voiceover_text);
          if (match) {
            violations.push({
              shot_index: shotIndex,
              violated_word: match[0],
              reason: rule.reason,
            });
          }
        }
        const nlpViolations = this.nlpChecker.check(shot.voiceover_text);
        for (const v of nlpViolations) {
          violations.push({
            shot_index: shotIndex,
            violated_word: v.word,
            reason: `[口播] ${v.reason}`,
          });
        }
      }

      // 检查字幕
      if (shot.subtitle_text) {
        for (const rule of allRules) {
          rule.pattern.lastIndex = 0;
          const match = rule.pattern.exec(shot.subtitle_text);
          if (match) {
            violations.push({
              shot_index: shotIndex,
              violated_word: match[0],
              reason: rule.reason,
            });
          }
        }
        const nlpViolations = this.nlpChecker.check(shot.subtitle_text);
        for (const v of nlpViolations) {
          violations.push({
            shot_index: shotIndex,
            violated_word: v.word,
            reason: `[字幕] ${v.reason}`,
          });
        }
      }

      // 检查场景描述
      if (shot.scene_description_query) {
        for (const rule of allRules) {
          rule.pattern.lastIndex = 0;
          const match = rule.pattern.exec(shot.scene_description_query);
          if (match) {
            violations.push({
              shot_index: shotIndex,
              violated_word: match[0],
              reason: rule.reason,
            });
          }
        }
        const nlpViolations = this.nlpChecker.check(shot.scene_description_query);
        for (const v of nlpViolations) {
          violations.push({
            shot_index: shotIndex,
            violated_word: v.word,
            reason: `[场景] ${v.reason}`,
          });
        }
      }
    }

    return { passed: violations.length === 0, violations };
  }

  isViolationWord(word: string): boolean {
    const allRules = [
      ...SCRIPT_CONSTANTS.ABSOLUTE_TERMS,
      ...SCRIPT_CONSTANTS.PROHIBITED_PROMOTIONS,
    ];

    for (const rule of allRules) {
      if (word.match(rule.pattern)) {
        return true;
      }
    }

    // NLP 检查
    const nlpViolations = this.nlpChecker.check(word);
    return nlpViolations.length > 0;
  }

  /**
   * 增强版 check — 支持 AI 语义二审
   */
  async checkWithOptions(
    shots: Array<Record<string, unknown>>,
    options: ComplianceCheckOptions = {},
  ): Promise<ComplianceResult> {
    const baseResult = this.check(shots);

    if (!options.enableAiReview || !options.aiTextGenerator || baseResult.violations.length === 0) {
      return baseResult;
    }

    // 构建 AI 二审候选
    const candidates: AiReviewCandidate[] = baseResult.violations.map((v) => {
      const shot = shots.find((s) => Number(s.shot_index) === v.shot_index);
      const voiceover = (shot?.voiceover_text as string) ?? '';
      const subtitle = (shot?.subtitle_text as string) ?? '';
      const combinedText = `${voiceover} ${subtitle}`.trim();

      // 推断规则类别
      let ruleCategory: AiReviewCandidate['rule_category'] = 'ABSOLUTE_TERMS';
      if (v.reason.includes('促销') || v.reason.includes('CTA') || v.reason.includes('紧迫感')) {
        ruleCategory = 'PROHIBITED_PROMOTIONS';
      } else if (v.reason.includes('风险') || v.reason.includes('组合')) {
        ruleCategory = 'CONTEXTUAL_RISK';
      } else if (v.reason.includes('操控') || v.reason.includes('操弄')) {
        ruleCategory = 'EMOTIONAL_MANIPULATION';
      } else if (v.reason.includes('虚假') || v.reason.includes('误导') || v.reason.includes('宣传')) {
        ruleCategory = 'FALSE_CLAIMS';
      } else if (v.reason.startsWith('[cultural]') || v.reason.startsWith('[prohibited]') ||
                 v.reason.startsWith('[restricted]') || v.reason.startsWith('[brand]') ||
                 v.reason.startsWith('[competition]')) {
        ruleCategory = 'CULTURAL_SENSITIVITY';
      }

      return {
        shot_index: v.shot_index,
        combined_text: combinedText,
        voiceover_text: voiceover || undefined,
        subtitle_text: subtitle || undefined,
        violated_word: v.violated_word,
        rule_reason: v.reason,
        rule_category: ruleCategory,
      };
    });

    // 调用 LLM 二审
    const systemPrompt = this.aiReviewPromptBuilder.buildSystemPrompt();
    const userPrompt = this.aiReviewPromptBuilder.buildUserPrompt({
      candidates,
      product_category: options.productCategory,
    });

    try {
      const rawResponse = await options.aiTextGenerator(systemPrompt, userPrompt);
      const aiResults = this.aiReviewPromptBuilder.parseResult(rawResponse);

      // 将 AI 结果合并到 violations 中，并重新计算 passed
      const updatedViolations = baseResult.violations.map((v) => {
        const aiResult = aiResults.find((ar) => ar.shot_index === v.shot_index);
        if (aiResult) {
          return {
            ...v,
            ai_verdict: aiResult.ai_verdict,
            ai_reason: aiResult.ai_reason,
            severity: aiResult.severity,
            suggestion: aiResult.suggestion,
          };
        }
        return v;
      });

      // FALSE_POSITIVE 视为放行
      const blockedViolations = updatedViolations.filter(
        (v) => !v.ai_verdict || v.ai_verdict !== 'FALSE_POSITIVE',
      );

      return {
        passed: blockedViolations.length === 0,
        violations: updatedViolations,
        ai_review_result: aiResults,
      };
    } catch (err) {
      this.logger.error('AI 二审失败，回退到基础合规结果', err instanceof Error ? err.message : String(err));
      return baseResult;
    }
  }

  /**
   * 对已保存剧本执行 AI 合规审查（事后审查）
   */
  async reviewScript(
    shots: Array<Record<string, unknown>>,
    aiTextGenerator: (systemPrompt: string, userPrompt: string) => Promise<string>,
    productCategory?: string,
  ): Promise<AiReviewBatchResult[]> {
    // 先收集所有疑似违规项
    const baseViolations: Array<{
      shot_index: number;
      violated_word: string;
      reason: string;
      rule_category: AiReviewCandidate['rule_category'];
      combined_text: string;
      voiceover_text?: string;
      subtitle_text?: string;
    }> = [];

    const allRules = [
      ...SCRIPT_CONSTANTS.ABSOLUTE_TERMS,
      ...SCRIPT_CONSTANTS.PROHIBITED_PROMOTIONS,
    ];

    for (const shot of shots) {
      const shotIndex = Number(shot.shot_index);
      const voiceover = (shot.voiceover_text as string) ?? '';
      const subtitle = (shot.subtitle_text as string) ?? '';
      const combinedText = `${voiceover} ${subtitle}`.trim();

      for (const rule of allRules) {
        rule.pattern.lastIndex = 0;
        const match = rule.pattern.exec(combinedText);
        if (match) {
          const isPromo = rule.reason.includes('促销') || rule.reason.includes('CTA') || rule.reason.includes('紧迫感');
          const ruleCategory: AiReviewCandidate['rule_category'] = isPromo ? 'PROHIBITED_PROMOTIONS' : 'ABSOLUTE_TERMS';
          baseViolations.push({
            shot_index: shotIndex,
            violated_word: match[0],
            reason: rule.reason,
            rule_category: ruleCategory,
            combined_text: combinedText,
            voiceover_text: voiceover || undefined,
            subtitle_text: subtitle || undefined,
          });
        }
      }

      const nlpViolations = this.nlpChecker.check(combinedText);
      for (const v of nlpViolations) {
        let ruleCategory: AiReviewCandidate['rule_category'] = 'CONTEXTUAL_RISK';
        if (v.reason.includes('操纵')) ruleCategory = 'EMOTIONAL_MANIPULATION';
        else if (v.reason.includes('宣传')) ruleCategory = 'FALSE_CLAIMS';
        baseViolations.push({
          shot_index: shotIndex,
          violated_word: v.word,
          reason: v.reason,
          rule_category: ruleCategory,
          combined_text: combinedText,
          voiceover_text: voiceover || undefined,
          subtitle_text: subtitle || undefined,
        });
      }
    }

    if (baseViolations.length === 0) {
      return [];
    }

    const candidates: AiReviewCandidate[] = baseViolations.map((v) => ({
      shot_index: v.shot_index,
      combined_text: v.combined_text,
      voiceover_text: v.voiceover_text,
      subtitle_text: v.subtitle_text,
      violated_word: v.violated_word,
      rule_reason: v.reason,
      rule_category: v.rule_category,
    }));

    const systemPrompt = this.aiReviewPromptBuilder.buildSystemPrompt();
    const userPrompt = this.aiReviewPromptBuilder.buildUserPrompt({
      candidates,
      product_category: productCategory,
    });

    try {
      const rawResponse = await aiTextGenerator(systemPrompt, userPrompt);
      return this.aiReviewPromptBuilder.parseResult(rawResponse);
    } catch {
      return [];
    }
  }
}