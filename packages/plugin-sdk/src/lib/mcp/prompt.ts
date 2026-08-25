import type { McpRequiredContext } from '@xpert-ai/contracts'
import type { ToolExecutionContext } from '../toolset/tool-execution-context'
import type { McpCompletionHandler } from './completion'

export interface McpPromptArgument {
  required: boolean
  description?: string
}

export type McpPromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string; blob?: string }

export interface McpPromptMessage {
  role: 'user' | 'assistant'
  content: McpPromptContent
}

export interface McpPromptResult {
  description?: string
  messages: McpPromptMessage[]
}

export interface McpPromptDefinition {
  key: string
  name: string
  title?: string
  description?: string
  arguments?: Record<string, McpPromptArgument>
  requiredContext?: McpRequiredContext[]
  supportsCompletion?: boolean
  get(arguments_: Record<string, string>, context: ToolExecutionContext): McpPromptResult | Promise<McpPromptResult>
  complete?: McpCompletionHandler
}

export function defineMcpPrompt(definition: McpPromptDefinition): Readonly<McpPromptDefinition> {
  return Object.freeze(definition)
}
