/**
 * TTS Service 测试脚本
 * 测试 TTS 语音合成功能
 */

async function runTests() {
  // 模拟环境变量 - 使用 mock 模式
  process.env.TTS_PROVIDER = 'mock';
  process.env.TTS_TEMP_DIR = '/tmp/tikstream-tts';

  console.log('='.repeat(60));
  console.log('TTS Service 测试');
  console.log('='.repeat(60));

  const { TtsService } = await import('./src/tts-service.ts');
  const ttsService = new TtsService();

  // 测试配置
  console.log('\n[Test 1] 获取当前配置...');
  const config = ttsService.getConfig();
  console.log(`  - Provider: ${config.provider}`);
  console.log(`  - API URL: ${config.apiUrl}`);
  console.log(`  - Format: ${config.format}`);
  console.log(`  - Sample Rate: ${config.sampleRate}`);

  // 获取可用音色
  console.log('\n[Test 2] 获取可用音色...');
  const voices = ttsService.getAvailableVoices();
  console.log(`  可用音色数量: ${voices.length}`);
  voices.forEach(voice => {
    console.log(`  - ${voice.name} (${voice.id}): ${voice.language}, ${voice.gender}`);
  });

  // 测试 mock TTS 合成
  console.log('\n[Test 3] 测试 mock TTS 合成 (中文)...');
  const chineseText = '欢迎来到 TikStream AI 电商视频创作平台，这里为您提供一站式视频创作服务。';
  const chineseResult = await ttsService.synthesize(chineseText, 'zh-CN-female-optimized');
  console.log(`  - 成功: ${chineseResult.success}`);
  if (chineseResult.success) {
    console.log(`  - 音频 URL: ${chineseResult.audioUrl}`);
    console.log(`  - 本地路径: ${chineseResult.localPath}`);
    console.log(`  - 时长: ${chineseResult.duration}秒`);
  } else {
    console.log(`  - 错误: ${chineseResult.error}`);
  }

  // 测试英文 TTS
  console.log('\n[Test 4] 测试 mock TTS 合成 (英文)...');
  const englishText = 'Welcome to TikStream AI, your one-stop video creation platform for e-commerce.';
  const englishResult = await ttsService.synthesize(englishText, 'en-US-female');
  console.log(`  - 成功: ${englishResult.success}`);
  if (englishResult.success) {
    console.log(`  - 音频 URL: ${englishResult.audioUrl}`);
    console.log(`  - 时长: ${englishResult.duration}秒`);
  } else {
    console.log(`  - 错误: ${englishResult.error}`);
  }

  // 测试语速调整
  console.log('\n[Test 5] 测试语速调整...');
  const speedResult = await ttsService.synthesize('测试语速', 'zh-CN-female-optimized', { speed: 1.5 });
  console.log(`  - 成功: ${speedResult.success}`);
  if (speedResult.success) {
    console.log(`  - 时长: ${speedResult.duration}秒`);
  }

  // 测试超长文本
  console.log('\n[Test 6] 测试超长文本...');
  const longText = '这是一段很长的文本，用于测试 TTS 系统处理长文本的能力。' + '重复内容。'.repeat(10);
  const longResult = await ttsService.synthesize(longText, 'zh-CN-female-optimized');
  console.log(`  - 成功: ${longResult.success}`);
  if (longResult.success) {
    console.log(`  - 时长: ${longResult.duration}秒 (限制在 1-30 秒)`);
  }

  // 测试空文本
  console.log('\n[Test 7] 测试空文本...');
  const emptyResult = await ttsService.synthesize('', 'zh-CN-female-optimized');
  console.log(`  - 成功: ${emptyResult.success}`);
  if (emptyResult.success) {
    console.log(`  - 时长: ${emptyResult.duration}秒`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TTS Service 测试完成');
  console.log('='.repeat(60));
}

runTests().catch(console.error);