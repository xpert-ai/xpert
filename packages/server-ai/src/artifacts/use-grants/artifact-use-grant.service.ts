// Invariants: a grant pins published content and a group/Project pair; it never moves source ownership.
// Acceptance and revocation serialize on the grant. Authorization is a per-operation decision, not a token.
// Data queries, source files, drafts, editing, copying, export and onward sharing retain their own policies.
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import type { ArtifactUseGrantEvent } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { DataSource, EntityManager } from 'typeorm'
import { ResolveGroupProjectAccessCommand } from '../../chat-group/commands/group-project-access.command'
import { XpertProject } from '../../xpert-project/entities/project.entity'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { ArtifactContentAccess } from '../artifact-content-access'
import { Artifact, ArtifactVersion } from '../entities'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { ArtifactUseGrant, ArtifactUseGrantAudit } from './artifact-use-grant.entity'
import type { ChangeArtifactUseGrant, OfferArtifactUseGrant, ReadArtifactUseGrant } from './artifact-use-grant.schema'
import { ResourceAnalysisAuthoringCommand } from '../analysis/commands/resource-analysis-authoring.command'

@Injectable()
export class ArtifactUseGrantService {
    constructor(
        private readonly db: DataSource,
        private readonly commands: CommandBus,
        private readonly sourceAccess: ArtifactContentAccess,
        private readonly types: ArtifactTypesService,
        private readonly projects: ProjectAccessRuntimeService
    ) {}

    async assertSourceManager(actor: ContentActor, artifactId: string) {
        this.actor(actor, true)
        const artifact = await this.db.getRepository(Artifact).findOneBy({ ...this.scope(actor), id: artifactId })
        if (!artifact || !artifact.projectId || artifact.userId) throw this.missing()
        await this.sourceAccess.assert(artifact, actor, 'manage')
    }

    async issued(actor: ContentActor, artifactId: string, page: { offset: number; limit: number }) {
        await this.assertSourceManager(actor, artifactId)
        const rows = await this.db.getRepository(ArtifactUseGrant).find({
            where: { ...this.scope(actor), artifactId },
            order: { id: 'ASC' },
            skip: page.offset,
            take: page.limit
        })
        return { items: rows, nextOffset: rows.length === page.limit ? page.offset + page.limit : null }
    }

    /** Input is parsed at its adapter; the actor is supplied by authenticated host context, never request data. */
    async offer(actor: ContentActor, input: OfferArtifactUseGrant): Promise<ArtifactUseGrant> {
        this.actor(actor, true)
        if (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= new Date()) throw this.denied()
        if (input.analysis)
            await this.commands.execute(
                new ResourceAnalysisAuthoringCommand(actor, input.artifactId, input.versionId, input.analysis)
            )
        return this.db.transaction(async (manager) => {
            const { artifact } = await this.source(manager, actor, input.artifactId, input.versionId)
            await this.sourceAccess.assert(artifact, actor, 'manage')
            const target = await this.commands.execute(
                new ResolveGroupProjectAccessCommand(actor, input.targetGroupId, 'offer')
            )
            if (!target.projectId || target.projectId === artifact.projectId) throw this.denied()
            const grant = manager.getRepository(ArtifactUseGrant).create({
                ...this.scope(actor),
                artifactId: artifact.id,
                versionId: input.versionId,
                ownerProjectId: artifact.projectId,
                targetGroupId: target.groupId,
                targetProjectId: target.projectId,
                permission: 'read',
                analysis: input.analysis ?? null,
                status: 'offered',
                revision: 1,
                issuedById: actor.userId,
                expiresAt: input.expiresAt
            })
            await this.types.assertUseGrant(artifact, grant)
            await manager.getRepository(ArtifactUseGrant).save(grant)
            await this.audit(manager, actor, grant, 'offered')
            return grant
        })
    }

    async accept(actor: ContentActor, input: ChangeArtifactUseGrant): Promise<ArtifactUseGrant> {
        return this.db.transaction((manager) => this.acceptInTransaction(actor, input, manager))
    }

