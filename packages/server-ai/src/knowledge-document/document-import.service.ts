// Tagged imports commit documents and manual associations together, before parsing is dispatched.
import { IKnowledgeDocument, KnowledgeDocumentBulkCreateInput } from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import { KnowledgeTagService } from '../knowledgebase/tags/knowledge-tag.service'
import { KnowledgeDocumentService } from './document.service'

export function parseDocumentImport(input: KnowledgeDocumentBulkCreateInput) {
    const documents = Array.isArray(input) ? input : input?.documents
    const tagIds = Array.isArray(input) ? [] : input?.tagIds
    if (
        !Array.isArray(documents) ||
        documents.some((document) => !document || typeof document !== 'object' || Array.isArray(document)) ||
        !Array.isArray(tagIds) ||
        tagIds.some(
            (id) =>
                typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        ) ||
        (tagIds.length && (!documents.length || new Set(documents.map((doc) => doc.knowledgebaseId)).size !== 1))
    )
        throw new BadRequestException(t('server-ai:Error.InvalidDocumentImportTags'))
    return { documents, tagIds: [...new Set(tagIds)] }
}

@Injectable()
export class KnowledgeDocumentImportService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly documents: KnowledgeDocumentService,
        private readonly tags: KnowledgeTagService
    ) {}

    async create(documents: Partial<IKnowledgeDocument>[], tagIds: string[]) {
        // Claim a missing chunk structure before holding the knowledgebase lock. The existing
        // parser resolver uses its own connection for that one-time update.
        for (const document of documents) await this.documents.resolveNewDocumentParserConfig(document, true)
        return this.dataSource.transaction(async (manager) => {
            const knowledgebase = await this.tags.lockImportKnowledgebase(manager, documents[0].knowledgebaseId)
            const result = await this.documents.createBulkWithIncrementalSync(documents, manager)
            await this.tags.assignImported(manager, knowledgebase, result.documents, tagIds)
            return result
        })
    }
}
