import { Document } from '@langchain/core/documents'
import {
    IKnowledgeDocument,
    KnowledgeDocumentMetadata,
    KnowledgeDocumentReprocessCapabilities,
    KnowledgeDocumentTransformerIdentity,
    KnowledgeDocumentTransformSnapshotRef
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { createHash, randomUUID } from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { t } from 'i18next'
import { KnowledgeWorkAreaResolver } from '../shared/volume/work-area'
import { computeKnowledgeDocumentTransformFingerprint } from './document-hash'

const SNAPSHOT_SCHEMA_VERSION = 1 as const
const SNAPSHOT_FILE_NAME = 'documents.ndjson'
const SNAPSHOT_MANIFEST_FILE_NAME = 'manifest.json'

/** Restores the document-level envelope around chunk records stored in the NDJSON data file. */
type SnapshotItem = {
    itemIndex: number
    id?: string
    name?: string
    type?: string
    mimeType?: string
    metadata?: ChunkMetadata
    chunkCount: number
}

/** Integrity and reconstruction metadata for an immutable pre-split conversion snapshot. */
type SnapshotManifest = {
    schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION
    documentId: string
    transformFingerprint: string
    sourceHash?: string | null
    transformer: KnowledgeDocumentTransformerIdentity
    dataFile: typeof SNAPSHOT_FILE_NAME
    sha256: string
    size: number
    itemCount: number
    chunkCount: number
    items: SnapshotItem[]
    createdAt: string
}

/** One streaming NDJSON record; `itemIndex` avoids repeating document metadata for every chunk. */
type SnapshotChunkRecord = {
    itemIndex: number
    pageContent: string
    metadata: ChunkMetadata
}

type TransformSnapshotWorkAreaResolver = {
    resolve(input: { tenantId: string; userId: string; knowledgebaseId: string; documentId: string }): Promise<{
        volume: { path(filePath: string): string }
        statePath: { relativePath: string }
    }>
}

/** Expected rechunk failure that distinguishes absent, stale, and damaged snapshots. */
export class TransformSnapshotUnavailableError extends Error {
    readonly code: 'missing' | 'stale' | 'corrupt'

    constructor(code: 'missing' | 'stale' | 'corrupt') {
        super(snapshotErrorMessage(code))
        this.name = TransformSnapshotUnavailableError.name
        this.code = code
    }
}

/**
 * Persists and restores the converter output at the boundary immediately before text splitting.
 *
 * A snapshot consists of an NDJSON data file plus an integrity manifest in the knowledge document's
 * tenant-scoped work area. Its source hash and converter fingerprint ensure that rechunk processing
 * can reuse only output produced from the same source and converter configuration. Missing, stale,
 * or corrupt snapshots are reported explicitly; this service never falls back to invoking a converter.
 */
@Injectable()
export class KnowledgeDocumentTransformSnapshotService {
    constructor(
        @Inject(KnowledgeWorkAreaResolver)
        private readonly knowledgeWorkAreaResolver: TransformSnapshotWorkAreaResolver
    ) {}

    /**
     * Streams converter output to NDJSON so large documents do not require one additional giant
     * JSON allocation. Temporary files are renamed only after data and manifest are complete.
     */
    async save(
        document: Partial<
            Pick<
                IKnowledgeDocument,
                | 'id'
                | 'knowledgebaseId'
                | 'sourceHash'
                | 'metadata'
                | 'sourceKey'
                | 'sourceType'
                | 'sourceConfig'
                | 'type'
                | 'category'
                | 'filePath'
                | 'fileUrl'
                | 'storageFileId'
                | 'name'
            >
        >,
        transformed: Partial<IKnowledgeDocument<ChunkMetadata>>[],
        transformer: KnowledgeDocumentTransformerIdentity
    ): Promise<KnowledgeDocumentTransformSnapshotRef> {
        this.assertDocumentScope(document)
        const transformFingerprint = computeKnowledgeDocumentTransformFingerprint(document, transformer)
        const workArea = await this.resolveWorkArea(document.knowledgebaseId, document.id)
        const folderPath = snapshotFolderPath(workArea.statePath.relativePath, document.id, transformFingerprint)
        const folderServerPath = workArea.volume.path(folderPath)
        const filePath = path.posix.join(folderPath, SNAPSHOT_FILE_NAME)
        const manifestPath = path.posix.join(folderPath, SNAPSHOT_MANIFEST_FILE_NAME)
        const temporarySuffix = `.tmp-${randomUUID()}`
        const temporaryDataPath = workArea.volume.path(`${filePath}${temporarySuffix}`)
        const temporaryManifestPath = workArea.volume.path(`${manifestPath}${temporarySuffix}`)
        const dataServerPath = workArea.volume.path(filePath)
        const manifestServerPath = workArea.volume.path(manifestPath)

        await fsPromises.mkdir(folderServerPath, { recursive: true })
        const hash = createHash('sha256')
        const items: SnapshotItem[] = []
        let size = 0
        let chunkCount = 0
        const dataFile = await fsPromises.open(temporaryDataPath, 'w')
        try {
            for (const [itemIndex, item] of transformed.entries()) {
                const chunks = item.chunks ?? []
                items.push({
                    itemIndex,
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    mimeType: item.mimeType,
                    metadata: item.metadata,
                    chunkCount: chunks.length
                })
                for (const [chunkIndex, chunk] of chunks.entries()) {
                    const metadata: ChunkMetadata = {
                        ...(chunk.metadata ?? {}),
                        chunkId: chunk.metadata?.chunkId || chunk.id || `snapshot-${itemIndex}-${chunkIndex}`
                    }
                    const record: SnapshotChunkRecord = {
                        itemIndex,
                        pageContent: chunk.pageContent ?? '',
                        metadata
                    }
                    const line = `${JSON.stringify(record)}\n`
                    const buffer = Buffer.from(line)
                    hash.update(buffer)
                    size += buffer.length
                    chunkCount += 1
                    await dataFile.write(buffer)
                }
            }
        } finally {
            await dataFile.close()
        }

        const createdAt = new Date().toISOString()
        const sha256 = hash.digest('hex')
        const manifest: SnapshotManifest = {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            documentId: document.id,
            transformFingerprint,
            sourceHash: document.sourceHash ?? null,
            transformer,
            dataFile: SNAPSHOT_FILE_NAME,
            sha256,
            size,
            itemCount: items.length,
            chunkCount,
            items,
            createdAt
        }

        try {
            await fsPromises.writeFile(temporaryManifestPath, JSON.stringify(manifest, null, 2))
            await fsPromises.rename(temporaryDataPath, dataServerPath)
            await fsPromises.rename(temporaryManifestPath, manifestServerPath)
        } catch (error) {
            await Promise.all([
                fsPromises.rm(temporaryDataPath, { force: true }),
                fsPromises.rm(temporaryManifestPath, { force: true })
            ])
            throw error
        }

        return {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            filePath,
            manifestPath,
            sha256,
            size,
            itemCount: items.length,
            chunkCount,
            transformFingerprint,
            sourceHash: document.sourceHash ?? null,
            transformer,
            createdAt
        }
    }

    /**
     * Restores converter output only when the source and converter fingerprint still match.
     * Rechunk intentionally fails on invalid snapshots rather than silently running conversion.
     */
    async load(
        document: Partial<
            Pick<
                IKnowledgeDocument<KnowledgeDocumentMetadata>,
                | 'id'
                | 'knowledgebaseId'
                | 'sourceHash'
                | 'metadata'
                | 'sourceKey'
                | 'sourceType'
                | 'sourceConfig'
                | 'type'
                | 'category'
                | 'filePath'
                | 'fileUrl'
                | 'storageFileId'
                | 'name'
            >
        >,
        transformer: KnowledgeDocumentTransformerIdentity
    ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
        const snapshot = document.metadata?.transformSnapshot
        if (!snapshot) {
            throw new TransformSnapshotUnavailableError('missing')
        }
        this.assertDocumentScope(document)
        const expectedFingerprint = computeKnowledgeDocumentTransformFingerprint(document, transformer)
        if (snapshot.transformFingerprint !== expectedFingerprint) {
            throw new TransformSnapshotUnavailableError('stale')
        }

        try {
            const workArea = await this.resolveWorkArea(document.knowledgebaseId, document.id)
            this.assertSnapshotPaths(workArea.statePath.relativePath, document.id, snapshot)
            const [data, manifestText] = await Promise.all([
                fsPromises.readFile(workArea.volume.path(snapshot.filePath)),
                fsPromises.readFile(workArea.volume.path(snapshot.manifestPath), 'utf8')
            ])
            const manifestValue: unknown = JSON.parse(manifestText)
            if (!isSnapshotManifest(manifestValue)) {
                throw new Error('Invalid transform snapshot manifest')
            }
            const sha256 = createHash('sha256').update(data).digest('hex')
            if (
                data.length !== snapshot.size ||
                data.length !== manifestValue.size ||
                sha256 !== snapshot.sha256 ||
                sha256 !== manifestValue.sha256 ||
                manifestValue.documentId !== document.id ||
                manifestValue.transformFingerprint !== expectedFingerprint ||
                manifestValue.itemCount !== manifestValue.items.length
            ) {
                throw new Error('Transform snapshot integrity check failed')
            }
            return deserializeSnapshot(data.toString('utf8'), manifestValue)
        } catch (error) {
            if (error instanceof TransformSnapshotUnavailableError) {
                throw error
            }
            throw new TransformSnapshotUnavailableError('corrupt')
        }
    }

    /** Performs the same validation as `load` and exposes the result as a UI capability. */
    async inspect(
        document: Partial<
            Pick<
                IKnowledgeDocument<KnowledgeDocumentMetadata>,
                | 'id'
                | 'knowledgebaseId'
                | 'sourceHash'
                | 'metadata'
                | 'sourceKey'
                | 'sourceType'
                | 'sourceConfig'
                | 'type'
                | 'category'
                | 'filePath'
                | 'fileUrl'
                | 'storageFileId'
                | 'name'
            >
        >,
        transformer: KnowledgeDocumentTransformerIdentity
    ): Promise<KnowledgeDocumentReprocessCapabilities> {
        try {
            await this.load(document, transformer)
            return {
                full: true,
                rechunk: {
                    available: true,
                    snapshot: document.metadata?.transformSnapshot
                }
            }
        } catch (error) {
            const reason = error instanceof TransformSnapshotUnavailableError ? error.code : 'corrupt'
            return {
                full: true,
                rechunk: {
                    available: false,
                    reason
                }
            }
        }
    }

    private async resolveWorkArea(knowledgebaseId: string, documentId: string) {
        return await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId,
            documentId
        })
    }

    private assertDocumentScope<T extends { id?: string; knowledgebaseId?: string }>(
        document: T
    ): asserts document is T & { id: string; knowledgebaseId: string } {
        if (!document.id || !document.knowledgebaseId) {
            throw new TransformSnapshotUnavailableError('missing')
        }
    }

    private assertSnapshotPaths(
        statePath: string,
        documentId: string,
        snapshot: KnowledgeDocumentTransformSnapshotRef
    ) {
        const folder = snapshotFolderPath(statePath, documentId, snapshot.transformFingerprint)
        if (
            snapshot.filePath !== path.posix.join(folder, SNAPSHOT_FILE_NAME) ||
            snapshot.manifestPath !== path.posix.join(folder, SNAPSHOT_MANIFEST_FILE_NAME)
        ) {
            throw new TransformSnapshotUnavailableError('corrupt')
        }
    }
}

