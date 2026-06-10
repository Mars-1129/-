/**
 * FFmpeg Stitch Service 测试脚本
 * 测试视频拼接功能
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runTests() {
  console.log('='.repeat(60));
  console.log('FFmpeg Stitch Service 测试');
  console.log('='.repeat(60));

  const { FfmpegStitchService } = await import('./src/ffmpeg-stitch-service.ts');
  const stitchService = new FfmpegStitchService();

  // 测试健康检查
  console.log('\n[Test 1] FFmpeg 健康检查...');
  const isHealthy = await stitchService.checkHealth();
  console.log(`  - FFmpeg 可用: ${isHealthy}`);

  // 创建测试输出目录
  const testDir = '/tmp/tikstream-stitch-test';
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  // 测试1: 生成测试视频片段
  console.log('\n[Test 2] 生成测试视频片段...');
  const testVideos: string[] = [];

  for (let i = 1; i <= 3; i++) {
    const videoPath = join(testDir, `test_clip_${i}.mp4`);
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', `testsrc2=size=720x1280:rate=30:duration=2`,
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
        videoPath,
      ], { timeout: 30000 });

      const { statSync } = await import('node:fs');
      const stats = statSync(videoPath);
      console.log(`  - 片段 ${i}: ${stats.size} bytes`);

      testVideos.push(videoPath);
    } catch (error) {
      console.log(`  - 片段 ${i} 生成失败: ${(error as Error).message}`);
    }
  }

  if (testVideos.length < 2) {
    console.log('\n  跳过拼接测试（测试视频不足）');
    console.log('\n' + '='.repeat(60));
    console.log('FFmpeg Stitch Service 测试完成');
    console.log('='.repeat(60));
    return;
  }

  // 测试2: 基本视频拼接
  console.log('\n[Test 3] 基本视频拼接 (无音频)...');
  const stitchResult = await stitchService.stitch({
    videoPaths: testVideos,
    subtitles: [
      { start: 0, end: 2, text: '第一个片段' },
      { start: 2, end: 4, text: '第二个片段' },
    ],
    resolution: '720x1280',
    fps: 30,
    enableLoudnorm: false,
  });

  console.log(`  - 成功: ${stitchResult.success}`);
  if (stitchResult.success) {
    console.log(`  - 输出路径: ${stitchResult.outputPath}`);
    console.log(`  - 时长: ${stitchResult.duration}秒`);
    console.log(`  - 文件大小: ${stitchResult.fileSize} bytes`);
  } else {
    console.log(`  - 错误: ${stitchResult.error}`);
  }

  // 测试3: 带音频的视频拼接
  console.log('\n[Test 4] 带音频的视频拼接...');

  // 生成测试音频
  const testAudio = join(testDir, 'test_audio.mp3');
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:sample_rate=44100',
      '-t', '6',
      '-q:a', '7',
      testAudio,
    ], { timeout: 10000 });

    const stitchWithAudio = await stitchService.stitch({
      videoPaths: testVideos,
      voiceoverPaths: [testAudio],
      subtitles: [
        { start: 0, end: 2, text: '第一个片段' },
        { start: 2, end: 4, text: '第二个片段' },
      ],
      resolution: '720x1280',
      enableLoudnorm: true,
    });

    console.log(`  - 成功: ${stitchWithAudio.success}`);
    if (stitchWithAudio.success) {
      console.log(`  - 输出路径: ${stitchWithAudio.outputPath}`);
      console.log(`  - 时长: ${stitchWithAudio.duration}秒`);
      console.log(`  - 文件大小: ${stitchWithAudio.fileSize} bytes`);
    } else {
      console.log(`  - 错误: ${stitchWithAudio.error}`);
    }

    // 清理测试音频
    if (existsSync(testAudio)) {
      unlinkSync(testAudio);
    }
  } catch (error) {
    console.log(`  - 测试音频生成失败: ${(error as Error).message}`);
  }

  // 测试4: 测试占位视频处理
  console.log('\n[Test 5] 测试占位视频处理...');
  const placeholderResult = await stitchService.stitch({
    videoPaths: ['builtin://fallback_video', testVideos[0]],
    subtitles: [{ start: 0, end: 4, text: '测试字幕' }],
    resolution: '720x1280',
    enableLoudnorm: false,
  });
  console.log(`  - 成功: ${placeholderResult.success}`);
  if (placeholderResult.success) {
    console.log(`  - 输出路径: ${placeholderResult.outputPath}`);
  } else {
    console.log(`  - 错误: ${placeholderResult.error}`);
  }

  // 测试5: 测试 getDuration 方法
  if (testVideos.length > 0) {
    console.log('\n[Test 6] 测试 getDuration 方法...');
    const duration = await stitchService.getDuration(testVideos[0]);
    console.log(`  - 视频时长: ${duration}秒`);
  }

  // 清理测试文件
  console.log('\n[Cleanup] 清理测试文件...');
  for (const video of testVideos) {
    try {
      if (existsSync(video)) {
        unlinkSync(video);
      }
    } catch { /* ignore */ }
  }

  console.log('\n' + '='.repeat(60));
  console.log('FFmpeg Stitch Service 测试完成');
  console.log('='.repeat(60));
}

runTests().catch(console.error);