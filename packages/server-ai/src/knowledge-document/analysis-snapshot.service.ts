import {
    DocumentAnalysisMetadata,
    DocumentAnalysisSource,
    DocumentAnalysisSourceBlock,
    DocumentLayoutMetadata,
    IKnowledgeDocument,
    KnowledgeDocumentAnalysisBlock,
    KnowledgeDocumentAnalysisPage,
    KnowledgeDocumentAnalysisPreview,
    KnowledgeDocumentAnalysisSnapshotRef,
    KnowledgeDocumentMetadata,
    KnowledgeDocumentTransformerIdentity,
    TDocumentAsset
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { createHash, randomUUID } from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { KnowledgeWorkAreaResolver } from '../shared'
import { computeKnowledgeDocumentTransformFingerprint } from './document-hash'

const ANALYSIS_SCHEMA_VERSION = 1 as const
const MANIFEST_FILE_NAME = 'manifest.json'

/** Manifest entry used to locate and integrity-check one independently loadable page. */
type AnalysisPageManifestItem = {
    page: number
    fileName: string
    width: number
    height: number
    blockCount: number
    sha256: string
    size: number
}

/** Asset allow-list entry; clients receive `id`, never the workspace-relative path. */
type AnalysisAssetManifestItem = {
    id: string
    filePath: string
    type: TDocumentAsset['type']
    fileName: string
}

/** Immutable index for a complete analysis snapshot. Page payloads live in separate JSON files. */
type AnalysisSnapshotManifest = {
    schemaVersion: typeof ANALYSIS_SCHEMA_VERSION
    documentId: string
    transformFingerprint: string
    sourceHash?: string | null
    provider: string
    engine?: string
    pageCount: number
    pages: AnalysisPageManifestItem[]
    blockTypes: KnowledgeDocumentAnalysisBlock['type'][]
    assets: AnalysisAssetManifestItem[]
    createdAt: string
}

/** On-disk page shape. Raw provider data is kept out of the normal page endpoint. */
type AnalysisPageRecord = KnowledgeDocumentAnalysisPage & {
    raw: Array<{
        blockId: string
        providerType?: string
        providerSubType?: string
        data?: Record<string, unknown>
    }>
}

type AnalysisAssetTarget = {
    absolutePath: string
    fileName: string
    mimeType: string
}

type AnalysisWorkAreaResolver = {
    resolve(input: {
        tenantId: string
        userId: string
        knowledgebaseId: string
        documentId?: string
    }): Promise<AnalysisResolvedWorkArea>
}

type AnalysisResolvedWorkArea = {
    volume: { path(filePath: string): string }
    statePath: { relativePath: string }
}

@Injectable()
export class KnowledgeDocumentAnalysisSnapshotService {
    constructor(
        @Inject(KnowledgeWorkAreaResolver)
        private readonly knowledgeWorkAreaResolver: AnalysisWorkAreaResolver
    ) {}

    /**
     * Materializes provider-neutral layout data before text splitting can change block boundaries.
     * The directory is published with a single rename, so readers never observe a partial snapshot.
     */
    async save(
        document: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>,
        transformed: Partial<IKnowledgeDocument<ChunkMetadata>>[],
        transformer: KnowledgeDocumentTransformerIdentity
    ): Promise<KnowledgeDocumentAnalysisSnapshotRef | undefined> {
        this.assertDocumentScope(document)
        const analysis = findDocumentAnalysis(transformed)
        if (!analysis) {
            return undefined
        }

        const transformFingerprint = computeKnowledgeDocumentTransformFingerprint(document, transformer)
        const workArea = await this.resolveWorkArea(document.knowledgebaseId, document.id)
        const collected = analysis.analysisAsset
            ? await collectAnalysisAssetPages(workArea, analysis)
            : collectAnalysisPages(transformed, analysis)
        if (!collected.pages.length) {
            return undefined
        }
        const snapshotId = randomUUID()
        const rootFolder = analysisRootFolder(workArea.statePath.relativePath, document.id, transformFingerprint)
        const temporaryFolder = path.posix.join(rootFolder, `${snapshotId}.tmp`)
        const finalFolder = path.posix.join(rootFolder, snapshotId)
        const temporaryServerFolder = workArea.volume.path(temporaryFolder)
        const finalServerFolder = workArea.volume.path(finalFolder)
        const createdAt = new Date().toISOString()

        await fsPromises.mkdir(path.join(temporaryServerFolder, 'pages'), { recursive: true })
        try {
            const pages: AnalysisPageManifestItem[] = []
            for (const pageRecord of collected.pages) {
                const fileName = `pages/${String(pageRecord.page).padStart(6, '0')}.json`
                const content = Buffer.from(JSON.stringify(pageRecord))
                await fsPromises.writeFile(path.join(temporaryServerFolder, fileName), content)
                pages.push({
                    page: pageRecord.page,
                    fileName,
                    width: pageRecord.width,
                    height: pageRecord.height,
                    blockCount: pageRecord.blocks.length,
                    sha256: createHash('sha256').update(content).digest('hex'),
                    size: content.length
                })
            }

            const manifest: AnalysisSnapshotManifest = {
                schemaVersion: ANALYSIS_SCHEMA_VERSION,
                documentId: document.id,
                transformFingerprint,
                sourceHash: document.sourceHash ?? null,
                provider: analysis.provider,
                ...(analysis.engine ? { engine: analysis.engine } : {}),
                pageCount: Math.max(analysis.pageCount ?? 0, ...pages.map((page) => page.page)),
                pages,
                blockTypes: [...new Set(collected.pages.flatMap((page) => page.blocks.map((block) => block.type)))],
                assets: collected.assets,
                createdAt
            }
            const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2))
            await fsPromises.writeFile(path.join(temporaryServerFolder, MANIFEST_FILE_NAME), manifestContent)
            await fsPromises.mkdir(path.dirname(finalServerFolder), { recursive: true })
            // The document metadata is updated only after this atomic directory commit succeeds.
            await fsPromises.rename(temporaryServerFolder, finalServerFolder)

            return {
                schemaVersion: ANALYSIS_SCHEMA_VERSION,
                manifestPath: path.posix.join(finalFolder, MANIFEST_FILE_NAME),
                manifestSha256: createHash('sha256').update(manifestContent).digest('hex'),
                manifestSize: manifestContent.length,
                transformFingerprint,
                sourceHash: document.sourceHash ?? null,
                provider: analysis.provider,
                ...(analysis.engine ? { engine: analysis.engine } : {}),
                pageCount: manifest.pageCount,
                createdAt
            }
        } catch (error) {
            await fsPromises.rm(temporaryServerFolder, { recursive: true, force: true })
            throw error
        }
    }

    /** Returns lightweight capabilities and page indexes without reading every page payload. */
    async getPreview(
        document: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>
    ): Promise<KnowledgeDocumentAnalysisPreview> {
        const loaded = await this.tryLoadManifest(document)
        if (loaded.ok === false) {
            return { available: false, reason: loaded.reason }
        }
        const { manifest } = loaded
        const blockTypes = new Set(manifest.blockTypes)
        return {
            available: true,
            schemaVersion: ANALYSIS_SCHEMA_VERSION,
            provider: manifest.provider,
            ...(manifest.engine ? { engine: manifest.engine } : {}),
            pageCount: manifest.pageCount,
            pages: manifest.pages.map((page) => page.page),
            sourceType: document.type,
            sourceMimeType: document.mimeType,
            views: [
                'markdown',
                'structure',
                ...(blockTypes.has('table') ? (['tables'] as const) : []),
                ...(blockTypes.has('image') ? (['images'] as const) : []),
                'json'
            ]
        }
    }

    async getPage(
        document: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>,
        pageNumber: number
    ): Promise<KnowledgeDocumentAnalysisPage> {
        const loaded = await this.loadManifest(document)
        const record = await this.readPageRecord(loaded, pageNumber)
        return {
            schemaVersion: record.schemaVersion,
            page: record.page,
            width: record.width,
            height: record.height,
            markdown: record.markdown,
            blocks: record.blocks
        }
    }

    async getRawPage(
        document: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>,
        pageNumber: number
    ): Promise<AnalysisPageRecord['raw']> {
        const loaded = await this.loadManifest(document)
        return (await this.readPageRecord(loaded, pageNumber)).raw
    }

    /** Resolves an opaque asset id through the manifest allow-list and tenant-scoped work area. */
    async resolveAsset(
        document: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>,
        assetId: string
    ): Promise<AnalysisAssetTarget> {
        const loaded = await this.loadManifest(document)
        const asset = loaded.manifest.assets.find((item) => item.id === assetId)
        if (!asset || !isSafeRelativePath(asset.filePath)) {
            throw new NotFoundException('Document analysis asset was not found')
        }
        const absolutePath = loaded.workArea.volume.path(asset.filePath)
        const fileStat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!fileStat?.isFile()) {
            throw new NotFoundException('Document analysis asset was not found')
        }
        return {
            absolutePath,
            fileName: asset.fileName,
            mimeType: assetMimeType(asset)
        }
    }

    /** Validates size, digest, schema, and requested page before returning persisted JSON. */
    private async readPageRecord(loaded: LoadedAnalysisManifest, pageNumber: number): Promise<AnalysisPageRecord> {
        if (!Number.isInteger(pageNumber) || pageNumber < 1) {
            throw new NotFoundException('Document analysis page was not found')
        }
        const page = loaded.manifest.pages.find((item) => item.page === pageNumber)
        if (!page || !isSafeRelativePath(page.fileName)) {
            throw new NotFoundException('Document analysis page was not found')
        }
        const pagePath = path.join(path.dirname(loaded.manifestServerPath), page.fileName)
        const data = await fsPromises.readFile(pagePath).catch(() => null)
        if (!data || data.length !== page.size || createHash('sha256').update(data).digest('hex') !== page.sha256) {
            throw new NotFoundException('Document analysis page is unavailable')
        }
        const value: unknown = JSON.parse(data.toString('utf8'))
        if (!isAnalysisPageRecord(value) || value.page !== pageNumber) {
            throw new NotFoundException('Document analysis page is unavailable')
        }
        return value
    }

    /**
     * Treats source changes as staleness and any path/schema/hash mismatch as corruption. Keeping
     * these outcomes explicit lets the UI offer a full reprocess instead of serving unsafe data.
     */
    private async tryLoadManifest(
        document: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>
    ): Promise<LoadedAnalysisManifestResult> {
        const snapshot = document.metadata?.analysisSnapshot
        if (!snapshot) return { ok: false, reason: 'missing' }
        try {
            this.assertDocumentScope(document)
            if (snapshot.sourceHash !== (document.sourceHash ?? null)) {
                return { ok: false, reason: 'stale' }
            }
            const workArea = await this.resolveWorkArea(document.knowledgebaseId, document.id)
            this.assertManifestPath(workArea.statePath.relativePath, document.id, snapshot)
            const manifestServerPath = workArea.volume.path(snapshot.manifestPath)
            const manifestContent = await fsPromises.readFile(manifestServerPath)
            if (
                manifestContent.length !== snapshot.manifestSize ||
                createHash('sha256').update(manifestContent).digest('hex') !== snapshot.manifestSha256
            ) {
                return { ok: false, reason: 'corrupt' }
            }
            const value: unknown = JSON.parse(manifestContent.toString('utf8'))
            if (
                !isAnalysisSnapshotManifest(value) ||
                value.documentId !== document.id ||
                value.transformFingerprint !== snapshot.transformFingerprint ||
                value.pageCount !== snapshot.pageCount ||
                value.provider !== snapshot.provider
            ) {
                return { ok: false, reason: 'corrupt' }
            }
            return { ok: true, manifest: value, manifestServerPath, workArea }
        } catch {
            return { ok: false, reason: 'corrupt' }
        }
    }

    private async loadManifest(
        document: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>
    ): Promise<LoadedAnalysisManifest> {
        const result = await this.tryLoadManifest(document)
        if (result.ok === false) {
            throw new NotFoundException(`Document analysis preview is ${result.reason}`)
        }
        return result
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
            throw new NotFoundException('Document analysis preview is unavailable')
        }
    }

    private assertManifestPath(statePath: string, documentId: string, snapshot: KnowledgeDocumentAnalysisSnapshotRef) {
        const root = analysisRootFolder(statePath, documentId, snapshot.transformFingerprint)
        const relative = path.posix.relative(root, snapshot.manifestPath)
        if (
            !relative ||
            relative.startsWith('..') ||
            path.posix.isAbsolute(relative) ||
            path.posix.basename(relative) !== MANIFEST_FILE_NAME ||
            relative.split('/').length !== 2
        ) {
            throw new NotFoundException('Document analysis preview is unavailable')
        }
    }
}

