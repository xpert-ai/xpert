import type { McpRequiredContext } from '@xpert-ai/contracts'
import type { ToolExecutionContext } from '../toolset/tool-execution-context'
import type { McpCompletionHandler } from './completion'
import type { McpResourceReadResult } from './resource'

export interface McpResourceTemplateArgument {
  required: boolean
  description?: string
}

export interface McpResourceTemplateDefinition {
  key: string
  uriTemplate: string
  title?: string
  description?: string
  mimeType?: string
  arguments: Record<string, McpResourceTemplateArgument>
  requiredContext?: McpRequiredContext[]
  cacheTtlMs?: number
  read(
    arguments_: Record<string, string>,
    context: ToolExecutionContext
  ): McpResourceReadResult | Promise<McpResourceReadResult>
  complete?: McpCompletionHandler
}

export function defineMcpResourceTemplate(
  definition: McpResourceTemplateDefinition
): Readonly<McpResourceTemplateDefinition> {
  return Object.freeze(definition)
}
