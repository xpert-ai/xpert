import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  RemoveMessage,
  ToolMessage,
  isAIMessage,
  isHumanMessage,
  isToolMessage
} from '@langchain/core/messages'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  CreateModelClientCommand,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  getModelContextSize
} from '@xpert-ai/plugin-sdk'
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import {
  ChatMessageTypeEnum,
  CONTEXT_COMPRESSION_COMPONENT_TYPE,
  CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
  TContextCompressionComponentData,
  TContextCompressionComponentStatus,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable,
  TMessageContentComponent
} from '@xpert-ai/contracts'
import { v4 as uuid } from 'uuid'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import path from 'node:path'
import os from 'node:os'

// ============================================================================
// Constants
// ============================================================================

/**
 * Compression trigger threshold: triggers compression when token count exceeds 70% of model limit
 * Higher threshold to reduce unnecessary compression
 */
export const DEFAULT_COMPRESSION_TOKEN_THRESHOLD = 0.7

/**
 * Preserve the last 30% of conversation history
 */
export const COMPRESSION_PRESERVE_THRESHOLD = 0.3

/**
 * Token budget for tool outputs: 50,000 tokens
 */
export const COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET = 50_000

/**
 * Number of lines to keep when truncating tool output
 */
export const COMPRESSION_TRUNCATE_LINES = 30

/**
 * Prune minimum threshold: only prune when pruned tokens exceed this value
 * Reference: OpenCode PRUNE_MINIMUM = 20,000
 */
export const PRUNE_MINIMUM_TOKENS = 20_000

/**
 * Prune protection threshold: start marking old tool outputs after accumulating beyond this value
 * Reference: OpenCode PRUNE_PROTECT = 40,000
 */
export const PRUNE_PROTECT_TOKENS = 40_000

/**
 * Number of recent user turns to protect
 * Reference: OpenCode protects the last 2 user turns
 */
export const PROTECTED_USER_TURNS = 2

/**
 * List of protected tools (outputs from these tools will not be pruned)
 */
export const PROTECTED_TOOLS = ['skill', 'task']

const CONTEXT_WINDOW_EXCEEDED_FINISH_REASON = 'model_context_window_exceeded'
const CONTEXT_WINDOW_RETRY_STATE_KEY = '__contextCompressionContextWindowRetryApplied'

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate token count (simplified: 1 token ≈ 4 characters)
 */
function estimateTokenCountSync(text: string): number {
  return Math.max(0, Math.ceil((text || '').length / 4))
}

/**
 * Check if AI message contains tool calls
 */
function hasToolCalls(message: BaseMessage): boolean {
  if (!isAIMessage(message)) {
    return false
  }
  return message.tool_calls && message.tool_calls.length > 0
}

/**
 * Check if tool is protected (should not be pruned)
 */
function isProtectedTool(toolName: string | undefined): boolean {
  if (!toolName) return false
  return PROTECTED_TOOLS.some((pt) => toolName.toLowerCase().includes(pt.toLowerCase()))
}

/**
 * Count user turns (from end to beginning)
 * Returns the index of each user message
 */
function getUserTurnIndices(messages: BaseMessage[]): number[] {
  const indices: number[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHumanMessage(messages[i])) {
      indices.push(i)
    }
  }
  return indices
}

/**
 * Find compression split point: returns the index of the oldest message to preserve
 * Improvement: ensures protection of the last N user turns
 */
function findCompressSplitPoint(
  messages: BaseMessage[],
  fraction: number,
  protectedTurns: number = PROTECTED_USER_TURNS
): number {
  if (fraction <= 0 || fraction >= 1) {
    throw new Error('Fraction must be between 0 and 1')
  }

  const charCounts = messages.map((message) => JSON.stringify(message).length)
  const totalCharCount = charCounts.reduce((a, b) => a + b, 0)
  const targetCharCount = totalCharCount * fraction

  // Get user turn indices
  const userTurnIndices = getUserTurnIndices(messages)

  // Calculate minimum protected index (protect the last N user turns)
  let minProtectedIndex = 0
  if (userTurnIndices.length > protectedTurns && protectedTurns > 0) {
    // Index of the Nth user turn (counting from the end)
    minProtectedIndex = userTurnIndices[protectedTurns - 1]
  } else if (userTurnIndices.length > 0) {
    // If there are fewer user turns than required, protect all
    minProtectedIndex = userTurnIndices[userTurnIndices.length - 1]
  }

  let lastSplitPoint = 0
  let cumulativeCharCount = 0

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]

    // Only split at user messages (not at tool responses)
    if (isHumanMessage(message)) {
      // Ensure we don't split into the protected region
      if (i >= minProtectedIndex) {
        // Already reached protected region, return current split point
        return Math.max(lastSplitPoint, i)
      }

      if (cumulativeCharCount >= targetCharCount) {
        return i
      }
      lastSplitPoint = i
    }

    cumulativeCharCount += charCounts[i]
  }

  // Check if all content can be compressed
  const lastMessage = messages[messages.length - 1]
  if (isAIMessage(lastMessage) && !hasToolCalls(lastMessage)) {
    return Math.min(messages.length, minProtectedIndex > 0 ? minProtectedIndex : messages.length)
  }

  return lastSplitPoint
}

/**
 * Format truncated tool output
 */
