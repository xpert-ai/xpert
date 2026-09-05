import { normalizeKnowledgebaseFAQRecall } from './knowledgebase.model'

describe('normalizeKnowledgebaseFAQRecall', () => {
  it('falls back from graph retrieval to vector and keyword hybrid retrieval', () => {
    expect(
      normalizeKnowledgebaseFAQRecall({
        mode: 'graph',
        fusion: {
          mode: 'legacy',
          weights: {
            vector: 0.4,
            keyword: 0.2,
            graph: 0.9
          }
        }
      })
    ).toMatchObject({
      mode: 'hybrid',
      fusion: {
        mode: 'weighted_rrf',
        weights: {
          vector: 0.4,
          keyword: 0.2,
          graph: 0
        }
      }
    })
  })

  it.each(['vector', 'keyword'] as const)('preserves the supported %s mode', (mode) => {
    expect(normalizeKnowledgebaseFAQRecall({ mode }).mode).toBe(mode)
  })
})
