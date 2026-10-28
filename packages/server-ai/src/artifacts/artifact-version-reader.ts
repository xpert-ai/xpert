import { ForbiddenException, GoneException } from '@nestjs/common'
import { t } from 'i18next'
import { ArtifactPersistence } from './artifact-persistence'
import { ArtifactTypesService } from './types/artifact-types.service'
import { digestBuffer, safeEqualString } from './artifact-utils'
import { serializeArtifact, serializeArtifactVersion } from './artifact-records'
import type { ArtifactsRuntimeScope, ArtifactManagementResolvedVersion } from './artifact-service.types'

export async function readArtifactVersion(
    persistence: ArtifactPersistence,
    types: ArtifactTypesService,
    input: { artifactId: string; artifactVersionId: string; purpose: 'view' | 'copy' },
    defaults: ArtifactsRuntimeScope
): Promise<ArtifactManagementResolvedVersion> {
    const artifact = await persistence.resolveScopedArtifact(input.artifactId, defaults, false, 'read')
    const provider = types.provider(artifact)
    const definition = provider.definition
    if (input.purpose === 'copy' && !definition.collection?.allowCopy) {
        throw new ForbiddenException(t('server-ai:Error.ArtifactCopyDenied'))
    }
    if (artifact.status !== 'active') {
        throw new GoneException('Artifact is no longer active')
    }
    const version = await persistence.resolveRequestedVersion(artifact, 'version', input.artifactVersionId)
    const file = await persistence.readWorkspaceArtifact(version.workspaceFileRef)
    const sha256 = digestBuffer(file.buffer)
    if (version.sha256 && !safeEqualString(version.sha256, sha256)) {
        throw new GoneException('Artifact content checksum mismatch')
    }
    await types.validateContent(artifact, file.buffer, version.mimeType)
    const current = await persistence.resolveScopedArtifact(input.artifactId, defaults, false, 'read')
    if (types.provider(current) !== provider) throw new GoneException(t('server-ai:Error.ArtifactTypeUnavailable'))
    if (current.status !== 'active') throw new GoneException(t('server-ai:Error.ArtifactNotFound'))
    await persistence.resolveRequestedVersion(current, 'version', input.artifactVersionId)
    return {
        artifact: serializeArtifact(artifact, version),
        version: serializeArtifactVersion(version),
        buffer: file.buffer,
        mimeType: version.mimeType,
        fileName: version.fileName ?? file.name
    }
}
