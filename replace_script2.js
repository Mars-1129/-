const fs = require('fs');

const file = 'd:/字节/apps/web-client/src/features/scripts/ScriptsPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  // Card header
  ['">真实剧本生成</CardTitle>', '">{t("script.generate")}</CardTitle>'],
  ['">保留 quick / viral rewrite / template 三种入口，全部接真实 Nest API。</CardDescription>', '">{t("script.generateDesc")}</CardDescription>'],

  // Viral section JSX text (these are in span/div tags, not string literals)
  ['点击或拖拽上传自有视频', '{t("script.uploadHint")}'],
  ['支持 MP4 格式，上传后将自动触发 AI 拆解', '{t("script.uploadSubHint")}'],
  ['正在上传并创建分析...', '{t("script.viralUploadProgress")}'],

  // Remaining viral-related JSX
  ['">模板（可选）</div>', '">{t("script.templateOptional")}</div>'],
  ['">不使用模板</option>', '">{t("script.noTemplateOption")}</option>'],
  ['">爆款视频 ID（可选）</div>', '">{t("script.viralVideoId")}</div>'],
  ['placeholder="先通过爆款仿写栏分析视频后自动填入"', 'placeholder={t("script.viralIdHint")}'],
  ['自动匹配爆款视频', '{t("script.autoMatchViral")}'],

  // Agent log JSX
  ['Agent 执行日志', '{t("script.agentLog")}'],
  ['审查通过', '{t("script.reviewPassed")}'],
  ['兜底输出', '{t("script.fallbackOutput")}'],

  // Preference options
  ['">✅ 范例</option>', '">{t("script.winnerExample")}</option>'],
  ['">❌ 避免</option>', '">{t("script.loserExample")}</option>'],
  ["'高转化文案示例...'", "t('script.winnerPlaceholder')"],
  ["'低转化文案示例...'", "t('script.loserPlaceholder')"],

  // Script list / trash
  ['">剧本列表</CardTitle>', '">{t("script.shotCountUnit") + " " + t("common.list")}</CardTitle>'], // needs a real key
  ['回收站', '{t("script.trash")}'],
  ['">按商品拉取真实剧本列表，当前工作稿件可继续 Patch 编辑与保存。</CardDescription>', '">{t("script.listDesc")}</CardDescription>'],

  // Error/throw messages that weren't replaced
  ["throw new Error('请先填写爆款视频链接')", "throw new Error(t('script.enterViralUrl'))"],
  ["throw new Error('请先选择要上传的视频文件')", "throw new Error(t('script.selectVideoFile'))"],
  ["throw new Error('请先选择模板')", "throw new Error(t('script.selectTemplate'))"],

  // formatPatchError calls with Chinese fallback
  ["formatPatchError(error, '分镜重排失败')", "formatPatchError(error, t('script.shotReorderFailed'), t)"],
  ["formatPatchError(error, '删除分镜失败')", "formatPatchError(error, t('script.shotDeleteFailed'), t)"],
  ["formatPatchError(error, '插入分镜失败')", "formatPatchError(error, t('script.shotInsertFailed'), t)"],
  ["formatPatchError(error, '剧本生成失败')", "formatPatchError(error, t('script.generateFailed'), t)"],

  // Success messages
  ["'剧本生成失败'", "t('script.generateFailed')"],
  ["'请先填写爆款视频链接'", "t('script.enterViralUrl')"],
  ["'请先选择要上传的视频文件'", "t('script.selectVideoFile')"],
  ["'请先选择模板'", "t('script.selectTemplate')"],
  ["'分镜重排失败'", "t('script.shotReorderFailed')"],
  ["'删除分镜失败'", "t('script.shotDeleteFailed')"],
  ["'插入分镜失败'", "t('script.shotInsertFailed')"],

  // Default voiceover (line 1500)
  ["voiceover_text: '请在此输入口播文案'", "voiceover_text: t('script.defaultVoiceover')"],

  // Agent result text
  ["'未落库'", "t('script.notSaved')"],
  ["'审查通过'", "t('script.reviewPassed')"],
  ["'兜底输出'", "t('script.fallbackOutput')"],
];

let count = 0;
let skipped = 0;
for (const [oldStr, newStr] of replacements) {
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    count++;
    console.log(`  OK: ${oldStr.substring(0, 60)}`);
  } else {
    skipped++;
    console.log(`  SKIP: ${oldStr.substring(0, 60)}`);
  }
}

fs.writeFileSync(file, content, 'utf8');
console.log(`\nDone: ${count} replaced, ${skipped} skipped.`);
