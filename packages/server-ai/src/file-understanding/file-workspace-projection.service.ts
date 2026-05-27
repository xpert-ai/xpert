import { IStorageFile } from '@xpert-ai/contracts'
import { FileStorage, RequestContext, StorageFileService } from '@xpert-ai/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Repository } from 'typeorm'
import { XpertWorkAreaResolver } from '../shared/volume/work-area'
import { normalizeFileName, normalizeRelativePath } from '../shared/file-upload-targets/utils'
import { FileAsset } from './entities'

export type ProjectFileAssetToWorkspaceInput = {
    fileAssetId: string
    storageFileId?: string
    conversationId?: string
    threadId?: string
    projectId?: string
    xpertId?: string
    sandboxProvider?: string | null
    buffer?: Buffer
}

@Injectable()
export class FileWorkspaceProjectionService {
    readonly #logger = new Logger(FileWorkspaceProjectionService.name)

    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        private readonly storageFileService: StorageFileService,
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
        if (asset.workspacePath) {
            return asset
        }

        const conversationId = input.conversationId ?? asset.conversationId
        const xpertId = input.xpertId ?? asset.xpertId
        const projectId = input.projectId ?? asset.projectId
        if (!conversationId || (!projectId && !xpertId)) {
            return asset
        }

        const tenantId = RequestContext.currentTenantId() ?? asset.tenantId
        const userId = RequestContext.currentUserId() ?? asset.userId
        if (!tenantId || !userId) {
            return asset
        }

        try {
            const storageFile = await this.resolveStorageFile(input.storageFileId ?? asset.storageFileId)
            if (!storageFile) {
                return asset
            }

            const workArea = await this.workAreaResolver.resolve({
                tenantId,
                userId,
                provider: input.sandboxProvider,
                xpertId,
                projectId,
                conversationId
            })
            // Store paths in the workspace namespace visible to agent tools, not
            // the backend server path used to write the projected file.
            const fileName = normalizeFileName(
                storageFile.originalName ?? asset.originalName ?? path.basename(storageFile.file)
            )
            const baseRelativePath =
                workArea.sessionPath?.relativePath ?? normalizeRelativePath('sessions', conversationId)
            const relativePath = normalizeRelativePath(baseRelativePath, 'files', asset.id, fileName)
            const serverPath = workArea.volume.path(relativePath)
            const buffer = input.buffer ?? (await this.readStorageFile(storageFile))

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
                    provider: input.sandboxProvider ?? null,
                    projectedAt: new Date().toISOString()
                }
            }
            return await this.fileAssetRepository.save(asset)
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
}
