import { shareMessageQuery } from '../../ai/conversation-sharing/share-projection'
import { coreEntities } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { XpertProjectInvitation, XpertProjectMembership } from './internal'
import { ALL_AI_ENTITIES } from '.'
import * as WikiEntities from '../../knowledgebase/wiki/entities'
import * as DocumentLifecycleEntities from '../../knowledge-document/deletion'
import * as GraphEntities from '../../graphrag/entities'
import { MCP_PUBLICATION_ENTITIES, McpApiKey } from '../../mcp-publication/entities'
import { ModelUsageDeliveryReceipt } from '../../copilot-usage/model-usage/model-usage-delivery-receipt.entity'
import { AgentPluginPackage, AgentResourceBinding } from '../../agent-plugin/agent-plugin.entity'
import { GROUP_ENTITIES } from '../../chat-group/group.entities'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { SandboxJobEntity } from '../../sandbox/sandbox-job/sandbox-job.entity'
import { SandboxManagedServiceEntity } from '../../sandbox/sandbox-managed-service.entity'
import { AGENT_EVOLUTION_ENTITIES } from '../../agent-evolution/entities'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

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
        ['model usage delivery', [ModelUsageDeliveryReceipt]],
        ['agent plugins', [AgentPluginPackage, AgentResourceBinding]],
        ['group chat', GROUP_ENTITIES],
        ['sandbox runtime', [SandboxJobEntity, SandboxManagedServiceEntity]],
        ['agent evolution', AGENT_EVOLUTION_ENTITIES]
    ])('registers %s entities for standalone schema-sync', (_name, entities) => {
        for (const entity of entities) expect(ALL_AI_ENTITIES).toContain(entity)
    })

    it('includes entities explicitly registered by runtime TypeORM feature modules', () => {
        const registered = new Set([...coreEntities, ...ALL_AI_ENTITIES].map((entity) => entity.name))
        const missing: string[] = []
        const visitDirectory = (directory: string) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const file = join(directory, entry.name)
                if (entry.isDirectory()) {
                    visitDirectory(file)
                } else if (entry.name.endsWith('.module.ts')) {
                    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
                    const visit = (node: ts.Node) => {
                        if (
                            ts.isCallExpression(node) &&
                            ts.isPropertyAccessExpression(node.expression) &&
                            node.expression.expression.getText(source) === 'TypeOrmModule' &&
                            node.expression.name.text === 'forFeature' &&
                            node.arguments[0] &&
                            ts.isArrayLiteralExpression(node.arguments[0])
                        ) {
                            for (const entity of node.arguments[0].elements) {
                                if (ts.isIdentifier(entity) && !registered.has(entity.text)) {
                                    missing.push(`${file}: ${entity.text}`)
                                }
                            }
                        }
                        ts.forEachChild(node, visit)
                    }
                    visit(source)
                }
            }
        }
        visitDirectory(resolve(__dirname, '../..'))
        expect(missing).toEqual([])
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
                'mcp_publication_access',
                'agent_plugin_package',
                'agent_resource_binding',
                'chat_group_participant',
                'chat_message_recipient',
                'chat_group_interaction',
                'sandbox_job',
                'sandbox_managed_service'
            ])
        )
        expect(dataSource.getMetadata(McpApiKey).findColumnWithPropertyName('encryptedSecret')).toMatchObject({
            type: 'text',
            isNullable: true,
            isSelect: false
        })
        // New group columns use the contract property names and preserve ordinary-chat defaults.
        const conversation = dataSource.getMetadata(ChatConversation)
        expect(conversation.findColumnWithPropertyName('purpose')).toMatchObject({
            type: 'varchar',
            default: 'private'
        })
        expect(conversation.findColumnWithPropertyName('revision')).toMatchObject({
            databaseName: 'revision',
            type: 'int',
            default: 0
        })
        expect(conversation.findColumnWithPropertyName('lastMessageSequence')).toMatchObject({
            databaseName: 'lastMessageSequence',
            type: 'int',
            default: 0
        })
        const message = dataSource.getMetadata(ChatMessage)
        expect(message.findColumnWithPropertyName('sequence')).toMatchObject({
            databaseName: 'sequence',
            type: 'int',
            isNullable: true
        })
        expect(message.findColumnWithPropertyName('groupPublicationId')).toMatchObject({ isNullable: true })
        expect(
            message.indices
                .filter((index) => index.isUnique)
                .map((index) => index.columns.map((column) => column.propertyName))
        ).toEqual(
            expect.arrayContaining([
                ['conversationId', 'sequence'],
                ['conversationId', 'groupPublicationId']
            ])
        )
    })

    it('keeps the snapshot branch head and conversation scope separate in real TypeORM SQL', async () => {
        const dataSource = new MetadataDataSource({
            type: 'postgres',
            database: 'xpert',
            entities: [...coreEntities, ...ALL_AI_ENTITIES]
        })
        await dataSource.buildMetadata()
        const [sql, parameters] = shareMessageQuery(
            dataSource.getTreeRepository(ChatMessage),
            'conversation-id',
            'head-message-id'
        ).getQueryAndParameters()
        expect(parameters).toContain('head-message-id')
        expect(parameters).toContain('conversation-id')
        expect(sql).not.toContain('"reasoning"')
        expect(sql).not.toContain('"events"')
        expect(sql).not.toContain('"inputCheckpoint"')
        expect(sql).toContain('"deletedAt" IS NULL')
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
