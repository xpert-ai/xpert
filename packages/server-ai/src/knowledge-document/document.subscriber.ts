import { DocumentTypeEnum } from '@metad/contracts'
import { StorageFile } from '@metad/server-core'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, LoadEvent } from 'typeorm'
import { Knowledgebase } from '../core/entities/internal'
import { KnowledgeDocument } from './document.entity'
import { FileStorage } from '@metad/server-core'

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
                        const kb = await kbRepo.findOne({ where: { id: event.entity.knowledgebaseId } })
                        if (kb) {
                                kb.documentNum ??= 0
                                kb.documentNum += 1
                                await kbRepo.save(kb)
                        }
                }
        }

        /**
         * Populate fileUrl from StorageFile when loading document
         * 
         * @param entity 
         * @param event 
         */
        async afterLoad(entity: KnowledgeDocument, event?: LoadEvent<KnowledgeDocument>): Promise<void> {
                if (entity instanceof KnowledgeDocument && entity.storageFileId && !entity.fileUrl) {
                        const storageFile = await event.manager.findOne(StorageFile, {
                                where: { id: entity.storageFileId },
                                select: ['id', 'file', 'storageProvider']
                        })
                        if (storageFile?.file && storageFile.storageProvider) {
                                const store = new FileStorage().setProvider(storageFile.storageProvider)
                                entity.fileUrl = store.getProviderInstance().url(storageFile.file)
                        }
                }
        }
}
