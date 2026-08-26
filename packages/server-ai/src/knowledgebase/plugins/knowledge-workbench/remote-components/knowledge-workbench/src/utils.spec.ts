import { extractInitialCitationTarget, normalizeFileSize } from './utils'

describe('knowledge workbench utils', () => {
    it('normalizes persisted string file sizes to bytes', () => {
        expect(normalizeFileSize('4114081')).toBe(4_114_081)
    })

    it('keeps valid numeric file sizes', () => {
        expect(normalizeFileSize(4_114_081)).toBe(4_114_081)
    })

    it('rejects invalid file sizes', () => {
        expect(normalizeFileSize('4 MB')).toBeUndefined()
        expect(normalizeFileSize(-1)).toBeUndefined()
    })

    it('reads a cited document and chunk from the host initial query', () => {
        expect(
            extractInitialCitationTarget({
                parameters: {
                    knowledgebaseId: 'kb-auto-1',
                    documentId: 'doc-auto-1',
                    chunkId: 'chunk-auto-7'
                }
            })
        ).toEqual({
            knowledgebaseId: 'kb-auto-1',
            documentId: 'doc-auto-1',
            chunkId: 'chunk-auto-7'
        })
    })

    it('ignores an initial query without a concrete document', () => {
        expect(extractInitialCitationTarget({ parameters: { knowledgebaseId: 'kb-auto-1' } })).toBeNull()
    })
})
