import type { LLMPriceAuthority, LLMPriceBreakdownItem } from '../ai/ai-model.model'
import type { ModelUsagePricingStatus } from '../ai/model-usage.model'

export type TTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
  reasoningTokens?: number
}

export interface IModelUsage {
  totalTokens: number
  totalPrice: number
  currency: string
  latency: number
}

export interface ILLMUsage extends IModelUsage {
  /** Omitted for authoritative provider usage. */
  type?: 'estimated'
  promptTokens: number
  promptUnitPrice: number
  promptPriceUnit: number
  promptPrice: number
  completionTokens: number
  completionUnitPrice: number
  completionPriceUnit: number
  completionPrice: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
  reasoningTokens?: number
  pricingStatus?: ModelUsagePricingStatus
  priceAuthority?: LLMPriceAuthority
  pricingBreakdown?: LLMPriceBreakdownItem[]
}
