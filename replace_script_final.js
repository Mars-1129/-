const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps', 'web-client', 'src', 'features', 'scripts', 'ScriptsPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// ============================================================
// 1. Static JSX text → use existing keys
// ============================================================

// Line 2231: <CardTitle>剧本列表</CardTitle>
content = content.replace(
  '<CardTitle>剧本列表</CardTitle>',
  "<CardTitle>{t('script.scriptList')}</CardTitle>"
);

// Line 2239: <CardDescription>按商品拉取真实剧本列表...
content = content.replace(
  '<CardDescription>按商品拉取真实剧本列表，当前工作稿件可继续 Patch 编辑与保存。</CardDescription>',
  "<CardDescription>{t('script.scriptListDesc')}</CardDescription>"
);

// Line 2265: 返回列表
content = content.replace(
  '返回列表',
  "{t('script.backToList')}"
);

// Line 2273: 回收站为空
content = content.replace(
  /回收站为空(?=\s*<\/div>\s*\))/,
  "{t('script.trashEmpty')}"
);

// Line 2357: 刷新 (button text)
content = content.replace(
  /(\s*)\u5237\u65b0(\s*<\/Button>)/,
  "$1{t('common.refresh')}$2"
);

// Line 2364: 当前商品还没有剧本...
content = content.replace(
  '当前商品还没有剧本，先生成一份真实稿件。',
  "{t('script.noScriptsYet')}"
);

// Line 2445: <CardDescription>选中分镜后直接生成 JSON Patch...
content = content.replace(
  '<CardDescription>选中分镜后直接生成 JSON Patch，并在右侧实时显示配时建议。</CardDescription>',
  "<CardDescription>{t('script.editorDesc')}</CardDescription>"
);

// Line 2452: 创作成片
content = content.replace(
  /(\s*)\u521b\u4f5c\u6210\u7247(\s*<\/Button>)/,
  "$1{t('script.goCreate')}$2"
);

// Line 2456: 保存剧本
content = content.replace(
  /(\s*)\u4fdd\u5b58\u5267\u672c(\s*<\/Button>)/,
  "$1{t('script.saveScript')}$2"
);

// Line 2472: 先在左侧生成或选择一份剧本。
content = content.replace(
  '先在左侧生成或选择一份剧本。',
  "{t('script.selectFromLeft')}"
);

// Line 2508: 在所选前插入
content = content.replace(
  /(\s*)\u5728\u6240\u9009\u524d\u63d2\u5165(\s*<\/Button>)/,
  "$1{t('script.insertBefore')}$2"
);

// Line 2517: 在所选后插入
content = content.replace(
  /(\s*)\u5728\u6240\u9009\u540e\u63d2\u5165(\s*<\/Button>)/,
  "$1{t('script.insertAfter')}$2"
);

// Line 2591: 编辑 (storyboard toggle)
content = content.replace(
  /<Pencil className="h-3\.5 w-3\.5" \/>\u7f16\u8f91/,
  "<Pencil className=\"h-3.5 w-3.5\" />{t('common.edit')}"
);

// Line 2602: 故事板
content = content.replace(
  /<Eye className="h-3\.5 w-3\.5" \/>\u6545\u4e8b\u677f/,
  "<Eye className=\"h-3.5 w-3.5\" />{t('script.editBoard')}"
);

// Line 2610: 镜头检索语句
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">镜头检索语句</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.shotSearchQuery')}</div>"
);

// Line 2618: 视觉描述
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">视觉描述</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.visualDescription')}</div>"
);

// Line 2628: 口播文案
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">口播文案</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.voiceoverText')}</div>"
);

// Line 2637: 字幕文案
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">字幕文案</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.subtitleText')}</div>"
);

// Line 2647: 时长（秒）
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">时长（秒）</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.durationSec')}</div>"
);

// Line 2651: 运镜
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">运镜</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.camera')}</div>"
);

// Line 2668: 转场
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">转场</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.transition')}</div>"
);

// Line 2690: BGM 风格 · 分镜级
content = content.replace(
  'BGM 风格 · 分镜级',
  "{t('script.bgmSection')}"
);

// Line 2694: 音乐风格
content = content.replace(
  '<div className="mb-1.5 text-[11px] text-slate-500">音乐风格</div>',
  "<div className=\"mb-1.5 text-[11px] text-slate-500\">{t('script.bgmStyle')}</div>"
);

// Line 2704: placeholder="如: 轻快电子"
content = content.replace(
  'placeholder="如: 轻快电子"',
  "placeholder={t('script.bgmStylePlaceholder')}"
);

