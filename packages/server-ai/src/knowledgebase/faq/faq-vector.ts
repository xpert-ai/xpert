import { Document } from '@langchain/core/documents'
import {
    IKnowledgebase,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    IKnowledgeFAQChunkMetadata,
    KnowledgebaseFAQConfig,
    KnowledgeFAQWriteInput
} from '@xpert-ai/contracts'
import { guardEmbeddingInputDocuments } from '../../knowledge-document/embedding-input-guard'
import type { TDocChunkMetadata } from '../../knowledge-document/types'
import { buildFAQResultContent, buildFAQVectorProjections, createFAQLogicalVectorId } from './faq-projection'

export type FAQVectorWrite = {
    chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    ids: string[]
}

export function resolveFAQEmbeddingContextSize(knowledgebase: IKnowledgebase, target: 'active' | 'pending' = 'active') {
    const model = target === 'pending' ? knowledgebase.pendingCopilotModel : knowledgebase.copilotModel
    return model?.options?.context_size ?? model?.referencedModel?.options?.context_size
}

export function buildFAQVectorWrite(input: {
    knowledgebase: IKnowledgebase
    document: IKnowledgeDocument
    faqId: string
    faq: KnowledgeFAQWriteInput
    config: KnowledgebaseFAQConfig
    embeddingContextSize?: number
}): FAQVectorWrite {
    const { knowledgebase, document, faqId, faq, config, embeddingContextSize } = input
    const resultContent = buildFAQResultContent(faq)
    const parts = buildFAQVectorProjections(faqId, faq, config).flatMap((projection) => {
        const source = new Document<TDocChunkMetadata>({
            pageContent: resultContent,
            metadata: {
                chunkId: projection.logicalId,
                contentKind: 'faq',
                standardQuestion: faq.standardQuestion,
                similarQuestions: faq.similarQuestions ?? [],
                negativeQuestions: faq.negativeQuestions ?? [],
                answerBlocks: faq.answerBlocks,
                enabled: faq.enabled ?? true,
                faqVectorIds: [],
                vectorSyncStatus: 'ready',
                contentFormat: 'text',
                mediaType: 'text',
                sourceChunkId: faqId,
                faqVectorId: projection.logicalId,
                faqVectorKey: projection.key,
                searchContent: projection.content
            } satisfies IKnowledgeFAQChunkMetadata
        })
        // FAQ business and logical ids stay stable. Context-aware physical part ids remain
        // deterministic while the shared budget splits oversized provider inputs.
        const embeddingParts = guardEmbeddingInputDocuments([source], embeddingContextSize)
        return embeddingParts.map((part, index) => ({
            part,
            vectorId:
                embeddingParts.length === 1
                    ? projection.logicalId
                    : createFAQLogicalVectorId(projection.logicalId, `embedding-part:${index}`),
            key: projection.key
        }))
    })
    const ids = parts.map(({ vectorId }) => vectorId)
    return {
        ids,
        chunks: parts.map(({ part, vectorId, key }) => ({
            ...part,
            documentId: document.id,
            document,
            knowledgebaseId: knowledgebase.id,
            metadata: {
                ...part.metadata,
                chunkId: faqId,
                sourceChunkId: faqId,
                faqVectorId: vectorId,
                faqVectorKey: key,
                faqVectorIds: ids
            }
        }))
    }
}

export function buildFAQVectorWriteFromMetadata(input: {
    knowledgebase: IKnowledgebase
    document: IKnowledgeDocument
    faqId: string
    metadata: IKnowledgeFAQChunkMetadata
    config: KnowledgebaseFAQConfig
    embeddingContextSize?: number
}) {
    return buildFAQVectorWrite({
        knowledgebase: input.knowledgebase,
        document: input.document,
        faqId: input.faqId,
        faq: {
            standardQuestion: input.metadata.standardQuestion,
            similarQuestions: input.metadata.similarQuestions,
            negativeQuestions: input.metadata.negativeQuestions ?? [],
            answerBlocks: input.metadata.answerBlocks,
            enabled: input.metadata.enabled
        },
        config: input.config,
        embeddingContextSize: input.embeddingContextSize
    })
}
