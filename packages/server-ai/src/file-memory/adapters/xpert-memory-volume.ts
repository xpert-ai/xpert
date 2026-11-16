import { Inject, Injectable } from '@nestjs/common'
import { XpertWorkspaceDataScope } from '@xpert-ai/contracts'
import { resolveXpertDataVolumeScope, VOLUME_CLIENT, VolumeClient, VolumeHandle } from '../../shared/volume'
import { FileMemoryVolume, FileMemoryXpertScope } from '../../plugins/file-memory/ports'
export function getXpertFileMemoryVolumeScope(
    tenantId: string,
    xpertId: string,
    userId?: string | null,
    workspaceDataScope?: XpertWorkspaceDataScope | null,
    projectId?: string | null
) {
    if (projectId) {
        return {
            tenantId,
            catalog: 'projects' as const,
            projectId,
            userId
        }
    }
    return resolveXpertDataVolumeScope({
        tenantId,
        userId,
        xpertId,
        workspaceDataScope
    })
}

@Injectable()
export class XpertMemoryVolume implements FileMemoryVolume {
    constructor(@Inject(VOLUME_CLIENT) private readonly volume: VolumeClient) {}
    async readSnapshot(scope: FileMemoryXpertScope, relativePath: string) {
        const root = this.resolve(scope).serverRoot
        const opened = await VolumeHandle.openExistingFile(root, relativePath)
        try {
            if (
                !opened.fileStat.isFile() ||
                opened.fileStat.nlink !== 1 ||
                opened.volumeRelativePath !== relativePath ||
                opened.fileStat.size > 4 * 1024 * 1024
            )
                throw new Error('Invalid memory file')
            return await opened.fileHandle.readFile('utf8')
        } finally {
            await opened.fileHandle.close()
        }
    }
    resolve(scope: FileMemoryXpertScope) {
        return this.volume.resolve(
            getXpertFileMemoryVolumeScope(
                scope.tenantId,
                scope.id,
                scope.userId,
                scope.workspaceDataScope,
                scope.projectId
            )
        )
    }
}
