import { KBDocumentStatusEnum, KDocumentSourceType, normalizeKnowledgebaseWikiConfig } from '@xpert-ai/contracts'
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
