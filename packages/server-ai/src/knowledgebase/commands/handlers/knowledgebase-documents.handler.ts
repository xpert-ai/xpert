import { createHash } from 'node:crypto'
import fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import { BadRequestException, Injectable, InternalServerErrorException, Optional } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
    classificateDocumentCategory,
    DocumentSourceProviderCategoryEnum,
    DocumentTypeEnum,
    IKnowledgeDocument,
    KDocumentSourceType
} from '@xpert-ai/contracts'
import {
    KnowledgebaseDocumentRecord,
    KnowledgebaseDocumentStatusResult,
    KnowledgebaseCreateFolderResult,
    KnowledgebaseListDocumentsResult,
    KnowledgebaseMoveDocumentResult,
    KnowledgebaseUploadedFile,
    KnowledgebaseReadImageResult,
    DocumentTransformerRegistry,
    WORKSPACE_FILES_SOURCE
} from '@xpert-ai/plugin-sdk'
import { getErrorMessage, normalizeUploadedFileName } from '@xpert-ai/server-common'
import { getFileAssetDestination, RequestContext, UploadFileCommand } from '@xpert-ai/server-core'
import * as tar from 'tar'
import { ILike, In, IsNull, Not, Raw } from 'typeorm'
import unzipper from 'unzipper'
import { buildLogicalFolderPath, KnowledgeDocumentService } from '../../../knowledge-document/document.service'
import { resolveKnowledgeDocumentParserConfig } from '../../../knowledge-document/parser-config'
import { VolumeSubtreeClient } from '../../../shared/volume/volume-subtree'
import { KnowledgeWorkAreaResolver } from '../../../shared/volume/work-area'
import { KnowledgebaseService } from '../../knowledgebase.service'
import {
    CreateKnowledgebaseDocumentsCommand,
    CreateKnowledgebaseFolderCommand,
    DeleteKnowledgebaseDocumentsCommand,
    GetKnowledgebaseDocumentStatusCommand,
    ImportKnowledgebaseArchiveCommand,
    ListKnowledgebaseDocumentsCommand,
    MoveKnowledgebaseDocumentCommand,
    ReprocessKnowledgebaseDocumentsCommand,
    StartKnowledgebaseDocumentsProcessingCommand,
    UploadKnowledgebaseDocumentFileCommand,
    ReadKnowledgebaseDocumentImageCommand
} from '../knowledgebase-documents.command'

const DEFAULT_MAX_ARCHIVE_ENTRIES = 500
const DEFAULT_MAX_ARCHIVE_ENTRY_SIZE_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_ARCHIVE_DEPTH = 5
const RECURSIVE_ARCHIVE_EXTENSIONS = new Set(['zip', 'tar', 'tar.gz', 'tgz'])
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'tar.gz', 'tgz', 'gz'])
const DEFAULT_SUPPORTED_ARCHIVE_EXTENSIONS = new Set([
    'csv',
    'doc',
    'docx',
    'epub',
    'gif',
    'html',
    'jpeg',
    'jpg',
    'json',
    'md',
    'markdown',
    'mdx',
    'odp',
    'ods',
    'odt',
    'pdf',
    'png',
    'ppt',
    'pptx',
    'svg',
    'tif',
    'tiff',
    'txt',
    'webp',
    'xls',
    'xlsx',
    'xml',
    'yaml',
    'yml'
])

@Injectable()
@CommandHandler(ListKnowledgebaseDocumentsCommand)
export class ListKnowledgebaseDocumentsHandler implements ICommandHandler<ListKnowledgebaseDocumentsCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        @Optional() private readonly transformerRegistry?: DocumentTransformerRegistry
    ) {}

    async execute(command: ListKnowledgebaseDocumentsCommand): Promise<KnowledgebaseListDocumentsResult> {
        const knowledgebaseId = command.input.knowledgebaseId?.trim()
        if (!knowledgebaseId) {
            throw new BadRequestException('knowledgebaseId is required')
        }
        await this.knowledgebaseService.findOneByIdString(knowledgebaseId, { select: { id: true } })
        const page = normalizePositiveInteger(command.input.page, 1)
        const pageSize = Math.min(normalizePositiveInteger(command.input.pageSize, 20), 100)
        const search = command.input.search?.trim().slice(0, 120)
        const hasParentBoundary = Object.prototype.hasOwnProperty.call(command.input, 'parentId')
        const parent = command.input.parentId
            ? await this.documentService.findOne(command.input.parentId, { relations: ['parent'] })
            : null
        if (
            parent &&
            (parent.knowledgebaseId !== knowledgebaseId || parent.sourceType !== KDocumentSourceType.FOLDER)
        ) {
            throw new BadRequestException('parentId must point to a folder in the selected knowledgebase')
        }
        const folderPath = normalizeKnowledgebaseFolderPath(command.input.folderPath)
        const folderMode = command.input.folderMode ?? 'direct'
        const { items, total } = await this.documentService.findAll({
            where: {
                knowledgebaseId,
                ...(hasParentBoundary ? { parent: parent ? ({ id: parent.id } as IKnowledgeDocument) : IsNull() } : {}),
                ...(folderPath !== undefined
                    ? {
                          folder:
                              folderMode === 'descendants'
                                  ? Raw(
                                        (alias) =>
                                            folderPath
                                                ? `(${alias} = :folderPath OR left(${alias}, char_length(:folderPath) + 1) = :folderPath || '/')`
                                                : 'TRUE',
                                        { folderPath }
                                    )
                                  : folderPath
                      }
                    : {}),
                ...(command.input.includeFolders ? {} : { sourceType: Not(KDocumentSourceType.FOLDER) }),
                ...(search ? { name: ILike(`%${escapeLikePattern(search)}%`) } : {})
            } as any,
            relations: hasParentBoundary ? ['parent'] : undefined,
            order: { updatedAt: 'DESC' } as any,
            skip: (page - 1) * pageSize,
            take: pageSize
        })
        return {
            documents: items.map((document) => serializeKnowledgeDocument(document, this.transformerRegistry)),
            total,
            page,
            pageSize
        }
    }
}

