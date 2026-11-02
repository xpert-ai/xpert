import { IFileAssetDestination, IUploadFileSandboxTarget } from '@xpert-ai/contracts'
import {
    FileUploadTargetStrategy,
    IFileUploadTargetStrategy,
    TFileUploadContext,
    TResolvedFileUploadSource
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { CheckStorageQuotaCommand } from '@xpert-ai/server-core'
import axios from 'axios'
import { isUtf8Text, normalizeFileName, normalizeRelativePath } from '../utils'

@Injectable()
@FileUploadTargetStrategy('sandbox:backend_upload')
export class SandboxBackendTargetStrategy implements IFileUploadTargetStrategy<IUploadFileSandboxTarget> {
    constructor(private readonly commands: CommandBus) {}
    async upload(
        source: TResolvedFileUploadSource,
        target: IUploadFileSandboxTarget,
        context: TFileUploadContext
    ): Promise<IFileAssetDestination> {
        if (!target.sandboxUrl || !target.workspaceId) {
            throw new Error('Sandbox backend upload requires sandboxUrl and workspaceId')
        }

        if (!isUtf8Text(source.originalName, source.mimeType)) {
            throw new Error('Sandbox backend upload currently supports UTF-8 text files only')
        }

        const fileName = normalizeFileName(target.fileName || source.originalName)
        const filePath = normalizeRelativePath(target.folder, fileName)

        // Legacy remote storage has no account quota protocol. Managed accounts
        // cannot resolve this unknown root; ordinary platform uploads retain their path.
        await this.commands.execute(
            new CheckStorageQuotaCommand({
                kind: 'sandbox',
                scope: {
                    kind: 'user',
                    tenantId: context.request.tenantId,
                    organizationId: context.request.organizationId,
                    userId: context.request.userId
                },
                root: ''
            })
        )
        await axios.post(`${target.sandboxUrl}/file/create`, {
            workspace_id: target.workspaceId,
            file_path: filePath,
            file_contents: source.buffer.toString('utf8')
        })

        return {
            kind: 'sandbox',
            status: 'success',
            path: filePath,
            metadata: {
                ...(target.metadata ?? {}),
                mode: target.mode,
                workspaceId: target.workspaceId,
                sandboxUrl: target.sandboxUrl
            }
        }
    }
}