function snapshotFolderPath(statePath: string, documentId: string, transformFingerprint: string) {
    return path.posix.join(statePath, 'documents', documentId, 'transforms', transformFingerprint)
}

/** Rebuilds LangChain documents while enforcing both global and per-item chunk counts. */
function deserializeSnapshot(serialized: string, manifest: SnapshotManifest) {
    const chunksByItem = new Map<number, Document<ChunkMetadata>[]>()
    const lines = serialized.split('\n').filter(Boolean)
    for (const line of lines) {
        const value: unknown = JSON.parse(line)
        if (!isSnapshotChunkRecord(value)) {
            throw new Error('Invalid transform snapshot record')
        }
        const chunks = chunksByItem.get(value.itemIndex) ?? []
        chunks.push(new Document({ pageContent: value.pageContent, metadata: value.metadata }))
        chunksByItem.set(value.itemIndex, chunks)
    }
    if (lines.length !== manifest.chunkCount) {
        throw new Error('Transform snapshot chunk count mismatch')
    }

    return manifest.items.map((item) => {
        const chunks = chunksByItem.get(item.itemIndex) ?? []
        if (chunks.length !== item.chunkCount) {
            throw new Error('Transform snapshot item count mismatch')
        }
        return {
            id: item.id,
            name: item.name,
            type: item.type,
            mimeType: item.mimeType,
            metadata: item.metadata,
            chunks
        } satisfies Partial<IKnowledgeDocument<ChunkMetadata>>
    })
}