// Line 2709: 能量等级
content = content.replace(
  '<div className="mb-1.5 text-[11px] text-slate-500">能量等级</div>',
  "<div className=\"mb-1.5 text-[11px] text-slate-500\">{t('script.bgmEnergy')}</div>"
);

// Line 2733: 节拍模式
content = content.replace(
  '<div className="mb-1.5 text-[11px] text-slate-500">节拍模式</div>',
  "<div className=\"mb-1.5 text-[11px] text-slate-500\">{t('script.bgmBeat')}</div>"
);

// Line 2746: placeholder="如: 渐进"
content = content.replace(
  'placeholder="如: 渐进"',
  "placeholder={t('script.bgmBeatPlaceholder')}"
);

// Line 2755: 真实配时校验
content = content.replace(
  '<div className="text-sm font-medium text-slate-100">真实配时校验</div>',
  "<div className=\"text-sm font-medium text-slate-100\">{t('script.timingCheck')}</div>"
);

// Line 2762: 预计时长
content = content.replace(
  '<div className="text-xs text-slate-500">预计时长</div>',
  "<div className=\"text-xs text-slate-500\">{t('script.estimatedDuration')}</div>"
);

// Line 2766: 当前分镜
content = content.replace(
  '<div className="text-xs text-slate-500">当前分镜</div>',
  "<div className=\"text-xs text-slate-500\">{t('script.currentShot')}</div>"
);

// Line 2772: '配时通过' and '需要调整'
content = content.replace(
  "timingValidation.valid ? '配时通过' : '需要调整'",
  "timingValidation.valid ? t('script.timingPass') : t('script.timingAdjust')"
);

// Line 2775: 超出词数：{timingValidation.overflow_words}
content = content.replace(
  '超出词数：{timingValidation.overflow_words}',
  "{t('script.wordCountExceeded', { n: timingValidation.overflow_words })}"
);

// Line 2790: 保存当前分镜
content = content.replace(
  /(\s*)\u4fdd\u5b58\u5f53\u524d\u5206\u955c(\s*<\/Button>)/,
  "$1{t('script.saveCurrentShot')}$2"
);

// Line 2797: 重置草稿
content = content.replace(
  /(\s*)\u91cd\u7f6e\u8349\u7a3f(\s*<\/Button>)/,
  "$1{t('script.resetDraft')}$2"
);

// Line 2812: 因子重混 (button text, inside Shuffle icon)
content = content.replace(
  /<Shuffle className="h-4 w-4" \/>\s*\u56e0\u5b50\u91cd\u6df7\s*<\/Button>/,
  "<Shuffle className=\"h-4 w-4\" />{t('script.factorRemix')}</Button>"
);

// Line 2825: 选择一个分镜后即可开始真实 Patch 编辑。
content = content.replace(
  '选择一个分镜后即可开始真实 Patch 编辑。',
  "{t('script.selectShotToEdit')}"
);

// Line 2840: 因子重混 (dialog title)
content = content.replace(
  '<h3 className="text-lg font-semibold text-slate-100">因子重混</h3>',
  "<h3 className=\"text-lg font-semibold text-slate-100\">{t('script.factorRemix')}</h3>"
);

// Line 2853: 因子覆盖 (JSON)
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">因子覆盖 (JSON)</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.factorOverride')}</div>"
);

// Line 2869: 保留配音文案
content = content.replace(
  /(\s*)\u4fdd\u7559\u914d\u97f3\u6587\u6848(\s*<\/label>)/,
  "$1{t('script.keepVoiceover')}$2"
);

// Line 2873: 额外指令（可选）
content = content.replace(
  '<div className="mb-2 text-xs text-slate-500">额外指令（可选）</div>',
  "<div className=\"mb-2 text-xs text-slate-500\">{t('script.extraInstruction')}</div>"
);

// Line 2877: placeholder="例如：保持开场节奏，强调产品特写..."
content = content.replace(
  'placeholder="例如：保持开场节奏，强调产品特写..."',
  "placeholder={t('script.remixInstructionPlaceholder')}"
);

// Line 2899: 取消
content = content.replace(
  /(\s*)\u53d6\u6d88(\s*<\/Button>\s*$)/m,
  "$1{t('common.cancel')}$2"
);

// Line 2906: 执行因子重混
content = content.replace(
  /(\s*)\u6267\u884c\u56e0\u5b50\u91cd\u6df7(\s*<\/Button>)/,
  "$1{t('script.executeRemix')}$2"
);

// Line 2196: Agent 执行日志
content = content.replace(
  'Agent 执行日志',
  "{t('script.agentLog')}"
);

