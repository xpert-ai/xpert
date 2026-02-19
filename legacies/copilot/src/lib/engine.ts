import { tool } from '@langchain/core/tools'
import { CompiledStateGraph } from '@langchain/langgraph/web'
import { z } from 'zod'
import { CopilotCommand, CopilotContext } from './command'
import { CopilotService } from './copilot'
import { CopilotChatMessage, TAgentConfig } from './types'

export type CopilotChatOptions = {
  command?: string
  newConversation?: boolean
  action?: string
  conversationId?: string
  context?: CopilotContext
  interactive?: boolean
}

/**
 * Chat conversation
 */
export type CopilotChatConversation<T extends CopilotChatMessage = CopilotChatMessage> = {
  id: string
  messages: T[]
  type: 'free' | 'command'
  /**
   * Status of the conversation:
   * - active: is active
   * - interrupted: is interrupted for waiting user confirmation or more information
   * - completed: is completed
   * - aborted: is aborted
   * - error: has error
   */
  status: 'answering' | 'interrupted' | 'completed' | 'aborted' | 'error'
  /**
   * Command of this conversation
   */
  command: CopilotCommand

  graph?: CompiledStateGraph<any, any, any>

  abortController?: AbortController
}

/**
 * Copilot engine
 */
export interface CopilotEngine {
  copilot?: CopilotService
  copilotContext?: CopilotContext

  /**
   * Copilot engine name
   */
  name?: string
  /**
   * Placeholder in ask input
   */
  placeholder?: string
  // /**
  //  * AI Configuration
  //  */
  // aiOptions: AIOptions
  /**
   * @deprecated use system prompt of command instead
   */
  systemPrompt?: string
  /**
   * Predefined prompts
   * @deprecated use commands instead
   */
  prompts?: string[]
  /**
   * Agent config
   */
  agentConfig: TAgentConfig

  updateAgentConfig(config: Partial<TAgentConfig>): void

  /**
   * Conversations
   */
  conversations(): Array<CopilotChatConversation>
  /**
   * Current conversation
   */
  conversation(): CopilotChatConversation
  /**
   * Messages in current conversation
   */
  messages(): CopilotChatMessage[]

  /**
   * Chat with copilot by prompt
   *
   * @param prompt
   * @param options
   */
  chat(prompt: string, options?: CopilotChatOptions): Promise<CopilotChatMessage | string | void>
  /**
   * Continue the conversation
   *
   * @param conversation
   */
  continue(conversation: CopilotChatConversation): Promise<void>
  /**
   * Finish the conversation
   */
  finish(conversation: CopilotChatConversation): Promise<void>

  /**
   * How to process the event when user drag drop a data
   *
   * @param event
   */
  dropCopilot?: (event) => void

  /**
   * Get all commands in this copilot engine
   *
   * @returns CopilotCommand[]
   */
  commands?: () => CopilotCommand[]
  /**
   * Get command and it's context by command name
   *
   * @param name
   */
  getCommandWithContext(name: string): { command: CopilotCommand; context: CopilotContext } | null

  /**
   * Update or insert the message into conversations
   *
   * @param message
   */
  upsertMessage?(message: CopilotChatMessage): void

  /**
   * Delete message from conversation
   *
   * @param message
   */
  deleteMessage?(message: CopilotChatMessage | string): void

  /**
   * Clear conversations
   */
  clear(): void

  /**
   * Update conversations value
   *
   * @param fn
   */
  updateConversations?(fn: (conversations: Array<CopilotChatConversation>) => Array<CopilotChatConversation>): void

  /**
   * Update conversation by id
   *
   * @param id conversation id
   * @param fn update function
   */
  updateConversation?(id: string, fn: (conversation: CopilotChatConversation) => CopilotChatConversation): void

  /**
   * Update the last conversation messages
   * @param fn
   */
  updateLastConversation?(fn: (conversation: CopilotChatConversation) => CopilotChatConversation): void

  /**
   * Execute command suggestion completion request
   *
   * @param input
   * @param options
   */
  executeCommandSuggestion(
    input: string,
    options: { command: CopilotCommand; context: CopilotContext }
  ): Promise<SuggestionOutput>

  stopConversation(): void
}

export const SuggestionOutputTool = tool((_) => '补全用户提示语', {
  name: 'output_formatter',
  description: 'Should always be used to properly format output',
  schema: z.object({
    input: z.string().describe('Prompt after completion'),
    suggestions: z.array(z.string().describe('One suggestion input')).describe('An array of suggestions')
  })
})

export type SuggestionOutput = string | {
  input?: string;
  suggestions?: Array<string>
}