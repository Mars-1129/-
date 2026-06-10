$file = "d:\字节\apps\web-client\src\features\scripts\ScriptsPage.tsx"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Viral section
$content = $content.Replace('"请先选择要上传的视频文件"', 't("script.selectVideoFile")')
$content = $content.Replace('"请先填写爆款视频链接"', 't("script.enterViralUrl")')
$content = $content.Replace('"点击或拖拽上传自有视频"', 't("script.uploadHint")')
$content = $content.Replace('"支持 MP4 格式，上传后将自动触发 AI 拆解"', 't("script.uploadSubHint")')
$content = $content.Replace('placeholder="爆款公开视频链接"', 'placeholder={t("script.viralUrlPlaceholder")}')
$content = $content.Replace('"正在上传并创建分析..."', 't("script.viralUploadProgress")')
$content = $content -replace '最近一次分析：(\{lastAnalysis\.analysis_id\} · \{lastAnalysis\.source_platform\})', '{t("script.lastAnalysis", { id: lastAnalysis.analysis_id, platform: lastAnalysis.source_platform })}'
$content = $content.Replace('placeholder="约束覆盖，逗号或换行分隔"', 'placeholder={t("script.constraintOverride")}')

# Hybrid section
$content = $content.Replace('"用户策略描述，例如：开场用对比手法强调痛点，中段展示产品核心卖点..."', 't("script.strategyPlaceholder")')
$content = $content.Replace('"用户因子 (JSON)，例如：{"opening":{"hook_type":"question"}}"', 't("script.factorPlaceholder")')
$content = $content.Replace('"用户约束条件，逗号或换行分隔"', 't("script.constraintUserPlaceholder")')

# Batch section
$content = $content.Replace('">模板（多选）</div>', '">{t("script.templateMulti")}</div>')
$content = $content.Replace('加载模板...', 't("script.loadingTemplates")')
$content = $content.Replace('">暂无可用模板</div>', '">{t("script.noTemplates")}</div>')
$content = $content.Replace('placeholder="风格调性，逗号分隔，例如：高转化 UGC, 强节奏口播, 开箱对比"', 'placeholder={t("script.styleBatchPlaceholder")}')

# Preferences & product context
$content = $content.Replace('">文案偏好对齐 (可选)</label>', '">{t("script.preferences")}</label>')
$content = $content.Replace('"✅ 范例"', 't("script.winnerExample")')
$content = $content.Replace('"❌ 避免"', 't("script.loserExample")')
$content = $content.Replace('"高转化文案示例..."', 't("script.winnerPlaceholder")')
$content = $content.Replace('"低转化文案示例..."', 't("script.loserPlaceholder")')
$content = $content.Replace('+ 添加偏好示例', '{t("script.addPreference")}')
$content = $content.Replace('">当前商品上下文</div>', '">{t("script.productContext")}</div>')
$content = $content.Replace("'暂无商品'", "t('script.noProduct')")
$content = $content.Replace("'选中商品后自动带入卖点与目标人群'", "t('script.noProductHint')")

# Compliance
$content = $content.Replace('启用 AI 合规二审', '{t("script.aiComplianceCheck")}')
$content = $content.Replace('LLM 语义复审，降低误拦截（消耗 token）', '{t("script.aiComplianceDesc")}')

# Generate button
$content = $content.Replace("'生成中...'", "t('script.generating')")
$content = $content.Replace("'生成真实剧本'", "t('script.generateBtn')")

# Agent log
$content = $content.Replace('Agent 执行日志', '{t("script.agentLog")}')
$content = $content.Replace("'审查通过'", "t('script.reviewPassed')")
$content = $content.Replace("'兜底输出'", "t('script.fallbackOutput')")

# Script list / trash (below)
$content = $content.Replace('">当前商品还没有剧本，先生成一份真实稿件。</div>', '">{t("script.noScriptsYet")}</div>')
$content = $content.Replace('">回收站为空</div>', '">{t("script.trashEmpty")}</div>')
$content = $content.Replace('">恢复</Button>', '">{t("script.restore")}</Button>')
$content = $content.Replace('">永久删除</Button>', '">{t("script.permanentDelete")}</Button>')
$content = $content.Replace('">退出选择</Button>', '">{t("script.exitSelect")}</Button>')
$content = $content.Replace('">选择</Button>', '">{t("script.select")}</Button>')

