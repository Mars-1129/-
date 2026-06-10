// =============================================================================
// TikStream AI — ASR Subtitle Types (Gateway 层)
// =============================================================================

import type {
  ASRModel,
  PunctuationMethod,
  SubtitleOutputFormat,
  ASRPostProcessing,
  ASROutputConfig,
  ASRConfig,
  DEFAULT_ASR_CONFIG,
  WordTimestamp,
  TranscriptionSegment,
  TranscriptionResult,
  PunctuatedTranscript,
} from '../../../../shared/asr-subtitle-types';

export {
  ASRModel,
  PunctuationMethod,
  SubtitleOutputFormat,
  ASRPostProcessing,
  ASROutputConfig,
  ASRConfig,
  DEFAULT_ASR_CONFIG,
  WordTimestamp,
  TranscriptionSegment,
  TranscriptionResult,
  PunctuatedTranscript,
};

/** 对齐后的字幕条目（精确时间戳） */
export interface AlignedSubtitleEntry {
  /** 分镜索引 */
  shot_index: number;
  /** 字幕文本 */
  text: string;
  /** 精确起始秒 */
  start_sec: number;
  /** 精确结束秒 */
  end_sec: number;
  /** 对齐置信度 */
  alignment_confidence?: number;
  /** 语种 */
  language?: string;
}

/** 时间轴对齐请求 */
export interface AlignTimelineRequest {
  /** 分镜脚本字幕文本列表 */
  script_subtitles: Array<{ shot_index: number; text: string }>;
  /** ASR 转录分段（含精确时间戳） */
  asr_segments: TranscriptionSegment[];
  /** 分镜时长（兜底值） */
  shot_durations?: Array<{ shot_index: number; duration: number }>;
}

/** 时间轴对齐响应 */
export interface AlignTimelineResponse {
  success: boolean;
  entries: AlignedSubtitleEntry[];
  /** 对齐算法 */
  algorithm: string;
  /** 平均对齐置信度 */
  average_confidence: number;
}

/** 字幕文件生成请求 */
export interface GenerateSubtitleFileRequest {
  /** 对齐后的字幕条目 */
  entries: AlignedSubtitleEntry[];
  /** 输出格式 */
  format: SubtitleOutputFormat;
  /** 语种（用于 ASS 头信息） */
  language?: string;
}

/** 字幕文件生成响应 */
export interface GenerateSubtitleFileResponse {
  success: boolean;
  format: SubtitleOutputFormat;
  /** 字幕文件内容 */
  content: string;
  entry_count: number;
}

/** ASR 转录请求 */
export interface AsrTranscribeRequest {
  /** 音频文件路径（WAV, 16kHz, mono） */
  audio_path: string;
  config?: ASRConfig;
}

/** ASR 转录响应 */
export interface AsrTranscribeResponse {
  success: boolean;
  result?: TranscriptionResult;
  punctuated?: PunctuatedTranscript;
  error?: string;
}
