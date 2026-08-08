import type { IArtifactWorkspaceFileReference } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { WorkspaceFilesRuntimeCapabilityService } from '../shared/runtime/workspace-files-runtime-capability.service'
import { XpertService } from './xpert.service'

@Injectable()
export class XpertWorkspaceFilesService {
    constructor(
        @Inject(XpertService)
        private readonly xpertService: Pick<XpertService, 'findOne'>,
        @Inject(WorkspaceFilesRuntimeCapabilityService)
        private readonly workspaceFiles: Pick<WorkspaceFilesRuntimeCapabilityService, 'createScopedApi'>
    ) {}

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
}