// Line 2220: 剧本 ID: {agentResult.final_script_id}
content = content.replace(
  /剧本 ID: {agentResult\.final_script_id}/,
  "{t('script.scriptId')} {agentResult.final_script_id}"
);

// Line 1942: 最近一次分析：{lastAnalysis.analysis_id} · {lastAnalysis.source_platform}
content = content.replace(
  '最近一次分析：{lastAnalysis.analysis_id} · {lastAnalysis.source_platform}',
  "{t('script.lastAnalysis', { id: lastAnalysis.analysis_id, platform: lastAnalysis.source_platform })}"
);

// Line 2043: placeholder='用户因子 (JSON)...'
content = content.replace(
  "placeholder='用户因子 (JSON)，例如：{\"opening\":{\"hook_type\":\"question\"}}'",
  "placeholder={t('script.factorPlaceholder')}"
);

// Line 2097: 已选 {formSelectedTemplateIds.size} 个模板
content = content.replace(
  '已选 {formSelectedTemplateIds.size} 个模板',
  "{t('script.selectedTemplates', { n: formSelectedTemplateIds.size })}"
);

// ============================================================
// 2. Dynamic template literals → use new keys
// ============================================================

// Line 643, 1268: setGenerateSuccess(`剧本 ${script.script_id} 已生成并切换为当前工作稿件`)
// Do both occurrences
content = content.replace(
  /setGenerateSuccess\(`剧本 \$\{script\.script_id\} 已生成并切换为当前工作稿件`\)/g,
  "setGenerateSuccess(t('script.generateSuccessQuick', { id: script.script_id }))"
);

// Line 986-987: Agent message
// setGenerateSuccess(`Agent ${result.status === 'PASSED' ? t('script.reviewPassed') : t('script.fallbackOutput')}${iterText}，剧本 ${result.final_script_id || t('script.notSaved')}`);
content = content.replace(
  /setGenerateSuccess\(`Agent \$\{result\.status === 'PASSED' \? t\('script\.reviewPassed'\) : t\('script\.fallbackOutput'\)\}\$\{iterText\}，剧本 \$\{result\.final_script_id \|\| t\('script\.notSaved'\)\}`\)/,
  "setGenerateSuccess(t('script.agentGenerateSuccess', { status: result.status === 'PASSED' ? t('script.reviewPassed') : t('script.fallbackOutput'), iterations: iterText, scriptId: result.final_script_id || t('script.notSaved') }))"
);

// Line 1020: A/B 对比完成！优胜：${result.winner.label}（${result.variant_script_ids.length} 个变体）
content = content.replace(
  /setGenerateSuccess\(`A\/B 对比完成！优胜：\$\{result\.winner\.label\}（\$\{result\.variant_script_ids\.length\} 个变体）`\)/,
  "setGenerateSuccess(t('script.abSuccessResult', { label: result.winner.label, count: result.variant_script_ids.length }))"
);

// Line 1022: A/B 管线失败: ${result.step_log?.find(s => s.action === '管线执行失败')?.reasoning || '未知错误'}
content = content.replace(
  /setGenerateError\(`A\/B 管线失败: \$\{result\.step_log\?\.find\(s => s\.action === '管线执行失败'\)\?\.reasoning \|\| '未知错误'\}`\)/,
  "setGenerateError(t('script.abPipelineFailed', { msg: result.step_log?.find(s => s.action === '管线执行失败')?.reasoning || t('common.unknownError') }))"
);

// Line 1050: 剧本 ${script.script_id} 已通过组合生成创建
content = content.replace(
  /setGenerateSuccess\(`剧本 \$\{script\.script_id\} 已通过组合生成创建`\)/,
  "setGenerateSuccess(t('script.composedGenerateSuccess', { id: script.script_id }))"
);

// Line 1076: 剧本 ${script.script_id} 已通过混合自定义创建
content = content.replace(
  /setGenerateSuccess\(`剧本 \$\{script\.script_id\} 已通过混合自定义创建`\)/,
  "setGenerateSuccess(t('script.hybridGenerateSuccess', { id: script.script_id }))"
);

// Line 1098: 正在批量生成 ${styleVibesList.length} 种风格 × ${formSelectedTemplateIds.size} 个模板...
content = content.replace(
  /message: `正在批量生成 \$\{styleVibesList\.length\} 种风格 × \$\{formSelectedTemplateIds\.size\} 个模板\.\.\.`/,
  "message: t('script.batchProgressMessage', { styles: styleVibesList.length, templates: formSelectedTemplateIds.size })"
);

