import {
  AiModelTypeEnum,
  type ModelUsageMetric,
  type ModelUsageModality,
  type ModelUsageOperation,
  type ModelUsagePricingDimensions,
  type ModelUsagePricingSnapshot
} from '@xpert-ai/contracts'
import type { AgentMiddlewareModelProviderConnection } from '../agent/middleware/runtime'
import type { ManagedQueueJob } from '../managed-queue'
import type { AIGCModelObservation, AsyncAIGCModelClient } from './types/aigc'

export type AsyncAIGCManagedJobPhase = 'queued' | 'submitted' | 'processing' | 'succeeded' | 'failed'

/** Durable provider checkpoint stored inside the Managed Queue payload. */
export type AsyncAIGCManagedJobPayload<TInput, TResult> = {
  requestId: string
  model: string
  toolName: string
  modality: ModelUsageModality
  operation: ModelUsageOperation
  pricingDimensions?: ModelUsagePricingDimensions
  input: TInput
  phase: AsyncAIGCManagedJobPhase
  startedAt: string
  providerRequestId?: string
  providerState?: AIGCModelObservation['state']
  pricingSnapshot?: ModelUsagePricingSnapshot
  usageReported?: boolean
  result?: TResult
  errorCode?: string
  updatedAt?: string
}

export type ProcessAsyncAIGCManagedJobOptions<TInput, TData, TResult> = {
  client: AsyncAIGCModelClient<TInput, TData>
  provider: AgentMiddlewareModelProviderConnection
  pollIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  finalize(data: TData): Promise<TResult>
  failureMessage?(data: TData, observation: AIGCModelObservation): string
}

/**
 * Runs one asynchronous provider request inside a Managed Queue job.
 * Provider acceptance, terminal usage reporting, and result delivery are checkpointed so a queue retry resumes
 * from the last durable provider request instead of intentionally submitting a second request.
 */
export async function processAsyncAIGCManagedJob<TInput, TData, TResult>(
  job: ManagedQueueJob<AsyncAIGCManagedJobPayload<TInput, TResult>>,
  options: ProcessAsyncAIGCManagedJobOptions<TInput, TData, TResult>
): Promise<TResult> {
  let payload = job.data
  if (payload.phase === 'succeeded' && payload.result !== undefined) return payload.result
  if (payload.phase === 'failed') throw new Error(payload.errorCode || 'Provider generation task failed')

  if (!payload.pricingSnapshot) {
    const pricingSnapshot = options.provider.resolvePricingSnapshot
      ? await options.provider.resolvePricingSnapshot({
          model: payload.model,
          operation: payload.operation,
          modality: payload.modality,
          pricingDimensions: payload.pricingDimensions,
          startedAt: payload.startedAt
        })
      : {
          capturedAt: new Date().toISOString(),
          status: 'unpriced' as const,
          rules: []
        }
    payload = await checkpoint(job, { ...payload, pricingSnapshot })
  }

  if (!payload.providerRequestId) {
    const submission = await options.client.submit(payload.input)
    payload = await checkpoint(job, {
      ...payload,
      providerRequestId: submission.providerRequestId,
      phase: 'submitted',
      providerState: 'submitted'
    })
  }

  const providerRequestId = payload.providerRequestId
  const sleep = options.sleep ?? delay
  const pollIntervalMs = normalizePollInterval(options.pollIntervalMs)

  while (true) {
    const query = await options.client.query(providerRequestId, {
      operation: payload.operation,
      pricingDimensions: payload.pricingDimensions
    })
    const observation = query.observation
    payload = await checkpoint(job, {
      ...payload,
      providerState: observation.state,
      phase: toJobPhase(observation.state),
      ...(observation.errorCode ? { errorCode: observation.errorCode } : {})
    })

    if (observation.state === 'succeeded') {
      payload = await reportTerminalUsage(job, payload, observation.metrics, options.provider)
      const result = await options.finalize(query.data)
      payload = await checkpoint(job, { ...payload, phase: 'succeeded', result })
      return result
    }

    if (observation.state === 'failed' || observation.state === 'cancelled') {
      payload = await reportTerminalUsage(job, payload, observation.metrics, options.provider)
      const message =
        options.failureMessage?.(query.data, observation) ??
        observation.errorCode ??
        `Provider generation task ${providerRequestId} ${observation.state}`
      await checkpoint(job, { ...payload, phase: 'failed', errorCode: message })
      throw new Error(message)
    }

    await sleep(pollIntervalMs)
  }
}

async function reportTerminalUsage<TInput, TResult>(
  job: ManagedQueueJob<AsyncAIGCManagedJobPayload<TInput, TResult>>,
  payload: AsyncAIGCManagedJobPayload<TInput, TResult>,
  metrics: ModelUsageMetric[] | undefined,
  provider: AgentMiddlewareModelProviderConnection
) {
  if (payload.usageReported || !metrics?.length) return payload
  await provider.reportUsage({
    requestId: payload.requestId,
    model: payload.model,
    modelType: payload.modality === 'image' ? AiModelTypeEnum.IMAGE : AiModelTypeEnum.VIDEO,
    toolName: payload.toolName,
    operation: payload.operation,
    modality: payload.modality,
    pricingDimensions: payload.pricingDimensions,
    pricingSnapshot: payload.pricingSnapshot,
    metrics,
    recordedAt: new Date().toISOString()
  })
  return checkpoint(job, { ...payload, usageReported: true })
}

async function checkpoint<TInput, TResult>(
  job: ManagedQueueJob<AsyncAIGCManagedJobPayload<TInput, TResult>>,
  payload: AsyncAIGCManagedJobPayload<TInput, TResult>
) {
  const next = { ...payload, updatedAt: new Date().toISOString() }
  await job.updateData(next)
  return next
}

function toJobPhase(state: AIGCModelObservation['state']): AsyncAIGCManagedJobPhase {
  if (state === 'succeeded') return 'succeeded'
  if (state === 'failed' || state === 'cancelled') return 'failed'
  return state === 'submitted' ? 'submitted' : 'processing'
}

function normalizePollInterval(value?: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.trunc(Number(value)) : 5_000
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
