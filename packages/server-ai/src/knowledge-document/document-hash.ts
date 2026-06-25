import { createHash } from 'node:crypto'
import { IKnowledgeDocument, IKnowledgeDocumentChunk } from '@xpert-ai/contracts'

const VOLATILE_CHUNK_METADATA_KEYS = new Set([
    'chunkId',
    'parentId',
    'children',
    'knowledgeId',
    'documentId',
    'parentChunkId',
    'tokens',
    'score',
    'relevanceScore',
    'isVector',
    'model',
    'provider',
    'embeddingModelFingerprint',
    'embeddingDimensions',
    'embeddingRevision',
    'vectorIdCollectionName',
    'fullPageContent',
    'collection_id'
])

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

function readStringProperty(value: unknown, key: string): string | null {
    if (!isObjectValue(value)) {
        return null
    }

    const property = Object.getOwnPropertyDescriptor(value, key)?.value
    return typeof property === 'string' && property ? property : null
}

function normalizeString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeStableValue(value: unknown, ignoredKeys = new Set<string>()): unknown {
    if (value === null) {
        return null
    }

    if (value instanceof Date) {
        return value.toISOString()
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeStableValue(item, ignoredKeys))
    }

    if (!isObjectValue(value)) {
        if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
            return null
        }
        return value
    }

    const entries = Object.entries(value)
        .filter(([key, item]) => !ignoredKeys.has(key) && item !== undefined && typeof item !== 'function')
        .sort(([left], [right]) => left.localeCompare(right))

    const normalized: { [key: string]: unknown } = {}
    for (const [key, item] of entries) {
        normalized[key] = normalizeStableValue(item, ignoredKeys)
    }
    return normalized
}

export function computeStableHash(value: unknown) {
    const stableJson = JSON.stringify(normalizeStableValue(value))
    return createHash('sha256').update(stableJson).digest('hex')
}

export function computeKnowledgeDocumentChunkHash(chunk: Pick<IKnowledgeDocumentChunk, 'pageContent' | 'metadata'>) {
    return computeStableHash({
        pageContent: chunk.pageContent ?? '',
        metadata: normalizeStableValue(chunk.metadata ?? {}, VOLATILE_CHUNK_METADATA_KEYS)
    })
}

export function computeKnowledgeDocumentContentHash(chunks: Pick<IKnowledgeDocumentChunk, 'contentHash'>[]) {
    return computeStableHash(chunks.map((chunk) => chunk.contentHash ?? null))
}

export function resolveKnowledgeDocumentSourceHash(
    document: Pick<IKnowledgeDocument, 'sourceHash' | 'metadata'> | null | undefined
) {
    if (!document) {
        return null
    }

    return document.sourceHash ?? readStringProperty(document.metadata, 'sourceHash')
}

export function resolveKnowledgeDocumentSourceKey(
    document:
        | Partial<
              Pick<
                  IKnowledgeDocument,
                  | 'sourceKey'
                  | 'metadata'
                  | 'sourceType'
                  | 'sourceConfig'
                  | 'sourceHash'
                  | 'filePath'
                  | 'fileUrl'
                  | 'storageFileId'
                  | 'options'
                  | 'name'
              >
          >
        | null
        | undefined
) {
    if (!document) {
        return null
    }

    const explicitSourceKey = normalizeString(document.sourceKey) ?? readStringProperty(document.metadata, 'sourceKey')
    if (explicitSourceKey) {
        return explicitSourceKey
    }

    const sourceType = normalizeString(document.sourceType) ?? 'unknown'
    const sourceConfigKey = normalizeString(document.sourceConfig?.key)
    const sourceLocator =
        normalizeString(document.filePath) ??
        normalizeString(document.fileUrl) ??
        normalizeString(document.storageFileId) ??
        readStringProperty(document.metadata, 'filePath') ??
        readStringProperty(document.metadata, 'fileUrl') ??
        readStringProperty(document.options, 'url')

    if (sourceConfigKey && sourceLocator) {
        return `${sourceType}:${sourceConfigKey}:${sourceLocator}`
    }

    if (sourceLocator) {
        return `${sourceType}:${sourceLocator}`
    }

    return null
}

export function computeKnowledgeDocumentProcessingHash(
    document: Partial<
        Pick<
            IKnowledgeDocument,
            | 'sourceHash'
            | 'metadata'
            | 'sourceKey'
            | 'sourceType'
            | 'sourceConfig'
            | 'parserConfig'
            | 'options'
            | 'category'
            | 'type'
            | 'filePath'
            | 'fileUrl'
            | 'storageFileId'
            | 'name'
        >
    >
) {
    return computeStableHash({
        sourceKey: resolveKnowledgeDocumentSourceKey(document),
        sourceHash: resolveKnowledgeDocumentSourceHash(document),
        sourceType: document.sourceType ?? null,
        sourceConfig: document.sourceConfig ?? null,
        parserConfig: document.parserConfig ?? null,
        options: document.options ?? null,
        category: document.category ?? null,
        type: document.type ?? null,
        filePath: document.filePath ?? null,
        fileUrl: document.fileUrl ?? null,
        storageFileId: document.storageFileId ?? null
    })
}
