import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common'
import { DataSource, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm'
import { t } from 'i18next'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeKeywordAnalyzerService } from './keyword-analyzer.service'

@Injectable()
export class KeywordChunkSubscriber implements EntitySubscriberInterface<KnowledgeDocumentChunk>, OnModuleDestroy {
    constructor(
        private readonly dataSource: DataSource,
        private readonly analyzers: KnowledgeKeywordAnalyzerService
    ) {
        dataSource.subscribers.push(this)
    }

    listenTo() {
        return KnowledgeDocumentChunk
    }

    onModuleDestroy() {
        const index = this.dataSource.subscribers.indexOf(this)
        if (index >= 0) this.dataSource.subscribers.splice(index, 1)
    }

    beforeInsert(event: InsertEvent<KnowledgeDocumentChunk>) {
        return this.analyze(event)
    }

    beforeUpdate(event: UpdateEvent<KnowledgeDocumentChunk>) {
        if (event.entity && Object.prototype.hasOwnProperty.call(event.entity, 'pageContent')) {
            return this.analyze(event)
        }
        // Derived search data is never accepted from an external chunk patch.
        if (event.entity) delete event.entity.keywordVector
    }

    private async analyze(event: InsertEvent<KnowledgeDocumentChunk> | UpdateEvent<KnowledgeDocumentChunk>) {
        const entity = event.entity
        if (!entity) return
        let knowledgebaseId: string | undefined = entity.knowledgebaseId
        if (!knowledgebaseId && entity.id) {
            const stored = await event.manager.getRepository(KnowledgeDocumentChunk).findOne({
                where: { id: entity.id },
                select: { id: true, knowledgebaseId: true }
            })
            knowledgebaseId = stored?.knowledgebaseId
        }
        if (!knowledgebaseId) {
            throw new BadRequestException(
                t('server-ai:Error.KeywordAnalyzerChunkScopeRequired', {
                    defaultValue: 'A knowledgebase is required to analyze a document chunk.'
                })
            )
        }
        const repository = event.manager.getRepository(Knowledgebase)
        await event.manager.query(
            'UPDATE "knowledgebase" SET "keywordAnalyzerLocked" = true WHERE "id" = $1 AND "keywordAnalyzerLocked" = false',
            [knowledgebaseId]
        )
        const knowledgebase = await repository.findOne({
            where: { id: knowledgebaseId },
            select: { id: true, tenantId: true, organizationId: true, keywordAnalyzer: true }
        })
        entity.keywordVector = knowledgebase?.keywordAnalyzer
            ? await this.analyzers.vector(knowledgebase, entity.pageContent ?? '')
            : null
    }
}
