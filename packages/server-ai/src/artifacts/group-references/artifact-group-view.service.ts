// Source bytes and source identity remain in the authoring Project. Usage context is derived from a live reference.
// Recheck after bytes and provider work; never release an in-flight result after revocation or member removal.
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import type { ArtifactGroupReferenceView, ArtifactPresentationQuery } from '@xpert-ai/contracts'
import { ArtifactPresentationRegistry, type ArtifactPresentationContext, type ContentActor } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { artifactPresentationProvider } from '../presentation/artifact-presentation-provider'
import { ArtifactGroupContentService } from './artifact-group-content.service'

@Injectable()
export class ArtifactGroupViewService {
    constructor(
        private readonly contents: ArtifactGroupContentService,
        private readonly types: ArtifactTypesService,
        private readonly registry: ArtifactPresentationRegistry
    ) {}

    async read(actor: ContentActor, groupId: string, referenceId: string): Promise<ArtifactGroupReferenceView> {
        const loaded = await this.content(actor, groupId, referenceId)
        const provider = artifactPresentationProvider(this.registry, this.types, loaded.context)
        const [entry, data] = await Promise.all([provider.getEntry(), provider.read(loaded.context)])
        await loaded.recheck()
        if (artifactPresentationProvider(this.registry, this.types, loaded.context) !== provider) throw this.changed()
        return {
            reference: loaded.selected.descriptor,
            title: loaded.selected.reference.title,
            revision: loaded.selected.reference.revision,
            content: {
                kind: 'presentation',
                presentation: {
                    schemaVersion: 1,
                    target: { artifactId: loaded.context.artifact.id, versionId: loaded.context.version.id },
                    title: loaded.selected.reference.title,
                    versionNumber: loaded.context.version.versionNumber,
                    readOnly: true,
                    expiresAt: loaded.selected.grant.expiresAt.toISOString(),
                    entry,
                    data,
                    operations: this.operations(loaded.context, provider.operations)
                }
            }
        }
    }

    async query(actor: ContentActor, groupId: string, referenceId: string, input: ArtifactPresentationQuery) {
        const loaded = await this.content(actor, groupId, referenceId)
        if (
            input.target.artifactId !== loaded.context.artifact.id ||
            input.target.versionId !== loaded.context.version.id
        )
            throw this.changed()
        const provider = artifactPresentationProvider(this.registry, this.types, loaded.context)
        if (!this.operations(loaded.context, provider.operations).includes(input.operation)) throw this.denied()
        const result = await provider.query(loaded.context, input)
        await loaded.recheck()
        if (
            artifactPresentationProvider(this.registry, this.types, loaded.context) !== provider ||
            !this.operations(loaded.context, provider.operations).includes(input.operation)
        )
            throw this.changed()
        return result
    }

    private operations(context: ArtifactPresentationContext, operations: readonly string[]) {
        const allowed = this.types.provider(context.artifact).definition.useGrants?.queryOperations ?? []
        return operations.filter((operation) => allowed.includes(operation))
    }

    private async content(actor: ContentActor, groupId: string, referenceId: string) {
        const loaded = await this.contents.load(actor, groupId, referenceId)
        const { grant, reference } = loaded.selected
        const context: ArtifactPresentationContext = {
            ...loaded.context,
            usage: {
                kind: 'group-reference',
                referenceId,
                grantId: grant.id,
                groupId,
                runtimeProjectId: reference.projectId,
                ownerProjectId: grant.ownerProjectId
            }
        }
        return { ...loaded, context }
    }
    private denied() {
        return new ForbiddenException(t('server-ai:Error.ArtifactUseGrantDenied'))
    }
    private changed() {
        return new ConflictException(t('server-ai:Error.ArtifactUseGrantConflict'))
    }
}
