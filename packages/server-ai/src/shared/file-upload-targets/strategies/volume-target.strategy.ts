import { IFileAssetDestination, IUploadFileVolumeTarget } from '@xpert-ai/contracts'
import {
    FileUploadTargetStrategy,
    IFileUploadTargetStrategy,
    TFileUploadContext,
    TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import fsPromises from 'fs/promises'
import path from 'path'
import { VOLUME_CLIENT, VolumeClient } from '../../volume'
import { normalizeFileName, normalizeRelativePath, resolveVolumeTarget } from '../utils'

@Injectable()
@FileUploadTargetStrategy('volume')
export class VolumeTargetStrategy implements IFileUploadTargetStrategy<IUploadFileVolumeTarget> {
    constructor(
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
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
        await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
        await fsPromises.writeFile(absolutePath, source.buffer)
        const url = volume.publicUrl(filePath)

        return {
            kind: 'volume',
            status: 'success',
            path: filePath,
            url,
            metadata: {
                ...(target.metadata ?? {}),
                catalog: target.catalog,
                filePath,
                fileUrl: url,
                absolutePath,
                mimeType: source.mimeType
            }
        }
    }
}
