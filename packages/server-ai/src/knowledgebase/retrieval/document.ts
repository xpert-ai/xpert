import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata } from '@xpert-ai/contracts'

export function resolveKnowledgeDocumentKey(doc: DocumentInterface) {
    const chunkId = doc.metadata?.chunkId
    if (typeof chunkId === 'string' && chunkId) {
        return chunkId
    }
    if ('id' in doc && typeof doc.id === 'string' && doc.id) {
        return doc.id
    }
    return doc.pageContent
}

export function withKnowledgeDocumentMetadata(
    doc: DocumentInterface,
    metadataPatch: Partial<DocumentMetadata> = {}
): DocumentInterface<DocumentMetadata> {
    const chunkId = resolveKnowledgeDocumentKey(doc)
    const metadata: DocumentMetadata = {
        ...(doc.metadata ?? {}),
        ...metadataPatch,
        chunkId
    }
    return {
        ...doc,
        metadata
    }
}

export function resolveLegacyVectorScore(doc: DocumentInterface<DocumentMetadata>) {
    if (typeof doc.metadata?.relevanceScore === 'number') {
        return doc.metadata.relevanceScore
    }
    if (typeof doc.metadata?.score === 'number') {
        return doc.metadata.score
    }
    return 0
}

export function resolveLegacyGraphScore(doc: DocumentInterface<DocumentMetadata>) {
    if (typeof doc.metadata?.graphScore === 'number') {
        return doc.metadata.graphScore
    }
    if (typeof doc.metadata?.score === 'number') {
        return doc.metadata.score
    }
    return 0
}
