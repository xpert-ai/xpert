import { normalizeKnowledgebaseFAQConfig } from './faq-config'

describe('FAQ creation config', () => {
    const base = { indexMode: 'question_only', questionIndexMode: 'separate' }
    it('keeps legacy configurations exact', () => {
        expect(normalizeKnowledgebaseFAQConfig(base).negativeMatchMode).toBe('exact')
    })
    it('accepts explicit creation-time semantic parameters', () => {
        const config = { ...base, negativeMatchMode: 'semantic', semanticThreshold: 0.85, semanticMargin: 0.05 }
        expect(normalizeKnowledgebaseFAQConfig(config)).toEqual(config)
    })
    it.each([undefined, null, NaN, Infinity, -0.1, 1.1, '0.85'])('rejects threshold %p', (semanticThreshold) => {
        expect(() =>
            normalizeKnowledgebaseFAQConfig({
                ...base,
                negativeMatchMode: 'semantic',
                semanticThreshold,
                semanticMargin: 0.05
            })
        ).toThrow()
    })
    it.each([undefined, null, NaN, Infinity, 0, -0.1, 2.1, '0.05'])('rejects margin %p', (semanticMargin) => {
        expect(() =>
            normalizeKnowledgebaseFAQConfig({
                ...base,
                negativeMatchMode: 'semantic',
                semanticThreshold: 0.85,
                semanticMargin
            })
        ).toThrow()
    })
    it('rejects an unknown mode and non-string index discriminators', () => {
        expect(() => normalizeKnowledgebaseFAQConfig({ ...base, negativeMatchMode: 'other' })).toThrow()
        expect(() =>
            normalizeKnowledgebaseFAQConfig({ ...base, indexMode: { toString: () => 'question_only' } })
        ).toThrow()
    })
})
