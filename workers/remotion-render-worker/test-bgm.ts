/**
 * BGM Service 测试脚本
 * 测试 BGM 文件解析和选择功能
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 模拟环境变量
process.env.BGM_ASSET_BASE_URL = 'assets/bgm';

// 动态导入服务
async function runTests() {
  const { BgmService } = await import('./src/bgm-service.ts');

console.log('='.repeat(60));
console.log('BGM Service 测试');
console.log('='.repeat(60));

const bgmService = new BgmService();

// 测试 1: 检查本地文件存在性
console.log('\n[Test 1] 检查本地 BGM 文件...');
const localFiles = bgmService.getAvailableLocalBgmFiles();
console.log(`本地可用 BGM 文件数量: ${localFiles.length}`);
if (localFiles.length > 0) {
  console.log('文件列表:');
  localFiles.forEach(f => console.log(`  - ${f}`));
} else {
  console.log('警告: 没有找到本地 BGM 文件');
}

// 测试 2: 获取音乐库
console.log('\n[Test 2] 获取音乐库...');
const library = bgmService.getLibrary();
console.log(`音乐库总曲目数: ${library.length}`);
library.forEach(track => {
  console.log(`  - ${track.name} (${track.mood}) - ${track.tags.join(', ')}`);
});

// 测试 3: auto 策略选择
console.log('\n[Test 3] auto 策略选择...');
const autoResult = bgmService.select({
  policy: 'auto',
  videoDuration: 15,
});
console.log(`选择结果: ${autoResult.success ? '成功' : '失败'}`);
if (autoResult.success) {
  console.log(`  - 曲目: ${autoResult.track?.name}`);
  console.log(`  - URL: ${autoResult.url}`);
  console.log(`  - 原因: ${autoResult.reason}`);
}

// 测试 4: upbeat 策略选择
console.log('\n[Test 4] upbeat 策略选择...');
const upbeatResult = bgmService.select({
  policy: 'upbeat',
  videoDuration: 20,
});
console.log(`选择结果: ${upbeatResult.success ? '成功' : '失败'}`);
if (upbeatResult.success) {
  console.log(`  - 曲目: ${upbeatResult.track?.name}`);
  console.log(`  - URL: ${upbeatResult.url}`);
}

// 测试 5: calm 策略选择
console.log('\n[Test 5] calm 策略选择...');
const calmResult = bgmService.select({
  policy: 'calm',
  videoDuration: 30,
});
console.log(`选择结果: ${calmResult.success ? '成功' : '失败'}`);
if (calmResult.success) {
  console.log(`  - 曲目: ${calmResult.track?.name}`);
  console.log(`  - URL: ${calmResult.url}`);
}

// 测试 6: none 策略选择
console.log('\n[Test 6] none 策略选择...');
const noneResult = bgmService.select({
  policy: 'none',
});
console.log(`选择结果: ${noneResult.success ? '成功' : '失败'}`);
console.log(`  - 原因: ${noneResult.reason}`);

// 测试 7: 根据 styleVibe 推断
console.log('\n[Test 7] 根据 styleVibe 推断 mood...');
const vibeTests = [
  { vibe: '活力动感', expected: 'energetic' },
  { vibe: '舒缓放松', expected: 'calm' },
  { vibe: '时尚美妆', expected: 'calm' },
  { vibe: '戏剧悬念', expected: 'dramatic' },
];

for (const test of vibeTests) {
  const result = bgmService.select({
    policy: 'auto',
    styleVibe: test.vibe,
    videoDuration: 15,
  });
  console.log(`  - styleVibe="${test.vibe}" => 选中: ${result.track?.name}`);
}

// 测试 8: hasLocalBgmFile 检查
console.log('\n[Test 8] hasLocalBgmFile 检查...');
const testPaths = [
  resolve(process.cwd(), 'assets/bgm/energetic-upbeat-01.mp3'),
  resolve(process.cwd(), 'assets/bgm/nonexistent.mp3'),
  'builtin://bgm/test.mp3',
  'https://example.com/test.mp3',
];

for (const testPath of testPaths) {
  const exists = bgmService.hasLocalBgmFile(testPath);
  console.log(`  - ${testPath}: ${exists ? '存在' : '不存在'}`);
}

console.log('\n' + '='.repeat(60));
console.log('BGM Service 测试完成');
console.log('='.repeat(60));
}

runTests().catch(console.error);