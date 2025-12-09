/**
 * Context editing middleware.
 *
 * This middleware mirrors Anthropic's context editing capabilities by clearing
 * older tool results once the conversation grows beyond a configurable token
 * threshold. The implementation is intentionally model-agnostic so it can be used
 * with any LangChain chat model.
 */
import { z } from "zod/v3";
import { z as z4 } from "zod/v4";
import {
  BaseMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
  isAIMessage,
  isToolMessage,
} from "@langchain/core/messages";
import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { interopSafeParse, InferInteropZodInput } from "@langchain/core/utils/types";
import { Injectable } from "@nestjs/common";
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
} from "@xpert-ai/plugin-sdk";
import { TAgentMiddlewareMeta } from "@metad/contracts";
import { countTokensApproximately } from "./utils";
import {
  getProfileLimits,
  contextSizeSchema,
  keepSchema,
  type ContextSize,
  type KeepSize,
  type TokenCounter,
} from "./summarization";

const DEFAULT_TOOL_PLACEHOLDER = "[cleared]";
const DEFAULT_TRIGGER_TOKENS = 100_000;
const DEFAULT_KEEP = 3;

/**
 * Protocol describing a context editing strategy.
 *
 * Implement this interface to create custom strategies for managing
 * conversation context size. The `apply` method should modify the
 * messages array in-place and return the updated token count.
 */
export interface ContextEdit {
  /**
   * Apply an edit to the message list, returning the new token count.
   *
   * This method should:
   * 1. Check if editing is needed based on `tokens` parameter
   * 2. Modify the `messages` array in-place (if needed)
   * 3. Return the new token count after modifications
   *
   * @param params - Parameters for the editing operation
   * @returns The updated token count after applying edits
   */
  apply(params: {
    /**
     * Array of messages to potentially edit (modify in-place)
     */
    messages: BaseMessage[];
    /**
     * Function to count tokens in a message array
     */
    countTokens: TokenCounter;
    /**
     * Optional model instance for model profile information
     */
    model?: BaseLanguageModel;
  }): void | Promise<void>;
}

/**
 * Configuration for clearing tool outputs when token limits are exceeded.
 */
export interface ClearToolUsesEditConfig {
  /**
   * Trigger conditions for context editing.
   * Can be a single condition object (all properties must be met) or an array of conditions (any condition must be met).
   */
  trigger?: ContextSize | ContextSize[];
  /**
   * Context retention policy applied after editing.
   * Specify how many tool results to preserve using messages, tokens, or fraction.
   */
  keep?: KeepSize;
  /**
   * Whether to clear the originating tool call parameters on the AI message.
   * @default false
   */
  clearToolInputs?: boolean;
  /**
   * List of tool names to exclude from clearing.
   * @default []
   */
  excludeTools?: string[];
  /**
   * Placeholder text inserted for cleared tool outputs.
   * @default "[cleared]"
   */
  placeholder?: string;
}

/**
 * Strategy for clearing tool outputs when token limits are exceeded.
 *
 * This strategy mirrors Anthropic's `clear_tool_uses_20250919` behavior by
 * replacing older tool results with a placeholder text when the conversation
 * grows too large. It preserves the most recent tool results and can exclude
 * specific tools from being cleared.
 */
export class ClearToolUsesEdit implements ContextEdit {
  #triggerConditions: ContextSize[];
  trigger: ContextSize | ContextSize[];
  keep: KeepSize;
  clearToolInputs: boolean;
  excludeTools: Set<string>;
  placeholder: string;

  constructor(config: ClearToolUsesEditConfig = {}) {
    // Set defaults
    let trigger: ContextSize | ContextSize[] | undefined = config.trigger;
    let keep: KeepSize | undefined = config.keep;

    if (trigger === undefined) {
      trigger = { tokens: DEFAULT_TRIGGER_TOKENS };
    }
    if (keep === undefined) {
      keep = { messages: DEFAULT_KEEP };
    }

    // Validate trigger conditions
    if (Array.isArray(trigger)) {
      this.#triggerConditions = trigger.map((t) => contextSizeSchema.parse(t));
      this.trigger = this.#triggerConditions;
    } else {
      const validated = contextSizeSchema.parse(trigger);
      this.#triggerConditions = [validated];
      this.trigger = validated;
    }

    // Validate keep
    const validatedKeep = keepSchema.parse(keep);
    this.keep = validatedKeep;

    this.clearToolInputs = config.clearToolInputs ?? false;
    this.excludeTools = new Set(config.excludeTools ?? []);
    this.placeholder = config.placeholder ?? DEFAULT_TOOL_PLACEHOLDER;
  }

