import { documentFingerprintFilter } from './document-fingerprint-filter'
import { IsNull } from 'typeorm'

describe('authorized document fingerprint filters', () => {
    it('uses an exact normalized source hash and size rather than a text search', () => {
        expect(documentFingerprintFilter({ knowledgebaseId: 'kb', sourceHash: 'A'.repeat(64), size: 123 })).toEqual({
            where: { sourceHash: 'a'.repeat(64), size: 123 },
            appliedFilters: { sourceHash: 'a'.repeat(64), size: 123 }
        })
    })
    it('distinguishes an unfiltered catalog from the bounded legacy hash lookup', () => {
        expect(documentFingerprintFilter({ knowledgebaseId: 'kb' })).toEqual({ where: {}, appliedFilters: undefined })
        expect(documentFingerprintFilter({ knowledgebaseId: 'kb', sourceHash: null, size: 123 })).toEqual({
            where: { sourceHash: IsNull(), size: 123 },
            appliedFilters: { sourceHash: null, size: 123 }
        })
    })
    it.each(['', '%', 'x'.repeat(64), 'a'.repeat(63)])('rejects invalid source hashes: %s', (sourceHash) => {
        expect(() => documentFingerprintFilter({ knowledgebaseId: 'kb', sourceHash })).toThrow()
    })
    it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid byte sizes: %s', (size) => {
        expect(() => documentFingerprintFilter({ knowledgebaseId: 'kb', size })).toThrow()
    })
})
