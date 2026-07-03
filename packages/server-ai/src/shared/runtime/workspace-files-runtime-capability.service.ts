import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    RequestContext,
    WorkspaceFile,
    WorkspaceFileBuffer,
    WorkspaceFileReference,
    WorkspaceFilesApi,
    WorkspaceUnderstandFileInput,
    WorkspaceUnderstoodFile,
    WorkspaceUploadBufferInput
} from '@xpert-ai/plugin-sdk'
import { getFileAssetDestination, UploadFileCommand } from '@xpert-ai/server-core'
import {
    CreateWorkspaceFileAssetCommand,
    isWorkspaceFileCatalog,
    resolveWorkspaceFileCatalog,
    resolveWorkspaceVolumeScope,
    type FileAsset,
    type WorkspaceVolumeScopeResolution
} from '../../file-understanding'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../volume'

@Injectable()
export class WorkspaceFilesRuntimeCapabilityService implements WorkspaceFilesApi {
    readonly api: WorkspaceFilesApi = this

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: Pick<CommandBus, 'execute'>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>
    ) {}

    async uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile> {
        if (!Buffer.isBuffer(input.buffer) || !input.buffer.length) {
            throw new BadRequestException('workspace file buffer is required')
        }
        const originalName =
            normalizeOptionalString(input.originalName) ?? normalizeOptionalString(input.fileName) ?? 'workspace-file'
        const { volumeScope, catalog, scopeId } = this.resolveVolumeScope(input)
        const asset = await this.commandBus.execute(
            new UploadFileCommand({
                source: {
                    kind: 'buffer',
                    buffer: input.buffer,
                    originalName,
                    mimeType: normalizeOptionalString(input.mimeType),
                    size: typeof input.size === 'number' ? input.size : input.buffer.length
                },
                targets: [
                    {
                        kind: 'volume',
                        ...volumeScope,
                        folder: normalizeOptionalString(input.folder),
                        fileName: normalizeOptionalString(input.fileName),
                        metadata: input.metadata
                    }
                ]
            })
        )
        const destination = getFileAssetDestination(asset, 'volume')
        if (!destination || destination.status !== 'success' || !destination.path) {
            throw new InternalServerErrorException(destination?.error || 'Failed to upload workspace file')
        }

        const fileUrl =
            normalizeOptionalString(destination.url) ?? normalizeOptionalString(destination.metadata?.fileUrl)
        return {
            name: normalizeOptionalString(input.fileName) ?? originalName,
            filePath: destination.path,
            workspacePath: destination.path,
            ...(fileUrl ? { fileUrl, url: fileUrl } : {}),
            ...(normalizeOptionalString(input.mimeType) ? { mimeType: normalizeOptionalString(input.mimeType) } : {}),
            size: typeof input.size === 'number' ? input.size : input.buffer.length,
            catalog,
            scopeId,
            metadata: destination.metadata
        }
    }

    async understandFile(input: WorkspaceUnderstandFileInput): Promise<WorkspaceUnderstoodFile> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        const { catalog, scopeId } = this.resolveVolumeScope(input)
        const fileAsset = await this.commandBus.execute<CreateWorkspaceFileAssetCommand, FileAsset>(
            new CreateWorkspaceFileAssetCommand({
                ...input,
                filePath
            })
        )
        const metadata = readWorkspaceMetadata(fileAsset.metadata)
        const fileUrl = normalizeOptionalString(input.fileUrl) ?? normalizeOptionalString(input.url) ?? metadata.fileUrl
        const originalName =
            normalizeOptionalString(input.originalName) ??
            normalizeOptionalString(fileAsset.originalName) ??
            filePath.split('/').filter(Boolean).pop() ??
            filePath
        const mimeType =
            normalizeOptionalString(input.mimeType) ??
            normalizeOptionalString(fileAsset.mimeType) ??
            normalizeOptionalString(metadata.mimeType)
        const size =
            typeof input.size === 'number' && Number.isFinite(input.size)
                ? input.size
                : typeof fileAsset.size === 'number'
                  ? fileAsset.size
                  : metadata.size

        return {
            id: fileAsset.id,
            fileId: fileAsset.id,
            fileAssetId: fileAsset.id,
            ...(fileAsset.storageFileId ? { storageFileId: fileAsset.storageFileId } : {}),
            name: originalName,
            originalName,
            filePath,
            workspacePath: fileAsset.workspacePath ?? filePath,
            ...(fileUrl ? { fileUrl, url: fileUrl } : {}),
            ...(mimeType ? { mimeType } : {}),
            ...(typeof size === 'number' ? { size } : {}),
            catalog,
            scopeId,
            status: fileAsset.status,
            parseStatus: fileAsset.status,
            purpose: fileAsset.purpose,
            parseMode: fileAsset.parseMode,
            capabilities: fileAsset.capabilities ?? [],
            summary: fileAsset.summary,
            metadata: fileAsset.metadata
        }
    }

    async readBuffer(input: WorkspaceFileReference): Promise<WorkspaceFileBuffer> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        const { volumeScope, catalog, scopeId } = this.resolveVolumeScope(input)
        const volume = this.volumeClient.resolve(volumeScope)
        const client = new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
        const buffer = await client.readBuffer('', filePath)
        const fileUrl = volume.publicUrl(filePath)

        return {
            name: filePath.split('/').filter(Boolean).pop() ?? filePath,
            filePath,
            workspacePath: filePath,
            fileUrl,
            url: fileUrl,
            size: buffer.length,
            catalog,
            scopeId,
            buffer
        }
    }

    async deleteFile(input: WorkspaceFileReference): Promise<void> {
        const filePath = normalizeRequiredWorkspaceFilePath(input.filePath)
        const { volumeScope } = this.resolveVolumeScope(input)
        const client = new VolumeSubtreeClient(this.volumeClient.resolve(volumeScope), { allowRootWorkspace: true })
        await client.deleteFile('', filePath)
    }

    private resolveVolumeScope(input: WorkspaceUploadBufferInput | WorkspaceFileReference): {
        volumeScope: WorkspaceVolumeScopeResolution['volumeScope']
        catalog: WorkspaceFile['catalog']
        scopeId?: string
    } {
        const tenantId = normalizeOptionalString(input.tenantId) ?? RequestContext.currentTenantId()
        if (!tenantId) {
            throw new BadRequestException('tenantId is required for workspace file access')
        }
        const userId = normalizeOptionalString(input.userId) ?? RequestContext.currentUserId()
        const catalog = normalizeOptionalString(input.catalog)
        if (catalog && !isWorkspaceFileCatalog(catalog)) {
            throw new BadRequestException(`Unsupported workspace file catalog: ${catalog}`)
        }

        const resolved = resolveWorkspaceVolumeScope(input, { tenantId, userId })
        if (!resolved) {
            throw new BadRequestException(resolveWorkspaceVolumeScopeError(input, 'workspace file access'))
        }
        return resolved
    }
}

function readWorkspaceMetadata(metadata?: Record<string, unknown>) {
    const workspace = metadata?.workspace
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
        return {}
    }
    const record = workspace as Record<string, unknown>
    return {
        fileUrl: normalizeOptionalString(record.fileUrl),
        mimeType: normalizeOptionalString(record.mimeType),
        size: typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined
    }
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeRequiredWorkspaceFilePath(value: unknown) {
    const normalized = normalizeOptionalString(value)?.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
    if (!normalized || normalized === '.' || normalized.split('/').includes('..')) {
        throw new BadRequestException('workspace file path is required')
    }
    return normalized
}

function resolveWorkspaceVolumeScopeError(input: WorkspaceUploadBufferInput | WorkspaceFileReference, context: string) {
    const catalog = resolveWorkspaceFileCatalog(input)
    switch (catalog) {
        case 'projects':
            return `projectId is required for project ${context}`
        case 'xperts':
            return `xpertId is required for xpert ${context}`
        case 'users':
            return `userId is required for user ${context}`
        case 'knowledges':
            return `knowledgeId is required for knowledge ${context}`
        case 'skills':
            return `rootId is required for skill ${context}`
        default:
            return 'workspace file catalog is required'
    }
}