function formatTruncatedToolOutput(content: string, outputFile: string, lines: number): string {
  const contentLines = content.split('\n')
  const lastLines = contentLines.slice(-lines)

  return `[Tool output truncated. Showing last ${lines} lines. Full output saved to: ${outputFile}]

${lastLines.join('\n')}

[End of truncated output. Full output available at: ${outputFile}]`
}

/**
 * Format pruned tool output (for first layer pruning)
 * Reference: OpenCode: "[Old tool result content cleared]"
 */
function formatPrunedToolOutput(toolName: string): string {
  return `[Old tool output cleared. Tool: ${toolName}]`
}

/**
 * Intelligently truncate content based on remaining budget
 */
function truncateToFitBudget(content: string, remainingBudget: number, toolName: string, outputFile?: string): string {
  // Minimum lines to keep
  const minLines = 5
  // Token overhead for prompt text
  const overhead = 200

  if (remainingBudget < overhead + 500) {
    // Budget too low, keep only minimal info
    return `[Tool output truncated. Insufficient budget. Tool: ${toolName}]`
  }

  const lines = content.split('\n')
  const availableBudget = remainingBudget - overhead

  // Accumulate from the last line backwards until budget is reached
  let selectedLines: string[] = []
  let currentTokens = 0

  for (let i = lines.length - 1; i >= 0; i--) {
    const lineTokens = estimateTokenCountSync(lines[i] + '\n')
    if (currentTokens + lineTokens > availableBudget) {
      break
    }
    selectedLines.unshift(lines[i])
    currentTokens += lineTokens
  }

  // Keep at least minLines
  if (selectedLines.length < minLines && lines.length >= minLines) {
    selectedLines = lines.slice(-minLines)
  }

  const skippedLines = lines.length - selectedLines.length

  if (outputFile) {
    return `[Tool output truncated. Skipped first ${skippedLines} lines, showing last ${selectedLines.length} lines. Full output saved to: ${outputFile}]

${selectedLines.join('\n')}

[End of truncated output. Full output available at: ${outputFile}]`
  }

  return `[Tool output truncated. Skipped first ${skippedLines} lines, showing last ${selectedLines.length} lines]

${selectedLines.join('\n')}

[End of truncated output]`
}

/**
 * Save truncated tool output to temporary file
 */
async function saveTruncatedToolOutput(
  content: string,
  toolName: string,
  truncationId: string,
  tempDir: string
): Promise<{ outputFile: string; truncatedContent: string }> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const fileName = `${toolName}_${truncationId}.txt`
  const outputFile = path.join(tempDir, fileName)

  await fs.mkdir(tempDir, { recursive: true })
  await fs.writeFile(outputFile, content, 'utf-8')

  const truncatedContent = formatTruncatedToolOutput(content, outputFile, COMPRESSION_TRUNCATE_LINES)

  return { outputFile, truncatedContent }
}

/**
 * Get compression prompt
 */
function getCompressionPrompt(messagesText: string): string {
  return `<role>
You are a component that summarizes internal chat history into a structured format, specifically serving coding agents.
</role>

<objective>
When conversation history becomes too large, you will be called to distill the entire history into a concise, structured XML snapshot. This snapshot is critical because it will become the agent's *only* memory of the past. The agent will resume its work based solely on this snapshot. All key details, plans, errors, and user instructions must be preserved.
</objective>

<instructions>
First, you will carefully think through the entire history in a private <scratchpad>. Review the user's overall goals, agent operations, tool outputs, file modifications, and any unresolved issues. Identify every piece of information critical to future actions.

Pay special attention: the correct usage and format requirements for tools must be preserved. The agent must be able to correctly call tools after resuming, especially file operation tools (sandbox_write_file, sandbox_edit_file, etc.). Tool call parameters must be in valid JSON format.

After your reasoning is complete, generate the final <state_snapshot> XML object. Information density should be extremely high. Omit any irrelevant conversational filler.
</instructions>

<structure>
The structure must be as follows:

<state_snapshot>
    <overall_goal>
        <!-- A single, concise sentence describing the user's high-level goal. -->
        <!-- Example: "Refactor the authentication service to use the new JWT library." -->
    </overall_goal>

    <key_knowledge>
        <!-- Key facts, conventions, and constraints the agent must remember based on conversation history and user interactions. Use bullet points. -->
        <!-- Example:
         - Build command: \`npm run build\`
         - Testing: Run tests with \`npm test\`. Test files must end with \`.test.ts\`.
         - API endpoint: The main API endpoint is \`https://api.example.com/v2\`.
        -->
    </key_knowledge>

    <file_system_state>
        <!-- List files that have been created, read, modified, or deleted. Note their status and key learnings. -->
        <!-- Example:
         - CWD: \`/home/user/project/src\`
         - READ: \`package.json\` - Confirmed 'axios' is a dependency.
         - MODIFIED: \`services/auth.ts\` - Replaced 'jsonwebtoken' with 'jose'.
         - CREATED: \`tests/new-feature.test.ts\` - Initial test structure for new feature.
        -->
    </file_system_state>

    <recent_actions>
        <!-- Summary of the last few important agent operations and their results. Focus on facts. -->
        <!-- Example:
         - Ran \`grep 'old_function'\`, returned 3 results in 2 files.
         - Ran \`npm run test\`, failed due to snapshot mismatch in \`UserProfile.test.ts\`.
         - Ran \`ls -F static/\` and found image assets stored as \`.webp\`.
        -->
    </recent_actions>

    <current_plan>
        <!-- The agent's step-by-step plan. Mark completed steps. -->
        <!-- Example:
         1. [Completed] Identify all files using the deprecated 'UserAPI'.
         2. [In Progress] Refactor \`src/components/UserProfile.tsx\` to use the new 'ProfileAPI'.
         3. [TODO] Refactor remaining files.
         4. [TODO] Update tests to reflect API changes.
        -->
    </current_plan>

    <tool_usage_notes>
        <!-- Document key tools used by the agent and their correct usage. This is critical to ensure the agent can correctly call tools after resuming. -->
        <!-- Important: Tool call parameters must be in valid JSON format, cannot split a single object into multiple objects or arrays. -->
        <!-- Example:
         - sandbox_write_file: Create new files.
           * Parameter format: Single object {"file_path": "path", "content": "full content"}
           * Correct example: {"file_path": "/workspace/app.js", "content": "const x = 1;\nconst y = 2;\nconsole.log(x + y);"}
           * Wrong example: [{"file_path": "/workspace/app.js", "content": "const x = 1;"}, {"content": "const y = 2;"}]
           * Key: content must be a single complete string containing all file content, with special characters properly escaped (\n, \\", \\, etc.)

         - sandbox_edit_file: Edit files.
           * Parameter format: {"file_path": "path", "old_string": "text to replace", "new_string": "new text"}
           * old_string must exactly match the content in the file (including spaces, newlines, etc.)

         - sandbox_read_file: Read files.
           * Parameter format: {"file_path": "path", "offset": optional line number, "limit": optional line count}
        -->
    </tool_usage_notes>
</state_snapshot>
</structure>

<messages>
Messages to summarize:

${messagesText}
</messages>

Now, carefully read all the messages above, think in your scratchpad, then generate the <state_snapshot>.`
}

