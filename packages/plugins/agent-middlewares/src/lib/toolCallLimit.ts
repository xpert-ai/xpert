import { z } from "zod/v3";
import { z as z4 } from "zod/v4";
import { Injectable } from "@nestjs/common";
import {
  AgentMiddlewareStrategy,
  IAgentMiddlewareStrategy,
  IAgentMiddlewareContext,
} from "@xpert-ai/plugin-sdk";
import {
  TAgentMiddlewareMeta,
  JsonSchemaObjectType,
} from "@metad/contracts";
import {
  interopSafeParse,
  InferInteropZodInput,
} from "@langchain/core/utils/types";
import {
  AIMessage,
  BaseMessage,
  ToolMessage,
  isAIMessage,
} from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/dist/messages/tool";

/**
 * Exit behavior when tool call limits are exceeded
 */
export type ExitBehavior = "continue" | "error" | "end";

/**
 * Configuration Schema definition
 */
const toolCallLimitSchema = z.object({
  toolName: z.string().nullable().optional(),
  threadLimit: z.number().positive().nullable().optional(),
  runLimit: z.number().positive().nullable().optional(),
  exitBehavior: z.enum(["continue", "error", "end"]).default("continue"),
}).refine(
  (data) => {
    // At least one limit must be specified
    return data.threadLimit !== null || data.runLimit !== null;
  },
  {
    message: "At least one limit must be specified (threadLimit or runLimit)",
  }
).refine(
  (data) => {
    // If both limits are specified, runLimit should not exceed threadLimit
    if (
      data.threadLimit !== null &&
      data.runLimit !== null &&
      data.runLimit > data.threadLimit
    ) {
      return false;
    }
    return true;
  },
  {
    message:
      "runLimit cannot exceed threadLimit. The run limit should be less than or equal to the thread limit.",
  }
);

export type ToolCallLimitMiddlewareConfig = InferInteropZodInput<
  typeof toolCallLimitSchema
>;

/**
 * State schema for tracking tool call counts
 */
const toolCallLimitStateSchema = z.object({
  threadToolCallCount: z.record(z.string(), z.number()).optional(),
  runToolCallCount: z.record(z.string(), z.number()).optional(),
});

export type ToolCallLimitState = z.infer<typeof toolCallLimitStateSchema>;

/**
 * Exception raised when tool call limits are exceeded
 */
export class ToolCallLimitExceededError extends Error {
  constructor(
    public readonly threadCount: number,
    public readonly runCount: number,
    public readonly threadLimit: number | null,
    public readonly runLimit: number | null,
    public readonly toolName: string | null = null
  ) {
    const toolDesc = toolName ? `'${toolName}' tool` : "Tool";
    const exceededLimits: string[] = [];

    if (threadLimit !== null && threadCount > threadLimit) {
      exceededLimits.push(
        `thread limit exceeded (${threadCount}/${threadLimit} calls)`
      );
    }
    if (runLimit !== null && runCount > runLimit) {
      exceededLimits.push(
        `run limit exceeded (${runCount}/${runLimit} calls)`
      );
    }

    const limitsText = exceededLimits.join(" and ");
    super(`${toolDesc} call limit reached: ${limitsText}.`);
    this.name = "ToolCallLimitExceededError";
  }
}

/**
 * Build error message content for ToolMessage when limit is exceeded
 * This message is sent to the model, so it should not reference thread/run concepts
 */
function buildToolMessageContent(
  toolName: string | null,
  threadLimit: number | null,
  runLimit: number | null
): string {
  const limitInfo: string[] = [];
  if (threadLimit !== null) limitInfo.push(`thread limit: ${threadLimit}`);
  if (runLimit !== null) limitInfo.push(`run limit: ${runLimit}`);
  
  const limitText = limitInfo.length > 0 ? ` (${limitInfo.join(", ")})` : "";
  
  if (toolName) {
    return `Tool call limit exceeded${limitText}. Do not call '${toolName}' again.`;
  }
  return `Tool call limit exceeded${limitText}. Do not make additional tool calls.`;
}

/**
 * Build final AI message content for 'end' behavior
 * This message is displayed to the user, so it should include detailed information
 */
