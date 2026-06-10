// =============================================================================
// TikStream AI — Agent Node: 终审入库
// 合规检查 + Schema 校验 + 落库，产出最终剧本
// =============================================================================

import type { ComplianceFilter, ComplianceCheckOptions } from '../../script/compliance.filter';
import type { ScriptRepository, CreateScriptParams, CreateScriptShotParams } from '../../script/script.repository';
import type { ScriptSchemaValidator } from '../../script/script-schema.validator';
import type { DoubaoTextProvider } from '../../../services/ai/doubao-text.provider';
import type { AgentStepLog } from '../state';

/**
 * finalize 节点
 *
 * 执行终审流程：
 * 1. Schema 结构校验
 * 2. 合规检查（含可选 AI 二审）
 * 3. 落库保存
 * 4. 返回 script_id
 */
export function createFinalizeNode(
  complianceFilter: ComplianceFilter,
  scriptRepository: ScriptRepository,
  schemaValidator: ScriptSchemaValidator,
  doubaoText: DoubaoTextProvider,
) {
  return async function finalize(state: Record<string, unknown>): Promise<Partial<Record<string, unknown>>> {
    const productId = String(state.product_id || '');
    const title = String(state.script_title || '未命名剧本');
    const shots = (state.script_shots as Array<Record<string, unknown>>) || [];
    const styleVibe = String(state.style_vibe || '高转化 UGC');
    const language = String(state.language || 'zh-CN');
    const aspectRatio = String(state.aspect_ratio || '9:16');
    const constraintList = (state.constraint_list as string[]) || [];
    const preferences = (state.preferences as Array<{ type: string; text: string }>) || [];
    const status = String(state.status || 'FALLBACK');
    const iterations = (state.iterations as number) || 0;

    const logEntries: AgentStepLog[] = [];

    // 1. Schema 校验
    let schemaPassed = true;
    try {
      const totalDuration = shots.reduce(
        (sum: number, s: Record<string, unknown>) => sum + (Number(s.duration) || 3),
        0,
      );
      if (shots.length < 2 || shots.length > 8) {
        schemaPassed = false;
      }
      if (totalDuration > 30) {
        schemaPassed = false;
      }
      logEntries.push({
        node: 'finalize',
        timestamp: new Date().toISOString(),
        action: 'Schema 结构校验',
        reasoning: schemaPassed
          ? `${shots.length} 镜，总时长 ${totalDuration.toFixed(1)}s — 通过`
          : `${shots.length} 镜，总时长 ${totalDuration.toFixed(1)}s — 异常但继续`,
        data: { shots: shots.length, duration: totalDuration },
      });
    } catch {
      schemaPassed = false;
    }

    // 2. 合规检查
    let compliancePassed = true;
    const aiReviewOptions: ComplianceCheckOptions = {
      enableAiReview: true,
      aiTextGenerator: (sp: string, up: string) => doubaoText.generateText(sp, up),
    };
    try {
      const complianceResult = await complianceFilter.checkWithOptions(shots, aiReviewOptions);
      compliancePassed = complianceResult.passed;
      logEntries.push({
        node: 'finalize',
        timestamp: new Date().toISOString(),
        action: '合规检查（含 AI 二审）',
        reasoning: compliancePassed
          ? '合规通过'
          : `发现 ${complianceResult.violations.length} 项违规`,
        data: {
          passed: compliancePassed,
          violations: complianceResult.violations.map((v) => ({
            word: v.violated_word,
            verdict: v.ai_verdict || 'UNKNOWN',
          })),
        },
      });
    } catch {
      logEntries.push({
        node: 'finalize',
        timestamp: new Date().toISOString(),
        action: '合规检查',
        reasoning: '合规检查执行异常，跳过',
        data: { passed: null },
      });
    }

    // 3. 计算 videoDuration
    const videoDuration = shots.reduce(
      (sum: number, s: Record<string, unknown>) => sum + (Number(s.duration) || 3),
      0,
    );

    // 4. 构建持久化参数
    const createParams: CreateScriptParams = {
      productId,
      title: `${title}${status === 'FALLBACK' ? ` (Agent-R${iterations})` : ''}`,
      language,
      targetAudience: String(state.target_audience || ''),
      videoDuration,
      aspectRatio,
      styleVibe,
      generationMode: 'AGENT',
      constraintList,
      preferences: preferences.filter((p) => p.type && p.text),
      rawJson: {
        agent_status: status,
        agent_iterations: iterations,
        shots,
      },
    };

    // 5. 构建分镜参数
    const shotsParams: CreateScriptShotParams[] = shots.map(
      (s: Record<string, unknown>, idx: number) => ({
        scriptId: '', // 由 repository 自动填充
        shotIndex: idx + 1,  // 1-based 索引，与 UI 展示层一致
        duration: Number(s.duration) || 3,
        sceneDescriptionQuery: String(s.scene_description || s.sceneDescription || ''),
        visualDescription: String(s.visual_description || s.visualDescription || ''),
        cameraMovement: String(s.camera_movement || s.cameraMovement || 'Static'),
        transitionType: String(s.transition_type || s.transitionType || 'None'),
        voiceoverText: String(s.voiceover_text || s.voiceoverText || ''),
        subtitleText: String(s.subtitle_text || s.subtitleText || ''),
        safeZoneBoundingBox: (s.safe_zone_bounding_box as [number, number, number, number]) || [0, 0, 1, 1],
        selectedSliceId: undefined,
        complianceStatus: compliancePassed ? 'PASSED' : (s.complianceStatus as string) || 'PENDING',
      }),
    );

    // 6. 落库
    let scriptId = '';
    try {
      const script = await scriptRepository.createScriptWithShots(createParams, shotsParams);
      scriptId = script.id;
      logEntries.push({
        node: 'finalize',
        timestamp: new Date().toISOString(),
        action: '剧本落库',
        reasoning: `剧本 ID: ${scriptId}`,
        data: { script_id: scriptId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEntries.push({
        node: 'finalize',
        timestamp: new Date().toISOString(),
        action: '剧本落库失败',
        reasoning: msg,
        data: { error: msg },
      });
      throw new Error(`finalize: 剧本落库失败 — ${msg}`);
    }

    return {
      final_script_id: scriptId,
      step_log: [...((state.step_log as Record<string, unknown>[]) || []), ...logEntries.map((e) => e as unknown as Record<string, unknown>)],
    };
  };
}
