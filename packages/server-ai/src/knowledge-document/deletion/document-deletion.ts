import { getErrorMessage } from '@xpert-ai/server-common'
import { ConflictException, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, FindOptionsWhere, IsNull } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase/management/knowledgebase.service'
import { KnowledgeDocument } from '../document.entity'
import { deleteDocumentAndRecount } from './delete-and-recount'
import { KnowledgeGraphClearDocumentCommand } from '../../graphrag/commands'
import { KnowledgeWikiRetractSourceCommand } from '../../knowledgebase/wiki/commands'
import { assertExpectedVersion } from '../document-version'
import type { KnowledgeDocumentService } from '../document.service'

export class DocumentDeletion {
    readonly #logger = new Logger(DocumentDeletion.name)

    constructor(
        private readonly documents: Pick<KnowledgeDocumentService, 'findOne'>,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly commandBus: CommandBus,
        private readonly dataSource: DataSource
    ) {}

    async deleteWithVersion(id: string, expectedVersion?: number) {
        assertExpectedVersion(expectedVersion)
        return this.remove(id, {}, expectedVersion)
    }

    async remove(id: string, scope: FindOptionsWhere<KnowledgeDocument>, expectedVersion?: number) {
        const document = await this.documents.findOne(id, {
            where: scope,
            relations: ['knowledgebase'],
            select: {
                id: true,
                version: true,
                tenantId: true,
                organizationId: true,
                knowledgebaseId: true,
                knowledgebase: { id: true, organizationId: true }
            }
        })
        if (expectedVersion !== undefined && document.version !== expectedVersion) {
            throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
        }
        await this.knowledgebaseService.assertNotRebuilding(document.knowledgebaseId)
        await this.deleteDocumentArtifacts(document)
        return deleteDocumentAndRecount(
            this.dataSource,
            document,
            {
                tenantId: document.tenantId ?? IsNull(),
                organizationId: document.organizationId ?? IsNull(),
                ...scope
            },
            expectedVersion
        )
    }

    private async deleteDocumentArtifacts(document: KnowledgeDocument) {
        await this.commandBus.execute(
            new KnowledgeWikiRetractSourceCommand({
                knowledgebaseId: document.knowledgebaseId,
                documentId: document.id,
                userId: RequestContext.currentUserId(),
                reason: 'hard_deleted'
            })
        )
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase, false)
        await vectorStore.deleteKnowledgeDocument(document)
        try {
            await this.commandBus.execute(
                new KnowledgeGraphClearDocumentCommand({
                    knowledgebaseId: document.knowledgebaseId,
                    documentId: document.id
                })
            )
        } catch (error) {
            this.#logger.warn(`Failed to clear GraphRAG data for document '${document.id}': ${getErrorMessage(error)}`)
        }
    }
}
