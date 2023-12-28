import { Observable } from 'rxjs'
import { CopilotCommand } from './command'
import { CopilotService } from './copilot'
import { AIOptions, AnnotatedFunction, CopilotChatMessage, CopilotChatResponseChoice } from './types'
import { Message } from 'ai'

/**
 * Copilot engine
 */
export interface CopilotEngine {
  copilot?: CopilotService

  /**
   * Copilot engine name
   */
  name?: string
  /**
   * AI Configuration
   */
  aiOptions: AIOptions
  /**
   * System prompt
   */
  systemPrompt?: string
  /**
   * Predefined prompts
   * @deprecated use commands instead
   */
  prompts?: string[]

  /**
   * Conversations
   */
  conversations: CopilotChatMessage[]
  /**
   * Placeholder in ask input
   */
  placeholder?: string

  process(
    data: { prompt: string; messages?: CopilotChatMessage[] },
    options?: { action?: string }
  ): Observable<CopilotChatMessage | string | void>
  preprocess?: (prompt: string, options?: any) => void
  postprocess?(prompt: string, choices: CopilotChatResponseChoice[]): Observable<CopilotChatMessage[] | string>

  /**
   * How to process the event when user drag drop a data
   *
   * @param event
   */
  dropCopilot?: (event) => void

  setEntryPoint?: (id: string, entryPoint: AnnotatedFunction<any[]>) => void
  removeEntryPoint?: (id: string) => void
  registerCommand?(area: string, command: CopilotCommand): void
  unregisterCommand?(area: string, name: string): void

  /**
   * Get all commands in this copilot engine
   *
   * @returns CopilotCommand[]
   */
  commands?: () => CopilotCommand[]

  /**
   * Clear conversations
   */
  clear(): void
}