function isSnapshotManifest(value: unknown): value is SnapshotManifest {
    if (!isObjectValue(value)) {
        return false
    }
    const items = Reflect.get(value, 'items')
    return (
        Reflect.get(value, 'schemaVersion') === SNAPSHOT_SCHEMA_VERSION &&
        typeof Reflect.get(value, 'documentId') === 'string' &&
        typeof Reflect.get(value, 'transformFingerprint') === 'string' &&
        Reflect.get(value, 'dataFile') === SNAPSHOT_FILE_NAME &&
        typeof Reflect.get(value, 'sha256') === 'string' &&
        typeof Reflect.get(value, 'size') === 'number' &&
        typeof Reflect.get(value, 'itemCount') === 'number' &&
        typeof Reflect.get(value, 'chunkCount') === 'number' &&
        typeof Reflect.get(value, 'createdAt') === 'string' &&
        isTransformerIdentity(Reflect.get(value, 'transformer')) &&
        Array.isArray(items) &&
        items.every(isSnapshotItem)
    )
}

function isSnapshotItem(value: unknown): value is SnapshotItem {
    if (!isObjectValue(value)) {
        return false
    }
    const metadata = Reflect.get(value, 'metadata')
    const itemIndex = Reflect.get(value, 'itemIndex')
    const chunkCount = Reflect.get(value, 'chunkCount')
    return (
        typeof itemIndex === 'number' &&
        Number.isInteger(itemIndex) &&
        typeof chunkCount === 'number' &&
        Number.isInteger(chunkCount) &&
        (metadata === undefined || isChunkMetadata(metadata))
    )
}

