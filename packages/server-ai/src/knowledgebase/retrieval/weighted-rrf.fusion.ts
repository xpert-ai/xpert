import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { resolveKnowledgeDocumentKey, withKnowledgeDocumentMetadata } from './document'
import { KnowledgeCandidateFusion, KnowledgeRetrievalBatch, KnowledgeRetrieverSource } from './types'

export type WeightedRrfFusionOptions = {
    rankConstant: number
    weights: Readonly<Partial<Record<KnowledgeRetrieverSource, number>>>
}

@Injectable()
export class WeightedRrfFusion implements KnowledgeCandidateFusion<WeightedRrfFusionOptions> {
    fuse(
        batches: readonly KnowledgeRetrievalBatch[],
        options: WeightedRrfFusionOptions
    ): DocumentInterface<DocumentMetadata>[] {
        const failedBatch = batches.find(({ failed }) => failed)
        if (failedBatch) {
            const defaultValue = `Cannot fuse failed RRF batch for source: ${failedBatch.source}`
            const message =
                t('server-ai:Error.RrfBatchFailed', {
                    source: failedBatch.source,
                    defaultValue
                }) || defaultValue
            throw new Error(failedBatch.error ? `${message}: ${failedBatch.error}` : message)
        }

        if (!Number.isFinite(options.rankConstant) || options.rankConstant < 0) {
            const defaultValue = 'RRF rankConstant must be a finite non-negative number'
            throw new RangeError(
                t('server-ai:Error.RrfRankConstantInvalid', {
                    defaultValue
                }) || defaultValue
            )
        }

        const byDocument = new Map<
            string,
            {
                doc: DocumentInterface<DocumentMetadata>
                rrfScore: number
                firstSeen: number
            }
        >()
        let firstSeen = 0
        const batchSources = new Set<KnowledgeRetrieverSource>()

        for (const batch of batches) {
            if (batchSources.has(batch.source)) {
                const defaultValue = `Duplicate RRF batch source: ${batch.source}`
                throw new Error(
                    t('server-ai:Error.RrfBatchSourceDuplicate', {
                        source: batch.source,
                        defaultValue
                    }) || defaultValue
                )
            }
            batchSources.add(batch.source)

            const weight = options.weights[batch.source]
            if (weight === undefined) {
                const defaultValue = `Missing RRF weight for source: ${batch.source}`
                throw new RangeError(
                    t('server-ai:Error.RrfWeightMissing', {
                        source: batch.source,
                        defaultValue
                    }) || defaultValue
                )
            }
            if (!Number.isFinite(weight) || weight < 0) {
                const defaultValue = `RRF weight for source "${batch.source}" must be a finite non-negative number`
                throw new RangeError(
                    t('server-ai:Error.RrfWeightInvalid', {
                        source: batch.source,
                        defaultValue
                    }) || defaultValue
                )
            }
            if (weight === 0) {
                continue
            }
            const contributedRanks = new Map<string, number>()
            batch.candidates.forEach(({ document: doc, rank }) => {
                if (!Number.isInteger(rank) || rank < 1) {
                    const defaultValue = `RRF candidate rank for source "${batch.source}" must be a positive integer`
                    throw new RangeError(
                        t('server-ai:Error.RrfCandidateRankInvalid', {
                            source: batch.source,
                            rank,
                            defaultValue
                        }) || defaultValue
                    )
                }
                const key = resolveKnowledgeDocumentKey(doc)
                const current = byDocument.get(key)
                const contributedRank = contributedRanks.get(key)
                const contribution =
                    contributedRank === undefined
                        ? weight / (options.rankConstant + rank)
                        : rank < contributedRank
                          ? weight / (options.rankConstant + rank) - weight / (options.rankConstant + contributedRank)
                          : 0
                if (contributedRank === undefined || rank < contributedRank) {
                    contributedRanks.set(key, rank)
                }
                byDocument.set(key, {
                    doc: withKnowledgeDocumentMetadata({
                        ...(current?.doc ?? doc),
                        ...doc,
                        metadata: {
                            ...(current?.doc.metadata ?? {}),
                            ...doc.metadata
                        }
                    }),
                    rrfScore: (current?.rrfScore ?? 0) + contribution,
                    firstSeen: current?.firstSeen ?? firstSeen++
                })
            })
        }

        return [...byDocument.values()]
            .map(({ doc, rrfScore, firstSeen }) => ({
                doc: withKnowledgeDocumentMetadata(doc, {
                    rrfScore,
                    score: rrfScore,
                    relevanceScore: rrfScore
                }),
                rrfScore,
                firstSeen
            }))
            .sort((left, right) => right.rrfScore - left.rrfScore || left.firstSeen - right.firstSeen)
            .map(({ doc }) => doc)
    }
}
