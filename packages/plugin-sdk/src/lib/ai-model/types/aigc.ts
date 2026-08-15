import type {
  ICopilotModel,
  ModelInvocationEvent,
  ModelInvocationArtifactState,
  ModelInvocationObservation,
  ModelInvocationOperation,
  ModelInvocationPricingDimensions,
  ModelInvocationPricingSnapshot,
  ModelInvocationProviderState,
  ModelInvocationRecordResult,
  ModelUsagePricingContext
} from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { AIModel } from '../ai-model'
import { ModelProviderHttpError } from '../model-provider-http-client'
import type { TChatModelOptions } from './model'

export interface AIGCModelClient<TInput = unknown, TOutput = unknown> {
  invoke(input: TInput): Promise<AIGCModelResult<TOutput>>
}

export type AIGCModelResult<TData> = {
  data: TData
  observation: ModelInvocationObservation
}

export type AsyncAIGCModelSubmission<TData> = {
  providerRequestId: string
  data: TData
}

export type AsyncAIGCModelQueryContext = {
  operation?: ModelInvocationOperation
  pricingDimensions?: ModelInvocationPricingDimensions
}

export type AsyncAIGCModelQueryResult<TData> = {
  data: TData
  observation: ModelInvocationObservation
}

/** Provider adapter contract for APIs that submit an asynchronous generation task. */
export interface AsyncAIGCModelClient<TInput = unknown, TData = unknown> {
  submit(input: TInput): Promise<AsyncAIGCModelSubmission<TData>>
  query(providerRequestId: string, context?: AsyncAIGCModelQueryContext): Promise<AsyncAIGCModelQueryResult<TData>>
}

export type ModelInvocationRecorder = (event: ModelInvocationEvent) => Promise<ModelInvocationRecordResult>

export type ModelInvocationPricingResolver = (
  context: ModelUsagePricingContext
) => Promise<ModelInvocationPricingSnapshot>

export type ManagedAIGCModelDefaults = {
  provider: string
  model: string
  toolName: string
  modality: 'image' | 'video'
}

export type ManagedAIGCSubmitContext = {
  invocationKey: string
  operation: ModelInvocationOperation
  pricingDimensions?: ModelInvocationPricingDimensions
}

export type ManagedAIGCModelSubmission<TData> = {
  providerRequestId: string
  data?: TData
  created: boolean
  providerState?: ModelInvocationProviderState
}

export type ManagedAIGCModelResult<TData> = AIGCModelResult<TData> & {
  invocationId?: string
}

const invocationRecorderLogger = new Logger('AIGCModelInvocationRecorder')

/** Applies the host-owned invocation lifecycle to a synchronous Provider generation call. */
export class ManagedAIGCModelClient<TInput = unknown, TData = unknown> {
  constructor(
    private readonly client: AIGCModelClient<TInput, TData>,
    private readonly recorder: ModelInvocationRecorder | undefined,
    private readonly defaults: ManagedAIGCModelDefaults,
    private readonly resolvePricingSnapshot?: ModelInvocationPricingResolver
  ) {}

  async invoke(input: TInput, context: ManagedAIGCSubmitContext): Promise<ManagedAIGCModelResult<TData>> {
    const pricingSnapshot = await this.resolvePricingSnapshot?.({
      model: this.defaults.model,
      operation: context.operation,
      modality: this.defaults.modality,
      pricingDimensions: context.pricingDimensions
    })
    const started = await this.recorder?.({
      phase: 'start',
      invocationKey: requireText(context.invocationKey, 'invocation key'),
      provider: this.defaults.provider,
      model: this.defaults.model,
      toolName: this.defaults.toolName,
      operation: context.operation,
      modality: this.defaults.modality,
      pricingDimensions: context.pricingDimensions,
      pricingSnapshot
    })
    if (started?.created === false) {
      throw new Error('This synchronous model invocation was already completed or is still running')
    }

    let result: AIGCModelResult<TData>
    try {
      result = await this.client.invoke(input)
    } catch (error) {
      await recordAfterProviderCall(this.recorder, {
        phase: 'observe',
        invocationId: started?.invocationId,
        state: 'failed',
        usageAvailability: 'unknown',
        artifactState: 'not_requested',
        errorCode: 'provider_invocation_failed'
      })
      throw error
    }

    await recordAfterProviderCall(this.recorder, {
      phase: 'observe',
      invocationId: started?.invocationId,
      ...result.observation
    })
    return {
      ...result,
      ...(started?.invocationId ? { invocationId: started.invocationId } : {})
    }
  }

