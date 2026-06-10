/**
 * 视频原创度优化执行器 (Worker 侧)
 * 负责在 FFmpeg 拼接触发优化阶段执行 recolor/respeed 等变换
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

interface OptimizationSuggestion {
  section: number;
  technique: 'reorder' | 'recolor' | 'respeed' | 'revoice' | 'resubtitle';
  params?: Record<string, unknown>;
  expected_impact: number;
  description: string;
}

interface OptimizationDefaults {
  recolor: { contrast: number; saturation: number; brightness: number };
  respeed: { speed_factor: number };
}

const DEFAULT_PARAMS: OptimizationDefaults = {
  recolor: { contrast: 1.05, saturation: 1.1, brightness: 0.02 },
  respeed: { speed_factor: 0.95 },
};

/**
 * 对单段视频应用 recolor 优化（调整色调/对比度/饱和度）
 */
async function applyRecolor(inputPath: string, outputPath: string, params?: Record<string, unknown>): Promise<string> {
  const contrast = (params?.contrast as number) ?? DEFAULT_PARAMS.recolor.contrast;
  const saturation = (params?.saturation as number) ?? DEFAULT_PARAMS.recolor.saturation;
  const brightness = (params?.brightness as number) ?? DEFAULT_PARAMS.recolor.brightness;

  const filterChain = `eq=contrast=${contrast}:saturation=${saturation}:brightness=${brightness}`;

  await execFileAsync('ffmpeg', [
    '-y', '-i', inputPath,
    '-vf', filterChain,
    '-c:a', 'copy',
    outputPath,
  ], { timeout: 120_000 });

  console.log(`[OriginalityOptimizer] Recolor applied: contrast=${contrast}, saturation=${saturation}`);
  return outputPath;
}

/**
 * 对单段视频应用 respeed 优化（微调播放速度）
 */
async function applyRespeed(inputPath: string, outputPath: string, params?: Record<string, unknown>): Promise<string> {
  const speedFactor = (params?.speed_factor as number) ?? DEFAULT_PARAMS.respeed.speed_factor;

  // setpts 控制视频速度，atempo 控制音频速度
  const videoPts = 1 / speedFactor;
  const audioAtempo = speedFactor;

  await execFileAsync('ffmpeg', [
    '-y', '-i', inputPath,
    '-filter_complex', `[0:v]setpts=${videoPts}*PTS[v];[0:a]atempo=${audioAtempo}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-c:a', 'aac',
    '-shortest',
    outputPath,
  ], { timeout: 120_000 });

  console.log(`[OriginalityOptimizer] Respeed applied: factor=${speedFactor}`);
  return outputPath;
}

/**
 * 生成优化后的视频临时文件路径
 */
function tempOutputPath(technique: string): string {
  return join(tmpdir(), `optimized_${randomUUID()}_${technique}.mp4`);
}

/**
 * 对视频应用逐分镜优化建议
 * 注意：reorder 需要重新拼接（在调用方处理），此处仅处理单段视频的变换
 */
export async function applyOriginalityOptimizations(
  videoPath: string,
  suggestions: OptimizationSuggestion[],
): Promise<{
  optimizedPath: string;
  appliedCount: number;
  failedSuggestions: OptimizationSuggestion[];
}> {
  let currentPath = videoPath;
  let appliedCount = 0;
  const failedSuggestions: OptimizationSuggestion[] = [];

  for (const suggestion of suggestions) {
    try {
      const outputPath = tempOutputPath(suggestion.technique);

      switch (suggestion.technique) {
        case 'recolor':
          currentPath = await applyRecolor(currentPath, outputPath, suggestion.params);
          appliedCount++;
          break;
        case 'respeed':
          currentPath = await applyRespeed(currentPath, outputPath, suggestion.params);
          appliedCount++;
          break;
        case 'revoice':
          // revoice 需要 TTS 重新生成 + 重新拼接，在 Worker 主流程中处理
          console.log(`[OriginalityOptimizer] Revoice: delegated to TTS re-generation pipeline (${suggestion.description})`);
          appliedCount++;
          break;
        case 'resubtitle':
          // resubtitle 需要 ASS 重新生成 + 重新拼接，在 Worker 主流程中处理
          console.log(`[OriginalityOptimizer] Resubtitle: delegated to subtitle re-generation pipeline (${suggestion.description})`);
          appliedCount++;
          break;
        case 'reorder':
          // reorder 需要重新排序分镜 + 重新拼接，在 Worker 主流程中处理
          console.log(`[OriginalityOptimizer] Reorder: delegated to shot re-ordering pipeline (${suggestion.description})`);
          appliedCount++;
          break;
        default:
          failedSuggestions.push(suggestion);
      }
    } catch (error) {
      console.error(
        `[OriginalityOptimizer] Failed to apply '${suggestion.technique}' for section ${suggestion.section}: ${(error as Error).message}`,
      );
      failedSuggestions.push(suggestion);
    }
  }

  console.log(
    `[OriginalityOptimizer] Optimization complete: ${appliedCount} applied, ${failedSuggestions.length} failed`,
  );

  return { optimizedPath: currentPath, appliedCount, failedSuggestions };
}

export { OptimizationSuggestion };
