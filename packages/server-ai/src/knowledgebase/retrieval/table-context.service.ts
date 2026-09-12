import { DocumentInterface } from '@langchain/core/documents'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    DocumentMetadata,
    IKnowledgebase,
    IKnowledgeDocument,
    isKnowledgeTableMetadata,
    isNativeKnowledgeTableDocument,
    KBDocumentStatusEnum,
    KnowledgeTableContext
} from '@xpert-ai/contracts'
import { FindManyOptions, In, IsNull, Raw } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { tableMetadataInputHash } from '../../knowledge-document/tables/table-metadata-input-hash'

type TableDocument = Pick<
    IKnowledgeDocument,
    'id' | 'type' | 'category' | 'parserConfig' | 'sourceConfig' | 'sourceHash' | 'filePath' | 'knowledgebase'
> & {
    metadata?: unknown
}
type TableMetadataReader = { find(options: FindManyOptions<KnowledgeDocument>): Promise<TableDocument[]> }

/** Read generated context from scoped canonical rows, never from vector-store copies. */
@Injectable()
export class KnowledgeTableContextService {
    constructor(@InjectRepository(KnowledgeDocument) private readonly documents: TableMetadataReader) {}

    async hydrate(kb: IKnowledgebase, candidates: DocumentInterface<DocumentMetadata>[]) {
        const clean = candidates.map((candidate) => {
            const { tableContext: _tableContext, ...metadata } = candidate.metadata
            return { ...candidate, metadata }
        })
        const ids = [
            ...new Set(
                clean.flatMap(({ metadata }) =>
                    metadata.tableSource && metadata.tableMetadataResultHash && typeof metadata.documentId === 'string'
                        ? [metadata.documentId]
                        : []
                )
            )
        ]
        if (!ids.length || !kb.tenantId || !kb.organizationId) return clean
        const documents = await this.documents.find({
            where: {
                id: In(ids),
                knowledgebaseId: kb.id,
                tenantId: kb.tenantId,
                organizationId: kb.organizationId,
                disabled: Raw((alias) => `COALESCE(${alias}, false) = false`),
                hardDeletePendingAt: IsNull(),
                status: KBDocumentStatusEnum.FINISH
            },
            relations: ['knowledgebase', 'knowledgebase.chatModel', 'knowledgebase.chatModel.referencedModel'],
            select: {
                id: true,
                type: true,
                category: true,
                parserConfig: true,
                sourceConfig: true,
                sourceHash: true,
                filePath: true,
                metadata: true,
                knowledgebase: {
                    id: true,
                    parserConfig: true,
                    chatModel: {
                        id: true,
                        model: true,
                        copilotId: true,
                        referencedId: true,
                        options: true,
                        referencedModel: { id: true, model: true, copilotId: true, options: true }
                    }
                }
            }
        })
        const byId = new Map(documents.map((document) => [document.id, document]))
        return clean.map((candidate) => {
            const document = byId.get(candidate.metadata.documentId)
            if (!document || !isNativeKnowledgeTableDocument(document)) return candidate
            const metadata = document.metadata
            const state =
                metadata && typeof metadata === 'object' && 'tableMetadata' in metadata
                    ? metadata.tableMetadata
                    : undefined
            if (
                !isKnowledgeTableMetadata(state) ||
                state.status !== 'ready' ||
                !state.resultHash ||
                state.appliedResultHash !== state.resultHash ||
                candidate.metadata.tableMetadataResultHash !== state.resultHash
            ) {
                return candidate
            }
            const currentMetadata =
                metadata &&
                typeof metadata === 'object' &&
                'sourceHash' in metadata &&
                typeof metadata.sourceHash === 'string'
                    ? { sourceHash: metadata.sourceHash }
                    : undefined
            if (
                !document.knowledgebase ||
                state.inputHash !==
                    tableMetadataInputHash({ ...document, metadata: currentMetadata }, document.knowledgebase)
            )
                return candidate
            const table = state.tables.find((table) => table.tableId === candidate.metadata.tableSource?.tableId)
            if (!table) return candidate
            const indexed = document.parserConfig?.indexedFields
            const context: KnowledgeTableContext = {
                tableId: table.tableId,
                resultHash: state.resultHash,
                sheetName: table.sheetName,
                summary: table.summary.slice(0, 1500),
                columns: table.columns
                    .filter((column) => !indexed?.length || indexed.includes(column.key))
                    .filter((column) => column.description || column.unit || column.valueMeanings)
                    .map(({ columnId, key, description, unit, valueMeanings }) => ({
                        columnId,
                        key,
                        description: description.slice(0, 500),
                        ...(unit ? { unit: unit.slice(0, 100) } : {}),
                        ...(valueMeanings ? { valueMeanings: valueMeanings.slice(0, 500) } : {})
                    }))
            }
            // Keep the final tool/rerank context bounded even for very wide tables.
            let length = context.summary.length + context.sheetName.length
            context.columns = context.columns.filter((column) => {
                length +=
                    column.key.length +
                    column.description.length +
                    (column.unit?.length ?? 0) +
                    (column.valueMeanings?.length ?? 0)
                return length <= 4000
            })
            return { ...candidate, metadata: { ...candidate.metadata, tableContext: context } }
        })
    }
}

/** Only the ranking request receives this projection; returned evidence remains the original row. */
export function tableContextText(document: DocumentInterface<DocumentMetadata>) {
    const context = document.metadata.tableContext
    if (!context) return document.pageContent
    const descriptions = context.columns.map((column) =>
        [column.key, column.description, column.unit, column.valueMeanings].filter(Boolean).join(': ')
    )
    return [document.pageContent, context.sheetName, context.summary, ...descriptions].filter(Boolean).join('\n')
}