type LoadedAnalysisManifest = {
    ok: true
    manifest: AnalysisSnapshotManifest
    manifestServerPath: string
    workArea: AnalysisResolvedWorkArea
}

type LoadedAnalysisManifestResult =
    | LoadedAnalysisManifest
    | { ok: false; reason: 'missing' | 'stale' | 'corrupt' | 'unsupported' }

function analysisRootFolder(statePath: string, documentId: string, transformFingerprint: string) {
    return path.posix.join(statePath, 'documents', documentId, 'analyses', transformFingerprint)
}

function findDocumentAnalysis(
    transformed: Partial<IKnowledgeDocument<ChunkMetadata>>[]
): DocumentAnalysisMetadata | undefined {
    for (const item of transformed) {
        if (isDocumentAnalysisMetadata(item.metadata?.documentAnalysis)) {
            return item.metadata.documentAnalysis
        }
    }
    return undefined
}

/**
 * Reads the converter-owned provider-neutral sidecar used when the chunking input is one merged
 * Markdown document. Keeping layouts out of chunk metadata avoids duplicating them after splitting.
 */
async function collectAnalysisAssetPages(
    workArea: AnalysisResolvedWorkArea,
    analysis: DocumentAnalysisMetadata
): Promise<{ pages: AnalysisPageRecord[]; assets: AnalysisAssetManifestItem[] }> {
    const asset = analysis.analysisAsset
    if (!asset || !isSafeRelativePath(asset.filePath)) {
        throw new Error('Document analysis source asset is invalid')
    }
    const content = await fsPromises.readFile(workArea.volume.path(asset.filePath))
    const value: unknown = JSON.parse(content.toString('utf8'))
    if (!isDocumentAnalysisSource(value)) {
        throw new Error('Document analysis source asset has an unsupported schema')
    }

    const assetByPath = new Map<string, AnalysisAssetManifestItem>()
    const pages = value.pages
        .map((page) => {
            const blocks = [...page.blocks]
                .sort((left, right) => left.order - right.order)
                .map((block) => analysisSourceBlock(block, assetByPath))
            return {
                schemaVersion: ANALYSIS_SCHEMA_VERSION,
                page: page.page,
                width: page.width,
                height: page.height,
                markdown: blocks
                    .map((block) => block.markdown.trim())
                    .filter(Boolean)
                    .join('\n\n'),
                blocks: blocks.map(publicAnalysisBlock),
                raw: blocks.map((block) => ({
                    blockId: block.id,
                    ...(block.providerType ? { providerType: block.providerType } : {}),
                    ...(block.providerSubType ? { providerSubType: block.providerSubType } : {}),
                    ...(block.raw ? { data: block.raw } : {})
                }))
            } satisfies AnalysisPageRecord
        })
        .sort((left, right) => left.page - right.page)

    for (const relatedAsset of [analysis.markdownAsset, ...(analysis.rawAssets ?? [])]) {
        if (relatedAsset) registerAsset(relatedAsset, assetByPath)
    }
    return { pages, assets: [...assetByPath.values()] }
}

