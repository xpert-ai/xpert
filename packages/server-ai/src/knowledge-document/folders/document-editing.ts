import { visibleDocumentSql } from '../document-list-filter'
import { KnowledgeParserSettingsService } from '../../knowledgebase/parser/parser-settings.service'
import path from 'node:path'
import {
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    KDocumentSourceType,
    VectorTypeEnum,
    classificateDocumentCategory
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { uniq } from 'lodash'
import { DataSource, In, Repository, UpdateResult } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase/management/knowledgebase.service'
import type { KnowledgeDocumentStore } from '../../knowledgebase/embedding/vector-store'
import { KnowledgeDocument } from '../document.entity'
import { KnowledgeDocumentChunkService } from '../chunk/chunk.service'
import {
    computeStableHash,
    resolveKnowledgeDocumentTransformerIdentity,
    resolveKnowledgeDocumentSourceHash
} from '../document-hash'
import { TDocChunkMetadata } from '../types'
import { withoutGeneratedTableMetadata, writePublicDocumentMetadata } from '../table-metadata-input'
import { validateKnowledgeTableSettings } from '../parser-validation'
import { normalizeLogicalFolderPath } from './logical-folder-path'
import { normalizeFileExtension, normalizeMimeType, validateMetadataAgainstSchema } from '../metadata/document-metadata'
import { assertExpectedVersion } from '../document-version'
import type { KnowledgeDocumentService } from '../document.service'

type VersionedKnowledgeDocumentUpdater = {
    update(criteria: { id: string; version: number }, entity: Partial<IKnowledgeDocument>): Promise<UpdateResult>
}

const FILTER_ATTRIBUTE_DOCUMENT_FIELDS = new Set([
    'name',
    'folder',
    'type',
    'mimeType',
    'category',
    'sourceType',
    'createdAt',
    'updatedAt',
    'disabled',
    'metadata'
])

function hasFilterAttributeChanges(changes: Partial<IKnowledgeDocument>) {
    return Object.keys(changes).some((key) => FILTER_ATTRIBUTE_DOCUMENT_FIELDS.has(key))
}

export class DocumentEditing {
    constructor(
        private readonly documents: Pick<KnowledgeDocumentService, 'findOne' | 'findAll' | 'findAncestors'>,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly parserSettings: KnowledgeParserSettingsService,
        private readonly dataSource: DataSource,
        private readonly repo: Repository<KnowledgeDocument>,
        private readonly chunkService: KnowledgeDocumentChunkService
    ) {}

    async updateWithVersion(id: string, entity: Partial<IKnowledgeDocument>, expectedVersion?: number) {
        if (!id) {
            throw new BadRequestException('id is required')
        }
        assertExpectedVersion(expectedVersion)
        const current = await this.documents.findOne(id, {
            select: {
                id: true,
                knowledgebaseId: true,
                version: true,
                name: true,
                folder: true,
                sourceType: true,
                category: true,
                parserConfig: true,
                type: true
            },
            relations: ['parent']
        })
        if (current.version !== expectedVersion) {
            throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
        }
        await this.knowledgebaseService.assertNotRebuilding(current.knowledgebaseId)

        const changes = { ...entity }
        if (changes.parserConfig !== undefined) {
            validateKnowledgeTableSettings(changes.parserConfig)
            const next = { ...current, parserConfig: changes.parserConfig }
            if (
                computeStableHash(resolveKnowledgeDocumentTransformerIdentity(current)) !==
                computeStableHash(resolveKnowledgeDocumentTransformerIdentity(next))
            ) {
                await this.parserSettings.validateDocument(next)
            }
        }
        if (changes.knowledgebaseId && changes.knowledgebaseId !== current.knowledgebaseId) {
            throw new BadRequestException('knowledgebaseId cannot be changed after a document is created')
        }
        delete changes.id
        delete changes.version
        delete changes.knowledgebaseId
        delete changes.tenantId
        delete changes.tenant
        delete changes.organizationId
        delete changes.organization
        delete changes.createdById
        delete changes.createdBy
        delete changes.updatedById
        delete changes.updatedBy
        delete changes.createdAt
        delete changes.updatedAt
        delete changes.deletedAt
        delete changes.publicationEpoch
        delete changes.processingExecutionId
        delete changes.knowledgebase
        delete changes.storageFile

        const hasParentChange = Object.prototype.hasOwnProperty.call(changes, 'parent')
        if (hasParentChange) {
            const parent = await this.resolveDocumentParent(current.knowledgebaseId, changes.parent, current.id)
            changes.parent = parent
        }
        const nextSourceHash = resolveKnowledgeDocumentSourceHash(changes)
        if (nextSourceHash) {
            changes.sourceHash = nextSourceHash
        }
        if (typeof changes.folder === 'string') {
            changes.folder = normalizeLogicalFolderPath(changes.folder)
        }
        if (Object.prototype.hasOwnProperty.call(changes, 'type')) {
            changes.type = normalizeFileExtension(changes.type) as string
            changes.category = classificateDocumentCategory({ type: changes.type })
        }
        if (Object.prototype.hasOwnProperty.call(changes, 'mimeType')) {
            changes.mimeType = normalizeMimeType(changes.mimeType) as string
        }
        if (changes.metadata) {
            changes.metadata = withoutGeneratedTableMetadata(changes.metadata)
            const knowledgebase = await this.knowledgebaseService.findOne(current.knowledgebaseId)
            validateMetadataAgainstSchema(changes.metadata, knowledgebase.metadataSchema, 'document')
        }
        const patch = {
            ...changes,
            id,
            updatedById: RequestContext.currentUserId()
        }
        const oldPrefix =
            current.sourceType === KDocumentSourceType.FOLDER
                ? path.posix.join(current.folder ?? '', current.name ?? '')
                : null
        const newPrefix = oldPrefix
            ? path.posix.join(changes.folder ?? current.folder ?? '', changes.name ?? current.name ?? '')
            : null
        const affectedDocumentIds = [id]
        const result = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(KnowledgeDocument) as unknown as VersionedKnowledgeDocumentUpdater
            const { metadata, ...versionedPatch } = patch
            const updateResult = await repository.update({ id, version: expectedVersion }, versionedPatch)
            if (!updateResult.affected) {
                throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
            }
            if (metadata !== undefined) await writePublicDocumentMetadata(manager, id, metadata)
            if (oldPrefix && newPrefix && oldPrefix !== newPrefix) {
                const descendants: Array<{ id: string }> = await manager.query(
                    `SELECT "id" FROM "knowledge_document"
                     WHERE "knowledgebaseId" = $1
                       AND ("folder" = $2 OR left("folder", char_length($2) + 1) = $2 || '/')`,
                    [current.knowledgebaseId, oldPrefix]
                )
                affectedDocumentIds.push(...descendants.map((item) => item.id))
                await manager.query(
                    `UPDATE "knowledge_document"
                     SET "folder" = $1 || substring("folder" from char_length($2) + 1),
                         "updatedAt" = CURRENT_TIMESTAMP,
                         "version" = "version" + 1
                     WHERE "knowledgebaseId" = $3
                       AND ("folder" = $2 OR left("folder", char_length($2) + 1) = $2 || '/')`,
                    [newPrefix, oldPrefix, current.knowledgebaseId]
                )
            }
            return updateResult
        })
        if (!result.affected) {
            throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
        }
        if (hasFilterAttributeChanges(changes)) {
            await this.syncMilvusFilterAttributes(uniq(affectedDocumentIds))
        }
        return result
    }

    async getFolderChildCounts(input: { knowledgebaseId: string; folderIds: string[] }) {
        const knowledgebaseId = input.knowledgebaseId?.trim()
        const requestedFolderIds = uniq((input.folderIds ?? []).map((id) => id?.trim()).filter(Boolean))
        if (!knowledgebaseId || !requestedFolderIds.length) {
            return []
        }

        // Resolve the requested folders through the scoped CRUD service first. This prevents
        // aggregate queries from exposing counts for folders outside the active tenant/organization.
        const { items: folders } = await this.documents.findAll({
            where: {
                id: In(requestedFolderIds),
                knowledgebaseId,
                sourceType: KDocumentSourceType.FOLDER
            },
            select: { id: true }
        })
        const folderIds = folders.map((folder) => folder.id)
        if (!folderIds.length) {
            return []
        }

        const rows: Array<{ folderId: string; documentCount: string; folderCount: string }> = await this.repo
            .createQueryBuilder('document')
            .innerJoin('document.parent', 'parent')
            .select('parent.id', 'folderId')
            .addSelect('SUM(CASE WHEN document.sourceType = :folderType THEN 0 ELSE 1 END)', 'documentCount')
            .addSelect('SUM(CASE WHEN document.sourceType = :folderType THEN 1 ELSE 0 END)', 'folderCount')
            .where('document.knowledgebaseId = :knowledgebaseId', { knowledgebaseId })
            .andWhere('parent.id IN (:...folderIds)', { folderIds })
            .andWhere(visibleDocumentSql('document.metadata'))
            .setParameter('folderType', KDocumentSourceType.FOLDER)
            .groupBy('parent.id')
            .getRawMany()
        const countsByFolderId = new Map(rows.map((row) => [row.folderId, row]))

        return folderIds.map((folderId) => {
            const row = countsByFolderId.get(folderId)
            return {
                folderId,
                documentCount: Number(row?.documentCount ?? 0),
                folderCount: Number(row?.folderCount ?? 0)
            }
        })
    }

    async moveDocument(input: {
        knowledgebaseId: string
        documentId: string
        parentId?: string | null
        expectedVersion?: number
    }) {
        const knowledgebaseId = input.knowledgebaseId?.trim()
        const documentId = input.documentId?.trim()
        if (!knowledgebaseId || !documentId) {
            throw new BadRequestException('knowledgebaseId and documentId are required')
        }
        await this.knowledgebaseService.assertNotRebuilding(knowledgebaseId)
        const document = await this.documents.findOne(documentId, { relations: ['parent'] })
        if (document.knowledgebaseId !== knowledgebaseId) {
            throw new BadRequestException('Document is not in the selected knowledgebase')
        }
        if (input.expectedVersion !== undefined && document.version !== input.expectedVersion) {
            throw new ConflictException('Knowledge document has been modified. Refresh and try again.')
        }
        const parent = input.parentId ? await this.documents.findOne(input.parentId, { relations: ['parent'] }) : null
        if (
            parent &&
            (parent.knowledgebaseId !== knowledgebaseId || parent.sourceType !== KDocumentSourceType.FOLDER)
        ) {
            throw new BadRequestException('parentId must point to a folder in the selected knowledgebase')
        }
        if (parent) {
            const ancestors = await this.documents.findAncestors(parent.id)
            if (ancestors.some((ancestor) => ancestor.id === document.id)) {
                throw new BadRequestException('A folder cannot be moved into itself or one of its descendants')
            }
        }

        const oldFolder = normalizeLogicalFolderPath(document.folder ?? '')
        const newFolder = normalizeLogicalFolderPath(
            parent ? path.posix.join(parent.folder ?? '', parent.name ?? '') : ''
        )
        if ((document.parent?.id ?? null) === (parent?.id ?? null) && oldFolder === newFolder) {
            return { document, affectedDocumentIds: [document.id] }
        }

        const oldPrefix =
            document.sourceType === KDocumentSourceType.FOLDER
                ? normalizeLogicalFolderPath(path.posix.join(oldFolder, document.name ?? ''))
                : null
        const newPrefix =
            document.sourceType === KDocumentSourceType.FOLDER
                ? normalizeLogicalFolderPath(path.posix.join(newFolder, document.name ?? ''))
                : null
        const affectedDocumentIds = [document.id]

        await this.dataSource.transaction(async (manager) => {
            const treeRepository = manager.getTreeRepository(KnowledgeDocument)
            document.parent = parent
            document.folder = newFolder
            document.updatedById = RequestContext.currentUserId()
            await treeRepository.save(document)
            if (oldPrefix && newPrefix && oldPrefix !== newPrefix) {
                const descendants: Array<{ id: string }> = await manager.query(
                    `SELECT "id" FROM "knowledge_document"
                     WHERE "knowledgebaseId" = $1
                       AND ("folder" = $2 OR left("folder", char_length($2) + 1) = $2 || '/')`,
                    [knowledgebaseId, oldPrefix]
                )
                affectedDocumentIds.push(...descendants.map((item) => item.id))
                await manager.query(
                    `UPDATE "knowledge_document"
                     SET "folder" = $1 || substring("folder" from char_length($2) + 1),
                         "updatedAt" = CURRENT_TIMESTAMP,
                         "version" = "version" + 1
                     WHERE "knowledgebaseId" = $3
                       AND ("folder" = $2 OR left("folder", char_length($2) + 1) = $2 || '/')`,
                    [newPrefix, oldPrefix, knowledgebaseId]
                )
            }
        })
        const uniqueAffectedIds = uniq(affectedDocumentIds)
        await this.syncMilvusFilterAttributes(uniqueAffectedIds)
        return {
            document: await this.documents.findOne(document.id, { relations: ['parent'] }),
            affectedDocumentIds: uniqueAffectedIds
        }
    }

    async syncMilvusFilterAttributes(documentIds: string[]) {
        if (!documentIds.length) return
        const { items } = await this.documents.findAll({ where: { id: In(documentIds) }, relations: ['knowledgebase'] })
        const documents = items.filter(
            (document) =>
                document.knowledgebaseId &&
                (document.knowledgebase?.vectorStore ?? environment.vectorStore) === VectorTypeEnum.MILVUS
        )
        if (!documents.length) return
        const { items: chunks } = await this.chunkService.findAll({
            where: { documentId: In(documents.map((document) => document.id)) },
            order: { createdAt: 'ASC' }
        })
        const byDocument = new Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>[]>()
        for (const chunk of chunks) {
            const items = byDocument.get(chunk.documentId) ?? []
            items.push(chunk)
            byDocument.set(chunk.documentId, items)
        }
        const stores = new Map<string, KnowledgeDocumentStore>()
        for (const document of documents) {
            let store = stores.get(document.knowledgebaseId)
            if (!store) {
                store = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebaseId, true)
                stores.set(document.knowledgebaseId, store)
            }
            await store.partialUpdateFilterAttributes(document, byDocument.get(document.id) ?? [])
        }
    }

    async resolveDocumentParent(
        knowledgebaseId: string | null | undefined,
        parent: IKnowledgeDocument | null | undefined,
        documentId?: string
    ): Promise<IKnowledgeDocument | null> {
        if (!parent) {
            return null
        }

        const parentId = typeof parent.id === 'string' ? parent.id.trim() : ''
        if (!knowledgebaseId || !parentId) {
            throw new BadRequestException('parent must identify a folder in the selected knowledgebase')
        }

        const resolvedParent = await this.documents.findOne(parentId, { relations: ['parent'] })
        if (
            resolvedParent.knowledgebaseId !== knowledgebaseId ||
            resolvedParent.sourceType !== KDocumentSourceType.FOLDER
        ) {
            throw new BadRequestException('parent must identify a folder in the selected knowledgebase')
        }

        if (documentId) {
            if (resolvedParent.id === documentId) {
                throw new BadRequestException('A folder cannot be moved into itself or one of its descendants')
            }
            const ancestors = await this.documents.findAncestors(resolvedParent.id)
            if (ancestors.some((ancestor) => ancestor.id === documentId)) {
                throw new BadRequestException('A folder cannot be moved into itself or one of its descendants')
            }
        }

        return resolvedParent
    }
}
