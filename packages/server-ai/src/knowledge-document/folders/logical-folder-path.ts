import { IKnowledgeDocument, KDocumentSourceType } from '@xpert-ai/contracts'

export function normalizeLogicalFolderPath(value: string) {
    return value.replace(/\\/g, '/').split('/').filter(Boolean).join('/')
}

/**
 * Builds the stable, knowledgebase-relative folder path used by Knowledge Filter V2.
 *
 * `ancestors` must be ordered from the tree root to the selected entity and may
 * include the entity itself. Only folder entities become path segments.
 */
export function buildLogicalFolderPath(
    ancestors: Array<Pick<IKnowledgeDocument, 'id' | 'name' | 'sourceType'>>,
    excludeId?: string
) {
    return normalizeLogicalFolderPath(
        ancestors
            .filter(
                (item) =>
                    item.id !== excludeId &&
                    item.sourceType === KDocumentSourceType.FOLDER &&
                    typeof item.name === 'string' &&
                    !!item.name.trim()
            )
            .map((item) => item.name.trim())
            .join('/')
    )
}
