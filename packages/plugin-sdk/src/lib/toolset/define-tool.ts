import type { McpRequiredContext, McpToolBehavior } from '@xpert-ai/contracts'
import type { ZodTypeAny, infer as ZodInfer } from 'zod'
import type { McpTaskExecutionPolicy } from '../mcp/task'
import type { ToolExecutionContext } from './tool-execution-context'
import type { XpertToolResult } from './tool-result'

export type XpertToolVisibility = 'model' | 'app'

export interface XpertToolExposure {
  mcp: {
    eligible: boolean
  }
}

export interface XpertToolAppBinding {
  resourceKey: string
}

type StructuredOutput<TSchema extends ZodTypeAny | undefined> = TSchema extends ZodTypeAny ? ZodInfer<TSchema> : unknown

export interface XpertToolDefinition<
  TInputSchema extends ZodTypeAny,
  TOutputSchema extends ZodTypeAny | undefined = undefined
> {
  name: string
  title?: string
  description: string
  inputSchema: TInputSchema
  outputSchema?: TOutputSchema
  exposure: XpertToolExposure
  behavior: McpToolBehavior
  requiredContext: McpRequiredContext[]
  visibility?: XpertToolVisibility[]
  app?: XpertToolAppBinding
  task?: McpTaskExecutionPolicy
  execute(
    input: ZodInfer<TInputSchema>,
    context: ToolExecutionContext
  ): XpertToolResult<StructuredOutput<TOutputSchema>> | Promise<XpertToolResult<StructuredOutput<TOutputSchema>>>
}

/** Runtime-erased form used when a toolset exposes heterogeneous declared tools. */
export type AnyXpertToolDefinition = XpertToolDefinition<ZodTypeAny, ZodTypeAny | undefined>

export function defineXpertTool<
  TInputSchema extends ZodTypeAny,
  TOutputSchema extends ZodTypeAny | undefined = undefined
>(
  definition: XpertToolDefinition<TInputSchema, TOutputSchema>
): Readonly<XpertToolDefinition<TInputSchema, TOutputSchema>> {
  return Object.freeze(definition)
}
