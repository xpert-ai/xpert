import {
    KnowledgeWikiIdentityDescriptor,
    KnowledgeWikiPageContributionPayload,
    KnowledgeWikiPageSourcePayload
} from '@xpert-ai/contracts'
import { canMatchIdentity } from '../identity/knowledge-identity-policy'
export { selectIdentityCandidates as selectWikiIdentityCandidates } from '../identity/knowledge-identity-policy'
export function canMatchWikiIdentity(left: KnowledgeWikiIdentityDescriptor, right: KnowledgeWikiIdentityDescriptor) {
    return left.kind !== 'summary' && right.kind !== 'summary' && canMatchIdentity(left, right)
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