# Active script editor
$content = $content.Replace("'暂无分镜数据'", "t('script.noShotData')")
$content = $content.Replace("'至少保留一个分镜'", "t('script.minOneShot')")
$content = $content.Replace("'当前分镜没有改动'", "t('script.noChanges')")
$content = $content.Replace("'请在此输入口播文案'", "t('script.defaultVoiceover')")
$content = $content.Replace('">创作成片</Button>', '">{t("script.goCreate")}</Button>')
$content = $content.Replace('">保存剧本</Button>', '">{t("script.saveScript")}</Button>')
$content = $content.Replace('">先在左侧生成或选择一份剧本。</div>', '">{t("script.selectFromLeft")}</div>')

# Catch block messages
$content = $content.Replace("'剧本列表加载失败'", "t('script.listLoadFailed')")
$content = $content.Replace("'模板列表加载失败'", "t('script.templateLoadFailed')")
$content = $content.Replace("'剧本详情加载失败'", "t('script.detailLoadFailed')")
$content = $content.Replace("'配时校验失败'", "t('script.timingCheckFailed')")
$content = $content.Replace("'剧本列表刷新失败'", "t('script.listRefreshFailed')")
$content = $content.Replace("'剧本保存失败'", "t('script.saveFailed')")
$content = $content.Replace("'无法连接到 AI 服务'", "t('script.aiUnavailable')")
$content = $content.Replace("'SSE 连接失败'", "t('script.sseFallback')")
$content = $content.Replace("'SSE 连接失败，将使用同步模式'", "t('script.sseFallback')")
$content = $content.Replace("'加载回收站失败'", "t('script.trashLoadFailed')")
$content = $content.Replace("'因子覆盖 JSON 格式无效'", "t('script.factorJsonInvalid')")
$content = $content.Replace("'因子重混失败'", "t('script.factorRemixFailed')")
$content = $content.Replace("'恢复失败，请重试'", "t('script.restoreFailed')")
$content = $content.Replace("'永久删除失败，请重试'", "t('script.permanentDeleteFailed')")
$content = $content.Replace("'请先选择模板'", "t('script.selectTemplate')")
$content = $content.Replace("'请先选择要上传的视频文件'", "t('script.selectVideoFile')")
$content = $content.Replace("'Agent 执行失败'", "t('script.agentFailed')")
$content = $content.Replace("'Auto A/B 执行失败'", "t('script.autoAbFailed')")
$content = $content.Replace("'请至少选择一个模板进行批量生成'", "t('script.selectTemplateBatch')")
$content = $content.Replace("'请至少输入一种风格调性'", "t('script.enterStyleBatch')")
$content = $content.Replace("'请先选择商品上下文'", "t('script.selectProductFirst')")

# Generate progress messages
$content = $content.Replace("'Agent 正在理解商品并生成剧本...'", "t('script.agentProgress')")
$content = $content.Replace("'正在组合生成剧本...'", "t('script.composedProgress')")
$content = $content.Replace("'正在混合自定义生成剧本...'", "t('script.hybridProgress')")
$content = $content.Replace("'正在上传视频并分析...'", "t('script.viralUploadProgress')")
$content = $content.Replace("'正在分析爆款视频结构...'", "t('script.viralAnalyzeProgress')")
$content = $content.Replace("'Auto A/B Agent 正在启动多版本对比管线...'", "t('script.autoAbProgress')")
$content = $content.Replace("'请先选择要上传的视频文件'", "t('script.selectVideoFile')")
$content = $content.Replace("'请先从剧本列表中选择一个基准剧本，再使用 A/B 对比模式'", "t('script.selectBaseScript')")

# Insert exceeded message
$content = $content.Replace("'插入新分镜后总时长将超过 15 秒，请先缩短现有分镜或删除分镜后再插入'", "t('script.insertExceeded')")

# Dynamic success messages (these use template literals - handle carefully)
$content = $content.Replace("'生成真实剧本'", "t('script.generateBtn')")

[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "Done"
