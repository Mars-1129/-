// =============================================================================
// TikStream AI — Doubao ChatModel Adapter (LangChain BaseChatModel)
// 将 DoubaoTextProvider 封装为 LangChain 标准 ChatModel，供 LangGraph 使用
// =============================================================================

import { SimpleChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseLanguageModelCallOptions } from '@langchain/core/language_models/base';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { DoubaoTextProvider } from './doubao-text.provider';

export interface DoubaoChatModelCallOptions extends BaseLanguageModelCallOptions {
  /** 自定义 system prompt 注入（覆盖 messages 中的 SystemMessage） */
  systemPrompt?: string;
}

/**
 * Doubao ChatModel
 * 
 * 将 DoubaoTextProvider.generateText(systemPrompt, userPrompt) 适配为
 * LangChain BaseChatModel 接口，使豆包 LLM 可以直接在 LangGraph 节点中使用。
 * 
 * 消息映射规则：
 *   - SystemMessage → system prompt
 *   - HumanMessage → user prompt
 *   - 多个 HumanMessage 会被合并为一段 user prompt
 */
export class DoubaoChatModel extends SimpleChatModel<DoubaoChatModelCallOptions> {
  private doubaoProvider: DoubaoTextProvider;

  constructor(fields: BaseChatModelParams & { doubaoProvider: DoubaoTextProvider }) {
    super(fields);
    this.doubaoProvider = fields.doubaoProvider;
  }

  _llmType(): string {
    return 'doubao-seed-2-0-pro';
  }

  /**
   * 核心调用方法——LangGraph 节点调用 llm.invoke(messages) 时触发
   */
  async _call(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<string> {
    const systemMessages = messages.filter((m) => m._getType() === 'system');
    const humanMessages = messages.filter((m) => m._getType() === 'human');

    const systemPrompt =
      options.systemPrompt ||
      (systemMessages.map((m) => m.content).join('\n') ||
      'You are a helpful assistant.');

    const userPrompt =
      humanMessages.map((m) => m.content).join('\n') ||
      messages
        .filter((m) => m._getType() !== 'system')
        .map((m) => m.content)
        .join('\n');

    const result = await this.doubaoProvider.generateText(
      typeof systemPrompt === 'string' ? systemPrompt : String(systemPrompt),
      typeof userPrompt === 'string' ? userPrompt : String(userPrompt),
    );

    return result;
  }
}
