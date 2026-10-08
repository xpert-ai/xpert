import type { IArtifactWorkspaceFileReference, IXpert } from '@xpert-ai/contracts'
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { WorkspaceFilesRuntimeCapabilityService } from '../shared/runtime/workspace-files-runtime-capability.service'
import { resolveXpertDataVolumeScope, VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { XpertService } from './xpert.service'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { t } from 'i18next'

@Injectable()
export class XpertWorkspaceFilesService {
    constructor(
        @Inject(XpertService)
        private readonly xpertService: Pick<XpertService, 'findOne'>,
        @Inject(WorkspaceFilesRuntimeCapabilityService)
        private readonly workspaceFiles: Pick<WorkspaceFilesRuntimeCapabilityService, 'createScopedApi'>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>,
        @Inject(XpertWorkspaceService)
        private readonly workspaces: Pick<XpertWorkspaceService, 'canAccess'>
    ) {}

    async list(xpertId: string, path?: string, deepth?: number) {
        const client = await this.createClient(xpertId)
        return client.list('', { path, deepth })
    }

    async read(xpertId: string, filePath: string) {
        const client = await this.createClient(xpertId)
        return client.readFile('', filePath)
    }

    async download(xpertId: string, filePath: string) {
        const client = await this.createClient(xpertId)
        return client.getDownloadTarget('', filePath)
    }

    async save(xpertId: string, filePath: string, content: string) {
        const client = await this.createClient(xpertId)
        return client.saveFile('', filePath, content)
    }

    async saveBinary(xpertId: string, filePath: string, content: Buffer) {
        const client = await this.createClient(xpertId)
        return client.saveBinaryFile('', filePath, content)
    }

    async uploadToFolder(
        xpertId: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ) {
        const client = await this.createClient(xpertId)
        return client.uploadFile('', folderPath, file)
    }

    async delete(xpertId: string, filePath: string) {
        const client = await this.createClient(xpertId)
        await client.deleteFile('', filePath)
    }

    async upload(xpertId: string, file: Express.Multer.File): Promise<IArtifactWorkspaceFileReference> {
        const scope = await this.resolveScope(xpertId)
        const contentSha256 = createHash('sha256').update(file.buffer).digest('hex')
        const scopedFiles = this.workspaceFiles.createScopedApi({
            ...scope,
            scopeId: scope.xpertId
        })
        const written = await scopedFiles.writeRuntimeBuffer({
            folder: `uploads/${contentSha256}`,
            fileName: file.originalname,
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size ?? file.buffer.length
        })

        return written.reference
    }

    private async createClient(xpertId: string) {
        const xpert = await this.xpertService.findOne(xpertId)
        const userId = RequestContext.currentUserId()
        const tenantId = RequestContext.currentTenantId()
        if (
            !userId ||
            !tenantId ||
            xpert.tenantId !== tenantId ||
            (xpert.createdById !== userId && !(await this.workspaces.canAccess(xpert.workspaceId, userId)))
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.WorkspaceFileAccessDenied', { defaultValue: 'Workspace file access was denied.' })
            )
        }
        const volume = await this.volumeClient.resolve(this.scopeFor(xpert)).ensureRoot()
        return new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
    }

    private async resolveScope(xpertId: string) {
        return this.scopeFor(await this.xpertService.findOne(xpertId))
    }

    private scopeFor(xpert: IXpert) {
        return resolveXpertDataVolumeScope({
            tenantId: xpert.tenantId,
            userId: RequestContext.currentUserId(),
            xpertId: xpert.id,
            workspaceDataScope: xpert.workspaceDataScope
        })
    }
}
