// =============================================================================
// TikStream AI — Sensitivity Checker
// 核心检测引擎：多平台规则扫描 + AI 替换建议
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  RULES_BY_PLATFORM,
  ALL_SENSITIVITY_RULES,
} from './sensitivity.constants';
import type {
  SensitivityCheckConfig,
  SensitivityCheckResult,
  SensitivityIssue,
  ReplacementSuggestion,
  SensitivityRule,
  Platform,
  SensitivityCheckRules,
} from './sensitivity.types';

export interface SensitivityCheckerOptions {
  /** 可选：AI 文本生成器（用于替换建议） */
  aiTextGenerator?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

@Injectable()
export class SensitivityChecker {
  private readonly logger = new Logger(SensitivityChecker.name);

  /**
   * 扫描文本中的敏感词
   *
   * @param text            待检测文本
   * @param config          检测配置
   * @param _options        可选：AI 生成器
   * @returns               检测结果（issues + suggestions + risk_score + approval_status）
   */
  check(
    text: string,
    config: SensitivityCheckConfig,
    _options?: SensitivityCheckerOptions,
  ): SensitivityCheckResult {
    const issues: SensitivityIssue[] = [];

    if (!text || text.trim().length === 0) {
      return {
        issues: [],
        suggestions: [],
        overall_risk_score: 0,
        approval_status: 'approved',
      };
    }

    // 收集每个平台的规则
    const platformRules = this.collectPlatformRules(config.platforms, config.rules);

    // 预转小写，避免每轮循环重复 toLowerCase
    const lowerText = text.toLowerCase();

    // 遍历规则进行匹配
    for (const rule of platformRules) {
      let pos = 0;
      const lowerPattern = rule.pattern.toLowerCase();

      // 查找所有匹配位置
      while ((pos = lowerText.indexOf(lowerPattern, pos)) !== -1) {
        issues.push({
          type: rule.ruleType as SensitivityIssue['type'],
          word: text.slice(pos, pos + lowerPattern.length),
          position: pos,
          severity: rule.severity,
          platform_impact: this.buildPlatformImpact(rule as SensitivityRule, config.platforms),
          reason: rule.reason,
        });
        pos += 1; // 继续搜索下一个匹配
      }
    }

    // 生成替换建议
    const suggestions = this.buildSuggestions(
      text,
      issues,
      platformRules,
      config,
    );

    // 计算风险评分
    const riskScore = this.calculateRiskScore(issues);

    // 判定审批状态
    const approvalStatus = this.determineApprovalStatus(issues, config);

    return {
      issues,
      suggestions,
      overall_risk_score: riskScore,
      approval_status: approvalStatus,
    };
  }

