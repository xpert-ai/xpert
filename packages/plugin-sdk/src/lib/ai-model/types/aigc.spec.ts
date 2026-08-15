import type { ModelInvocationEvent } from '@xpert-ai/contracts'
import { ModelProviderHttpError } from '../model-provider-http-client'
import {
  ManagedAIGCModelClient,
  ManagedAsyncAIGCModelClient,
  type AIGCModelClient,
  type AsyncAIGCModelClient,
  type ModelInvocationRecorder
} from './aigc'

describe('ManagedAIGCModelClient', () => {
  it('does not rewrite Provider success as failure when observation persistence fails', async () => {
    const events: ModelInvocationEvent[] = []
    const recorder: ModelInvocationRecorder = jest.fn(async (event) => {
      events.push(event)
      if (event.phase === 'start') return { invocationId: 'invocation-1', created: true }
      throw new Error('database unavailable')
    })
    const provider: AIGCModelClient<string, { imageUrl: string }> = {
      invoke: jest.fn().mockResolvedValue({
        data: { imageUrl: 'https://example.com/image.png' },
        observation: {
          state: 'succeeded',
          usageAvailability: 'available',
          metrics: [{ unit: 'token', totalTokens: 10, authority: 'provider' }]
        }
      })
    }
    const client = new ManagedAIGCModelClient(provider, recorder, {
      provider: 'test',
      model: 'image-model',
      toolName: 'text_to_image',
      modality: 'image'
    })

    await expect(
      client.invoke('prompt', { invocationKey: 'tool-call-1', operation: 'text_to_image' })
    ).resolves.toEqual(
      expect.objectContaining({
        data: { imageUrl: 'https://example.com/image.png' },
        invocationId: 'invocation-1'
      })
    )

    expect(events).toEqual([
      expect.objectContaining({ phase: 'start' }),
      expect.objectContaining({ phase: 'observe', state: 'succeeded' })
    ])
  })
})

describe('ManagedAsyncAIGCModelClient', () => {
  it('records a confirmed Provider rejection as failed', async () => {
    const error = new ModelProviderHttpError('rejected', 400)
    const { client, events } = createClient({ submit: jest.fn().mockRejectedValue(error) })

    await expect(client.submit('prompt', context())).rejects.toBe(error)

    expect(events).toEqual([
      expect.objectContaining({ phase: 'start' }),
      expect.objectContaining({
        phase: 'observe',
        state: 'failed',
        errorCode: 'provider_submission_rejected'
      })
    ])
  })

  it('records an ambiguous Provider response as acceptance unknown', async () => {
    const error = new ModelProviderHttpError('unavailable', 503)
    const { client, events } = createClient({ submit: jest.fn().mockRejectedValue(error) })

    await expect(client.submit('prompt', context())).rejects.toBe(error)

    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        phase: 'observe',
        state: 'acceptance_unknown',
        errorCode: 'provider_acceptance_unknown'
      })
    )
  })

  it('does not rewrite Provider success as failure when bind persistence fails', async () => {
    const events: ModelInvocationEvent[] = []
    const recorder: ModelInvocationRecorder = jest.fn(async (event) => {
      events.push(event)
      if (event.phase === 'start') return { invocationId: 'invocation-1', created: true }
      if (event.phase === 'bind') throw new Error('database unavailable')
      return { invocationId: 'invocation-1' }
    })
    const provider: AsyncAIGCModelClient<string, { accepted: boolean }> = {
      submit: jest.fn().mockResolvedValue({ providerRequestId: 'task-1', data: { accepted: true } }),
      query: jest.fn()
    }
    const client = managed(provider, recorder)

    await expect(client.submit('prompt', context())).resolves.toEqual({
      providerRequestId: 'task-1',
      data: { accepted: true },
      created: true,
      providerState: 'submitted'
    })

    expect(events.map((event) => event.phase)).toEqual(['start', 'bind'])
  })
})

function createClient(overrides: Partial<AsyncAIGCModelClient<string, { accepted: boolean }>>) {
  const events: ModelInvocationEvent[] = []
  const recorder: ModelInvocationRecorder = jest.fn(async (event) => {
    events.push(event)
    return { invocationId: 'invocation-1', created: event.phase === 'start' }
  })
  const provider: AsyncAIGCModelClient<string, { accepted: boolean }> = {
    submit: jest.fn().mockResolvedValue({ providerRequestId: 'task-1', data: { accepted: true } }),
    query: jest.fn(),
    ...overrides
  }
  return { client: managed(provider, recorder), events }
}

function managed(provider: AsyncAIGCModelClient<string, { accepted: boolean }>, recorder: ModelInvocationRecorder) {
  return new ManagedAsyncAIGCModelClient(provider, recorder, {
    provider: 'test',
    model: 'video-model',
    toolName: 'text_to_video',
    modality: 'video'
  })
}

function context() {
  return { invocationKey: 'tool-call-1', operation: 'text_to_video' as const }
}