function buildFinalAIMessageContent(
  threadCount: number,
  runCount: number,
  threadLimit: number | null,
  runLimit: number | null,
  toolName: string | null
): string {
  const toolDesc = toolName ? `'${toolName}' tool` : "Tool";
  const exceededLimits: string[] = [];

  if (threadLimit !== null && threadCount >= threadLimit) {
    exceededLimits.push(
      `thread limit exceeded (${threadCount}/${threadLimit} calls)`
    );
  }
  if (runLimit !== null && runCount >= runLimit) {
    exceededLimits.push(
      `run limit exceeded (${runCount}/${runLimit} calls)`
    );
  }

  const limitsText = exceededLimits.join(" and ");
  return `⚠️ ${toolDesc} call limit reached: ${limitsText}. Execution stopped.`;
}

/**
 * Build user-facing error message for 'continue' behavior
 * This message will be included in the response to inform the user
 */
function buildUserErrorMessage(
  blockedCount: number,
  threadCount: number,
  runCount: number,
  threadLimit: number | null,
  runLimit: number | null,
  toolName: string | null
): string {
  const toolDesc = toolName ? `'${toolName}' tool` : "Tool";
  const limits: string[] = [];
  if (threadLimit !== null) limits.push(`thread: ${threadCount}/${threadLimit}`);
  if (runLimit !== null) limits.push(`run: ${runCount}/${runLimit}`);
  
  return `⚠️ ${blockedCount} ${toolDesc} call(s) blocked due to limit (${limits.join(", ")}). Please try again later or adjust the limits.`;
}

/**
 * Tool Call Limit Middleware
 *
 * Track tool call counts and enforce limits during agent execution.
 * This middleware monitors the number of tool calls made and can terminate or
 * restrict execution when limits are exceeded. It supports both thread-level
 * (persistent across runs) and run-level (per invocation) call counting.
 */
