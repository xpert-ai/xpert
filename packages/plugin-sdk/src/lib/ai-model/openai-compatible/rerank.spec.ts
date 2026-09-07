import { Document } from '@langchain/core/documents'
import { OpenAICompatibleReranker } from './rerank'

describe('OpenAICompatibleReranker', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses the provider relevance score when applying a threshold to a single result', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ index: 0, relevance_score: 0.83 }]
      })
    } as Response)
    const reranker = new OpenAICompatibleReranker({
      endpointUrl: 'https://rerank.example.com/v1',
      apiKey: 'test-key'
    })

    await expect(
      reranker.rerank([new Document({ pageContent: 'relevant content' })], 'query', {
        model: 'rerank-model',
        topN: 1,
        scoreThreshold: 0.8
      })
    ).resolves.toEqual([{ index: 0, relevanceScore: 0.83 }])
  })
})
