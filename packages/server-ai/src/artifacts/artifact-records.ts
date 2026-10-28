import { NotFoundException } from '@nestjs/common'
import type { ArtifactRecord, ArtifactVersionRecord } from '@xpert-ai/plugin-sdk'
import type { Artifact, ArtifactVersion } from './entities'

export function serializeArtifact(artifact: Artifact, currentVersion?: ArtifactVersion | null): ArtifactRecord {
    return {
        typeBinding: artifact.typeBinding,
        authorizationProviderKey: artifact.authorizationProviderKey ?? null,
        id: persistedId(artifact.id),
        pluginName: artifact.pluginName,
        resourceType: artifact.resourceType,
        resourceId: artifact.resourceId,
        checksum: artifact.checksum,
        kind: artifact.kind,
        status: artifact.status,
        title: artifact.title,
        description: artifact.description,
        currentVersionId: artifact.currentVersionId,
        currentVersion: currentVersion ? serializeArtifactVersion(currentVersion) : null,
        metadata: artifact.metadata ?? null,
        tenantId: artifact.tenantId,
        organizationId: artifact.organizationId,
        userId: artifact.userId,
        workspaceId: artifact.workspaceId,
        projectId: artifact.projectId,
        xpertId: artifact.xpertId,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt
    }
}

export function serializeArtifactVersion(version: ArtifactVersion): ArtifactVersionRecord {
    return {
        id: persistedId(version.id),
        artifactId: version.artifactId,
        versionNumber: version.versionNumber,
        status: version.status,
        idempotencyKey: version.idempotencyKey,
        sourceVersionId: version.sourceVersionId,
        checksum: version.checksum,
        mimeType: version.mimeType,
        fileName: version.fileName,
        title: version.title,
        description: version.description,
        size: version.size,
        sha256: version.sha256,
        workspaceFileRef: version.workspaceFileRef,
        metadata: version.metadata ?? null,
        createdAt: version.createdAt
    }
}

function persistedId(id?: string) {
    if (!id?.trim()) throw new NotFoundException()
    return id.trim()
}
