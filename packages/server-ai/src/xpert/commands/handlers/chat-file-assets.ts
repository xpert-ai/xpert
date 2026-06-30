import { BadRequestException } from '@nestjs/common'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import type {
    IChatConversation,
    IChatMessage,
    IFileAsset,
    IStorageFile,
    IUploadFileTarget,
    TChatRequestHuman
} from '@xpert-ai/contracts'
import { getFileAssetDestination, getStorageFileFromAsset, UploadFileCommand } from '@xpert-ai/server-core'
import mime from 'mime-types'
import path from 'path'
import {
    AttachFileToConversationCommand,
    CreateFileAssetCommand,
    EnqueueFileParseCommand,
    GetFileAssetByStorageFileQuery
} from '../../../file-understanding'
import type { AgentFile, FileAsset } from '../../../file-understanding'

const DEFAULT_UPLOAD_TARGET: IUploadFileTarget = {
    kind: 'storage',
    directory: 'contexts',
    prefix: 'files'
}
const MAX_INLINE_PARSE_BYTES = 2_000_000
const MAX_DATA_URL_BYTES = 25 * 1024 * 1024

type FileRecord = Record<string, unknown>

type FileAssetHandle = {
    id: string
    storageFileId?: string
}

export type NormalizeChatRequestFilesContext = {
    conversationId?: string
    threadId?: string
    projectId?: string
    xpertId?: string
}

export async function normalizeChatHumanInputFiles(
    input: TChatRequestHuman | null | undefined,
    deps: {
        commandBus: CommandBus
        queryBus: QueryBus
        context?: NormalizeChatRequestFilesContext
    }
): Promise<{ input: TChatRequestHuman | null | undefined; changed: boolean }> {
    if (!input || !Array.isArray(input.files) || input.files.length === 0) {
        return { input, changed: false }
    }

    const { files, changed } = await normalizeChatRequestFiles(input.files, deps)
    if (!changed) {
        return { input, changed: false }
    }

    return {
        input: {
            ...input,
            files
        },
        changed: true
    }
}

export async function normalizeChatRequestFiles(
    files: unknown[],
    deps: {
        commandBus: CommandBus
        queryBus: QueryBus
        context?: NormalizeChatRequestFilesContext
    }
): Promise<{ files: unknown[]; changed: boolean }> {
    let changed = false
    const normalizedFiles: unknown[] = []

    for (const file of files) {
        const normalized = await normalizeChatRequestFile(file, deps)
        normalizedFiles.push(normalized.file)
        changed = changed || normalized.changed
    }

    return { files: normalizedFiles, changed }
}

export function toChatFileAssetReferences(files: unknown): Array<{ id: string }> {
    return toFileAssetHandles(files).map((file) => ({ id: file.id }))
}

/**
 * @deprecated Use `toChatFileAssetReferences` and persist `fileAssets`. This
 * bridge only preserves old clients that still submit StorageFile-shaped
 * attachments without a `storageFileId`.
 */
export function toLegacyChatStorageFileAttachments(files: unknown): IStorageFile[] {
    if (!Array.isArray(files)) {
        return []
    }

    return files
        .map((file) => {
            if (!isRecord(file)) {
                return null
            }
            if (readString(file, 'storageFileId')) {
                return null
            }
            const id = readString(file, 'id')
            return id
                ? ({
                      ...file,
                      id
                  } as unknown as IStorageFile)
                : null
        })
        .filter((file): file is IStorageFile => Boolean(file))
}

export function getChatMessageFiles(message: IChatMessage): unknown[] {
    // Retry reconstructs the original human input from persisted relations.
    // Prefer FileAsset handles, but append StorageFile attachments for old runs.
    const fileAssets = Array.isArray(message.fileAssets)
        ? message.fileAssets.map((file) => ({
              id: file.id,
              fileId: file.id,
              storageFileId: file.storageFileId,
              originalName: file.originalName,
              mimeType: file.mimeType,
              size: file.size,
              status: file.status,
              parseStatus: file.status,
              parseMode: file.parseMode,
              purpose: file.purpose,
              capabilities: file.capabilities,
              summary: file.summary,
              workspacePath: file.workspacePath
          }))
        : []
    const legacyAttachments = Array.isArray(message.attachments) ? message.attachments : []
    return [...fileAssets, ...legacyAttachments]
}

