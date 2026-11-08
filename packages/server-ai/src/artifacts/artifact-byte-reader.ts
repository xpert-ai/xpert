// Internal transport only. Callers authorize the exact Artifact/version before and after reading bytes.
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import path from 'node:path'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { resolveWorkspaceVolumeScope } from '../file-understanding/domain/workspace-file'
import { VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { artifactContentIdentity, artifactContentStorage } from './artifact-content-storage'
import { normalizeWorkspaceFilePath } from './artifact-utils'

export async function readArtifactBytes(volume: Pick<VolumeClient, 'resolve'>, ref: WorkspacePortableFileReference) {
    const filePath = normalizeWorkspaceFilePath(ref.filePath)
    if (artifactContentIdentity(filePath)) {
        const location = artifactContentStorage(volume, ref)
        return {
            buffer: await location.storage.read(location.path),
            name: ref.originalName ?? ref.name ?? path.posix.basename(filePath)
        }
    }
    const resolved = resolveWorkspaceVolumeScope(ref, {
        tenantId: ref.tenantId,
        userId: ref.userId,
        inferUserScope: true
    })
    if (!resolved) throw new BadRequestException(t('server-ai:Error.ArtifactContentReferenceInvalid'))
    const client = new VolumeSubtreeClient(volume.resolve(resolved.volumeScope), { allowRootWorkspace: true })
    return {
        buffer: await client.readBuffer('', filePath),
        name: ref.originalName ?? ref.name ?? path.posix.basename(filePath)
    }
}
