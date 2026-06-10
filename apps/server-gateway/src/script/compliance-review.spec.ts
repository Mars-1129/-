// =============================================================================
// TikStream AI — Compliance Review 单元测试
// 覆盖：ComplianceFilter / ComplianceAiReviewPromptBuilder / fullComplianceReview
// =============================================================================

import { ComplianceFilter, ComplianceViolation } from './compliance.filter';
import { ComplianceAiReviewPromptBuilder, AiReviewBatchResult } from '../../services/prompts/compliance-ai-review.prompt';

// =============================================================================
// Mock Data
// =============================================================================

/** 合规的剧本分镜 */
const VALID_SHOT = {
  shot_index: 1,
  voiceover_text: '这款产品采用优质材料制作，手感舒适，性价比很高',
  subtitle_text: '优质材料 | 舒适手感',
};

/** 含绝对化用语的违规分镜 */
const ABSOLUTE_TERM_SHOT = {
  shot_index: 2,
  voiceover_text: '这是全网最好的产品，绝对第一品牌',
  subtitle_text: '全网第一品牌',
};

/** 含促销违规的分镜 */
const PROHIBITED_PROMO_SHOT = {
  shot_index: 3,
  voiceover_text: '点击下方链接，免费送限量礼品',
  subtitle_text: '免费送！限时抢购',
};

/** 含文化敏感词的分镜 */
const CULTURAL_SHOT = {
  shot_index: 4,
  voiceover_text: '这款产品含有猪肉提取物，效果非常好',
};

/** 含品牌词（warning 级）的分镜 — 不应阻断 */
const BRAND_WARNING_SHOT = {
  shot_index: 20,
  voiceover_text: '这款手机壳完美适配iPhone，还兼容AirPods充电，非常适合日常使用',
  subtitle_text: 'iPhone手机壳 | AirPods兼容',
};

/** 含奢侈品牌词（critical 级）的分镜 — 应阻断 */
const BRAND_CRITICAL_SHOT = {
  shot_index: 21,
  voiceover_text: '这个包包采用Gucci同款工艺，LV级别质感，Supreme联名风格',
  subtitle_text: 'Gucci同款 | Supreme风格',
};

/** 多分镜的完整测试剧本 */
const ALL_SHOTS = [
  VALID_SHOT,
  ABSOLUTE_TERM_SHOT,
  PROHIBITED_PROMO_SHOT,
  CULTURAL_SHOT,
  BRAND_WARNING_SHOT,
  BRAND_CRITICAL_SHOT,
];

// =============================================================================
// Mock LLM 返回值
// =============================================================================

function mockAiResponse(verdicts: Array<{ shot_index: number; verdict: string; reason: string; severity: number }>): string {
  return JSON.stringify(verdicts.map((v) => ({
    ...v,
    violation_type: 'ABSOLUTE_TERMS',
    suggestion: `建议将"${v.reason}"改为更合规的表述`,
  })));
}

const MOCK_AI_BLOCK_WARN = mockAiResponse([
  { shot_index: 2, verdict: 'BLOCK', reason: '使用广告法禁止的绝对化用语"全网第一"', severity: 8 },
  { shot_index: 3, verdict: 'WARN', reason: '促销表述"免费送"建议标注活动规则', severity: 3 },
  { shot_index: 5, verdict: 'BLOCK', reason: '明确宣称医疗功效"治愈"，属于虚假宣传', severity: 9 },
]);

// =============================================================================
// 手工构造 ComplianceFilter（绕过 NestJS @InjectPrisma DI）
// =============================================================================

