import {
  AiModelTypeEnum,
  ModelUsagePricingSnapshot,
  ModelUsageReport,
  ModelUsagePricingContext
} from '@xpert-ai/contracts'
import { OpenAICompatibleEmbeddings } from './embeddings'

function setup(usage: object | null = { prompt_tokens: 7, total_tokens: 7 }, maxRetries = 0) {
  const fetchMock = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const request: { input: string | string[]; encoding_format?: string } = JSON.parse(String(init?.body))
    const input = Array.isArray(request.input) ? request.input : [request.input]
    return new Response(
      JSON.stringify({
        object: 'list',
        model: 'embedding-test',
        data: input.map((_value, index) => ({
          object: 'embedding',
          index,
          embedding:
            request.encoding_format === 'base64'
              ? Buffer.from(new Float32Array([index, 1]).buffer).toString('base64')
              : [index, 1]
        })),
        ...(usage === null ? {} : { usage })
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  })
  const callbacks = {
    handleModelUsage: jest.fn(async (_report: ModelUsageReport) => undefined),
    resolveUsagePricingSnapshot: jest.fn(
      async (_context: ModelUsagePricingContext): Promise<ModelUsagePricingSnapshot> => ({
        capturedAt: new Date().toISOString(),
        rules: []
      })
    )
  }
  const client = new OpenAICompatibleEmbeddings(
    {
      model: 'embedding-test',
      apiKey: 'test-key',
      batchSize: 2,
      dimensions: 2,
      maxRetries,
      configuration: { baseURL: 'https://embedding.test/v1', fetch: fetchMock }
    },
    callbacks
  )
  return { client, callbacks, fetchMock }
}

describe('OpenAI-compatible embedding usage callbacks', () => {
  it('reports each document batch once with a distinct identity and preserves vectors and request options', async () => {
    const { client, callbacks, fetchMock } = setup()
    await expect(client.embedDocuments(['one', 'two', 'three'])).resolves.toEqual([
      [0, 1],
      [1, 1],
      [0, 1]
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const reports = callbacks.handleModelUsage.mock.calls.map(([report]) => report)
    expect(reports).toHaveLength(2)
    expect(new Set(reports.map((report) => report.requestId)).size).toBe(2)
    for (const report of reports) {
      expect(report).toMatchObject({
        model: 'embedding-test',
        modelType: AiModelTypeEnum.TEXT_EMBEDDING,
        operation: AiModelTypeEnum.TEXT_EMBEDDING,
        modality: 'text',
        metrics: [{ unit: 'token', authority: 'provider', promptTokens: 7, completionTokens: 0, totalTokens: 7 }]
      })
      expect(report).not.toHaveProperty('input')
    }
    for (const [_url, init] of fetchMock.mock.calls) {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'embedding-test', dimensions: 2 })
    }
  })

  it('reports query usage through the same callback', async () => {
    const { client, callbacks } = setup()
    await expect(client.embedQuery('question')).resolves.toEqual([0, 1])
    expect(callbacks.handleModelUsage).toHaveBeenCalledTimes(1)
  })

  it('does not invoke callbacks for an empty document list', async () => {
    const { client, callbacks, fetchMock } = setup()
    await expect(client.embedDocuments([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(callbacks.handleModelUsage).not.toHaveBeenCalled()
    expect(callbacks.resolveUsagePricingSnapshot).not.toHaveBeenCalled()
  })

  it('freezes the pricing snapshot before the request and returns it unchanged to accounting', async () => {
    const { client, callbacks, fetchMock } = setup()
    const pricing: ModelUsagePricingSnapshot = { capturedAt: '2026-10-31T00:00:00.000Z', rules: [] }
    callbacks.resolveUsagePricingSnapshot.mockImplementation(async () => {
      expect(fetchMock).not.toHaveBeenCalled()
      return pricing
    })
    await client.embedQuery('question')
    expect(callbacks.resolveUsagePricingSnapshot).toHaveBeenCalledTimes(1)
    expect(callbacks.handleModelUsage.mock.calls[0][0].pricingSnapshot).toBe(pricing)
  })

  it.each([undefined, 0])('derives a missing or zero total from positive input tokens (%s)', async (total_tokens) => {
    const { client, callbacks } = setup({ prompt_tokens: 7, total_tokens })
    await client.embedQuery('question')
    expect(callbacks.handleModelUsage).toHaveBeenCalledWith(
      expect.objectContaining({ metrics: [expect.objectContaining({ totalTokens: 7 })] })
    )
  })

  it('preserves a positive provider total', async () => {
    const { client, callbacks } = setup({ prompt_tokens: 7, total_tokens: 9 })
    await client.embedQuery('question')
    expect(callbacks.handleModelUsage).toHaveBeenCalledWith(
      expect.objectContaining({ metrics: [expect.objectContaining({ promptTokens: 7, totalTokens: 9 })] })
    )
  })

  it.each([
    null,
    {},
    { prompt_tokens: 0, total_tokens: 0 },
    { prompt_tokens: -1, total_tokens: 7 },
    { prompt_tokens: '7', total_tokens: 7 },
    { prompt_tokens: 7, total_tokens: 6 },
    { prompt_tokens: 0.5, total_tokens: 1 }
  ])('does not invent usage for an absent or invalid report (%j)', async (usage) => {
    const { client, callbacks } = setup(usage)
    await expect(client.embedQuery('question')).resolves.toEqual([0, 1])
    expect(callbacks.handleModelUsage).not.toHaveBeenCalled()
  })

  it('keeps standalone use compatible when runtime callbacks are absent', async () => {
    const { client, fetchMock } = setup()
    const standalone = new OpenAICompatibleEmbeddings({
      model: client.model,
      apiKey: 'test-key',
      maxRetries: 0,
      configuration: { baseURL: 'https://embedding.test/v1', fetch: fetchMock }
    })
    await expect(standalone.embedQuery('question')).resolves.toEqual([0, 1])
  })

  it('does not resolve pricing when no accounting callback is installed', async () => {
    const { fetchMock } = setup()
    const resolveUsagePricingSnapshot = jest.fn()
    const client = new OpenAICompatibleEmbeddings(
      {
        model: 'embedding-test',
        apiKey: 'test-key',
        maxRetries: 0,
        configuration: { baseURL: 'https://embedding.test/v1', fetch: fetchMock }
      },
      { resolveUsagePricingSnapshot }
    )
    await client.embedQuery('question')
    expect(resolveUsagePricingSnapshot).not.toHaveBeenCalled()
  })

  it('does not retry a billable request when accounting rejects', async () => {
    const { client, callbacks, fetchMock } = setup(undefined, 2)
    callbacks.handleModelUsage.mockRejectedValue(new Error('Accounting unavailable'))
    await expect(client.embedQuery('question')).rejects.toThrow('Accounting unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(callbacks.handleModelUsage).toHaveBeenCalledTimes(1)
  })

  it('does not send a request when pricing snapshot resolution rejects', async () => {
    const { client, callbacks, fetchMock } = setup()
    callbacks.resolveUsagePricingSnapshot.mockRejectedValue(new Error('Pricing unavailable'))
    await expect(client.embedQuery('question')).rejects.toThrow('Pricing unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports only the final successful result after a transport retry', async () => {
    const { client, callbacks, fetchMock } = setup(undefined, 1)
    fetchMock.mockRejectedValueOnce(new Error('Transient connection failure'))
    await expect(client.embedQuery('question')).resolves.toEqual([0, 1])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(callbacks.handleModelUsage).toHaveBeenCalledTimes(1)
    expect(callbacks.resolveUsagePricingSnapshot).toHaveBeenCalledTimes(1)
  })

  it('respects the configured transport retry limit without reporting failed calls', async () => {
    const { client, callbacks, fetchMock } = setup()
    fetchMock.mockRejectedValue(new Error('Connection lost'))
    await expect(client.embedQuery('question')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(callbacks.handleModelUsage).not.toHaveBeenCalled()
  })
})
