import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    RequestContext,
    WorkspaceFile,
    WorkspaceFileBuffer,
    WorkspaceFileReference,
    WorkspaceFilesApi,
    WorkspaceUploadBufferInput
} from '@xpert-ai/plugin-sdk'
import { getFileAssetDestination, UploadFileCommand } from '@xpert-ai/server-core'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient, type VolumeScope } from '../volume'

type WorkspaceFileVolumeScope = Omit<VolumeScope, 'catalog'> & {
    catalog: WorkspaceFile['catalog']
}

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
        volumeScope: WorkspaceFileVolumeScope
        catalog: WorkspaceFile['catalog']
        scopeId?: string
    } {
        const tenantId = normalizeOptionalString(input.tenantId) ?? RequestContext.currentTenantId()
        if (!tenantId) {
            throw new BadRequestException('tenantId is required for workspace file access')
        }
        const userId = normalizeOptionalString(input.userId) ?? RequestContext.currentUserId()
        const catalog = resolveWorkspaceFileCatalog(input)

        switch (catalog) {
            case 'projects': {
                const projectId = normalizeOptionalString(input.projectId) ?? normalizeOptionalString(input.scopeId)
                if (!projectId) {
                    throw new BadRequestException('projectId is required for project workspace file access')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        projectId,
                        userId
                    },
                    catalog,
                    scopeId: projectId
                }
            }
            case 'xperts': {
                const xpertId = normalizeOptionalString(input.xpertId) ?? normalizeOptionalString(input.scopeId)
                if (!xpertId) {
                    throw new BadRequestException('xpertId is required for xpert workspace file access')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        xpertId,
                        userId,
                        isolateByUser: input.isolateByUser ?? false
                    },
                    catalog,
                    scopeId: xpertId
                }
            }
            case 'users': {
                const targetUserId = normalizeOptionalString(input.scopeId) ?? userId
                if (!targetUserId) {
                    throw new BadRequestException('userId is required for user workspace file access')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        userId: targetUserId
                    },
                    catalog,
                    scopeId: targetUserId
                }
            }
            case 'knowledges': {
                const knowledgeId = normalizeOptionalString(input.knowledgeId) ?? normalizeOptionalString(input.scopeId)
                if (!knowledgeId) {
                    throw new BadRequestException('knowledgeId is required for knowledge workspace file access')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        knowledgeId,
                        userId
                    },
                    catalog,
                    scopeId: knowledgeId
                }
            }
            case 'skills': {
                const rootId = normalizeOptionalString(input.rootId) ?? normalizeOptionalString(input.scopeId)
                if (!rootId) {
                    throw new BadRequestException('rootId is required for skill workspace file access')
                }
                return {
                    volumeScope: {
                        tenantId,
                        catalog,
                        rootId,
                        userId
                    },
                    catalog,
                    scopeId: rootId
                }
            }
        }
    }
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveWorkspaceFileCatalog(
    input: WorkspaceUploadBufferInput | WorkspaceFileReference
): WorkspaceFile['catalog'] {
    const catalog = normalizeOptionalString(input.catalog)
    if (catalog) {
        if (isWorkspaceFileCatalog(catalog)) {
            return catalog
        }
        throw new BadRequestException(`Unsupported workspace file catalog: ${catalog}`)
    }
    if (normalizeOptionalString(input.projectId)) {
        return 'projects'
    }
    if (normalizeOptionalString(input.knowledgeId)) {
        return 'knowledges'
    }
    if (normalizeOptionalString(input.rootId)) {
        return 'skills'
    }
    if (normalizeOptionalString(input.xpertId)) {
        return 'xperts'
    }
    throw new BadRequestException('workspace file catalog is required')
}

function isWorkspaceFileCatalog(value: string): value is WorkspaceFile['catalog'] {
    return ['projects', 'users', 'knowledges', 'skills', 'xperts'].includes(value)
}

function normalizeRequiredWorkspaceFilePath(value: unknown) {
    const normalized = normalizeOptionalString(value)?.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
    if (!normalized || normalized === '.' || normalized.split('/').includes('..')) {
        throw new BadRequestException('workspace file path is required')
    }
    return normalized
}
