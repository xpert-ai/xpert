import { assertUserManagedDocument } from '../document-management'
import path from 'node:path'
import { IKnowledgeDocument } from '@xpert-ai/contracts'
import type { StorageFile } from '@xpert-ai/server-core'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { compact, uniq } from 'lodash'
import { In } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase/management/knowledgebase.service'
import { VolumeSubtreeClient } from '../../shared/volume/volume-subtree'
import { KnowledgeWorkAreaResolver } from '../../shared/volume/work-area'
import { GetOwnedStorageFileQuery } from '../../file-understanding/queries/get-owned-storage-file.query'
import type { KnowledgeDocumentService } from '../document.service'

export class DocumentAccess {
    constructor(
        private readonly documents: Pick<KnowledgeDocumentService, 'findOne' | 'findAll'>,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly queryBus: QueryBus,
        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
    ) {}

    /**
     * Knowledge documents inherit their authorization boundary from the parent knowledgebase.
     * Keep these checks explicit so HTTP entry points can authorize before reading source files,
     * snapshots, pages, chunks, or starting background work.
     */
    async assertKnowledgebaseReadAccess(knowledgebaseId: string): Promise<void> {
        await this.knowledgebaseService.findOneByIdString(knowledgebaseId, {
            select: { id: true }
        })
    }

    async assertKnowledgebaseWriteAccess(knowledgebaseId: string): Promise<void> {
        await this.knowledgebaseService.assertKnowledgebaseWriteAccess(knowledgebaseId, {
            select: { id: true }
        })
    }

    async assertDocumentReadAccess(id: string, withDeleted = false): Promise<void> {
        const document = await this.findDocumentAccessScope(id, withDeleted)
        await this.assertKnowledgebaseReadAccess(document.knowledgebaseId)
    }

    async assertDocumentWriteAccess(id: string, withDeleted = false): Promise<void> {
        const document = await this.findDocumentAccessScope(id, withDeleted)
        await this.assertKnowledgebaseWriteAccess(document.knowledgebaseId)
        assertUserManagedDocument(document)
    }

    async assertDocumentsReadAccess(ids: Array<string | null | undefined>): Promise<void> {
        await this.assertDocumentsAccess(ids, 'read')
    }

    async assertDocumentsWriteAccess(ids: Array<string | null | undefined>): Promise<void> {
        await this.assertDocumentsAccess(ids, 'write')
    }

    async assertDocumentsReadAccessInKnowledgebase(
        ids: Array<string | null | undefined>,
        knowledgebaseId: string
    ): Promise<void> {
        await this.assertDocumentsAccessInKnowledgebase(ids, knowledgebaseId, 'read')
    }

    async assertDocumentsWriteAccessInKnowledgebase(
        ids: Array<string | null | undefined>,
        knowledgebaseId: string
    ): Promise<void> {
        await this.assertDocumentsAccessInKnowledgebase(ids, knowledgebaseId, 'write')
    }

    async assertOwnedStorageFiles(ids: Array<string | null | undefined>): Promise<void> {
        const uniqueIds = uniq(compact(ids.map((id) => (typeof id === 'string' ? id.trim() : id))))
        await Promise.all(
            uniqueIds.map((id) =>
                this.queryBus.execute<GetOwnedStorageFileQuery, StorageFile>(new GetOwnedStorageFileQuery(id))
            )
        )
    }

    async prepareExternalDocumentInputs(
        documents: Partial<IKnowledgeDocument>[],
        options?: { resolveDocumentIds?: boolean }
    ): Promise<void> {
        for (const document of documents) {
            delete document.status
            delete document.progress
            delete document.processMsg
            delete document.processBeginAt
            delete document.processDuation
            delete document.processDuration
            delete document.jobId
            delete document.processingExecutionId
            delete document.tokenNum
            delete document.chunkNum

            if (document.storageFileId) {
                delete document.filePath
                const storageFile = await this.queryBus.execute<GetOwnedStorageFileQuery, StorageFile>(
                    new GetOwnedStorageFileQuery(document.storageFileId)
                )
                const canonicalFileUrl = storageFile.fileUrl ?? storageFile.url
                if (canonicalFileUrl) {
                    document.fileUrl = canonicalFileUrl
                } else {
                    delete document.fileUrl
                }
                continue
            }

            if (typeof document.filePath === 'string' && document.filePath.trim()) {
                delete document.fileUrl
                await this.canonicalizeExternalManagedFile(document, options?.resolveDocumentIds === true)
                continue
            }

            if (typeof document.fileUrl === 'string' && document.fileUrl.trim()) {
                throw new BadRequestException(
                    'Remote fileUrl cannot be submitted directly. Upload the file first and use storageFileId.'
                )
            }
            delete document.fileUrl
            await this.canonicalizeExternalManagedFile(document, options?.resolveDocumentIds === true)
        }
    }

