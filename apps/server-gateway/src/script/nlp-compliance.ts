/**
 * NLP 级语境合规检查器
 * 实现简单的词级语境分析，检测风险词组合
 */

export interface ComplianceViolation {
  word: string;
  reason: string;
  position?: number;
  context?: string;
}

/**
 * 语境敏感词规则
 */
interface ContextualRiskRule {
  /** 基础词 */
  baseWord: string;
  /** 风险组合词列表 */
  riskyCombinations: Array<{
    word: string;
    reason: string;
  }>;
}

/**
 * 合规规则定义
 */
export const COMPLIANCE_RULES = {
  /**
   * 绝对化用语
   */
  ABSOLUTE_TERMS: [
    { pattern: /最好/g, reason: '绝对化用语"最好"不可用于广告文案' },
    { pattern: /第[一1][名位流]|行业第[一1]|销量第[一1]|全网第[一1]|全球第[一1]/g, reason: '绝对化用语"第一"须有客观数据支撑' },
    { pattern: /全网/g, reason: '绝对化用语"全网"属于夸大宣传' },
    { pattern: /唯一/g, reason: '绝对化用语"唯一"不可使用' },
    { pattern: /顶级/g, reason: '绝对化用语"顶级"不可用于广告文案' },
    { pattern: /最高/g, reason: '绝对化用语"最高"须有客观数据支撑' },
    { pattern: /永久/g, reason: '绝对化用语"永久"不可用于普通消费品' },
    { pattern: /万能/g, reason: '绝对化用语"万能"属于夸大宣传' },
    // 新增：医疗/金融类
    { pattern: /保证.*治愈|保证.*痊愈/g, reason: '医疗效果保证禁止' },
    { pattern: /保证.*收益|稳赚/g, reason: '金融收益保证禁止' },
  ],

  /**
   * 禁止性促销
   */
  PROHIBITED_PROMOTIONS: [
    { pattern: /免费送/g, reason: '禁止性促销表达"免费送"' },
    { pattern: /点击领取/g, reason: '禁止性CTA表达"点击领取"' },
    { pattern: /限时抢购/g, reason: '禁止性紧迫感表达"限时抢购"' },
    { pattern: /马上抢/g, reason: '禁止性紧迫感表达"马上抢"' },
  ],

  /**
   * 语境敏感词（需结合上下文判断）
   */
  CONTEXTUAL_RISK_WORDS: [
    { baseWord: '天然', riskyCombinations: [
      { word: '天然致癌', reason: '天然+负面词"致癌"组合风险' },
      { word: '天然有害', reason: '天然+负面词"有害"组合风险' },
      { word: '天然有毒', reason: '天然+负面词"有毒"组合风险' },
    ]},
    { baseWord: '安全', riskyCombinations: [
      { word: '绝对安全', reason: '"绝对安全"属于绝对化用语' },
      { word: '100%安全', reason: '"100%安全"属于绝对化用语' },
    ]},
    { baseWord: '有效', riskyCombinations: [
      { word: '保证有效', reason: '"保证有效"属于绝对化用语' },
      { word: '100%有效', reason: '"100%有效"属于绝对化用语' },
    ]},
  ],

  /**
   * 情感操纵检测
   */
  EMOTIONAL_MANIPULATION: [
    { pattern: /不.*就会.*后悔/g, reason: '情绪操控文案' },
    { pattern: /错过.*后悔|后悔.*错过/g, reason: '紧迫感操控文案' },
    { pattern: /再不买.*就没了|错过.*就没了/g, reason: '稀缺性操控文案' },
  ],

  /**
   * 虚假宣传检测
   */
  FALSE_CLAIMS: [
    { pattern: /世界.*第|全球.*第/g, reason: '世界/全球第一需谨慎使用' },
    { pattern: /史无前例|前所未有/g, reason: '绝对化表述需谨慎' },
  ],
} as const;

/**
 * NLP 语境合规检查器
 */
