import { ForbiddenException, GoneException } from '@nestjs/common'
import { FILE_ARTIFACT_TYPE, artifactTypeKey, type ArtifactVersionInput } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import { ArtifactPersistence } from '../artifact-persistence'
import { ArtifactTypesService } from './artifact-types.service'
import type { ArtifactsRuntimeScope } from '../artifact-service.types'
import { Artifact, ArtifactAccessLog, ArtifactVersion, ArtifactLink } from '../entities'
import { ArtifactDraft } from '../drafts/artifact-draft.entity'
import { serializeArtifact } from '../artifact-records'
import { digestBuffer } from '../artifact-utils'

/** Only legacy file bindings can be adopted. Content, ownership, versions and link policy stay unchanged. */
export async function repairArtifactType(
    persistence: ArtifactPersistence,
    types: ArtifactTypesService,
    data: DataSource,
    artifactId: string,
    defaults: ArtifactsRuntimeScope
) {
    const denied = () => new ForbiddenException(t('server-ai:Error.ArtifactTypeUnavailable'))
    const initial = await persistence.resolveScopedArtifact(artifactId, defaults, false, 'manage')
    if (
        !initial.typeBinding ||
        artifactTypeKey(initial.typeBinding) !== artifactTypeKey(FILE_ARTIFACT_TYPE) ||
        !types.registry.hasType(initial, initial) ||
        artifactTypeKey(initial) === artifactTypeKey(FILE_ARTIFACT_TYPE)
    )
        return
    if (!data?.isInitialized) throw denied()
    const type = { pluginName: initial.pluginName, resourceType: initial.resourceType }
    const actor = persistence.resolveCurrentScope(defaults)
    if (!actor.userId || artifactTypeKey(initial) !== artifactTypeKey(type)) throw denied()
    return data.transaction(async (manager) => {
        const artifacts = manager.getRepository(Artifact)
        const artifact = await artifacts.findOne({ where: { id: initial.id }, lock: { mode: 'pessimistic_write' } })
        if (
            !artifact ||
            artifact.status !== 'active' ||
            artifact.tenantId !== actor.tenantId ||
            artifact.organizationId !== actor.organizationId ||
            artifactTypeKey(artifact) !== artifactTypeKey(type)
        )
            throw denied()
        await persistence.assertAccess(artifact, actor, 'manage')
        const binding = types.bind(artifact, type, artifact.kind)
        if (
            artifact.typeBinding &&
            artifactTypeKey(artifact.typeBinding) === artifactTypeKey(binding) &&
            artifact.typeBinding.scopeKey === binding.scopeKey
        )
            return serializeArtifact(artifact)
        if (
            !artifact.typeBinding ||
            artifactTypeKey(artifact.typeBinding) !== artifactTypeKey(FILE_ARTIFACT_TYPE) ||
            artifact.typeBinding.scopeKey !== 'builtin:global'
        )
            throw denied()
        const candidate = { ...artifact, typeBinding: binding }
        const provider = types.provider(candidate)
        if (!provider.validateLegacyContent) throw denied()
        await persistence.assertAccess(candidate, actor, 'manage')
        const versions = await manager.getRepository(ArtifactVersion).find({ where: { artifactId: artifact.id } })
        const draft = await manager.getRepository(ArtifactDraft).findOne({ where: { artifactId: artifact.id } })
        const validate = async (content: Pick<ArtifactVersionInput, 'workspaceFileRef' | 'sha256' | 'mimeType'>) => {
            if (!content.workspaceFileRef || !content.sha256) throw denied()
            const file = await persistence.readWorkspaceArtifact(content.workspaceFileRef)
            if (digestBuffer(file.buffer) !== content.sha256)
                throw new GoneException(t('server-ai:Error.ArtifactTypeUnavailable'))
            await types.validateContent(candidate, file.buffer, content.mimeType)
            await provider.validateLegacyContent(candidate, file.buffer, content.mimeType)
        }
        if (!versions.length && !draft) throw denied()
        for (const version of versions) await validate(version)
        if (draft) await validate(draft.content)
        for (const link of await manager
            .getRepository(ArtifactLink)
            .find({ where: { artifactId: artifact.id, status: 'active' } })) {
            await types.assertPublication(candidate, link.shareKey, {
                mode: link.accessMode,
                customPrincipals: link.customPrincipals
            })
            await types.assertLink(candidate, link)
        }
        await persistence.assertAccess(candidate, actor, 'manage')
        if (types.provider(candidate) !== provider) throw denied()
        artifact.typeBinding = binding
        await artifacts.save(artifact)
        await manager.getRepository(ArtifactAccessLog).save({
            tenantId: artifact.tenantId,
            organizationId: artifact.organizationId,
            artifactId: artifact.id,
            slug: `artifact:${artifact.id}`,
            event: 'type_repaired',
            principalUserId: actor.userId,
            statusCode: 200,
            metadata: { previous: FILE_ARTIFACT_TYPE, type: binding }
        })
        return serializeArtifact(artifact)
    })
}
