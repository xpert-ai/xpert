// Group references are not catalog entries: sharing a runtime Project does not share its groups' grants.
// Acceptance and placement commit together. Legacy Project references keep their original source ACL.
import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import type { ArtifactGroupReference, ArtifactUseGrantSummary } from '@xpert-ai/contracts'
import { getConfig } from '@xpert-ai/server-config'
import { t } from 'i18next'
import { DataSource, EntityManager, In, MoreThan } from 'typeorm'
import { ResolveGroupProjectAccessCommand } from '../../chat-group/commands/group-project-access.command'
import { Artifact, ArtifactVersion } from '../entities'
import { ArtifactReference } from '../library/artifact-reference.entity'
import { ArtifactUseGrant, ArtifactUseGrantAudit } from '../use-grants/artifact-use-grant.entity'
import { ArtifactUseGrantService } from '../use-grants/artifact-use-grant.service'
import type { ChangeArtifactUseGrant } from '../use-grants/artifact-use-grant.schema'
import type { ArtifactReferencePage, ArtifactReferenceRevision } from './artifact-group-reference.schema'

export function artifactUseGrantSummary(grant: ArtifactUseGrant): ArtifactUseGrantSummary {
    return {
        id: grant.id,
        artifactId: grant.artifactId,
        versionId: grant.versionId,
        ownerProjectId: grant.ownerProjectId,
        targetGroupId: grant.targetGroupId,
        targetProjectId: grant.targetProjectId,
        permission: grant.permission,
        analysis: grant.analysis ?? null,
        status: grant.status,
        revision: grant.revision,
        expiresAt: grant.expiresAt.toISOString()
    }
}

@Injectable()
export class ArtifactGroupReferenceService {
    constructor(
        private readonly db: DataSource,
        private readonly commands: CommandBus,
        private readonly grants: ArtifactUseGrantService
    ) {}

    async offers(actor: ContentActor, groupId: string, page: ArtifactReferencePage) {
        const target = await this.target(actor, groupId, 'manage')
        const rows = await this.db.getRepository(ArtifactUseGrant).find({
            where: {
                ...this.scope(actor),
                targetGroupId: groupId,
                targetProjectId: target.projectId,
                status: In(['offered', 'active']),
                expiresAt: MoreThan(new Date())
            },
            order: { id: 'ASC' },
            skip: page.offset,
            take: page.limit
        })
        return {
            items: await Promise.all(
                rows.map(async (grant) => {
                    const version = await this.db
                        .getRepository(ArtifactVersion)
                        .findOneBy({ ...this.scope(actor), id: grant.versionId, artifactId: grant.artifactId })
                    return {
                        ...artifactUseGrantSummary(grant),
                        title: version?.title || '',
                        versionNumber: version?.versionNumber ?? 0
                    }
                })
            ),
            nextOffset: rows.length === page.limit ? page.offset + page.limit : null
        }
    }

