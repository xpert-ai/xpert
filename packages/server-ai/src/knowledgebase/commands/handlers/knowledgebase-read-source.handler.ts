// Invariants: source evidence comes from an integrity-checked pre-split snapshot.
// Every page is authorized and revision-pinned; indexed chunks are never a fallback.
import { BadRequestException, ConflictException, Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { KnowledgebaseReadSourceResult } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { KnowledgeDocumentService } from '../../../knowledge-document/document.service'
import {
    computeStableHash,
    resolveKnowledgeDocumentTransformerIdentity
} from '../../../knowledge-document/document-hash'
import { KnowledgeDocumentTransformSnapshotService } from '../../../knowledge-document/transform-snapshot.service'
import { ReadKnowledgebaseDocumentSourceCommand } from '../knowledgebase-documents.command'

@CommandHandler(ReadKnowledgebaseDocumentSourceCommand)
export class ReadKnowledgebaseDocumentSourceHandler implements ICommandHandler<ReadKnowledgebaseDocumentSourceCommand> {
    constructor(
        @Inject(KnowledgeDocumentService)
        private readonly documents: Pick<KnowledgeDocumentService, 'assertDocumentReadAccess' | 'findOne'>,
        private readonly snapshots: KnowledgeDocumentTransformSnapshotService
    ) {}

    async execute({ input }: ReadKnowledgebaseDocumentSourceCommand): Promise<KnowledgebaseReadSourceResult> {
        const { knowledgebaseId, documentId } = input
        await this.documents.assertDocumentReadAccess(documentId)
        const document = await this.documents.findOne(documentId)
        if (document.knowledgebaseId !== knowledgebaseId) {
            throw new BadRequestException(
                t('server-ai:Error.DocumentSourceOutsideKnowledgebase', {
                    defaultValue: 'The source document is outside the selected knowledgebase.'
                })
            )
        }
        const transformed = await this.snapshots.load(document, resolveKnowledgeDocumentTransformerIdentity(document))
        const chunks: KnowledgebaseReadSourceResult['chunks'] = transformed.flatMap((item, itemIndex) =>
            (item.chunks ?? []).map((chunk, chunkIndex) => {
                const page = chunk.metadata?.page
                return {
                    id: `source-${itemIndex}-${chunkIndex}`,
                    text: chunk.pageContent ?? '',
                    ...(typeof page === 'number' && Number.isInteger(page) && page > 0 ? { page } : {})
                }
            })
        )
        const revision = computeStableHash({
            schemaVersion: 1,
            documentId,
            sourceHash: document.sourceHash ?? null,
            chunks
        })
        if (input.revision && input.revision !== revision) {
            throw new ConflictException(
                t('server-ai:Error.DocumentSourceRevisionChanged', {
                    defaultValue: 'The parsed source changed during reading. Restart from its first page.'
                })
            )
        }
        const offset = Number.isSafeInteger(input.offset) ? Math.max(0, input.offset) : 0
        const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 50
        return {
            knowledgebaseId,
            documentId,
            revision,
            sourceHash: document.sourceHash,
            total: chunks.length,
            chunks: chunks.slice(offset, offset + limit)
        }
    }
}