  async apply(params: {
    messages: BaseMessage[];
    model: BaseLanguageModel;
    countTokens: TokenCounter;
  }): Promise<void> {
    const { messages, model, countTokens } = params;
    const tokens = await countTokens(messages);

    /**
     * Always remove orphaned tool messages (those without corresponding AI messages)
     * regardless of whether editing is triggered
     */
    const orphanedIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (isToolMessage(msg)) {
        // Check if this tool message has a corresponding AI message
        const aiMessage = this.#findAIMessageForToolCall(
          messages.slice(0, i),
          msg.tool_call_id
        );
        if (!aiMessage) {
          // Orphaned tool message - mark for removal
          orphanedIndices.push(i);
        } else {
          // Check if the AI message actually has this tool call
          const toolCall = aiMessage.tool_calls?.find(
            (call) => call.id === msg.tool_call_id
          );
          if (!toolCall) {
            // Orphaned tool message - mark for removal
            orphanedIndices.push(i);
          }
        }
      }
    }

    /**
     * Remove orphaned tool messages in reverse order to maintain indices
     */
    for (let i = orphanedIndices.length - 1; i >= 0; i--) {
      messages.splice(orphanedIndices[i]!, 1);
    }

    /**
     * Recalculate tokens after removing orphaned messages
     */
    let currentTokens = tokens;
    if (orphanedIndices.length > 0) {
      currentTokens = await countTokens(messages);
    }

    /**
     * Check if editing should be triggered
     */
    if (!this.#shouldEdit(messages, currentTokens, model)) {
      return;
    }

    /**
     * Find all tool message candidates with their actual indices in the messages array
     */
    const candidates: { idx: number; msg: ToolMessage }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (isToolMessage(msg)) {
        candidates.push({ idx: i, msg: msg as ToolMessage });
      }
    }

    if (candidates.length === 0) {
      return;
    }

    /**
     * Determine how many tool results to keep based on keep policy
     */
    const keepCount = await this.#determineKeepCount(
      candidates,
      countTokens,
      model
    );

    /**
     * Keep the most recent tool messages based on keep policy
     */
    const candidatesToClear =
      keepCount >= candidates.length
        ? []
        : keepCount > 0
        ? candidates.slice(0, -keepCount)
        : candidates;

    for (const { idx, msg: toolMessage } of candidatesToClear) {
      /**
       * Skip if already cleared
       */
      const contextEditing = toolMessage.response_metadata?.["context_editing"] as
        | { cleared?: boolean }
        | undefined;
      if (contextEditing?.cleared) {
        continue;
      }

      /**
       * Find the corresponding AI message
       */
      const aiMessage = this.#findAIMessageForToolCall(
        messages.slice(0, idx),
        toolMessage.tool_call_id
      );
      if (!aiMessage) {
        continue;
      }

      /**
       * Find the corresponding tool call
       */
      const toolCall = aiMessage.tool_calls?.find(
        (call) => call.id === toolMessage.tool_call_id
      );
      if (!toolCall) {
        continue;
      }

      /**
       * Skip if tool is excluded
       */
      const toolName = toolMessage.name || toolCall.name;
      if (this.excludeTools.has(toolName)) {
        continue;
      }

      /**
       * Clear the tool message
       */
      messages[idx] = new ToolMessage({
        tool_call_id: toolMessage.tool_call_id,
        content: this.placeholder,
        name: toolMessage.name,
        artifact: undefined,
        response_metadata: {
          ...toolMessage.response_metadata,
          context_editing: {
            cleared: true,
            strategy: "clear_tool_uses",
          },
        },
      });

      /**
       * Optionally clear the tool inputs
       */
      if (this.clearToolInputs) {
        const aiMsgIdx = messages.indexOf(aiMessage);
        if (aiMsgIdx >= 0) {
          messages[aiMsgIdx] = this.#buildClearedToolInputMessage(
            aiMessage,
            toolMessage.tool_call_id
          );
        }
      }
    }
  }

  /**
   * Determine whether editing should run for the current token usage
   */
  #shouldEdit(
    messages: BaseMessage[],
    totalTokens: number,
    model: BaseLanguageModel
  ): boolean {
    console.log(this.#triggerConditions, 'this.#triggerConditions');
    /**
     * Check each condition (OR logic between conditions)
     */
    for (const trigger of this.#triggerConditions) {
      /**
       * Within a single condition, all specified properties must be satisfied (AND logic)
       */
      let conditionMet = true;
      let hasAnyProperty = false;

      if (trigger.messages !== undefined && trigger.messages !== null) {
        hasAnyProperty = true;
        if (messages.length < trigger.messages) {
          conditionMet = false;
        }
      }

      if (trigger.tokens !== undefined && trigger.tokens !== null) {
        hasAnyProperty = true;
        if (totalTokens < trigger.tokens) {
          conditionMet = false;
        }
      }

      if (trigger.fraction !== undefined && trigger.fraction !== null) {
        hasAnyProperty = true;
        if (!model) {
          continue;
        }
        const maxInputTokens = getProfileLimits(model);
        if (typeof maxInputTokens === "number") {
          const threshold = Math.floor(maxInputTokens * trigger.fraction);
          if (threshold <= 0) {
            continue;
          }
          if (totalTokens < threshold) {
            conditionMet = false;
          }
        } else {
          /**
           * If fraction is specified but we can't get model limits, skip this condition
           */
          continue;
        }
      }

      /**
       * If condition has at least one property and all properties are satisfied, trigger editing
       */
      if (hasAnyProperty && conditionMet) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine how many tool results to keep based on keep policy
   */
  async #determineKeepCount(
    candidates: Array<{ idx: number; msg: ToolMessage }>,
    countTokens: TokenCounter,
    model: BaseLanguageModel
  ): Promise<number> {
    if ("messages" in this.keep && this.keep.messages !== undefined && this.keep.messages !== null) {
      return this.keep.messages;
    }

    if ("tokens" in this.keep && this.keep.tokens !== undefined && this.keep.tokens !== null) {
      /**
       * For token-based keep, count backwards from the end until we exceed the token limit
       */
      const targetTokens = this.keep.tokens;
      let tokenCount = 0;
      let keepCount = 0;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const candidate = candidates[i];
        /**
         * Estimate tokens for this tool message
         */
        const msgTokens = await countTokens([candidate.msg]);
        if (tokenCount + msgTokens <= targetTokens) {
          tokenCount += msgTokens;
          keepCount++;
        } else {
          break;
        }
      }
      return keepCount;
    }

    if ("fraction" in this.keep && this.keep.fraction !== undefined && this.keep.fraction !== null) {
      if (!model) {
        return DEFAULT_KEEP;
      }
      const maxInputTokens = getProfileLimits(model);
      if (typeof maxInputTokens === "number") {
        const targetTokens = Math.floor(maxInputTokens * this.keep.fraction);
        if (targetTokens <= 0) {
          return DEFAULT_KEEP;
        }
        /**
         * Use token-based logic with fractional target
         */
        let tokenCount = 0;
        let keepCount = 0;
        for (let i = candidates.length - 1; i >= 0; i--) {
          const candidate = candidates[i];
          const msgTokens = await countTokens([candidate.msg]);
          if (tokenCount + msgTokens <= targetTokens) {
            tokenCount += msgTokens;
            keepCount++;
          } else {
            break;
          }
        }
        return keepCount;
      }
    }

    return DEFAULT_KEEP;
  }

  #findAIMessageForToolCall(
    previousMessages: BaseMessage[],
    toolCallId: string
  ): AIMessage | null {
    // Search backwards through previous messages
    for (let i = previousMessages.length - 1; i >= 0; i--) {
      const msg = previousMessages[i];
      if (isAIMessage(msg)) {
        const hasToolCall = msg.tool_calls?.some(
          (call) => call.id === toolCallId
        );
        if (hasToolCall) {
          return msg;
        }
      }
    }
    return null;
  }

  #buildClearedToolInputMessage(
    message: AIMessage,
    toolCallId: string
  ): AIMessage {
    const updatedToolCalls = message.tool_calls?.map((toolCall) => {
      if (toolCall.id === toolCallId) {
        return { ...toolCall, args: {} };
      }
      return toolCall;
    });

    const metadata = { ...message.response_metadata };
    const contextEntry = {
      ...(metadata["context_editing"] as Record<string, unknown>),
    };
    const clearedIds = new Set<string>(
      contextEntry["cleared_tool_inputs"] as string[] | undefined
    );
    clearedIds.add(toolCallId);
    contextEntry["cleared_tool_inputs"] = Array.from(clearedIds).sort();
    metadata["context_editing"] = contextEntry;

    return new AIMessage({
      content: message.content,
      tool_calls: updatedToolCalls,
      response_metadata: metadata,
      id: message.id,
      name: message.name,
      additional_kwargs: message.additional_kwargs,
    });
  }
}