function analysisSourceBlock(block: DocumentAnalysisSourceBlock, assetByPath: Map<string, AnalysisAssetManifestItem>) {
    const assetId = block.asset ? registerAsset(block.asset, assetByPath) : undefined
    return {
        id: block.id,
        order: block.order,
        type: block.type,
        ...(block.providerType ? { providerType: block.providerType } : {}),
        ...(block.providerSubType ? { providerSubType: block.providerSubType } : {}),
        markdown: block.markdown,
        ...(block.bounds ? { bounds: block.bounds } : {}),
        ...(block.polygon ? { polygon: block.polygon } : {}),
        ...(assetId ? { assetId } : {}),
        ...(block.raw ? { raw: block.raw } : {})
    }
}

/** Removes provider-only raw payloads from the default page response; JSON loads them separately. */
function publicAnalysisBlock(block: ReturnType<typeof analysisSourceBlock>): KnowledgeDocumentAnalysisBlock {
    const preview = { ...block }
    delete preview.raw
    return preview
}

/**
 * Groups pre-split transformer chunks by global page and reading order. Provider payloads remain
 * attached to their source block instead of being inferred later from indexed chunks.
 */
function collectAnalysisPages(
    transformed: Partial<IKnowledgeDocument<ChunkMetadata>>[],
    analysis?: DocumentAnalysisMetadata
) {
    const pageRecords = new Map<number, AnalysisPageRecord>()
    const assetByPath = new Map<string, AnalysisAssetManifestItem>()
    for (const item of transformed) {
        for (const chunk of item.chunks ?? []) {
            const layout = chunk.metadata?.documentLayout
            if (!isDocumentLayoutMetadata(layout)) continue
            const record = pageRecords.get(layout.page) ?? {
                schemaVersion: ANALYSIS_SCHEMA_VERSION,
                page: layout.page,
                width: layout.pageWidth,
                height: layout.pageHeight,
                markdown: '',
                blocks: [],
                raw: []
            }
            if (record.width !== layout.pageWidth || record.height !== layout.pageHeight) continue
            const assetId = layout.asset ? registerAsset(layout.asset, assetByPath) : undefined
            const block: KnowledgeDocumentAnalysisBlock = {
                id: layout.blockId,
                order: layout.order,
                type: layout.type,
                ...(layout.providerType ? { providerType: layout.providerType } : {}),
                ...(layout.providerSubType ? { providerSubType: layout.providerSubType } : {}),
                markdown: chunk.pageContent ?? '',
                ...(layout.bounds ? { bounds: layout.bounds } : {}),
                ...(layout.polygon ? { polygon: layout.polygon } : {}),
                ...(assetId ? { assetId } : {})
            }
            record.blocks.push(block)
            record.raw.push({
                blockId: layout.blockId,
                ...(layout.providerType ? { providerType: layout.providerType } : {}),
                ...(layout.providerSubType ? { providerSubType: layout.providerSubType } : {}),
                ...(layout.raw ? { data: layout.raw } : {})
            })
            pageRecords.set(layout.page, record)
        }
    }
    for (const asset of [analysis?.markdownAsset, ...(analysis?.rawAssets ?? [])]) {
        if (asset) registerAsset(asset, assetByPath)
    }

    const pages = [...pageRecords.values()]
        .sort((left, right) => left.page - right.page)
        .map((page) => {
            page.blocks.sort((left, right) => left.order - right.order)
            page.raw.sort(
                (left, right) =>
                    (page.blocks.find((block) => block.id === left.blockId)?.order ?? 0) -
                    (page.blocks.find((block) => block.id === right.blockId)?.order ?? 0)
            )
            page.markdown = page.blocks
                .map((block) => block.markdown.trim())
                .filter(Boolean)
                .join('\n\n')
            return page
        })
    return { pages, assets: [...assetByPath.values()] }
}

