import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type {
    ArtifactKind,
    ArtifactTypeBinding,
    ArtifactTypeDescriptor,
    ArtifactTypeReference
} from '@xpert-ai/contracts'
import { ArtifactTypeRegistry, FILE_ARTIFACT_TYPE, artifactTypeKey } from '@xpert-ai/plugin-sdk'
import type {
    ArtifactTypeActor,
    ArtifactTypeLink,
    ArtifactTypeSource,
    ArtifactLinkAccessInput,
    ContentOperation
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ArtifactTypeViews } from './artifact-type-views'

export type TypedArtifactSource = ArtifactTypeSource & { typeBinding?: ArtifactTypeBinding | null }
const unavailable = () =>
    new ForbiddenException(
        t('server-ai:Error.ArtifactTypeUnavailable', { defaultValue: 'This artifact type is unavailable.' })
    )

/** Platform restrictions and type restrictions are cumulative. No absent-provider fallback on reads. */
@Injectable()
export class ArtifactTypesService {
    constructor(
        readonly registry: ArtifactTypeRegistry,
        private readonly views: ArtifactTypeViews
    ) {}

    bind(source: ArtifactTypeSource, type: ArtifactTypeReference | undefined, kind: ArtifactKind) {
        const selected = type ?? FILE_ARTIFACT_TYPE
        if (
            artifactTypeKey(selected) === artifactTypeKey(FILE_ARTIFACT_TYPE) &&
            artifactTypeKey(source) !== artifactTypeKey(FILE_ARTIFACT_TYPE) &&
            this.registry.hasType(source, source)
        )
            throw unavailable()
        if (
            artifactTypeKey(selected) !== artifactTypeKey(FILE_ARTIFACT_TYPE) &&
            artifactTypeKey(selected) !== artifactTypeKey(source)
        )
            throw unavailable()
        try {
            const binding = this.registry.bind(selected, source)
            if (!this.registry.requireBinding(binding, source).definition.kinds.includes(kind)) throw unavailable()
            return binding
        } catch {
            throw unavailable()
        }
    }

    provider(source: TypedArtifactSource) {
        try {
            return this.registry.requireBinding(source.typeBinding, source)
        } catch {
            throw unavailable()
        }
    }
    describe(source: TypedArtifactSource): ArtifactTypeDescriptor {
        const provider = this.provider(source)
        const binding = source.typeBinding
        if (!binding) throw unavailable()
        return { pluginName: binding.pluginName, resourceType: binding.resourceType, title: provider.definition.title }
    }
    async authorize(
        source: TypedArtifactSource,
        actor: ArtifactTypeActor,
        operation: ContentOperation,
        surface?: 'draft'
    ) {
        // An owner can still revoke after uninstall. Link updates independently require the type.
        let provider: ReturnType<ArtifactTypesService['provider']>
        try {
            provider = this.provider(source)
        } catch (error) {
            if (
                operation === 'manage' &&
                source.userId &&
                source.userId === actor.userId &&
                source.tenantId === actor.tenantId
            )
                return
            throw error
        }
        await provider.authorize(source, actor, operation)
        if (surface === 'draft') await provider.authorizeDraft?.(source, actor, operation)
        if (this.provider(source) !== provider) throw unavailable()
    }
    async validateContent(source: TypedArtifactSource, buffer: Buffer, mimeType: string) {
        const provider = this.provider(source)
        const limits = provider.definition.content
        if (limits && (!limits.mimeTypes.includes(mimeType) || buffer.length > limits.maxBytes)) throw unavailable()
        await provider.validateContent(buffer, mimeType)
        if (this.provider(source) !== provider) throw unavailable()
    }
    async assertDraftPublication(
        source: TypedArtifactSource,
        actor: ArtifactTypeActor,
        draft: import('@xpert-ai/plugin-sdk').ArtifactDraftRecord
    ) {
        const provider = this.provider(source)
        await provider.assertDraftPublication?.(source, actor, draft)
        if (this.provider(source) !== provider) throw unavailable()
    }
    assertVersionCreation(source: TypedArtifactSource) {
        if (this.provider(source).definition.versioning?.mode === 'draft-only')
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactApplicationPublicationRequired', {
                    defaultValue: 'Publish this artifact through its application draft workflow.'
                })
            )
    }
    async assertPublication(
        source: TypedArtifactSource,
        shareKey: string | undefined,
        access: ArtifactLinkAccessInput
    ) {
        const provider = this.provider(source)
        const sharing = provider.definition.sharing
        if (sharing?.shareKey && shareKey !== sharing.shareKey) throw unavailable()
        if (sharing && !sharing.accessModes.includes(access.mode)) throw unavailable()
        await provider.assertPublication?.(source, access)
        if (this.provider(source) !== provider) throw unavailable()
    }
    async assertLink(source: TypedArtifactSource, link: ArtifactTypeLink) {
        const provider = this.provider(source)
        const sharing = provider.definition.sharing
        if (sharing) {
            if (
                !sharing.accessModes.includes(link.accessMode) ||
                !sharing.versionModes.includes(link.versionMode) ||
                (!sharing.allowDownload && link.allowDownload !== false)
            )
                throw unavailable()
            if (
                sharing.maxTtlSeconds &&
                (!link.expiresAt ||
                    !Number.isFinite(new Date(link.expiresAt).getTime()) ||
                    new Date(link.expiresAt).getTime() > Date.now() + sharing.maxTtlSeconds * 1000)
            )
                throw unavailable()
        }
        await provider.assertLink?.(source, link)
        if (this.provider(source) !== provider) throw unavailable()
    }
    assertLinkUpdate(source: TypedArtifactSource) {
        if (this.provider(source).definition.sharing?.mutableLinks === false) throw unavailable()
    }
    assertDescriptor(source: TypedArtifactSource) {
        if (this.provider(source).definition.sharing?.descriptor === false) throw new NotFoundException()
    }
    publicUrl(source: TypedArtifactSource | undefined, slug: string) {
        if (!source) return undefined
        this.provider(source)
        return this.views.publicUrl(source.typeBinding, slug)
    }
    presentationUrl(source: TypedArtifactSource | undefined, url: string) {
        if (!source) return undefined
        return this.provider(source).definition.presentation.mode === 'snapshot' ? url : undefined
    }
    revalidateAfterRead(source: TypedArtifactSource) {
        this.provider(source)
        return true
    }
    assertBindingUnchanged(existing: TypedArtifactSource, binding: ArtifactTypeBinding) {
        if (
            existing.typeBinding &&
            (artifactTypeKey(existing.typeBinding) !== artifactTypeKey(binding) ||
                existing.typeBinding.scopeKey !== binding.scopeKey)
        )
            throw new BadRequestException(
                t('server-ai:Error.ArtifactTypeImmutable', {
                    defaultValue: 'Artifact type and installation cannot be changed.'
                })
            )
    }
}