function isSnapshotChunkRecord(value: unknown): value is SnapshotChunkRecord {
    const itemIndex = isObjectValue(value) ? Reflect.get(value, 'itemIndex') : null
    return (
        isObjectValue(value) &&
        typeof itemIndex === 'number' &&
        Number.isInteger(itemIndex) &&
        typeof Reflect.get(value, 'pageContent') === 'string' &&
        isChunkMetadata(Reflect.get(value, 'metadata'))
    )
}

function isTransformerIdentity(value: unknown): value is KnowledgeDocumentTransformerIdentity {
    if (!isObjectValue(value) || typeof Reflect.get(value, 'provider') !== 'string') {
        return false
    }
    const config = Reflect.get(value, 'config')
    const integrationId = Reflect.get(value, 'integrationId')
    return (
        (integrationId === undefined || integrationId === null || typeof integrationId === 'string') &&
        (config === undefined || config === null || (isObjectValue(config) && !Array.isArray(config)))
    )
}

function isChunkMetadata(value: unknown): value is ChunkMetadata {
    return isObjectValue(value) && !Array.isArray(value)
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

function snapshotErrorMessage(code: 'missing' | 'stale' | 'corrupt') {
    if (code === 'stale') {
        return t('server-ai:Error.TransformSnapshotStale', {
            defaultValue: 'The saved conversion result no longer matches the current converter settings.'
        })
    }
    if (code === 'corrupt') {
        return t('server-ai:Error.TransformSnapshotCorrupt', {
            defaultValue: 'The saved conversion result is missing or corrupted.'
        })
    }
    return t('server-ai:Error.TransformSnapshotMissing', {
        defaultValue: 'No saved conversion result is available. Run the converter once before re-chunking.'
    })
}
