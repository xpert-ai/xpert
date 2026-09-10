import { KnowledgeIdentityDescriptor } from '@xpert-ai/contracts'

function normalizeIdentityName(name: string) {
    return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export type IdentityCandidate = {
    id: string
    canonicalName: string
    aliases: string[]
    descriptor: KnowledgeIdentityDescriptor
    embedding: number[]
}

export function canMatchIdentity(left: KnowledgeIdentityDescriptor, right: KnowledgeIdentityDescriptor) {
    if (left.kind !== right.kind) return false
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

export function identityText(name: string, descriptor: KnowledgeIdentityDescriptor) {
    return JSON.stringify({ name, ...descriptor })
}

export function cosineIdentitySimilarity(left: number[], right: number[]) {
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

export function selectIdentityCandidates(incoming: Omit<IdentityCandidate, 'id'>, candidates: IdentityCandidate[]) {
    const names = new Set([incoming.canonicalName, ...incoming.aliases].map(normalizeIdentityName))
    const ranked = candidates
        .filter((candidate) => canMatchIdentity(incoming.descriptor, candidate.descriptor))
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
                names.has(normalizeIdentityName(name))
            ),
            similarity: cosineIdentitySimilarity(incoming.embedding, candidate.embedding)
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
