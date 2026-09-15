import { Document } from '@langchain/core/documents'
import {
    IDocChunkMetadata,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    KnowledgeChunkQuestions
} from '@xpert-ai/contracts'
import { guardEmbeddingInputDocuments } from '../embedding-input-guard'
import { TDocChunkMetadata } from '../types'
import { questionSourceHash, questionVectorId } from './question-generation'

export function buildQuestionVectors(
    document: IKnowledgeDocument,
    chunk: IKnowledgeDocumentChunk<IDocChunkMetadata>,
    state: KnowledgeChunkQuestions,
    contextSize?: number
) {
    const ids: string[] = []
    const questions = state.questions.map((question) => ({ ...question, vectorIds: [] as string[] }))
    const chunks = questions.flatMap((question) => {
        const source = new Document<TDocChunkMetadata>({
            pageContent: chunk.pageContent,
            metadata: {
                ...chunk.metadata,
                questionGeneration: undefined,
                questionGenerationId: state.generationId,
                questionSourceChunkId: chunk.id,
                generatedQuestionId: question.id,
                searchContent: question.question
            }
        })
        return guardEmbeddingInputDocuments([source], contextSize).map((part, index) => {
            const id = questionVectorId(chunk.id, state.generationId, `${question.id}:${index}`)
            ids.push(id)
            question.vectorIds.push(id)
            return {
                ...part,
                id,
                documentId: document.id,
                knowledgebaseId: document.knowledgebaseId,
                metadata: { ...part.metadata, chunkId: chunk.metadata.chunkId, parentId: chunk.metadata.parentId }
            }
        })
    })
    return { ids, chunks, questions }
}

/** A late/stale vector write can never become source evidence. */
export function isCurrentQuestionVector(
    vector: Pick<IDocChunkMetadata, 'questionGenerationId' | 'generatedQuestionId'>,
    chunk: IKnowledgeDocumentChunk<IDocChunkMetadata>
) {
    if (!vector.questionGenerationId) return true
    const state = chunk.metadata?.questionGeneration
    return (
        state?.status === 'ready' &&
        state.generationId === vector.questionGenerationId &&
        state.sourceHash === questionSourceHash(chunk) &&
        state.questions.some((item) => item.id === vector.generatedQuestionId)
    )
}

export function questionVectorIds(chunks: IKnowledgeDocumentChunk<IDocChunkMetadata>[]) {
    return chunks.flatMap((chunk) => chunk.metadata?.questionGeneration?.vectorIds ?? [])
}
