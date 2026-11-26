// Authorization is immutable and bound to the operation's complete inputs. The separate dispatch marker
// allows recovery of pre-upgrade permission failures without replaying an installation with an uncertain effect.
import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { projectPluginInstallationAuthorizationSchema } from './plugin-installation-authorization.schema'
import type { ProjectPipelineContext, ProjectPipelineOperationContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'
import { lockManagedProject, managedAudit } from '../runtime/pipeline-transaction'
import { ProjectPluginDeploymentStore, deploymentConflict } from './plugin-deployment.store'

@Injectable()
export class ProjectPluginInstallationAuthorizationStore {
    constructor(
        private readonly db: DataSource,
        private readonly deployments: ProjectPluginDeploymentStore
    ) {}
    version(operation: ProjectPipelineOperationEntity) {
        const c = operation.context
        return pipelineDigest({ ...c, actor: { ...c.actor }, work: { ...c.work }, resources: undefined })
    }

    async read(operation: ProjectPipelineOperationEntity, manager = this.db.manager) {
        const c = operation.context
        const id = pipelineIdentity(c, 'plugin-installation-authorization', operation.id)
        const event = await manager.findOneBy(ProjectPipelineEventEntity, { ...projectionScope(c), id })
        if (!event) return null
        const value = projectPluginInstallationAuthorizationSchema.parse(event.payload.pluginInstallationAuthorization)
        if (
            value.operationId !== operation.id ||
            value.bindingDigest !== this.version(operation) ||
            event.instanceId !== operation.instanceId ||
            event.payload.operationId !== operation.id
        )
            throw deploymentConflict()
        return { id, actorId: value.actorId, digest: pipelineDigest(value) }
    }

    async authorize(c: ProjectPipelineContext, operation: ProjectPipelineOperationEntity, version: string) {
        return this.db.transaction(async (manager) => {
            await lockManagedProject(manager, c)
            const row = await this.deployments.operation(c, operation.id, manager)
            await this.deployments.current(c, row, manager)
            if (this.version(row) !== version) throw deploymentConflict()
            const existing = await this.read(row, manager)
            if (existing) return existing
            if (!['dispatching', 'pending', 'unknown'].includes(row.state)) throw deploymentConflict()
            const id = pipelineIdentity(row.context, 'plugin-installation-authorization', row.id)
            const value = projectPluginInstallationAuthorizationSchema.parse({
                operationId: row.id,
                actorId: c.actor.userId,
                bindingDigest: version,
                authorizedAt: new Date().toISOString()
            })
            await this.event(manager, c, row, id, { pluginInstallationAuthorization: value })
            // Wake inspection; never reset the operation or change its immutable business approval.
            await manager.update(
                ProjectPipelineOperationEntity,
                { ...projectionScope(c), id: row.id },
                { nextCheckAt: new Date() }
            )
            return { id, actorId: value.actorId, digest: pipelineDigest(value) }
        })
    }

    async dispatched(operation: ProjectPipelineOperationEntity) {
        return this.db.manager.existsBy(ProjectPipelineEventEntity, {
            ...projectionScope(operation.context),
            id: pipelineIdentity(operation.context, 'plugin-installation-dispatch', operation.id)
        })
    }

    async beginDispatch(
        c: ProjectPipelineOperationContext,
        claim: ProjectPipelineOperationEntity,
        authorization: NonNullable<Awaited<ReturnType<ProjectPluginInstallationAuthorizationStore['read']>>>
    ) {
        return this.db.transaction(async (manager) => {
            await lockManagedProject(manager, c)
            const row = await this.deployments.operation(c, claim.id, manager)
            await this.deployments.current(c, row, manager)
            if (
                row.leaseOwner !== claim.leaseOwner ||
                row.leaseFence !== claim.leaseFence ||
                !row.leaseExpiresAt ||
                row.leaseExpiresAt.getTime() <= Date.now() ||
                pipelineDigest(await this.read(row, manager)) !== pipelineDigest(authorization)
            )
                throw deploymentConflict()
            const id = pipelineIdentity(c, 'plugin-installation-dispatch', row.id)
            if (await manager.existsBy(ProjectPipelineEventEntity, { ...projectionScope(c), id })) return false
            await this.event(manager, c, row, id, {
                pluginInstallationDispatch: {
                    authorizationId: authorization.id,
                    authorizationDigest: authorization.digest
                }
            })
            return true
        })
    }

    private async event(
        manager: EntityManager,
        c: ProjectPipelineContext,
        row: ProjectPipelineOperationEntity,
        id: string,
        payload: Omit<ProjectPipelineEventEntity['payload'], 'roundId'>
    ) {
        const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
            ...projectionScope(c),
            id: row.instanceId
        })
        instance.revision += 1
        await manager.save(instance)
        await manager.insert(ProjectPipelineEventEntity, {
            ...managedAudit(c),
            id,
            instanceId: instance.id,
            revision: instance.revision,
            type: 'operation.observed',
            payload: {
                ...payload,
                roundId: row.roundId,
                operationId: row.id,
                humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, c, instance.id)
            }
        })
    }
}