/** Registers each safe workspace asset once and exposes a deterministic opaque id to clients. */
function registerAsset(asset: TDocumentAsset, assetByPath: Map<string, AnalysisAssetManifestItem>) {
    if (!isSafeRelativePath(asset.filePath)) return undefined
    const existing = assetByPath.get(asset.filePath)
    if (existing) return existing.id
    const id = createHash('sha256').update(asset.filePath).digest('hex').slice(0, 24)
    assetByPath.set(asset.filePath, {
        id,
        filePath: asset.filePath,
        type: asset.type,
        fileName: path.posix.basename(asset.filePath)
    })
    return id
}

function isDocumentAnalysisMetadata(value: unknown): value is DocumentAnalysisMetadata {
    return (
        isObject(value) &&
        value.schemaVersion === ANALYSIS_SCHEMA_VERSION &&
        typeof value.provider === 'string' &&
        value.coordinateSystem === 'page-top-left'
    )
}

function isDocumentAnalysisSource(value: unknown): value is DocumentAnalysisSource {
    return (
        isObject(value) &&
        value.schemaVersion === ANALYSIS_SCHEMA_VERSION &&
        Array.isArray(value.pages) &&
        value.pages.every(isDocumentAnalysisSourcePage)
    )
}

function isDocumentAnalysisSourcePage(value: unknown): value is DocumentAnalysisSource['pages'][number] {
    return (
        isObject(value) &&
        value.schemaVersion === ANALYSIS_SCHEMA_VERSION &&
        Number.isInteger(value.page) &&
        Number(value.page) > 0 &&
        isFiniteNumber(value.width) &&
        value.width > 0 &&
        isFiniteNumber(value.height) &&
        value.height > 0 &&
        Array.isArray(value.blocks) &&
        value.blocks.every(isDocumentAnalysisSourceBlock)
    )
}

