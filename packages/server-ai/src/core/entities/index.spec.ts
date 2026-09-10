import { coreEntities } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { XpertProjectInvitation, XpertProjectMembership } from './internal'
import { ALL_AI_ENTITIES } from '.'
import * as WikiEntities from '../../knowledgebase/wiki/entities'
import * as DocumentLifecycleEntities from '../../knowledge-document/deletion'
import * as GraphEntities from '../../graphrag/entities'
import { MCP_PUBLICATION_ENTITIES, McpApiKey } from '../../mcp-publication/entities'
import { ModelUsageDeliveryReceipt } from '../../copilot-usage/model-usage/model-usage-delivery-receipt.entity'

class MetadataDataSource extends DataSource {
    buildMetadata() {
        return this.buildMetadatas()
    }
}

describe('ALL_AI_ENTITIES', () => {
    it.each([
        ['GraphRAG', Object.values(GraphEntities)],
        ['document lifecycle', Object.values(DocumentLifecycleEntities)],
        ['MCP publication', MCP_PUBLICATION_ENTITIES],
        ['model usage delivery', [ModelUsageDeliveryReceipt]]
    ])('registers %s entities for standalone schema-sync', (_name, entities) => {
        expect(ALL_AI_ENTITIES).toEqual(expect.arrayContaining(entities))
    })

    it('builds the missing deployment tables and MCP secret column without duplicate entities', async () => {
        const dataSource = new MetadataDataSource({
            type: 'postgres',
            database: 'xpert',
            entities: [...coreEntities, ...ALL_AI_ENTITIES]
        })

        await dataSource.buildMetadata()
        expect(new Set(ALL_AI_ENTITIES).size).toBe(ALL_AI_ENTITIES.length)
        expect(dataSource.entityMetadatas.map((metadata) => metadata.tableName)).toEqual(
            expect.arrayContaining([
                'knowledge_graph_entity_contribution',
                'knowledge_graph_relation_contribution',
                'knowledge_document_deletion_intent',
                'knowledge_document_deletion_cleanup_receipt',
                'knowledge_document_publication_attempt',
                'knowledge_document_publication_attempt_source',
                'model_usage_delivery_receipt',
                'mcp_publication_access'
            ])
        )
        expect(dataSource.getMetadata(McpApiKey).findColumnWithPropertyName('encryptedSecret')).toMatchObject({
            type: 'text',
            isNullable: true,
            isSelect: false
        })
    })

    it('registers all Wiki entities for the standalone schema-sync command', () => {
        expect(ALL_AI_ENTITIES).toEqual(expect.arrayContaining(Object.values(WikiEntities)))
    })
    it('contains the Project collaboration entities and builds their relation metadata', async () => {
        const dataSource = new MetadataDataSource({
            type: 'postgres',
            database: 'xpert',
            entities: [...coreEntities, ...ALL_AI_ENTITIES]
        })

        await expect(dataSource.buildMetadata()).resolves.toBeUndefined()
        expect(ALL_AI_ENTITIES).toEqual(expect.arrayContaining([XpertProjectMembership, XpertProjectInvitation]))
    })
})