@Injectable()
@CommandHandler(CreateKnowledgebaseFolderCommand)
export class CreateKnowledgebaseFolderHandler implements ICommandHandler<CreateKnowledgebaseFolderCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService
    ) {}

    async execute(command: CreateKnowledgebaseFolderCommand): Promise<KnowledgebaseCreateFolderResult> {
        const knowledgebaseId = command.input.knowledgebaseId?.trim()
        const name = normalizeFolderName(command.input.name)
        if (!knowledgebaseId) throw new BadRequestException('knowledgebaseId is required')
        await this.knowledgebaseService.assertKnowledgebaseWriteAccess(knowledgebaseId, { select: { id: true } })
        await this.knowledgebaseService.assertNotRebuilding(knowledgebaseId)
        const parent = command.input.parentId
            ? await this.documentService.findOne(command.input.parentId, { relations: ['parent'] })
            : null
        if (
            parent &&
            (parent.knowledgebaseId !== knowledgebaseId || parent.sourceType !== KDocumentSourceType.FOLDER)
        ) {
            throw new BadRequestException('parentId must point to a folder in the selected knowledgebase')
        }
        const duplicate = await this.documentService.findAll({
            where: {
                knowledgebaseId,
                name,
                sourceType: KDocumentSourceType.FOLDER,
                parent: parent ? ({ id: parent.id } as IKnowledgeDocument) : IsNull()
            } as any,
            relations: ['parent'],
            take: 1
        })
        const folder =
            duplicate.items[0] ??
            (await this.documentService.createDocument({
                knowledgebaseId,
                parent: parent ? ({ id: parent.id } as IKnowledgeDocument) : null,
                sourceType: DocumentTypeEnum.FOLDER,
                type: DocumentTypeEnum.FOLDER,
                name
            }))
        return { knowledgebaseId, folder: serializeKnowledgeDocument(folder) }
    }
}

@Injectable()
@CommandHandler(MoveKnowledgebaseDocumentCommand)
export class MoveKnowledgebaseDocumentHandler implements ICommandHandler<MoveKnowledgebaseDocumentCommand> {
    constructor(private readonly documentService: KnowledgeDocumentService) {}

    async execute(command: MoveKnowledgebaseDocumentCommand): Promise<KnowledgebaseMoveDocumentResult> {
        await this.documentService.assertDocumentsWriteAccessInKnowledgebase(
            [command.input.documentId],
            command.input.knowledgebaseId
        )
        const result = await this.documentService.moveDocument({
            knowledgebaseId: command.input.knowledgebaseId,
            documentId: command.input.documentId,
            parentId: command.input.parentId,
            expectedVersion: command.input.expectedVersion
        })
        return {
            knowledgebaseId: command.input.knowledgebaseId,
            document: serializeKnowledgeDocument(result.document),
            affectedDocumentIds: result.affectedDocumentIds
        }
    }
}

type KnowledgebaseDocumentHandlerDeps = {
    knowledgebaseService: KnowledgebaseService
    documentService: KnowledgeDocumentService
    knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
    commandBus: CommandBus
}

type ArchiveImportState = {
    drafts: Partial<IKnowledgeDocument>[]
    skipped: Array<{ path: string; reason: string }>
    warnings: string[]
    seenHashes: Set<string>
    seenPaths: Set<string>
    entryCount: number
}

@Injectable()
@CommandHandler(UploadKnowledgebaseDocumentFileCommand)
export class UploadKnowledgebaseDocumentFileHandler implements ICommandHandler<UploadKnowledgebaseDocumentFileCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver,
        private readonly commandBus: CommandBus
    ) {}

    async execute(command: UploadKnowledgebaseDocumentFileCommand) {
        return uploadKnowledgebaseFile(
            {
                knowledgebaseService: this.knowledgebaseService,
                documentService: this.documentService,
                knowledgeWorkAreaResolver: this.knowledgeWorkAreaResolver,
                commandBus: this.commandBus
            },
            command.input
        )
    }
}

