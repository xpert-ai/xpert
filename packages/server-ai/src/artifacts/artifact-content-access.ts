import { ArtifactTypesService } from './types/artifact-types.service'
// Ownership, resource ACL and share-link policy are independent restrictions.
// A provider always authorizes the canonical source resourceId, never a second copy.
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { ContentOperation } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ContentResourceService } from '../content-resource/content-resource.service'
import { ProjectAccessRuntimeService } from '../xpert-project/services/project-access-runtime.service'

type ActorScope = { tenantId?: string | null; organizationId?: string | null; userId?: string | null }
export type ArtifactAuthorizationTarget = {
    typeBinding?: import('@xpert-ai/contracts').ArtifactTypeBinding | null
    tenantId?: string | null
    authorizationProviderKey?: string | null
    resourceId: string
    pluginName: string
    resourceType: string
    organizationId?: string | null
    /** A null owner with projectId denotes explicit Project ownership. */
    userId?: string | null
    projectId?: string | null
}

@Injectable()
export class ArtifactContentAccess {
    constructor(
        private readonly resources: ContentResourceService,
        private readonly projects: ProjectAccessRuntimeService,
        private readonly sourcePolicies: ArtifactTypesService
    ) {}

    assertDraftPublication(
        artifact: ArtifactAuthorizationTarget,
        actor: ActorScope,
        draft: import('@xpert-ai/plugin-sdk').ArtifactDraftRecord
    ) {
        return this.sourcePolicies.assertDraftPublication(artifact, actor, draft)
    }

    async assert(
        artifact: ArtifactAuthorizationTarget,
        scope: ActorScope,
        operation: ContentOperation,
        surface?: 'draft'
    ) {
        await this.sourcePolicies.authorize(artifact, scope, operation, surface)
        const projectId = !artifact.userId ? artifact.projectId : null
        if (!projectId && !artifact.authorizationProviderKey) return
        if (!scope.tenantId || !scope.userId || (artifact.tenantId && artifact.tenantId !== scope.tenantId))
            throw denied()
        const actor = { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }
        if (projectId) {
            if (operation === 'manage') await this.projects.assertManage({ actor, projectId })
            else if (operation !== 'read') await this.projects.assertEdit({ actor, projectId })
            else if (!(await this.projects.listReadable({ actor, projectIds: [projectId] })).length) throw denied()
        }
        if (artifact.authorizationProviderKey) {
            if (!scope.organizationId) throw denied()
            await this.resources.authorize({
                providerKey: artifact.authorizationProviderKey,
                resourceId: artifact.resourceId,
                operation,
                actor: { ...actor, organizationId: scope.organizationId }
            })
        }
    }
}

/** Management respects the owner; public links apply their own audience policy separately. */
export async function assertArtifactAccess(
    access: ArtifactContentAccess | undefined,
    artifact: ArtifactAuthorizationTarget,
    actor: ActorScope,
    operation: ContentOperation,
    checkOwner = true,
    surface?: 'draft'
) {
    if (checkOwner && artifact.userId && artifact.userId !== actor.userId) {
        throw new NotFoundException(t('server-ai:Error.ArtifactNotFound'))
    }
    if (access) await access.assert(artifact, actor, operation, surface)
    else if (artifact.authorizationProviderKey || (!artifact.userId && artifact.projectId)) throw denied()
}

export function assertArtifactPolicyUnchanged(
    existing: ArtifactAuthorizationTarget,
    requested: ArtifactAuthorizationTarget
) {
    // Idempotent creation may refresh metadata, but cannot replace resource policy or move Project ownership.
    if (
        (existing.authorizationProviderKey ?? null) !== (requested.authorizationProviderKey ?? null) ||
        (!existing.userId && (existing.projectId ?? null) !== (requested.projectId ?? null))
    ) {
        throw new ForbiddenException(t('server-ai:Error.ArtifactPolicyImmutable'))
    }
}

function denied() {
    return new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
}
