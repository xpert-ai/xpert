import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { environment } from '@xpert-ai/server-config'
import {
    RuntimeCapabilityProvider,
    ArtifactLibraryRuntimeCapability,
    type ArtifactLibraryApi,
    type ArtifactLibraryScope,
    type ArtifactLibraryItem
} from '@xpert-ai/plugin-sdk'
import { ContentResourceService } from '../../content-resource/content-resource.service'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { ArtifactContentAccess, assertArtifactAccess } from '../artifact-content-access'
import { ArtifactLibraryAccess } from './artifact-library-access'
import { runWithCapturedRequestContext } from '../../shared/request-context'

export const ARTIFACT_LIBRARY_PROVIDER = 'platform.artifact-reference'

@Injectable()
@RuntimeCapabilityProvider(ArtifactLibraryRuntimeCapability)
export class ArtifactLibraryService implements ArtifactLibraryApi {
    constructor(
        private readonly access: ArtifactLibraryAccess,
        private readonly artifacts: ArtifactsService,
        private readonly types: ArtifactTypesService,
        private readonly sourceAccess: ArtifactContentAccess,
        private readonly resources: ContentResourceService
    ) {}

    async resolve(scope: ArtifactLibraryScope, referenceId: string, write = false, includeDeleted = false) {
        const reference = await this.access.get(scope, referenceId, write, includeDeleted)
        const api = this.artifacts.createScopedApi(scope.actor)
        const artifact = await api.getArtifact(reference.artifactId).catch((error: unknown) => {
            // Removed types/sources must not prevent other catalog entries from loading.
            if (error instanceof GoneException) throw new NotFoundException(t('server-ai:Error.ArtifactNotFound'))
            throw error
        })
        const versions = await api.listArtifactVersions({ artifactId: artifact.id, status: 'active' })
        const version = versions.find((v) => v.id === reference.versionId)
        if (artifact.status !== 'active' || !version) throw new NotFoundException(t('server-ai:Error.ArtifactNotFound'))
        return { reference, artifact, version, versions }
    }
    async add(input: Parameters<ArtifactLibraryApi['add']>[0]) {
        await this.access.check(input, true)
        const resolved = await this.artifacts.readArtifactVersion(
            { artifactId: input.artifactId, artifactVersionId: input.versionId, purpose: 'view' },
            input.actor
        )
        const where = { ...this.access.where(input), artifactId: input.artifactId }
        await this.access.references
            .createQueryBuilder()
            .insert()
            .values({
                ...where,
                id: randomUUID(),
                versionId: input.versionId,
                title: (resolved.artifact.title || resolved.fileName).slice(0, 200),
                revision: 1,
                deleted: false
            })
            .orIgnore()
            .execute()
        const reference = await this.access.references.findOneByOrFail(where)
        if (reference.deleted) throw new ConflictException(t('server-ai:Error.ContentOperationInvalid'))
        const item = await this.resources.catalog.register({
            ...input,
            source: { providerKey: ARTIFACT_LIBRARY_PROVIDER, resourceId: reference.id }
        })
        return { referenceId: reference.id, contentId: item.contentId }
    }
    async open(input: Parameters<ArtifactLibraryApi['open']>[0]): Promise<ArtifactLibraryItem> {
        const { reference, artifact, versions } = await this.resolve(input, input.referenceId)
        const { canWrite } = await this.access.check(input)
        const definition = this.types.provider(artifact).definition
        const api = this.artifacts.createScopedApi(input.actor)
        let sharing: ArtifactLibraryItem['sharing'] = null
        try {
            await assertArtifactAccess(this.sourceAccess, artifact, input.actor, 'manage')
            const publicReadable = await this.publicReadable(artifact)
            const accessModes = (definition.sharing?.accessModes ?? ['organization_all', 'public_link']).filter(
                (mode): mode is 'organization_all' | 'public_link' =>
                    mode === 'organization_all' || (mode === 'public_link' && publicReadable)
            )
            sharing = {
                accessModes,
                maxDays: Math.min(30, Math.floor((definition.sharing?.maxTtlSeconds ?? 30 * 86400) / 86400)),
                link: await api.getArtifactShare({ artifactId: artifact.id, shareKey: this.shareKey(artifact) })
            }
        } catch (error) {
            if (
                !(error instanceof Error) ||
                !('getStatus' in error) ||
                typeof error.getStatus !== 'function' ||
                ![403, 404, 410].includes(error.getStatus())
            )
                throw error
        }
        const url = new URL(`/artifacts/library/${reference.id}`, environment.clientBaseUrl || environment.baseUrl)
        return {
            id: reference.id,
            artifactId: artifact.id,
            versionId: reference.versionId,
            title: reference.title,
            type: this.types.describe(artifact),
            revision: reference.revision,
            canManage: canWrite,
            url: url.toString(),
            sharing,
            versions: versions.map((v) => ({ id: v.id, number: v.versionNumber, title: v.title || v.fileName || '' }))
        }
    }
    async selectVersion(input: Parameters<ArtifactLibraryApi['selectVersion']>[0]) {
        const { reference, versions } = await this.resolve(input, input.referenceId, true)
        if (!versions.some((v) => v.id === input.versionId)) throw this.access.denied()
        const result = await this.access.references.update(
            { id: reference.id, revision: input.expectedRevision },
            { versionId: input.versionId, revision: input.expectedRevision + 1 }
        )
        if (result.affected !== 1) throw new ConflictException(t('server-ai:Error.ContentOperationInvalid'))
    }
    private shareKey(artifact: Parameters<ArtifactTypesService['provider']>[0]) {
        return this.types.provider(artifact).definition.sharing?.shareKey ?? 'artifact-library'
    }
    private async publicReadable(artifact: Parameters<typeof assertArtifactAccess>[1]) {
        try {
            // Match the existing link source ACL without borrowing the publisher's request context.
            await runWithCapturedRequestContext({ user: null, headers: {} }, () =>
                assertArtifactAccess(this.sourceAccess, artifact, {}, 'read', false)
            )
            return true
        } catch (error) {
            if (
                error instanceof Error &&
                'getStatus' in error &&
                typeof error.getStatus === 'function' &&
                [401, 403, 404, 410].includes(error.getStatus())
            )
                return false
            throw error
        }
    }
    async share(input: Parameters<ArtifactLibraryApi['share']>[0]) {
        const { artifact, version } = await this.resolve(input, input.referenceId)
        await assertArtifactAccess(this.sourceAccess, artifact, input.actor, 'manage')
        if (input.accessMode === 'public_link' && !(await this.publicReadable(artifact))) throw this.access.denied()
        const policy = this.types.provider(artifact).definition.sharing
        if (
            !Number.isInteger(input.days) ||
            input.days < 1 ||
            input.days > 30 ||
            (policy?.maxTtlSeconds && input.days * 86400 > policy.maxTtlSeconds)
        )
            throw this.access.denied()
        const api = this.artifacts.createScopedApi(input.actor)
        return (
            await api.ensureArtifactShare({
                artifactId: artifact.id,
                artifactVersionId: version.id,
                shareKey: this.shareKey(artifact),
                versionMode: 'version',
                access: {
                    mode: input.accessMode,
                    expiresAt: new Date(Date.now() + input.days * 86400000).toISOString(),
                    userConfirmedPublicLink: input.acknowledgePublic === true
                },
                presentation: { allowDownload: policy?.allowDownload ?? true, disposition: 'inline' }
            })
        ).link
    }
    async revoke(input: Parameters<ArtifactLibraryApi['revoke']>[0]) {
        const { artifact } = await this.resolve(input, input.referenceId)
        await assertArtifactAccess(this.sourceAccess, artifact, input.actor, 'manage')
        await this.artifacts
            .createScopedApi(input.actor)
            .revokeArtifactShare({ artifactId: artifact.id, shareKey: this.shareKey(artifact) })
    }
}
