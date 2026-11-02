import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { t } from 'i18next'
import {
    ArtifactContentRuntimeCapability,
    RequestContext,
    type ArtifactContentApi,
    type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../shared/runtime/runtime-capability-provider.decorator'
import { VOLUME_CLIENT, VolumeClient } from '../shared/volume'
import { Artifact, ArtifactVersion } from './entities'
import { ArtifactContentAccess, assertArtifactAccess } from './artifact-content-access'
import { artifactContentStorage } from './artifact-content-storage'

@Injectable()
@RuntimeCapabilityProvider(ArtifactContentRuntimeCapability)
export class ArtifactContentRuntimeService implements ArtifactContentApi {
    constructor(
        private readonly db: DataSource,
        private readonly access: ArtifactContentAccess,
        @Inject(VOLUME_CLIENT) private readonly volumes: Pick<VolumeClient, 'resolve'>
    ) {}

    private async authorized(id: string, operation: 'read' | 'write', draft = false) {
        const actor = {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId()
        }
        if (!z.string().uuid().safeParse(id).success || !actor.tenantId || !actor.organizationId || !actor.userId)
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactContentAccessDenied', { defaultValue: 'ARTIFACT_CONTENT_ACCESS_DENIED' })
            )
        const artifact = await this.db
            .getRepository(Artifact)
            .findOneBy({ id, tenantId: actor.tenantId, organizationId: actor.organizationId, status: 'active' })
        if (!artifact)
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactContentAccessDenied', { defaultValue: 'ARTIFACT_CONTENT_ACCESS_DENIED' })
            )
        await assertArtifactAccess(this.access, artifact, actor, operation, true, draft ? 'draft' : undefined)
        return artifact
    }
    private reference(artifact: Artifact, hash: string): WorkspacePortableFileReference {
        const project = !artifact.userId ? artifact.projectId : null
        return {
            source: 'platform.workspace.files',
            tenantId: artifact.tenantId,
            organizationId: artifact.organizationId,
            ...(project
                ? { catalog: 'projects', scopeId: project, projectId: project }
                : { catalog: 'users', userId: artifact.userId }),
            filePath: `.apps/artifact_content/${artifact.id}/${hash}`,
            workspacePath: `.apps/artifact_content/${artifact.id}/${hash}`
        }
    }
    async write(input: Parameters<ArtifactContentApi['write']>[0]) {
        const artifact = await this.authorized(input.artifactId, 'write', true)
        if (!Buffer.isBuffer(input.buffer) || input.buffer.length > 50 * 1024 * 1024)
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactContentTooLarge', { defaultValue: 'ARTIFACT_CONTENT_TOO_LARGE' })
            )
        const hash = createHash('sha256').update(input.buffer).digest('hex')
        const ref = this.reference(artifact, hash),
            location = artifactContentStorage(this.volumes, ref)
        await location.storage.withLock(location.path, async () => {
            await this.authorized(input.artifactId, 'write', true)
            await location.storage.write(location.path, input.buffer)
        })
        return ref
    }
    async read(ref: WorkspacePortableFileReference) {
        const location = artifactContentStorage(this.volumes, ref)
        const artifact = await this.authorized(location.artifactId, 'read')
        const canonical = this.reference(artifact, location.sha256)
        if (
            ref.tenantId !== canonical.tenantId ||
            ref.catalog !== canonical.catalog ||
            (ref.organizationId && ref.organizationId !== canonical.organizationId) ||
            (ref.projectId ?? null) !== (canonical.projectId ?? null) ||
            // Scoped Workspace Files attaches the acting user to Project references; ownership remains the Project.
            (canonical.catalog !== 'projects' && (ref.userId ?? null) !== (canonical.userId ?? null)) ||
            (ref.scopeId ?? null) !== (canonical.scopeId ?? null)
        )
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactContentAccessDenied', { defaultValue: 'ARTIFACT_CONTENT_ACCESS_DENIED' })
            )
        const versions = await this.db
            .getRepository(ArtifactVersion)
            .findBy({ artifactId: artifact.id, status: 'active', sha256: location.sha256 })
        const published = versions.some((version) => version.workspaceFileRef?.filePath === ref.filePath)
        // Also permits an editor to verify bytes immediately before saving their first draft.
        if (!published) await this.authorized(artifact.id, 'read', true)
        const buffer = await location.storage.read(location.path)
        if (createHash('sha256').update(buffer).digest('hex') !== location.sha256)
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactContentChanged', { defaultValue: 'ARTIFACT_CONTENT_CHANGED' })
            )
        await this.authorized(artifact.id, 'read', !published)
        return {
            ...canonical,
            catalog: canonical.catalog!,
            scopeId: canonical.scopeId ?? undefined,
            name: location.sha256,
            workspacePath: ref.filePath,
            size: buffer.length,
            buffer
        }
    }
}
