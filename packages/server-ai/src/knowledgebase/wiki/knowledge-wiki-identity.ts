import { KnowledgeWikiMappedPageType } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'

export type KnowledgeWikiIndexKind = 'root' | 'summary' | 'entity' | 'concept'

export function normalizeKnowledgeWikiCanonicalName(value: string) {
    return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function createKnowledgeWikiMappedPageIdentity(
    pageType: KnowledgeWikiMappedPageType,
    canonicalName: string,
    sourceDocumentId: string
) {
    const normalizedCanonicalName = normalizeKnowledgeWikiCanonicalName(canonicalName)
    const pageKey = pageType === 'summary' ? `summary:${sourceDocumentId}` : `${pageType}:${normalizedCanonicalName}`
    return {
        pageKey,
        normalizedCanonicalName,
        slug: createKnowledgeWikiSlug(canonicalName, pageKey)
    }
}

export function createKnowledgeWikiIndexPageKey(kind: KnowledgeWikiIndexKind) {
    return `index:${kind}`
}

export function createKnowledgeWikiIndexPageIdentity(kind: KnowledgeWikiIndexKind) {
    const names: Record<KnowledgeWikiIndexKind, string> = {
        root: 'Wiki',
        summary: 'Summaries',
        entity: 'Entities',
        concept: 'Concepts'
    }
    const pageKey = createKnowledgeWikiIndexPageKey(kind)
    const canonicalName = names[kind]
    return {
        pageKey,
        canonicalName,
        normalizedCanonicalName: kind,
        slug: createKnowledgeWikiSlug(canonicalName, pageKey)
    }
}

function createKnowledgeWikiSlug(canonicalName: string, pageKey: string) {
    const readable = normalizeKnowledgeWikiCanonicalName(canonicalName)
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
    const suffix = createHash('sha256').update(pageKey).digest('hex').slice(0, 10)
    return `${readable || 'page'}-${suffix}`
}
