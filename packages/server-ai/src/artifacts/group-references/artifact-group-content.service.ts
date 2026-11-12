// Source bytes stay in the authoring Project; both rendering and analysis consume the same verified version.
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import type { ArtifactVersionContext, ContentActor } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { serializeArtifact, serializeArtifactVersion } from '../artifact-records'
import { readArtifactBytes } from '../artifact-byte-reader'
import { artifactContentIdentity } from '../artifact-content-storage'
import { digestBuffer, safeEqualString } from '../artifact-utils'
import { ArtifactGroupReferenceService } from './artifact-group-reference.service'

@Injectable()
export class ArtifactGroupContentService {
    constructor(
        private readonly references: ArtifactGroupReferenceService,
        private readonly types: ArtifactTypesService,
        @Inject(VOLUME_CLIENT) private readonly volumes: Pick<VolumeClient, 'resolve'>
    ) {}

    async load(actor: ContentActor, groupId: string, referenceId: string) {
        const selected = await this.references.resolve(actor, groupId, referenceId)
        const { artifact, version, grant, reference } = selected
        const type = this.types.provider(artifact)
        const ref = version.workspaceFileRef
        const managed = ref && artifactContentIdentity(ref.filePath)
        // The version's stored reference is authoritative, but must still belong to the canonical source Project.
        if (
            !ref ||
            ref.tenantId !== actor.tenantId ||
            (ref.organizationId && ref.organizationId !== actor.organizationId) ||
            ref.catalog !== 'projects' ||
            ref.projectId !== grant.ownerProjectId ||
            ref.scopeId !== grant.ownerProjectId ||
            !version.sha256 ||
            !/^[a-f0-9]{64}$/.test(version.sha256) ||
            (managed && (managed[1] !== artifact.id || managed[2] !== version.sha256))
        )
            throw this.denied()
        const file = await readArtifactBytes(this.volumes, ref)
        if (!safeEqualString(version.sha256, digestBuffer(file.buffer))) throw this.denied()
        await this.types.validateContent(artifact, file.buffer, version.mimeType)
        const recheck = async () => {
            const current = await this.references.resolve(actor, groupId, referenceId)
            if (
                current.reference.revision !== reference.revision ||
                current.grant.revision !== grant.revision ||
                current.version.id !== version.id ||
                current.version.sha256 !== version.sha256 ||
                this.types.provider(current.artifact) !== type
            )
                throw this.changed()
        }
        await recheck()
        const context: ArtifactVersionContext = {
            actor: { ...actor },
            artifact: serializeArtifact(artifact, version),
            version: serializeArtifactVersion(version),
            content: file.buffer
        }
        return { selected, context, recheck }
    }
    private denied() {
        return new ForbiddenException(t('server-ai:Error.ArtifactUseGrantDenied'))
    }
    private changed() {
        return new ConflictException(t('server-ai:Error.ArtifactUseGrantConflict'))
    }
}
