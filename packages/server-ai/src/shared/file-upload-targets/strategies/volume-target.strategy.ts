import { IFileAssetDestination, IUploadFileVolumeTarget } from '@xpert-ai/contracts'
import {
    FileUploadTargetStrategy,
    IFileUploadTargetStrategy,
    TFileUploadContext,
    TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { isProjectGovernedContentPath, VOLUME_CLIENT, VolumeClient } from '../../volume'
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
        await volume.writeFile(filePath, source.buffer, {
            assertCanWrite: (canonicalRelativePath, fileStat) => {
                if (
                    volume.scope.catalog === 'projects' &&
                    (isProjectGovernedContentPath(canonicalRelativePath) || (fileStat && fileStat.nlink !== 1))
                ) {
                    throw new ForbiddenException(
                        t('server-ai:Error.ProjectGovernedContentRuntimeReadOnly', {
                            defaultValue: 'Project instructions and skills are read-only during Agent runtime'
                        })
                    )
                }
            }
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