  async recordArtifact(
    invocationId: string | undefined,
    artifactState: ModelInvocationArtifactState,
    artifactErrorCode?: string
  ): Promise<void> {
    if (!invocationId) return
    await recordAfterProviderCall(this.recorder, {
      phase: 'artifact',
      invocationId,
      artifactState,
      artifactErrorCode
    })
  }
}

/**
 * Applies the host-owned invocation lifecycle to one Provider adapter.
 * Provider-specific payloads and observations remain in the wrapped client.
 */
export class ManagedAsyncAIGCModelClient<TInput = unknown, TData = unknown> {
  constructor(
    private readonly client: AsyncAIGCModelClient<TInput, TData>,
    private readonly recorder: ModelInvocationRecorder | undefined,
    private readonly defaults: ManagedAIGCModelDefaults,
    private readonly resolvePricingSnapshot?: ModelInvocationPricingResolver
  ) {}

  async submit(input: TInput, context: ManagedAIGCSubmitContext): Promise<ManagedAIGCModelSubmission<TData>> {
    if (!this.recorder) {
      const submission = await this.client.submit(input)
      return { ...submission, created: true }
    }

    const pricingSnapshot = await this.resolvePricingSnapshot?.({
      model: this.defaults.model,
      operation: context.operation,
      modality: this.defaults.modality,
      pricingDimensions: context.pricingDimensions
    })
    const started = await this.recorder({
      phase: 'start',
      invocationKey: requireText(context.invocationKey, 'invocation key'),
      provider: this.defaults.provider,
      model: this.defaults.model,
      toolName: this.defaults.toolName,
      operation: context.operation,
      modality: this.defaults.modality,
      pricingDimensions: context.pricingDimensions,
      pricingSnapshot
    })
    if (started.created === false) {
      const providerRequestId = requireText(started.providerRequestId, 'bound Provider request ID')
      return {
        providerRequestId,
        created: false,
        providerState: started.providerState
      }
    }

    let submission: AsyncAIGCModelSubmission<TData>
    try {
      submission = await this.client.submit(input)
    } catch (error) {
      const rejected = error instanceof ModelProviderHttpError && error.status >= 400 && error.status < 500
      await recordAfterProviderCall(this.recorder, {
        phase: 'observe',
        invocationId: started.invocationId,
        state: rejected ? 'failed' : 'acceptance_unknown',
        usageAvailability: 'unknown',
        artifactState: 'not_requested',
        errorCode: rejected ? 'provider_submission_rejected' : 'provider_acceptance_unknown'
      })
      throw error
    }

    await recordAfterProviderCall(this.recorder, {
      phase: 'bind',
      invocationId: started.invocationId,
      providerRequestId: submission.providerRequestId
    })
    return { ...submission, created: true, providerState: 'submitted' }
  }

  async query(
    providerRequestId: string,
    context?: AsyncAIGCModelQueryContext
  ): Promise<AsyncAIGCModelQueryResult<TData>> {
    const result = await this.client.query(providerRequestId, context)
    await recordAfterProviderCall(this.recorder, {
      phase: 'observe',
      providerRequestId,
      ...result.observation
    })
    return result
  }

  async recordArtifact(
    providerRequestId: string,
    artifactState: ModelInvocationArtifactState,
    artifactErrorCode?: string
  ): Promise<void> {
    await recordAfterProviderCall(this.recorder, {
      phase: 'artifact',
      providerRequestId,
      artifactState,
      artifactErrorCode
    })
  }
}

export abstract class ImageGenerationModel extends AIModel {
  abstract override getAIGCModel(copilotModel: ICopilotModel, options?: TChatModelOptions): AIGCModelClient
}

export abstract class VideoGenerationModel extends AIModel {
  abstract override getAIGCModel(copilotModel: ICopilotModel, options?: TChatModelOptions): AsyncAIGCModelClient
}

async function recordAfterProviderCall(
  recorder: ModelInvocationRecorder | undefined,
  event: ModelInvocationEvent
): Promise<void> {
  if (!recorder) return
  try {
    await recorder(event)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    invocationRecorderLogger.warn(`Model invocation ${event.phase} persistence failed after Provider call: ${message}`)
  }
}

function requireText(value: string | null | undefined, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`Missing ${label}`)
  return normalized
}
