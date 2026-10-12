import { assertPublicWorkspacePath } from '../../volume/workspace-managed-path'
import { IFileAssetDestination, IUploadFileSandboxTarget } from '@xpert-ai/contracts'
import {
    FileUploadTargetStrategy,
    IFileUploadTargetStrategy,
    TFileUploadContext,
    TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { ForbiddenException, Injectable } from '@nestjs/common'
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
        assertPublicWorkspacePath(filePath)
        let localPath: string
        const root = await VolumeHandle.openExistingFile(target.workspaceBoundaryPath ?? target.workspacePath)
        try {
            // Pin the checked root; later symlink replacement must not retarget this upload.
            assertPublicWorkspacePath(root.filePath)
            const workspaceRelativePath = target.workspaceBoundaryPath
                ? path.relative(target.workspaceBoundaryPath, target.workspacePath)
                : ''
            const boundaryRelativePath = normalizeRelativePath(workspaceRelativePath, filePath)
            assertPublicWorkspacePath(boundaryRelativePath)
            await VolumeHandle.writeFile(root.descriptorPath, boundaryRelativePath, source.buffer, {
                boundaryRoot: root.descriptorPath,
                assertCanWrite: (canonicalRelativePath, fileStat) => {
                    assertPublicWorkspacePath(canonicalRelativePath, fileStat)
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
            localPath = path.join(root.filePath, boundaryRelativePath)
        } finally {
            await root.fileHandle.close()
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
