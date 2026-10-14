import { initializeTemplateFiles } from '../../shared/volume/initialize-template-files'
import type { IArtifactWorkspaceFileReference } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../../shared/volume'
import {
    AssistantFileEntry,
    AssistantFileOperation,
    ResolveAssistantFileAccessCommand
} from './resolve-assistant-file-access.command'

@Injectable()
export class AssistantFilesService {
    constructor(
        @Inject(CommandBus) private readonly commandBus: Pick<CommandBus, 'execute'>,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>
    ) {}

    forRuntime(assistantId: string) {
        return this.bind(assistantId, 'runtime')
    }

    forAuthoring(assistantId: string) {
        return this.bind(assistantId, 'authoring')
    }

    private bind(assistantId: string, entry: AssistantFileEntry) {
        // Reauthorize each operation, including after a previously successful list or capability lookup.
        const authorize = (operation: AssistantFileOperation) =>
            this.commandBus.execute(new ResolveAssistantFileAccessCommand(assistantId, operation, entry))
        const client = async (operation: AssistantFileOperation) => {
            const { scope, initialFiles } = await authorize(operation)
            const volume = await this.volumeClient.resolve(scope).ensureRoot()
            if (initialFiles) await initializeTemplateFiles(volume, initialFiles)
            return new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
        }
        return {
            capabilities: async () => (await authorize('capabilities')).capabilities,
            list: async (path?: string, deepth?: number) => (await client('read')).list('', { path, deepth }),
            read: async (path: string) => (await client('read')).readFile('', path),
            download: async (path: string) => (await client('read')).getDownloadTarget('', path),
            save: async (path: string, content: string) => (await client('write')).saveFile('', path, content),
            saveBinary: async (path: string, content: Buffer) =>
                (await client('write')).saveBinaryFile('', path, content),
            uploadToFolder: async (path: string, file: { originalname: string; buffer: Buffer; mimetype?: string }) =>
                (await client('write')).uploadFile('', path, file),
            delete: async (path: string) => (await client('delete')).deleteFile('', path),
            upload: async (file: Express.Multer.File): Promise<IArtifactWorkspaceFileReference> => {
                const { scope, initialFiles } = await authorize('write')
                const contentSha256 = createHash('sha256').update(file.buffer).digest('hex')
                // This entry already chose runtime or Studio authority. Do not re-enter runtime ACL for drafts.
                const volume = await this.volumeClient.resolve(scope).ensureRoot()
                if (initialFiles) await initializeTemplateFiles(volume, initialFiles)
                const written = await new VolumeSubtreeClient(volume, { allowRootWorkspace: true }).uploadFile(
                    '',
                    `uploads/${contentSha256}`,
                    file
                )
                return {
                    ...scope,
                    source: 'platform.workspace.files',
                    scopeId: scope.xpertId,
                    filePath: written.filePath,
                    workspacePath: `/workspace/${written.filePath}`,
                    originalName: file.originalname,
                    name: written.filePath.split('/').pop(),
                    mimeType: file.mimetype,
                    size: file.buffer.length
                }
            }
        }
    }
}
