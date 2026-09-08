import {
    KnowledgeWikiIdentityDescriptor,
    KnowledgeWikiPageContributionPayload,
    KnowledgeWikiPageSourcePayload
} from '@xpert-ai/contracts'
import { normalizeKnowledgeWikiCanonicalName } from './knowledge-wiki-identity'

export type WikiIdentityCandidate = {
    id: string
    canonicalName: string
    aliases: string[]
    descriptor: KnowledgeWikiIdentityDescriptor
    embedding: number[]
}

export function canMatchWikiIdentity(left: KnowledgeWikiIdentityDescriptor, right: KnowledgeWikiIdentityDescriptor) {
    if (left.kind !== right.kind || left.kind === 'summary') return false
    if (left.kind === 'entity' && right.kind === 'entity') {
        if (left.entityType !== 'unknown' && right.entityType !== 'unknown' && left.entityType !== right.entityType) {
            return false
        }
        return !left.identifiers.some((a) =>
            right.identifiers.some((b) => a.namespace === b.namespace && a.value !== b.value)
        )
    }
    // Domain/scope text is evidence for the semantic judge, not a locally inferred taxonomy.
    return true
}

export function wikiIdentityText(name: string, descriptor: KnowledgeWikiIdentityDescriptor) {
    if (descriptor.kind === 'summary') return name
    return JSON.stringify({ name, ...descriptor })
}

export function cosineWikiSimilarity(left: number[], right: number[]) {
    if (!left.length || left.length !== right.length) return -1
    let dot = 0
    let a = 0
    let b = 0
    for (let i = 0; i < left.length; i++) {
        dot += left[i] * right[i]
        a += left[i] ** 2
        b += right[i] ** 2
    }
    return a && b ? dot / Math.sqrt(a * b) : -1
}

export function selectWikiIdentityCandidates(
    incoming: Omit<WikiIdentityCandidate, 'id'>,
    candidates: WikiIdentityCandidate[]
) {
    const names = new Set([incoming.canonicalName, ...incoming.aliases].map(normalizeKnowledgeWikiCanonicalName))
    const ranked = candidates
        .filter((candidate) => canMatchWikiIdentity(incoming.descriptor, candidate.descriptor))
        .map((candidate) => ({
            candidate,
            identified:
                incoming.descriptor.kind === 'entity' &&
                candidate.descriptor.kind === 'entity' &&
                incoming.descriptor.identifiers.some(
                    (left) =>
                        candidate.descriptor.kind === 'entity' &&
                        candidate.descriptor.identifiers.some(
                            (right) => left.namespace === right.namespace && left.value === right.value
                        )
                ),
            named: [candidate.canonicalName, ...candidate.aliases].some((name) =>
                names.has(normalizeKnowledgeWikiCanonicalName(name))
            ),
            similarity: cosineWikiSimilarity(incoming.embedding, candidate.embedding)
        }))
        .sort(
            (a, b) =>
                Number(b.identified) - Number(a.identified) ||
                Number(b.named) - Number(a.named) ||
                b.similarity - a.similarity ||
                a.candidate.id.localeCompare(b.candidate.id)
        )
    // Names retrieve every ambiguous match. Semantic retrieval is bounded and never authorizes a merge.
    return ranked.filter((item, index) => item.identified || item.named || index < 8).map((item) => item.candidate)
}

/** Aggregate only after identity resolution; extraction limits must not truncate persisted evidence. */
export function mergeResolvedWikiContributions(
    payloads: KnowledgeWikiPageContributionPayload[]
): KnowledgeWikiPageSourcePayload {
    const first = payloads[0]
    if (payloads.length === 1) return first
    const facts = new Map<string, KnowledgeWikiPageContributionPayload['facts'][number]>()
    const links = new Map<string, KnowledgeWikiPageContributionPayload['suggestedLinks'][number]>()
    for (const payload of payloads) {
        for (const fact of payload.facts) {
            const previous = facts.get(fact.text)
            facts.set(fact.text, {
                text: fact.text,
                sourceChunkIds: [...new Set([...(previous?.sourceChunkIds ?? []), ...fact.sourceChunkIds])]
            })
        }
        for (const link of payload.suggestedLinks) links.set(JSON.stringify(link), link)
    }
    return {
        ...first,
        aliases: [...new Set(payloads.flatMap((payload) => [payload.canonicalName, ...payload.aliases]))].filter(
            (name) => name !== first.canonicalName
        ),
        summary: [...new Set(payloads.map((payload) => payload.summary))].join('\n\n'),
        facts: [...facts.values()],
        suggestedLinks: [...links.values()]
    }
}
