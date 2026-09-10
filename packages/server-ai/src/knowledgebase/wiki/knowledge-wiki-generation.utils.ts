import { DocumentInterface } from '@langchain/core/documents'
import {
    buildChunkTree,
    IDocChunkMetadata,
    KBDocumentStatusEnum,
    KDocumentSourceType,
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

export function createKnowledgeWikiMapBatches(
    chunks: Array<Pick<KnowledgeDocumentChunk, 'id' | 'pageContent'> & { metadata?: IDocChunkMetadata }>,
    config: ReturnType<typeof normalizeKnowledgebaseWikiConfig>
) {
    const maxCharacters = config.extractionGranularity === 'exhaustive' ? 24_000 : 36_000
    const batches: Array<Array<{ id: string; content: string }>> = []
    let current: Array<{ id: string; content: string }> = []
    let size = 0
    for (const chunk of orderKnowledgeWikiSourceChunks(chunks)) {
        for (let offset = 0; offset < chunk.pageContent.length; offset += maxCharacters) {
            const item = { id: chunk.id, content: chunk.pageContent.slice(offset, offset + maxCharacters) }
            if (current.length && size + item.content.length > maxCharacters) {
                batches.push(current)
                current = []
                size = 0
            }
            current.push(item)
            size += item.content.length
        }
    }
    if (current.length) batches.push(current)
    return batches
}

export function orderKnowledgeWikiSourceChunks<
    T extends Pick<KnowledgeDocumentChunk, 'id' | 'pageContent'> & { metadata?: IDocChunkMetadata }
>(chunks: T[]): T[] {
    const byLogicalId = new Map(chunks.map((chunk) => [chunk.metadata?.chunkId || chunk.id, chunk]))
    const tree = buildChunkTree(
        chunks.map((chunk) => ({
            ...chunk,
            metadata: { ...chunk.metadata, chunkId: chunk.metadata?.chunkId || chunk.id }
        }))
    )
    const ordered: T[] = []
    const seen = new Set<T>()
    const visit = (nodes: DocumentInterface<IDocChunkMetadata>[]) => {
        for (const node of nodes) {
            const chunk = byLogicalId.get(node.metadata.chunkId)
            if (chunk && !seen.has(chunk)) {
                ordered.push(chunk)
                seen.add(chunk)
            }
            visit(node.metadata.children ?? [])
        }
    }
    visit(tree)
    // Legacy or malformed hierarchy metadata must not cause source content to disappear.
    return ordered.concat(chunks.filter((chunk) => !seen.has(chunk)))
}