    private async canonicalizeExternalManagedFile(
        document: Partial<IKnowledgeDocument>,
        resolveDocumentId: boolean
    ): Promise<void> {
        const normalizedPath = document.filePath?.trim().replace(/\\/g, '/')
        if (!normalizedPath) {
            delete document.filePath
            return
        }

        const persisted =
            resolveDocumentId && document.id ? await this.findDocumentAccessScope(document.id, false) : null
        const knowledgebaseId = persisted?.knowledgebaseId ?? document.knowledgebaseId
        if (!knowledgebaseId) {
            throw new BadRequestException('knowledgebaseId is required for a managed filePath')
        }

        const filesPath = this.knowledgeWorkAreaResolver.getFilesPath()
        const prefix = `${filesPath}/`
        if (
            normalizedPath.includes('\0') ||
            path.posix.isAbsolute(normalizedPath) ||
            !normalizedPath.startsWith(prefix)
        ) {
            throw new BadRequestException('filePath must point to a managed file in the selected knowledgebase')
        }
        const relativePath = path.posix.normalize(normalizedPath.slice(prefix.length))
        if (
            !relativePath ||
            relativePath === '.' ||
            relativePath.startsWith('../') ||
            path.posix.isAbsolute(relativePath)
        ) {
            throw new BadRequestException('filePath must point to a managed file in the selected knowledgebase')
        }

        const workArea = await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId
        })
        const managedFile = await new VolumeSubtreeClient(workArea.volume).readFile(filesPath, relativePath, {
            metadataOnly: true
        })
        document.filePath = path.posix.join(filesPath, managedFile.filePath)
        if (managedFile.fileUrl) {
            document.fileUrl = managedFile.fileUrl
        }
        if (managedFile.mimeType) {
            document.mimeType = managedFile.mimeType
        }
        if (managedFile.size != null) {
            document.size = String(managedFile.size)
        }
    }

    private async findDocumentAccessScope(id: string, withDeleted: boolean) {
        return this.documents.findOne(id, {
            select: {
                id: true,
                knowledgebaseId: true,
                metadata: true
            },
            withDeleted
        })
    }

    private async assertDocumentsAccess(
        ids: Array<string | null | undefined>,
        action: 'read' | 'write'
    ): Promise<void> {
        const uniqueIds = uniq(
            (ids ?? []).filter((id): id is string => typeof id === 'string' && !!id.trim()).map((id) => id.trim())
        )
        if (!uniqueIds.length) {
            return
        }

        const { items } = await this.documents.findAll({
            where: { id: In(uniqueIds) },
            select: {
                id: true,
                knowledgebaseId: true,
                metadata: true
            }
        })
        const resolvedIds = new Set(items.map((document) => document.id))
        const missingId = uniqueIds.find((id) => !resolvedIds.has(id))
        if (missingId) {
            throw new NotFoundException(`Knowledge document "${missingId}" not found`)
        }

        const knowledgebaseIds = uniq(compact(items.map((document) => document.knowledgebaseId)))
        await Promise.all(
            knowledgebaseIds.map((knowledgebaseId) =>
                action === 'write'
                    ? this.assertKnowledgebaseWriteAccess(knowledgebaseId)
                    : this.assertKnowledgebaseReadAccess(knowledgebaseId)
            )
        )
        if (action === 'write') items.forEach(assertUserManagedDocument)
    }

    private async assertDocumentsAccessInKnowledgebase(
        ids: Array<string | null | undefined>,
        knowledgebaseId: string,
        action: 'read' | 'write'
    ): Promise<void> {
        if (action === 'write') {
            await this.assertKnowledgebaseWriteAccess(knowledgebaseId)
        } else {
            await this.assertKnowledgebaseReadAccess(knowledgebaseId)
        }

        const uniqueIds = uniq(compact(ids.map((id) => (typeof id === 'string' ? id.trim() : id))))
        if (!uniqueIds.length) {
            return
        }

        const { items } = await this.documents.findAll({
            where: {
                id: In(uniqueIds),
                knowledgebaseId
            },
            select: {
                id: true,
                knowledgebaseId: true,
                metadata: true
            }
        })
        if (action === 'write') items.forEach(assertUserManagedDocument)
        const resolvedIds = new Set(items.map((document) => document.id))
        const missingId = uniqueIds.find((id) => !resolvedIds.has(id))
        if (missingId) {
            throw new NotFoundException(
                `Knowledge document "${missingId}" not found in knowledgebase "${knowledgebaseId}"`
            )
        }
    }
}
