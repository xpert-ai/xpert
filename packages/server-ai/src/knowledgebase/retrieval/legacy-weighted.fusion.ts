import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
    resolveKnowledgeDocumentKey,
    resolveLegacyGraphScore,
    resolveLegacyVectorScore,
    withKnowledgeDocumentMetadata
} from './document'
import { KnowledgeCandidateFusion, KnowledgeRetrievalBatch } from './types'

export type LegacyWeightedFusionOptions = {
    graphWeight: number
}

@Injectable()
export class LegacyWeightedFusion implements KnowledgeCandidateFusion<LegacyWeightedFusionOptions> {
    fuse(
        batches: readonly KnowledgeRetrievalBatch[],
        options: LegacyWeightedFusionOptions
    ): DocumentInterface<DocumentMetadata>[] {
        const weight = Math.min(1, Math.max(0, options.graphWeight))
        const byChunkId = new Map<
            string,
            {
                doc: DocumentInterface<DocumentMetadata>
                vectorScore: number
                graphScore: number
            }
        >()

        const upsert = (doc: DocumentInterface<DocumentMetadata>, source: 'vector' | 'graph') => {
            const chunkId = resolveKnowledgeDocumentKey(doc)
            const current = byChunkId.get(chunkId)
            const vectorScore = source === 'vector' ? resolveLegacyVectorScore(doc) : (current?.vectorScore ?? 0)
            const graphScore = source === 'graph' ? resolveLegacyGraphScore(doc) : (current?.graphScore ?? 0)
            byChunkId.set(chunkId, {
                doc: withKnowledgeDocumentMetadata({
                    ...(current?.doc ?? doc),
                    ...doc,
                    metadata: {
                        ...(current?.doc.metadata ?? {}),
                        ...(doc.metadata ?? {})
                    }
                }),
                vectorScore,
                graphScore
            })
        }

        batches
            .filter(({ source }) => source === 'vector')
            .forEach(({ candidates }) => candidates.forEach(({ document }) => upsert(document, 'vector')))
        batches
            .filter(({ source }) => source === 'graph')
            .forEach(({ candidates }) => candidates.forEach(({ document }) => upsert(document, 'graph')))

        return [...byChunkId.values()]
            .map(({ doc, vectorScore, graphScore }) => {
                const relevanceScore = vectorScore * (1 - weight) + graphScore * weight
                return withKnowledgeDocumentMetadata({
                    ...doc,
                    metadata: {
                        ...(doc.metadata ?? {}),
                        vectorScore,
                        graphScore,
                        score: relevanceScore,
                        relevanceScore
                    }
                })
            })
            .sort((left, right) => (right.metadata.relevanceScore ?? 0) - (left.metadata.relevanceScore ?? 0))
    }
}
