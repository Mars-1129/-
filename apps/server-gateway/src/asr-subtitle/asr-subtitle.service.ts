// =============================================================================
// TikStream AI — ASR 字幕时间轴服务
// =============================================================================
// 核心功能:
//   1. ASR 转录 (委托 GPU Worker)
//   2. 标点恢复 (委托 punctuation_recovery.py)
//   3. 时间轴对齐 (Smith-Waterman 字符级对齐)
//   4. 字幕文件生成 (SRT/VTT/ASS/JSON)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { ASR_SUBTITLE_CONSTANTS } from './asr-subtitle.constants';
import {
  TranscriptionSegment,
  PunctuatedTranscript,
  AlignedSubtitleEntry,
  AlignTimelineRequest,
  AlignTimelineResponse,
  GenerateSubtitleFileRequest,
  GenerateSubtitleFileResponse,
  SubtitleOutputFormat,
} from './asr-subtitle.types';

@Injectable()
export class AsrSubtitleService {
  private readonly logger = new Logger(AsrSubtitleService.name);

  // =========================================================================
  // 1. 时间轴对齐 (核心算法)
  // =========================================================================

  /**
   * 将脚本字幕文本对齐到 ASR 时间轴
   *
   * 算法: Smith-Waterman 局部序列对齐
   * - 移除脚本和 ASR 文本中的标点/空格
   * - 字符级对齐
   * - 脚本每句字幕映射到 ASR 中对应词的时间戳
   */
  async alignTimeline(request: AlignTimelineRequest): Promise<AlignTimelineResponse> {
    const { script_subtitles, asr_segments, shot_durations } = request;

    if (!script_subtitles.length || !asr_segments.length) {
      return {
        success: false,
        entries: this.fallbackTimeline(script_subtitles, shot_durations || []),
        algorithm: 'fallback-shot-duration',
        average_confidence: 0,
      };
    }

    try {
      // Step 1: 拼接脚本满文 (无标点) 和 ASR 满文 (无标点)
      const { scriptChars, asrChars } = this.normalizeTexts(script_subtitles, asr_segments);

      // Step 2: 字符级对齐
      const alignment = this.smithWatermanAlign(scriptChars, asrChars);

      // Step 3: 将每句脚本字幕映射到 ASR 时间戳
      const entries = this.mapScriptToTimestamps(
        script_subtitles,
        asr_segments,
        alignment,
        scriptChars,
      );

      // Step 4: 计算平均置信度
      const avgConfidence = entries.reduce((sum, e) => sum + (e.alignment_confidence ?? 0), 0)
        / entries.length;

      this.logger.log(
        `[ASR] Aligned ${entries.length} subtitles, avg_confidence=${avgConfidence.toFixed(3)}`,
      );

      return {
        success: true,
        entries,
        algorithm: 'smith-waterman',
        average_confidence: Math.round(avgConfidence * 1000) / 1000,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[ASR] Alignment failed: ${msg}, falling back to shot durations`);
      return {
        success: false,
        entries: this.fallbackTimeline(script_subtitles, shot_durations || []),
        algorithm: 'fallback-error',
        average_confidence: 0,
      };
    }
  }

  // =========================================================================
  // 2. 标点恢复 (纯文本处理)
  // =========================================================================

  /**
   * 对标点恢复后的 ASR 转录做后处理
   * 将标点恢复应用到 segment 列表
   */
  applyPunctuationRecovery(
    asrSegments: TranscriptionSegment[],
    punctuationResult: PunctuatedTranscript,
  ): TranscriptionSegment[] {
    if (!punctuationResult.success || !punctuationResult.segments.length) {
      return asrSegments;
    }

    // 按索引对齐：将标点恢复后的文本映射回原始分段
    const result = asrSegments.map((seg, idx) => {
      const punctuated = punctuationResult.segments[idx];
      if (punctuated) {
        return { ...seg, text: punctuated.text };
      }
      return seg;
    });

    this.logger.log(
      `[ASR] Punctuation applied to ${result.length} segments (method=${punctuationResult.punctuation_method})`,
    );

    return result;
  }

  // =========================================================================
  // 3. 字幕文件生成
  // =========================================================================

  /**
   * 生成标准字幕文件内容
   */
  generateSubtitleFile(request: GenerateSubtitleFileRequest): GenerateSubtitleFileResponse {
    const { entries, format, language } = request;

    let content: string;

    switch (format) {
      case 'srt':
        content = this.buildSRT(entries);
        break;
      case 'vtt':
        content = this.buildVTT(entries, language);
        break;
      case 'ass':
        content = this.buildASS(entries, language);
        break;
      case 'json':
      default:
        content = JSON.stringify(entries.map((e) => ({
          index: e.shot_index,
          start_sec: e.start_sec,
          end_sec: e.end_sec,
          text: e.text,
          language: e.language,
          confidence: e.alignment_confidence,
        })), null, 2);
        break;
    }

    return {
      success: true,
      format,
      content,
      entry_count: entries.length,
    };
  }

  // =========================================================================
  // Private: 文本规范化
  // =========================================================================

  private normalizeTexts(
    scriptSubtitles: Array<{ shot_index: number; text: string }>,
    asrSegments: TranscriptionSegment[],
  ): { scriptChars: string; asrChars: string } {
    // 移除所有标点和空格，统一小写
    const stripPunct = (s: string) =>
      s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

    const scriptChars = scriptSubtitles.map((s) => stripPunct(s.text)).join('');
    const asrChars = asrSegments.map((s) => stripPunct(s.text)).join('');

    return { scriptChars, asrChars };
  }

  // =========================================================================
  // Private: Smith-Waterman 局部序列对齐
  // =========================================================================

  private smithWatermanAlign(seqA: string, seqB: string): Array<[number, number]> {
    const scores = ASR_SUBTITLE_CONSTANTS.ALIGNMENT_SCORES;
    const m = seqA.length;
    const n = seqB.length;

    if (m === 0 || n === 0) return [];

    // 初始化矩阵
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    let maxScore = 0;
    let maxPos: [number, number] = [0, 0];

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const match = seqA[i - 1] === seqB[j - 1] ? scores.match : scores.mismatch;
        dp[i][j] = Math.max(
          0,
          dp[i - 1][j - 1] + match,
          dp[i - 1][j] + scores.gap,
          dp[i][j - 1] + scores.gap,
        );
        if (dp[i][j] > maxScore) {
          maxScore = dp[i][j];
          maxPos = [i, j];
        }
      }
    }

    // 回溯
    const alignment: Array<[number, number]> = [];
    let [i, j] = maxPos;
    while (i > 0 && j > 0 && dp[i][j] > 0) {
      alignment.unshift([i - 1, j - 1]);
      i--;
      j--;
    }

    return alignment;
  }

  // =========================================================================
  // Private: 脚本字幕 → ASR 时间戳映射
  // =========================================================================

  private mapScriptToTimestamps(
    scriptSubtitles: Array<{ shot_index: number; text: string }>,
    asrSegments: TranscriptionSegment[],
    alignment: Array<[number, number]>,
    scriptChars: string,
  ): AlignedSubtitleEntry[] {
    const entries: AlignedSubtitleEntry[] = [];
    let scriptCursor = 0;

    for (const sub of scriptSubtitles) {
      const stripped = sub.text.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
      const startIdx = scriptCursor;
      const endIdx = startIdx + stripped.length;

      // 在 alignment 中查找对应位置
      const matchedPairs = alignment.filter(
        ([a]) => a >= startIdx && a < endIdx,
      );

      let startSec = 0;
      let endSec = 1;
      let confidence = 0;

      if (matchedPairs.length > 0) {
        const asrIndices = matchedPairs.map(([, b]) => b);
        const minAsrIdx = Math.min(...asrIndices);
        const maxAsrIdx = Math.max(...asrIndices);

        // 在 asrSegments 中按字符位置查找时间戳
        let asrCharCursor = 0;
        for (const seg of asrSegments) {
          const segLen = seg.text.replace(/[\s\p{P}\p{S}]/gu, '').length;
          const segEnd = asrCharCursor + segLen;

          if (asrCharCursor <= minAsrIdx && minAsrIdx < segEnd) {
            startSec = seg.start_sec;
          }
          if (asrCharCursor <= maxAsrIdx && maxAsrIdx < segEnd) {
            endSec = seg.end_sec;
          }

          asrCharCursor = segEnd;
        }

        // endSec 最小保证
        if (endSec <= startSec) {
          endSec = startSec + ASR_SUBTITLE_CONSTANTS.MIN_DISPLAY_DURATION;
        }

        confidence = matchedPairs.length / stripped.length;
      }

      // 时间范围修正
      const duration = endSec - startSec;
      if (duration < ASR_SUBTITLE_CONSTANTS.MIN_DISPLAY_DURATION) {
        endSec = startSec + ASR_SUBTITLE_CONSTANTS.MIN_DISPLAY_DURATION;
      }
      if (duration > ASR_SUBTITLE_CONSTANTS.MAX_DISPLAY_DURATION) {
        endSec = startSec + ASR_SUBTITLE_CONSTANTS.MAX_DISPLAY_DURATION;
      }

      entries.push({
        shot_index: sub.shot_index,
        text: sub.text,
        start_sec: Math.round(startSec * 1000) / 1000,
        end_sec: Math.round(endSec * 1000) / 1000,
        alignment_confidence: Math.round(confidence * 1000) / 1000,
      });

      scriptCursor = endIdx;
    }

    return entries;
  }

  // =========================================================================
  // Private: 兜底时间轴 (按分镜时长均摊)
  // =========================================================================

  private fallbackTimeline(
    scriptSubtitles: Array<{ shot_index: number; text: string }>,
    shotDurations: Array<{ shot_index: number; duration: number }>,
  ): AlignedSubtitleEntry[] {
    const durationMap = new Map(shotDurations.map((s) => [s.shot_index, s.duration]));
    const entries: AlignedSubtitleEntry[] = [];
    let elapsed = 0;

    for (const sub of scriptSubtitles) {
      const dur = durationMap.get(sub.shot_index) || 3;
      entries.push({
        shot_index: sub.shot_index,
        text: sub.text,
        start_sec: elapsed,
        end_sec: elapsed + dur,
        alignment_confidence: 0,
      });
      elapsed += dur;
    }

    return entries;
  }

  // =========================================================================
  // Private: 字幕格式生成器
  // =========================================================================

  private toTimestamp(sec: number): string {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    const ms = String(Math.floor((sec % 1) * 1000)).padStart(3, '0');
    return `${h}:${m}:${s},${ms}`;
  }

  private toVttTimestamp(sec: number): string {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    const ms = String(Math.floor((sec % 1) * 1000)).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  private buildSRT(entries: AlignedSubtitleEntry[]): string {
    return entries
      .map(
        (e, i) =>
          `${i + 1}\n${this.toTimestamp(e.start_sec)} --> ${this.toTimestamp(e.end_sec)}\n${e.text}\n`,
      )
      .join('\n');
  }

  private buildVTT(entries: AlignedSubtitleEntry[], language?: string): string {
    const langHeader = language ? `\nLanguage: ${language}` : '';
    const body = entries
      .map(
        (e, i) =>
          `${i + 1}\n${this.toVttTimestamp(e.start_sec)} --> ${this.toVttTimestamp(e.end_sec)}\n${e.text}\n`,
      )
      .join('\n');
    return `WEBVTT${langHeader}\n\n${body}`;
  }

  private buildASS(entries: AlignedSubtitleEntry[], language?: string): string {
    const styles = ASR_SUBTITLE_CONSTANTS.ASS_STYLES;
    const header = [
      '[Script Info]',
      'Title: TikStream AI Subtitle',
      `Language: ${language || 'zh-CN'}`,
      'ScriptType: v4.00+',
      'PlayResX: 1080',
      'PlayResY: 1920',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Alignment, MarginV',
      `Style: Default,${styles.font_name},${styles.font_size},${styles.primary_color},${styles.outline_color},${styles.back_color},${styles.bold},${styles.alignment},${styles.margin_v}`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ].join('\n');

    const events = entries
      .map((e) => {
        const start = this.toTimestamp(e.start_sec).replace(',', '.');
        const end = this.toTimestamp(e.end_sec).replace(',', '.');
        return `Dialogue: 0,${start},${end},Default,,0,0,${styles.margin_v},,${e.text}`;
      })
      .join('\n');

    return `${header}\n${events}`;
  }
}