@Injectable()
@CommandHandler(ImportKnowledgebaseArchiveCommand)
export class ImportKnowledgebaseArchiveHandler implements ICommandHandler<ImportKnowledgebaseArchiveCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver,
        private readonly commandBus: CommandBus
    ) {}

    async execute(command: ImportKnowledgebaseArchiveCommand) {
        const input = command.input
        const fileName = normalizeKnowledgebaseUploadedFileName(input.file?.originalname)
        const archiveExtension = getArchiveExtension(fileName)
        if (!archiveExtension) {
            throw new BadRequestException('Archive file extension is required')
        }

        const archive = await uploadKnowledgebaseFile(
            {
                knowledgebaseService: this.knowledgebaseService,
                documentService: this.documentService,
                knowledgeWorkAreaResolver: this.knowledgeWorkAreaResolver,
                commandBus: this.commandBus
            },
            {
                knowledgebaseId: input.knowledgebaseId,
                parentId: input.parentId,
                path: path.posix.join(input.path ?? '', '_archives'),
                file: input.file
            }
        )

        if (!RECURSIVE_ARCHIVE_EXTENSIONS.has(archiveExtension)) {
            return {
                archive,
                documents: [],
                skipped: [],
                warnings: [`Archive type .${archiveExtension} is not supported by the default knowledgebase importer.`],
                unsupported: true,
                processingStarted: false
            }
        }

        const supportedExtensions = new Set(
            (input.supportedExtensions?.length ? input.supportedExtensions : [...DEFAULT_SUPPORTED_ARCHIVE_EXTENSIONS])
                .map((item) => item.trim().replace(/^\./, '').toLowerCase())
                .filter(Boolean)
        )
        const maxEntries = normalizePositiveInteger(input.maxEntries, DEFAULT_MAX_ARCHIVE_ENTRIES)
        const maxEntrySizeBytes = normalizePositiveInteger(
            input.maxEntrySizeBytes,
            DEFAULT_MAX_ARCHIVE_ENTRY_SIZE_BYTES
        )
        const maxDepth = normalizeNonNegativeInteger(input.maxDepth, DEFAULT_MAX_ARCHIVE_DEPTH)
        const baseFolder = this.knowledgeWorkAreaResolver.getFilesPath(input.path ?? '')
        const state: ArchiveImportState = {
            drafts: [],
            skipped: [],
            warnings: [],
            seenHashes: new Set<string>(),
            seenPaths: new Set<string>(),
            entryCount: 0
        }
        await extractArchiveToKnowledgeDocumentDrafts({
            buffer: input.file.buffer,
            archiveDisplayPath: fileName,
            archiveType: archiveExtension,
            depth: 0,
            maxDepth,
            maxEntries,
            maxEntrySizeBytes,
            supportedExtensions,
            state,
            commandBus: this.commandBus,
            storageRoot: path.posix.join(baseFolder, stripExtension(fileName)),
            virtualPathPrefix: '',
            knowledgebaseId: input.knowledgebaseId,
            parserConfig: input.parserConfig,
            metadata: input.metadata,
            packageId: input.packageId,
            packageCode: input.packageCode,
            archivePath: archive.filePath
        })

        const syncResult = state.drafts.length
            ? await this.documentService.createBulkWithIncrementalSync(state.drafts)
            : null
        const documents = syncResult?.documents ?? []
        let processingStarted = false
        if (input.process && syncResult?.processableIds.length) {
            await this.documentService.startProcessing(syncResult.processableIds, input.knowledgebaseId)
            processingStarted = true
        }
        if (!documents.length) {
            state.warnings.push('No supported documents were imported from the archive.')
        }

        return {
            archive,
            documents: documents.map((document) => serializeKnowledgeDocument(document)),
            skipped: state.skipped,
            warnings: state.warnings,
            processingStarted
        }
    }
}

@Injectable()
@CommandHandler(CreateKnowledgebaseDocumentsCommand)
export class CreateKnowledgebaseDocumentsHandler implements ICommandHandler<CreateKnowledgebaseDocumentsCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
    ) {}

    async execute(command: CreateKnowledgebaseDocumentsCommand) {
        const input = command.input
        const knowledgebase = await this.knowledgebaseService.assertKnowledgebaseWriteAccess(input.knowledgebaseId, {
            select: { id: true, tenantId: true }
        })
        await this.knowledgebaseService.assertNotRebuilding(input.knowledgebaseId)
        const hasManagedFileInput = input.documents.some((document) => document.filePath || document.fileUrl)
        const filesPath = this.knowledgeWorkAreaResolver.getFilesPath()
        const files = hasManagedFileInput
            ? new VolumeSubtreeClient(
                  (
                      await this.knowledgeWorkAreaResolver.resolve({
                          tenantId: knowledgebase.tenantId,
                          userId: RequestContext.currentUserId(),
                          knowledgebaseId: knowledgebase.id
                      })
                  ).volume
              )
            : null
        const drafts = await Promise.all(
            input.documents.map(async (document) => {
                const parentAncestors = document.parentId
                    ? await this.knowledgebaseService.resolveKnowledgebaseFolderAncestors(
                          input.knowledgebaseId,
                          document.parentId
                      )
                    : []
                const parent = parentAncestors.at(-1) ?? null
                const managedFile = await resolveRuntimeKnowledgebaseDocumentFile(
                    files,
                    filesPath,
                    document.filePath,
                    document.fileUrl
                )
                const type = normalizeDocumentType(
                    document.type,
                    document.name ?? managedFile.filePath,
                    managedFile.mimeType ?? document.mimeType
                )
                const category =
                    (document.category as IKnowledgeDocument['category']) ??
                    classificateDocumentCategory({ type } as Partial<IKnowledgeDocument>)
                return {
                    knowledgebaseId: input.knowledgebaseId,
                    parent: parent ? ({ id: parent.id } as IKnowledgeDocument) : null,
                    sourceType: (document.sourceType ??
                        DocumentSourceProviderCategoryEnum.LocalFile) as IKnowledgeDocument['sourceType'],
                    sourceConfig: document.sourceConfig,
                    name: document.name ?? path.posix.basename(managedFile.filePath ?? 'knowledge-document'),
                    type,
                    category,
                    ...managedFile,
                    parserConfig: resolveKnowledgeDocumentParserConfig({
                        type,
                        category,
                        parserConfig: document.parserConfig ?? input.parserConfig
                    }),
                    metadata: {
                        ...(input.metadata ?? {}),
                        ...(document.metadata ?? {})
                    },
                    size:
                        managedFile.size == null
                            ? document.size == null
                                ? undefined
                                : String(document.size)
                            : String(managedFile.size)
                } satisfies Partial<IKnowledgeDocument>
            })
        )
        const syncResult = await this.documentService.createBulkWithIncrementalSync(drafts)
        const docs = syncResult.documents
        let processingStarted = false
        if (input.process && syncResult.processableIds.length) {
            await this.documentService.startProcessing(syncResult.processableIds, input.knowledgebaseId)
            processingStarted = true
        }
        return {
            documents: docs.map((document) => serializeKnowledgeDocument(document)),
            processingStarted
        }
    }
}

