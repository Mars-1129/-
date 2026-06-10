// =============================================================================
// TikStream AI — Subtitle Translation Service
// =============================================================================

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@nestjs/prisma';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { serviceException } from '../common/service-exception';
import { SUBTITLE_CONSTANTS } from './subtitle.constants';

interface CulturalNote {
  region: string;
  original: string;
  adapted_text: string;
  reason: string;
}

interface ShotSubtitleEntry {
  shotIndex: number;
  sourceText: string;
}

@Injectable()
export class SubtitleTranslationService {
  private readonly logger = new Logger(SubtitleTranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly doubaoText: DoubaoTextProvider,
  ) {}

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 翻译整个剧本的所有分镜字幕到指定目标语种
   */
  async translateScript(
    scriptId: string,
    targetLangs?: string[],
  ): Promise<{ task_id: string; translated_count: number }> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId, deletedAt: null },
      include: { shots: { where: { deletedAt: null }, orderBy: { shotIndex: 'asc' } } },
    });

    if (!script) {
      throw new HttpException(
        { message: SUBTITLE_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND, error: { code: 'SCRIPT_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    const resolvedTargets = targetLangs?.length
      ? SUBTITLE_CONSTANTS.TARGET_LANGUAGES.filter(t => targetLangs.includes(t.code))
      : SUBTITLE_CONSTANTS.TARGET_LANGUAGES;

    // 收集需要翻译的字幕文本（过滤空/纯英文纯数字）
    const entries: ShotSubtitleEntry[] = [];
    for (const shot of script.shots) {
      const text = (shot.subtitleText || '').trim();
      if (text && this.needsTranslation(text)) {
        entries.push({ shotIndex: shot.shotIndex, sourceText: text });
      }
    }

    if (entries.length === 0) {
      this.logger.debug(`No translatable subtitles found in script ${scriptId}`);
      return { task_id: '', translated_count: 0 };
    }

    const taskId = `tl_${scriptId.slice(0, 8)}_${Date.now()}`;
    this.logger.log(`Starting translation for script ${scriptId}: ${entries.length} shots × ${resolvedTargets.length} languages`);

    let translated = 0;

    // 步骤一：文化分析（仅当至少一个市场有规则）
    const culturalNotes = await this.analyzeCulturalContext(entries, resolvedTargets);

    // 步骤二：并发批量翻译
    const promises = entries.flatMap((entry) =>
      resolvedTargets.map(async ({ code, name }) => {
        try {
          const saved = await this.translateSingle(
            scriptId,
            entry.shotIndex,
            entry.sourceText,
            code,
            name,
            culturalNotes.filter(n => n.region === code),
          );
          if (saved) translated++;
        } catch (error) {
          this.logger.warn(
            `Translation failed for script=${scriptId} shot=${entry.shotIndex} lang=${code}: ${(error as Error).message}`,
          );
        }
      }),
    );

    // 并发控制
    await this.runWithConcurrency(promises, SUBTITLE_CONSTANTS.MAX_CONCURRENT_TRANSLATIONS);

    this.logger.log(`Translation completed: ${translated} entries for script ${scriptId}`);
    return { task_id: taskId, translated_count: translated };
  }

  /**
   * 翻译单个分镜
   */
  async translateShot(
    scriptId: string,
    shotIndex: number,
    targetLangs?: string[],
  ): Promise<{ translated_count: number }> {
    const shot = await this.prisma.scriptShot.findFirst({
      where: { scriptId, shotIndex, deletedAt: null },
    });

    if (!shot) {
      throw new HttpException(
        { message: '分镜不存在', error: { code: 'SHOT_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    const text = (shot.subtitleText || '').trim();
    if (!text || !this.needsTranslation(text)) {
      return { translated_count: 0 };
    }

    const resolvedTargets = targetLangs?.length
      ? SUBTITLE_CONSTANTS.TARGET_LANGUAGES.filter(t => targetLangs.includes(t.code))
      : SUBTITLE_CONSTANTS.TARGET_LANGUAGES;

    let translated = 0;
    const culturalNotes = await this.analyzeCulturalContext(
      [{ shotIndex, sourceText: text }],
      resolvedTargets,
    );

    const promises = resolvedTargets.map(async ({ code, name }) => {
      try {
        const saved = await this.translateSingle(
          scriptId, shotIndex, text, code, name,
          culturalNotes.filter(n => n.region === code),
        );
        if (saved) translated++;
      } catch (error) {
        this.logger.warn(
          `Shot translation failed: script=${scriptId} shot=${shotIndex} lang=${code}: ${(error as Error).message}`,
        );
      }
    });

    await this.runWithConcurrency(promises, SUBTITLE_CONSTANTS.MAX_CONCURRENT_TRANSLATIONS);
    return { translated_count: translated };
  }

  /**
   * 获取剧本的所有翻译
   */
  async getTranslations(scriptId: string): Promise<{
    script_id: string;
    shots: Array<Record<string, unknown>>;
  }> {
    const rows = await this.prisma.subtitleTranslation.findMany({
      where: { scriptId },
      orderBy: [{ shotIndex: 'asc' }, { targetLang: 'asc' }],
    });

    // 按分镜分组
    const shotMap = new Map<number, Record<string, unknown>>();
    for (const r of rows) {
      if (!shotMap.has(r.shotIndex)) {
        shotMap.set(r.shotIndex, {
          shot_index: r.shotIndex,
          source_text: r.sourceText,
          source_lang: r.sourceLang,
          translations: {} as Record<string, string>,
          cultural_notes: [] as CulturalNote[],
        });
      }
      const shot = shotMap.get(r.shotIndex)!;
      (shot.translations as Record<string, string>)[r.targetLang] = r.translatedText;
      if (r.culturalNotes) {
        (shot.cultural_notes as CulturalNote[]).push(
          ...(r.culturalNotes as unknown as CulturalNote[]),
        );
      }
    }

    return {
      script_id: scriptId,
      shots: Array.from(shotMap.values()),
    };
  }

  /**
   * 导出字幕文件 (SRT / VTT / ASS)
   */
  async buildSubtitleFile(
    scriptId: string,
    targetLang: string,
    format: 'srt' | 'vtt' | 'ass',
  ): Promise<string> {
    const rows = await this.prisma.subtitleTranslation.findMany({
      where: { scriptId, targetLang },
      orderBy: { shotIndex: 'asc' },
    });

    if (rows.length === 0) {
      throw new HttpException(
        { message: `No translations found for ${targetLang}`, error: { code: 'TRANSLATION_NOT_FOUND', retryable: false } },
        HttpStatus.NOT_FOUND,
      );
    }

    // 需要脚本分镜时长来计算结束时间
    const shots = await this.prisma.scriptShot.findMany({
      where: { scriptId, deletedAt: null },
      orderBy: { shotIndex: 'asc' },
      select: { shotIndex: true, duration: true },
    });

    switch (format) {
      case 'srt': return this.buildSRT(rows, shots as Array<{ shotIndex: number; duration: { toNumber: () => number } }>);
      case 'vtt': return this.buildVTT(rows, shots as Array<{ shotIndex: number; duration: { toNumber: () => number } }>);
      case 'ass': return this.buildASS(rows, shots as Array<{ shotIndex: number; duration: { toNumber: () => number } }>);
      default: throw new HttpException({ message: 'Unsupported format' }, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 使剧本翻译失效（字幕变更后调用）
   */
  async invalidateTranslations(scriptId: string): Promise<{ deleted_count: number }> {
    const result = await this.prisma.subtitleTranslation.deleteMany({
      where: { scriptId },
    });
    return { deleted_count: result.count };
  }

  /**
   * 批量获取翻译（供 Creation Service 使用，DB 优先）
   */
  async getTranslationsForCreation(
    scriptId: string,
    targetLang: string,
  ): Promise<Map<number, string>> {
    const rows = await this.prisma.subtitleTranslation.findMany({
      where: { scriptId, targetLang },
      select: { shotIndex: true, translatedText: true },
    });
    return new Map(rows.map(r => [r.shotIndex, r.translatedText]));
  }

  // ===========================================================================
  // Internal: Translation Pipeline
  // ===========================================================================

  private async translateSingle(
    scriptId: string,
    shotIndex: number,
    sourceText: string,
    targetLang: string,
    langName: string,
    culturalNotes: CulturalNote[],
    retryCount = 0,
  ): Promise<boolean> {
    const culturalRules = SUBTITLE_CONSTANTS.CULTURAL_RULES[targetLang] || '';
    const systemPrompt = SUBTITLE_CONSTANTS.TRANSLATION_SYSTEM_PROMPT(langName, targetLang, culturalRules);

    let translated: string | undefined;
    try {
      translated = await this.doubaoText.generateText(systemPrompt, sourceText);
    } catch (error) {
      this.logger.error(`Doubao translation error (${targetLang}): ${(error as Error).message}`);
      if (retryCount < SUBTITLE_CONSTANTS.MAX_TRANSLATION_RETRIES) {
        return this.translateSingle(scriptId, shotIndex, sourceText, targetLang, langName, culturalNotes, retryCount + 1);
      }
      return false;
    }

    if (!translated || translated.trim().length < SUBTITLE_CONSTANTS.QUALITY_CHECK.MIN_TRANSLATION_LENGTH) {
      if (retryCount < SUBTITLE_CONSTANTS.MAX_TRANSLATION_RETRIES) {
        this.logger.warn(`Empty translation for ${targetLang}, retrying...`);
        return this.translateSingle(scriptId, shotIndex, sourceText, targetLang, langName, culturalNotes, retryCount + 1);
      }
      this.logger.error(`Translation to ${targetLang} returned empty after all retries`);
      return false;
    }

    // 质量回检：中文字符占比过高（>30%）说明翻译未完成，个别中文品牌名/人名属正常现象
    const chineseChars = translated.match(SUBTITLE_CONSTANTS.QUALITY_CHECK.CHINESE_RESIDUAL_PATTERN);
    if (chineseChars) {
      const ratio = chineseChars.length / translated.length;
      if (ratio > SUBTITLE_CONSTANTS.QUALITY_CHECK.MAX_CHINESE_RESIDUAL_RATIO) {
        this.logger.warn(
          `Translation for ${targetLang} contains ${(ratio * 100).toFixed(1)}% Chinese characters, retrying...`,
        );
        if (retryCount < SUBTITLE_CONSTANTS.MAX_TRANSLATION_RETRIES) {
          return this.translateSingle(scriptId, shotIndex, sourceText, targetLang, langName, culturalNotes, retryCount + 1);
        }
      }
    }

    // 超长检查
    if (translated.length > SUBTITLE_CONSTANTS.QUALITY_CHECK.MAX_SUBTITLE_LENGTH) {
      this.logger.warn(
        `Translated subtitle for ${targetLang} is ${translated.length} chars (limit: ${SUBTITLE_CONSTANTS.QUALITY_CHECK.MAX_SUBTITLE_LENGTH})`,
      );
    }

    // 持久化
    await this.prisma.subtitleTranslation.upsert({
      where: {
        scriptId_shotIndex_targetLang: {
          scriptId,
          shotIndex,
          targetLang,
        },
      },
      create: {
        scriptId,
        shotIndex,
        sourceLang: SUBTITLE_CONSTANTS.DEFAULT_SOURCE_LANG,
        sourceText,
        targetLang,
        translatedText: translated,
        culturalNotes: culturalNotes.length > 0 ? (culturalNotes as unknown as object) : undefined,
      },
      update: {
        sourceText,
        translatedText: translated,
        culturalNotes: culturalNotes.length > 0 ? (culturalNotes as unknown as object) : undefined,
        updatedAt: new Date(),
      },
    });

    return true;
  }

  private async analyzeCulturalContext(
    entries: ShotSubtitleEntry[],
    targets: ReadonlyArray<{ code: string; name: string; region: string }>,
  ): Promise<CulturalNote[]> {
    // 仅对前 5 条字幕做文化分析（节省 Token）
    const sampleTexts = entries.slice(0, 5).map(e => e.sourceText).join('\n---\n');
    if (!sampleTexts) return [];

    try {
      const result = await this.doubaoText.generateText(
        SUBTITLE_CONSTANTS.CULTURAL_ANALYSIS_SYSTEM_PROMPT,
        `目标市场: ${targets.map(t => `${t.name}(${t.code})`).join(', ')}\n字幕文本:\n${sampleTexts}`,
      );

      if (result) {
        // 尝试解析 JSON
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned) as CulturalNote[];
      }
    } catch (error) {
      this.logger.warn(`Cultural analysis failed (non-blocking): ${(error as Error).message}`);
    }

    return [];
  }

  // ===========================================================================
  // Internal: Subtitle File Builders
  // ===========================================================================

  /**
   * 构建分镜字幕时间轴
   *
   * @param translations - 翻译后的字幕条目
   * @param shots - 分镜时长数组
   * @param asrTimestamps - 可选的 ASR 精确时间戳（start_sec/end_sec）
   *   - 提供时：使用 ASR 精确时间戳
   *   - 不提供时：回退到按分镜时长均摊
   */
  buildShotTimeline(
    translations: Array<{ shotIndex: number; translatedText: string }>,
    shots: Array<{ shotIndex: number; duration: { toNumber: () => number } }>,
    asrTimestamps?: Array<{ shot_index: number; start_sec: number; end_sec: number }>,
  ): Array<{ shotIndex: number; text: string; startSec: number; endSec: number }> {
    // 若提供了 ASR 精确时间戳，直接使用
    if (asrTimestamps && asrTimestamps.length > 0) {
      const asrMap = new Map(asrTimestamps.map((a) => [a.shot_index, a]));
      return translations.map((t) => {
        const asr = asrMap.get(t.shotIndex);
        if (asr) {
          // 确保最小显示时长
          const duration = asr.end_sec - asr.start_sec;
          const endSec = duration < 0.5 ? asr.start_sec + 0.5 : asr.end_sec;
          return {
            shotIndex: t.shotIndex,
            text: t.translatedText,
            startSec: asr.start_sec,
            endSec: endSec,
          };
        }
        // 兜底：使用均摊
        const durMap = new Map(shots.map((s) => [s.shotIndex, s.duration.toNumber()]));
        const elapsed = asrTimestamps.length > 0
          ? Math.max(...asrTimestamps.map((a) => a.end_sec))
          : 0;
        return {
          shotIndex: t.shotIndex,
          text: t.translatedText,
          startSec: elapsed,
          endSec: elapsed + (durMap.get(t.shotIndex) || 3),
        };
      });
    }

    // 兜底：按分镜时长均摊
    return this.buildFallbackTimeline(translations, shots);
  }

  /**
   * 兜底时间轴：按分镜时长均摊
   */
  private buildFallbackTimeline(
    translations: Array<{ shotIndex: number; translatedText: string }>,
    shots: Array<{ shotIndex: number; duration: { toNumber: () => number } }>,
  ): Array<{ shotIndex: number; text: string; startSec: number; endSec: number }> {
    const shotDurationMap = new Map(shots.map(s => [s.shotIndex, s.duration.toNumber()]));
    const entries: Array<{ shotIndex: number; text: string; startSec: number; endSec: number }> = [];

    let elapsed = 0;
    for (const t of translations) {
      const dur = shotDurationMap.get(t.shotIndex) || 3;
      entries.push({
        shotIndex: t.shotIndex,
        text: t.translatedText,
        startSec: elapsed,
        endSec: elapsed + dur,
      });
      elapsed += dur;
    }

    return entries;
  }

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

  private buildSRT(
    translations: Array<{ shotIndex: number; translatedText: string }>,
    shots: Array<{ shotIndex: number; duration: { toNumber: () => number } }>,
  ): string {
    const timeline = this.buildShotTimeline(translations, shots);
    return timeline
      .map((e, i) => `${i + 1}\n${this.toTimestamp(e.startSec)} --> ${this.toTimestamp(e.endSec)}\n${e.text}\n`)
      .join('\n');
  }

  private buildVTT(
    translations: Array<{ shotIndex: number; translatedText: string }>,
    shots: Array<{ shotIndex: number; duration: { toNumber: () => number } }>,
  ): string {
    const timeline = this.buildShotTimeline(translations, shots);
    return 'WEBVTT\n\n' + timeline
      .map((e, i) => `${i + 1}\n${this.toVttTimestamp(e.startSec)} --> ${this.toVttTimestamp(e.endSec)}\n${e.text}\n`)
      .join('\n');
  }

  private buildASS(
    translations: Array<{ shotIndex: number; translatedText: string }>,
    shots: Array<{ shotIndex: number; duration: { toNumber: () => number } }>,
  ): string {
    const timeline = this.buildShotTimeline(translations, shots);
    const header = [
      '[Script Info]',
      'ScriptType: v4.00+',
      'PlayResX: 720',
      'PlayResY: 1280',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&HB8000000,-1,0,0,0,100,100,0,0,1,2,2,2,20,20,80,1',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ].join('\n');

    const events = timeline
      .map(
        (e) =>
          `Dialogue: 0,${this.toVttTimestamp(e.startSec).replace('.', '.')},${this.toVttTimestamp(e.endSec).replace('.', '.')},Default,,0,0,0,,${e.text}`,
      )
      .join('\n');

    return header + '\n' + events;
  }

  // ===========================================================================
  // Internal: Helpers
  // ===========================================================================

  private needsTranslation(text: string): boolean {
    // 纯数字、纯英文（不含中文）跳过翻译
    if (/^[\d\s.,!?%$¥₫฿RpRM]+$/.test(text)) return false;
    if (/^[a-zA-Z\d\s.,!?%$₫฿RpRM]+$/.test(text) && !/[\u4e00-\u9fff]/.test(text)) return false;
    return true;
  }

  private async runWithConcurrency<T>(
    tasks: Promise<T>[],
    concurrency: number,
  ): Promise<(T | undefined)[]> {
    const results: (T | undefined)[] = new Array(tasks.length);
    let index = 0;

    const worker = async (): Promise<void> => {
      while (index < tasks.length) {
        const i = index++;
        try {
          results[i] = await tasks[i];
        } catch {
          results[i] = undefined;
        }
      }
    };

    const pool = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(pool);
    return results;
  }
}