export interface ContextCompressionMiddlewareOptions {
  /**
   * Compression threshold (fraction of model token limit)
   */
  threshold?: number
  /**
   * Fraction of history to preserve
   */
  preserveFraction?: number
  /**
   * Token budget for tool outputs
   */
  toolOutputBudget?: number
  /**
   * Number of lines to keep when truncating
   */
  truncateLines?: number
  /**
   * Whether to enable two-phase compression (prune first, then summarize)
   * Enabled by default
   */
  enableTwoPhaseCompression?: boolean
  /**
   * Prune protection threshold (tokens)
   */
  pruneProtectTokens?: number
  /**
   * Prune minimum threshold (tokens)
   */
  pruneMinimumTokens?: number
  /**
   * Number of user turns to protect
   */
  protectedUserTurns?: number
}

interface ResolvedContextCompressionOptions {
  threshold: number
  preserveFraction: number
  toolOutputBudget: number
  enableTwoPhase: boolean
  pruneProtectTokens: number
  pruneMinimumTokens: number
  protectedUserTurns: number
}

interface CompressionExecutionOptions {
  force: boolean
  reason: 'threshold_exceeded' | typeof CONTEXT_WINDOW_EXCEEDED_FINISH_REASON
}

interface PromptTokenAnchor {
  index: number
  promptTokens: number
  source: string
}

interface PromptWindowEstimate {
  estimatedPromptTokens: number
  reservedOutputTokens: number
  availablePromptTokens: number
  thresholdPromptTokens: number
  effectivePromptBudget: number
  projectedTotalTokens: number
  anchorPromptTokens?: number
  anchorSource?: string
  deltaMessageTokens: number
}

