import { randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'
import { projectPipelineProjectionSchema, type ProjectPipelineProjection } from '@xpert-ai/contracts'
import type { IProjectPipelineProjectionProvider, ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../../entities/project.entity'
import { XpertProjectTask } from '../../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../../entities/project-task-execution.entity'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineEventEntity
} from '../../persistence/pipeline.entity'
import type { ProjectPipelineProjectionStore } from '../pipeline-projection.store'

/** Run the same persistence boundaries against fresh SQL and ORM-precreated layouts. */
export function projectionBoundaryCases(
    fixture: () => { db: DataSource; store: ProjectPipelineProjectionStore; context: ProjectPipelineContext },
    snapshot: () => ProjectPipelineProjection,
    provider: IProjectPipelineProjectionProvider
) {
    it('does not append new rounds to an already terminal run', async () => {
        const { db, store, context } = fixture()
        const source = snapshot()
        source.run.state = 'completed'
        source.round.state = 'completed'
        await store.apply(context, provider, source)
        const later = structuredClone(source)
        later.sourceSequence = 2
        later.round = { ...source.round, key: 'round-2', sequence: 2, generation: 2, state: 'active' }
        await expect(store.apply(context, provider, later)).rejects.toMatchObject({
            response: { code: 'RUN_TERMINAL_IMMUTABLE' }
        })
        expect(await db.getRepository(ProjectPipelineRoundEntity).countBy({ projectId: context.projectId })).toBe(1)
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(1)
    })

    it('allows cancelling to settle but prevents a new run while cancellation is pending', async () => {
        const { db, store, context } = fixture()
        const source = snapshot()
        await store.apply(context, provider, source)
        source.sourceSequence = 2
        source.run.state = 'cancelling'
        await store.apply(context, provider, source)
        const replacement = structuredClone(source)
        replacement.sourceSequence = 3
        replacement.run = { key: 'replacement', state: 'active' }
        await expect(store.apply(context, provider, replacement)).rejects.toMatchObject({
            response: { code: 'ACTIVE_RUN_EXISTS' }
        })
        source.sourceSequence = 3
        source.run.state = 'cancelled'
        source.round.state = 'cancelled'
        await expect(store.apply(context, provider, source)).resolves.toMatchObject({ status: 'applied', revision: 3 })
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(3)
    })

    it('never reselects an archived run to rewrite its historical round', async () => {
        const { db, store, context } = fixture()
        const first = snapshot()
        first.run.state = 'completed'
        first.round.state = 'completed'
        const applied = await store.apply(context, provider, first)
        const history = await db
            .getRepository(ProjectPipelineRoundEntity)
            .findOneByOrFail({ projectId: context.projectId })
        const newer = structuredClone(first)
        newer.sourceSequence = 2
        newer.run.key = 'run-2'
        newer.tasks[0].title = 'New run task'
        await store.apply(context, provider, newer)
        const current = await db
            .getRepository(ProjectPipelineInstanceEntity)
            .findOneByOrFail({ id: applied.instanceId })
        const replay = structuredClone(first)
        replay.sourceSequence = 3
        replay.tasks[0].title = 'Rewritten historical task'
        replay.nodes[0].title = 'Rewritten historical node'
        await expect(
            store.apply(context, provider, projectPipelineProjectionSchema.parse(replay))
        ).rejects.toMatchObject({
            response: { code: 'RUN_HISTORY_IMMUTABLE' }
        })
        expect(await db.getRepository(ProjectPipelineRoundEntity).findOneByOrFail({ id: history.id })).toEqual(history)
        expect(
            await db.getRepository(ProjectPipelineInstanceEntity).findOneByOrFail({ id: applied.instanceId })
        ).toEqual(current)
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(2)
        expect((await db.getRepository(XpertProjectTask).findOneByOrFail({ id: applied.tasks[0].taskId })).title).toBe(
            'New run task'
        )
    })

    it('rejects a new source key aliasing an existing node identity even with a tombstone', async () => {
        const { db, store, context } = fixture()
        const source = snapshot()
        const applied = await store.apply(context, provider, source)
        const before = await db
            .getRepository(ProjectPipelineNodeEntity)
            .findOneByOrFail({ projectId: context.projectId })
        const renamed = structuredClone(source)
        renamed.sourceSequence = 2
        renamed.tasks[0].title = 'Must roll back'
        renamed.nodes[0].key = 'renamed'
        renamed.nodeTombstones = [{ key: source.nodes[0].key, reason: 'removed' }]
        await expect(
            store.apply(context, provider, projectPipelineProjectionSchema.parse(renamed))
        ).rejects.toMatchObject({
            response: { code: 'NODE_IDENTITY_CHANGED' }
        })
        expect(await db.getRepository(ProjectPipelineNodeEntity).findOneByOrFail({ id: before.id })).toEqual(before)
        expect((await db.getRepository(XpertProjectTask).findOneByOrFail({ id: applied.tasks[0].taskId })).title).toBe(
            source.tasks[0].title
        )
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(1)
    })

    it('retains observed attempt timing and identity when a later projection omits optional fields', async () => {
        const { db, store, context } = fixture()
        const source = snapshot()
        const attempt = source.tasks[0].executions[0]
        attempt.agentExecutionId = randomUUID()
        attempt.startedAt = '2026-10-19T00:00:00Z'
        attempt.completedAt = '2026-10-19T00:00:05Z'
        const applied = await store.apply(context, provider, source)
        const later = structuredClone(source)
        later.sourceSequence = 2
        delete later.tasks[0].executions[0].agentExecutionId
        delete later.tasks[0].executions[0].startedAt
        delete later.tasks[0].executions[0].completedAt
        later.tasks[0].executions[0].outputSummary = 'Additional evidence'
        await store.apply(context, provider, projectPipelineProjectionSchema.parse(later))
        expect(
            await db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ taskId: applied.tasks[0].taskId })
        ).toMatchObject({
            agentExecutionId: attempt.agentExecutionId,
            startedAt: new Date(attempt.startedAt),
            completedAt: new Date(attempt.completedAt),
            outputSummary: 'Additional evidence'
        })
        later.sourceSequence = 3
        later.tasks[0].executions[0].agentExecutionId = randomUUID()
        await expect(store.apply(context, provider, later)).rejects.toMatchObject({
            response: { code: 'ATTEMPT_IDENTITY_IMMUTABLE' }
        })
    })

    it('keeps tenant and null-organization scopes exact for reads and writes', async () => {
        const { db, store, context } = fixture()
        const source = snapshot()
        await store.apply(context, provider, source)
        for (const actor of [
            { ...context.actor, tenantId: randomUUID() },
            { ...context.actor, organizationId: randomUUID() },
            { ...context.actor, organizationId: null }
        ]) {
            const foreign = { ...context, actor }
            expect(await store.checkpoint(foreign, provider.key, source.sourceKey)).toBeNull()
            await expect(store.apply(foreign, provider, source)).rejects.toThrow()
        }
        const tenantContext = { projectId: randomUUID(), actor: { ...context.actor, organizationId: null } }
        await db
            .getRepository(XpertProject)
            .save({ id: tenantContext.projectId, name: 'Tenant project', ...tenantContext.actor })
        await store.apply(tenantContext, provider, source)
        expect(await store.checkpoint(tenantContext, provider.key, source.sourceKey)).toMatchObject({
            sourceSequence: 1
        })
        expect(
            await store.checkpoint({ ...tenantContext, actor: context.actor }, provider.key, source.sourceKey)
        ).toBeNull()
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(1)
    })
}
