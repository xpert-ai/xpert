import {
    KBDocumentStatusEnum,
    KDocumentSourceType,
    KnowledgeWikiPageContributionPayload,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'

export function hashKnowledgeWikiValue(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function isSystemManaged(document: Pick<KnowledgeDocument, 'metadata'>) {
    const metadata = document.metadata
    return !!metadata && typeof metadata === 'object' && 'systemManaged' in metadata && metadata.systemManaged === true
}

export function isEligibleKnowledgeWikiSource(document: KnowledgeDocument | null | undefined) {
    return !!(
        document &&
        document.status === KBDocumentStatusEnum.FINISH &&
        !document.disabled &&
        !document.deletedAt &&
        !document.hardDeletePendingAt &&
        document.sourceType !== KDocumentSourceType.FOLDER &&
        !isSystemManaged(document) &&
        document.contentHash
    )
}

export function mergeKnowledgeWikiMapPages(pages: KnowledgeWikiPageContributionPayload[]) {
    const merged = new Map<string, KnowledgeWikiPageContributionPayload>()
    for (const page of pages) {
        const key = `${page.pageType}:${page.canonicalName.normalize('NFKC').trim().toLowerCase()}`
        const current = merged.get(key)
        if (!current) {
            merged.set(key, page)
            continue
        }
        const facts = [...current.facts]
        for (const fact of page.facts) {
            const existing = facts.find((item) => item.text === fact.text)
            if (existing) {
                existing.sourceChunkIds = [...new Set([...existing.sourceChunkIds, ...fact.sourceChunkIds])]
            } else {
                facts.push(fact)
            }
        }
        merged.set(key, {
            ...current,
            aliases: [...new Set([...current.aliases, ...page.aliases])].slice(0, 20),
            facts: facts.slice(0, 100),
            suggestedLinks: [...current.suggestedLinks, ...page.suggestedLinks].slice(0, 50)
        })
    }
    return [...merged.values()]
}

export function createKnowledgeWikiMapBatches(
    chunks: Array<Pick<KnowledgeDocumentChunk, 'id' | 'pageContent'>>,
    config: ReturnType<typeof normalizeKnowledgebaseWikiConfig>
) {
    const maxCharacters = config.extractionGranularity === 'exhaustive' ? 24_000 : 36_000
    const batches: Array<Array<{ id: string; content: string }>> = []
    let current: Array<{ id: string; content: string }> = []
    let size = 0
    for (const chunk of chunks) {
        const item = { id: chunk.id, content: chunk.pageContent.slice(0, maxCharacters) }
        if (current.length && size + item.content.length > maxCharacters) {
            batches.push(current)
            current = []
            size = 0
        }
        current.push(item)
        size += item.content.length
    }
    if (current.length) batches.push(current)
    return batches
}
