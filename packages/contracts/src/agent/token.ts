export type TTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
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
