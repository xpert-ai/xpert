import type { IArtifactWorkspaceFileReference } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { WorkspaceFilesRuntimeCapabilityService } from '../shared/runtime/workspace-files-runtime-capability.service'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { XpertService } from './xpert.service'

@Injectable()
export class XpertWorkspaceFilesService {
    constructor(
        @Inject(XpertService)
        private readonly xpertService: Pick<XpertService, 'findOne'>,
        @Inject(WorkspaceFilesRuntimeCapabilityService)
        private readonly workspaceFiles: Pick<WorkspaceFilesRuntimeCapabilityService, 'createScopedApi'>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>
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
        const xpert = await this.xpertService.findOne(xpertId)
        const contentSha256 = createHash('sha256').update(file.buffer).digest('hex')
        const scopedFiles = this.workspaceFiles.createScopedApi({
            tenantId: xpert.tenantId,
            userId: RequestContext.currentUserId(),
            xpertId: xpert.id,
            isolateByUser: false
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
        const volume = this.volumeClient.resolve({
            tenantId: xpert.tenantId,
            catalog: 'xperts',
            userId: RequestContext.currentUserId(),
            xpertId: xpert.id,
            isolateByUser: false
        })
        return new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
    }
}