  /**
   * 调用 AI 生成替换建议
   *
   * @param text              包含敏感词的文本
   * @param issues            检测到的敏感词列表
   * @param aiTextGenerator   LLM 文本生成器
   * @returns                 增强的替换建议（含 AI 生成项）
   */
  async suggestWithAI(
    text: string,
    issues: SensitivityIssue[],
    aiTextGenerator: (systemPrompt: string, userPrompt: string) => Promise<string>,
  ): Promise<ReplacementSuggestion[]> {
    if (issues.length === 0 || !aiTextGenerator) return [];

    const systemPrompt = this.buildAiSuggestionSystemPrompt();
    const issueWords = issues.map((i) => i.word).filter((w, idx, arr) => arr.indexOf(w) === idx);
    const userPrompt = `原文案：\n${text}\n\n需要替换的敏感词：${issueWords.join('、')}\n\n请为每个敏感词提供 1-2 个在上下文中自然且无风险的替换方案。如果没有合适的替换方案，请返回空字符串。格式为 JSON 数组：[{"original": "敏感词", "alternatives": ["替代1", "替代2"]}]`;

    try {
      const raw = await aiTextGenerator(systemPrompt, userPrompt);
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: { original: string; alternatives: string[] }) => ({
        original: item.original,
        alternatives: item.alternatives || [],
        ai_generated: item.alternatives?.join(' / '),
      }));
    } catch (err) {
      this.logger.warn(`AI 替换建议生成失败: ${(err as Error)?.message}`);
      return [];
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /** 按平台和规则类型筛选规则 */
  private collectPlatformRules(
    platforms: Platform[],
    rules: SensitivityCheckRules,
  ): Array<SensitivityRule & { ruleType: string }> {
    const ruleSet = new Set<SensitivityRule & { ruleType: string }>();

    for (const platform of platforms) {
      const platformRules = RULES_BY_PLATFORM[platform] || [];
      for (const rule of platformRules) {
        // 按规则开关过滤
        const ruleType = rule.ruleType;
        if (
          (ruleType === 'prohibited' && rules.prohibited_words) ||
          (ruleType === 'restricted' && rules.restricted_words) ||
          (ruleType === 'brand' && rules.brand_keywords) ||
          (ruleType === 'competition' && rules.competition_keywords) ||
          (ruleType === 'cultural' && rules.cultural_sensitivity)
        ) {
          ruleSet.add(rule);
        }
      }
    }

    return Array.from(ruleSet);
  }

  /** 构建平台影响映射 */
  private buildPlatformImpact(
    rule: SensitivityRule,
    targetPlatforms: Platform[],
  ): Record<string, boolean> {
    const impact: Record<string, boolean> = {};
    for (const p of targetPlatforms) {
      impact[p] = !rule.platforms || rule.platforms.includes(p);
    }
    return impact;
  }

  /** 从检测 issue 构建替换建议（基于预设 alternatives） */
  private buildSuggestions(
    _text: string,
    issues: SensitivityIssue[],
    platformRules: Array<SensitivityRule & { ruleType: string }>,
    _config: SensitivityCheckConfig,
  ): ReplacementSuggestion[] {
    const deduped = new Map<string, ReplacementSuggestion>();

    for (const issue of issues) {
      if (deduped.has(issue.word)) continue;

      // 查找对应规则获取预设替换词
      const matchedRule = platformRules.find(
        (r) => r.pattern.toLowerCase() === issue.word.toLowerCase(),
      );

      deduped.set(issue.word, {
        original: issue.word,
        alternatives: matchedRule?.alternatives || [],
      });
    }

    return Array.from(deduped.values());
  }

  /** 计算风险评分 (0-100) */
  private calculateRiskScore(issues: SensitivityIssue[]): number {
    if (issues.length === 0) return 0;

    let score = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score += 20;
          break;
        case 'warning':
          score += 10;
          break;
        case 'info':
          score += 3;
          break;
      }
    }

    return Math.min(score, 100);
  }

  /** 判定审批状态 */
  private determineApprovalStatus(
    issues: SensitivityIssue[],
    config: SensitivityCheckConfig,
  ): 'approved' | 'needs_review' | 'rejected' {
    if (issues.length === 0) return 'approved';

    const hasCritical = issues.some((i) => i.severity === 'critical');
    const hasWarning = issues.some((i) => i.severity === 'warning');

    if (hasCritical) {
      return config.handling.human_review ? 'needs_review' : 'rejected';
    }

    if (hasWarning && config.handling.human_review) {
      return 'needs_review';
    }

    return 'approved';
  }

  /** 构建 AI 替换建议的 System Prompt */
  private buildAiSuggestionSystemPrompt(): string {
    return `你是一位专业的跨境电商文案优化师，精通 TikTok、Shopee、Lazada、Instagram、YouTube 等平台的广告政策和社区准则。

你的任务是：为文案中出现的敏感词提供安全、自然、高转化的替换方案。

## 替换原则
1. 保持原意：替换后语义不变，核心卖点不丢失
2. 自然流畅：替换词融入上下文中无突兀感
3. 合规优先：替换方案必须符合平台广告政策
4. 高转化：优先选用带货视频中高转化的表达方式
5. 文化适配：针对东南亚市场，避免宗教/文化禁忌

## 输出格式
严格按照 JSON 数组返回，每个元素包含：
- original: 原文中的敏感词
- alternatives: 字符串数组，1-2 个替换方案
如果没有合适的替换方案，alternatives 为空数组 []`;
  }
}
