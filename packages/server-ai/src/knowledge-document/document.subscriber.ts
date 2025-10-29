import { DocumentTypeEnum } from '@metad/contracts'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { Knowledgebase } from '../core/entities/internal'
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
		if (event.entity.sourceType !== DocumentTypeEnum.FOLDER) {
			const kbRepo = event.queryRunner.manager.getRepository(Knowledgebase)
			const kb = await kbRepo.findOneBy({ id: event.entity.knowledgebaseId })
			if (kb) {
				kb.documentNum ??= 0
				kb.documentNum += 1
				await kbRepo.save(kb)
			}
		}
	}
}