// Line 1108: 批量生成完成：${batchResp.total} 份剧本 (batch: ${batchResp.batch_id})
content = content.replace(
  /setGenerateSuccess\(`批量生成完成：\$\{batchResp\.total\} 份剧本 \(batch: \$\{batchResp\.batch_id\}\)`\)/,
  "setGenerateSuccess(t('script.batchGenerateSuccess', { total: batchResp.total, batchId: batchResp.batch_id }))"
);

// Line 1301: setGenerateError(error instanceof Error ? error.message : '剧本生成失败');
content = content.replace(
  /setGenerateError\(error instanceof Error \? error\.message : '剧本生成失败'\)/,
  "setGenerateError(error instanceof Error ? error.message : t('script.generateFailed'))"
);

// Line 1320: 已保存 ${response.script_id}，Schema=${...}，配时=${...}
content = content.replace(
  /setSaveMessage\(\s*`已保存 \$\{response\.script_id\}，Schema=\$\{response\.validation_summary\.schema_valid \? '通过' : '失败'\}，配时=\$\{response\.validation_summary\.timing_valid \? '通过' : '失败'\}`/,
  "setSaveMessage(t('script.savedMessage', {\n        id: response.script_id,\n        schema: response.validation_summary.schema_valid ? t('common.pass') : t('common.fail'),\n        timing: response.validation_summary.timing_valid ? t('common.pass') : t('common.fail'),\n      })"
);

// Line 1391: 已更新 ${response.updated_fields.join('、')}；${response.timing_validation.suggestion}
content = content.replace(
  /setPatchMessage\(`已更新 \$\{response\.updated_fields\.join\('、'\)\}；\$\{response\.timing_validation\.suggestion\}`\)/,
  "setPatchMessage(t('script.patchUpdated', { fields: response.updated_fields.join('、'), suggestion: response.timing_validation.suggestion }))"
);

// Line 1420: 已将分镜 ${shotIndex} 移动到位置 ${targetShotIndex}
content = content.replace(
  /setPatchMessage\(`已将分镜 \$\{shotIndex\} 移动到位置 \$\{targetShotIndex\}`\)/,
  "setPatchMessage(t('script.shotMovedToPosition', { from: shotIndex, to: targetShotIndex }))"
);

// Line 469: 已将分镜从位置 ${oldIndex + 1} 移动到位置 ${newIndex + 1}
content = content.replace(
  /setPatchMessage\(`已将分镜从位置 \$\{oldIndex \+ 1\} 移动到位置 \$\{newIndex \+ 1\}`\)/,
  "setPatchMessage(t('script.shotMovedToPosition', { from: oldIndex + 1, to: newIndex + 1 }))"
);

// Line 1448: 已删除分镜 ${shotIndex}
content = content.replace(
  /setPatchMessage\(`已删除分镜 \$\{shotIndex\}`\)/,
  "setPatchMessage(t('script.shotDeletedMsg', { index: shotIndex }))"
);

// Line 1514: 已在 Shot ${selectedShotIndex} ${position === 'after' ? '后' : '前'}插入新分镜
content = content.replace(
  /setPatchMessage\(`已在 Shot \$\{selectedShotIndex\} \$\{position === 'after' \? '后' : '前'\}插入新分镜`\)/,
  "setPatchMessage(position === 'after' ? t('script.shotInsertedAfterMsg', { shotIndex: selectedShotIndex }) : t('script.shotInsertedBeforeMsg', { shotIndex: selectedShotIndex }))"
);

// Line 2565: 镜头 {shot.shot_index} (in DragOverlay)
content = content.replace(
  '<span className="text-xs font-bold text-slate-400">镜头 {shot.shot_index}</span>',
  "<span className=\"text-xs font-bold text-slate-400\">{t('script.shotNumber', { n: shot.shot_index })}</span>"
);

// Line 2567: '(无描述)' (in DragOverlay fallback)
content = content.replace(
  "shot.visual_description || shot.scene_description_query || '(无描述)'",
  "shot.visual_description || shot.scene_description_query || t('script.noDescription')"
);

// Line 2107: 批次 {batchResult.batch_id} · 共 {batchResult.total} 份剧本 · {batchResult.scripts.length} 条结果
content = content.replace(
  /批次 {batchResult\.batch_id} · 共 {batchResult\.total} 份剧本 · {batchResult\.scripts\.length} 条结果/,
  "{t('script.batchResultInfo', { batchId: batchResult.batch_id, total: batchResult.total, count: batchResult.scripts.length })}"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('All replacements done successfully!');