@Injectable()
@AgentMiddlewareStrategy(CONTEXT_COMPRESSION_MIDDLEWARE_NAME)
export class ContextCompressionMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = {
    name: CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
    label: {
      en_US: 'Context Compression Middleware',
      zh_Hans: '上下文压缩中间件'
    },
    icon: {
      type: 'svg',
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>`
    },
    description: {
      en_US:
        'Two-phase context compression: first prunes old tool outputs, then generates summaries when needed. Preserves recent interactions and critical coding context.',
      zh_Hans: '双层上下文压缩：首先修剪旧工具输出，然后在需要时生成摘要。保留最近的交互和关键编码上下文。'
    },
    configSchema: {
      type: 'object',
      properties: {
        threshold: {
          type: 'number',
          default: DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
          title: {
            en_US: 'Compression Threshold',
            zh_Hans: '压缩阈值'
          },
          description: {
            en_US: 'Trigger compression when token count exceeds this fraction of model limit (0.7 = 70%)',
            zh_Hans: '当token数量超过模型限制的此比例时触发压缩（0.7 = 70%）'
          }
        },
        preserveFraction: {
          type: 'number',
          default: COMPRESSION_PRESERVE_THRESHOLD,
          title: {
            en_US: 'Preserve Fraction',
            zh_Hans: '保留比例'
          },
          description: {
            en_US: 'Keep the last X% of history (0.3 = keep last 30%)',
            zh_Hans: '保留最后X%的历史（0.3 = 保留最后30%）'
          }
        },
        enableTwoPhaseCompression: {
          type: 'boolean',
          default: true,
          title: {
            en_US: 'Enable Two-Phase Compression',
            zh_Hans: '启用双层压缩'
          },
          description: {
            en_US: 'First prune old tool outputs, then generate summary if still over limit',
            zh_Hans: '先修剪旧工具输出，如果仍超限则生成摘要'
          }
        },
        protectedUserTurns: {
          type: 'number',
          default: PROTECTED_USER_TURNS,
          title: {
            en_US: 'Protected User Turns',
            zh_Hans: '保护的用户回合数'
          },
          description: {
            en_US: 'Number of recent user turns to protect from pruning',
            zh_Hans: '保护最近多少个用户回合不被修剪'
          }
        }
      }
    }
  }

  private readonly logger = new Logger(ContextCompressionMiddleware.name)
  private truncationIdCounter = 0

  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Get next truncation ID
   */
  private getNextTruncationId(): string {
    return `${Date.now()}_${this.truncationIdCounter++}`
  }

  /**
   * Get temporary directory
   */
  private getTempDir(): string {
    return path.join(os.tmpdir(), 'xpert-compression')
  }

  /**
   * Estimate token count for messages
   */
  private async estimateTokens(messages: BaseMessage[]): Promise<number> {
    const totalChars = messages.reduce((sum, msg) => sum + JSON.stringify(msg.content).length, 0)
    return Math.ceil(totalChars / 4)
  }

  private toPositiveTokenCount(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value)
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.round(parsed)
      }
    }

    return null
  }

  private extractPromptTokenAnchor(message: BaseMessage): PromptTokenAnchor | null {
    if (!isAIMessage(message)) {
      return null
    }

    const responseMetadata = message.response_metadata as Record<string, unknown> | undefined
    const responseUsage = responseMetadata?.['usage'] as Record<string, unknown> | undefined
    const usagePromptTokens = this.toPositiveTokenCount(responseUsage?.['prompt_tokens'])
    if (usagePromptTokens !== null) {
      return {
        index: -1,
        promptTokens: usagePromptTokens,
        source: 'response_metadata.usage.prompt_tokens'
      }
    }

    const tokenUsage = responseMetadata?.['tokenUsage'] as Record<string, unknown> | undefined
    const tokenUsagePromptTokens = this.toPositiveTokenCount(tokenUsage?.['promptTokens'])
    if (tokenUsagePromptTokens !== null) {
      return {
        index: -1,
        promptTokens: tokenUsagePromptTokens,
        source: 'response_metadata.tokenUsage.promptTokens'
      }
    }

    const usageMetadata = message.usage_metadata as Record<string, unknown> | undefined
    const inputTokens = this.toPositiveTokenCount(usageMetadata?.['input_tokens'])
    if (inputTokens !== null) {
      return {
        index: -1,
        promptTokens: inputTokens,
        source: 'usage_metadata.input_tokens'
      }
    }

    const rawResponse = (message.additional_kwargs as Record<string, any> | undefined)?.['__raw_response']
    const rawPromptTokens = this.toPositiveTokenCount(rawResponse?.usage?.prompt_tokens)
    if (rawPromptTokens !== null) {
      return {
        index: -1,
        promptTokens: rawPromptTokens,
        source: 'additional_kwargs.__raw_response.usage.prompt_tokens'
      }
    }

    return null
  }

  private findLatestPromptTokenAnchor(messages: BaseMessage[]): PromptTokenAnchor | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const anchor = this.extractPromptTokenAnchor(messages[i])
      if (anchor) {
        return {
          ...anchor,
          index: i
        }
      }
    }

    return null
  }

  private resolveReservedOutputTokens(
    model: TAgentRunnableConfigurable['copilotModel'],
    tokenLimit: number,
    threshold: number
  ): { reservedOutputTokens: number; source: string } {
    const modelOptions = model?.options as Record<string, unknown> | undefined
    const candidates: Array<[string, unknown]> = [
      ['options.max_output_tokens', modelOptions?.['max_output_tokens']],
      ['options.max_completion_tokens', modelOptions?.['max_completion_tokens']],
      ['options.max_tokens', modelOptions?.['max_tokens']],
      ['options.maxTokens', modelOptions?.['maxTokens']],
      ['options.max_tokens_to_sample', modelOptions?.['max_tokens_to_sample']],
      ['options.num_predict', modelOptions?.['num_predict']]
    ]

    for (const [source, value] of candidates) {
      const resolved = this.toPositiveTokenCount(value)
      if (resolved && resolved > 0) {
        return {
          reservedOutputTokens: Math.min(resolved, tokenLimit),
          source
        }
      }
    }

    const fallbackReservedTokens = Math.max(1, Math.round(tokenLimit * Math.max(0, 1 - threshold)))

    return {
      reservedOutputTokens: Math.min(fallbackReservedTokens, tokenLimit),
      source: 'fallback_from_threshold'
    }
  }

  private async estimatePromptWindowUsage(
    messages: BaseMessage[],
    model: TAgentRunnableConfigurable['copilotModel'],
    tokenLimit: number,
    threshold: number
  ): Promise<PromptWindowEstimate> {
    const messageOnlyTokens = await this.estimateTokens(messages)
    const anchor = this.findLatestPromptTokenAnchor(messages)

    let deltaMessageTokens = messageOnlyTokens
    let estimatedPromptTokens = messageOnlyTokens

    if (anchor) {
      const subsequentMessages = messages.slice(anchor.index + 1)
      deltaMessageTokens = subsequentMessages.length ? await this.estimateTokens(subsequentMessages) : 0
      estimatedPromptTokens = Math.max(messageOnlyTokens, anchor.promptTokens + deltaMessageTokens)
    }

    const { reservedOutputTokens, source } = this.resolveReservedOutputTokens(model, tokenLimit, threshold)
    const availablePromptTokens = Math.max(0, tokenLimit - reservedOutputTokens)
    const thresholdPromptTokens = Math.max(0, Math.round(tokenLimit * Math.max(0, Math.min(1, threshold))))
    const effectivePromptBudget = Math.min(availablePromptTokens, thresholdPromptTokens || availablePromptTokens)

    return {
      estimatedPromptTokens,
      reservedOutputTokens,
      availablePromptTokens,
      thresholdPromptTokens,
      effectivePromptBudget,
      projectedTotalTokens: estimatedPromptTokens + reservedOutputTokens,
      anchorPromptTokens: anchor?.promptTokens,
      anchorSource: anchor ? `${anchor.source} + ${source}` : source,
      deltaMessageTokens
    }
  }

  private emitCompressionChunk(
    runtime: { configurable?: TAgentRunnableConfigurable },
    payload: {
      id: string
      status: TContextCompressionComponentStatus
      message?: string
      error?: string
    }
  ): void {
    const configurable = runtime?.configurable as TAgentRunnableConfigurable | undefined
    const subscriber = configurable?.subscriber
    if (!subscriber) {
      return
    }

    const now = new Date()

    subscriber.next({
      data: {
        type: ChatMessageTypeEnum.MESSAGE,
        data: {
          id: payload.id,
          type: 'component',
          xpertName: configurable?.xpertName,
          agentKey: configurable?.agentKey,
          data: {
            category: 'Tool',
            type: CONTEXT_COMPRESSION_COMPONENT_TYPE,
            title: 'Context compression',
            message: payload.message,
            status: payload.status,
            created_date: now,
            end_date: payload.status === 'running' ? null : now,
            error: payload.error
          }
        } as TMessageContentComponent<TContextCompressionComponentData>
      }
    } as MessageEvent)
  }

  // ============================================================================
  // First Layer: Pruning - Reference: OpenCode
  // ============================================================================

  /**
   * First layer compression: prune old tool outputs
   *
   * Strategy:
   * 1. Scan from newest message backwards
   * 2. Protect the last N user turns
   * 3. Start marking old tool outputs after accumulating beyond PRUNE_PROTECT
   * 4. Only execute pruning if pruned tokens exceed PRUNE_MINIMUM
   *
   * Returns: pruned message list and number of pruned tokens
   */
  private async pruneOldToolOutputs(
    messages: BaseMessage[],
    options: {
      pruneProtectTokens: number
      pruneMinimumTokens: number
      protectedUserTurns: number
    }
  ): Promise<{ messages: BaseMessage[]; prunedTokens: number }> {
    const { pruneProtectTokens, pruneMinimumTokens, protectedUserTurns } = options

    // Get user turn indices
    const userTurnIndices = getUserTurnIndices(messages)

    // Calculate protection boundary (protect all messages after the last N user turns)
    let protectedBoundary = messages.length
    if (userTurnIndices.length >= protectedUserTurns && protectedUserTurns > 0) {
      protectedBoundary = userTurnIndices[protectedUserTurns - 1]
    }

    // Accumulate tool output tokens from end to beginning
    let accumulatedToolTokens = 0
    let prunedTokens = 0
    const messagesToPrune: Map<number, { originalTokens: number; toolName: string }> = new Map()

    // Reverse iterate, accumulate tool output tokens
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]

      if (isToolMessage(message)) {
        const toolName = message.name || 'unknown'

        // Skip protected tools
        if (isProtectedTool(toolName)) {
          continue
        }

        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        const tokens = estimateTokenCountSync(content)

        // If within protected region, only accumulate without pruning
        if (i >= protectedBoundary) {
          accumulatedToolTokens += tokens
          continue
        }

        // After accumulating beyond protection threshold, mark old tool outputs
        if (accumulatedToolTokens >= pruneProtectTokens) {
          // Check if already pruned
          const isPruned = message.additional_kwargs?.['pruned'] === true
          if (!isPruned && tokens > 100) {
            // Only prune larger outputs
            messagesToPrune.set(i, { originalTokens: tokens, toolName })
            prunedTokens += tokens
          }
        } else {
          accumulatedToolTokens += tokens
        }
      }
    }

    // If pruned tokens don't meet minimum threshold, skip pruning
    if (prunedTokens < pruneMinimumTokens) {
      this.logger.debug(
        `Pruned tokens (${prunedTokens}) below minimum threshold (${pruneMinimumTokens}), skipping pruning`
      )
      return { messages, prunedTokens: 0 }
    }

    // Execute pruning: create new message list
    const prunedMessages = messages.map((message, index) => {
      const pruneInfo = messagesToPrune.get(index)
      if (pruneInfo && isToolMessage(message)) {
        // Create pruned message
        return new ToolMessage({
          content: formatPrunedToolOutput(pruneInfo.toolName),
          tool_call_id: message.tool_call_id,
          name: message.name,
          additional_kwargs: {
            ...message.additional_kwargs,
            pruned: true,
            prunedAt: Date.now(),
            originalTokens: pruneInfo.originalTokens
          }
        })
      }
      return message
    })

    this.logger.log(
      `First layer pruning complete: pruned ${messagesToPrune.size} tool outputs, saved ${prunedTokens} tokens`
    )

    return { messages: prunedMessages, prunedTokens }
  }

  // ============================================================================
  // Second Layer: Truncation and Summary (Compaction)
  // ============================================================================

  /**
   * Truncate tool outputs using reverse token budget
   * This is part of second layer compression, used to further reduce tokens before generating summary
   */
  private async truncateHistoryToBudget(messages: BaseMessage[], budget: number): Promise<BaseMessage[]> {
    let toolResponseTokenCounter = 0
    const truncatedHistory: BaseMessage[] = []

    // Reverse iterate from newest to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]

      if (isToolMessage(message)) {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        const tokens = estimateTokenCountSync(content)

        // Calculate remaining budget
        const remainingBudget = budget - toolResponseTokenCounter

        if (tokens > remainingBudget) {
          // Need to truncate
          try {
            // Save full output to temporary file
            const fs = await import('fs/promises')
            const path = await import('path')
            const tempDir = this.getTempDir()
            const fileName = `${message.name || 'unknown_tool'}_${this.getNextTruncationId()}.txt`
            const outputFile = path.join(tempDir, fileName)

            await fs.mkdir(tempDir, { recursive: true })
            await fs.writeFile(outputFile, content, 'utf-8')

            // Intelligently truncate based on remaining budget
            const truncatedContent = truncateToFitBudget(
              content,
              remainingBudget,
              message.name || 'unknown_tool',
              outputFile
            )

            const truncatedMessage = new ToolMessage({
              content: truncatedContent,
              tool_call_id: message.tool_call_id,
              name: message.name,
              additional_kwargs: {
                ...message.additional_kwargs,
                truncated: true,
                originalFile: outputFile
              }
            })

            truncatedHistory.unshift(truncatedMessage)
            toolResponseTokenCounter += estimateTokenCountSync(truncatedContent)
          } catch (error) {
            this.logger.debug('Failed to truncate tool output:', error)
            // If truncation fails, try simple truncation
            const simpleTruncated = truncateToFitBudget(content, remainingBudget, message.name || 'unknown_tool')
            const truncatedMessage = new ToolMessage({
              content: simpleTruncated,
              tool_call_id: message.tool_call_id,
              name: message.name,
              additional_kwargs: {
                ...message.additional_kwargs,
                truncated: true
              }
            })
            truncatedHistory.unshift(truncatedMessage)
            toolResponseTokenCounter += estimateTokenCountSync(simpleTruncated)
          }
        } else {
          // Within budget, keep as is
          toolResponseTokenCounter += tokens
          truncatedHistory.unshift(message)
        }
      } else {
        truncatedHistory.unshift(message)
      }
    }

    return truncatedHistory
  }

  /**
   * Generate state snapshot using LLM
   */
  private async generateStateSnapshot(messagesToCompress: BaseMessage[], model: BaseLanguageModel): Promise<string> {
    try {
      const messagesText = messagesToCompress
        .map((msg, idx) => {
          let role = 'System'
          if (isHumanMessage(msg)) {
            role = 'User'
          } else if (isAIMessage(msg)) {
            role = 'Assistant'
          } else if (isToolMessage(msg)) {
            const toolMsg = msg as ToolMessage
            role = `Tool(${toolMsg.name || 'unknown'})`
          }
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          return `[${idx + 1}] ${role}: ${content}`
        })
        .join('\n\n')

      const prompt = getCompressionPrompt(messagesText)

      const response = await model.invoke([new HumanMessage({ content: prompt })])

      const snapshot = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)

      return snapshot
    } catch (error) {
      this.logger.error('Failed to generate state snapshot:', error)
      throw error
    }
  }

  /**
   * Build new history
   */
  private buildNewHistory(
    snapshot: string,
    preservedMessages: BaseMessage[],
    compressionId: string,
    originalMessageCount: number,
    originalTokenCount: number
  ): BaseMessage[] {
    return [
      new HumanMessage({
        content: snapshot,
        additional_kwargs: {
          compressed: true,
          compressionId,
          originalMessageCount,
          originalTokenCount
        }
      }),
      new AIMessage({
        content: 'Understood. Thanks for providing the additional context!',
        additional_kwargs: {
          compressionAck: true,
          compressionId
        }
      }),
      ...preservedMessages
    ]
  }

  private getFinishReason(message: BaseMessage | undefined): string | undefined {
    if (!message || !isAIMessage(message)) {
      return undefined
    }

    const responseMetadata = message.response_metadata as Record<string, unknown> | undefined
    const finishReason = responseMetadata?.['finish_reason']
    if (typeof finishReason === 'string') {
      return finishReason
    }

    const rawResponse = (message.additional_kwargs as Record<string, any> | undefined)?.['__raw_response']
    const rawFinishReason = rawResponse?.choices?.[0]?.finish_reason
    if (typeof rawFinishReason === 'string') {
      return rawFinishReason
    }

    return undefined
  }

  private async compressMessages(
    messages: BaseMessage[],
    runtime: { configurable?: TAgentRunnableConfigurable },
    options: ResolvedContextCompressionOptions,
    execution: CompressionExecutionOptions
  ): Promise<BaseMessage[] | null> {
    if (!messages.length) {
      return null
    }

    const configurable = runtime?.configurable as TAgentRunnableConfigurable | undefined
    const model = configurable?.copilotModel

    if (!model) {
      this.logger.warn('No configurable.copilotModel available for compression')
      return null
    }

    let compressionModelClient: BaseLanguageModel | null = null
    const getCompressionModel = async (): Promise<BaseLanguageModel> => {
      if (compressionModelClient) {
        return compressionModelClient
      }
      compressionModelClient = await this.commandBus.execute(
        new CreateModelClientCommand<BaseLanguageModel>(model, {
          usageCallback: (event) => {
            this.logger.debug('[Compression Middleware] Model usage:', event)
          }
        })
      )
      return compressionModelClient
    }

    let compressionId: string | null = null

    try {
      const originalTokenCount = await this.estimateTokens(messages)
      let tokenLimit: number | null = null

      try {
        tokenLimit = getModelContextSize(await getCompressionModel())
      } catch (error) {
        this.logger.warn(
          `Failed to resolve token limit from model profile: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      if (!tokenLimit || tokenLimit <= 0) {
        this.logger.warn('Unable to resolve token limit from configurable.copilotModel')
        return null
      }

      const promptWindowEstimate = await this.estimatePromptWindowUsage(messages, model, tokenLimit, options.threshold)

      if (
        !execution.force &&
        promptWindowEstimate.estimatedPromptTokens <= promptWindowEstimate.effectivePromptBudget &&
        promptWindowEstimate.projectedTotalTokens <= tokenLimit
      ) {
        this.logger.debug(
          `No compression needed: estimated prompt ${promptWindowEstimate.estimatedPromptTokens} tokens <= effective prompt budget ${promptWindowEstimate.effectivePromptBudget} tokens (threshold budget: ${promptWindowEstimate.thresholdPromptTokens}, available prompt budget: ${promptWindowEstimate.availablePromptTokens}); reserved output ${promptWindowEstimate.reservedOutputTokens}; projected total ${promptWindowEstimate.projectedTotalTokens}/${tokenLimit}`
        )
        return null
      }

      this.logger.log(
        execution.force
          ? `Triggering fallback compression after ${execution.reason}: ${messages.length} messages, estimated prompt ${promptWindowEstimate.estimatedPromptTokens}, effective prompt budget ${promptWindowEstimate.effectivePromptBudget}, reserved output ${promptWindowEstimate.reservedOutputTokens}, projected total ${promptWindowEstimate.projectedTotalTokens}, limit ${tokenLimit}`
          : `Triggering compression: ${messages.length} messages, estimated prompt ${promptWindowEstimate.estimatedPromptTokens}, effective prompt budget ${promptWindowEstimate.effectivePromptBudget}, reserved output ${promptWindowEstimate.reservedOutputTokens}, projected total ${promptWindowEstimate.projectedTotalTokens}, limit ${tokenLimit}`
      )

      const currentCompressionId = uuid()
      compressionId = currentCompressionId
      this.emitCompressionChunk(runtime, {
        id: currentCompressionId,
        status: 'running',
        message: 'Generating context summary...'
      })

      let currentMessages = messages
      let currentTokenCount = originalTokenCount

      if (options.enableTwoPhase) {
        const pruneResult = await this.pruneOldToolOutputs(currentMessages, {
          pruneProtectTokens: options.pruneProtectTokens,
          pruneMinimumTokens: options.pruneMinimumTokens,
          protectedUserTurns: options.protectedUserTurns
        })

        if (pruneResult.prunedTokens > 0) {
          currentMessages = pruneResult.messages
          currentTokenCount = await this.estimateTokens(currentMessages)
          const prunedWindowEstimate = await this.estimatePromptWindowUsage(
            currentMessages,
            model,
            tokenLimit,
            options.threshold
          )

          this.logger.log(
            `After first layer pruning: ${currentTokenCount} tokens (saved ${pruneResult.prunedTokens} tokens)`
          )

          if (
            prunedWindowEstimate.estimatedPromptTokens <= prunedWindowEstimate.effectivePromptBudget &&
            prunedWindowEstimate.projectedTotalTokens <= tokenLimit
          ) {
            this.logger.log(
              `First layer pruning sufficient, no further compression needed: estimated prompt ${prunedWindowEstimate.estimatedPromptTokens} <= effective prompt budget ${prunedWindowEstimate.effectivePromptBudget}; reserved output ${prunedWindowEstimate.reservedOutputTokens}; projected total ${prunedWindowEstimate.projectedTotalTokens}/${tokenLimit}`
            )
            this.emitCompressionChunk(runtime, {
              id: currentCompressionId,
              status: 'success',
              message: 'Context compression completed.'
            })
            return currentMessages
          }
        }
      }

      this.logger.log('First layer pruning insufficient, starting second layer summary compression...')

      const truncatedHistory = await this.truncateHistoryToBudget(currentMessages, options.toolOutputBudget)

      const splitPoint = findCompressSplitPoint(
        truncatedHistory,
        1 - options.preserveFraction,
        options.protectedUserTurns
      )

      const historyToCompress = truncatedHistory.slice(0, splitPoint)
      const historyToKeep = truncatedHistory.slice(splitPoint)

      if (historyToCompress.length === 0) {
        this.logger.debug('No messages to compress')
        this.emitCompressionChunk(runtime, {
          id: currentCompressionId,
          status: currentMessages !== messages ? 'success' : 'fail',
          message: currentMessages !== messages ? 'Context compression completed.' : 'No messages available to compress.',
          ...(currentMessages !== messages ? {} : { error: 'No messages available to compress.' })
        })
        return currentMessages !== messages ? currentMessages : null
      }

      this.logger.log(`Compressing ${historyToCompress.length} messages, keeping ${historyToKeep.length} messages`)

      const compressionModel = await getCompressionModel()

      const snapshot = await this.generateStateSnapshot(historyToCompress, compressionModel)

      const newHistory = this.buildNewHistory(
        snapshot,
        historyToKeep,
        currentCompressionId,
        historyToCompress.length,
        originalTokenCount
      )

      const newTokenCount = await this.estimateTokens(newHistory)

      if (newTokenCount >= currentTokenCount) {
        const failureMessage = `Compression failed: new token count (${newTokenCount}) >= current count (${currentTokenCount})`
        this.logger.warn(failureMessage)
        this.emitCompressionChunk(runtime, {
          id: currentCompressionId,
          status: 'fail',
          message: failureMessage,
          error: failureMessage
        })
        return currentMessages !== messages ? currentMessages : null
      }

      if (newTokenCount + promptWindowEstimate.reservedOutputTokens >= tokenLimit) {
        const warningMessage = `Still close to context limit after compression: compressed history ${newTokenCount} + reserved output ${promptWindowEstimate.reservedOutputTokens} >= ${tokenLimit}`
        this.logger.warn(warningMessage)
      }

      const compressionRatio = Math.round((newTokenCount / originalTokenCount) * 100)
      const compressionStats = `Two-phase compression complete: ${historyToCompress.length} messages → 1 summary | ${originalTokenCount} → ${newTokenCount} tokens (${compressionRatio}%)`

      this.logger.log(`✅ ${compressionStats}`)

      this.emitCompressionChunk(runtime, {
        id: currentCompressionId,
        message: compressionStats,
        status: 'success'
      })

      return newHistory
    } catch (error) {
      if (compressionId) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.emitCompressionChunk(runtime, {
          id: compressionId,
          status: 'fail',
          error: errorMessage,
          message: errorMessage
        })
      }
      this.logger.error('Compression error:', error)
      return null
    }
  }

  createMiddleware(
    options: ContextCompressionMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const resolvedOptions: ResolvedContextCompressionOptions = {
      threshold: options?.threshold ?? DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
      preserveFraction: options?.preserveFraction ?? COMPRESSION_PRESERVE_THRESHOLD,
      toolOutputBudget: options?.toolOutputBudget ?? COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET,
      enableTwoPhase: options?.enableTwoPhaseCompression ?? true,
      pruneProtectTokens: options?.pruneProtectTokens ?? PRUNE_PROTECT_TOKENS,
      pruneMinimumTokens: options?.pruneMinimumTokens ?? PRUNE_MINIMUM_TOKENS,
      protectedUserTurns: options?.protectedUserTurns ?? PROTECTED_USER_TURNS
    }

    return {
      name: CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
      tools: [],
      beforeModel: async (state, runtime) => {
        const messages = state.messages

        if (!messages || messages.length === 0) {
          return
        }

        const compressedMessages = await this.compressMessages(messages, runtime, resolvedOptions, {
          force: false,
          reason: 'threshold_exceeded'
        })

        if (compressedMessages) {
          state.messages = compressedMessages
        }
      },
      afterModel: {
        canJumpTo: ['model'],
        hook: async (state, runtime) => {
          const messages = state.messages

          if (!messages || messages.length === 0) {
            return
          }

          const stateRecord = state as Record<string, unknown>
          const retryAlreadyApplied = stateRecord[CONTEXT_WINDOW_RETRY_STATE_KEY] === true
          const lastMessage = messages[messages.length - 1]
          const finishReason = this.getFinishReason(lastMessage)

          if (finishReason !== CONTEXT_WINDOW_EXCEEDED_FINISH_REASON) {
            if (retryAlreadyApplied) {
              return {
                [CONTEXT_WINDOW_RETRY_STATE_KEY]: false
              }
            }
            return
          }

          if (retryAlreadyApplied) {
            this.logger.warn(
              'Model still exceeded context window after fallback compression retry; skipping additional automatic retries.'
            )
            return {
              [CONTEXT_WINDOW_RETRY_STATE_KEY]: false
            }
          }

          this.logger.warn(
            'Model returned finish_reason=model_context_window_exceeded. Triggering fallback compression retry.'
          )

          const messagesToRetry = isAIMessage(lastMessage) ? messages.slice(0, -1) : messages

          if (messagesToRetry.length === 0) {
            this.logger.warn('No messages available for fallback compression retry.')
            return
          }

          const compressedMessages = await this.compressMessages(messagesToRetry, runtime, resolvedOptions, {
            force: true,
            reason: CONTEXT_WINDOW_EXCEEDED_FINISH_REASON
          })

          if (!compressedMessages) {
            this.logger.warn('Fallback compression retry skipped because compression did not produce a new history.')
            return
          }

          return {
            messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...compressedMessages],
            [CONTEXT_WINDOW_RETRY_STATE_KEY]: true,
            jumpTo: 'model'
          }
        }
      }
    }
  }
}
