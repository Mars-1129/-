// =============================================================================
// TikStream AI — Script Validate Timing 自动化测试基座
// 对应功能: POST /api/v1/scripts/:script_id/validate-timing (音节配时校验)
// 对应模块: Script (人员B)
// 测试类型: 单元测试 (契约与核心规则)
// =============================================================================

import { HttpStatus } from '@nestjs/common';

interface ValidateTimingDto {
  shot_index: number;
  voiceover_text: string;
  duration: number;
  language?: string;
}

interface ScriptValidateTimingResponse {
  valid: boolean;
  estimated_duration: number;
  shot_duration: number;
  overflow_words: number;
  suggestion: string;
}

const TIMING = {
  CHINESE_ESTIMATE_RATIO: 0.35,
  ENGLISH_ESTIMATE_RATIO: 0.25,
  MIN_SHOT_DURATION: 1.5,
  MAX_SHOT_DURATION: 5.0,
};

const countChineseCharacters = (text: string): number => {
  return (text.match(/[一-龥]/g) || []).length;
};

const countEnglishWords = (text: string): number => {
  return text
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z]/g, ''))
    .filter(Boolean).length;
};

const countSyllables = (text: string): number => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 0;
  }

  let total = 0;
  for (const word of words) {
    if (word.length <= 3) {
      total += 1;
      continue;
    }

    const vowelGroups = word.match(/[aeiouy]+/g) || [];
    let syllables = vowelGroups.length;
    if (word.endsWith('e') && syllables > 1) {
      syllables -= 1;
    }
    total += Math.max(1, syllables);
  }

  return total;
};

const isEnglishTimingMode = (text: string, language?: string): boolean => {
  if (language) {
    return language.toLowerCase().startsWith('en');
  }

  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const chineseChars = countChineseCharacters(text);
  return englishChars > chineseChars;
};

const estimateVoiceoverDuration = (text: string, language?: string): number => {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  if (isEnglishTimingMode(trimmed, language)) {
    return Math.round(countSyllables(trimmed) * TIMING.ENGLISH_ESTIMATE_RATIO * 100) / 100;
  }

  return Math.round(countChineseCharacters(trimmed) * TIMING.CHINESE_ESTIMATE_RATIO * 100) / 100;
};

const estimateOverflowUnits = (
  text: string,
  estimatedDuration: number,
  shotDuration: number,
  language?: string,
): number => {
  const overflowDuration = Math.max(0, estimatedDuration - shotDuration);
  if (overflowDuration <= 0) {
    return 0;
  }

  if (isEnglishTimingMode(text, language)) {
    return Math.max(1, Math.ceil(overflowDuration / TIMING.ENGLISH_ESTIMATE_RATIO));
  }

  return Math.max(1, Math.ceil(overflowDuration / TIMING.CHINESE_ESTIMATE_RATIO));
};

const validateTiming = (dto: ValidateTimingDto): ScriptValidateTimingResponse => {
  if (!Number.isFinite(dto.shot_index) || dto.shot_index < 1) {
    const err = new Error('shot_index 最小为 1') as Error & { errorCode: string; statusCode: number };
    err.errorCode = 'INVALID_REQUEST';
    err.statusCode = HttpStatus.BAD_REQUEST;
    throw err;
  }

  if (typeof dto.voiceover_text !== 'string') {
    const err = new Error('voiceover_text 必须是字符串') as Error & { errorCode: string; statusCode: number };
    err.errorCode = 'INVALID_REQUEST';
    err.statusCode = HttpStatus.BAD_REQUEST;
    throw err;
  }

  if (!Number.isFinite(dto.duration)) {
    const err = new Error('duration 必须是数字') as Error & { errorCode: string; statusCode: number };
    err.errorCode = 'INVALID_REQUEST';
    err.statusCode = HttpStatus.BAD_REQUEST;
    throw err;
  }

  if (dto.duration < TIMING.MIN_SHOT_DURATION || dto.duration > TIMING.MAX_SHOT_DURATION) {
    const err = new Error('duration 必须在 1.5 到 5.0 秒之间') as Error & { errorCode: string; statusCode: number };
    err.errorCode = 'INVALID_REQUEST';
    err.statusCode = HttpStatus.BAD_REQUEST;
    throw err;
  }

  const estimatedDuration = estimateVoiceoverDuration(dto.voiceover_text, dto.language);
  const valid = estimatedDuration <= dto.duration;
  const overflowWords = valid
    ? 0
    : estimateOverflowUnits(dto.voiceover_text, estimatedDuration, dto.duration, dto.language);
  const unit = isEnglishTimingMode(dto.voiceover_text, dto.language) ? '词' : '字';

  return {
    valid,
    estimated_duration: estimatedDuration,
    shot_duration: dto.duration,
    overflow_words: overflowWords,
    suggestion: valid
      ? 'ok'
      : `请精简 ${overflowWords} ${unit}或提高分镜时长到 ${estimatedDuration.toFixed(1)} 秒以上`,
  };
};