@Injectable()
@AgentMiddlewareStrategy("ToolCallLimitMiddleware")
export class ToolCallLimitMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = {
    name: "ToolCallLimitMiddleware",
    label: {
      en_US: "Tool Call Limit Middleware",
      zh_Hans: "工具调用限制中间件",
    },
    icon: {
      type: "svg",
      value: `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" style="display: block;" viewBox="0 0 2048 2048" width="512" height="512" preserveAspectRatio="none">
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 1024 64 C 512.5 64 64 512.5 64 1024 C 64 1535.5 512.5 1984 1024 1984 C 1535.5 1984 1984 1535.5 1984 1024 C 1984 512.5 1535.5 64 1024 64 z M 1024 192 C 1469.2 192 1856 578.8 1856 1024 C 1856 1469.2 1469.2 1856 1024 1856 C 578.8 1856 192 1469.2 192 1024 C 192 578.8 578.8 192 1024 192 z"/>
<path transform="translate(0,0)" fill="rgb(254,254,254)" d="M 1024 64 C 512.5 64 64 512.5 64 1024 C 64 1535.5 512.5 1984 1024 1984 C 1535.5 1984 1984 1535.5 1984 1024 C 1984 512.5 1535.5 64 1024 64 z M 1024 192 C 1469.2 192 1856 578.8 1856 1024 C 1856 1469.2 1469.2 1856 1024 1856 C 578.8 1856 192 1469.2 192 1024 C 192 578.8 578.8 192 1024 192 z"/>
<path transform="translate(0,0)" fill="rgb(63,170,232)" d="M 1024 64 C 512.5 64 64 512.5 64 1024 C 64 1535.5 512.5 1984 1024 1984 C 1535.5 1984 1984 1535.5 1984 1024 C 1984 512.5 1535.5 64 1024 64 z M 1024 192 C 1469.2 192 1856 578.8 1856 1024 C 1856 1469.2 1469.2 1856 1024 1856 C 578.8 1856 192 1469.2 192 1024 C 192 578.8 578.8 192 1024 192 z"/>
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 896 512 L 896 1536 L 1152 1536 L 1152 512 Z M 1024 640 L 1024 1408 L 1088 1408 L 1088 640 Z"/>
<path transform="translate(0,0)" fill="rgb(254,254,254)" d="M 896 512 L 896 1536 L 1152 1536 L 1152 512 Z M 1024 640 L 1024 1408 L 1088 1408 L 1088 640 Z"/>
<path transform="translate(0,0)" fill="rgb(63,170,232)" d="M 896 512 L 896 1536 L 1152 1536 L 1152 512 Z M 1024 640 L 1024 1408 L 1088 1408 L 1088 640 Z"/>
<path transform="translate(0,0)" fill="rgb(0,0,0)" d="M 768 768 L 1280 768 L 1280 896 L 768 896 Z"/>
<path transform="translate(0,0)" fill="rgb(254,254,254)" d="M 768 768 L 1280 768 L 1280 896 L 768 896 Z"/>
<path transform="translate(0,0)" fill="rgb(63,170,232)" d="M 768 768 L 1280 768 L 1280 896 L 768 896 Z"/>
</svg>`,
    },
    description: {
      en_US:
        "Track tool call counts and enforce limits during agent execution. Supports thread-level (persistent) and run-level (per invocation) limits with configurable exit behaviors.",
      zh_Hans:
        "跟踪工具调用次数并在代理执行期间强制执行限制。支持线程级（持久）和运行级（每次调用）限制，具有可配置的退出行为。",
    },
    configSchema: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          nullable: true,
          title: {
            en_US: "Tool Name",
            zh_Hans: "工具名称",
          },
          description: {
            en_US:
              "Name of the specific tool to limit. Leave empty to limit all tools.",
            zh_Hans: "要限制的特定工具名称。留空以限制所有工具。",
          },
        },
        threadLimit: {
          type: "number",
          nullable: true,
          minimum: 1,
          title: {
            en_US: "Thread Limit",
            zh_Hans: "线程限制",
          },
          description: {
            en_US:
              "Maximum number of tool calls allowed per thread (persistent across runs). Leave empty for no limit.",
            zh_Hans:
              "每个线程允许的最大工具调用次数（跨运行持久化）。留空表示无限制。",
          },
        },
        runLimit: {
          type: "number",
          nullable: true,
          minimum: 1,
          title: {
            en_US: "Run Limit",
            zh_Hans: "运行限制",
          },
          description: {
            en_US:
              "Maximum number of tool calls allowed per run (per invocation). Leave empty for no limit.",
            zh_Hans:
              "每次运行允许的最大工具调用次数（每次调用）。留空表示无限制。",
          },
        },
        exitBehavior: {
          type: "string",
          enum: ["continue", "error", "end"],
          default: "continue",
          title: {
            en_US: "Exit Behavior",
            zh_Hans: "退出行为",
          },
          description: {
            en_US:
              "How to handle when limits are exceeded: 'continue' (block exceeded tools, let others continue), 'error' (raise exception), 'end' (stop execution immediately).",
            zh_Hans:
              "超过限制时的处理方式：'continue'（继续）、'error'（错误）、'end'（结束）。",
          },
          'x-ui': {
            enumLabels: {
              continue: {
                en_US: 'Continue',
                zh_Hans: '继续',   
              },
              error: {
                en_US: 'Error',
                zh_Hans: '错误',
              },
              end: {
                en_US: 'End',
                zh_Hans: '结束',
              },
            }
          }
        },
      } as unknown as JsonSchemaObjectType["properties"],
      required: [],
    },
  };

  async createMiddleware(
    options: ToolCallLimitMiddlewareConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: IAgentMiddlewareContext
  ) {
    const { data: userOptions, error } = interopSafeParse(
      toolCallLimitSchema,
      options
    );
    if (error) {
      throw new Error(
        `Invalid tool call limit middleware options: ${z4.prettifyError(error)}`
      );
    }

    const toolName = userOptions.toolName ?? null;
    const threadLimit = userOptions.threadLimit ?? null;
    const runLimit = userOptions.runLimit ?? null;
    const exitBehavior = userOptions.exitBehavior ?? "continue";

    // Get the count key for this middleware instance
    const countKey = toolName ?? "__all__";

    // Helper function to check if a tool call matches the filter
    const matchesToolFilter = (toolCall: { name: string }): boolean => {
      return toolName === null || toolCall.name === toolName;
    };

    // Helper function to check if incrementing would exceed limit
    const wouldExceedLimit = (
      threadCount: number,
      runCount: number
    ): boolean => {
      return (
        (threadLimit !== null && threadCount + 1 > threadLimit) ||
        (runLimit !== null && runCount + 1 > runLimit)
      );
    };

    // Helper function to separate tool calls into allowed and blocked
    const separateToolCalls = (
      toolCalls: ToolCall[],
      threadCount: number,
      runCount: number
    ): {
      allowed: ToolCall[];
      blocked: ToolCall[];
      newThreadCount: number;
      newRunCount: number;
    } => {
      const allowed: ToolCall[] = [];
      const blocked: ToolCall[] = [];
      let tempThreadCount = threadCount;
      let tempRunCount = runCount;

      for (const toolCall of toolCalls) {
        if (!matchesToolFilter(toolCall)) {
          // Tool calls that don't match the filter are always allowed
          // (they are not counted towards limits)
          allowed.push(toolCall);
          if (toolName !== null) {
            // Log when tool name doesn't match filter (only if filter is set)
            console.log(
              `[ToolCallLimitMiddleware] Tool '${toolCall.name}' does not match filter '${toolName}', ` +
                `allowing without counting towards limit`
            );
          }
          continue;
        }

        if (wouldExceedLimit(tempThreadCount, tempRunCount)) {
          blocked.push(toolCall);
        } else {
          allowed.push(toolCall);
          tempThreadCount += 1;
          tempRunCount += 1;
        }
      }

      return {
        allowed,
        blocked,
        newThreadCount: tempThreadCount,
        newRunCount: tempRunCount, // Only count allowed calls towards run limit
      };
    };

    return {
      name: toolName
        ? `ToolCallLimitMiddleware[${toolName}]`
        : "ToolCallLimitMiddleware",
      stateSchema: toolCallLimitStateSchema,
      beforeAgent: {
        hook: async (state: Record<string, unknown>) => {
          // Reset runToolCallCount at the start of each new agent invocation
          // This ensures runLimit applies per conversation/run, not across multiple runs
          const countKey = toolName ?? "__all__";
          const runCounts = (state["runToolCallCount"] as Record<string, number>) || {};
          
          // Reset the count for this tool (or all tools if toolName is null)
          const updatedRunCounts = { ...runCounts };
          updatedRunCounts[countKey] = 0;
          
          console.log(
            `[ToolCallLimitMiddleware] Resetting run count for '${countKey}' at start of new agent invocation`
          );
          
          return {
            runToolCallCount: updatedRunCounts,
          };
        },
      },
      afterModel: {
        hook: async (state: Record<string, unknown>) => {
          // Get messages from state
          const messages = (state["messages"] as BaseMessage[]) || [];
          if (messages.length === 0) {
            return undefined;
          }

          // Find the last AIMessage
          let lastAIMessage: AIMessage | null = null;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (isAIMessage(messages[i])) {
              lastAIMessage = messages[i] as AIMessage;
              break;
            }
          }

          if (!lastAIMessage || !lastAIMessage.tool_calls || lastAIMessage.tool_calls.length === 0) {
            return undefined;
          }

          // Log middleware execution
          console.log(
            `[ToolCallLimitMiddleware] Triggered - Tool calls detected:`,
            lastAIMessage.tool_calls.map((tc) => tc.name)
          );

          // Get current counts from state
          const threadToolCallCount = state["threadToolCallCount"];
          const runToolCallCount = state["runToolCallCount"];
          const threadCounts =
            (threadToolCallCount as Record<string, number>) || {};
          const runCounts =
            (runToolCallCount as Record<string, number>) || {};
          const currentThreadCount = threadCounts[countKey] || 0;
          const currentRunCount = runCounts[countKey] || 0;

          // Log current state before processing
          const toolNames = lastAIMessage.tool_calls.map((tc) => tc.name);
          const matchedToolNames = toolNames.filter(
            (name) => toolName === null || name === toolName
          );
          const unmatchedToolNames = toolNames.filter(
            (name) => toolName !== null && name !== toolName
          );
          
          console.log(
            `[ToolCallLimitMiddleware] Current counts - Thread: ${currentThreadCount}/${threadLimit ?? "∞"}, ` +
              `Run: ${currentRunCount}/${runLimit ?? "∞"}, ` +
              `Tool filter: ${toolName ?? "all"}, ` +
              `Count key: ${countKey}, ` +
              `Tool calls: ${toolNames.join(", ")}`
          );
          
          // Critical warning if tool names don't match filter
          if (toolName !== null && unmatchedToolNames.length > 0 && matchedToolNames.length === 0) {
            console.error(
              `[ToolCallLimitMiddleware] ⚠️⚠️⚠️ CRITICAL: Tool name mismatch! ` +
                `Configured filter: '${toolName}', ` +
                `Actual tool calls: ${unmatchedToolNames.join(", ")}. ` +
                `These tools will NOT be limited! ` +
                `To fix: Set toolName to '${unmatchedToolNames[0]}' or leave empty to limit all tools.`
            );
          }

          // Separate tool calls into allowed and blocked
          const { allowed, blocked, newThreadCount, newRunCount } =
            separateToolCalls(
              lastAIMessage.tool_calls,
              currentThreadCount,
              currentRunCount
            );

          // Log which tools matched the filter
          const matchedTools = lastAIMessage.tool_calls.filter((tc) =>
            toolName === null || tc.name === toolName
          );
          const unmatchedTools = lastAIMessage.tool_calls.filter(
            (tc) => toolName !== null && tc.name !== toolName
          );
          
          if (toolName !== null && unmatchedTools.length > 0) {
            console.log(
              `[ToolCallLimitMiddleware] Warning: ${unmatchedTools.length} tool call(s) do not match filter '${toolName}': ` +
                `${unmatchedTools.map((tc) => tc.name).join(", ")}. ` +
                `These will be allowed but not counted. ` +
                `Matched tools: ${matchedTools.map((tc) => tc.name).join(", ") || "none"}`
            );
          }

          // Update counts
          const updatedThreadCounts = { ...threadCounts };
          const updatedRunCounts = { ...runCounts };
          updatedThreadCounts[countKey] = newThreadCount;
          updatedRunCounts[countKey] = newRunCount;

          // Log count updates for debugging
          const matchedCount = matchedTools.length;
          const countedTools = matchedTools.filter((tc) =>
            allowed.some((a) => a.id === tc.id)
          );
          
          console.log(
            `[ToolCallLimitMiddleware] Processing results - ` +
              `Matched filter: ${matchedCount}, ` +
              `Counted: ${countedTools.length}, ` +
              `Allowed: ${allowed.length}, ` +
              `Blocked: ${blocked.length}, ` +
              `Counts: Thread ${newThreadCount}/${threadLimit ?? "∞"}, ` +
              `Run ${newRunCount}/${runLimit ?? "∞"}`
          );

          // If no tool calls are blocked, just update counts
          if (blocked.length === 0) {
            if (allowed.length > 0) {
              // Only update counts if there were matched tools that were counted
              if (matchedCount > 0 && newThreadCount > currentThreadCount) {
                console.log(
                  `[ToolCallLimitMiddleware] Counts incremented - ` +
                    `Thread: ${currentThreadCount} → ${newThreadCount}, ` +
                    `Run: ${currentRunCount} → ${newRunCount}`
                );
              } else if (matchedCount === 0 && toolName !== null) {
                console.log(
                  `[ToolCallLimitMiddleware] ⚠️ No tools matched filter '${toolName}', ` +
                    `counts unchanged (${currentThreadCount}/${threadLimit ?? "∞"}, ${currentRunCount}/${runLimit ?? "∞"})`
                );
              }
              
              return {
                threadToolCallCount: updatedThreadCounts,
                runToolCallCount: updatedRunCounts,
              };
            }
            return undefined;
          }

          // Log blocked tool calls
          console.log(
            `[ToolCallLimitMiddleware] Blocked ${blocked.length} tool call(s):`,
            blocked.map((tc) => tc.name),
            `- Thread: ${updatedThreadCounts[countKey]}/${threadLimit ?? "∞"}, ` +
              `Run: ${updatedRunCounts[countKey]}/${runLimit ?? "∞"}`
          );

          // Handle different exit behaviors
          if (exitBehavior === "error") {
            // Use hypothetical thread count to show which limit was exceeded
            const hypotheticalThreadCount = newThreadCount + blocked.length;
            const errorMessage = buildFinalAIMessageContent(
              hypotheticalThreadCount,
              newRunCount,
              threadLimit,
              runLimit,
              toolName
            );
            
            console.error(
              `[ToolCallLimitMiddleware] Exit behavior 'error': Throwing ToolCallLimitExceededError`,
              `- Blocked ${blocked.length} tool call(s): ${blocked.map((tc) => tc.name).join(", ")}`,
              `- Error message: ${errorMessage}`,
              `- Thread: ${hypotheticalThreadCount}/${threadLimit ?? "∞"}, Run: ${newRunCount}/${runLimit ?? "∞"}`
            );
            
            throw new ToolCallLimitExceededError(
              hypotheticalThreadCount,
              newRunCount,
              threadLimit,
              runLimit,
              toolName
            );
          }

          // Build tool message content (sent to model - includes limit info for clarity)
          const toolMsgContent = buildToolMessageContent(toolName, threadLimit, runLimit);

          // Create error ToolMessages for blocked tool calls
          // These messages will be displayed to the user and sent to the model
          const artificialMessages: BaseMessage[] = blocked.map(
            (toolCall) =>
              new ToolMessage({
                content: toolMsgContent,
                tool_call_id: toolCall.id,
                name: toolCall.name,
                // Add error status to make it clear this is an error
                // Note: ToolMessage doesn't have a status field in langchain, but we can include it in content
              })
          );

          if (exitBehavior === "end") {
            // Check if there are tool calls to other tools that would continue executing
            const otherTools = lastAIMessage.tool_calls.filter(
              (tc) => toolName !== null && tc.name !== toolName
            );

            if (otherTools.length > 0) {
              const toolNames = Array.from(
                new Set(otherTools.map((tc) => tc.name))
              ).join(", ");
              throw new Error(
                `Cannot end execution with other tool calls pending. Found calls to: ${toolNames}. Use 'continue' or 'error' behavior instead.`
              );
            }

            // Build final AI message content (displayed to user - includes thread/run details)
            // Use hypothetical thread count (what it would have been if call wasn't blocked)
            const hypotheticalThreadCount = newThreadCount + blocked.length;
            const finalMsgContent = buildFinalAIMessageContent(
              hypotheticalThreadCount,
              newRunCount,
              threadLimit,
              runLimit,
              toolName
            );
            
            console.log(
              `[ToolCallLimitMiddleware] Exit behavior 'end': Creating final AI message for user:`,
              finalMsgContent
            );
            
            artificialMessages.push(new AIMessage({ content: finalMsgContent }));

            return {
              threadToolCallCount: updatedThreadCounts,
              runToolCallCount: updatedRunCounts,
              jumpTo: "end" as const,
              messages: artificialMessages,
            };
          }

          // For exitBehavior="continue", return error messages to block exceeded tools
          // Also need to modify the AIMessage to remove blocked tool calls
          const modifiedAIMessage = new AIMessage({
            content: lastAIMessage.content,
            tool_calls: allowed as ToolCall[],
            id: lastAIMessage.id,
          });

          // Replace the last AIMessage with the modified one
          const updatedMessages = [...messages];
          const lastAIMessageIndex = updatedMessages.findIndex(
            (msg, idx) => idx === updatedMessages.length - 1 && isAIMessage(msg)
          );
          if (lastAIMessageIndex !== -1) {
            updatedMessages[lastAIMessageIndex] = modifiedAIMessage;
          }

          // Add a user-facing error message when tools are blocked
          // This ensures the user knows why execution might be limited
          const userErrorMessage = buildUserErrorMessage(
            blocked.length,
            newThreadCount,
            newRunCount,
            threadLimit,
            runLimit,
            toolName
          );
          
          console.log(
            `[ToolCallLimitMiddleware] Exit behavior 'continue': Blocked ${blocked.length} tool call(s), ` +
              `but allowing execution to continue`,
            `- Blocked tools: ${blocked.map((tc) => tc.name).join(", ")}`,
            `- Allowed tools: ${allowed.map((tc) => tc.name).join(", ") || "none"}`,
            `- User error message: ${userErrorMessage}`,
            `- Thread: ${newThreadCount}/${threadLimit ?? "∞"}, Run: ${newRunCount}/${runLimit ?? "∞"}`
          );
          
          // Add an AIMessage to inform the user about the limit
          // This will be displayed in the chat interface
          const limitNotificationMessage = new AIMessage({
            content: userErrorMessage,
          });

          return {
            threadToolCallCount: updatedThreadCounts,
            runToolCallCount: updatedRunCounts,
            messages: [
              ...updatedMessages,
              ...artificialMessages,
              limitNotificationMessage,
            ],
          };
        },
        canJumpTo: ["end"] as ("end" | "model" | "tools")[],
      },
    };
  }
}
