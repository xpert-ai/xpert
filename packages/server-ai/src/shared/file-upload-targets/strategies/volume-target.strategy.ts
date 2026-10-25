import { writeWorkspaceFile } from '../../volume/workspace-file-io'
import { IFileAssetDestination, IUploadFileVolumeTarget } from '@xpert-ai/contracts'
import {
    FileUploadTargetStrategy,
    IFileUploadTargetStrategy,
    TFileUploadContext,
    TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { ContentFileOwnershipService } from '../../volume/content-file-ownership.service'
import { VOLUME_CLIENT, VolumeClient } from '../../volume'
import { normalizeFileName, normalizeRelativePath, resolveVolumeTarget } from '../utils'

@Injectable()
@FileUploadTargetStrategy('volume')
export class VolumeTargetStrategy implements IFileUploadTargetStrategy<IUploadFileVolumeTarget> {
    constructor(
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        @Optional() private readonly contentOwnership?: ContentFileOwnershipService
    ) {}

    async upload(
        source: TResolvedFileUploadSource,
        target: IUploadFileVolumeTarget,
        context: TFileUploadContext
    ): Promise<IFileAssetDestination> {
        const volume = resolveVolumeTarget(this.volumeClient, target, context.request)
        const fileName = normalizeFileName(target.fileName || source.originalName)
        const filePath = normalizeRelativePath(target.folder, fileName)
        const absolutePath = volume.path(filePath)
        const verifyOwnership = () => this.contentOwnership?.assertUnmanaged(volume.scope.tenantId, volume.scope.projectId, filePath)
        await writeWorkspaceFile(volume, filePath, source.buffer, {
            assertUnmanaged: verifyOwnership,
            // This strategy receives a resolved upload target; the caller owns human/Assistant authorization.
            authorize: async () => undefined
        })
        const url = volume.exposesDirectFileUrls() ? volume.publicUrl(filePath) : undefined
        const { fileUrl: _fileUrl, url: _url, ...targetMetadata } = target.metadata ?? {}

        return {
            kind: 'volume',
            status: 'success',
            path: filePath,
            ...(url ? { url } : {}),
            metadata: {
                ...targetMetadata,
                catalog: target.catalog,
                filePath,
                ...(url ? { fileUrl: url } : {}),
                absolutePath,
                mimeType: source.mimeType
            }
        }
    }
}
