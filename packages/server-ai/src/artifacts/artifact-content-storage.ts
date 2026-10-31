import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type { VolumeClient } from '../shared/volume'
import { VolumeWorkspaceStorage } from '../shared/volume/workspace-storage'
import { resolveWorkspaceVolumeScope } from '../file-understanding/domain/workspace-file'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { ForbiddenException } from '@nestjs/common'

export const ARTIFACT_CONTENT_NAMESPACE = 'artifact_content'
const pattern = /^\.apps\/artifact_content\/([a-f0-9-]{36})\/([a-f0-9]{64})$/
export const artifactContentIdentity = (path: string) => pattern.exec(path)

/** Internal byte transport only; callers must authorize the Artifact/link before using it. */
export function artifactContentStorage(volumes: Pick<VolumeClient, 'resolve'>, ref: WorkspacePortableFileReference) {
    const match = artifactContentIdentity(ref.filePath)
    const resolved = resolveWorkspaceVolumeScope(ref, {
        tenantId: ref.tenantId,
        userId: ref.userId,
        inferUserScope: true
    })
    if (!match || !z.string().uuid().safeParse(match[1]).success || !resolved)
        throw new ForbiddenException(
            t('server-ai:Error.ArtifactContentReferenceInvalid', { defaultValue: 'ARTIFACT_CONTENT_REFERENCE_INVALID' })
        )
    return {
        storage: new VolumeWorkspaceStorage(
            async () => volumes.resolve(resolved.volumeScope),
            ARTIFACT_CONTENT_NAMESPACE
        ),
        path: `${match[1]}/${match[2]}`,
        artifactId: match[1],
        sha256: match[2]
    }
}
