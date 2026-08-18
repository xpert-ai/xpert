import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Cache } from 'cache-manager'
import fsPromises from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import type {
    AgentMiddlewareRuntimeScope,
    KnowledgeDocumentVisualAssetsApi,
    KnowledgeDocumentVisualCandidate,
    KnowledgeDocumentVisualCandidateReason,
    KnowledgeDocumentVisualCandidateRequest,
    KnowledgeDocumentVisualImagePayload,
    KnowledgeDocumentPreparedImageArtifact,
    KnowledgeDocumentViewedImage,
    KnowledgeDocumentViewImagesResult,
    WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { KnowledgeWorkAreaResolver } from '../shared/volume/work-area'
import {
    KnowledgeDocumentAnalysisSnapshotService,
    type KnowledgeDocumentAnalysisVisualAsset
} from './analysis-snapshot.service'
import { KnowledgeDocumentChunkService } from './chunk/chunk.service'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'

const VISUAL_IMAGE_BATCH_TTL_MS = 60 * 1000
const MAX_IMAGES_PER_VIEW = 3
const MAX_VISUAL_CANDIDATES = 6
const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_OUTPUT_BYTES = 10 * 1024 * 1024
const MAX_LEGACY_SIDECAR_BYTES = 12 * 1024 * 1024
const MAX_LEGACY_CHUNKS = 1000

type RequiredExecutionBinding = {
    tenantId: string
    organizationId: string | null
    userId: string
    xpertId: string
    conversationId: string
    agentKey: string
    executionId: string
}

type VisualAssetLocator = { kind: 'snapshot'; assetId: string } | { kind: 'legacy'; relativePath: string }

type CatalogAsset = KnowledgeDocumentAnalysisVisualAsset & {
    chunkId?: string
    locator: VisualAssetLocator
}

type AllowedVisualPathRecord = {
    executionBinding: RequiredExecutionBinding
    filePath: string
    knowledgebaseId: string
    knowledgeDocumentId: string
    documentFingerprint: string
    sourceDocumentId: string
    caseId: string
    baselineId: string
    runId: string
    page?: number
    chunkId?: string
    sourceBlockIds: string[]
    visualAssetId: string
    candidateReason: KnowledgeDocumentVisualCandidateReason
    summary?: string
    locator: VisualAssetLocator
}

type VisualImageBatchRecord = RequiredExecutionBinding & {
    batchRef: string
    expiresAt: string
    images: KnowledgeDocumentVisualImagePayload[]
}

type LegacyAssetContext = {
    page?: number
    chunkId?: string
    sourceBlockIds: string[]
    summary?: string
}

@Injectable()
export class KnowledgeDocumentVisualAssetsRuntimeService {
    constructor(
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache,
        private readonly documents: KnowledgeDocumentService,
        private readonly chunks: KnowledgeDocumentChunkService,
        private readonly snapshots: KnowledgeDocumentAnalysisSnapshotService,
        @Inject(KnowledgeWorkAreaResolver)
        private readonly workAreaResolver: KnowledgeWorkAreaResolver
    ) {}

    createScopedApi(
        scope: AgentMiddlewareRuntimeScope,
        dependencies: { workspaceFiles: WorkspaceFilesApi }
    ): KnowledgeDocumentVisualAssetsApi {
        const allowedPaths = new Map<string, AllowedVisualPathRecord>()
        return {
            issueCandidates: (input) => this.issueCandidates(invocationScope(scope), input, allowedPaths),
            prepareImages: (input) =>
                this.prepareImages(invocationScope(scope), input.filePaths, allowedPaths, dependencies.workspaceFiles),
            consumeImageBatch: (batchRef) => this.consumeImageBatch(invocationScope(scope), batchRef),
            discardImageBatch: (batchRef) => this.discardImageBatch(invocationScope(scope), batchRef)
        }
    }

    private async issueCandidates(
        scope: AgentMiddlewareRuntimeScope,
        input: KnowledgeDocumentVisualCandidateRequest,
        allowedPaths: Map<string, AllowedVisualPathRecord>
    ) {
        const binding = requireExecutionBinding(scope)
        const maxAssets = Math.min(MAX_VISUAL_CANDIDATES, Math.max(1, Math.trunc(input.maxAssets)))
        if (!input.knowledgebaseId || !input.knowledgeDocumentId || !input.businessScope?.sourceDocumentId) {
            throw new BadRequestException('A governed KnowledgeDocument and BOM evidence scope are required')
        }
        if (input.businessScope.namespace !== 'bom.requirement-evidence') {
            throw new ForbiddenException('The visual asset business scope is not supported')
        }

        const document = await this.requireDocument(input.knowledgeDocumentId, input.knowledgebaseId, binding)
        const warnings: string[] = []
        const catalog = await this.buildCatalog(document, binding, warnings)
        const ranked = rankVisualAssets(catalog.assets, input.textAnchors, input.query).slice(0, maxAssets)
        const candidates: KnowledgeDocumentVisualCandidate[] = []

        for (const rankedAsset of ranked) {
            const filePath = controlledVisualPath(
                input.knowledgeDocumentId,
                input.businessScope.sourceDocumentId,
                rankedAsset.asset.visualAssetId
            )
            const record: AllowedVisualPathRecord = {
                executionBinding: binding,
                filePath,
                knowledgebaseId: input.knowledgebaseId,
                knowledgeDocumentId: input.knowledgeDocumentId,
                documentFingerprint: catalog.documentFingerprint,
                sourceDocumentId: input.businessScope.sourceDocumentId,
                caseId: input.businessScope.caseId,
                baselineId: input.businessScope.baselineId,
                runId: input.businessScope.runId,
                ...(rankedAsset.asset.page ? { page: rankedAsset.asset.page } : {}),
                ...(rankedAsset.chunkId ? { chunkId: rankedAsset.chunkId } : {}),
                sourceBlockIds: rankedAsset.asset.sourceBlockIds,
                visualAssetId: rankedAsset.asset.visualAssetId,
                candidateReason: rankedAsset.reason,
                ...(rankedAsset.asset.summary ? { summary: rankedAsset.asset.summary } : {}),
                locator: rankedAsset.asset.locator
            }
            allowedPaths.set(filePath, record)
            candidates.push(toPublicCandidate(record))
        }

        return { candidates, warnings }
    }

    private async prepareImages(
        scope: AgentMiddlewareRuntimeScope,
        rawFilePaths: string[],
        allowedPaths: Map<string, AllowedVisualPathRecord>,
        workspaceFiles: WorkspaceFilesApi
    ): Promise<KnowledgeDocumentViewImagesResult> {
        const binding = requireExecutionBinding(scope)
        const filePaths = [...new Set(rawFilePaths.map((value) => value.trim()).filter(Boolean))]
        if (!filePaths.length) throw new BadRequestException('At least one governed filePath is required')
        if (filePaths.length > MAX_IMAGES_PER_VIEW) {
            throw new BadRequestException(
                `knowledge_document_view_images accepts at most ${MAX_IMAGES_PER_VIEW} filePaths`
            )
        }

        const images: KnowledgeDocumentVisualImagePayload[] = []
        const artifactInputs: KnowledgeDocumentPreparedImageArtifact[] = []
        for (const [index, filePath] of filePaths.entries()) {
            if (!isControlledVisualPath(filePath)) {
                throw new NotFoundException('The governed KnowledgeDocument image path is invalid')
            }
            const allowed = allowedPaths.get(filePath)
            if (!allowed) {
                throw new NotFoundException(
                    'The KnowledgeDocument image path was not returned by an exact search in this Agent execution'
                )
            }
            assertBindingMatches(binding, allowed.executionBinding)
            const document = await this.requireDocument(allowed.knowledgeDocumentId, allowed.knowledgebaseId, binding)
            if (documentFingerprint(document) !== allowed.documentFingerprint) {
                throw new NotFoundException(
                    'The KnowledgeDocument was reprocessed; search again for fresh visual candidates'
                )
            }
            const target = await this.resolveAllowedTarget(document, binding, allowed.locator)
            const prepared = await readAndPrepareImage(target.absolutePath)
            const image: KnowledgeDocumentVisualImagePayload = {
                index: index + 1,
                mimeType: prepared.mimeType,
                size: prepared.buffer.length,
                width: prepared.width,
                height: prepared.height,
                sha256: prepared.sha256,
                knowledgeDocumentId: allowed.knowledgeDocumentId,
                sourceDocumentId: allowed.sourceDocumentId,
                ...(allowed.page ? { page: allowed.page } : {}),
                ...(allowed.chunkId ? { chunkId: allowed.chunkId } : {}),
                sourceBlockIds: allowed.sourceBlockIds,
                visualAssetId: allowed.visualAssetId,
                candidateReason: allowed.candidateReason,
                ...(allowed.summary ? { summary: allowed.summary } : {}),
                dataBase64: prepared.buffer.toString('base64')
            }
            images.push(image)

            const fileName = `${prepared.sha256}.${extensionForMimeType(prepared.mimeType)}`
            const workspaceFile = await workspaceFiles.writeRuntimeBuffer({
                buffer: prepared.buffer,
                originalName: knowledgeDocumentImageTitle(image),
                mimeType: prepared.mimeType,
                size: prepared.buffer.length,
                folder: '.xpert/tool-output/knowledge-document-images',
                fileName,
                metadata: {
                    source: 'knowledge-document',
                    knowledgeDocumentId: image.knowledgeDocumentId,
                    sourceDocumentId: image.sourceDocumentId,
                    visualAssetId: image.visualAssetId,
                    ...(image.page ? { page: image.page } : {}),
                    ...(image.chunkId ? { chunkId: image.chunkId } : {}),
                    sourceBlockIds: image.sourceBlockIds,
                    sha256: image.sha256
                }
            })
            artifactInputs.push({
                index: image.index,
                fileName,
                workspaceFileRef: workspaceFile.reference
            })
        }

        const batchRef = `kdvb_${randomUUID()}`
        const batch: VisualImageBatchRecord = {
            ...binding,
            batchRef,
            expiresAt: new Date(Date.now() + VISUAL_IMAGE_BATCH_TTL_MS).toISOString(),
            images
        }
        await this.cacheManager.set(batchCacheKey(batchRef), batch, VISUAL_IMAGE_BATCH_TTL_MS)
        return {
            batchRef,
            images: images.map(stripImageBytes),
            artifactInputs
        }
    }

    private async consumeImageBatch(scope: AgentMiddlewareRuntimeScope, batchRef: string) {
        const binding = requireExecutionBinding(scope)
        const key = batchCacheKey(batchRef)
        const batch = await this.cacheManager.get<VisualImageBatchRecord>(key)
        if (!batch || isExpired(batch.expiresAt)) {
            throw new NotFoundException('The KnowledgeDocument image batch expired; call the viewer again')
        }
        assertBindingMatches(binding, batch)
        await this.cacheManager.del(key)
        return batch.images
    }

    private async discardImageBatch(scope: AgentMiddlewareRuntimeScope, batchRef: string) {
        const binding = requireExecutionBinding(scope)
        const key = batchCacheKey(batchRef)
        const batch = await this.cacheManager.get<VisualImageBatchRecord>(key)
        if (batch) assertBindingMatches(binding, batch)
        await this.cacheManager.del(key)
    }

    private async requireDocument(documentId: string, knowledgebaseId: string, binding: RequiredExecutionBinding) {
        const document = await this.documents.findOne(documentId)
        if (
            document.knowledgebaseId !== knowledgebaseId ||
            document.tenantId !== binding.tenantId ||
            (document.organizationId ?? null) !== binding.organizationId ||
            document.disabled
        ) {
            throw new NotFoundException('The governed KnowledgeDocument is unavailable')
        }
        return document
    }

    private async buildCatalog(
        document: KnowledgeDocument,
        binding: RequiredExecutionBinding,
        warnings: string[]
    ): Promise<{ documentFingerprint: string; assets: CatalogAsset[] }> {
        try {
            const catalog = await this.snapshots.getVisualCatalog(document)
            return {
                documentFingerprint: documentFingerprint(document),
                assets: catalog.assets.map((asset) => ({
                    ...asset,
                    locator: { kind: 'snapshot', assetId: asset.visualAssetId }
                }))
            }
        } catch {
            warnings.push(
                'The immutable analysis snapshot is unavailable; visual candidates use a guarded legacy work-area allow-list.'
            )
        }

        return {
            documentFingerprint: documentFingerprint(document),
            assets: await this.buildLegacyCatalog(document, binding)
        }
    }

    private async buildLegacyCatalog(document: KnowledgeDocument, binding: RequiredExecutionBinding) {
        if (!document.knowledgebaseId) return []
        const workArea = await this.workAreaResolver.resolve({
            tenantId: binding.tenantId,
            userId: binding.userId,
            knowledgebaseId: document.knowledgebaseId,
            documentId: document.id
        })
        const { items } = await this.chunks.findAll({
            where: { documentId: document.id },
            order: { createdAt: 'ASC' }
        })
        const assets: CatalogAsset[] = []
        const sidecarPaths = new Set<string>()
        collectLegacyAssets(document.metadata, { sourceBlockIds: [] }, assets, sidecarPaths)
        for (const chunk of items.slice(0, MAX_LEGACY_CHUNKS)) {
            const metadata = chunk.metadata ?? {}
            collectLegacyAssets(
                metadata,
                {
                    page: readPositiveInteger(metadata['page'] ?? metadata['pageNumber'] ?? metadata['pageIndex']),
                    chunkId: readString(metadata['chunkId']) ?? chunk.id,
                    sourceBlockIds: readStringArray(metadata['sourceBlockIds']),
                    summary: chunk.pageContent?.trim().slice(0, 1000) || undefined
                },
                assets,
                sidecarPaths
            )
        }

        for (const relativePath of [...sidecarPaths].slice(0, 20)) {
            if (!isSafeRelativePath(relativePath)) continue
            const absolutePath = workArea.volume.path(relativePath)
            const stat = await fsPromises.stat(absolutePath).catch(() => null)
            if (!stat?.isFile() || stat.size > MAX_LEGACY_SIDECAR_BYTES) continue
            const raw = await fsPromises.readFile(absolutePath).catch(() => null)
            if (!raw) continue
            try {
                const value: unknown = JSON.parse(raw.toString('utf8'))
                collectLegacyAssets(value, { sourceBlockIds: [] }, assets, new Set())
            } catch {
                continue
            }
        }

        const unique = new Map<string, CatalogAsset>()
        for (const asset of assets) {
            if (asset.locator.kind !== 'legacy' || !isSafeRelativePath(asset.locator.relativePath)) continue
            const current = unique.get(asset.visualAssetId)
            if (!current) {
                unique.set(asset.visualAssetId, asset)
                continue
            }
            current.sourceBlockIds = [...new Set([...current.sourceBlockIds, ...asset.sourceBlockIds])].slice(0, 100)
            current.page ??= asset.page
            current.chunkId ??= asset.chunkId
            current.summary ??= asset.summary
        }
        return [...unique.values()]
    }

    private async resolveAllowedTarget(
        document: KnowledgeDocument,
        binding: RequiredExecutionBinding,
        locator: VisualAssetLocator
    ) {
        if (locator.kind === 'snapshot') {
            return await this.snapshots.resolveAsset(document, locator.assetId)
        }
        if (!document.knowledgebaseId || !isSafeRelativePath(locator.relativePath)) {
            throw new NotFoundException('The KnowledgeDocument image is unavailable')
        }
        const workArea = await this.workAreaResolver.resolve({
            tenantId: binding.tenantId,
            userId: binding.userId,
            knowledgebaseId: document.knowledgebaseId,
            documentId: document.id
        })
        const absolutePath = workArea.volume.path(locator.relativePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) throw new NotFoundException('The KnowledgeDocument image is unavailable')
        return { absolutePath }
    }
}

function collectLegacyAssets(
    value: unknown,
    inherited: LegacyAssetContext,
    output: CatalogAsset[],
    sidecarPaths: Set<string>,
    depth = 0
) {
    if (depth > 10 || value === null || value === undefined) return
    if (Array.isArray(value)) {
        for (const item of value.slice(0, 5000)) collectLegacyAssets(item, inherited, output, sidecarPaths, depth + 1)
        return
    }
    if (typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const context: LegacyAssetContext = {
        page: readPositiveInteger(record['page'] ?? record['pageNumber'] ?? record['pageIndex']) ?? inherited.page,
        chunkId: readString(record['chunkId']) ?? inherited.chunkId,
        sourceBlockIds: readStringArray(record['sourceBlockIds'] ?? record['blockIds']).length
            ? readStringArray(record['sourceBlockIds'] ?? record['blockIds'])
            : inherited.sourceBlockIds,
        summary:
            readString(record['summary'] ?? record['altText'] ?? record['markdown'] ?? record['text'])?.slice(
                0,
                1000
            ) ?? inherited.summary
    }
    const relativePath = readString(record['filePath'])
    if (relativePath && isSafeRelativePath(relativePath)) {
        if (record['type'] === 'image' && isSupportedImagePath(relativePath)) {
            output.push({
                visualAssetId: createHash('sha256').update(relativePath).digest('hex').slice(0, 24),
                ...(context.page ? { page: context.page } : {}),
                order: readPositiveInteger(record['order']) ?? output.length,
                sourceBlockIds: context.sourceBlockIds,
                ...(context.chunkId ? { chunkId: context.chunkId } : {}),
                ...(context.summary ? { summary: context.summary } : {}),
                locator: { kind: 'legacy', relativePath }
            })
        } else if (isJsonSidecar(record, relativePath)) {
            sidecarPaths.add(relativePath)
        }
    }
    for (const child of Object.values(record)) {
        collectLegacyAssets(child, context, output, sidecarPaths, depth + 1)
    }
}

function rankVisualAssets(
    assets: CatalogAsset[],
    anchors: KnowledgeDocumentVisualCandidateRequest['textAnchors'],
    query: string
) {
    const hasTextHits = anchors.length > 0
    const queryTerms = searchTerms(query)
    return assets
        .map((asset, index) => {
            const sameBlockAnchor = anchors.find((anchor) =>
                anchor.sourceBlockIds?.some((blockId) => asset.sourceBlockIds.includes(blockId))
            )
            const sameChunkAnchor = anchors.find(
                (anchor) => anchor.chunkId && asset.chunkId && anchor.chunkId === asset.chunkId
            )
            const samePageAnchor = anchors.find((anchor) => anchor.page && asset.page === anchor.page)
            const adjacentPageAnchor = anchors.find(
                (anchor) => anchor.page && asset.page && Math.abs(asset.page - anchor.page) === 1
            )
            const summaryScore = countTermMatches(asset.summary, queryTerms)
            let score = 0
            let reason: KnowledgeDocumentVisualCandidateReason = 'visual_only_fallback'
            let chunkId = asset.chunkId
            if (sameBlockAnchor) {
                score = 600
                reason = 'same_block'
                chunkId ??= sameBlockAnchor.chunkId
            } else if (sameChunkAnchor) {
                score = 500
                reason = 'same_chunk'
                chunkId ??= sameChunkAnchor.chunkId
            } else if (samePageAnchor) {
                score = 400
                reason = 'same_page'
            } else if (adjacentPageAnchor) {
                score = 300
                reason = 'adjacent_page'
                chunkId ??= adjacentPageAnchor.chunkId
            } else if (summaryScore > 0) {
                score = 200 + summaryScore
                reason = 'visual_summary_match'
            } else if (hasTextHits) {
                score = 10
                reason = 'visual_summary_match'
            }
            return { asset, reason, score, index, chunkId }
        })
        .sort(
            (left, right) =>
                right.score - left.score ||
                (left.asset.page ?? 1_000_000) - (right.asset.page ?? 1_000_000) ||
                left.asset.order - right.asset.order ||
                left.index - right.index
        )
}

function requireExecutionBinding(scope: AgentMiddlewareRuntimeScope): RequiredExecutionBinding {
    const tenantId = readString(scope.tenantId)
    const userId = readString(scope.userId)
    const xpertId = readString(scope.xpertId)
    const conversationId = readString(scope.conversationId)
    const agentKey = readString(scope.agentKey)
    const executionId = readString(scope.executionId)
    if (!tenantId || !userId || !xpertId || !conversationId || !agentKey || !executionId) {
        throw new ForbiddenException('A complete Agent execution scope is required for KnowledgeDocument images')
    }
    return {
        tenantId,
        organizationId: readString(scope.organizationId) ?? null,
        userId,
        xpertId,
        conversationId,
        agentKey,
        executionId
    }
}

function invocationScope(scope: AgentMiddlewareRuntimeScope): AgentMiddlewareRuntimeScope {
    const configurable = AsyncLocalStorageProviderSingleton.getRunnableConfig()?.configurable
    return {
        ...scope,
        tenantId: readString(configurable?.tenantId) ?? scope.tenantId,
        organizationId: readString(configurable?.organizationId) ?? scope.organizationId,
        userId: readString(configurable?.userId) ?? scope.userId,
        xpertId: readString(configurable?.xpertId) ?? scope.xpertId,
        conversationId:
            readString(configurable?.conversationId) ??
            readString(configurable?.conversation_id) ??
            readString(scope.conversationId) ??
            readString(configurable?.thread_id),
        agentKey: readString(configurable?.agentKey) ?? scope.agentKey,
        executionId: readString(configurable?.executionId) ?? scope.executionId
    }
}

function assertBindingMatches(expected: RequiredExecutionBinding, actual: RequiredExecutionBinding) {
    if (
        expected.tenantId !== actual.tenantId ||
        expected.organizationId !== actual.organizationId ||
        expected.userId !== actual.userId ||
        expected.xpertId !== actual.xpertId ||
        expected.conversationId !== actual.conversationId ||
        expected.agentKey !== actual.agentKey ||
        expected.executionId !== actual.executionId
    ) {
        throw new ForbiddenException('The visual asset reference does not belong to this Agent execution')
    }
}

function documentFingerprint(document: KnowledgeDocument) {
    const snapshot = document.metadata?.analysisSnapshot
    return createHash('sha256')
        .update(
            [
                document.id,
                document.knowledgebaseId ?? '',
                snapshot?.transformFingerprint ?? 'legacy',
                document.sourceHash ?? '',
                document.processingHash ?? '',
                document.contentHash ?? '',
                String(document.version ?? '')
            ].join(':')
        )
        .digest('hex')
}

async function readAndPrepareImage(absolutePath: string) {
    const stat = await fsPromises.stat(absolutePath).catch(() => null)
    if (!stat?.isFile() || stat.size > MAX_IMAGE_INPUT_BYTES) {
        throw new BadRequestException('The KnowledgeDocument image is missing or too large')
    }
    const input = await fsPromises.readFile(absolutePath)
    let pipeline = sharp(input, { animated: false, failOn: 'error' }).rotate()
    const metadata = await pipeline.metadata().catch(() => null)
    if (!metadata?.format || !['png', 'jpeg', 'webp', 'tiff'].includes(metadata.format)) {
        throw new BadRequestException('The KnowledgeDocument asset is not a supported PNG, JPEG, WebP or TIFF image')
    }
    let mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
    if (metadata.format === 'jpeg') mimeType = 'image/jpeg'
    else if (metadata.format === 'webp') mimeType = 'image/webp'
    else mimeType = 'image/png'

    if (metadata.format === 'tiff') pipeline = pipeline.png()
    const buffer = await pipeline.toBuffer()
    if (buffer.length > MAX_IMAGE_OUTPUT_BYTES) {
        throw new BadRequestException('The KnowledgeDocument image is too large for model inspection')
    }
    const outputMetadata = await sharp(buffer, { animated: false, failOn: 'error' }).metadata()
    if (!outputMetadata.width || !outputMetadata.height) {
        throw new BadRequestException('The KnowledgeDocument image dimensions could not be determined')
    }
    return {
        buffer,
        mimeType,
        width: outputMetadata.width,
        height: outputMetadata.height,
        sha256: createHash('sha256').update(buffer).digest('hex')
    }
}

function extensionForMimeType(mimeType: KnowledgeDocumentViewedImage['mimeType']) {
    if (mimeType === 'image/jpeg') return 'jpg'
    if (mimeType === 'image/webp') return 'webp'
    return 'png'
}

function knowledgeDocumentImageTitle(image: KnowledgeDocumentViewedImage) {
    return image.page ? `KnowledgeDocument image page ${image.page}` : `KnowledgeDocument image ${image.index}`
}

function toPublicCandidate(record: AllowedVisualPathRecord): KnowledgeDocumentVisualCandidate {
    return {
        filePath: record.filePath,
        knowledgeDocumentId: record.knowledgeDocumentId,
        sourceDocumentId: record.sourceDocumentId,
        ...(record.page ? { page: record.page } : {}),
        ...(record.chunkId ? { chunkId: record.chunkId } : {}),
        sourceBlockIds: record.sourceBlockIds,
        visualAssetId: record.visualAssetId,
        candidateReason: record.candidateReason,
        ...(record.summary ? { summary: record.summary } : {})
    }
}

function stripImageBytes(image: KnowledgeDocumentVisualImagePayload): KnowledgeDocumentViewedImage {
    return Object.fromEntries(
        Object.entries(image).filter(([key]) => key !== 'dataBase64')
    ) as KnowledgeDocumentViewedImage
}

function searchTerms(value: string) {
    return [
        ...new Set(
            value
                .toLowerCase()
                .split(/[^\p{L}\p{N}_-]+/u)
                .filter((term) => term.length >= 2)
        )
    ].slice(0, 40)
}

function countTermMatches(value: string | undefined, terms: string[]) {
    if (!value || !terms.length) return 0
    const normalized = value.toLowerCase()
    return terms.filter((term) => normalized.includes(term)).length
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStringArray(value: unknown) {
    return Array.isArray(value)
        ? value
              .map(readString)
              .filter((item): item is string => Boolean(item))
              .slice(0, 100)
        : []
}

function readPositiveInteger(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function isJsonSidecar(record: Record<string, unknown>, relativePath: string) {
    return (
        path.extname(relativePath).toLowerCase() === '.json' &&
        (record['type'] === 'file' || 'sourceMapAsset' in record || 'analysisAsset' in record)
    )
}

function isSupportedImagePath(relativePath: string) {
    return ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'].includes(
        path.extname(relativePath).toLowerCase()
    )
}

function isSafeRelativePath(value: string) {
    const normalized = value.replace(/\\/g, '/')
    return Boolean(normalized) && !path.posix.isAbsolute(normalized) && !normalized.split('/').includes('..')
}

function controlledVisualPath(knowledgeDocumentId: string, sourceDocumentId: string, visualAssetId: string) {
    return [
        'knowledge-documents',
        encodeURIComponent(knowledgeDocumentId),
        'sources',
        encodeURIComponent(sourceDocumentId),
        'visual-assets',
        encodeURIComponent(visualAssetId)
    ].join('/')
}

function isControlledVisualPath(value: string) {
    return isSafeRelativePath(value) && /^knowledge-documents\/[^/]+\/sources\/[^/]+\/visual-assets\/[^/]+$/.test(value)
}

function batchCacheKey(batchRef: string) {
    return `knowledge-document-visual-assets:batch:${batchRef}`
}

function isExpired(value: string) {
    return Date.parse(value) <= Date.now()
}
