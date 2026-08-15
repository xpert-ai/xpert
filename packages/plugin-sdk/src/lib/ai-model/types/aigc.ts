import type {
  ICopilotModel,
  ModelUsageMetric,
  ModelUsageOperation,
  ModelUsagePricingDimensions
} from '@xpert-ai/contracts'
import { AIModel } from '../ai-model'
import type { TChatModelOptions } from './model'

export type AIGCModelState = 'submitted' | 'processing' | 'succeeded' | 'failed' | 'cancelled'

export type AIGCModelObservation = {
  state: AIGCModelState
  metrics?: ModelUsageMetric[]
  errorCode?: string
}

export interface AIGCModelClient<TInput = unknown, TOutput = unknown> {
  invoke(input: TInput): Promise<AIGCModelResult<TOutput>>
}

export type AIGCModelResult<TData> = {
  data: TData
  observation: AIGCModelObservation
}

export type AsyncAIGCModelSubmission<TData> = {
  providerRequestId: string
  data: TData
}

export type AsyncAIGCModelQueryContext = {
  operation?: ModelUsageOperation
  pricingDimensions?: ModelUsagePricingDimensions
}

export type AsyncAIGCModelQueryResult<TData> = {
  data: TData
  observation: AIGCModelObservation
}

/** Provider adapter contract for APIs that submit and observe an asynchronous generation task. */
export interface AsyncAIGCModelClient<TInput = unknown, TData = unknown> {
  submit(input: TInput): Promise<AsyncAIGCModelSubmission<TData>>
  query(providerRequestId: string, context?: AsyncAIGCModelQueryContext): Promise<AsyncAIGCModelQueryResult<TData>>
}

export abstract class ImageGenerationModel extends AIModel {
  abstract override getAIGCModel(copilotModel: ICopilotModel, options?: TChatModelOptions): AIGCModelClient
}

export abstract class VideoGenerationModel extends AIModel {
  abstract override getAIGCModel(copilotModel: ICopilotModel, options?: TChatModelOptions): AsyncAIGCModelClient
}