export async function attachChatFileAssetsToConversation(
    commandBus: CommandBus,
    conversation: Pick<IChatConversation, 'id' | 'threadId'>,
    files: unknown,
    context?: {
        xpertId?: string
        projectId?: string
        sandboxProvider?: string | null
    }
) {
    const fileAssets = toFileAssetHandles(files)
    if (!conversation?.id || !fileAssets.length) {
        return
    }

    // Attach before invoking the agent so built-in file tools can enforce the
    // conversation boundary and workspace projection has the final run context.
    await Promise.all(
        fileAssets.map((file) =>
            commandBus.execute(
                new AttachFileToConversationCommand({
                    fileAssetId: file.id,
                    conversationId: conversation.id,
                    storageFileId: file.storageFileId,
                    threadId: conversation.threadId,
                    projectId: context?.projectId,
                    xpertId: context?.xpertId,
                    sandboxProvider: context?.sandboxProvider
                })
            )
        )
    )
}

async function normalizeChatRequestFile(
    file: unknown,
    deps: {
        commandBus: CommandBus
        queryBus: QueryBus
        context?: NormalizeChatRequestFilesContext
    }
): Promise<{ file: unknown; changed: boolean }> {
    if (!isRecord(file)) {
        return { file, changed: false }
    }

    const storageFileId = readString(file, 'storageFileId')
    const existingFileAssetId = readFileAssetId(file)
    if (existingFileAssetId) {
        // Already a FileAsset-backed AgentFile; normalize aliases so persistence
        // code can rely on fileAssetId/fileId/id carrying the same durable id.
        return {
            file: toAgentFileLike(file, {
                id: existingFileAssetId,
                storageFileId
            }),
            changed:
                readString(file, 'id') !== existingFileAssetId ||
                readString(file, 'fileId') !== existingFileAssetId ||
                readString(file, 'fileAssetId') !== existingFileAssetId
        }
    }

    if (storageFileId) {
        // StorageFile-only handles come from older clients or integrations.
        // Bridge them into FileAsset once, then persist only the FileAsset id.
        const fileAsset = await resolveOrCreateFileAssetForStorageFile(file, storageFileId, deps)
        return {
            file: toAgentFileLike(file, {
                id: fileAsset.id,
                storageFileId: fileAsset.storageFileId ?? storageFileId,
                status: fileAsset.status,
                parseStatus: fileAsset.status,
                purpose: fileAsset.purpose,
                parseMode: fileAsset.parseMode,
                capabilities: fileAsset.capabilities ?? [],
                summary: fileAsset.summary,
                workspacePath: fileAsset.workspacePath
            }),
            changed: true
        }
    }

    const dataUrl = readDataUrl(file)
    if (!dataUrl) {
        return { file, changed: false }
    }

    // Webhook sources such as WeChat may only have inline bytes. Persist them
    // through the same storage + FileAsset pipeline as normal context uploads.
    return {
        file: await createFileAssetFromDataUrl(file, dataUrl, deps),
        changed: true
    }
}

/**
 * Normalizes new ChatKit `AgentFile` handles into FileAsset relation stubs.
 * StorageFile-only legacy inputs intentionally fall through to the deprecated
 * attachment bridge.
 */
function toFileAssetHandles(files: unknown): FileAssetHandle[] {
    if (!Array.isArray(files)) {
        return []
    }

    const seen = new Set<string>()
    const handles = files
        .map<FileAssetHandle | null>((file) => {
            if (!isRecord(file)) {
                return null
            }
            const storageFileId = readString(file, 'storageFileId') ?? undefined
            // Bare id/fileId values may be legacy upload ids; require explicit
            // fileAssetId or the full AgentFile pair before writing relations.
            const fileAssetId = readString(file, 'fileAssetId') ?? (storageFileId ? readString(file, 'fileId') : null)
            return typeof fileAssetId === 'string'
                ? {
                      id: fileAssetId,
                      storageFileId
                  }
                : null
        })
        .filter((file): file is FileAssetHandle => Boolean(file))

    return handles.filter((file) => {
        if (seen.has(file.id)) {
            return false
        }
        seen.add(file.id)
        return true
    })
}

