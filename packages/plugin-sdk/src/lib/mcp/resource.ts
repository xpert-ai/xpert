import type { JSONValue, McpRequiredContext } from '@xpert-ai/contracts'
import type { ToolExecutionContext } from '../toolset/tool-execution-context'

export interface McpResourceContent {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
  meta?: Record<string, JSONValue>
}

export interface McpResourceReadResult {
  contents: McpResourceContent[]
}

export interface McpResourceDefinition {
  key: string
  uri: string
  title?: string
  description?: string
  mimeType?: string
  requiredContext?: McpRequiredContext[]
  cacheTtlMs?: number
  read(context: ToolExecutionContext): McpResourceReadResult | Promise<McpResourceReadResult>
}

export function defineMcpResource(definition: McpResourceDefinition): Readonly<McpResourceDefinition> {
  return Object.freeze(definition)
}
