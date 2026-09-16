import { compareFAQVectors, cosineSimilarity, matchFAQExactly } from './faq-semantic-match'

describe('FAQ semantic exclusion', () => {
    const policy = { threshold: 0.85, margin: 0.05 }
    const query = [1, 0]
    const vector = (similarity: number) => [similarity, Math.sqrt(1 - similarity * similarity)]

    it('excludes only when both the negative threshold and positive margin are met', () => {
        expect(compareFAQVectors(query, [vector(0.72)], [vector(0.91)], policy)).toMatchObject({
            action: 'exclude',
            reason: 'semantic_negative'
        })
        expect(compareFAQVectors(query, [vector(0.86)], [vector(0.88)], policy).action).toBe('keep')
        expect(compareFAQVectors(query, [vector(0.4)], [vector(0.8)], policy).action).toBe('keep')
    })

    it('protects the strongest positive question and compares individual negative questions', () => {
        expect(compareFAQVectors(query, [vector(0.4), vector(0.93)], [vector(0.95)], policy).action).toBe('keep')
        expect(compareFAQVectors(query, [vector(0.6)], [vector(0.3), vector(0.95)], policy).action).toBe('exclude')
    })

    it('normalizes exact matches and gives exact negatives precedence over conflicting positives', () => {
        const questions = { standardQuestion: 'Refund', similarQuestions: ['Return'], negativeQuestions: ['Keep'] }
        expect(matchFAQExactly(' ＫＥＥＰ ', questions)).toEqual({ action: 'exclude', reason: 'exact_negative' })
        expect(matchFAQExactly(' return ', questions)).toEqual({ action: 'keep', reason: 'exact_positive' })
        expect(matchFAQExactly('anything', { ...questions, negativeQuestions: [] })).toEqual({
            action: 'keep',
            reason: 'no_negatives'
        })
        expect(matchFAQExactly('keep', { ...questions, standardQuestion: 'Keep' })?.action).toBe('exclude')
        expect(matchFAQExactly('different', questions)).toBeUndefined()
    })

    it.each([
        [[], []],
        [
            [0, 0],
            [1, 0]
        ],
        [[1], [1, 0]],
        [[NaN], [1]],
        [[Infinity], [1]]
    ])('rejects invalid vectors rather than treating a failed comparison as KEEP', (left, right) => {
        expect(() => cosineSimilarity(left, right)).toThrow()
    })

    it('uses cosine rather than an unnormalized dot product', () => {
        expect(cosineSimilarity([2, 0], [3, 0])).toBeCloseTo(1)
        expect(cosineSimilarity([2, 0], [-3, 0])).toBeCloseTo(-1)
    })
})