function readFileAssetId(file: FileRecord) {
    const explicitFileAssetId = readString(file, 'fileAssetId')
    if (explicitFileAssetId) {
        return explicitFileAssetId
    }

    // A bare fileId can be a legacy ChatKit upload id. Treat it as a FileAsset
    // only when paired with storageFileId, which is the AgentFile shape.
    const storageFileId = readString(file, 'storageFileId')
    const fileId = readString(file, 'fileId')
    return storageFileId && fileId ? fileId : null
}

async function resolveOrCreateFileAssetForStorageFile(
    file: FileRecord,
    storageFileId: string,
    deps: {
        commandBus: CommandBus
        queryBus: QueryBus
        context?: NormalizeChatRequestFilesContext
    }
) {
    const existingFileAsset = await deps.queryBus.execute<GetFileAssetByStorageFileQuery, FileAsset | null>(
        new GetFileAssetByStorageFileQuery(storageFileId)
    )
    if (existingFileAsset) {
        return existingFileAsset
    }

    // CreateFileAssetCommand can hydrate metadata from a StorageFile-shaped
    // object; when we only receive an id, preserve whatever file fields arrived.
    const storageFile = buildStorageFileStub(file, storageFileId)
    const fileAsset = await deps.commandBus.execute<CreateFileAssetCommand, FileAsset>(
        new CreateFileAssetCommand({
            storageFile,
            purpose: 'chat_attachment',
            parseMode: 'auto',
            ...deps.context,
            metadata: buildFileAssetMetadata(file, 'chat_request_storage_file')
        })
    )

    return await deps.commandBus.execute<EnqueueFileParseCommand, FileAsset>(
        new EnqueueFileParseCommand(fileAsset.id, {
            runInline: false
        })
    )
}

async function createFileAssetFromDataUrl(
    file: FileRecord,
    dataUrl: ParsedDataUrl,
    deps: {
        commandBus: CommandBus
        queryBus: QueryBus
        context?: NormalizeChatRequestFilesContext
    }
) {
    const originalName = resolveOriginalName(file, dataUrl.mimeType)
    // Upload the decoded bytes first so StorageFile remains the object-storage
    // source of truth and FileAsset can focus on understanding/parsing state.
    const uploadAsset = await deps.commandBus.execute<UploadFileCommand, IFileAsset>(
        new UploadFileCommand({
            source: {
                kind: 'buffer',
                buffer: dataUrl.buffer,
                originalName,
                mimeType: dataUrl.mimeType,
                size: dataUrl.buffer.byteLength
            },
            targets: [DEFAULT_UPLOAD_TARGET],
            metadata: buildFileAssetMetadata(file, 'chat_request_data_url')
        })
    )
    const destination = getFileAssetDestination(uploadAsset, DEFAULT_UPLOAD_TARGET.kind)
    if (!destination || destination.status !== 'success') {
        throw new BadRequestException(destination?.error || 'Failed to upload chat request file')
    }

    const storageFile = getStorageFileFromAsset(uploadAsset)
    if (!storageFile?.id) {
        throw new BadRequestException('Failed to upload chat request file')
    }

    const uploadedFile = {
        originalname: originalName,
        mimetype: dataUrl.mimeType,
        size: dataUrl.buffer.byteLength,
        buffer: dataUrl.buffer
    }
    const fileAsset = await deps.commandBus.execute<CreateFileAssetCommand, FileAsset>(
        new CreateFileAssetCommand({
            storageFile,
            uploadedFile,
            purpose: 'chat_attachment',
            parseMode: 'auto',
            ...deps.context,
            metadata: buildFileAssetMetadata(file, 'chat_request_data_url')
        })
    )
    const parsedAsset = await deps.commandBus.execute<EnqueueFileParseCommand, FileAsset>(
        new EnqueueFileParseCommand(fileAsset.id, {
            // Small images are cheap enough to parse inline, which lets the
            // immediate agent turn see preview/vision metadata when available.
            runInline: dataUrl.buffer.byteLength <= MAX_INLINE_PARSE_BYTES
        })
    )

    return toAgentFileLike(file, {
        id: parsedAsset.id,
        storageFileId: storageFile.id,
        objectKey: storageFile.file,
        url: storageFile.url ?? storageFile.fileUrl,
        fileUrl: storageFile.fileUrl ?? storageFile.url,
        thumbUrl: storageFile.thumbUrl,
        originalName: storageFile.originalName ?? originalName,
        size: storageFile.size ?? dataUrl.buffer.byteLength,
        mimeType: storageFile.mimetype ?? dataUrl.mimeType,
        status: parsedAsset.status,
        parseStatus: parsedAsset.status,
        purpose: parsedAsset.purpose,
        parseMode: parsedAsset.parseMode,
        capabilities: parsedAsset.capabilities ?? [],
        summary: parsedAsset.summary,
        workspacePath: parsedAsset.workspacePath
    })
}