function isDocumentAnalysisSourceBlock(value: unknown): value is DocumentAnalysisSourceBlock {
    return (
        isObject(value) &&
        typeof value.id === 'string' &&
        Number.isInteger(value.order) &&
        typeof value.type === 'string' &&
        ANALYSIS_BLOCK_TYPES.has(value.type) &&
        typeof value.markdown === 'string' &&
        (value.providerType === undefined || typeof value.providerType === 'string') &&
        (value.providerSubType === undefined || typeof value.providerSubType === 'string') &&
        (value.bounds === undefined || isAnalysisBounds(value.bounds)) &&
        (value.polygon === undefined ||
            (Array.isArray(value.polygon) && value.polygon.length >= 3 && value.polygon.every(isAnalysisPoint))) &&
        (value.asset === undefined || isDocumentAsset(value.asset)) &&
        (value.raw === undefined || isObject(value.raw))
    )
}

function isDocumentAsset(value: unknown): value is TDocumentAsset {
    return (
        isObject(value) &&
        (value.type === 'image' || value.type === 'video' || value.type === 'audio' || value.type === 'file') &&
        typeof value.url === 'string' &&
        typeof value.filePath === 'string' &&
        isSafeRelativePath(value.filePath)
    )
}

function isDocumentLayoutMetadata(value: unknown): value is DocumentLayoutMetadata {
    return (
        isObject(value) &&
        value.schemaVersion === ANALYSIS_SCHEMA_VERSION &&
        typeof value.page === 'number' &&
        Number.isInteger(value.page) &&
        value.page > 0 &&
        typeof value.pageWidth === 'number' &&
        Number.isFinite(value.pageWidth) &&
        value.pageWidth > 0 &&
        typeof value.pageHeight === 'number' &&
        Number.isFinite(value.pageHeight) &&
        value.pageHeight > 0 &&
        typeof value.blockId === 'string' &&
        Number.isInteger(value.order) &&
        typeof value.type === 'string' &&
        ANALYSIS_BLOCK_TYPES.has(value.type)
    )
}

