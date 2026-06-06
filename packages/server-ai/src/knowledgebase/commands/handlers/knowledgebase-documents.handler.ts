import { createHash } from 'node:crypto'
import fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BadRequestException, Injectable } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
    classificateDocumentCategory,
    DocumentSourceProviderCategoryEnum,
    IKnowledgeDocument
} from '@xpert-ai/contracts'
import {
    AgentMiddlewareKnowledgebaseDocumentRecord,
    AgentMiddlewareKnowledgebaseDocumentStatusResult,
    AgentMiddlewareKnowledgebaseUploadedFile
} from '@xpert-ai/plugin-sdk'
import { getErrorMessage, normalizeUploadedFileName } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import * as tar from 'tar'
import { In } from 'typeorm'
import unzipper from 'unzipper'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { resolveKnowledgeDocumentParserConfig } from '../../../knowledge-document/parser-config'
import { KnowledgeWorkAreaResolver } from '../../../shared'
import { KnowledgebaseService } from '../../knowledgebase.service'
import {
    CreateKnowledgebaseDocumentsCommand,
    DeleteKnowledgebaseDocumentsCommand,
    GetKnowledgebaseDocumentStatusCommand,
    ImportKnowledgebaseArchiveCommand,
    StartKnowledgebaseDocumentsProcessingCommand,
    UploadKnowledgebaseDocumentFileCommand
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

type KnowledgebaseDocumentHandlerDeps = {
    knowledgebaseService: KnowledgebaseService
    documentService: KnowledgeDocumentService
    knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
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
        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
    ) {}

    async execute(command: UploadKnowledgebaseDocumentFileCommand) {
        return uploadKnowledgebaseFile(
            {
                knowledgebaseService: this.knowledgebaseService,
                documentService: this.documentService,
                knowledgeWorkAreaResolver: this.knowledgeWorkAreaResolver
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
        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
    ) {}

    async execute(command: ImportKnowledgebaseArchiveCommand) {
        const input = command.input
        const fileName = normalizeUploadedFileName(input.file?.originalname)
        const archiveExtension = getArchiveExtension(fileName)
        if (!archiveExtension) {
            throw new BadRequestException('Archive file extension is required')
        }

        const archive = await uploadKnowledgebaseFile(
            {
                knowledgebaseService: this.knowledgebaseService,
                documentService: this.documentService,
                knowledgeWorkAreaResolver: this.knowledgeWorkAreaResolver
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
        const workArea = await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId: input.knowledgebaseId
        })
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
            workArea,
            storageRoot: path.posix.join(baseFolder, stripExtension(fileName)),
            virtualPathPrefix: '',
            knowledgebaseId: input.knowledgebaseId,
            parserConfig: input.parserConfig,
            metadata: input.metadata,
            packageId: input.packageId,
            packageCode: input.packageCode,
            archivePath: archive.filePath
        })

        const documents = state.drafts.length ? await this.documentService.createBulk(state.drafts) : []
        let processingStarted = false
        if (input.process && documents.length) {
            await this.documentService.startProcessing(
                documents.map((doc) => doc.id),
                input.knowledgebaseId
            )
            processingStarted = true
        }
        if (!documents.length) {
            state.warnings.push('No supported documents were imported from the archive.')
        }

        return {
            archive,
            documents: documents.map(serializeKnowledgeDocument),
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
        private readonly documentService: KnowledgeDocumentService
    ) {}

    async execute(command: CreateKnowledgebaseDocumentsCommand) {
        const input = command.input
        await this.knowledgebaseService.assertNotRebuilding(input.knowledgebaseId)
        const docs = await this.documentService.createBulk(
            input.documents.map((document) => {
                const type = normalizeDocumentType(document.type, document.name ?? document.filePath, document.mimeType)
                const category =
                    (document.category as IKnowledgeDocument['category']) ??
                    classificateDocumentCategory({ type } as Partial<IKnowledgeDocument>)
                return {
                    ...document,
                    knowledgebaseId: input.knowledgebaseId,
                    sourceType: (document.sourceType ??
                        DocumentSourceProviderCategoryEnum.LocalFile) as IKnowledgeDocument['sourceType'],
                    name: document.name ?? path.posix.basename(document.filePath ?? 'knowledge-document'),
                    type,
                    category,
                    parserConfig: resolveKnowledgeDocumentParserConfig({
                        type,
                        category,
                        parserConfig: document.parserConfig ?? input.parserConfig
                    }),
                    metadata: {
                        ...(input.metadata ?? {}),
                        ...(document.metadata ?? {})
                    },
                    size: document.size == null ? undefined : String(document.size)
                } satisfies Partial<IKnowledgeDocument>
            })
        )
        let processingStarted = false
        if (input.process && docs.length) {
            await this.documentService.startProcessing(
                docs.map((doc) => doc.id),
                input.knowledgebaseId
            )
            processingStarted = true
        }
        return {
            documents: docs.map(serializeKnowledgeDocument),
            processingStarted
        }
    }
}

@Injectable()
@CommandHandler(StartKnowledgebaseDocumentsProcessingCommand)
export class StartKnowledgebaseDocumentsProcessingHandler implements ICommandHandler<StartKnowledgebaseDocumentsProcessingCommand> {
    constructor(private readonly documentService: KnowledgeDocumentService) {}

    async execute(
        command: StartKnowledgebaseDocumentsProcessingCommand
    ): Promise<AgentMiddlewareKnowledgebaseDocumentStatusResult> {
        const docs = await this.documentService.startProcessing(
            command.input.documentIds,
            command.input.knowledgebaseId
        )
        return {
            documents: docs.map(serializeKnowledgeDocument)
        }
    }
}

@Injectable()
@CommandHandler(GetKnowledgebaseDocumentStatusCommand)
export class GetKnowledgebaseDocumentStatusHandler implements ICommandHandler<GetKnowledgebaseDocumentStatusCommand> {
    constructor(private readonly documentService: KnowledgeDocumentService) {}

    async execute(
        command: GetKnowledgebaseDocumentStatusCommand
    ): Promise<AgentMiddlewareKnowledgebaseDocumentStatusResult> {
        const ids = command.input.documentIds.filter(Boolean)
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
            documents: items.map(serializeKnowledgeDocument)
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
): Promise<AgentMiddlewareKnowledgebaseUploadedFile> {
    if (!input.knowledgebaseId) {
        throw new BadRequestException('knowledgebaseId is required')
    }
    if (!input.file?.buffer?.length) {
        throw new BadRequestException('file buffer is required')
    }
    await deps.knowledgebaseService.assertNotRebuilding(input.knowledgebaseId)

    let parentFolder = ''
    if (input.parentId) {
        const parents = await deps.documentService.findAncestors(input.parentId)
        parentFolder = parents
            .map((item) => item.name)
            .filter(Boolean)
            .join('/')
    }
    const fileName = buildUniqueFileName(normalizeUploadedFileName(input.file.originalname))
    const workArea = await deps.knowledgeWorkAreaResolver.resolve({
        tenantId: RequestContext.currentTenantId(),
        userId: RequestContext.currentUserId(),
        knowledgebaseId: input.knowledgebaseId
    })
    const folder = deps.knowledgeWorkAreaResolver.getFilesPath(path.posix.join(parentFolder, input.path ?? ''))
    const filePath = path.posix.join(folder, fileName)
    const absoluteFilePath = workArea.volume.path(filePath)
    await fsPromises.mkdir(path.dirname(absoluteFilePath), { recursive: true })
    await fsPromises.writeFile(absoluteFilePath, input.file.buffer)

    return {
        name: fileName,
        filePath,
        fileUrl: workArea.volume.publicUrl(filePath),
        mimeType: input.file.mimetype,
        size: input.file.size ?? input.file.buffer.length,
        sourceHash: createHash('sha256').update(input.file.buffer).digest('hex')
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
    workArea: Awaited<ReturnType<KnowledgeWorkAreaResolver['resolve']>>
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
            rawPath: entry.path,
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

    const filePath = path.posix.join(input.storageRoot, virtualPath)
    const absoluteFilePath = input.workArea.volume.path(filePath)
    await fsPromises.mkdir(path.dirname(absoluteFilePath), { recursive: true })
    await fsPromises.writeFile(absoluteFilePath, buffer)

    const category = classificateDocumentCategory({ type } as Partial<IKnowledgeDocument>)
    input.state.drafts.push({
        knowledgebaseId: input.knowledgebaseId,
        sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
        sourceConfig: { key: 'contract-reference-package' },
        name: path.posix.basename(virtualPath),
        type,
        category,
        filePath,
        fileUrl: input.workArea.volume.publicUrl(filePath),
        mimeType: guessMimeType(type),
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

function serializeKnowledgeDocument(document: IKnowledgeDocument): AgentMiddlewareKnowledgebaseDocumentRecord {
    return {
        id: document.id,
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
        knowledgebaseId: document.knowledgebaseId,
        metadata: document.metadata as AgentMiddlewareKnowledgebaseDocumentRecord['metadata']
    }
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
    const fileName = normalizeUploadedFileName(segments.pop())
    const folders = segments.map((segment) => sanitizePathSegment(segment)).filter(Boolean)
    return path.posix.join(...folders, fileName)
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
