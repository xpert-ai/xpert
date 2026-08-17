import type { LLMPriceAuthority, LLMPriceBreakdownItem } from '../ai/ai-model.model'
import type { ModelUsagePricingStatus } from '../ai/model-usage.model'

export type TTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
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
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
  pricingStatus?: ModelUsagePricingStatus
  priceAuthority?: LLMPriceAuthority
  pricingBreakdown?: LLMPriceBreakdownItem[]
}
