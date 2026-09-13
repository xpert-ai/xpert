import type { IDocChunkMetadata, KnowledgeDocumentMetadata } from '@xpert-ai/contracts'

export function withoutGeneratedTableMetadata(metadata: KnowledgeDocumentMetadata | null | undefined) {
    if (!metadata) return metadata
    const { tableMetadata: _tableMetadata, ...input } = metadata
    return input
}

/** Keep the reserved JSON key under server ownership, including during concurrent generation. */
export async function writePublicDocumentMetadata(
    manager: { query(sql: string, parameters: unknown[]): Promise<unknown> },
    documentId: string,
    metadata: KnowledgeDocumentMetadata | null
) {
    await manager.query(
        `UPDATE "knowledge_document"
         SET "metadata" = (COALESCE($2::jsonb, '{}'::jsonb) - 'tableMetadata') ||
             CASE WHEN "metadata" ? 'tableMetadata'
                  THEN jsonb_build_object('tableMetadata', "metadata" -> 'tableMetadata')
                  ELSE '{}'::jsonb END
         WHERE "id" = $1`,
        [documentId, JSON.stringify(withoutGeneratedTableMetadata(metadata))]
    )
}

export function protectTableChunkMetadata(
    metadata: IDocChunkMetadata,
    stored?: IDocChunkMetadata,
    contentChanged = false
) {
    delete metadata.tableContext
    delete metadata.tableMetadataResultHash
    delete metadata.tableSource
    if (!stored?.tableSource) return
    metadata.tableSource = stored.tableSource
    delete metadata.searchContent
    if (contentChanged) {
        // Edited row text can no longer reuse the old generated embedding projection.
        return
    } else {
        metadata.tableMetadataResultHash = stored.tableMetadataResultHash
        if (stored.searchContent !== undefined) metadata.searchContent = stored.searchContent
    }
}
