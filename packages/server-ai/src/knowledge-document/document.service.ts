import {
    DocumentIngestion,
    type IncrementalDocumentSyncResult,
    type IncrementalDocumentSyncItemResult
} from './ingestion/document-ingestion'
import { tenantLibraryReadQuery } from './tenant-library-read'
import {
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    IKnowledgeDocumentPage,
    KnowledgeDocumentProcessingMode,
    KBDocumentStatusEnum
} from '@xpert-ai/contracts'
import { KnowledgeParserSettingsService } from '../knowledgebase/parser/parser-settings.service'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import {
    BadRequestException,
    ConflictException,
    forwardRef,
    Inject,
    Injectable,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectQueue } from '@nestjs/bull'
import { ChunkMetadata, DocumentSourceRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { Queue } from 'bull'
import { Document } from 'langchain/document'
import { t } from 'i18next'
import { compact, uniq } from 'lodash'
import {
    DataSource,
    DeepPartial,
    EntityManager,
    FindManyOptions,
    FindOneOptions,
    FindOptionsWhere,
    In,
    IsNull,
    Repository,
    SaveOptions
} from 'typeorm'
import { KnowledgebaseService } from '../knowledgebase/management/knowledgebase.service'
import type { KnowledgeDocumentStore, TVectorSearchParams } from '../knowledgebase/embedding/vector-store'
import { KnowledgeDocument } from './document.entity'
import { LoadStorageFileCommand } from '../shared/commands/load-storage-file.command'
import { KnowledgeWorkAreaResolver } from '../shared/volume/work-area'
import { KnowledgeDocumentPage } from '../core/entities/internal'
import { KnowledgeDocumentChunkService } from './chunk/chunk.service'
import { KnowledgeDerivedIndexPublicationService } from './derived-index-publication.service'
import {
    OriginalFileDownloadTarget,
    OriginalFileDownload,
    DocumentOriginalFiles
} from './files/document-original-files'
import { buildLogicalFolderPath } from './folders/logical-folder-path'
import { assertExpectedVersion } from './document-version'
import { IncrementalChunkSyncResult, IncrementalChunkSync } from './chunk/incremental-chunk-sync'
import { DocumentAccess } from './access/document-access'
import { DocumentEditing } from './folders/document-editing'
import { DocumentChunks } from './chunk/document-chunks'
import { DocumentDeletion } from './deletion/document-deletion'

type VersionedKnowledgeDocumentInput = {
    id?: string
    version?: number
}

type VersionedKnowledgeDocument = {
    id: string
    version: number
}

type ShallowKnowledgeDocumentUpdater = {
    update(id: string | undefined, entity: Partial<IKnowledgeDocument>): Promise<unknown>
}

@Injectable()
export class KnowledgeDocumentService extends TenantOrganizationAwareCrudService<KnowledgeDocument> {
    readonly #logger = new Logger(KnowledgeDocumentService.name)

    private readonly ingestion: DocumentIngestion
    private readonly access: DocumentAccess
    private readonly originalFiles: DocumentOriginalFiles
    private readonly editing: DocumentEditing
    private readonly chunks: DocumentChunks
    private readonly chunkSync: IncrementalChunkSync
    private readonly deletion: DocumentDeletion

    constructor(
        @InjectRepository(KnowledgeDocument)
        readonly repo: Repository<KnowledgeDocument>,

        private readonly dataSource: DataSource,

        knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver,

        @Inject(forwardRef(() => KnowledgebaseService))
        private readonly knowledgebaseService: KnowledgebaseService,

        private readonly commandBus: CommandBus,
        queryBus: QueryBus,
        @InjectQueue('embedding-document') private docQueue: Queue,
        derivedIndexPublicationService: KnowledgeDerivedIndexPublicationService,
        @InjectRepository(KnowledgeDocumentPage) private readonly pageRepository: Repository<KnowledgeDocumentPage>,
        @Inject(DocumentSourceRegistry) private readonly docSourceRegistry: DocumentSourceRegistry,
        parserSettings: KnowledgeParserSettingsService,
        chunkService: KnowledgeDocumentChunkService
    ) {
        super(repo)
        this.access = new DocumentAccess(this, knowledgebaseService, queryBus, knowledgeWorkAreaResolver)
        this.originalFiles = new DocumentOriginalFiles(this, knowledgeWorkAreaResolver)
        this.editing = new DocumentEditing(this, knowledgebaseService, parserSettings, dataSource, repo, chunkService)
        this.ingestion = new DocumentIngestion(
            this,
            repo,
            knowledgebaseService,
            parserSettings,
            queryBus,
            this.editing,
            (document) => this.writeToCurrentScope(document)
        )
        this.chunks = new DocumentChunks(
            this,
            chunkService,
            knowledgebaseService,
            pageRepository,
            derivedIndexPublicationService
        )
        this.chunkSync = new IncrementalChunkSync(chunkService)
        this.deletion = new DocumentDeletion(this, knowledgebaseService, commandBus, dataSource)
    }

    override async softRemove(
        _id: KnowledgeDocument['id'],
        _options?: FindOneOptions<KnowledgeDocument>,
        _saveOptions?: SaveOptions
    ): Promise<KnowledgeDocument> {
        throw new ConflictException(
            t('server-ai:Error.KnowledgeDocumentSoftDeleteUnavailable', {
                defaultValue: 'Document soft deletion is unavailable until derived-data cleanup is enabled'
            })
        )
    }

    override async findAll(filter?: FindManyOptions<KnowledgeDocument>) {
        const options = this.withReadableDocumentManyOptions(filter)
        const query = tenantLibraryReadQuery(this.repo, options)
        if (!query) return super.findAll(options)
        const [items, total] = await query.getManyAndCount()
        return { items, total }
    }

    override async findOne(
        id: string | number | FindOneOptions<KnowledgeDocument>,
        options?: FindOneOptions<KnowledgeDocument>
    ) {
        const filter = this.withReadableDocumentOneOptions(typeof id === 'object' ? id : options)
        if (typeof id !== 'object') {
            const where = filter.where
            filter.where = Array.isArray(where)
                ? where.map((item) => ({ ...item, id: String(id) }))
                : { ...where, id: String(id) }
        }
        const query = tenantLibraryReadQuery(this.repo, filter)
        if (!query) return typeof id === 'object' ? super.findOne(filter) : super.findOne(id, filter)
        const document = await query.getOne()
        if (!document) throw new NotFoundException('The requested record was not found')
        return document
    }

    override async findOneByIdString(id: string, options?: FindOneOptions<KnowledgeDocument>) {
        return this.findOne(id, options)
    }

    private withReadableDocumentManyOptions(
        options?: FindManyOptions<KnowledgeDocument>
    ): FindManyOptions<KnowledgeDocument> {
        const where = options?.where
        return {
            ...(options ?? {}),
            where: Array.isArray(where)
                ? where.map((item) => this.readableDocumentWhere(item))
                : this.readableDocumentWhere(where)
        }
    }

    private withReadableDocumentOneOptions(
        options?: FindOneOptions<KnowledgeDocument>
    ): FindOneOptions<KnowledgeDocument> {
        const where = options?.where
        return {
            ...(options ?? {}),
            where: Array.isArray(where)
                ? where.map((item) => this.readableDocumentWhere(item))
                : this.readableDocumentWhere(where)
        }
    }

    private readableDocumentWhere(
        where: FindOptionsWhere<KnowledgeDocument> = {}
    ): FindOptionsWhere<KnowledgeDocument> {
        return {
            ...where,
            hardDeletePendingAt: IsNull()
        }
    }

    async assertKnowledgebaseReadAccess(knowledgebaseId: string): Promise<void> {
        return this.access.assertKnowledgebaseReadAccess(knowledgebaseId)
    }

    async assertKnowledgebaseWriteAccess(knowledgebaseId: string): Promise<void> {
        return this.access.assertKnowledgebaseWriteAccess(knowledgebaseId)
    }

    async assertDocumentReadAccess(id: string, withDeleted = false): Promise<void> {
        return this.access.assertDocumentReadAccess(id, withDeleted)
    }

    async assertDocumentWriteAccess(id: string, withDeleted = false): Promise<void> {
        return this.access.assertDocumentWriteAccess(id, withDeleted)
    }

    async assertDocumentsReadAccess(ids: Array<string | null | undefined>): Promise<void> {
        return this.access.assertDocumentsReadAccess(ids)
    }

    async assertDocumentsWriteAccess(ids: Array<string | null | undefined>): Promise<void> {
        return this.access.assertDocumentsWriteAccess(ids)
    }

    async assertDocumentsReadAccessInKnowledgebase(
        ids: Array<string | null | undefined>,
        knowledgebaseId: string
    ): Promise<void> {
        return this.access.assertDocumentsReadAccessInKnowledgebase(ids, knowledgebaseId)
    }

    async assertDocumentsWriteAccessInKnowledgebase(
        ids: Array<string | null | undefined>,
        knowledgebaseId: string
    ): Promise<void> {
        return this.access.assertDocumentsWriteAccessInKnowledgebase(ids, knowledgebaseId)
    }

    async assertOwnedStorageFiles(ids: Array<string | null | undefined>): Promise<void> {
        return this.access.assertOwnedStorageFiles(ids)
    }

    async prepareExternalDocumentInputs(
        documents: Partial<IKnowledgeDocument>[],
        options?: { resolveDocumentIds?: boolean }
    ): Promise<void> {
        return this.access.prepareExternalDocumentInputs(documents, options)
    }

    async findAncestors(id: string, manager?: EntityManager) {
        const treeRepo = (manager ?? this.dataSource).getTreeRepository(KnowledgeDocument)
        const entity = await treeRepo.findOneBy({ id })
        if (!entity) {
            throw new NotFoundException(`Knowledge document "${id}" not found`)
        }

        const ancestorTree = await treeRepo.findAncestorsTree(entity)
        const ancestors: KnowledgeDocument[] = []
        const visited = new Set<string>()
        let current: KnowledgeDocument | null | undefined = ancestorTree
        while (current) {
            if (visited.has(current.id)) {
                throw new ConflictException(`Knowledge document tree contains a cycle at "${current.id}"`)
            }
            visited.add(current.id)
            ancestors.unshift(current)
            current = current.parent
        }
        return ancestors
    }

    async getOriginalFileDownload(id: string) {
        return this.originalFiles.getOriginalFileDownload(id)
    }

    async getOriginalFilePreviewTarget(id: string): Promise<OriginalFileDownloadTarget> {
        return this.originalFiles.getOriginalFilePreviewTarget(id)
    }

    async getOriginalFileDownloadTargets(ids: string[]) {
        return this.originalFiles.getOriginalFileDownloadTargets(ids)
    }

    async getOriginalFileDownloads(ids: string[]): Promise<OriginalFileDownload[]> {
        return this.originalFiles.getOriginalFileDownloads(ids)
    }

    /**
     */
    override async create(document: DeepPartial<KnowledgeDocument>): Promise<KnowledgeDocument> {
        return this.createDocument(document as Partial<IKnowledgeDocument>)
    }

    async createDocument(document: Partial<IKnowledgeDocument>, manager?: EntityManager): Promise<KnowledgeDocument> {
        await this.ingestion.prepareNewDocument(document)

        const doc = manager
            ? await manager.getRepository(KnowledgeDocument).save(
                  this.writeToCurrentScope({
                      ...document,
                      createdById: RequestContext.currentUserId(),
                      updatedById: RequestContext.currentUserId()
                  })
              )
            : await super.create({ ...document })
        // Init folder path for document entity
        const parents = await this.findAncestors(doc.id, manager)
        doc.folder = buildLogicalFolderPath(parents, doc.id)
        await (manager?.getRepository(KnowledgeDocument) ?? this.repository).save(doc)

        return doc
    }

    async createDocumentWithIncrementalSync(
        document: Partial<IKnowledgeDocument>
    ): Promise<IncrementalDocumentSyncItemResult> {
        return this.ingestion.createDocumentWithIncrementalSync(document)
    }

    async createBulkIdempotently(
        documents: Partial<IKnowledgeDocument>[],
        key: string
    ): Promise<IncrementalDocumentSyncResult> {
        return this.ingestion.createBulkIdempotently(documents, key)
    }

    async createBulkWithIncrementalSync(
        documents: Partial<IKnowledgeDocument>[],
        manager?: EntityManager
    ): Promise<IncrementalDocumentSyncResult> {
        return this.ingestion.createBulkWithIncrementalSync(documents, manager)
    }

    async resolveNewDocumentParserConfig(document: Partial<IKnowledgeDocument>, persistStructure = false) {
        return this.ingestion.resolveNewDocumentParserConfig(document, persistStructure)
    }

    async createBulk(documents: Partial<IKnowledgeDocument>[], manager?: EntityManager): Promise<KnowledgeDocument[]> {
        return this.ingestion.createBulk(documents, manager)
    }

    async updateBulk(entities: Partial<IKnowledgeDocument>[]): Promise<void> {
        if (!entities?.length) {
            return
        }
        await Promise.all(entities.map((entity) => this.updateDocument(entity.id, entity)))
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
        return this.editing.updateWithVersion(id, entity, expectedVersion)
    }

    async getFolderChildCounts(input: { knowledgebaseId: string; folderIds: string[] }) {
        return this.editing.getFolderChildCounts(input)
    }

    async moveDocument(input: {
        knowledgebaseId: string
        documentId: string
        parentId?: string | null
        expectedVersion?: number
    }) {
        return this.editing.moveDocument(input)
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
        if (!document.pages.some((page) => page.id === id)) {
            throw new NotFoundException(`Knowledge document page '${id}' was not found in document '${documentId}'`)
        }
        await this.knowledgebaseService.assertNotRebuilding(document.knowledgebaseId)
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase)
        await vectorStore.delete({ filter: { docPageId: id, knowledgeId: documentId } })

        document.pages = document.pages.filter((_) => _.id !== id)
        await this.save(document)
    }

    async getChunks(id: string, params: TVectorSearchParams) {
        return this.chunks.getChunks(id, params)
    }

    async createChunk(id: string, entity: IKnowledgeDocumentChunk) {
        return this.chunks.createChunk(id, entity)
    }

    async updateChunk(documentId: string, id: string, entity: IKnowledgeDocumentChunk) {
        return this.chunks.updateChunk(documentId, id, entity)
    }

    async updateChunkWithVersion(documentId: string, id: string, entity: IKnowledgeDocumentChunk) {
        return this.chunks.updateChunkWithVersion(documentId, id, entity)
    }

    async deleteChunk(documentId: string, id: string) {
        return this.chunks.deleteChunk(documentId, id)
    }

    async deleteChunkWithVersion(documentId: string, id: string, expectedVersion?: number) {
        return this.chunks.deleteChunkWithVersion(documentId, id, expectedVersion)
    }

    private async updateDocument(id: string | undefined, entity: Partial<IKnowledgeDocument>): Promise<void> {
        // Keep TypeORM's recursive QueryDeepPartialEntity out of concrete call sites; ts-node/ts-jest can
        // otherwise exhaust the instantiation budget while expanding KnowledgeDocument relations.
        await (this as unknown as ShallowKnowledgeDocumentUpdater).update(id, entity)
    }

    async coverChunks(document: IKnowledgeDocument, vectorStore: KnowledgeDocumentStore) {
        return this.chunkSync.coverChunks(document, vectorStore)
    }

    async syncChunksIncrementally(
        document: IKnowledgeDocument,
        vectorStore: KnowledgeDocumentStore
    ): Promise<IncrementalChunkSyncResult> {
        return this.chunkSync.syncChunksIncrementally(document, vectorStore)
    }

    async findAllEmbeddingNodes(document: IKnowledgeDocument) {
        return this.chunks.findAllEmbeddingNodes(document)
    }

    async updateChunkMetadataBulk(chunks: Pick<IKnowledgeDocumentChunk, 'id' | 'metadata'>[]) {
        return this.chunks.updateChunkMetadataBulk(chunks)
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
    async startProcessing(ids: string[], kbId?: string, mode: KnowledgeDocumentProcessingMode = 'full') {
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
            docs,
            mode
        })

        docs.forEach((item) => {
            item.jobId = job.id as string
            item.processingExecutionId = null
            item.status = KBDocumentStatusEnum.RUNNING
            item.processMsg = ''
            item.progress = 0
        })

        return await this.save(docs)
    }

    async deleteWithVersion(id: string, expectedVersion?: number) {
        return this.deletion.deleteWithVersion(id, expectedVersion)
    }

    async delete(id: string) {
        return this.deletion.remove(id, {
            tenantId: RequestContext.currentUser()?.tenantId,
            organizationId: this.getCurrentScopeOrganizationCondition()
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

export { buildLogicalFolderPath } from './folders/logical-folder-path'
export type { IncrementalChunkSyncResult } from './chunk/incremental-chunk-sync'
export type { OriginalFileDownload } from './files/document-original-files'
export type { IncrementalDocumentSyncResult, IncrementalDocumentSyncItemResult } from './ingestion/document-ingestion'
