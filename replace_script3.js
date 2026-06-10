const fs = require('fs');
const file = 'd:/字节/apps/web-client/src/features/scripts/ScriptsPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  // Script list header  
  ['">剧本列表</CardTitle>', '">{t("script.scriptList")}</CardTitle>'],
  ['">按商品拉取真实剧本列表，当前工作稿件可继续 Patch 编辑与保存。</CardDescription>', '">{t("script.scriptListDesc")}</CardDescription>'],

  // Trash section
  ['{trashItems.length} 条已删除', '{t("script.trashCount", { n: trashItems.length })}'],
  ['永久删除 ({selectedScriptIds.size})', '{t("script.batchPermanentDeleteCount", { n: selectedScriptIds.size })}'],
  ['批量恢复 ({selectedScriptIds.size})', '{t("script.batchRestoreCount", { n: selectedScriptIds.size })}'],
  ["'退出选择'", "t('script.exitSelect')"],
  ["'选择'", "t('script.select')"],
  ['">返回列表</Button>', '">{t("script.backToList")}</Button>'],
  ['">回收站为空</div>', '">{t("script.trashEmpty")}</div>'],

  // Trash item buttons  
  ['\n                            恢复\n', '\n                            {t("script.restore")}\n'],
  ['\n                            永久删除\n', '\n                            {t("script.permanentDelete")}\n'],

  // Script list summary
  ['{scripts.length} 份剧本', '{t("script.scriptCount", { n: scripts.length })}'],
  ['批量删除 ({selectedScriptIds.size})', '{t("script.batchDeleteCount", { n: selectedScriptIds.size })}'],
  ['\n                        刷新\n', '\n                        {t("common.refresh")}\n'],

  // Empty list
  ['">当前商品还没有剧本，先生成一份真实稿件。</div>', '">{t("script.noScriptsYet")}</div>'],

  // AI review title
  ['title="AI 合规审查"', 'title={t("script.aiReview")}'],

  // Active editor
  ["'当前工作稿件'", "t('script.currentScript')"],
  ['">选中分镜后直接生成 JSON Patch，并在右侧实时显示配时建议。</CardDescription>', '">{t("script.editorDesc")}</CardDescription>'],

  // Create/save buttons
  ['">创作成片</Button>', '">{t("script.goCreate")}</Button>'],
  ['">保存剧本</Button>', '">{t("script.saveScript")}</Button>'],

  // Shot summary
  [' 个分镜 · 总时长 ', ' {t("script.shotsLabel")} · {t("script.totalDuration")} '],
  ['(超限 ', '({t("script.overLimit")} '],

  // Insert buttons
  ['">在所选前插入</Button>', '">{t("script.insertBefore")}</Button>'],
  ['">在所选后插入</Button>', '">{t("script.insertAfter")}</Button>'],

  // Shot edit
  ["'选择一个分镜后即可开始真实 Patch 编辑。'", "t('script.selectShotToEdit')"],

  // Agent iterations
  [' 轮迭代', ' {t("script.iterationsLabel")}'],

  // Empty state
  ['">先在左侧生成或选择一份剧本。</div>', '">{t("script.selectFromLeft")}</div>'],

  // Factor remix result
  ['因子重混完成：', '{t("script.factorRemixSuccess")} '],
];

let count = 0;
for (const [oldStr, newStr] of replacements) {
  if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    count++;
  }
}

fs.writeFileSync(file, content, 'utf8');
console.log('Done: ' + count + ' replacements made.');
