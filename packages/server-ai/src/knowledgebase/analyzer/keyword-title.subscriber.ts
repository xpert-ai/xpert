import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common'
import { DataSource, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm'
import { t } from 'i18next'
import { DocumentTypeEnum } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeKeywordAnalyzerService } from './keyword-analyzer.service'

@Injectable()
export class KeywordTitleSubscriber implements EntitySubscriberInterface<KnowledgeDocument>, OnModuleDestroy {
    constructor(
        private readonly dataSource: DataSource,
        private readonly analyzers: KnowledgeKeywordAnalyzerService
    ) {
        dataSource.subscribers.push(this)
    }

    listenTo() {
        return KnowledgeDocument
    }

    onModuleDestroy() {
        const index = this.dataSource.subscribers.indexOf(this)
        if (index >= 0) this.dataSource.subscribers.splice(index, 1)
    }

    beforeInsert(event: InsertEvent<KnowledgeDocument>) {
        return this.analyze(event)
    }

    beforeUpdate(event: UpdateEvent<KnowledgeDocument>) {
        if (event.entity && Object.prototype.hasOwnProperty.call(event.entity, 'name')) return this.analyze(event)
        if (event.entity) delete event.entity.keywordTitleVector
    }

    private async analyze(event: InsertEvent<KnowledgeDocument> | UpdateEvent<KnowledgeDocument>) {
        const entity = event.entity
        if (!entity) return
        let knowledgebaseId: string | undefined = entity.knowledgebaseId
        let sourceType: string | undefined = entity.sourceType
        if (!knowledgebaseId && entity.id) {
            const stored = await event.manager.getRepository(KnowledgeDocument).findOne({
                where: { id: entity.id },
                select: { id: true, knowledgebaseId: true, sourceType: true }
            })
            knowledgebaseId = stored?.knowledgebaseId
            sourceType = stored?.sourceType
        }
        if (sourceType === DocumentTypeEnum.FOLDER) {
            entity.keywordTitleVector = null
            return
        }
        if (!knowledgebaseId) {
            throw new BadRequestException(
                t('server-ai:Error.KeywordAnalyzerDocumentScopeRequired', {
                    defaultValue: 'A document id or knowledgebase is required to index a document title.'
                })
            )
        }
        // Serialize with analyzer changes before reading the binding, regardless of subscriber order.
        await event.manager.query(
            'UPDATE "knowledgebase" SET "keywordAnalyzerLocked" = true WHERE "id" = $1 AND "keywordAnalyzerLocked" = false',
            [knowledgebaseId]
        )
        const knowledgebase = await event.manager.getRepository(Knowledgebase).findOne({
            where: { id: knowledgebaseId },
            select: { id: true, tenantId: true, organizationId: true, keywordAnalyzer: true }
        })
        entity.keywordTitleVector = knowledgebase?.keywordAnalyzer
            ? await this.analyzers.vector(knowledgebase, entity.name ?? '')
            : null
    }
}