    /** Host-only composition with reference insertion; the caller owns the transaction. */
    async acceptInTransaction(
        actor: ContentActor,
        input: ChangeArtifactUseGrant & { acceptAnalysis?: boolean },
        manager: EntityManager
    ) {
        this.actor(actor)
        const grant = await this.lock(manager, actor, input)
        await this.target(actor, grant, 'manage')
        if (grant.status !== 'offered' || grant.expiresAt <= new Date()) throw this.denied()
        const { artifact } = await this.source(manager, actor, grant.artifactId, grant.versionId, grant.ownerProjectId)
        await this.types.assertUseGrant(artifact, grant)
        grant.status = 'active'
        if (!input.acceptAnalysis) grant.analysis = null
        grant.acceptedById = actor.userId
        grant.acceptedAt = new Date()
        grant.revision++
        await manager.getRepository(ArtifactUseGrant).save(grant)
        await this.audit(manager, actor, grant, 'accepted')
        return grant
    }

    async revoke(actor: ContentActor, input: ChangeArtifactUseGrant) {
        return this.close(actor, input, 'revoked')
    }

    async remove(actor: ContentActor, input: ChangeArtifactUseGrant) {
        return this.close(actor, input, 'removed')
    }

    private async close(actor: ContentActor, input: ChangeArtifactUseGrant, status: 'revoked' | 'removed') {
        return this.db.transaction((manager) => this.closeInTransaction(actor, input, status, manager))
    }

    /** Host-only composition with reference removal; the caller owns the transaction. */
    removeInTransaction(actor: ContentActor, input: ChangeArtifactUseGrant, manager: EntityManager) {
        return this.closeInTransaction(actor, input, 'removed', manager)
    }

    private async closeInTransaction(
        actor: ContentActor,
        input: ChangeArtifactUseGrant,
        status: 'revoked' | 'removed',
        manager: EntityManager
    ) {
        this.actor(actor, status === 'revoked')
        const grant = await this.lock(manager, actor, input)
        if (status === 'revoked') {
            // Revocation remains available after type uninstall or source archival, but not after losing management.
            const project = (await this.projects.listReadable({ actor, projectIds: [grant.ownerProjectId] }))[0]
            if (!project || !['owner', 'manager'].includes(project.role)) throw this.denied()
        } else {
            await this.commands.execute(new ResolveGroupProjectAccessCommand(actor, grant.targetGroupId, 'remove'))
        }
        if (!['offered', 'active'].includes(grant.status)) throw this.denied()
        grant.status = status
        grant.closedById = actor.userId
        grant.closedAt = new Date()
        grant.revision++
        await manager.getRepository(ArtifactUseGrant).save(grant)
        await this.audit(manager, actor, grant, status)
        return grant
    }

    /** Internal viewer entry only. Revalidate after reading bytes; this result must never become a cached ACL. */
    async authorizeRead(actor: ContentActor, input: ReadArtifactUseGrant) {
        return this.authorizeReadInTransaction(actor, input, this.db.manager)
    }

    /** Host composition uses the same manager for grant locks and audit FK writes. */
    async authorizeReadInTransaction(actor: ContentActor, input: ReadArtifactUseGrant, manager: EntityManager) {
        this.actor(actor)
        const grant = await manager
            .getRepository(ArtifactUseGrant)
            .findOneBy({ ...this.scope(actor), id: input.grantId })
        if (!grant) throw this.missing()
        try {
            if (
                grant.status !== 'active' ||
                grant.permission !== 'read' ||
                grant.expiresAt <= new Date() ||
                grant.targetGroupId !== input.groupId ||
                grant.targetProjectId !== input.projectId
            )
                throw this.denied()
            await this.target(actor, grant, 'read')
            const source = await this.source(manager, actor, grant.artifactId, grant.versionId, grant.ownerProjectId)
            const provider = this.types.provider(source.artifact)
            await this.sourceAccess.assertGroupGrantedRead(source.artifact, actor)
            await this.types.assertUseGrant(source.artifact, grant)
            await this.target(actor, grant, 'read')
            const currentSource = await this.source(
                manager,
                actor,
                grant.artifactId,
                grant.versionId,
                grant.ownerProjectId
            )
            if (this.types.provider(currentSource.artifact) !== provider) throw this.denied()
            // A revocation that completed during provider authorization must win before returning source metadata.
            const current = await manager.getRepository(ArtifactUseGrant).findOneBy({
                ...this.scope(actor),
                id: grant.id,
                revision: grant.revision,
                status: 'active'
            })
            if (!current || current.expiresAt <= new Date()) throw this.denied()
            await this.audit(manager, actor, grant, 'access')
            return { grant: current, ...currentSource }
        } catch (error) {
            await this.audit(manager, actor, grant, 'denied')
            throw error
        }
    }

