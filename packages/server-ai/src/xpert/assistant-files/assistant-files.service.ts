import type { IArtifactWorkspaceFileReference } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../../shared/volume'
import {
    AssistantFileEntry,
    AssistantFileOperation,
    ResolveAssistantFileAccessCommand
} from './resolve-assistant-file-access.command'

@Injectable()
export class AssistantFilesService {
    constructor(
        private readonly commandBus: CommandBus,
        @Inject(WorkspaceFilesRuntimeCapabilityService)
        private readonly workspaceFiles: Pick<WorkspaceFilesRuntimeCapabilityService, 'createScopedApi'>,
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
            const { scope } = await authorize(operation)
            const volume = await this.volumeClient.resolve(scope).ensureRoot()
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
                const { scope } = await authorize('write')
                const contentSha256 = createHash('sha256').update(file.buffer).digest('hex')
                const files = this.workspaceFiles.createScopedApi({ ...scope, scopeId: scope.xpertId })
                const written = await files.writeRuntimeBuffer({
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
    }
}
