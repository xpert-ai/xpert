import { IStorageFile } from '@xpert-ai/contracts'
import { FileStorage, RequestContext, StorageFileService } from '@xpert-ai/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Repository } from 'typeorm'
import { VOLUME_CLIENT, VolumeClient } from '../shared/volume'
import { XpertWorkAreaResolver } from '../shared/volume/work-area'
import { normalizeFileName, normalizeRelativePath } from '../shared/file-upload-targets/utils'
import { readPageImageFileName, readPageImageStorageKey, readWorkspaceProvider } from './domain/page-image-artifact'
import { resolveFileAssetWorkspaceRelativePath, resolveFileAssetWorkspaceVolumeScope } from './domain/workspace-file'
import { FileArtifact, FileAsset } from './entities'

export type ProjectFileAssetToWorkspaceInput = {
    fileAssetId: string
    storageFileId?: string
    conversationId?: string
    threadId?: string
    projectId?: string
    xpertId?: string
    environmentId?: string
    sandboxProvider?: string | null
    buffer?: Buffer
}

@Injectable()
export class FileWorkspaceProjectionService {
    readonly #logger = new Logger(FileWorkspaceProjectionService.name)

    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>,
        private readonly storageFileService: StorageFileService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        private readonly workAreaResolver: XpertWorkAreaResolver
    ) {}

    /**
     * Projects an uploaded object-store file into the agent workspace so models
     * with sandbox_file or shell tools can read the original bytes by path.
     */
    async projectFileAsset(input: ProjectFileAssetToWorkspaceInput) {
        const asset = await this.fileAssetRepository.findOne({ where: { id: input.fileAssetId } })
        if (!asset) {
            return null
        }

        const conversationId = input.conversationId ?? asset.conversationId
        const xpertId = input.xpertId ?? asset.xpertId
        const projectId = input.projectId ?? asset.projectId
        if (!conversationId || (!input.environmentId && !projectId && !xpertId)) {
            return asset
        }

        const tenantId = RequestContext.currentTenantId() ?? asset.tenantId
        const userId = RequestContext.currentUserId() ?? asset.userId
        if (!tenantId || !userId) {
            return asset
        }

        try {
            const sandboxProvider = input.sandboxProvider ?? readWorkspaceProvider(asset.metadata)
            const workArea = await this.workAreaResolver.resolve({
                tenantId,
                userId,
                provider: sandboxProvider,
                xpertId,
                projectId,
                conversationId,
                environmentId: input.environmentId
            })
            // Store paths in the workspace namespace visible to agent tools, not
            // the backend server path used to write the projected file.
            const baseRelativePath =
                workArea.sessionPath?.relativePath ?? normalizeRelativePath('sessions', conversationId)
            const storageFile = await this.resolveStorageFile(input.storageFileId ?? asset.storageFileId)
            let projectedAsset = asset
            let assetFolderRelativePath = normalizeRelativePath(baseRelativePath, 'files', asset.id)
            const projectionScope = resolveProjectionScope(workArea.volumeScope)
            const existingProjection = readWorkspaceProjection(asset.metadata)
            const existingRelativePath =
                existingProjection?.catalog === projectionScope.catalog &&
                existingProjection.scopeId === projectionScope.scopeId
                    ? normalizeWorkspaceRelativePath(existingProjection.relativePath)
                    : null
            const existingServerPath = existingRelativePath ? workArea.volume.path(existingRelativePath) : null
            const hasCurrentProjection = existingServerPath ? await pathExists(existingServerPath) : false

            if (!hasCurrentProjection) {
                const existingFileName =
                    typeof existingProjection?.relativePath === 'string'
                        ? path.basename(existingProjection.relativePath)
                        : asset.id
                const fileName = normalizeFileName(storageFile?.originalName ?? asset.originalName ?? existingFileName)
                const relativePath = normalizeRelativePath(assetFolderRelativePath, fileName)
                const serverPath = workArea.volume.path(relativePath)
                const buffer =
                    input.buffer ??
                    (storageFile
                        ? await this.readStorageFile(storageFile)
                        : await this.readExistingWorkspaceFile(asset, tenantId, userId))
                if (!buffer) {
                    return asset
                }

                await fsPromises.mkdir(path.dirname(serverPath), { recursive: true })
                await fsPromises.writeFile(serverPath, buffer)

                const workspacePath = path.posix.join(workArea.workspaceRoot, relativePath)
                asset.workspacePath = workspacePath
                asset.conversationId = conversationId
                asset.threadId = input.threadId ?? asset.threadId
                asset.projectId = projectId ?? asset.projectId
                asset.xpertId = xpertId ?? asset.xpertId
                asset.capabilities = Array.from(new Set([...(asset.capabilities ?? []), 'workspace']))
                asset.metadata = {
                    ...(asset.metadata ?? {}),
                    workspace: {
                        relativePath,
                        workspacePath,
                        absolutePath: serverPath,
                        catalog: projectionScope.catalog,
                        scopeId: projectionScope.scopeId,
                        provider: sandboxProvider ?? null,
                        projectedAt: new Date().toISOString()
                    }
                }
                projectedAsset = await this.fileAssetRepository.save(asset)
            } else if (hasCurrentProjection && existingRelativePath) {
                assetFolderRelativePath = path.posix.dirname(existingRelativePath)
                const patch: Partial<FileAsset> = {
                    conversationId,
                    threadId: input.threadId ?? asset.threadId,
                    projectId: projectId ?? asset.projectId,
                    xpertId: xpertId ?? asset.xpertId,
                    capabilities: Array.from(new Set([...(asset.capabilities ?? []), 'workspace']))
                }
                asset.conversationId = patch.conversationId
                asset.threadId = patch.threadId
                asset.projectId = patch.projectId
                asset.xpertId = patch.xpertId
                asset.capabilities = patch.capabilities
                asset.workspacePath = path.posix.join(workArea.workspaceRoot, existingRelativePath)
                projectedAsset = await this.fileAssetRepository.save(asset)
            }

            await this.projectPageImageArtifacts({
                fileAssetId: asset.id,
                storageProvider: storageFile?.storageProvider,
                assetFolderRelativePath,
                workspaceRoot: workArea.workspaceRoot,
                resolveServerPath: (relativePath) => workArea.volume.path(relativePath)
            })
            return projectedAsset
        } catch (error) {
            this.#logger.warn(
                `Failed to project file asset ${asset.id} into workspace: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            return asset
        }
    }

    private async resolveStorageFile(storageFileId?: string): Promise<IStorageFile | null> {
        if (!storageFileId) {
            return null
        }
        return (await this.storageFileService.findOne(storageFileId)) ?? null
    }

    private async readStorageFile(storageFile: IStorageFile) {
        const provider = new FileStorage().getProvider(storageFile.storageProvider)
        return await provider.getFile(storageFile.file)
    }

    private async readExistingWorkspaceFile(asset: FileAsset, tenantId: string, userId: string) {
        const sourceScope = resolveFileAssetWorkspaceVolumeScope(asset, { tenantId, userId })
        const relativePath = resolveFileAssetWorkspaceRelativePath(asset)
        if (!sourceScope || !relativePath) {
            return null
        }
        const sourceVolume = await this.volumeClient.resolve(sourceScope).ensureRoot()
        return await fsPromises.readFile(sourceVolume.path(relativePath))
    }

    private async projectPageImageArtifacts(input: {
        fileAssetId: string
        storageProvider?: string
        assetFolderRelativePath: string
        workspaceRoot: string
        resolveServerPath: (relativePath: string) => string
    }) {
        const artifacts = await this.fileArtifactRepository.find({
            where: {
                fileAssetId: input.fileAssetId,
                kind: 'page_image'
            },
            select: {
                id: true,
                metadata: true,
                anchor: true
            },
            order: {
                orderNo: 'ASC'
            }
        })
        if (!artifacts.length) {
            return
        }

        const storageProvider = new FileStorage().getProvider(input.storageProvider)
        const projectedArtifacts: FileArtifact[] = []
        for (const artifact of artifacts) {
            const storageKey = readPageImageStorageKey(artifact.metadata)
            if (!storageKey) {
                continue
            }

            const page = artifact.anchor?.page
            const fallbackFileName =
                typeof page === 'number' ? `page-${String(page).padStart(4, '0')}.png` : `${artifact.id}.png`
            const fileName = normalizeFileName(readPageImageFileName(artifact.metadata) ?? fallbackFileName)
            const relativePath = normalizeRelativePath(input.assetFolderRelativePath, 'pages', fileName)
            const serverPath = input.resolveServerPath(relativePath)
            const workspacePath = path.posix.join(input.workspaceRoot, relativePath)

            try {
                const buffer = await storageProvider.getFile(storageKey)
                await fsPromises.mkdir(path.dirname(serverPath), { recursive: true })
                await fsPromises.writeFile(serverPath, buffer)
                artifact.metadata = {
                    ...(artifact.metadata ?? {}),
                    workspacePath,
                    workspaceRelativePath: relativePath,
                    projectedAt: new Date().toISOString()
                }
                projectedArtifacts.push(artifact)
            } catch (error) {
                this.#logger.warn(
                    `Failed to project PDF page image "${storageKey}" for ${input.fileAssetId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
            }
        }

        if (projectedArtifacts.length) {
            await this.fileArtifactRepository.save(projectedArtifacts)
        }
    }
}

