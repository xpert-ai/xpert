import { isKnowledgeDocumentVisible, KnowledgeDocumentMetadata } from '@xpert-ai/contracts'
import { assertUserManagedDocument } from './document-management'

describe('Generated document ownership and visibility', () => {
    it.each<[KnowledgeDocumentMetadata | null, boolean]>([
        [null, true],
        [{}, true],
        [{ systemManaged: false }, true],
        [{ systemManaged: true, systemManagedType: 'agent-writer' }, true],
        [{ systemManaged: true, systemManagedType: 'knowledge-wiki' }, false],
        [{ systemManaged: true, systemManagedType: 'faq' }, false],
        [{ systemManaged: true }, false]
    ])('separates visibility from ownership for %j', (metadata, expected) => {
        expect(isKnowledgeDocumentVisible(metadata)).toBe(expected)
    })

    it('keeps a visible Agent publication read-only while ordinary documents remain editable', () => {
        expect(() =>
            assertUserManagedDocument({ metadata: { systemManaged: true, systemManagedType: 'agent-writer' } })
        ).toThrow()
        expect(() => assertUserManagedDocument({ metadata: {} })).not.toThrow()
    })
})