type RuntimeKnowledgebaseManagedFile = {
    filePath?: string
    fileUrl?: string
    mimeType?: string
    size?: number
}

async function resolveRuntimeKnowledgebaseDocumentFile(
    files: VolumeSubtreeClient | null,
    filesPath: string,
    filePath: string | undefined,
    fileUrl: string | undefined
): Promise<RuntimeKnowledgebaseManagedFile> {
    const normalizedPath = filePath?.trim().replace(/\\/g, '/')
    if (!normalizedPath) {
        if (fileUrl?.trim()) {
            throw new BadRequestException('fileUrl requires a managed knowledgebase filePath')
        }
        return {}
    }
    if (!files) {
        throw new BadRequestException('Managed knowledgebase file access is unavailable')
    }

    const prefix = `${filesPath}/`
    if (normalizedPath.includes('\0') || path.posix.isAbsolute(normalizedPath) || !normalizedPath.startsWith(prefix)) {
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

    const authorizedFile = await files.readFile(filesPath, relativePath, { metadataOnly: true })
    return {
        filePath: path.posix.join(filesPath, authorizedFile.filePath),
        ...(authorizedFile.fileUrl ? { fileUrl: authorizedFile.fileUrl } : {}),
        ...(authorizedFile.mimeType ? { mimeType: authorizedFile.mimeType } : {}),
        ...(authorizedFile.size == null ? {} : { size: authorizedFile.size })
    }
}

@Injectable()
@CommandHandler(StartKnowledgebaseDocumentsProcessingCommand)
export class StartKnowledgebaseDocumentsProcessingHandler implements ICommandHandler<StartKnowledgebaseDocumentsProcessingCommand> {
    constructor(
        private readonly documentService: KnowledgeDocumentService,
        @Optional() private readonly transformerRegistry?: DocumentTransformerRegistry
    ) {}

    async execute(command: StartKnowledgebaseDocumentsProcessingCommand): Promise<KnowledgebaseDocumentStatusResult> {
        if (command.input.knowledgebaseId) {
            await this.documentService.assertDocumentsWriteAccessInKnowledgebase(
                command.input.documentIds,
                command.input.knowledgebaseId
            )
        } else {
            await this.documentService.assertDocumentsWriteAccess(command.input.documentIds)
        }
        const docs = await this.documentService.startProcessing(
            command.input.documentIds,
            command.input.knowledgebaseId
        )
        return {
            documents: docs.map((document) => serializeKnowledgeDocument(document, this.transformerRegistry))
        }
    }
}

/**
 * Reprocesses documents only after resolving every id inside the requested
 * Knowledge base. Replacing parser configuration here lets a plugin upgrade a
 * processing strategy without gaining access to another scope or file path.
 */
@Injectable()
@CommandHandler(ReprocessKnowledgebaseDocumentsCommand)
export class ReprocessKnowledgebaseDocumentsHandler implements ICommandHandler<ReprocessKnowledgebaseDocumentsCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        @Optional() private readonly transformerRegistry?: DocumentTransformerRegistry
    ) {}

    async execute(command: ReprocessKnowledgebaseDocumentsCommand): Promise<KnowledgebaseDocumentStatusResult> {
        const knowledgebaseId = command.input.knowledgebaseId?.trim()
        const documentIds = uniqueStrings(command.input.documentIds)
        if (!knowledgebaseId) throw new BadRequestException('knowledgebaseId is required')
        if (!documentIds.length) throw new BadRequestException('documentIds is required')
        await this.knowledgebaseService.assertNotRebuilding(knowledgebaseId)
        const { items } = await this.documentService.findAll({
            where: { knowledgebaseId, id: In(documentIds) }
        })
        if (items.length !== documentIds.length) {
            throw new BadRequestException('Every document must belong to the selected knowledgebase')
        }
        const invalidatedAt = new Date().toISOString()
        for (const document of items) {
            document.parserConfig = resolveKnowledgeDocumentParserConfig({
                ...document,
                parserConfig: command.input.parserConfig
            })
            // An explicit reprocess request must not be short-circuited by the
            // worker's unchanged-processing-hash optimization. The worker will
            // compute and persist the new hash when this run begins.
            document.processingHash = null
            document.metadata = {
                ...(document.metadata ?? {}),
                imageUnderstandingInvalidatedAt: invalidatedAt
            }
        }
        await this.documentService.save(items)
        const documents = await this.documentService.startProcessing(documentIds, knowledgebaseId, 'full')
        return {
            documents: documents.map((document) => serializeKnowledgeDocument(document, this.transformerRegistry))
        }
    }
}

@Injectable()
@CommandHandler(GetKnowledgebaseDocumentStatusCommand)
export class GetKnowledgebaseDocumentStatusHandler implements ICommandHandler<GetKnowledgebaseDocumentStatusCommand> {
    constructor(
        private readonly documentService: KnowledgeDocumentService,
        @Optional() private readonly transformerRegistry?: DocumentTransformerRegistry
    ) {}