/**
 * Configuration schema for the Context Editing Middleware.
 */
const contextEditingConfigSchema = z.object({
  trigger: contextSizeSchema.nullable().optional(),
  keep: keepSchema.nullable().optional(),
  clearToolInputs: z.boolean().nullable().optional(),
  excludeTools: z.array(z.string()).nullable().optional(),
  placeholder: z.string().nullable().optional(),
  tokenCountMethod: z.enum(["approx", "model"]).nullable().optional(),
});

export type ContextEditingMiddlewareConfig = InferInteropZodInput<
  typeof contextEditingConfigSchema
>;

/**
 * Context Editing Middleware that automatically prunes tool results to manage context size.
 *
 * This middleware applies context edits when the total input token count
 * exceeds configured thresholds. By default, it uses the `ClearToolUsesEdit` strategy
 * which mirrors Anthropic's `clear_tool_uses_20250919` behaviour by clearing older
 * tool results once the conversation exceeds 100,000 tokens.
 */
@Injectable()
@AgentMiddlewareStrategy("ContextEditingMiddleware")
export class ContextEditingMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = {
    name: "ContextEditingMiddleware",
    label: {
      en_US: "Context Editing Middleware",
      zh_Hans: "上下文编辑中间件",
    },
    icon: {
      type: "svg",
      value: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M11 4H4V20H11V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20 4H13V12H20V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20 15H13V20H20V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7 8H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M7 12H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M7 16H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`,
    },
    description: {
      en_US:
        "Middleware that automatically clears older tool results to manage context size, mirroring Anthropic's context editing capabilities.",
      zh_Hans:
        "自动清理旧工具结果以管理上下文大小的中间件，镜像 Anthropic 的上下文编辑功能。",
    },
    configSchema: {
      type: "object",
      properties: {
        trigger: {
          type: "object",
          title: {
            en_US: "Trigger Conditions",
            zh_Hans: "触发条件",
          },
          properties: {
            fraction: {
              type: "number",
              title: {
                en_US: "Fraction of Context Size",
                zh_Hans: "上下文大小的比例",
              },
              description: {
                en_US:
                  "Fraction of the model's context size to use to trigger context editing",
                zh_Hans: "用作触发上下文编辑的模型上下文大小的比例",
              },
            },
            tokens: {
              type: "number",
              title: {
                en_US: "Number of Tokens",
                zh_Hans: "词元数量",
              },
              description: {
                en_US: "Number of tokens to use as the trigger (default: 100000)",
                zh_Hans: "用作触发的词元数量（默认：100000）",
              },
            },
            messages: {
              type: "number",
              title: {
                en_US: "Number of Messages",
                zh_Hans: "消息数量",
              },
              description: {
                en_US: "Number of messages to use as the trigger",
                zh_Hans: "用作触发的消息数量",
              },
            },
          },
        },
        keep: {
          type: "object",
          title: {
            en_US: "Keep Settings",
            zh_Hans: "保留设置",
          },
          properties: {
            fraction: {
              type: "number",
              title: {
                en_US: "Fraction of Context Size",
                zh_Hans: "上下文大小的比例",
              },
              description: {
                en_US:
                  "Fraction of the model's context size for tool results to always keep",
                zh_Hans: "始终保留的工具结果占模型上下文大小的比例",
              },
            },
            tokens: {
              type: "number",
              title: {
                en_US: "Number of Tokens",
                zh_Hans: "词元数量",
              },
              description: {
                en_US: "Number of tokens for tool results to always keep",
                zh_Hans: "始终保留的工具结果词元数量",
              },
            },
            messages: {
              type: "number",
              title: {
                en_US: "Messages to Keep",
                zh_Hans: "保留的消息数量",
              },
              description: {
                en_US:
                  "Number of recent tool results to always keep (default: 3)",
                zh_Hans: "始终保留的最近工具结果数量（默认：3）",
              },
            },
          },
        },
        clearToolInputs: {
          type: "boolean",
          title: {
            en_US: "Clear Tool Inputs",
            zh_Hans: "清除工具输入",
          },
          description: {
            en_US:
              "Whether to clear the originating tool call parameters on the AI message",
            zh_Hans: "是否清除 AI 消息上的原始工具调用参数",
          },
        },
        excludeTools: {
          type: "array",
          title: {
            en_US: "Exclude Tools",
            zh_Hans: "排除的工具",
          },
          description: {
            en_US: "List of tool names to exclude from clearing",
            zh_Hans: "排除清除的工具名称列表",
          },
          items: {
            type: "string",
          },
          "x-ui": {
            component: "tags",
            span: 2,
          },
        },
        placeholder: {
          type: "string",
          title: {
            en_US: "Placeholder Text",
            zh_Hans: "占位文本",
          },
          description: {
            en_US: 'Placeholder text inserted for cleared tool outputs (default: "[cleared]")',
            zh_Hans: '为已清除的工具输出插入的占位文本（默认："[cleared]"）',
          },
        },
        tokenCountMethod: {
          type: "string",
          title: {
            en_US: "Token Count Method",
            zh_Hans: "词元计数方法",
          },
          description: {
            en_US:
              'Method for counting tokens: "approx" for approximate (faster), "model" for exact model counting (slower but more accurate)',
            zh_Hans:
              '词元计数方法："approx" 为近似计数（较快），"model" 为精确模型计数（较慢但更准确）',
          },
          enum: ["approx", "model"],
          "x-ui": {
            component: "select",
          },
        },
      },
    },
  };

  async createMiddleware(
    options: ContextEditingMiddlewareConfig,
    context: IAgentMiddlewareContext
  ): Promise<AgentMiddleware> {
    const { data: userOptions, error } = interopSafeParse(
      contextEditingConfigSchema,
      options
    );
    if (error) {
      throw new Error(
        `Invalid context editing middleware options: ${z4.prettifyError(error)}`
      );
    }

    // Create the ClearToolUsesEdit instance with validated options
    const edit = new ClearToolUsesEdit({
      trigger: userOptions.trigger ?? undefined,
      keep: userOptions.keep ?? undefined,
      clearToolInputs: userOptions.clearToolInputs ?? false,
      excludeTools: userOptions.excludeTools ?? [],
      placeholder: userOptions.placeholder ?? DEFAULT_TOOL_PLACEHOLDER,
    });

    const tokenCountMethod = userOptions.tokenCountMethod ?? "approx";

    return {
      name: "ContextEditingMiddleware",
      tools: [],
      wrapModelCall: async (request, handler) => {
        if (!request.messages || request.messages.length === 0) {
          return handler(request);
        }

        /**
         * Use model's token counting method
         */
        const systemMsg = request.systemMessage
          ? [request.systemMessage]
          : [];
        const countTokens: TokenCounter =
          tokenCountMethod === "approx"
            ? countTokensApproximately
            : async (messages: BaseMessage[]): Promise<number> => {
                const allMessages = [...systemMsg, ...messages];
                /**
                 * Check if model has getNumTokensFromMessages method
                 * currently only OpenAI models have this method
                 */
                if ("getNumTokensFromMessages" in request.model) {
                  return (
                    request.model as BaseLanguageModel & {
                      getNumTokensFromMessages: (
                        messages: BaseMessage[]
                      ) => Promise<{
                        totalCount: number;
                        countPerMessage: number[];
                      }>;
                    }
                  )
                    .getNumTokensFromMessages(allMessages)
                    .then(({ totalCount }) => totalCount);
                }
                // Fallback to approximate counting if model doesn't support exact counting
                return countTokensApproximately(allMessages);
              };

        /**
         * Apply the edit
         */
        await edit.apply({
          messages: request.messages,
          model: request.model as BaseLanguageModel,
          countTokens,
        });

        return handler(request);
      },
    };
  }
}

