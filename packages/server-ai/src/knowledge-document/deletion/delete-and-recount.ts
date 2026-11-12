import { ConflictException } from '@nestjs/common'
import { KDocumentSourceType } from '@xpert-ai/contracts'
import { DataSource, FindOptionsWhere, IsNull, Raw } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'
import { KnowledgeDocument } from '../document.entity'
import { visibleDocumentSql } from '../document-list-filter'

// Serialize changes to one knowledgebase. Count after acquiring its row lock so a
// concurrent deletion cannot overwrite the counter using a pre-delete snapshot.
export function deleteDocumentAndRecount(
    dataSource: DataSource,
    document: KnowledgeDocument,
    criteria: FindOptionsWhere<KnowledgeDocument>,
    expectedVersion?: number
) {
    return dataSource.transaction('READ COMMITTED', async (manager) => {
        const knowledgebases = manager.getRepository(Knowledgebase)
        const documents = manager.getRepository(KnowledgeDocument)
        const scope = {
            id: document.knowledgebaseId,
            tenantId: document.tenantId ?? IsNull(),
            organizationId: document.knowledgebase?.organizationId ?? IsNull()
        }
        if (document.knowledgebaseId) {
            await knowledgebases.findOneOrFail({
                where: scope,
                select: { id: true },
                lock: { mode: 'pessimistic_write' }
            })
        }
        const result = await documents.delete({
            ...criteria,
            id: document.id,
            knowledgebaseId: document.knowledgebaseId ?? IsNull(),
            ...(expectedVersion === undefined ? {} : { version: expectedVersion })
        })
        if (!result.affected) {
            if (expectedVersion !== undefined) {
                throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
            }
            return result
        }
        if (document.knowledgebaseId) {
            const documentNum = await documents.countBy({
                tenantId: scope.tenantId,
                knowledgebaseId: document.knowledgebaseId,
                sourceType: Raw((alias) => `${alias} IS DISTINCT FROM :folder`, { folder: KDocumentSourceType.FOLDER }),
                metadata: Raw(visibleDocumentSql)
            })
            await knowledgebases.update(scope, { documentNum })
        }
        return result
    })
}