type WorkspaceProjectionMetadata = {
    relativePath?: unknown
    workspacePath?: unknown
    catalog?: unknown
    scopeId?: unknown
}

function readWorkspaceProjection(metadata?: Record<string, unknown>): WorkspaceProjectionMetadata | null {
    const workspace = metadata?.workspace
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
        return null
    }
    return {
        relativePath: 'relativePath' in workspace ? workspace.relativePath : undefined,
        workspacePath: 'workspacePath' in workspace ? workspace.workspacePath : undefined,
        catalog: 'catalog' in workspace ? workspace.catalog : undefined,
        scopeId: 'scopeId' in workspace ? workspace.scopeId : undefined
    }
}

function resolveProjectionScope(scope: {
    catalog: string
    environmentId?: string
    projectId?: string
    xpertId?: string
}) {
    const scopeId = scope.environmentId ?? scope.projectId ?? scope.xpertId
    if (!scopeId) {
        throw new Error(`Workspace projection scope "${scope.catalog}" does not have an id`)
    }
    return {
        catalog: scope.catalog,
        scopeId
    }
}

async function pathExists(filePath: string) {
    try {
        await fsPromises.access(filePath)
        return true
    } catch {
        return false
    }
}

function normalizeWorkspaceRelativePath(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
        return null
    }
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
        return null
    }
    return normalized
}
