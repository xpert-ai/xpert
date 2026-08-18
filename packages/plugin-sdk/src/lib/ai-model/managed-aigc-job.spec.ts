import {
  AiModelTypeEnum,
  ModelAccessChannelEnum,
  ModelAccessOwnershipScopeEnum,
  ModelAccessSourceEnum,
  type IModelAccessResolution
} from '@xpert-ai/contracts'
import type { AgentMiddlewareModelProviderConnection } from '../agent/middleware/runtime'
import type { ManagedQueueJob } from '../managed-queue'
import { processAsyncAIGCManagedJob, type AsyncAIGCManagedJobPayload } from './managed-aigc-job'

const modelAccess = {
  allowed: true,
  channel: ModelAccessChannelEnum.Xpert,
  billableUserId: 'billing-user-1',
  copilotId: 'copilot-1',
  copilotModelId: 'video-model',
  provider: 'provider',
  modelType: AiModelTypeEnum.VIDEO,
  model: 'video-model',
  accessSource: ModelAccessSourceEnum.Grant,
  grantId: 'grant-1',
  multiplier: 1.5,
  scope: ModelAccessOwnershipScopeEnum.Tenant
} satisfies IModelAccessResolution

describe('processAsyncAIGCManagedJob', () => {
  const initialPayload: AsyncAIGCManagedJobPayload<{ prompt: string }, { filePath: string }> = {
    requestId: 'tool-call-1',
    model: 'video-model',
    toolName: 'text_to_video',
    modality: 'video',
    operation: 'text_to_video',
    input: { prompt: 'hello' },
    phase: 'queued',
    startedAt: '2026-08-15T00:00:00.000Z'
  }

  it('checkpoints provider acceptance and reports final usage before delivering the result', async () => {
    const job = createJob(initialPayload)
    const client = {
      submit: jest.fn().mockResolvedValue({ providerRequestId: 'provider-1', data: {} }),
      query: jest
        .fn()
        .mockResolvedValueOnce({ data: {}, observation: { state: 'processing' } })
        .mockResolvedValueOnce({
          data: { url: 'https://example.com/video.mp4' },
          observation: {
            state: 'succeeded',
            metrics: [{ unit: 'second' as const, quantity: 5, authority: 'provider' as const }]
          }
        })
    }
    const provider = createProvider()
    const finalize = jest.fn().mockResolvedValue({ filePath: 'files/video.mp4' })

    await expect(
      processAsyncAIGCManagedJob(job, { client, provider, finalize, sleep: async () => undefined })
    ).resolves.toEqual({ filePath: 'files/video.mp4' })

    expect(client.submit).toHaveBeenCalledTimes(1)
    expect(provider.resolveModelAccess).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'tool-call-1', model: 'video-model' })
    )
    expect(provider.reportUsage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'tool-call-1', pricingSnapshot: expect.any(Object) }),
      modelAccess
    )
    expect(finalize).toHaveBeenCalledTimes(1)
    expect(job.data).toEqual(expect.objectContaining({ phase: 'succeeded', usageReported: true, modelAccess }))
  })

  it('resumes a submitted checkpoint without submitting the provider request again', async () => {
    const job = createJob({
      ...initialPayload,
      providerRequestId: 'provider-1',
      phase: 'submitted',
      pricingSnapshot: { capturedAt: '2026-08-15T00:00:00.000Z', rules: [] },
      modelAccess
    })
    const client = {
      submit: jest.fn(),
      query: jest.fn().mockResolvedValue({
        data: { url: 'https://example.com/video.mp4' },
        observation: {
          state: 'succeeded',
          metrics: [{ unit: 'generation' as const, quantity: 1, authority: 'contract' as const }]
        }
      })
    }

    const provider = createProvider()
    await processAsyncAIGCManagedJob(job, {
      client,
      provider,
      finalize: async () => ({ filePath: 'files/video.mp4' })
    })

    expect(client.submit).not.toHaveBeenCalled()
    expect(provider.resolveModelAccess).not.toHaveBeenCalled()
  })

  it('stops before provider submission when model access is rejected', async () => {
    const job = createJob(initialPayload)
    const client = {
      submit: jest.fn(),
      query: jest.fn()
    }
    const provider = createProvider()
    provider.resolveModelAccess = jest.fn().mockRejectedValue(new Error('model access denied'))

    await expect(
      processAsyncAIGCManagedJob(job, {
        client,
        provider,
        finalize: async () => ({ filePath: 'files/video.mp4' })
      })
    ).rejects.toThrow('model access denied')

    expect(client.submit).not.toHaveBeenCalled()
    expect(provider.reportUsage).not.toHaveBeenCalled()
  })

  it('checkpoints reported usage before failing a terminal provider task', async () => {
    const job = createJob({
      ...initialPayload,
      providerRequestId: 'provider-1',
      phase: 'submitted',
      pricingSnapshot: { capturedAt: '2026-08-15T00:00:00.000Z', rules: [] }
    })
    const provider = createProvider()
    const client = {
      submit: jest.fn(),
      query: jest.fn().mockResolvedValue({
        data: {},
        observation: {
          state: 'failed' as const,
          errorCode: 'provider_rejected',
          metrics: [{ unit: 'generation' as const, quantity: 1, authority: 'provider' as const }]
        }
      })
    }

    await expect(
      processAsyncAIGCManagedJob(job, {
        client,
        provider,
        finalize: async () => ({ filePath: 'files/video.mp4' })
      })
    ).rejects.toThrow('provider_rejected')

    expect(provider.reportUsage).toHaveBeenCalledTimes(1)
    expect(job.data).toEqual(expect.objectContaining({ phase: 'failed', providerState: 'failed', usageReported: true }))
  })
})

function createJob<TInput, TResult>(payload: AsyncAIGCManagedJobPayload<TInput, TResult>) {
  const job: ManagedQueueJob<AsyncAIGCManagedJobPayload<TInput, TResult>> = {
    id: payload.requestId,
    name: 'generate',
    data: payload,
    attemptsMade: 0,
    updateData: jest.fn(async (next) => {
      job.data = next
    })
  }
  return job
}

function createProvider(): AgentMiddlewareModelProviderConnection {
  return {
    providerScopeId: 'provider-scope-1',
    copilotId: 'copilot-1',
    provider: 'provider',
    baseURL: 'https://example.com',
    authorization: 'Bearer token',
    resolveModelAccess: jest.fn().mockResolvedValue(modelAccess),
    resolvePricingSnapshot: jest.fn().mockResolvedValue({
      capturedAt: '2026-08-15T00:00:00.000Z',
      rules: []
    }),
    reportUsage: jest.fn().mockResolvedValue({ requestId: 'tool-call-1', recorded: true, ledgerIds: ['ledger-1'] })
  }
}
