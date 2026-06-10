const fs = require('fs');
const path = require('path');

const file = path.resolve('d:/字节/apps/web-client/src/features/scripts/ScriptsPage.tsx');
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  // Viral section
  ['"请先选择要上传的视频文件"', 't("script.selectVideoFile")'],
  ['"请先填写爆款视频链接"', 't("script.enterViralUrl")'],
  ['"点击或拖拽上传自有视频"', 't("script.uploadHint")'],
  ['"支持 MP4 格式，上传后将自动触发 AI 拆解"', 't("script.uploadSubHint")'],
  ['placeholder="爆款公开视频链接"', 'placeholder={t("script.viralUrlPlaceholder")}'],
  ['"正在上传并创建分析..."', 't("script.viralUploadProgress")'],
  ['placeholder="约束覆盖，逗号或换行分隔"', 'placeholder={t("script.constraintOverride")}'],

  // Hybrid section
  ['"用户策略描述，例如：开场用对比手法强调痛点，中段展示产品核心卖点..."', 't("script.strategyPlaceholder")'],
  ['"用户约束条件，逗号或换行分隔"', 't("script.constraintUserPlaceholder")'],

  // Batch section
  ['">模板（多选）</div>', '">{t("script.templateMulti")}</div>'],
  ['加载模板...', '{t("script.loadingTemplates")}'],
  ['">暂无可用模板</div>', '">{t("script.noTemplates")}</div>'],
  ['placeholder="风格调性，逗号分隔，例如：高转化 UGC, 强节奏口播, 开箱对比"', 'placeholder={t("script.styleBatchPlaceholder")}'],

  // Preferences & product context
  ['">文案偏好对齐 (可选)</label>', '">{t("script.preferences")}</label>'],
  ['"✅ 范例"', 't("script.winnerExample")'],
  ['"❌ 避免"', 't("script.loserExample")'],
  ['"高转化文案示例..."', 't("script.winnerPlaceholder")'],
  ['"低转化文案示例..."', 't("script.loserPlaceholder")'],
  ['+ 添加偏好示例', '{t("script.addPreference")}'],
  ['">当前商品上下文</div>', '">{t("script.productContext")}</div>'],
  ["'暂无商品'", "t('script.noProduct')"],
  ["'选中商品后自动带入卖点与目标人群'", "t('script.noProductHint')"],

  // Compliance
  ['启用 AI 合规二审', '{t("script.aiComplianceCheck")}'],
  ['LLM 语义复审，降低误拦截（消耗 token）', '{t("script.aiComplianceDesc")}'],

  // Generate button
  ["'生成中...'", "t('script.generating')"],
  ["'生成真实剧本'", "t('script.generateBtn')"],

  // Agent log
  ["'审查通过'", "t('script.reviewPassed')"],
  ["'兜底输出'", "t('script.fallbackOutput')"],

  // Script list / trash
  ['">当前商品还没有剧本，先生成一份真实稿件。</div>', '">{t("script.noScriptsYet")}</div>'],
  ['">回收站为空</div>', '">{t("script.trashEmpty")}</div>'],
  ['">恢复</Button>', '">{t("script.restore")}</Button>'],
  ['">永久删除</Button>', '">{t("script.permanentDelete")}</Button>'],
  ['">退出选择</Button>', '">{t("script.exitSelect")}</Button>'],

  // Active script editor
  ["'暂无分镜数据'", "t('script.noShotData')"],
  ["'至少保留一个分镜'", "t('script.minOneShot')"],
  ["'当前分镜没有改动'", "t('script.noChanges')"],
  ["'请在此输入口播文案'", "t('script.defaultVoiceover')"],
  ['">创作成片</Button>', '">{t("script.goCreate")}</Button>'],
  ['">保存剧本</Button>', '">{t("script.saveScript")}</Button>'],
  ['">先在左侧生成或选择一份剧本。</div>', '">{t("script.selectFromLeft")}</div>'],

  // Catch/error messages
  ["'剧本列表加载失败'", "t('script.listLoadFailed')"],
  ["'模板列表加载失败'", "t('script.templateLoadFailed')"],
  ["'剧本详情加载失败'", "t('script.detailLoadFailed')"],
  ["'配时校验失败'", "t('script.timingCheckFailed')"],
  ["'剧本列表刷新失败'", "t('script.listRefreshFailed')"],
  ["'剧本保存失败'", "t('script.saveFailed')"],
  ["'无法连接到 AI 服务'", "t('script.aiUnavailable')"],
  ["'SSE 连接失败，将使用同步模式'", "t('script.sseFallback')"],
  ["'SSE 连接失败'", "t('script.sseFallback')"],
  ["'加载回收站失败'", "t('script.trashLoadFailed')"],
  ["'因子覆盖 JSON 格式无效'", "t('script.factorJsonInvalid')"],
  ["'因子重混失败'", "t('script.factorRemixFailed')"],
  ["'恢复失败，请重试'", "t('script.restoreFailed')"],
  ["'永久删除失败，请重试'", "t('script.permanentDeleteFailed')"],
  ["'请先选择模板'", "t('script.selectTemplate')"],
  ["'请先选择要上传的视频文件'", "t('script.selectVideoFile')"],
  ["'Agent 执行失败'", "t('script.agentFailed')"],
  ["'Auto A/B 执行失败'", "t('script.autoAbFailed')"],
  ["'请至少选择一个模板进行批量生成'", "t('script.selectTemplateBatch')"],
  ["'请至少输入一种风格调性'", "t('script.enterStyleBatch')"],
  ["'请先选择商品上下文'", "t('script.selectProductFirst')"],

  // Generate progress
  ["'Agent 正在理解商品并生成剧本...'", "t('script.agentProgress')"],
  ["'正在组合生成剧本...'", "t('script.composedProgress')"],
  ["'正在混合自定义生成剧本...'", "t('script.hybridProgress')"],
  ["'正在上传视频并分析...'", "t('script.viralUploadProgress')"],
  ["'正在分析爆款视频结构...'", "t('script.viralAnalyzeProgress')"],
  ["'Auto A/B Agent 正在启动多版本对比管线...'", "t('script.autoAbProgress')"],
  ["'请先从剧本列表中选择一个基准剧本，再使用 A/B 对比模式'", "t('script.selectBaseScript')"],

  // Insert exceeded
  ["'插入新分镜后总时长将超过 15 秒，请先缩短现有分镜或删除分镜后再插入'", "t('script.insertExceeded')"],
];

let count = 0;
for (const [oldStr, newStr] of replacements) {
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    count++;
    console.log(`  ✓ Replaced: ${oldStr.substring(0, 50)}${oldStr.length > 50 ? '...' : ''}`);
  } else {
    console.log(`  ✗ Not found: ${oldStr.substring(0, 50)}${oldStr.length > 50 ? '...' : ''}`);
  }
}

fs.writeFileSync(file, content, 'utf8');
console.log(`\nDone. ${count} replacements made.`);