    private async source(
        manager: EntityManager,
        actor: ContentActor,
        artifactId: string,
        versionId: string,
        ownerProjectId?: string
    ) {
        const artifact = await manager
            .getRepository(Artifact)
            .findOneBy({ ...this.scope(actor), id: artifactId, status: 'active' })
        if (
            !artifact ||
            artifact.userId ||
            !artifact.projectId ||
            (ownerProjectId && artifact.projectId !== ownerProjectId)
        )
            throw this.missing()
        const project = await manager
            .getRepository(XpertProject)
            .findOneBy({ ...this.scope(actor), id: artifact.projectId })
        if (!project || project.status === 'archived') throw this.denied()
        const version = await manager.getRepository(ArtifactVersion).findOneBy({
            ...this.scope(actor),
            id: versionId,
            artifactId,
            status: 'active'
        })
        if (!version) throw this.missing()
        this.types.assertGroupUseGrant(artifact)
        return { artifact, version }
    }

    private async target(actor: ContentActor, grant: ArtifactUseGrant, operation: 'read' | 'manage') {
        const target = await this.commands.execute(
            new ResolveGroupProjectAccessCommand(actor, grant.targetGroupId, operation)
        )
        if (target.projectId !== grant.targetProjectId) throw this.denied()
    }

    private async lock(manager: EntityManager, actor: ContentActor, input: ChangeArtifactUseGrant) {
        const grant = await manager.getRepository(ArtifactUseGrant).findOne({
            where: { ...this.scope(actor), id: input.grantId },
            lock: { mode: 'pessimistic_write' }
        })
        if (!grant) throw this.missing()
        if (grant.revision !== input.expectedRevision)
            throw new ConflictException(t('server-ai:Error.ArtifactUseGrantConflict'))
        return grant
    }

    private audit(manager: EntityManager, actor: ContentActor, grant: ArtifactUseGrant, event: ArtifactUseGrantEvent) {
        return manager.getRepository(ArtifactUseGrantAudit).insert({
            ...this.scope(actor),
            grantId: grant.id,
            actorId: actor.userId,
            event,
            revision: grant.revision
        })
    }

    private actor(actor: ContentActor, unrestricted = false) {
        if (!actor.tenantId || !actor.organizationId || !actor.userId || RequestContext.currentApiKey())
            throw this.denied()
        if (
            (RequestContext.currentTenantId() && RequestContext.currentTenantId() !== actor.tenantId) ||
            (RequestContext.getOrganizationId() && RequestContext.getOrganizationId() !== actor.organizationId) ||
            (RequestContext.currentUserId() && RequestContext.currentUserId() !== actor.userId) ||
            (unrestricted && RequestContext.currentApiPrincipal())
        )
            throw this.denied()
    }

    private scope(actor: ContentActor) {
        return { tenantId: actor.tenantId, organizationId: actor.organizationId }
    }
    private denied() {
        return new ForbiddenException(t('server-ai:Error.ArtifactUseGrantDenied'))
    }
    private missing() {
        return new NotFoundException(t('server-ai:Error.ArtifactUseGrantNotFound'))
    }
}