function createFilter(): ComplianceFilter {
  const mockPrisma = {
    constraint: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter = new (ComplianceFilter as any)(mockPrisma);
  return filter;
}

// =============================================================================
// Test Suite: ComplianceFilter (基础规则检查)
// =============================================================================

describe('ComplianceFilter', () => {
  let filter: ComplianceFilter;

  beforeEach(() => {
    filter = createFilter();
  });

  describe('check() — 基础合规检查（正则+NLP+敏感词）', () => {
    it('合规分镜应通过检查', () => {
      const result = filter.check([VALID_SHOT]);
      expect(result.passed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('应检测绝对化用语', () => {
      const result = filter.check([ABSOLUTE_TERM_SHOT]);
      expect(result.passed).toBe(false);
      const violatedWords = result.violations.map((v) => v.violated_word);
      expect(violatedWords.some((w) => w.includes('第一') || w.includes('最好'))).toBe(true);
    });

    it('应检测促销违规', () => {
      const result = filter.check([PROHIBITED_PROMO_SHOT]);
      expect(result.passed).toBe(false);
      const promotedWords = result.violations.map((v) => v.violated_word);
      expect(promotedWords.some((w) => w.includes('免费送') || w.includes('限时抢购'))).toBe(true);
    });

    it('应检测多分镜混合场景', () => {
      const result = filter.check(ALL_SHOTS);
      // VALID_SHOT 通过，其他 4 个至少有违规
      expect(result.violations.length).toBeGreaterThanOrEqual(4);
    });

    it('空分镜列表应直接通过', () => {
      const result = filter.check([]);
      expect(result.passed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('每个违规应有 shot_index / violated_word / reason', () => {
      const result = filter.check([ABSOLUTE_TERM_SHOT]);
      for (const v of result.violations) {
        expect(v).toHaveProperty('shot_index');
        expect(v).toHaveProperty('violated_word');
        expect(v).toHaveProperty('reason');
        expect(typeof v.shot_index).toBe('number');
        expect(typeof v.violated_word).toBe('string');
        expect(v.violated_word.length).toBeGreaterThan(0);
      }
    });

    // ===== 品牌词已全局关闭 =====

    it('brand_keywords=false 后 iPhone/AirPods 应通过检查', () => {
      const result = filter.check([BRAND_WARNING_SHOT]);
      expect(result.passed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('brand_keywords=false 后 Gucci/LV/Supreme 也应通过检查', () => {
      const result = filter.check([BRAND_CRITICAL_SHOT]);
      expect(result.passed).toBe(true);
      const brandViolations = result.violations.filter(
        (v) => v.reason.startsWith('[brand]'),
      );
      expect(brandViolations.length).toBe(0);
    });

    it('brand_keywords=false 后品牌词 + 绝对化用语混合时，品牌被跳过但绝对化仍阻断', () => {
      const mixedShot = {
        shot_index: 30,
        voiceover_text: '这款iPhone手机壳是全网最好的产品',
        subtitle_text: 'iPhone手机壳 | 全网第一',
      };
      const result = filter.check([mixedShot]);
      const brandViolations = result.violations.filter(
        (v) => v.reason.startsWith('[brand]'),
      );
      const absoluteViolations = result.violations.filter(
        (v) => v.reason.includes('绝对化'),
      );
      expect(brandViolations.length).toBe(0);
      expect(absoluteViolations.length).toBeGreaterThan(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('checkWithOptions() — AI 语义二审', () => {
    const mockAiGenerator = jest.fn().mockResolvedValue(MOCK_AI_BLOCK_WARN);

    it('不启用 AI 时视为基础检查结果', async () => {
      const result = await filter.checkWithOptions([ABSOLUTE_TERM_SHOT], {
        enableAiReview: false,
      });
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].ai_verdict).toBeUndefined();
    });

    it('启用 AI 时应返回 AI 判定结果', async () => {
      const result = await filter.checkWithOptions(ALL_SHOTS, {
        enableAiReview: true,
        aiTextGenerator: mockAiGenerator,
      });

      const withAi = result.violations.filter((v) => v.ai_verdict);
      expect(withAi.length).toBeGreaterThan(0);
    });

    it('BLOCK 判定不应被过滤', async () => {
      const result = await filter.checkWithOptions(ALL_SHOTS, {
        enableAiReview: true,
        aiTextGenerator: mockAiGenerator,
      });

      const blocks = result.violations.filter((v) => v.ai_verdict === 'BLOCK');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('AI 调用失败应优雅降级为基础结果', async () => {
      const failingGenerator = jest.fn().mockRejectedValue(new Error('API timeout'));
      const result = await filter.checkWithOptions(ALL_SHOTS, {
        enableAiReview: true,
        aiTextGenerator: failingGenerator,
      });

      // 应仍返回基础结果
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('checkSingleShot()', () => {
    it('应检查单分镜', () => {
      const result = filter.checkSingleShot(ABSOLUTE_TERM_SHOT, 2);
      expect(result.passed).toBe(false);
      expect(result.violations[0].shot_index).toBe(2);
    });
  });

  describe('isViolationWord()', () => {
    it('绝对化用语应返回 true', () => {
      expect(filter.isViolationWord('最好')).toBe(true);
    });

    it('普通词应返回 false', () => {
      expect(filter.isViolationWord('舒适')).toBe(false);
    });
  });
});

// =============================================================================
// Test Suite: ComplianceAiReviewPromptBuilder
// =============================================================================

describe('ComplianceAiReviewPromptBuilder', () => {
  let builder: ComplianceAiReviewPromptBuilder;

  beforeEach(() => {
    builder = new ComplianceAiReviewPromptBuilder();
  });

  describe('buildSystemPrompt()', () => {
    it('应返回包含六大审查维度的提示词', () => {
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('广告法合规');
      expect(prompt).toContain('平台政策合规');
      expect(prompt).toContain('文化敏感度审查');
      expect(prompt).toContain('品牌侵权检测');
      expect(prompt).toContain('功效宣称审查');
      expect(prompt).toContain('促销合规审查');
    });

    it('应包含 BLOCK / WARN / FALSE_POSITIVE 判定规则', () => {
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('BLOCK');
      expect(prompt).toContain('WARN');
      expect(prompt).toContain('FALSE_POSITIVE');
    });

    it('应包含输出格式描述', () => {
      const prompt = builder.buildSystemPrompt();
      expect(prompt).toContain('shot_index');
      expect(prompt).toContain('verdict');
      expect(prompt).toContain('severity');
      expect(prompt).toContain('suggestion');
    });
  });

  describe('buildUserPrompt()', () => {
    const candidates = [
      {
        shot_index: 1,
        combined_text: '这是全网最好的产品',
        violated_word: '最好',
        rule_reason: '绝对化用语',
        rule_category: 'ABSOLUTE_TERMS' as const,
      },
      {
        shot_index: 2,
        combined_text: '免费送限量礼品',
        violated_word: '免费送',
        rule_reason: '违规促销',
        rule_category: 'PROHIBITED_PROMOTIONS' as const,
      },
    ];

    it('应生成包含候选人信息的 prompt', () => {
      const prompt = builder.buildUserPrompt({ candidates });
      expect(prompt).toContain('全网最好的产品');
      expect(prompt).toContain('免费送限量礼品');
      expect(prompt).toContain('ABSOLUTE_TERMS');
      expect(prompt).toContain('PROHIBITED_PROMOTIONS');
    });

    it('应包含商品类目信息', () => {
      const prompt = builder.buildUserPrompt({ candidates, product_category: '美妆护肤' });
      expect(prompt).toContain('美妆护肤');
    });

    it('无候选人应返回空字符串', () => {
      const prompt = builder.buildUserPrompt({ candidates: [] });
      expect(prompt).toBe('');
    });
  });

  describe('parseResult()', () => {
    it('应正确解析 LLM JSON 数组响应', () => {
      const rawJson = JSON.stringify([
        { shot_index: 1, verdict: 'BLOCK', reason: '使用绝对化用语', violation_type: 'ABSOLUTE_TERMS', severity: 8, suggestion: '修改为更合规表述' },
        { shot_index: 2, verdict: 'WARN', reason: '促销措辞需谨慎', severity: 3, suggestion: '标注活动规则' },
        { shot_index: 3, verdict: 'FALSE_POSITIVE', reason: '主观感受表述，可放行' },
      ]);
      const results = builder.parseResult(rawJson);
      expect(results.length).toBe(3);
      expect(results[0].ai_verdict).toBe('BLOCK');
      expect(results[1].ai_verdict).toBe('WARN');
      expect(results[2].ai_verdict).toBe('FALSE_POSITIVE');
    });

    it('应容错处理单个对象输入', () => {
      const rawJson = JSON.stringify({
        shot_index: 1,
        verdict: 'BLOCK',
        reason: '违规',
      });
      const results = builder.parseResult(rawJson);
      expect(results.length).toBe(1);
    });

    it('应容错处理带 code block 标记的响应', () => {
      const rawJson = '```json\n[' + JSON.stringify({
        shot_index: 1,
        verdict: 'WARN',
        reason: '注意',
      }) + ']\n```';
      const results = builder.parseResult(rawJson);
      expect(results.length).toBe(1);
      expect(results[0].ai_verdict).toBe('WARN');
    });

    it('应容错处理PASS/OK判定', () => {
      const rawJson = JSON.stringify([
        { shot_index: 1, verdict: 'PASS', reason: '可放行' },
        { shot_index: 2, verdict: 'OK', reason: '没问题' },
      ]);
      const results = builder.parseResult(rawJson);
      expect(results[0].ai_verdict).toBe('FALSE_POSITIVE');
      expect(results[1].ai_verdict).toBe('FALSE_POSITIVE');
    });

    it('无效 JSON 应返回空数组', () => {
      const results = builder.parseResult('这不是有效的 JSON');
      expect(results.length).toBe(0);
    });

    it('未知 verdict 应标记为 INCONCLUSIVE', () => {
      const rawJson = JSON.stringify([
        { shot_index: 1, verdict: 'UNKNOWN_VALUE', reason: '不确定' },
      ]);
      const results = builder.parseResult(rawJson);
      expect(results[0].ai_verdict).toBe('INCONCLUSIVE');
    });

    it('应提取 shot_index / reason / severity / suggestion', () => {
      const rawJson = JSON.stringify([
        {
          shot_index: 5,
          verdict: 'BLOCK',
          reason: '虚假宣传',
          violation_type: 'FALSE_CLAIMS',
          severity: 7,
          suggestion: '删除该表述',
        },
      ]);
      const results = builder.parseResult(rawJson);
      expect(results[0].shot_index).toBe(5);
      expect(results[0].ai_reason).toBe('虚假宣传');
      expect(results[0].severity).toBe(7);
      expect(results[0].suggestion).toBe('删除该表述');
    });
  });
});

// =============================================================================
// Test Suite: 提示词质量验证
// =============================================================================

describe('提示词质量验证', () => {
  let builder: ComplianceAiReviewPromptBuilder;

  beforeEach(() => {
    builder = new ComplianceAiReviewPromptBuilder();
  });

  it('系统提示词应足够详细（> 500字符）', () => {
    const prompt = builder.buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(500);
  });

  it('系统提示词应覆盖东南亚核心市场（印尼/马来/泰国/越南/菲律宾/新加坡）', () => {
    const prompt = builder.buildSystemPrompt();
    expect(prompt).toContain('印尼');
    expect(prompt).toContain('马来');
    expect(prompt).toContain('泰国');
    expect(prompt).toContain('越南');
    expect(prompt).toContain('菲律宾');
    expect(prompt).toContain('新加坡');
  });

  it('用户提示词应限制长度避免超出 token 限制', () => {
    const manyCandidates = Array.from({ length: 50 }, (_, i) => ({
      shot_index: i + 1,
      combined_text: `测试文本内容编号${i + 1}，包含一些可能违规的表述如"最好""第一"`,
      violated_word: '最好',
      rule_reason: '绝对化用语检测',
      rule_category: 'ABSOLUTE_TERMS' as const,
    }));
    const prompt = builder.buildUserPrompt({ candidates: manyCandidates });
    // 50 条候选应该可以被合理截断或控制长度
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt.length).toBeLessThan(100000);
  });
});
