export type TTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type TThreadContextUsageMetrics = {
  contextTokens: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  embedTokens: number
  totalPrice: number
  currency: string | null
}

export type TThreadContextUsageEvent = {
  type: 'thread_context_usage'
  threadId: string
  runId: string | null
  agentKey: string
  updatedAt: string
  usage: TThreadContextUsageMetrics
}

export interface IModelUsage {
  totalTokens: number
  totalPrice: number
  currency: string
  latency: number
}

export interface ILLMUsage extends IModelUsage {
  promptTokens: number
  promptUnitPrice: number
  promptPriceUnit: number
  promptPrice: number
  completionTokens: number
  completionUnitPrice: number
  completionPriceUnit: number
  completionPrice: number
}