function isAnalysisSnapshotManifest(value: unknown): value is AnalysisSnapshotManifest {
    return (
        isObject(value) &&
        value.schemaVersion === ANALYSIS_SCHEMA_VERSION &&
        typeof value.documentId === 'string' &&
        typeof value.transformFingerprint === 'string' &&
        typeof value.provider === 'string' &&
        typeof value.pageCount === 'number' &&
        Number.isInteger(value.pageCount) &&
        value.pageCount > 0 &&
        Array.isArray(value.pages) &&
        value.pages.every(isAnalysisPageManifestItem) &&
        Array.isArray(value.blockTypes) &&
        value.blockTypes.every((item) => typeof item === 'string' && ANALYSIS_BLOCK_TYPES.has(item)) &&
        Array.isArray(value.assets) &&
        value.assets.every(isAnalysisAssetManifestItem) &&
        typeof value.createdAt === 'string'
    )
}

function isAnalysisPageManifestItem(value: unknown): value is AnalysisPageManifestItem {
    return (
        isObject(value) &&
        typeof value.page === 'number' &&
        Number.isInteger(value.page) &&
        value.page > 0 &&
        typeof value.fileName === 'string' &&
        isSafeRelativePath(value.fileName) &&
        typeof value.width === 'number' &&
        value.width > 0 &&
        typeof value.height === 'number' &&
        value.height > 0 &&
        typeof value.blockCount === 'number' &&
        Number.isInteger(value.blockCount) &&
        typeof value.sha256 === 'string' &&
        typeof value.size === 'number' &&
        Number.isInteger(value.size) &&
        value.size >= 0
    )
}

