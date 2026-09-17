import type { DocumentInterface } from '@langchain/core/documents'
import type { DocumentMetadata } from '@xpert-ai/contracts'
import type {
    KnowledgeCandidateRetriever,
    KnowledgeRetrievalBatch,
    KnowledgeRetrievalRequest
} from '../retrieval/types'

export type FAQRefillStopReason = 'target_reached' | 'exhausted' | 'budget_exhausted'

export async function refillFAQCandidates(options: {
    request: KnowledgeRetrievalRequest
    retrievers: readonly KnowledgeCandidateRetriever[]
    fuse: (batches: KnowledgeRetrievalBatch[]) => DocumentInterface<DocumentMetadata>[]
    filter: (documents: DocumentInterface<DocumentMetadata>[]) => Promise<DocumentInterface<DocumentMetadata>[]>
}) {
    const { request, retrievers, fuse, filter } = options
    const budget = request.faqSession.budget
    const target = Math.max(1, request.k ?? 10)
    const batches = new Map<KnowledgeCandidateRetriever['source'], KnowledgeRetrievalBatch>()
    let documents: DocumentInterface<DocumentMetadata>[] = []
    let rounds = 0
    let reason: FAQRefillStopReason = 'budget_exhausted'
    let window = target
    while (rounds < budget.limits.rounds && budget.hasTime && budget.candidateSlots < budget.limits.candidateSlots) {
        const active = retrievers.filter(
            ({ source }) => !batches.get(source)?.exhausted && !batches.get(source)?.budgetLimited
        )
        if (!active.length) {
            reason = [...batches.values()].some((batch) => batch.budgetLimited) ? 'budget_exhausted' : 'exhausted'
            break
        }
        const next = await Promise.all(active.map((retriever) => retriever.retrieve({ ...request, k: window })))
        next.forEach((batch) => {
            const previous = batches.get(batch.source)
            if (previous && batch.budgetLimited && !batch.exhausted && !batch.candidates.length) {
                batches.set(batch.source, { ...previous, budgetLimited: true })
            } else {
                batches.set(batch.source, batch)
            }
        })
        rounds++
        // Recompute all branch contributions, including unchanged exhausted branches.
        const merged = fuse([...batches.values()])
        documents = await filter(merged)
        if (documents.length >= target) {
            reason = 'target_reached'
            break
        }
        if (budget.semanticLimited) break
        if ([...batches.values()].every((batch) => batch.exhausted)) {
            reason = 'exhausted'
            break
        }
        if (
            budget.comparisons >= budget.limits.semanticComparisons ||
            budget.questionTexts >= budget.limits.questionTexts
        )
            break
        window *= 2
    }
    return { documents, rounds, reason, batches: [...batches.values()] }
}
