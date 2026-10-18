// Invariants: plugin callbacks never run in a transaction. The project row serializes only database writes.
// Verify the Redis fence after taking that row lock so an expired worker cannot overwrite a successor.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { IProjectTaskProvider, ProjectTaskSnapshot } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { ProjectTaskProjectionCoordinator, type ProjectionClaim } from './project-task-projection.coordinator'
import { projectionScope, writeTaskProjection } from './project-task-projection.writer'

@Injectable()
export class ProjectTaskProjectionStore {
    constructor(
        @InjectRepository(XpertProject) private readonly projects: Repository<XpertProject>,
        private readonly coordinator: ProjectTaskProjectionCoordinator
    ) {}

    async apply(claim: ProjectionClaim, provider: IProjectTaskProvider, snapshot: ProjectTaskSnapshot) {
        return this.projects.manager.transaction(async (manager) => {
            await manager.query("SET LOCAL lock_timeout = '2s'")
            await manager.query("SET LOCAL statement_timeout = '5s'")
            await manager.findOneOrFail(XpertProject, {
                where: {
                    id: claim.context.projectId,
                    tenantId: claim.context.actor.tenantId,
                    organizationId: projectionScope(claim.context).organizationId
                },
                lock: { mode: 'pessimistic_write' }
            })
            await this.coordinator.assertCurrent(claim)
            const links = await writeTaskProjection(manager, claim.context, provider, snapshot)
            await this.coordinator.assertCurrent(claim)
            return links
        })
    }
}
