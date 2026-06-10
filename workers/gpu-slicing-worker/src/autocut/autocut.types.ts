// ============================================================================
// AutoCut — 语音驱动智能剪辑类型定义
// ============================================================================

export type AutocutJobStatus =
  | 'PENDING'
  | 'TRANSCRIBING'
  | 'READY_FOR_EDIT'
  | 'CUTTING'
  | 'COMPLETED'
  | 'FAILED';

export type AutocutJobType = 'TRANSCRIBE' | 'CUT';

export interface AutocutJobPayload {
  jobType: AutocutJobType;
  jobId: string;
  materialId: string;
  submittedAt: string;
}

export interface TranscriptSegment {
  index: number;
  start_sec: number;
  end_sec: number;
  text: string;
  selected: boolean;
}

export interface SpeechSlicerOutput {
  success: boolean;
  segments: Array<{
    start_sec: number;
    end_sec: number;
    text: string;
    confidence: number;
  }>;
  srt_content: string;
  language: string;
  speech_clip_count: number;
  transcribed_segment_count: number;
  elapsed_sec: number;
  error?: string;
}
