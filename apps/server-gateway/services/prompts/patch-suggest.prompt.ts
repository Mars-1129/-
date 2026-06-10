// =============================================================================
// TikStream AI — Patch Suggest Prompt Builder
// =============================================================================
// 用于 AI 辅助 PATCH 建议——分析用户 PATCH 操作后提供连贯性修复建议
// =============================================================================

import { Injectable } from '@nestjs/common';

export interface PatchSuggestPromptParams {
  original_script_json: Record<string, unknown>;
  patched_script_json: Record<string, unknown>;
  operations_summary: string;
  language: string;
}

export interface PatchSuggestPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

@Injectable()
export class PatchSuggestPromptBuilder {
  build(params: PatchSuggestPromptParams): PatchSuggestPromptResult {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(params);
    return { systemPrompt, userPrompt };
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [];

    parts.push('你是一名专业的短视频剧本编辑顾问。');
    parts.push('用户对剧本做了局部修改，你需要分析这些修改的影响，');
    parts.push('并建议还需要同步调整哪些内容来保持整体连贯性。');
    parts.push('');
    parts.push('你的分析维度包括：');
    parts.push('1. 叙事连贯性：修改后是否需要调整邻近分镜的台词或描述');
    parts.push('2. 节奏一致性：修改后是否需要调整分镜时长');
    parts.push('3. 转场连贯性：修改后是否需要调整转场类型');
    parts.push('4. BGM 适配性：修改后是否需要调整 BGM 分段');
    parts.push('');
    parts.push('输出 ONLY valid JSON，格式为：');
    parts.push('{');
    parts.push('  "impact_analysis": "一句话分析修改的核心影响",');
    parts.push('  "suggested_patches": [');
    parts.push('    { "op": "replace", "path": "/shots/{index}/{field}", "value": ..., "reason": "建议原因" }');
    parts.push('  ],');
    parts.push('  "confidence": "high/medium/low"');
    parts.push('}');
    parts.push('');
    parts.push('suggested_patches 仅包含确实需要修改的建议（可能为空数组）。');
    parts.push('reason 字段用中文简要说明建议原因。');

    return parts.join('\n');
  }

  private buildUserPrompt(params: PatchSuggestPromptParams): string {
    const parts: string[] = [];

    parts.push(`语言: ${params.language}`);
    parts.push('');
    parts.push('用户执行了以下修改操作：');
    parts.push(params.operations_summary);
    parts.push('');
    parts.push('修改前的原始剧本：');
    parts.push('```json');
    parts.push(JSON.stringify(params.original_script_json, null, 2));
    parts.push('```');
    parts.push('');
    parts.push('修改后的剧本：');
    parts.push('```json');
    parts.push(JSON.stringify(params.patched_script_json, null, 2));
    parts.push('```');
    parts.push('');
    parts.push('请分析修改的影响并给出建议的补充修改。');

    return parts.join('\n');
  }
}
