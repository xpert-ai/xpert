import {
    IKnowledgeDocument,
    DocumentTypeEnum,
    IKnowledgebase,
    KBDocumentStatusEnum,
    KnowledgebaseTypeEnum,
    classificateDocumentCategory
} from '@xpert-ai/contracts'
import { KnowledgeParserSettingsService } from '../../knowledgebase/parser/parser-settings.service'
import type { StorageFile } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { compact, uniq } from 'lodash'
import { DeepPartial, EntityManager, FindOptionsWhere, IsNull, Repository } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase/management/knowledgebase.service'
import { KnowledgeDocument } from '../document.entity'
import { resolveKnowledgeDocumentParserConfig } from '../parser-config'
import {
    computeKnowledgeDocumentProcessingHash,
    resolveKnowledgeDocumentSourceKey,
    resolveKnowledgeDocumentSourceHash
} from '../document-hash'
import { GetOwnedStorageFileQuery } from '../../file-understanding/queries/get-owned-storage-file.query'
import { withoutGeneratedTableMetadata } from '../table-metadata-input'
import { validateKnowledgeTableSettings } from '../parser-validation'
import { normalizeFileExtension, normalizeMimeType, validateMetadataAgainstSchema } from '../metadata/document-metadata'
import { DocumentEditing } from '../folders/document-editing'
import type { KnowledgeDocumentService } from '../document.service'

export type IncrementalDocumentSyncItemResult = {
    document: KnowledgeDocument
    shouldProcess: boolean
    action: 'created' | 'updated' | 'skipped'
}