describe('ScriptValidateTiming — 音节配时校验', () => {
  describe('【正常流】单分镜契约返回', () => {
    it('TC-VT-001: 中文台词能塞入分镜时长 → valid=true', () => {
      const result = validateTiming({
        shot_index: 1,
        voiceover_text: '三档智能控温',
        duration: 3.0,
        language: 'zh-CN',
      });

      expect(result).toEqual({
        valid: true,
        estimated_duration: 2.1,
        shot_duration: 3.0,
        overflow_words: 0,
        suggestion: 'ok',
      });
    });

    it('TC-VT-002: 英文台词能塞入分镜时长 → valid=true', () => {
      const result = validateTiming({
        shot_index: 2,
        voiceover_text: 'Fast charge and easy styling',
        duration: 2.5,
        language: 'en-US',
      });

      expect(result.valid).toBe(true);
      expect(result.shot_duration).toBe(2.5);
      expect(result.overflow_words).toBe(0);
      expect(result.suggestion).toBe('ok');
    });
  });

  describe('【失败流】超时返回建议', () => {
    it('TC-VT-003: 中文台词超时 → valid=false 且返回精简建议', () => {
      const result = validateTiming({
        shot_index: 3,
        voiceover_text: '智能控温十分钟快充陶瓷涂层无线设计随地造型',
        duration: 3.0,
        language: 'zh-CN',
      });

      expect(result.valid).toBe(false);
      expect(result.estimated_duration).toBeGreaterThan(3.0);
      expect(result.overflow_words).toBeGreaterThan(0);
      expect(result.suggestion).toContain('请精简');
      expect(result.suggestion).toContain('字');
    });

    it('TC-VT-004: 英文台词超时 → valid=false 且返回精简建议', () => {
      const result = validateTiming({
        shot_index: 4,
        voiceover_text: 'A powerful ceramic curler with portable charging and fast styling for daily travel use',
        duration: 2.0,
        language: 'en-US',
      });

      expect(result.valid).toBe(false);
      expect(result.estimated_duration).toBeGreaterThan(2.0);
      expect(result.overflow_words).toBeGreaterThan(0);
      expect(result.suggestion).toContain('词');
    });
  });

  describe('【边界流】时长边界', () => {
    it('TC-VT-005: 时长下限 1.5 秒允许通过校验', () => {
      const result = validateTiming({
        shot_index: 5,
        voiceover_text: '快充便携',
        duration: 1.5,
        language: 'zh-CN',
      });

      expect(result.shot_duration).toBe(1.5);
      expect(result.valid).toBe(true);
    });

    it('TC-VT-006: 时长上限 5.0 秒允许通过校验', () => {
      const result = validateTiming({
        shot_index: 6,
        voiceover_text: 'Fast charge portable design and smooth styling for everyday life',
        duration: 5.0,
        language: 'en-US',
      });

      expect(result.shot_duration).toBe(5.0);
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('【异常流】请求体必须符合文档 DTO', () => {
    it('TC-VT-007: shot_index 非法 → INVALID_REQUEST', () => {
      expect(() =>
        validateTiming({ shot_index: 0, voiceover_text: '测试', duration: 2.0 }),
      ).toThrow('shot_index 最小为 1');
    });

    it('TC-VT-008: duration 低于 1.5 → INVALID_REQUEST', () => {
      expect(() =>
        validateTiming({ shot_index: 1, voiceover_text: '测试', duration: 1.4 }),
      ).toThrow('duration 必须在 1.5 到 5.0 秒之间');
    });

    it('TC-VT-009: duration 高于 5.0 → INVALID_REQUEST', () => {
      expect(() =>
        validateTiming({ shot_index: 1, voiceover_text: '测试', duration: 5.1 }),
      ).toThrow('duration 必须在 1.5 到 5.0 秒之间');
    });

    it('TC-VT-010: voiceover_text 不是字符串 → INVALID_REQUEST', () => {
      expect(() =>
        validateTiming({ shot_index: 1, voiceover_text: null as never, duration: 2.0 }),
      ).toThrow('voiceover_text 必须是字符串');
    });
  });
});