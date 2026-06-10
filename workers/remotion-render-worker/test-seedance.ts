/**
 * Doubao Seedance Client 测试脚本
 * 测试图生视频 API 功能
 */

async function runTests() {
  console.log('='.repeat(60));
  console.log('Doubao Seedance Client 测试');
  console.log('='.repeat(60));

  const { DoubaoSeedanceClient } = await import('./src/doubao-seedance-client.ts');

  // 测试配置
  console.log('\n[Test 1] 获取客户端配置...');
  const client = new DoubaoSeedanceClient();
  const config = (client as any).config;
  console.log(`  - API URL: ${config.apiUrl}`);
  console.log(`  - Model: ${config.model}`);
  console.log(`  - Timeout: ${config.timeoutMs}ms`);
  console.log(`  - Max Retries: ${config.maxRetries}`);
  console.log(`  - Output Dir: ${config.outputDir}`);

  // 检查 API Key 状态
  console.log('\n[Test 2] 检查 API 认证状态...');
  const apiKey = config.apiKey;
  console.log(`  - API Key 配置: ${apiKey ? '已配置' : '未配置 (mock 模式)'}`);

  // 测试并发槽位
  console.log('\n[Test 3] 并发控制测试...');
  const availableSlots = (client as any).getAvailableConcurrency();
  console.log(`  - 可用并发槽位: ${availableSlots}`);
  console.log(`  - 最大并发: ${config.maxConcurrency}`);

  // 测试图片下载（模拟）
  console.log('\n[Test 4] 图片下载测试...');
  try {
    const testUrl = 'https://via.placeholder.com/512x512.png';
    const { downloadFile } = client as any;
    const localPath = await downloadFile.call(client, testUrl, 'png');
    console.log(`  - 下载成功: ${localPath}`);

    // 清理测试文件
    const { unlinkSync, existsSync } = await import('node:fs');
    if (existsSync(localPath)) {
      unlinkSync(localPath);
      console.log('  - 清理完成');
    }
  } catch (error) {
    console.log(`  - 下载失败: ${(error as Error).message}`);
  }

  // 测试 generate 方法（需要真实 API Key 才能成功）
  console.log('\n[Test 5] 视频生成测试 (需要 API Key)...');
  if (!apiKey) {
    console.log('  - 跳过: 未配置 API Key');
  } else {
    try {
      const result = await client.generate({
        imageUrl: 'https://via.placeholder.com/512x512.jpg',
        prompt: '测试动画：画面平滑移动',
        duration: 5,
        aspectRatio: '9:16',
      });
      console.log(`  - 成功: ${result.success}`);
      if (result.success) {
        console.log(`  - 视频 URL: ${result.videoUrl}`);
        console.log(`  - 本地路径: ${result.localPath}`);
        console.log(`  - Request ID: ${result.requestId}`);
      } else {
        console.log(`  - 错误: ${result.error}`);
      }
    } catch (error) {
      console.log(`  - 异常: ${(error as Error).message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Doubao Seedance Client 测试完成');
  console.log('='.repeat(60));
}

runTests().catch(console.error);