export type IncrementalDocumentSyncResult = {
    documents: KnowledgeDocument[]
    processableIds: string[]
    skippedIds: string[]
    updatedIds: string[]
    createdIds: string[]
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

export class DocumentIngestion {
    constructor(
        private readonly documents: Pick<KnowledgeDocumentService, 'createDocument' | 'save' | 'findAll'>,
        private readonly repository: Repository<KnowledgeDocument>,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly parserSettings: KnowledgeParserSettingsService,
        private readonly queryBus: QueryBus,
        private readonly editing: Pick<DocumentEditing, 'resolveDocumentParent'>,
        private readonly writeToCurrentScope: (
            document: DeepPartial<KnowledgeDocument>
        ) => DeepPartial<KnowledgeDocument>
    ) {}

    async prepareNewDocument(document: Partial<IKnowledgeDocument>) {
        await this.prepareDocumentRelations(document)
        await this.completeDocumentSystemAttributes(document)
        await this.validateDocumentMetadataInput(document)
        document.parserConfig = await this.resolveNewDocumentParserConfig(document, true)
        document.sourceHash ??= resolveKnowledgeDocumentSourceHash(document)
        document.sourceKey ??= resolveKnowledgeDocumentSourceKey(document)
        document.processingHash ??= computeKnowledgeDocumentProcessingHash(document)
    }

    async createDocumentWithIncrementalSync(
        document: Partial<IKnowledgeDocument>
    ): Promise<IncrementalDocumentSyncItemResult> {
        document.parserConfig = await this.resolveNewDocumentParserConfig(document, true)
        document.sourceHash ??= resolveKnowledgeDocumentSourceHash(document)
        document.sourceKey ??= resolveKnowledgeDocumentSourceKey(document)
        if (!(await this.isKnowledgebaseIncrementalSyncEnabled(document.knowledgebaseId))) {
            return {
                document: await this.documents.createDocument(document),
                shouldProcess: true,
                action: 'created'
            }
        }
        return this.createOrReuseSourceDocument(document)
    }

    /** Crash-safe creation receipts for staged imports; no processing is started here. */
    async createBulkIdempotently(
        documents: Partial<IKnowledgeDocument>[],
        key: string
    ): Promise<IncrementalDocumentSyncResult> {
        if (!key || key.length > 160 || documents.length !== 1 || !documents[0].knowledgebaseId) {
            throw new BadRequestException(
                'Idempotent creation requires one document and a key of at most 160 characters'
            )
        }
        const knowledgebaseId = documents[0].knowledgebaseId
        const sourceKey = `runtime-import:${key}`
        await this.knowledgebaseService.assertKnowledgebaseWriteAccess(knowledgebaseId)
        return this.repository.manager.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                `knowledge-import:${knowledgebaseId}:${key}`
            ])
            const existing = await manager
                .getRepository(KnowledgeDocument)
                .createQueryBuilder('doc')
                .where('doc.knowledgebaseId = :knowledgebaseId', { knowledgebaseId })
                .andWhere('doc.sourceKey = :sourceKey', { sourceKey })
                .getOne()
            if (existing) {
                if (existing.metadata?.sourceHash !== documents[0].metadata?.sourceHash)
                    throw new BadRequestException('Import key content conflict')
                return {
                    documents: [existing],
                    processableIds: [],
                    skippedIds: [existing.id],
                    updatedIds: [],
                    createdIds: []
                }
            }
            const created = await this.documents.createDocument(
                { ...documents[0], sourceKey, metadata: { ...documents[0].metadata, _runtimeImportKey: key } },
                manager
            )
            return {
                documents: [created],
                processableIds: [created.id],
                skippedIds: [],
                updatedIds: [],
                createdIds: [created.id]
            }
        })
    }

    async createBulkWithIncrementalSync(
        documents: Partial<IKnowledgeDocument>[],
        manager?: EntityManager
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
        for (const document of documents) {
            delete document.processingExecutionId
            document.parserConfig = await this.resolveNewDocumentParserConfig(document, true)
            document.sourceHash ??= resolveKnowledgeDocumentSourceHash(document)
            document.sourceKey ??= resolveKnowledgeDocumentSourceKey(document)
        }
        const knowledgebaseIds = uniq(compact(documents.map((document) => document.knowledgebaseId)))
        await Promise.all(
            knowledgebaseIds.map((knowledgebaseId) => this.knowledgebaseService.assertNotRebuilding(knowledgebaseId))
        )
        const incrementalSyncByKnowledgebaseId = await this.getIncrementalSyncEnabledByKnowledgebaseId(knowledgebaseIds)

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
                ? await this.createOrReuseSourceDocument(document, manager)
                : {
                      document: await this.documents.createDocument(document, manager),
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

    async resolveNewDocumentParserConfig(document: Partial<IKnowledgeDocument>, persistStructure = false) {
        if (document.type === DocumentTypeEnum.FOLDER) return document.parserConfig ?? {}
        validateKnowledgeTableSettings(document.parserConfig)
        const knowledgebase = document.knowledgebaseId
            ? await this.knowledgebaseService.findOneByIdString(document.knowledgebaseId)
            : null
        const config = resolveKnowledgeDocumentParserConfig(
            document,
            !knowledgebase?.type || knowledgebase.type === KnowledgebaseTypeEnum.Standard
                ? knowledgebase?.parserConfig
                : undefined
        )
        await this.parserSettings.validateDocument(
            { ...document, parserConfig: config },
            document.parserConfig?.transformerType
        )
        if (config.textSplitterType) {
            const structure = await this.parserSettings.validateSplitter(config)
            if (persistStructure && knowledgebase && knowledgebase.type === KnowledgebaseTypeEnum.Standard) {
                await this.knowledgebaseService.ensureDocumentChunkStructure(knowledgebase.id, structure)
            }
        }
        return config
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

    async createBulk(documents: Partial<IKnowledgeDocument>[], manager?: EntityManager): Promise<KnowledgeDocument[]> {
        return (await this.createBulkWithIncrementalSync(documents, manager)).documents
    }

    private async createOrReuseSourceDocument(
        document: Partial<IKnowledgeDocument>,
        manager?: EntityManager
    ): Promise<IncrementalDocumentSyncItemResult> {
        await this.completeDocumentSystemAttributes(document)
        await this.validateDocumentMetadataInput(document)
        const sourceKey = resolveKnowledgeDocumentSourceKey(document)
        const sourceHash = resolveKnowledgeDocumentSourceHash(document)
        document.sourceKey = sourceKey
        document.sourceHash = sourceHash

        const existing = await this.findExistingSourceDocument(document, manager)
        if (!existing) {
            const created = await this.documents.createDocument(document, manager)
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
        const changes: DeepPartial<KnowledgeDocument> = {
            ...existing,
            ...documentChanges,
            id: existing.id,
            sourceKey,
            sourceHash,
            contentHash: existing.contentHash,
            processingHash,
            chunkNum: existing.chunkNum,
            tokenNum: existing.tokenNum
        }
        const updated = manager
            ? await manager.getRepository(KnowledgeDocument).save(this.writeToCurrentScope(changes))
            : await this.documents.save(changes)

        return {
            document: updated,
            shouldProcess: true,
            action: 'updated'
        }
    }

    private async findExistingSourceDocument(
        document: Partial<IKnowledgeDocument>,
        manager?: EntityManager
    ): Promise<KnowledgeDocument | null> {
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

        if (manager) {
            return manager.findOne(KnowledgeDocument, {
                where: {
                    ...where,
                    tenantId: RequestContext.currentTenantId(),
                    organizationId: RequestContext.getOrganizationId() ?? IsNull()
                },
                order: { updatedAt: 'DESC' }
            })
        }

        const { items } = await this.documents.findAll({
            where,
            order: { updatedAt: 'DESC' },
            take: 1
        })

        return items[0] ?? null
    }

    private async validateDocumentMetadataInput(document: Partial<IKnowledgeDocument>) {
        document.metadata = withoutGeneratedTableMetadata(document.metadata)
        if (!document.metadata || !document.knowledgebaseId) return
        const knowledgebase =
            document.knowledgebase?.metadataSchema != null
                ? document.knowledgebase
                : await this.knowledgebaseService.findOneByIdString(document.knowledgebaseId)
        validateMetadataAgainstSchema(document.metadata, knowledgebase.metadataSchema, 'document')
    }

    private async prepareDocumentRelations(document: Partial<IKnowledgeDocument>) {
        const hasParent = Object.prototype.hasOwnProperty.call(document, 'parent')
        const parent = document.parent
        delete document.id
        delete document.version
        delete document.tenantId
        delete document.tenant
        delete document.organizationId
        delete document.organization
        delete document.createdById
        delete document.createdBy
        delete document.updatedById
        delete document.updatedBy
        Reflect.deleteProperty(document, 'createdAt')
        Reflect.deleteProperty(document, 'updatedAt')
        delete document.deletedAt
        delete document.hardDeletePendingAt
        delete document.publicationEpoch
        delete document.processingExecutionId
        delete document.knowledgebase
        delete document.storageFile
        if (hasParent) {
            document.parent = await this.editing.resolveDocumentParent(document.knowledgebaseId, parent)
        }
    }

    private async completeDocumentSystemAttributes(document: Partial<IKnowledgeDocument>) {
        if (document.storageFileId && (!document.type || !document.mimeType)) {
            const storageFile = await this.queryBus.execute<GetOwnedStorageFileQuery, StorageFile>(
                new GetOwnedStorageFileQuery(document.storageFileId)
            )
            document.type ??= storageFile.originalName.split('.').pop()
            document.mimeType ??= storageFile.mimetype
        } else if (document.options?.url) {
            document.type ??= 'html'
            document.mimeType ??= 'text/html'
        }
        document.type = normalizeFileExtension(document.type) as string
        document.mimeType = normalizeMimeType(document.mimeType) as string
        document.category = classificateDocumentCategory(document)
    }
}
