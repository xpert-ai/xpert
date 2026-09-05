import type { DocumentInterface } from '@langchain/core/documents'
import type { DocumentMetadata } from '@xpert-ai/contracts'
import { buildFAQResultContent, isKnowledgeFAQChunkMetadata, normalizeFAQQuestion } from './faq-projection'

export function filterFAQNegativeMatches(
    documents: DocumentInterface<DocumentMetadata>[],
    query: string
): DocumentInterface<DocumentMetadata>[] {
    const normalizedQuery = normalizeFAQQuestion(query)
    if (!normalizedQuery) return documents
    return documents.filter((document) => {
        if (!isKnowledgeFAQChunkMetadata(document.metadata)) return true
        return !(document.metadata.negativeQuestions ?? []).some(
            (negativeQuestion) => normalizeFAQQuestion(negativeQuestion) === normalizedQuery
        )
    })
}

export function materializeFAQResult(
    document: DocumentInterface<DocumentMetadata>
): DocumentInterface<DocumentMetadata> {
    if (!isKnowledgeFAQChunkMetadata(document.metadata)) return document
    return {
        ...document,
        pageContent: buildFAQResultContent(document.metadata)
    }
}