    async execute(command: GetKnowledgebaseDocumentStatusCommand): Promise<KnowledgebaseDocumentStatusResult> {
        const ids = command.input.documentIds.filter(Boolean)
        if (command.input.knowledgebaseId) {
            await this.documentService.assertDocumentsReadAccessInKnowledgebase(ids, command.input.knowledgebaseId)
        } else {
            await this.documentService.assertDocumentsReadAccess(ids)
        }
        if (!ids.length) {
            return { documents: [] }
        }
        const { items } = await this.documentService.findAll({
            where: {
                id: In(ids),
                ...(command.input.knowledgebaseId ? { knowledgebaseId: command.input.knowledgebaseId } : {})
            } as any
        })
        return {
            documents: items.map((document) => serializeKnowledgeDocument(document, this.transformerRegistry))
        }
    }
}

/**
 * Reads an independent Knowledge image through the existing Knowledge and
 * document access services. The cross-check prevents a caller from combining
 * an authorized Knowledge ID with a document ID from another Knowledge base.
 */
@Injectable()
@CommandHandler(ReadKnowledgebaseDocumentImageCommand)
export class ReadKnowledgebaseDocumentImageHandler implements ICommandHandler<ReadKnowledgebaseDocumentImageCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService
    ) {}

    async execute(command: ReadKnowledgebaseDocumentImageCommand): Promise<KnowledgebaseReadImageResult> {
        const { knowledgebaseId, documentId } = command.input
        await this.knowledgebaseService.findOne(knowledgebaseId)
        const document = await this.documentService.findOne(documentId)
        if (document.knowledgebaseId !== knowledgebaseId || !document.mimeType?.startsWith('image/')) {
            throw new BadRequestException('The selected Knowledge document is not an image in this knowledgebase')
        }
        const downloads = await this.documentService.getOriginalFileDownloads([documentId])
        const download = downloads[0]
        if (!download) throw new BadRequestException('The Knowledge image file is unavailable')
        return {
            knowledgebaseId,
            documentId,
            name: document.name || download.fileName,
            mimeType: document.mimeType || download.mimeType,
            size: download.content.length,
            sourceHash: document.sourceHash,
            reference: {
                source: WORKSPACE_FILES_SOURCE,
                tenantId: document.tenantId,
                catalog: 'knowledges',
                scopeId: knowledgebaseId,
                knowledgeId: knowledgebaseId,
                filePath: document.filePath,
                workspacePath: document.filePath,
                originalName: document.name || download.fileName,
                name: document.name || download.fileName,
                mimeType: document.mimeType || download.mimeType,
                size: download.content.length
            },
            buffer: download.content
        }
    }
}

@Injectable()
@CommandHandler(DeleteKnowledgebaseDocumentsCommand)
export class DeleteKnowledgebaseDocumentsHandler implements ICommandHandler<DeleteKnowledgebaseDocumentsCommand> {
    constructor(private readonly documentService: KnowledgeDocumentService) {}

    async execute(command: DeleteKnowledgebaseDocumentsCommand) {
        const documentIds = uniqueStrings(command.input.documentIds)
        if (!documentIds.length) {
            throw new BadRequestException('documentIds is required')
        }
        if (command.input.knowledgebaseId) {
            await this.documentService.assertDocumentsWriteAccessInKnowledgebase(
                documentIds,
                command.input.knowledgebaseId
            )
        } else {
            await this.documentService.assertDocumentsWriteAccess(documentIds)
        }
        const { items } = await this.documentService.findAll({
            where: {
                id: In(documentIds),
                ...(command.input.knowledgebaseId ? { knowledgebaseId: command.input.knowledgebaseId } : {})
            } as any,
            select: {
                id: true,
                knowledgebaseId: true
            } as any
        })
        const foundIds = uniqueStrings(items.map((item) => item.id).filter(Boolean) as string[])
        if (foundIds.length) {
            await this.documentService.deleteBulk(foundIds)
        }
        return {
            knowledgebaseId: command.input.knowledgebaseId,
            documentIds: foundIds,
            deletedDocumentCount: foundIds.length,
            missingDocumentIds: documentIds.filter((id) => !foundIds.includes(id))
        }
    }
}

async function uploadKnowledgebaseFile(
    deps: KnowledgebaseDocumentHandlerDeps,
    input: UploadKnowledgebaseDocumentFileCommand['input']
): Promise<KnowledgebaseUploadedFile> {
    if (!input.knowledgebaseId) {
        throw new BadRequestException('knowledgebaseId is required')
    }
    if (!input.file?.buffer?.length) {
        throw new BadRequestException('file buffer is required')
    }
    await deps.knowledgebaseService.assertKnowledgebaseWriteAccess(input.knowledgebaseId, { select: { id: true } })
    await deps.knowledgebaseService.assertNotRebuilding(input.knowledgebaseId)

    let parentFolder = ''
    if (input.parentId) {
        const parents = await deps.knowledgebaseService.resolveKnowledgebaseFolderAncestors(
            input.knowledgebaseId,
            input.parentId
        )
        parentFolder = buildLogicalFolderPath(parents)
    }
    const fileName = buildUniqueFileName(normalizeKnowledgebaseUploadedFileName(input.file.originalname))
    const folder = deps.knowledgeWorkAreaResolver.getFilesPath(path.posix.join(parentFolder, input.path ?? ''))
    return uploadKnowledgebaseBufferFile(deps.commandBus, {
        knowledgebaseId: input.knowledgebaseId,
        folder,
        fileName,
        originalName: input.file.originalname,
        buffer: input.file.buffer,
        mimeType: input.file.mimetype,
        size: input.file.size ?? input.file.buffer.length
    })
}