export class NlpComplianceChecker {
  /**
   * 检查语境敏感词组合
   */
  checkContextualRisk(text: string): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];

    for (const rule of COMPLIANCE_RULES.CONTEXTUAL_RISK_WORDS) {
      // 每次创建新正则实例，避免 lastIndex 跨调用累积
      const basePattern = new RegExp(rule.baseWord, 'gi');
      let match: RegExpExecArray | null;

      while ((match = basePattern.exec(text)) !== null) {
        const basePosition = match.index;

        // 检查基础词附近是否有关联的风险词
        for (const combo of rule.riskyCombinations) {
          const comboPattern = new RegExp(combo.word, 'i');
          if (comboPattern.test(text)) {
            violations.push({
              word: combo.word,
              reason: combo.reason,
              position: basePosition,
              context: this.extractContext(text, basePosition, 20),
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * 检查情感操纵
   */
  checkEmotionalManipulation(text: string): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];

    for (const rule of COMPLIANCE_RULES.EMOTIONAL_MANIPULATION) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(text);
      if (match) {
        violations.push({
          word: match[0],
          reason: rule.reason,
          position: match.index,
          context: this.extractContext(text, match.index, 20),
        });
      }
    }

    return violations;
  }

  /**
   * 检查虚假宣传
   */
  checkFalseClaims(text: string): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];

    for (const rule of COMPLIANCE_RULES.FALSE_CLAIMS) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(text);
      if (match) {
        violations.push({
          word: match[0],
          reason: rule.reason,
          position: match.index,
          context: this.extractContext(text, match.index, 20),
        });
      }
    }

    return violations;
  }

  /**
   * 提取上下文
   */
  private extractContext(text: string, position: number, radius: number): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    let context = text.slice(start, end);

    if (start > 0) {
      context = '...' + context;
    }
    if (end < text.length) {
      context = context + '...';
    }

    return context;
  }

  /**
   * 执行完整的合规检查
   */
  check(text: string): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];

    // 绝对化用语检查
    for (const rule of COMPLIANCE_RULES.ABSOLUTE_TERMS) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(text);
      if (match) {
        violations.push({
          word: match[0],
          reason: rule.reason,
          position: match.index,
        });
      }
    }

    // 禁止性促销检查
    for (const rule of COMPLIANCE_RULES.PROHIBITED_PROMOTIONS) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(text);
      if (match) {
        violations.push({
          word: match[0],
          reason: rule.reason,
          position: match.index,
        });
      }
    }

    // 语境敏感词检查
    violations.push(...this.checkContextualRisk(text));

    // 情感操纵检查
    violations.push(...this.checkEmotionalManipulation(text));

    // 虚假宣传检查
    violations.push(...this.checkFalseClaims(text));

    return violations;
  }

  /**
   * 检查分镜列表
   */
  checkShots(shots: Array<{ voiceover_text?: string; subtitle_text?: string; scene_description_query?: string }>): ComplianceViolation[] {
    const allViolations: ComplianceViolation[] = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];

      // 检查口播文案
      if (shot.voiceover_text) {
        const voiceoverViolations = this.check(shot.voiceover_text);
        voiceoverViolations.forEach(v => {
          allViolations.push({ ...v, context: `分镜${i + 1}口播: ${v.context || ''}` });
        });
      }

      // 检查字幕
      if (shot.subtitle_text) {
        const subtitleViolations = this.check(shot.subtitle_text);
        subtitleViolations.forEach(v => {
          allViolations.push({ ...v, context: `分镜${i + 1}字幕: ${v.context || ''}` });
        });
      }

      // 检查场景描述
      if (shot.scene_description_query) {
        const descViolations = this.check(shot.scene_description_query);
        descViolations.forEach(v => {
          allViolations.push({ ...v, context: `分镜${i + 1}场景: ${v.context || ''}` });
        });
      }
    }

    return allViolations;
  }
}
