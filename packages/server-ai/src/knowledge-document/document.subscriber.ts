import { DocumentTypeEnum, isKnowledgeDocumentVisible } from '@xpert-ai/contracts'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { Knowledgebase } from '../knowledgebase/persistence/knowledgebase.entity'
import { KnowledgeDocument } from './document.entity'

@EventSubscriber()
export class KnowledgeDocumentSubscriber implements EntitySubscriberInterface<KnowledgeDocument> {
    /**
     * Specify the entity type to monitor
     */
    listenTo() {
        return KnowledgeDocument
    }

    /**
     * Increment the document count when creating a file
     *
     * @param event
     */
    async beforeInsert(event: InsertEvent<KnowledgeDocument>) {
        const { knowledgebaseId, sourceType, metadata } = event.entity
        if (!knowledgebaseId || sourceType === DocumentTypeEnum.FOLDER) return

        // This write-once setting is deliberately excluded from ordinary ORM updates.
        await event.manager.query(
            'UPDATE "knowledgebase" SET "keywordAnalyzerLocked" = true WHERE "id" = $1 AND "keywordAnalyzerLocked" = false',
            [knowledgebaseId]
        )
        if (isKnowledgeDocumentVisible(metadata)) {
            await event.manager
                .getRepository(Knowledgebase)
                .update({ id: knowledgebaseId }, { documentNum: () => 'COALESCE("documentNum", 0) + 1' })
        }
    }
}
