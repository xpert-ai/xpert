import { getMetadataArgsStorage } from 'typeorm'
import { KnowledgeDocument } from './document.entity'

describe('KnowledgeDocument lifecycle persistence', () => {
    it('has a real soft-delete column and a monotonic publication fence', () => {
        const columns = getMetadataArgsStorage().columns.filter((column) => column.target === KnowledgeDocument)
        const deletedAt = columns.find((column) => column.propertyName === 'deletedAt')
        const hardDeletePendingAt = columns.find((column) => column.propertyName === 'hardDeletePendingAt')
        const publicationEpoch = columns.find((column) => column.propertyName === 'publicationEpoch')

        expect(deletedAt?.mode).toBe('deleteDate')
        expect(hardDeletePendingAt?.options).toMatchObject({ type: 'timestamptz', nullable: true })
        expect(publicationEpoch?.options).toMatchObject({ type: 'int', default: 0 })
    })

    it('does not request unsupported child soft-remove or recover cascades', () => {
        const relations = getMetadataArgsStorage().relations.filter((relation) => relation.target === KnowledgeDocument)
        const pages = relations.find((relation) => relation.propertyName === 'pages')
        const chunks = relations.find((relation) => relation.propertyName === 'chunks')

        expect(pages?.options.cascade).toEqual(['insert', 'update', 'remove'])
        expect(chunks?.options.cascade).toEqual(['insert', 'update', 'remove'])
    })
})