function isAnalysisAssetManifestItem(value: unknown): value is AnalysisAssetManifestItem {
    return (
        isObject(value) &&
        typeof value.id === 'string' &&
        typeof value.filePath === 'string' &&
        isSafeRelativePath(value.filePath) &&
        typeof value.fileName === 'string' &&
        (value.type === 'image' || value.type === 'video' || value.type === 'audio' || value.type === 'file')
    )
}

function isAnalysisPageRecord(value: unknown): value is AnalysisPageRecord {
    return (
        isObject(value) &&
        value.schemaVersion === ANALYSIS_SCHEMA_VERSION &&
        Number.isInteger(value.page) &&
        typeof value.width === 'number' &&
        Number.isFinite(value.width) &&
        value.width > 0 &&
        typeof value.height === 'number' &&
        Number.isFinite(value.height) &&
        value.height > 0 &&
        typeof value.markdown === 'string' &&
        Array.isArray(value.blocks) &&
        value.blocks.every(isAnalysisBlock) &&
        Array.isArray(value.raw) &&
        value.raw.every(
            (item) =>
                isObject(item) && typeof item.blockId === 'string' && (item.data === undefined || isObject(item.data))
        )
    )
}

const ANALYSIS_BLOCK_TYPES = new Set([
    'text',
    'title',
    'table',
    'image',
    'formula',
    'header',
    'footer',
    'footnote',
    'page-number',
    'seal',
    'other'
])

function isAnalysisBlock(value: unknown): value is KnowledgeDocumentAnalysisBlock {
    return (
        isObject(value) &&
        typeof value.id === 'string' &&
        Number.isInteger(value.order) &&
        typeof value.type === 'string' &&
        ANALYSIS_BLOCK_TYPES.has(value.type) &&
        typeof value.markdown === 'string' &&
        (value.bounds === undefined || isAnalysisBounds(value.bounds)) &&
        (value.polygon === undefined ||
            (Array.isArray(value.polygon) && value.polygon.length >= 3 && value.polygon.every(isAnalysisPoint))) &&
        (value.assetId === undefined || typeof value.assetId === 'string')
    )
}

function isAnalysisBounds(value: unknown) {
    return (
        isObject(value) &&
        isFiniteNumber(value.x) &&
        isFiniteNumber(value.y) &&
        isFiniteNumber(value.width) &&
        value.width > 0 &&
        isFiniteNumber(value.height) &&
        value.height > 0
    )
}

function isAnalysisPoint(value: unknown) {
    return isObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

/** Rejects absolute paths and traversal segments before resolving any snapshot-controlled path. */
function isSafeRelativePath(value: string) {
    const normalized = value.replace(/\\/g, '/')
    return Boolean(normalized) && !path.posix.isAbsolute(normalized) && !normalized.split('/').includes('..')
}

function assetMimeType(asset: AnalysisAssetManifestItem) {
    const extension = path.extname(asset.fileName).toLowerCase()
    if (extension === '.png') return 'image/png'
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
    if (extension === '.webp') return 'image/webp'
    if (extension === '.bmp') return 'image/bmp'
    if (extension === '.tif' || extension === '.tiff') return 'image/tiff'
    return asset.type === 'image' ? 'application/octet-stream' : 'application/octet-stream'
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