    async attach(
        actor: ContentActor,
        groupId: string,
        input: ChangeArtifactUseGrant & { acceptAnalysis?: boolean }
    ): Promise<ArtifactGroupReference> {
        const target = await this.target(actor, groupId, 'manage')
        return this.db.transaction(async (manager) => {
            let grant = await manager.getRepository(ArtifactUseGrant).findOne({
                where: {
                    ...this.scope(actor),
                    id: input.grantId,
                    targetGroupId: groupId,
                    targetProjectId: target.projectId
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!grant) throw this.missing()
            const existing = await manager.getRepository(ArtifactReference).findOneBy({
                ...this.scope(actor),
                groupId,
                projectId: target.projectId,
                useGrantId: grant.id
            })
            if (existing && !existing.deleted && grant.status === 'active') {
                // A lost acceptance response may be retried with the preceding offered revision.
                if (![grant.revision, grant.revision - 1].includes(input.expectedRevision)) throw this.conflict()
                const resolved = await this.grants.authorizeReadInTransaction(
                    actor,
                    { grantId: grant.id, groupId, projectId: target.projectId },
                    manager
                )
                this.assertBinding(existing, resolved.grant)
                return this.describe(existing, resolved.grant, resolved.version)
            }
            if (grant.revision !== input.expectedRevision) throw this.conflict()
            if (grant.status === 'offered') grant = await this.grants.acceptInTransaction(actor, input, manager)
            else if (grant.status === 'active')
                await this.grants.authorizeReadInTransaction(
                    actor,
                    { grantId: grant.id, groupId, projectId: target.projectId },
                    manager
                )
            else throw this.denied()
            if (existing) throw this.denied()
            const version = await manager
                .getRepository(ArtifactVersion)
                .findOneByOrFail({ ...this.scope(actor), id: grant.versionId, artifactId: grant.artifactId })
            const artifact = await manager
                .getRepository(Artifact)
                .findOneByOrFail({ ...this.scope(actor), id: grant.artifactId })
            const reference = await manager.getRepository(ArtifactReference).save({
                ...this.scope(actor),
                groupId,
                projectId: grant.targetProjectId,
                useGrantId: grant.id,
                artifactId: grant.artifactId,
                versionId: grant.versionId,
                title: (version.title || artifact.title || version.fileName || '').slice(0, 200),
                revision: 1,
                deleted: false
            })
            await this.audit(manager, actor, grant, 'reference_attached')
            return this.describe(reference, grant, version)
        })
    }

    async list(actor: ContentActor, groupId: string, page: ArtifactReferencePage) {
        const target = await this.target(actor, groupId, 'read')
        const rows = await this.db.getRepository(ArtifactReference).find({
            where: { ...this.scope(actor), groupId, projectId: target.projectId, deleted: false },
            order: { id: 'ASC' },
            skip: page.offset,
            take: page.limit
        })
        const items: ArtifactGroupReference[] = []
        for (const row of rows) {
            try {
                items.push((await this.resolve(actor, groupId, row.id)).descriptor)
            } catch (error) {
                if (!(error instanceof HttpException) || ![403, 404, 410].includes(error.getStatus())) throw error
            }
        }
        return { items, nextOffset: rows.length === page.limit ? page.offset + page.limit : null }
    }

    async resolve(actor: ContentActor, groupId: string, referenceId: string) {
        const reference = await this.db.getRepository(ArtifactReference).findOneBy({
            ...this.scope(actor),
            id: referenceId,
            groupId,
            deleted: false
        })
        if (!reference?.useGrantId || !reference.groupId) throw this.missing()
        const selected = await this.grants.authorizeRead(actor, {
            grantId: reference.useGrantId,
            groupId,
            projectId: reference.projectId
        })
        this.assertBinding(reference, selected.grant)
        return { reference, ...selected, descriptor: this.describe(reference, selected.grant, selected.version) }
    }

    async remove(actor: ContentActor, groupId: string, referenceId: string, input: ArtifactReferenceRevision) {
        await this.commands.execute(new ResolveGroupProjectAccessCommand(actor, groupId, 'remove'))
        return this.db.transaction(async (manager) => {
            const reference = await manager
                .getRepository(ArtifactReference)
                .findOneBy({ ...this.scope(actor), id: referenceId, groupId })
            if (!reference?.useGrantId || reference.deleted) throw this.missing()
            if (reference.revision !== input.expectedRevision) throw this.conflict()
            let grant = await manager.getRepository(ArtifactUseGrant).findOne({
                where: { ...this.scope(actor), id: reference.useGrantId, targetGroupId: groupId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!grant) throw this.missing()
            this.assertBinding(reference, grant)
            if (['offered', 'active'].includes(grant.status))
                grant = await this.grants.removeInTransaction(
                    actor,
                    {
                        grantId: grant.id,
                        expectedRevision: grant.revision
                    },
                    manager
                )
            const changed = await manager.getRepository(ArtifactReference).update(
                {
                    ...this.scope(actor),
                    id: reference.id,
                    groupId,
                    revision: input.expectedRevision,
                    deleted: false
                },
                { deleted: true, revision: input.expectedRevision + 1 }
            )
            if (changed.affected !== 1) throw this.conflict()
            await this.audit(manager, actor, grant, 'reference_removed')
        })
    }

    private async target(actor: ContentActor, groupId: string, operation: 'read' | 'manage') {
        const target = await this.commands.execute(new ResolveGroupProjectAccessCommand(actor, groupId, operation))
        if (!target.projectId) throw this.denied()
        return target
    }
    private assertBinding(reference: ArtifactReference, grant: ArtifactUseGrant) {
        if (
            reference.useGrantId !== grant.id ||
            reference.artifactId !== grant.artifactId ||
            reference.versionId !== grant.versionId ||
            reference.groupId !== grant.targetGroupId ||
            reference.projectId !== grant.targetProjectId
        )
            throw this.denied()
    }
    private describe(
        reference: ArtifactReference,
        grant: ArtifactUseGrant,
        version: ArtifactVersion
    ): ArtifactGroupReference {
        return {
            id: reference.id,
            grantId: grant.id,
            artifactId: reference.artifactId,
            versionId: reference.versionId,
            ownerProjectId: grant.ownerProjectId,
            runtimeProjectId: reference.projectId,
            groupId: reference.groupId,
            title: reference.title,
            revision: reference.revision,
            versionNumber: version.versionNumber,
            expiresAt: grant.expiresAt.toISOString(),
            readOnly: true,
            analysis: grant.analysis ?? null,
            url: new URL(`/artifacts/library/${reference.id}`, getConfig().clientBaseUrl).toString()
        }
    }
    private audit(
        manager: EntityManager,
        actor: ContentActor,
        grant: ArtifactUseGrant,
        event: 'reference_attached' | 'reference_removed'
    ) {
        return manager
            .getRepository(ArtifactUseGrantAudit)
            .insert({ ...this.scope(actor), grantId: grant.id, actorId: actor.userId, event, revision: grant.revision })
    }
    private scope(actor: ContentActor) {
        return { tenantId: actor.tenantId, organizationId: actor.organizationId }
    }
    private missing() {
        return new NotFoundException(t('server-ai:Error.ArtifactUseGrantNotFound'))
    }
    private denied() {
        return new ForbiddenException(t('server-ai:Error.ArtifactUseGrantDenied'))
    }
    private conflict() {
        return new ConflictException(t('server-ai:Error.ArtifactUseGrantConflict'))
    }
}
