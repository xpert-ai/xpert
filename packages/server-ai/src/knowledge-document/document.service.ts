import fsPromises from 'node:fs/promises'
import path from 'node:path'
import {
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    IKnowledgeDocumentPage,
    IKnowledgebase,
    KnowledgeDocumentLastIncrementalSync,
    KBDocumentStatusEnum,
    KDocumentSourceType,
    KnowledgeStructureEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext, StorageFileService, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import {
    BadRequestException,
    ConflictException,
    forwardRef,
    Inject,
    Injectable,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectQueue } from '@nestjs/bull'
import {
    ChunkMetadata,
    DocumentSourceRegistry,
    mergeParentChildChunks,
    TextSplitterRegistry
} from '@xpert-ai/plugin-sdk'
import { Queue } from 'bull'
import { Document } from 'langchain/document'
import { compact, uniq } from 'lodash-es'
import { DataSource, DeepPartial, FindOptionsWhere, In, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { KnowledgebaseService, KnowledgeDocumentStore, TVectorSearchParams } from '../knowledgebase'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeWorkAreaResolver, LoadStorageFileCommand } from '../shared'
import { KnowledgeDocumentPage } from '../core/entities/internal'
import { KnowledgeDocumentChunkService } from './chunk/chunk.service'
import { KnowledgeGraphClearDocumentCommand } from '../graphrag/commands'
import { resolveKnowledgeDocumentParserConfig } from './parser-config'
import {
    computeKnowledgeDocumentChunkHash,
    computeKnowledgeDocumentContentHash,
    computeKnowledgeDocumentProcessingHash,
    resolveKnowledgeDocumentSourceKey,
    resolveKnowledgeDocumentSourceHash
} from './document-hash'
import { TDocChunkMetadata } from './types'

type OriginalFileDownloadTarget = {
    absolutePath: string
    fileName: string
    mimeType: string
}

type IncrementalChunkOperation = 'unchanged' | 'changed' | 'added'

type IncrementalChunkMatch = {
    operation: IncrementalChunkOperation
    incoming: IKnowledgeDocumentChunk<TDocChunkMetadata>
    chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>
    previous?: IKnowledgeDocumentChunk<TDocChunkMetadata>
}

type VersionedKnowledgeDocumentInput = {
    id?: string
    version?: number
}

type VersionedKnowledgeDocument = {
    id: string
    version: number
}

export type IncrementalDocumentSyncItemResult = {
    document: KnowledgeDocument
    shouldProcess: boolean
    action: 'created' | 'updated' | 'skipped'
}

export type IncrementalChunkSyncResult = {
    chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    embeddingChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    removedChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    contentHash: string
    contentChanged: boolean
    statistics: Omit<KnowledgeDocumentLastIncrementalSync, 'mode' | 'embeddingTokens' | 'processedAt'>
}

export type IncrementalDocumentSyncResult = {
    documents: KnowledgeDocument[]
    processableIds: string[]
    skippedIds: string[]
    updatedIds: string[]
    createdIds: string[]
}

export type OriginalFileDownload = OriginalFileDownloadTarget & {
    content: Buffer
}

function isCountableDocument(document: Pick<IKnowledgeDocument, 'sourceType' | 'metadata'> | null | undefined) {
    if (!document || document.sourceType === KDocumentSourceType.FOLDER) {
        return false
    }

    if (!document.metadata || typeof document.metadata !== 'object') {
        return true
    }

    return !('systemManaged' in document.metadata) || document.metadata.systemManaged !== true
}

function isSystemManagedDocument(document: Pick<IKnowledgeDocument, 'metadata'> | null | undefined) {
    if (!document?.metadata || typeof document.metadata !== 'object') {
        return false
    }

    return 'systemManaged' in document.metadata && document.metadata.systemManaged === true
}

function getChunkMetadata(chunk: Pick<IKnowledgeDocumentChunk<TDocChunkMetadata>, 'metadata'> | null | undefined) {
    return chunk?.metadata ?? ({} as TDocChunkMetadata)
}

function getChunkLogicalId(chunk: Pick<IKnowledgeDocumentChunk<TDocChunkMetadata>, 'id' | 'metadata'>) {
    return getChunkMetadata(chunk).chunkId || chunk.id
}

function getChunkMatchType(chunk: Pick<IKnowledgeDocumentChunk<TDocChunkMetadata>, 'metadata'>) {
    const metadata = getChunkMetadata(chunk)
    return `${metadata.mediaType ?? 'text'}:${metadata.type ?? ''}:${metadata.source ?? ''}`
}

function popFirstAvailable(
    map: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>,
    key: string,
    usedIds: Set<string>
) {
    const matches = map.get(key)
    if (!matches?.length) {
        return null
    }

    while (matches.length) {
        const match = matches.shift()
        if (match?.id && !usedIds.has(match.id)) {
            return match
        }
    }

    return null
}

function assertExpectedVersion(version: number | null | undefined): asserts version is number {
    if (!Number.isInteger(version) || version <= 0) {
        throw new BadRequestException('version is required')
    }
}

function getChunkStoredId(chunk: Pick<IKnowledgeDocumentChunk<TDocChunkMetadata>, 'id' | 'metadata'>) {
    return getChunkMetadata(chunk).chunkId || chunk.id
}

function canSkipProcessedDocument(
    document: Pick<IKnowledgeDocument, 'processingHash' | 'contentHash' | 'status'>,
    processingHash: string
) {
    return (
        document.status === KBDocumentStatusEnum.FINISH &&
        document.processingHash === processingHash &&
        !!document.contentHash
    )
}

function getUniqueFileName(fileName: string, usedFileNames: Set<string>) {
    if (!usedFileNames.has(fileName)) {
        usedFileNames.add(fileName)
        return fileName
    }

    const extensionStart = fileName.lastIndexOf('.')
    const hasExtension = extensionStart > 0
    const baseName = hasExtension ? fileName.slice(0, extensionStart) : fileName
    const extension = hasExtension ? fileName.slice(extensionStart) : ''
    let index = 2
    let nextName = `${baseName} (${index})${extension}`

    while (usedFileNames.has(nextName)) {
        index += 1
        nextName = `${baseName} (${index})${extension}`
    }

    usedFileNames.add(nextName)
    return nextName
}

@Injectable()
export class KnowledgeDocumentService extends TenantOrganizationAwareCrudService<KnowledgeDocument> {
    readonly #logger = new Logger(KnowledgeDocumentService.name)

    @InjectRepository(KnowledgeDocumentPage)
    private readonly pageRepository: Repository<KnowledgeDocumentPage>

    @Inject(DocumentSourceRegistry)
    private readonly docSourceRegistry: DocumentSourceRegistry

    @Inject(TextSplitterRegistry)
    private readonly textSplitterRegistry: TextSplitterRegistry

    @Inject(KnowledgeDocumentChunkService)
    private readonly chunkService: KnowledgeDocumentChunkService

    constructor(
        @InjectRepository(KnowledgeDocument)
        readonly repo: Repository<KnowledgeDocument>,

        private readonly dataSource: DataSource,

        private readonly storageFileService: StorageFileService,

        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver,

        @Inject(forwardRef(() => KnowledgebaseService))
        private readonly knowledgebaseService: KnowledgebaseService,

        private readonly commandBus: CommandBus,
        @InjectQueue('embedding-document') private docQueue: Queue
    ) {
        super(repo)
    }

    async findAncestors(id: string) {
        const treeRepo = this.dataSource.getTreeRepository(KnowledgeDocument)
        const entity = await treeRepo.findOneBy({ id })
        const parents = await treeRepo.findAncestors(entity, { depth: 5 })
        return parents
    }

    async getOriginalFileDownload(id: string) {
        const document = await this.findOne(id)
        const target = await this.getOriginalFileDownloadTarget(document, new Set(), new Set())
        if (!target) {
            throw new BadRequestException('Original file is not available for this knowledge document')
        }

        return {
            ...target,
            content: await this.readOriginalFileContent(target)
        }
    }

    async getOriginalFileDownloadTargets(ids: string[]) {
        const uniqueIds = uniq((ids ?? []).filter((id) => typeof id === 'string' && !!id.trim()).map((id) => id.trim()))
        if (!uniqueIds.length) {
            return []
        }

        const { items } = await this.findAll({
            where: {
                id: In(uniqueIds)
            }
        })

        const usedFileNames = new Set<string>()
        const usedFilePaths = new Set<string>()
        const targets: OriginalFileDownloadTarget[] = []

        for (const document of items) {
            const target = await this.getOriginalFileDownloadTarget(document, usedFileNames, usedFilePaths)
            if (target) {
                targets.push(target)
            }
        }

        return targets
    }

    async getOriginalFileDownloads(ids: string[]): Promise<OriginalFileDownload[]> {
        const targets = await this.getOriginalFileDownloadTargets(ids)
        return Promise.all(
            targets.map(async (target) => ({
                ...target,
                content: await this.readOriginalFileContent(target)
            }))
        )
    }

    private async getOriginalFileDownloadTarget(
        document: IKnowledgeDocument,
        usedFileNames: Set<string>,
        usedFilePaths: Set<string>
    ): Promise<OriginalFileDownloadTarget | null> {
        if (!document || document.sourceType === KDocumentSourceType.FOLDER || isSystemManagedDocument(document)) {
            return null
        }

        return await this.resolveOriginalWorkspaceFileTarget(document, usedFileNames, usedFilePaths)
    }

    private async resolveOriginalWorkspaceFileTarget(
        document: IKnowledgeDocument,
        usedFileNames: Set<string>,
        usedFilePaths: Set<string>
    ): Promise<OriginalFileDownloadTarget | null> {
        const filePath = typeof document.filePath === 'string' ? document.filePath.trim() : ''
        if (!filePath || !document.knowledgebaseId) {
            return null
        }

        const fileIdentity = `workspace:${document.knowledgebaseId}:${filePath}`
        if (usedFilePaths.has(fileIdentity)) {
            return null
        }

        const workArea = await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId: document.knowledgebaseId
        })
        usedFilePaths.add(fileIdentity)

        return {
            absolutePath: workArea.volume.path(filePath),
            fileName: getUniqueFileName(
                document.name || path.basename(filePath) || `${document.id}.download`,
                usedFileNames
            ),
            mimeType: document.mimeType || 'application/octet-stream'
        }
    }

    private async readOriginalFileContent(target: OriginalFileDownloadTarget) {
        return await fsPromises.readFile(target.absolutePath)
    }

    /**
     */
    async createDocument(document: Partial<IKnowledgeDocument>): Promise<KnowledgeDocument> {
        // Complete file type
        if (!document.type) {
            if (document.storageFileId) {
                const storageFile = await this.storageFileService.findOne(document.storageFileId)
                const fileType = storageFile.originalName.split('.').pop()
                document.type = fileType
            } else if (document.options?.url) {
                document.type = 'html'
            }
        }
        document.parserConfig = resolveKnowledgeDocumentParserConfig(document)
        document.sourceHash ??= resolveKnowledgeDocumentSourceHash(document)
        document.sourceKey ??= resolveKnowledgeDocumentSourceKey(document)
        document.processingHash ??= computeKnowledgeDocumentProcessingHash(document)

        const doc = await this.create({
            ...document
        })
        // Init folder path for document entity
        const parents = await this.findAncestors(doc.id)
        const folder = parents.map((i) => (i.sourceType === KDocumentSourceType.FOLDER ? i.name : i.id)).join('/')
        doc.folder = folder
        await this.repository.save(doc)

        return doc
    }

    async createDocumentWithIncrementalSync(
        document: Partial<IKnowledgeDocument>
    ): Promise<IncrementalDocumentSyncItemResult> {
        document.parserConfig = resolveKnowledgeDocumentParserConfig(document)
        document.sourceHash ??= resolveKnowledgeDocumentSourceHash(document)
        document.sourceKey ??= resolveKnowledgeDocumentSourceKey(document)
        if (!(await this.isKnowledgebaseIncrementalSyncEnabled(document.knowledgebaseId))) {
            return {
                document: await this.createDocument(document),
                shouldProcess: true,
                action: 'created'
            }
        }
        return this.createOrReuseSourceDocument(document)
    }

    /**
     * Create documents in bulk.
     *
     * @param documents
     * @returns
     */
    async createBulkWithIncrementalSync(
        documents: Partial<IKnowledgeDocument>[]
    ): Promise<IncrementalDocumentSyncResult> {
        if (!documents?.length) {
            return {
                documents: [],
                processableIds: [],
                skippedIds: [],
                updatedIds: [],
                createdIds: []
            }
        }
        documents.forEach((document) => {
            document.parserConfig = resolveKnowledgeDocumentParserConfig(document)
            document.sourceHash ??= resolveKnowledgeDocumentSourceHash(document)
            document.sourceKey ??= resolveKnowledgeDocumentSourceKey(document)
        })
        const knowledgebaseIds = uniq(compact(documents.map((document) => document.knowledgebaseId)))
        await Promise.all(
            knowledgebaseIds.map((knowledgebaseId) => this.knowledgebaseService.assertNotRebuilding(knowledgebaseId))
        )
        const incrementalSyncByKnowledgebaseId = await this.getIncrementalSyncEnabledByKnowledgebaseId(knowledgebaseIds)

        // Update chunkStructure
        const textSplitterType = documents[0].parserConfig?.textSplitterType
        if (textSplitterType) {
            const textSplitterStrategy = this.textSplitterRegistry.get(textSplitterType)
            if (textSplitterStrategy) {
                const structure = textSplitterStrategy.structure
                const knowledgebase = await this.knowledgebaseService.findOneByIdString(documents[0].knowledgebaseId)
                if (knowledgebase.structure && knowledgebase.structure !== structure) {
                    throw new BadRequestException(
                        `Inconsistent chunk structure between knowledgebase (${knowledgebase.structure}) and document (${structure})`
                    )
                }
                if (!knowledgebase.structure) {
                    await this.knowledgebaseService.update(knowledgebase.id, { structure })
                }
            }
        }

        const result: IncrementalDocumentSyncResult = {
            documents: [],
            processableIds: [],
            skippedIds: [],
            updatedIds: [],
            createdIds: []
        }

        for await (const document of documents) {
            const incrementalSyncEnabled = document.knowledgebaseId
                ? incrementalSyncByKnowledgebaseId.get(document.knowledgebaseId) === true
                : false
            const synced = incrementalSyncEnabled
                ? await this.createOrReuseSourceDocument(document)
                : {
                      document: await this.createDocument(document),
                      shouldProcess: true,
                      action: 'created' as const
                  }
            result.documents.push(synced.document)
            if (synced.shouldProcess) {
                result.processableIds.push(synced.document.id)
            }
            if (synced.action === 'created') {
                result.createdIds.push(synced.document.id)
            } else if (synced.action === 'updated') {
                result.updatedIds.push(synced.document.id)
            } else {
                result.skippedIds.push(synced.document.id)
            }
        }

        return result
    }

    private async isKnowledgebaseIncrementalSyncEnabled(knowledgebaseId: string | null | undefined) {
        if (!knowledgebaseId) {
            return false
        }

        const knowledgebase = await this.knowledgebaseService.findOneByIdString(knowledgebaseId)
        return this.getKnowledgebaseIncrementalSyncEnabled(knowledgebase)
    }

    private async getIncrementalSyncEnabledByKnowledgebaseId(knowledgebaseIds: string[]) {
        const enabledById = new Map<string, boolean>()
        await Promise.all(
            knowledgebaseIds.map(async (knowledgebaseId) => {
                const knowledgebase = await this.knowledgebaseService.findOneByIdString(knowledgebaseId)
                enabledById.set(knowledgebaseId, this.getKnowledgebaseIncrementalSyncEnabled(knowledgebase))
            })
        )
        return enabledById
    }

    private getKnowledgebaseIncrementalSyncEnabled(
        knowledgebase: Pick<IKnowledgebase, 'incrementalSyncEnabled'> | null | undefined
    ) {
        return knowledgebase?.incrementalSyncEnabled === true
    }

    /**
     * Create documents in bulk.
     *
     * @param documents
     * @returns
     */
    async createBulk(documents: Partial<IKnowledgeDocument>[]): Promise<KnowledgeDocument[]> {
        return (await this.createBulkWithIncrementalSync(documents)).documents
    }

    private async createOrReuseSourceDocument(
        document: Partial<IKnowledgeDocument>
    ): Promise<IncrementalDocumentSyncItemResult> {
        const sourceKey = resolveKnowledgeDocumentSourceKey(document)
        const sourceHash = resolveKnowledgeDocumentSourceHash(document)
        document.sourceKey = sourceKey
        document.sourceHash = sourceHash

        const existing = await this.findExistingSourceDocument(document)
        if (!existing) {
            const created = await this.createDocument(document)
            return {
                document: created,
                shouldProcess: true,
                action: 'created'
            }
        }

        const processingHash = computeKnowledgeDocumentProcessingHash(document)
        if (canSkipProcessedDocument(existing, processingHash)) {
            return {
                document: existing,
                shouldProcess: false,
                action: 'skipped'
            }
        }

        const documentChanges = { ...document }
        delete documentChanges.id
        delete documentChanges.version
        const updated = await this.save({
            ...existing,
            ...documentChanges,
            id: existing.id,
            sourceKey,
            sourceHash,
            contentHash: existing.contentHash,
            processingHash,
            chunkNum: existing.chunkNum,
            tokenNum: existing.tokenNum
        } as DeepPartial<KnowledgeDocument>)

        return {
            document: updated,
            shouldProcess: true,
            action: 'updated'
        }
    }

    private async findExistingSourceDocument(document: Partial<IKnowledgeDocument>): Promise<KnowledgeDocument | null> {
        if (!document.knowledgebaseId) {
            return null
        }

        const sourceKey = resolveKnowledgeDocumentSourceKey(document)
        if (!sourceKey || !document.sourceType) {
            return null
        }

        const where: FindOptionsWhere<KnowledgeDocument> = {
            knowledgebaseId: document.knowledgebaseId,
            sourceType: document.sourceType,
            sourceKey
        }

        const { items } = await this.findAll({
            where,
            order: { updatedAt: 'DESC' },
            take: 1
        })

        return items[0] ?? null
    }

    async updateBulk(entities: Partial<IKnowledgeDocument>[]): Promise<void> {
        if (!entities?.length) {
            return
        }
        await Promise.all(entities.map((entity) => this.update(entity.id, entity)))
    }

    async updateBulkWithVersion(entities: Partial<IKnowledgeDocument>[]): Promise<void> {
        if (!entities?.length) {
            return
        }
        await this.assertBulkDocumentVersions(entities)
        await Promise.all(entities.map((entity) => this.updateWithVersion(entity.id, entity, entity.version)))
    }

    async deleteBulk(ids: string[]): Promise<void> {
        const { items } = await this.findAll({
            where: { id: In(ids) },
            select: { id: true, knowledgebaseId: true }
        })
        const knowledgebaseIds = uniq(compact(items.map((document) => document.knowledgebaseId)))
        await Promise.all(
            knowledgebaseIds.map((knowledgebaseId) => this.knowledgebaseService.assertNotRebuilding(knowledgebaseId))
        )
        for await (const id of ids) {
            await this.delete(id)
        }
    }

    async deleteBulkWithVersion(documents: { id?: string; version?: number }[]): Promise<void> {
        if (!documents?.length) {
            return
        }

        const versionedDocuments = await this.assertBulkDocumentVersions(documents)

        for await (const document of versionedDocuments) {
            await this.deleteWithVersion(document.id, document.version)
        }
    }

    private normalizeVersionedDocuments(documents: VersionedKnowledgeDocumentInput[]): VersionedKnowledgeDocument[] {
        return documents.map((document) => {
            if (!document.id) {
                throw new BadRequestException('id is required')
            }
            assertExpectedVersion(document.version)
            return {
                id: document.id,
                version: document.version
            }
        })
    }

    private async assertBulkDocumentVersions(
        documents: VersionedKnowledgeDocumentInput[]
    ): Promise<VersionedKnowledgeDocument[]> {
        const versionedDocuments = this.normalizeVersionedDocuments(documents)
        const ids = uniq(versionedDocuments.map((document) => document.id))
        const { items } = await this.findAll({
            where: { id: In(ids) },
            select: {
                id: true,
                version: true,
                knowledgebaseId: true
            }
        })
        const currentById = new Map(items.map((document) => [document.id, document]))

        for (const document of versionedDocuments) {
            const current = currentById.get(document.id)
            if (!current) {
                throw new NotFoundException(`Knowledge document "${document.id}" not found`)
            }
            if (current.version !== document.version) {
                throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
            }
        }

        const knowledgebaseIds = uniq(compact(items.map((document) => document.knowledgebaseId)))
        await Promise.all(
            knowledgebaseIds.map((knowledgebaseId) => this.knowledgebaseService.assertNotRebuilding(knowledgebaseId))
        )

        return versionedDocuments
    }

    async updateWithVersion(id: string, entity: Partial<IKnowledgeDocument>, expectedVersion?: number) {
        if (!id) {
            throw new BadRequestException('id is required')
        }
        assertExpectedVersion(expectedVersion)
        const current = await this.findOne(id, { select: { id: true, knowledgebaseId: true, version: true } })
        if (current.version !== expectedVersion) {
            throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
        }
        await this.knowledgebaseService.assertNotRebuilding(current.knowledgebaseId)

        const changes = { ...entity }
        delete changes.id
        delete changes.version
        const nextSourceHash = resolveKnowledgeDocumentSourceHash(changes)
        if (nextSourceHash) {
            changes.sourceHash = nextSourceHash
        }
        const patch = {
            ...changes,
            id,
            updatedById: RequestContext.currentUserId()
        } as QueryDeepPartialEntity<KnowledgeDocument>
        const result = await this.repository.update({ id, version: expectedVersion }, patch)
        if (!result.affected) {
            throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
        }
        return result
    }

    async save(document: DeepPartial<KnowledgeDocument>)
    async save(document: DeepPartial<KnowledgeDocument>[])
    async save(document) {
        return await this.repository.save(document)
    }

    /**
     * @deprecated use Chunks
     */
    async createPageBulk(documentId: string, pages: Partial<IKnowledgeDocumentPage<ChunkMetadata>>[]) {
        return await this.pageRepository.save(pages.map((page) => ({ ...page, documentId })))
    }

    /**
     * @deprecated use Chunks
     */
    async deletePage(documentId: string, id: string) {
        const document = await this.findOne(documentId, {
            relations: ['pages', 'knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
        })
        await this.knowledgebaseService.assertNotRebuilding(document.knowledgebaseId)
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase)
        await vectorStore.delete({ filter: { docPageId: id, knowledgeId: documentId } })

        document.pages = document.pages.filter((_) => _.id !== id)
        await this.save(document)
    }

    /**
     * Find all chunks of a document, filter by metadata
     *
     * @param id Document ID
     * @param params Vector Search Params
     * @returns
     */
    async getChunks(id: string, params: TVectorSearchParams) {
        if (!params.search) {
            const chunks = await this.chunkService.findAll({
                where: {
                    ...(params.filter ?? {}),
                    documentId: id
                },
                relations: ['document'],
                select: {
                    document: {
                        id: true,
                        name: true,
                        sourceType: true,
                        type: true,
                        category: true,
                        fileUrl: true
                    }
                },
                skip: params.skip,
                take: params.take
            })

            return chunks
        }
        const document = await this.findOne(id, {
            relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
        })
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase, true)

        if (document.knowledgebase.structure === KnowledgeStructureEnum.ParentChild && !params.search) {
            const pages = await this.pageRepository.find({
                where: { tenantId: document.tenantId, documentId: document.id },
                take: params.take,
                skip: params.skip,
                order: { createdAt: 'DESC' }
            })
            const pageTotal = await this.pageRepository.count({
                where: { tenantId: document.tenantId, documentId: document.id }
            })
            return {
                items: pages,
                total: pageTotal
            }
        } else {
            const result = await vectorStore.getChunks(id, params)
            const items = await this.attachStoredChunkState(
                result.items as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
            )
            const resultWithStoredChunkState = {
                ...result,
                items
            }
            // @todo
            if (document.knowledgebase.structure === KnowledgeStructureEnum.ParentChild) {
                const ids = uniq(compact(items.map((item) => item.metadata?.pageId).filter(Boolean) as string[]))
                if (ids.length) {
                    const pages = await this.pageRepository.find({
                        where: {
                            tenantId: document.tenantId,
                            documentId: document.id,
                            id: In(ids)
                        },
                        take: params.take,
                        skip: params.skip,
                        order: { createdAt: 'DESC' }
                    })
                    return {
                        items: mergeParentChildChunks(pages, items as Document<ChunkMetadata>[])
                    }
                }
            }

            return resultWithStoredChunkState
        }
    }

    private async attachStoredChunkState(chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]) {
        const ids = uniq(compact(chunks.map((chunk) => getChunkStoredId(chunk))))
        if (!ids.length) {
            return chunks
        }

        const { items } = await this.chunkService.findAll({
            where: { id: In(ids) },
            select: {
                id: true,
                version: true,
                contentHash: true
            }
        })
        const storedById = new Map(items.map((chunk) => [chunk.id, chunk]))

        return chunks.map((chunk) => {
            const storedId = getChunkStoredId(chunk)
            const stored = storedId ? storedById.get(storedId) : null
            if (!stored) {
                return chunk
            }

            return {
                ...chunk,
                id: stored.id,
                version: stored.version,
                contentHash: stored.contentHash
            }
        })
    }

    /**
     * Create a chunk in document.
     *
     * @param id Document ID
     * @param entity Chunk entity
     */
    async createChunk(id: string, entity: IKnowledgeDocumentChunk) {
        const { vectorStore, document } = await this.getDocumentVectorStore(id)
        const metadata = {
            ...(entity.metadata ?? {})
        } as TDocChunkMetadata
        const contentHash = computeKnowledgeDocumentChunkHash({
            pageContent: entity.pageContent,
            metadata
        } as IKnowledgeDocumentChunk<TDocChunkMetadata>)
        const chunk = await this.chunkService.create({
            ...entity,
            documentId: id,
            knowledgebaseId: document.knowledgebaseId,
            metadata,
            contentHash
        })
        await vectorStore.addKnowledgeDocument(document, [chunk])
        await this.refreshDocumentContentHash(id)
        return chunk
    }

    /**
     * Update a chunk in document.
     *
     * @param documentId Document ID
     * @param id Chunk ID
     * @param entity Chunk entity
     * @returns
     */
    async updateChunk(documentId: string, id: string, entity: IKnowledgeDocumentChunk) {
        try {
            const { vectorStore, document } = await this.getDocumentVectorStore(documentId)
            const chunk = await this.mergeChunkUpdate(id, entity)
            await this.chunkService.update(id, chunk)
            const result = await vectorStore.updateChunk(
                id,
                {
                    metadata: chunk.metadata,
                    pageContent: chunk.pageContent
                },
                document
            )
            await this.refreshDocumentContentHash(documentId)
            return result
        } catch (err) {
            throw new BadRequestException(err.message)
        }
    }

    async updateChunkWithVersion(documentId: string, id: string, entity: IKnowledgeDocumentChunk) {
        const expectedVersion = entity.version
        assertExpectedVersion(expectedVersion)
        const { vectorStore, document } = await this.getDocumentVectorStore(documentId)
        const chunk = await this.mergeChunkUpdate(id, entity)
        await this.chunkService.updateWithVersion(id, chunk, expectedVersion)
        const result = await vectorStore.updateChunk(
            id,
            {
                metadata: chunk.metadata,
                pageContent: chunk.pageContent
            },
            document
        )
        await this.refreshDocumentContentHash(documentId)
        return result
    }

    /**
     * Delete chunk by id in document.
     *
     * @param documentId Document ID
     * @param id Chunk ID
     * @returns
     */
    async deleteChunk(documentId: string, id: string) {
        const { vectorStore } = await this.getDocumentVectorStore(documentId)
        // Delete entity
        await this.chunkService.delete(id)
        // Delete vector
        await vectorStore.deleteChunk(id)
        await this.refreshDocumentContentHash(documentId)
    }

    async deleteChunkWithVersion(documentId: string, id: string, expectedVersion?: number) {
        assertExpectedVersion(expectedVersion)
        const { vectorStore } = await this.getDocumentVectorStore(documentId)
        await this.chunkService.deleteWithVersion(id, expectedVersion)
        await vectorStore.deleteChunk(id)
        await this.refreshDocumentContentHash(documentId)
    }

    private async mergeChunkUpdate(id: string, entity: Partial<IKnowledgeDocumentChunk>) {
        const current = await this.chunkService.findOne(id)
        const metadata = {
            ...(current.metadata ?? {}),
            ...(entity.metadata ?? {})
        } as TDocChunkMetadata
        const pageContent = entity.pageContent ?? current.pageContent
        const merged = {
            ...current,
            ...entity,
            id,
            pageContent,
            metadata
        } as IKnowledgeDocumentChunk<TDocChunkMetadata>
        merged.contentHash = computeKnowledgeDocumentChunkHash(merged)
        return merged
    }

    private async refreshDocumentContentHash(documentId: string) {
        const { items } = await this.chunkService.findAll({
            where: { documentId },
            order: { createdAt: 'ASC' }
        })
        const chunks = items.map((chunk) => ({
            ...chunk,
            contentHash: chunk.contentHash ?? computeKnowledgeDocumentChunkHash(chunk)
        }))
        await this.update(documentId, {
            contentHash: computeKnowledgeDocumentContentHash(chunks),
            chunkNum: chunks.length
        })
    }

    /**
     * Cover chunks of a document. record tokens of each chunk.
     */
    async coverChunks(document: IKnowledgeDocument, vectorStore: KnowledgeDocumentStore) {
        await this.chunkService.deleteByDocumentId(document.id)
        return await this.chunkService.upsertBulk(
            document.chunks.map((_) => {
                return {
                    ..._,
                    documentId: document.id,
                    knowledgebaseId: document.knowledgebaseId
                } as IKnowledgeDocumentChunk
            })
        )
    }

    async syncChunksIncrementally(
        document: IKnowledgeDocument,
        vectorStore: KnowledgeDocumentStore
    ): Promise<IncrementalChunkSyncResult> {
        const incomingChunks = this.prepareIncomingChunks(document.chunks ?? [])
        const contentHash = computeKnowledgeDocumentContentHash(incomingChunks)
        const { items: existingChunks } = await this.chunkService.findAll({
            where: { documentId: document.id },
            relations: ['parent'],
            order: { createdAt: 'ASC' }
        })

        if (document.contentHash && document.contentHash === contentHash) {
            return {
                chunks: existingChunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[],
                embeddingChunks: [],
                removedChunks: [],
                contentHash,
                contentChanged: false,
                statistics: {
                    total: incomingChunks.length,
                    skipped: incomingChunks.length,
                    added: 0,
                    updated: 0,
                    deleted: 0
                }
            }
        }

        const matches = this.matchIncrementalChunks(
            incomingChunks,
            existingChunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
        )
        const skippedCount = matches.filter((match) => match.operation === 'unchanged').length
        const addedCount = matches.filter((match) => match.operation === 'added').length
        const updatedCount = matches.filter((match) => match.operation === 'changed').length
        const chunksToPersist = matches.map((match) => ({
            ...match.chunk,
            documentId: document.id,
            knowledgebaseId: document.knowledgebaseId
        }))
        const changedIds = matches
            .filter((match) => match.operation === 'changed' && match.chunk.id)
            .map((match) => match.chunk.id)
            .filter((id): id is string => !!id)
        const usedIds = new Set(matches.map((match) => match.previous?.id).filter((id): id is string => !!id))
        const removedChunks = existingChunks.filter(
            (chunk) => chunk.id && !usedIds.has(chunk.id)
        ) as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
        const removedIds = removedChunks.map((chunk) => chunk.id).filter((id): id is string => !!id)

        await vectorStore.deleteChunks([...removedIds, ...changedIds])

        const savedChunks = (await this.chunkService.upsertBulk(
            chunksToPersist
        )) as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
        if (removedIds.length) {
            await this.chunkService.delete({ id: In(removedIds) })
        }

        const changedChunkIds = new Set(
            matches
                .filter((match) => match.operation !== 'unchanged')
                .map((match) => getChunkLogicalId(match.chunk))
                .filter((id): id is string => !!id)
        )
        const changedRowIds = new Set(
            matches
                .filter((match) => match.operation !== 'unchanged')
                .map((match) => match.chunk.id)
                .filter((id): id is string => !!id)
        )
        const embeddingChunks = this.chunkService.findAllEmbeddingNodes(savedChunks).filter((chunk) => {
            const logicalId = getChunkLogicalId(chunk)
            return (logicalId && changedChunkIds.has(logicalId)) || (chunk.id && changedRowIds.has(chunk.id))
        }) as IKnowledgeDocumentChunk<TDocChunkMetadata>[]

        return {
            chunks: savedChunks,
            embeddingChunks,
            removedChunks,
            contentHash,
            contentChanged: true,
            statistics: {
                total: savedChunks.length,
                skipped: skippedCount,
                added: addedCount,
                updated: updatedCount,
                deleted: removedChunks.length
            }
        }
    }

    private prepareIncomingChunks(chunks: IKnowledgeDocumentChunk[]): IKnowledgeDocumentChunk<TDocChunkMetadata>[] {
        return chunks.map((chunk, index) => {
            const metadata = {
                ...(chunk.metadata ?? {}),
                chunkId: chunk.metadata?.chunkId || chunk.id || `chunk-${index}`
            } as TDocChunkMetadata
            const prepared = {
                ...chunk,
                metadata
            } as IKnowledgeDocumentChunk<TDocChunkMetadata>
            prepared.contentHash = computeKnowledgeDocumentChunkHash(prepared)
            return prepared
        })
    }

    private matchIncrementalChunks(
        incomingChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
        existingChunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    ): IncrementalChunkMatch[] {
        const exactMatches = new Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>()
        const positionMatches = new Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>()
        const incomingContentHashByChunkId = new Map<string, string>()
        const incomingParentIndexByChunkId = new Map<string, number | null>()
        const resolvedChunkIdByIncomingId = new Map<string, string>()
        const usedIds = new Set<string>()

        for (const chunk of incomingChunks) {
            const logicalId = getChunkLogicalId(chunk)
            if (logicalId && chunk.contentHash) {
                incomingContentHashByChunkId.set(logicalId, chunk.contentHash)
                incomingParentIndexByChunkId.set(logicalId, getChunkMetadata(chunk).chunkIndex ?? null)
            }
        }

        for (const chunk of existingChunks) {
            const exactKey = this.buildExactChunkMatchKey(chunk, (parentId) => {
                const parent = chunk.parent
                const parentLogicalId = parent ? getChunkLogicalId(parent) : null
                return parentLogicalId === parentId ? (parent?.contentHash ?? null) : null
            })
            const positionKey = this.buildPositionChunkMatchKey(chunk, (parentId) => {
                const parent = chunk.parent
                const parentLogicalId = parent ? getChunkLogicalId(parent) : null
                return parentLogicalId === parentId ? (getChunkMetadata(parent).chunkIndex ?? null) : null
            })
            this.pushChunkMatch(exactMatches, exactKey, chunk)
            this.pushChunkMatch(positionMatches, positionKey, chunk)
        }

        const matches = incomingChunks.map((incoming) => {
            const exactKey = this.buildExactChunkMatchKey(
                incoming,
                (parentId) => incomingContentHashByChunkId.get(parentId) ?? null
            )
            const exactMatch = popFirstAvailable(exactMatches, exactKey, usedIds)
            if (exactMatch?.id) {
                usedIds.add(exactMatch.id)
                const matchedChunk = this.mergeIncomingChunkWithExisting(incoming, exactMatch)
                const incomingLogicalId = getChunkLogicalId(incoming)
                const matchedLogicalId = getChunkLogicalId(matchedChunk)
                if (incomingLogicalId && matchedLogicalId) {
                    resolvedChunkIdByIncomingId.set(incomingLogicalId, matchedLogicalId)
                }
                return {
                    operation: 'unchanged' as const,
                    incoming,
                    chunk: matchedChunk,
                    previous: exactMatch
                }
            }

            const positionKey = this.buildPositionChunkMatchKey(
                incoming,
                (parentId) => incomingParentIndexByChunkId.get(parentId) ?? null
            )
            const positionMatch = popFirstAvailable(positionMatches, positionKey, usedIds)
            if (positionMatch?.id) {
                usedIds.add(positionMatch.id)
                const matchedChunk = this.mergeIncomingChunkWithExisting(incoming, positionMatch)
                const incomingLogicalId = getChunkLogicalId(incoming)
                const matchedLogicalId = getChunkLogicalId(matchedChunk)
                if (incomingLogicalId && matchedLogicalId) {
                    resolvedChunkIdByIncomingId.set(incomingLogicalId, matchedLogicalId)
                }
                return {
                    operation: 'changed' as const,
                    incoming,
                    chunk: matchedChunk,
                    previous: positionMatch
                }
            }

            const incomingLogicalId = getChunkLogicalId(incoming)
            if (incomingLogicalId) {
                resolvedChunkIdByIncomingId.set(incomingLogicalId, incomingLogicalId)
            }
            return {
                operation: 'added' as const,
                incoming,
                chunk: incoming
            }
        })

        return matches.map((match) => ({
            ...match,
            chunk: this.remapChunkParentId(match.chunk, resolvedChunkIdByIncomingId)
        }))
    }

    private pushChunkMatch(
        map: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>,
        key: string,
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>
    ) {
        const matches = map.get(key) ?? []
        matches.push(chunk)
        map.set(key, matches)
    }

    private buildExactChunkMatchKey(
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        resolveParentContentHash: (parentId: string) => string | null
    ) {
        const metadata = getChunkMetadata(chunk)
        const parentHash = metadata.parentId ? resolveParentContentHash(metadata.parentId) : null
        return [chunk.contentHash ?? '', getChunkMatchType(chunk), parentHash ?? ''].join('\u0000')
    }

    private buildPositionChunkMatchKey(
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        resolveParentIndex: (parentId: string) => number | null
    ) {
        const metadata = getChunkMetadata(chunk)
        const parentIndex = metadata.parentId ? resolveParentIndex(metadata.parentId) : null
        return [getChunkMatchType(chunk), parentIndex ?? 'root', metadata.chunkIndex ?? 'unknown'].join('\u0000')
    }

    private mergeIncomingChunkWithExisting(
        incoming: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        existing: IKnowledgeDocumentChunk<TDocChunkMetadata>
    ): IKnowledgeDocumentChunk<TDocChunkMetadata> {
        const incomingMetadata = getChunkMetadata(incoming)
        const existingLogicalId = getChunkLogicalId(existing)
        return {
            ...incoming,
            id: existing.id,
            metadata: {
                ...incomingMetadata,
                chunkId: existingLogicalId ?? incomingMetadata.chunkId
            },
            parent: existing.parent
        }
    }

    private remapChunkParentId(
        chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>,
        resolvedChunkIdByIncomingId: Map<string, string>
    ): IKnowledgeDocumentChunk<TDocChunkMetadata> {
        const parentId = getChunkMetadata(chunk).parentId
        if (!parentId) {
            return chunk
        }

        const resolvedParentId = resolvedChunkIdByIncomingId.get(parentId)
        if (!resolvedParentId || resolvedParentId === parentId) {
            return chunk
        }

        return {
            ...chunk,
            metadata: {
                ...getChunkMetadata(chunk),
                parentId: resolvedParentId
            }
        }
    }

    async findAllEmbeddingNodes(document: IKnowledgeDocument) {
        return this.chunkService.findAllEmbeddingNodes(document.chunks)
    }

    async updateChunkMetadataBulk(chunks: Pick<IKnowledgeDocumentChunk, 'id' | 'metadata'>[]) {
        return this.chunkService.updateMetadataBulk(chunks)
    }

    async getDocumentVectorStore(id: string) {
        const document = await this.findOne(id, {
            relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
        })
        await this.knowledgebaseService.assertNotRebuilding(document.knowledgebaseId)
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase)
        return { document, vectorStore }
    }

    async previewFile(id: string) {
        try {
            const docs = await this.commandBus.execute<LoadStorageFileCommand, Document[]>(
                new LoadStorageFileCommand(id)
            )
            // Limit the size of the data returned for preview
            return docs.map((doc) => ({
                ...doc,
                pageContent: doc.pageContent.length > 10000 ? doc.pageContent.slice(0, 10000) + ' ...' : doc.pageContent
            }))
        } catch (err) {
            throw new BadRequestException(err.message)
        }
    }

    /**
     * Start processing documents which is not in RUNNING status
     */
    async startProcessing(ids: string[], kbId?: string) {
        const userId = RequestContext.currentUserId()
        const where = kbId ? { knowledgebaseId: kbId, id: In(ids) } : { id: In(ids) }
        const { items } = await this.findAll({
            where
        })

        const docs = items.filter((doc) => doc.status !== KBDocumentStatusEnum.RUNNING)
        const knowledgebaseIds = uniq(compact(docs.map((doc) => doc.knowledgebaseId)))
        await Promise.all(
            knowledgebaseIds.map((knowledgebaseId) => this.knowledgebaseService.assertNotRebuilding(knowledgebaseId))
        )

        const job = await this.docQueue.add({
            userId,
            docs
        })

        docs.forEach((item) => {
            item.jobId = job.id as string
            item.status = KBDocumentStatusEnum.RUNNING
            item.processMsg = ''
            item.progress = 0
        })

        return await this.save(docs)
    }

    async deleteWithVersion(id: string, expectedVersion?: number) {
        assertExpectedVersion(expectedVersion)
        const document = await this.findOne(id, {
            relations: ['knowledgebase', 'knowledgebase.documents'],
            select: {
                id: true,
                version: true,
                knowledgebaseId: true,
                knowledgebase: {
                    id: true,
                    documentNum: true,
                    documents: { id: true, sourceType: true, metadata: true }
                }
            }
        })
        if (document.version !== expectedVersion) {
            throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
        }

        return await this.deleteResolvedDocument(document, expectedVersion)
    }

    async delete(id: string) {
        const document = await this.findOne(id, {
            relations: ['knowledgebase', 'knowledgebase.documents'],
            select: {
                id: true,
                version: true,
                knowledgebaseId: true,
                knowledgebase: {
                    id: true,
                    documentNum: true,
                    documents: { id: true, sourceType: true, metadata: true }
                }
            }
        })
        return await this.deleteResolvedDocument(document)
    }

    private async deleteResolvedDocument(document: KnowledgeDocument, expectedVersion?: number) {
        await this.knowledgebaseService.assertNotRebuilding(document.knowledgebaseId)
        if (expectedVersion) {
            const result = await this.repository.delete({ id: document.id, version: expectedVersion })
            if (!result.affected) {
                throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
            }
            await this.deleteDocumentArtifacts(document)
            return result
        }

        await this.deleteDocumentArtifacts(document)
        return await super.delete(document.id)
    }

    private async deleteDocumentArtifacts(document: KnowledgeDocument) {
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase, false)
        await vectorStore.deleteKnowledgeDocument(document)
        try {
            await this.commandBus.execute(
                new KnowledgeGraphClearDocumentCommand({
                    knowledgebaseId: document.knowledgebaseId,
                    documentId: document.id
                })
            )
        } catch (error) {
            this.#logger.warn(`Failed to clear GraphRAG data for document '${document.id}': ${getErrorMessage(error)}`)
        }

        const nextDocumentNum =
            document.knowledgebase.documents.filter(isCountableDocument).length -
            (isCountableDocument(document) ? 1 : 0)
        document.knowledgebase.documentNum = nextDocumentNum
        await this.knowledgebaseService.update(document.knowledgebaseId, {
            documentNum: document.knowledgebase.documentNum
        })
    }

    // Document source connection
    async connectDocumentSource(type: string, config: any) {
        const documentSource = this.docSourceRegistry.get(type)
        if (!documentSource) {
            throw new BadRequestException(`Document source '${type}' not found`)
        }

        try {
            const docs = await documentSource.test(config)

            return docs
        } catch (err) {
            this.#logger.error(`Failed to connect document source '${type}'`, err)
            throw new BadRequestException(`Failed to connect document source '${type}': ${err.message}`)
        }
    }
}
