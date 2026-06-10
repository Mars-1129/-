// =============================================================================
// TikStream AI — ASR Subtitle Types (共享类型，跨 Worker / Gateway)
// =============================================================================

/** ASR 引擎模型标识 */
export type ASRModel = 'whisper' | 'paraformer' | 'funasr';

/** 标点恢复方法 */
export type PunctuationMethod = 'rule' | 'ct-punc' | 'auto';

/** 输出字幕格式 */
export type SubtitleOutputFormat = 'srt' | 'vtt' | 'ass' | 'json';

/** ASR 后处理配置 */
export interface ASRPostProcessing {
  /** 标点恢复 */
  punctuation_recovery: boolean;
  /** 标点恢复方法 */
  punctuation_method?: PunctuationMethod;
  /** 大写转换 */
  capitalization: boolean;
  /** 说话人分离 */
  speaker_diarization: boolean;
  /** 去除填充词 */
  disfluency_removal: boolean;
}

/** 输出配置 */
export interface ASROutputConfig {
  format: SubtitleOutputFormat;
  include_timestamps: boolean;
  include_confidence: boolean;
}

/** ASR 完整配置 */
export interface ASRConfig {
  model: ASRModel;
  language: 'auto' | 'zh' | 'en' | 'multi';
  post_processing: ASRPostProcessing;
  output: ASROutputConfig;
}

/** 默认 ASR 配置 */
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  model: 'whisper',
  language: 'auto',
  post_processing: {
    punctuation_recovery: true,
    punctuation_method: 'auto',
    capitalization: true,
    speaker_diarization: false,
    disfluency_removal: false,
  },
  output: {
    format: 'json',
    include_timestamps: true,
    include_confidence: true,
  },
};

/** 词级时间戳 */
export interface WordTimestamp {
  word: string;
  start_sec: number;
  end_sec: number;
  confidence?: number;
}

/** ASR 转录分段 */
export interface TranscriptionSegment {
  start_sec: number;
  end_sec: number;
  text: string;
  language?: string;
  confidence?: number;
  /** 词级时间戳（仅 word_timestamps=True 时返回） */
  word_timestamps?: WordTimestamp[];
}

/** ASR 转录结果 */
export interface TranscriptionResult {
  success: boolean;
  language?: string;
  duration?: number;
  segments: TranscriptionSegment[];
  /** 原始满文（含标点） */
  full_text?: string;
  error?: string;
}

/** 标点恢复后的转录 */
export interface PunctuatedTranscript {
  success: boolean;
  segments: TranscriptionSegment[];
  full_text: string;
  punctuation_method: PunctuationMethod;
}
