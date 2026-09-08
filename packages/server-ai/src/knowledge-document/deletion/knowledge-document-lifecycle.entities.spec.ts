import { getMetadataArgsStorage } from 'typeorm'
import {
    KnowledgeDocumentDeletionCleanupReceipt,
    KnowledgeDocumentDeletionIntent,
    KnowledgeDocumentPublicationAttempt,
    KnowledgeDocumentPublicationAttemptSource
} from './entities'

describe('knowledge document lifecycle entities', () => {
    it('registers durable deletion and publication records', () => {
        const targets = [
            KnowledgeDocumentDeletionIntent,
            KnowledgeDocumentDeletionCleanupReceipt,
            KnowledgeDocumentPublicationAttempt,
            KnowledgeDocumentPublicationAttemptSource
        ]
        const tableNames = getMetadataArgsStorage()
            .tables.filter((table) => targets.includes(table.target as (typeof targets)[number]))
            .map((table) => table.name)

        expect(tableNames).toEqual(
            expect.arrayContaining([
                'knowledge_document_deletion_intent',
                'knowledge_document_deletion_cleanup_receipt',
                'knowledge_document_publication_attempt',
                'knowledge_document_publication_attempt_source'
            ])
        )
    })

    it('keeps manifests, external outcomes, and publication artifacts in explicit jsonb columns', () => {
        const columns = getMetadataArgsStorage().columns
        const column = (target: object, propertyName: string) =>
            columns.find((item) => item.target === target && item.propertyName === propertyName)?.options

        expect(column(KnowledgeDocumentDeletionIntent, 'manifest')).toMatchObject({ type: 'jsonb' })
        expect(column(KnowledgeDocumentDeletionCleanupReceipt, 'outcome')).toMatchObject({ type: 'jsonb' })
        expect(column(KnowledgeDocumentPublicationAttempt, 'artifacts')).toMatchObject({ type: 'jsonb' })
    })
})
