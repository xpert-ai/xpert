import { IFileAssetDestination, IUploadFileSandboxTarget } from '@xpert-ai/contracts'
import {
    FileUploadTargetStrategy,
    IFileUploadTargetStrategy,
    TFileUploadContext,
    TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { ForbiddenException, Injectable } from '@nestjs/common'
import fsPromises from 'fs/promises'
import { t } from 'i18next'
import path from 'path'
import { urlJoin } from '@xpert-ai/server-common'
import { isProjectGovernedContentPath, VolumeHandle } from '../../volume'
import { normalizeFileName, normalizeRelativePath } from '../utils'

@Injectable()
@FileUploadTargetStrategy('sandbox:mounted_workspace')
export class SandboxMountedWorkspaceTargetStrategy implements IFileUploadTargetStrategy<IUploadFileSandboxTarget> {
    async upload(
        source: TResolvedFileUploadSource,
        target: IUploadFileSandboxTarget,
        _context: TFileUploadContext
    ): Promise<IFileAssetDestination> {
        if (!target.workspacePath) {
            throw new Error('Sandbox mounted workspace path is required')
        }

        const fileName = normalizeFileName(target.fileName || source.originalName)
        const filePath = normalizeRelativePath(target.folder, fileName)
        let localPath: string
        if (target.workspaceBoundaryPath) {
            const workspaceRelativePath = path.relative(target.workspaceBoundaryPath, target.workspacePath)
            const boundaryRelativePath = normalizeRelativePath(workspaceRelativePath, filePath)
            await VolumeHandle.writeFile(target.workspaceBoundaryPath, boundaryRelativePath, source.buffer, {
                boundaryRoot: target.workspaceBoundaryPath,
                assertCanWrite: (canonicalRelativePath, fileStat) => {
                    if (
                        target.projectContentReadOnly &&
                        (isProjectGovernedContentPath(canonicalRelativePath) || (fileStat && fileStat.nlink !== 1))
                    ) {
                        throw new ForbiddenException(
                            t('server-ai:Error.ProjectContentGenericWriteForbidden', {
                                defaultValue:
                                    'Project instructions and skills must be changed from Project configuration'
                            })
                        )
                    }
                }
            })
            localPath = path.join(target.workspaceBoundaryPath, boundaryRelativePath)
        } else {
            localPath = path.join(target.workspacePath, filePath)
            await fsPromises.mkdir(path.dirname(localPath), { recursive: true })
            await fsPromises.writeFile(localPath, source.buffer)
        }

        return {
            kind: 'sandbox',
            status: 'success',
            path: filePath,
            url: target.workspaceUrl ? urlJoin(target.workspaceUrl, filePath) : undefined,
            metadata: {
                ...(target.metadata ?? {}),
                mode: target.mode,
                localPath,
                workspacePath: target.workspacePath,
                workspaceUrl: target.workspaceUrl
            }
        }
    }
}