function toAgentFileLike(
    source: FileRecord,
    file: Partial<AgentFile> & {
        id: string
        storageFileId?: string
    }
) {
    const fileAssetId = file.id
    return {
        ...source,
        ...file,
        id: fileAssetId,
        fileId: fileAssetId,
        fileAssetId,
        ...(file.storageFileId ? { storageFileId: file.storageFileId } : {}),
        ...(file.mimeType ? { mimetype: file.mimeType } : {})
    }
}

function buildStorageFileStub(file: FileRecord, storageFileId: string): IStorageFile {
    return {
        id: storageFileId,
        file: readString(file, 'file') ?? readString(file, 'objectKey') ?? storageFileId,
        url: readString(file, 'url') ?? readString(file, 'fileUrl'),
        fileUrl: readString(file, 'fileUrl') ?? readString(file, 'url'),
        thumb: readString(file, 'thumb'),
        thumbUrl: readString(file, 'thumbUrl') ?? readString(file, 'thumb'),
        originalName: readString(file, 'originalName') ?? readString(file, 'name') ?? readString(file, 'fileName'),
        size: readNumber(file, 'size'),
        mimetype: readString(file, 'mimetype') ?? readString(file, 'mimeType') ?? readString(file, 'type'),
        storageProvider: readString(file, 'storageProvider')
    } as IStorageFile
}

function buildFileAssetMetadata(file: FileRecord, source: string): Record<string, unknown> {
    return compactRecord({
        source,
        fileKey: readString(file, 'fileKey'),
        inputName: readString(file, 'name'),
        originalName: readString(file, 'originalName'),
        mimeType: readString(file, 'mimeType') ?? readString(file, 'mimetype') ?? readString(file, 'type'),
        extension: readString(file, 'extension')
    })
}

type ParsedDataUrl = {
    mimeType: string
    buffer: Buffer
}

function readDataUrl(file: FileRecord): ParsedDataUrl | null {
    const url = readString(file, 'fileUrl') ?? readString(file, 'url')
    if (!url?.startsWith('data:')) {
        return null
    }

    // Only accept inline base64 payloads. Do not fetch arbitrary URLs from chat
    // input; integrations should upload or inline the bytes before dispatch.
    const match = /^data:([^;,]+)?((?:;[^,]*)*),([\s\S]*)$/.exec(url)
    if (!match || !match[2].split(';').includes('base64')) {
        throw new BadRequestException('Invalid chat request file data URL')
    }

    const mimeType = (
        match[1] ||
        readString(file, 'mimeType') ||
        readString(file, 'mimetype') ||
        'application/octet-stream'
    )
        .trim()
        .toLowerCase()
    const payload = match[3].replace(/\s/g, '')
    const estimatedSize = Math.floor((payload.length * 3) / 4)
    if (estimatedSize > MAX_DATA_URL_BYTES) {
        throw new BadRequestException('Chat request file is too large')
    }

    const buffer = Buffer.from(payload, 'base64')
    if (buffer.byteLength > MAX_DATA_URL_BYTES) {
        throw new BadRequestException('Chat request file is too large')
    }
    if (payload.length > 0 && buffer.byteLength === 0) {
        throw new BadRequestException('Invalid chat request file data URL')
    }

    return { mimeType, buffer }
}

function resolveOriginalName(file: FileRecord, mimeType: string) {
    const candidate =
        readString(file, 'originalName') ??
        readString(file, 'name') ??
        readString(file, 'fileName') ??
        readString(file, 'fileKey') ??
        'chat-file'
    const normalizedName = path.basename(candidate.trim() || 'chat-file')
    if (path.extname(normalizedName)) {
        return normalizedName
    }

    const extension = mime.extension(mimeType)
    return extension ? `${normalizedName}.${extension}` : normalizedName
}

function isRecord(value: unknown): value is FileRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(record: FileRecord, key: string) {
    const value = record[key]
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(record: FileRecord, key: string) {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function compactRecord(record: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null))
}