async function uploadKnowledgebaseBufferFile(
    commandBus: CommandBus,
    input: {
        knowledgebaseId: string
        folder: string
        fileName: string
        originalName: string
        buffer: Buffer
        mimeType?: string
        size?: number
    }
): Promise<KnowledgebaseUploadedFile> {
    const asset = await commandBus.execute(
        new UploadFileCommand({
            source: {
                kind: 'buffer',
                buffer: input.buffer,
                originalName: input.originalName,
                mimeType: input.mimeType,
                size: input.size ?? input.buffer.length
            },
            targets: [
                {
                    kind: 'volume',
                    catalog: 'knowledges',
                    knowledgeId: input.knowledgebaseId,
                    folder: input.folder,
                    fileName: input.fileName
                }
            ]
        })
    )
    const destination = getFileAssetDestination(asset, 'volume')
    if (!destination || destination.status !== 'success') {
        throw new InternalServerErrorException(destination?.error || 'Failed to upload knowledgebase file')
    }

    return {
        name: input.fileName,
        filePath: destination.path,
        fileUrl: destination.url,
        mimeType: input.mimeType,
        size: input.size ?? input.buffer.length,
        sourceHash: createHash('sha256').update(input.buffer).digest('hex')
    }
}

type ArchiveExtractionInput = {
    buffer: Buffer
    archiveDisplayPath: string
    archiveType: string
    depth: number
    maxDepth: number
    maxEntries: number
    maxEntrySizeBytes: number
    supportedExtensions: Set<string>
    state: ArchiveImportState
    commandBus: CommandBus
    storageRoot: string
    virtualPathPrefix: string
    knowledgebaseId: string
    parserConfig?: ImportKnowledgebaseArchiveCommand['input']['parserConfig']
    metadata?: ImportKnowledgebaseArchiveCommand['input']['metadata']
    packageId?: string
    packageCode?: string
    archivePath: string
}

type ArchiveFileEntry = {
    rawPath: string
    uncompressedSize?: number
    loadBuffer: () => Promise<Buffer>
}

async function extractArchiveToKnowledgeDocumentDrafts(input: ArchiveExtractionInput) {
    if (input.archiveType === 'zip') {
        return extractZipArchiveToKnowledgeDocumentDrafts(input)
    }
    if (input.archiveType === 'tar' || input.archiveType === 'tar.gz' || input.archiveType === 'tgz') {
        return extractTarArchiveToKnowledgeDocumentDrafts(input)
    }
    input.state.skipped.push({
        path: input.archiveDisplayPath,
        reason: `Archive type .${input.archiveType} is not supported by the default knowledgebase importer.`
    })
}

async function extractZipArchiveToKnowledgeDocumentDrafts(input: ArchiveExtractionInput) {
    let directory
    try {
        directory = await unzipper.Open.buffer(input.buffer)
    } catch (error) {
        const message = `Failed to read zip archive '${input.archiveDisplayPath}': ${getErrorMessage(error)}`
        if (input.depth === 0) {
            throw new BadRequestException(message)
        }
        input.state.skipped.push({ path: input.archiveDisplayPath, reason: message })
        return
    }

    for (const entry of directory.files) {
        if (entry.type !== 'File') {
            continue
        }
        await processArchiveFileEntry(input, {
            rawPath: decodeZipEntryPath(entry),
            uncompressedSize: Number((entry as any).vars?.uncompressedSize ?? (entry as any).uncompressedSize ?? 0),
            loadBuffer: () => entry.buffer()
        })
    }
}

