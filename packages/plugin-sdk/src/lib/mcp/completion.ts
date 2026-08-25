import type { ToolExecutionContext } from '../toolset/tool-execution-context'

export interface McpCompletionRequest {
  argument: string
  value: string
}

export interface McpCompletionResult {
  values: string[]
  total?: number
  hasMore?: boolean
}

export type McpCompletionHandler = (
  request: McpCompletionRequest,
  context: ToolExecutionContext
) => McpCompletionResult | Promise<McpCompletionResult>
