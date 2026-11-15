// The issuer comes only from an accepted, persisted grant. Resolve a fresh ordinary
// identity for every check; no stored credentials, owner fallback or caller-selected actor.
import { ForbiddenException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { CommandBus } from '@nestjs/cqrs'
import type { AnalyticsBinding } from '@xpert-ai/contracts'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import {
    AnalyticsRuntimeService,
    ResolveExecutionIdentityCommand,
    runWithExecutionIdentity
} from '@xpert-ai/server-core'
import { ArtifactContentAccess } from '../artifact-content-access'
import type { Artifact } from '../entities'
import type { ArtifactUseGrant } from '../use-grants/artifact-use-grant.entity'

@Injectable()
export class DelegatedResourceAnalysisService {
    constructor(
        private readonly commands: CommandBus,
        private readonly access: ArtifactContentAccess,
        private readonly analytics: AnalyticsRuntimeService
    ) {}

    private async asIssuer<T>(
        grant: ArtifactUseGrant,
        artifact: Artifact,
        binding: AnalyticsBinding,
        task: (actor: ContentActor) => Promise<T>
    ) {
        if (
            grant.status !== 'active' ||
            grant.analysis?.execution !== 'delegated_results' ||
            grant.expiresAt <= new Date() ||
            grant.artifactId !== artifact.id ||
            grant.ownerProjectId !== artifact.projectId ||
            grant.tenantId !== artifact.tenantId ||
            grant.organizationId !== artifact.organizationId
        )
            throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisDenied'))
        const actor: ContentActor = {
            tenantId: grant.tenantId,
            organizationId: grant.organizationId,
            userId: grant.issuedById
        }
        const identity = await this.commands.execute(new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' }))
        return runWithExecutionIdentity(identity, async () => {
            await this.access.assert(artifact, actor, 'manage')
            await this.analytics.authorizeGroupSharing(actor, binding)
            return task(actor)
        })
    }

    async authorize(grant: ArtifactUseGrant, artifact: Artifact, binding: AnalyticsBinding) {
        await this.asIssuer(grant, artifact, binding, async () => undefined)
    }

    async execute<T>(
        grant: ArtifactUseGrant,
        artifact: Artifact,
        binding: AnalyticsBinding,
        query: (actor: ContentActor) => Promise<T>
    ) {
        const result = await this.asIssuer(grant, artifact, binding, query)
        // A query may outlive a role, membership or source-sharing revocation.
        await this.authorize(grant, artifact, binding)
        return result
    }
}