async function extractTarArchiveToKnowledgeDocumentDrafts(input: ArchiveExtractionInput) {
    const tempDir = await fsPromises.mkdtemp(path.join(tmpdir(), 'kb-archive-import-'))
    const tempArchivePath = path.join(
        tempDir,
        input.archiveType === 'tar.gz' || input.archiveType === 'tgz' ? 'archive.tar.gz' : 'archive.tar'
    )
    const entryPromises: Promise<void>[] = []
    try {
        await fsPromises.writeFile(tempArchivePath, input.buffer)
        await tar.t({
            file: tempArchivePath,
            gzip: input.archiveType === 'tar.gz' || input.archiveType === 'tgz',
            onentry: (entry: any) => {
                if (entry.type !== 'File') {
                    entry.resume()
                    return
                }
                const chunks: Buffer[] = []
                const entryPromise = new Promise<void>((resolve, reject) => {
                    entry.on('data', (chunk: Buffer | string) => {
                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
                    })
                    entry.on('end', () => {
                        processArchiveFileEntry(input, {
                            rawPath: entry.path,
                            uncompressedSize: Number(entry.size ?? 0),
                            loadBuffer: async () => Buffer.concat(chunks)
                        }).then(resolve, reject)
                    })
                    entry.on('error', reject)
                })
                entryPromises.push(entryPromise)
            }
        } as any)
        await Promise.all(entryPromises)
    } catch (error) {
        const message = `Failed to read archive '${input.archiveDisplayPath}': ${getErrorMessage(error)}`
        if (input.depth === 0) {
            throw new BadRequestException(message)
        }
        input.state.skipped.push({ path: input.archiveDisplayPath, reason: message })
    } finally {
        await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
}

async function processArchiveFileEntry(input: ArchiveExtractionInput, entry: ArchiveFileEntry) {
    input.state.entryCount += 1
    const displayPath = input.virtualPathPrefix
        ? path.posix.join(input.virtualPathPrefix, entry.rawPath)
        : entry.rawPath
    if (input.state.entryCount > input.maxEntries) {
        input.state.skipped.push({ path: displayPath, reason: `Archive entry limit ${input.maxEntries} was reached.` })
        return
    }

    const normalizedLocalPath = normalizeArchiveEntryPath(entry.rawPath)
    if (!normalizedLocalPath) {
        input.state.skipped.push({ path: displayPath, reason: 'Unsafe or hidden archive entry path.' })
        return
    }
    const virtualPath = input.virtualPathPrefix
        ? path.posix.join(input.virtualPathPrefix, normalizedLocalPath)
        : normalizedLocalPath
    if (input.state.seenPaths.has(virtualPath)) {
        input.state.skipped.push({ path: virtualPath, reason: 'Duplicate archive path.' })
        return
    }
    input.state.seenPaths.add(virtualPath)

    if (Number.isFinite(entry.uncompressedSize) && Number(entry.uncompressedSize) > input.maxEntrySizeBytes) {
        input.state.skipped.push({ path: virtualPath, reason: 'Archive entry is too large.' })
        return
    }

    const buffer = await entry.loadBuffer()
    if (buffer.length > input.maxEntrySizeBytes) {
        input.state.skipped.push({ path: virtualPath, reason: 'Archive entry is too large.' })
        return
    }

    const archiveExtension = getArchiveExtension(normalizedLocalPath)
    if (archiveExtension) {
        if (!RECURSIVE_ARCHIVE_EXTENSIONS.has(archiveExtension)) {
            input.state.skipped.push({
                path: virtualPath,
                reason: `Nested archive type .${archiveExtension} is not supported by the default knowledgebase importer.`
            })
            return
        }
        if (input.depth >= input.maxDepth) {
            input.state.skipped.push({
                path: virtualPath,
                reason: `Nested archive depth limit ${input.maxDepth} was reached.`
            })
            return
        }
        await extractArchiveToKnowledgeDocumentDrafts({
            ...input,
            buffer,
            archiveDisplayPath: virtualPath,
            archiveType: archiveExtension,
            depth: input.depth + 1,
            virtualPathPrefix: stripExtension(virtualPath)
        })
        return
    }

    const type = getFileExtension(normalizedLocalPath)
    if (!type || !input.supportedExtensions.has(type)) {
        input.state.skipped.push({ path: virtualPath, reason: 'Unsupported file extension.' })
        return
    }

    const sourceHash = createHash('sha256').update(buffer).digest('hex')
    if (input.state.seenHashes.has(sourceHash)) {
        input.state.skipped.push({ path: virtualPath, reason: 'Duplicate archive file content.' })
        return
    }
    input.state.seenHashes.add(sourceHash)

    const targetFilePath = path.posix.join(input.storageRoot, virtualPath)
    const uploaded = await uploadKnowledgebaseBufferFile(input.commandBus, {
        knowledgebaseId: input.knowledgebaseId,
        folder: path.posix.dirname(targetFilePath),
        fileName: path.posix.basename(targetFilePath),
        originalName: path.posix.basename(virtualPath),
        buffer,
        mimeType: guessMimeType(type),
        size: buffer.length
    })

    const category = classificateDocumentCategory({ type } as Partial<IKnowledgeDocument>)
    input.state.drafts.push({
        knowledgebaseId: input.knowledgebaseId,
        sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
        sourceConfig: { key: 'contract-reference-package' },
        sourceKey: `contract-reference-package:${input.packageId ?? input.packageCode ?? input.archiveDisplayPath}:${virtualPath}`,
        name: path.posix.basename(virtualPath),
        type,
        category,
        filePath: uploaded.filePath,
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
        size: String(buffer.length),
        parserConfig: resolveKnowledgeDocumentParserConfig({
            type,
            category,
            parserConfig: input.parserConfig
        }),
        metadata: {
            ...(input.metadata ?? {}),
            documentType: 'contract-reference-source',
            packageId: input.packageId,
            packageCode: input.packageCode,
            archivePath: input.archivePath,
            archiveEntryPath: virtualPath,
            sourceHash
        }
    })
}

function serializeKnowledgeDocument(
    document: IKnowledgeDocument,
    transformerRegistry?: DocumentTransformerRegistry
): KnowledgebaseDocumentRecord {
    const parserConfig = resolveKnowledgeDocumentParserConfig(document)
    const processorType = parserConfig.transformerType || 'default'
    let processorLabel: KnowledgebaseDocumentRecord['processorLabel']
    try {
        processorLabel = transformerRegistry?.get(processorType).meta.label
    } catch {
        processorLabel = undefined
    }
    return {
        id: document.id,
        version: document.version,
        name: document.name,
        type: document.type,
        category: document.category,
        sourceType: document.sourceType,
        filePath: document.filePath,
        fileUrl: document.fileUrl,
        mimeType: document.mimeType,
        size: document.size,
        status: document.status,
        progress: document.progress,
        processMsg: document.processMsg,
        processorType,
        processorLabel,
        knowledgebaseId: document.knowledgebaseId,
        sourceHash: document.sourceHash,
        contentHash: document.contentHash,
        tokenNum: document.tokenNum,
        chunkNum: document.chunkNum,
        disabled: document.disabled,
        createdAt: document.createdAt?.toISOString(),
        updatedAt: document.updatedAt?.toISOString(),
        folderPath: document.folder ?? null,
        parentId: document.parent?.id ?? null,
        metadata: document.metadata as KnowledgebaseDocumentRecord['metadata']
    }
}

function normalizeKnowledgebaseFolderPath(value: string | undefined) {
    if (value === undefined) return undefined
    return value.replace(/\\/g, '/').split('/').filter(Boolean).join('/')
}

function normalizeFolderName(value: string) {
    const name = value?.trim()
    if (!name) throw new BadRequestException('Folder name is required')
    if (name === '.' || name === '..' || /[\\/]/.test(name)) {
        throw new BadRequestException('Folder name must be one path segment')
    }
    return name.slice(0, 240)
}

function escapeLikePattern(value: string) {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function buildUniqueFileName(originalname: string) {
    const parsed = path.parse(originalname)
    const suffix = `${Math.floor(Date.now() / 1000)}-${Math.floor(Math.random() * 1000)}`
    return `${parsed.name}-${suffix}${parsed.ext}`
}

function getFileExtension(fileName?: string | null) {
    const base = typeof fileName === 'string' ? path.posix.basename(fileName.split('?')[0].split('#')[0]) : ''
    const ext = base.includes('.') ? base.split('.').pop()?.trim().toLowerCase() : ''
    return ext || ''
}

function getArchiveExtension(fileName?: string | null) {
    const base =
        typeof fileName === 'string' ? path.posix.basename(fileName.split('?')[0].split('#')[0]).toLowerCase() : ''
    if (!base) {
        return ''
    }
    if (base.endsWith('.tar.gz')) {
        return 'tar.gz'
    }
    if (base.endsWith('.tgz')) {
        return 'tgz'
    }
    const ext = getFileExtension(base)
    return ARCHIVE_EXTENSIONS.has(ext) ? ext : ''
}

function stripExtension(fileName: string) {
    if (/\.tar\.gz$/i.test(fileName)) {
        return fileName.replace(/\.tar\.gz$/i, '')
    }
    const parsed = path.posix.parse(fileName)
    return path.posix.join(parsed.dir, parsed.name || parsed.base)
}

function normalizeDocumentType(type?: string, fileName?: string, mimeType?: string) {
    const ext = getFileExtension(fileName)
    return (type || ext || mimeType?.split('/').pop() || 'txt').toLowerCase()
}

function normalizePositiveInteger(value: unknown, fallback: number) {
    const normalized = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
    const normalized = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((item) => item?.trim()).filter((item): item is string => Boolean(item))))
}

function normalizeArchiveEntryPath(entryPath: string) {
    const replaced = entryPath.replace(/\\/g, '/')
    const normalized = path.posix.normalize(replaced).replace(/^\/+/, '')
    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
        return null
    }
    const segments = normalized.split('/').filter(Boolean)
    if (!segments.length || segments.some((segment) => segment === '__MACOSX' || segment.startsWith('.'))) {
        return null
    }
    const fileName = normalizeKnowledgebaseUploadedFileName(segments.pop())
    const folders = segments.map((segment) => sanitizePathSegment(repairUtf8Mojibake(segment))).filter(Boolean)
    return path.posix.join(...folders, fileName)
}

function normalizeKnowledgebaseUploadedFileName(fileName?: string) {
    return repairUtf8Mojibake(normalizeUploadedFileName(fileName))
}

function decodeZipEntryPath(entry: { path?: string; vars?: any; props?: any }) {
    const entryLike = entry as typeof entry & { pathBuffer?: unknown; isUnicode?: unknown; flags?: unknown }
    const pathBuffer = Buffer.isBuffer(entryLike.pathBuffer)
        ? entryLike.pathBuffer
        : Buffer.isBuffer(entry.vars?.pathBuffer)
          ? entry.vars.pathBuffer
          : Buffer.isBuffer(entry.props?.pathBuffer)
            ? entry.props.pathBuffer
            : undefined
    const isUnicode = Boolean(
        entryLike.isUnicode ??
        entry.vars?.isUnicode ??
        entry.props?.flags?.isUnicode ??
        (Number(entryLike.flags ?? entry.vars?.flags) || 0) & 0x800
    )

    if (!pathBuffer?.length) {
        return repairUtf8Mojibake(entry.path ?? '')
    }

    const utf8 = decodeBuffer(pathBuffer, 'utf-8')
    if (isUnicode || isUsableDecodedArchivePath(utf8)) {
        return repairUtf8Mojibake(utf8)
    }

    const gb18030 = decodeBuffer(pathBuffer, 'gb18030')
    if (isUsableDecodedArchivePath(gb18030)) {
        return repairUtf8Mojibake(gb18030)
    }

    return repairUtf8Mojibake(entry.path ?? utf8)
}

function decodeBuffer(buffer: Buffer, encoding: string) {
    try {
        return new TextDecoder(encoding).decode(buffer)
    } catch {
        return buffer.toString('utf8')
    }
}

function isUsableDecodedArchivePath(value: string) {
    return Boolean(value?.trim()) && !value.includes('\uFFFD')
}

function repairUtf8Mojibake(value: string) {
    if (!value) {
        return value
    }

    try {
        const candidate = Buffer.from(value, 'latin1').toString('utf8')
        if (
            candidate &&
            candidate !== value &&
            !candidate.includes('\uFFFD') &&
            scoreFileName(candidate) > scoreFileName(value)
        ) {
            return candidate
        }
    } catch {
        // Keep the original value when it is already decoded or cannot be repaired.
    }

    return value
}

function scoreFileName(value: string) {
    let score = 0
    for (const char of value) {
        if (char === '\uFFFD') {
            score -= 100
        } else if (/[\u4e00-\u9fff]/u.test(char)) {
            score += 3
        } else if (/[\u0080-\u009f]/u.test(char)) {
            score -= 4
        } else if (/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/u.test(char)) {
            score -= 2
        } else if (/[a-zA-Z0-9._/ -]/u.test(char)) {
            score += 1
        }
    }
    return score
}

function sanitizePathSegment(segment: string) {
    return segment.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim()
}

function guessMimeType(type: string) {
    switch (type) {
        case 'pdf':
            return 'application/pdf'
        case 'doc':
            return 'application/msword'
        case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        case 'xls':
            return 'application/vnd.ms-excel'
        case 'xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        case 'csv':
            return 'text/csv'
        case 'png':
            return 'image/png'
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg'
        case 'txt':
        case 'md':
        case 'markdown':
        case 'mdx':
            return 'text/plain'
        default:
            return undefined
    }
}
