jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, Table, TableForeignKey } from 'typeorm'
import { coreEntities } from '../../../../../server/src/core/entities'
import { ALL_AI_ENTITIES } from '../../../core/entities'
import { projectPipelineProjectionSchema, type ProjectPipelineProjection } from '@xpert-ai/contracts'
import type { IProjectPipelineProjectionProvider, ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineTaskLinkEntity,
    ProjectPipelineEntities
} from '../persistence/pipeline.entity'
import { ProjectPipelineProjectionStore } from './pipeline-projection.store'
import { ProjectPipelineQueryService } from '../queries/pipeline-query.service'
import { ProjectPipelinePortfolioService } from '../queries/pipeline-portfolio.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import type { XpertProjectAccessService } from '../../services/project-access.service'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import { ProjectPipelineAnalyticsService } from '../queries/pipeline-analytics.service'
import { pipelineEntryFocus } from '../queries/pipeline-entry-focus'
import { readPipelineHumanWaitStatistics } from '../queries/pipeline-human-wait-statistics'
import { pipelineTaskDispositions } from '../queries/pipeline-task-disposition'
import { ProjectTaskGraphService } from '../../services/project-task-graph.service'
import { ProjectPipelineRefreshEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineRefreshStore } from './pipeline-refresh.store'
import { ProjectPipelineSchemaService } from '../persistence/pipeline-schema.service'
import { pipelineQueueFixture, untilPipeline } from './testing/pipeline-queue.fixture'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ProjectPipelineContributionRegistry } from '@xpert-ai/plugin-sdk'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { projectionBoundaryCases } from './testing/projection-boundaries.cases'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const provider: IProjectPipelineProjectionProvider = { key: 'neutral.flow@1', snapshot: async () => null }

function snapshot(): ProjectPipelineProjection {
    return projectPipelineProjectionSchema.parse({
        schemaVersion: 1,
        sourceKey: 'case-a',
        sourceEpoch: randomUUID(),
        sourceSequence: 1,
        title: 'Neutral workflow',
        definition: {
            key: 'neutral.workflow',
            version: '1.0.0',
            title: 'Neutral workflow',
            executionAuthority: 'provider',
            providerRef: provider.key,
            projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
            subjectResolverRef: 'neutral.subject@1',
            topology: { source: 'provider', presentationAdapterRef: 'neutral.presentation@1' },
            roles: [{ key: 'worker', allowedKinds: ['service'] }],
            lanes: [{ key: 'work', roleKey: 'worker', label: 'Work', order: 0 }],
            stages: [{ key: 'check', label: 'Check', order: 0 }]
        },
        subject: { resolverRef: 'neutral.subject@1', objectKey: 'case-a' },
        run: { key: 'run-1', state: 'active' },
        round: {
            key: 'round-1',
            sequence: 1,
            generation: 1,
            state: 'active',
            inputDigest: 'a'.repeat(64),
            subjectVersionSet: [
                { resolverRef: 'neutral.subject@1', objectKey: 'case-a', version: '1', digest: 'a'.repeat(64) }
            ]
        },
        nodes: [
            {
                key: 'check',
                nodeKey: 'check',
                expansionKey: 'root',
                title: 'Check document',
                kind: 'work',
                laneKey: 'work',
                stageKey: 'check',
                taskKeys: ['check'],
                evidence: [],
                state: {
                    lifecycle: 'active',
                    readiness: 'blocked',
                    applicability: 'selected',
                    freshness: 'current',
                    runtime: 'succeeded'
                }
            }
        ],
        edges: [],
        tasks: [
            {
                key: 'check',
                title: 'Check document',
                kind: 'task',
                status: 'review',
                predecessorKeys: [],
                executions: [{ key: 'attempt-1', attempt: 1, status: 'succeeded' }]
            }
        ],
        taskTombstones: [],
        nodeTombstones: []
    })
}

integration.each(['empty', 'orm-precreated'])('Project Pipeline atomic PostgreSQL projection (%s)', (layout) => {
    let db: DataSource
    let store: ProjectPipelineProjectionStore
    let context: ProjectPipelineContext
    const schema = `pipeline_${randomUUID().replace(/-/g, '')}`
    const migration = readFileSync(join(__dirname, '../migrations/20261018-project-pipeline.sql'), 'utf8')
    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_pipeline_test_'))
            throw new Error('Dedicated pipeline test database required')
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            entities: [...coreEntities, ...ALL_AI_ENTITIES],
            uuidExtension: 'pgcrypto',
            poolSize: 4,
            extra: { options: `-c search_path=${schema},public` }
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        const runner = db.createQueryRunner()
        // Use production column metadata; unrelated host relations are outside this isolated migration test.
        for (const entity of [
            XpertProject,
            XpertProjectMembership,
            XpertProjectTask,
            XpertProjectTaskExecution,
            ...(layout === 'orm-precreated' ? ProjectPipelineEntities : [])
        ]) {
            await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
        }
        await runner.release()
        await db.query(migration)
        await db.query(migration)
        const runtime = readFileSync(join(__dirname, '../migrations/20261018-project-pipeline-runtime.sql'), 'utf8')
        await db.query(runtime)
        await db.query(runtime)
        const resources = readFileSync(join(__dirname, '../migrations/20261019-project-pipeline-resources.sql'), 'utf8')
        await db.query(resources)
        await db.query(resources)
        const runtimeIntent = readFileSync(
            join(__dirname, '../migrations/20261019-project-pipeline-runtime-intent.sql'),
            'utf8'
        )
        await db.query(runtimeIntent)
        await db.query(runtimeIntent)
        const actions = readFileSync(
            join(__dirname, '../migrations/20261019-project-pipeline-provider-actions.sql'),
            'utf8'
        )
        await db.query(
            readFileSync(join(__dirname, '../migrations/20261019-project-pipeline-model-budget.sql'), 'utf8')
        )
        await db.query(actions)
        await db.query(actions)
        const nativeGrant = readFileSync(
            join(__dirname, '../migrations/20261019-project-pipeline-native-grant.sql'),
            'utf8'
        )
        await db.query(nativeGrant)
        await db.query(nativeGrant)
        store = new ProjectPipelineProjectionStore(db.getRepository(XpertProject))
    }, 30_000)
    beforeEach(async () => {
        context = {
            projectId: randomUUID(),
            actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
        }
        await db.getRepository(XpertProject).save({ id: context.projectId, name: 'Neutral project', ...context.actor })
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    const tasks = () => db.getRepository(XpertProjectTask).findBy({ projectId: context.projectId })
    projectionBoundaryCases(() => ({ db, store, context }), snapshot, provider)

    it('rejects unsupported provider definitions atomically without replacing accepted history', async () => {
        const previous = snapshot(),
            accepted = await store.apply(context, provider, previous)
        const next = projectPipelineProjectionSchema.parse({
            ...previous,
            sourceSequence: 2,
            definition: {
                ...previous.definition,
                version: '2.0.0',
                hostRequirements: { protocol: 1, features: { 'pipeline.future': 1 } }
            }
        })
        await expect(store.apply(context, provider, next)).rejects.toMatchObject({
            response: { code: 'PIPELINE_HOST_INCOMPATIBLE' }
        })
        expect(
            await db.getRepository(ProjectPipelineInstanceEntity).findOneByOrFail({ id: accepted.instanceId })
        ).toMatchObject({ revision: accepted.revision, sourceSequence: '1' })
        expect(await tasks()).toHaveLength(1)
        expect(await db.getRepository(XpertProjectTaskExecution).countBy({ projectId: context.projectId })).toBe(1)
    })

    it('commits human-ready observations atomically, keeps replays stable, and retains separate reopened intervals', async () => {
        const source = snapshot()
        source.nodes[0].kind = 'human_gate'
        source.nodes[0].state.lifecycle = 'pending'
        source.nodes[0].state.readiness = 'ready'
        const first = await store.apply(context, provider, source)
        const node = await db.getRepository(ProjectPipelineNodeEntity).findOneByOrFail({ projectId: context.projectId })
        const read = (waiting: string[], actorContext = context) =>
            readPipelineHumanWaitStatistics(
                db.manager,
                actorContext,
                [first.instanceId],
                waiting,
                { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 1000).toISOString() },
                new Date(Date.now() + 1000).toISOString()
            )
        expect((await read([node.id])).ongoing).toBe(1)
        await store.apply(context, provider, source)
        expect((await read([node.id])).coverage.snapshots).toBe(1)
        await db.query(
            `ALTER TABLE xpert_project_pipeline_event ADD CONSTRAINT wait_test_failure CHECK (jsonb_array_length(payload->'humanWaitSnapshot'->'nodeIds') > 0) NOT VALID`
        )
        const closed = structuredClone(source)
        closed.sourceSequence = 2
        closed.nodes[0].state.lifecycle = 'completed'
        closed.tasks[0].status = 'done'
        await expect(store.apply(context, provider, closed)).rejects.toThrow()
        expect((await tasks())[0].status).toBe('review')
        expect((await read([node.id])).coverage.snapshots).toBe(1)
        await db.query('ALTER TABLE xpert_project_pipeline_event DROP CONSTRAINT wait_test_failure')
        await store.apply(context, provider, closed)
        expect(await read([])).toMatchObject({ intervals: 1, ongoing: 0, coverage: { snapshots: 2 } })
        const reopened = structuredClone(source)
        reopened.sourceSequence = 3
        await store.apply(context, provider, reopened)
        expect(await read([node.id])).toMatchObject({
            intervals: 2,
            ongoing: 1,
            censored: 1,
            coverage: { snapshots: 3 }
        })
        for (const foreign of [
            { ...context, projectId: randomUUID() },
            { ...context, actor: { ...context.actor, tenantId: randomUUID() } },
            { ...context, actor: { ...context.actor, organizationId: randomUUID() } }
        ])
            expect((await read([], foreign)).coverage.snapshots).toBe(0)
    })

    it('resolves only the declared current node and rejects foreign scope, stale, excluded and prior-round targets', async () => {
        const source = snapshot()
        source.nodes[0].navigation = { kind: 'project_application' }
        const first = await store.apply(context, provider, source)
        const node = await db.getRepository(ProjectPipelineNodeEntity).findOneByOrFail({ projectId: context.projectId })
        await expect(pipelineEntryFocus(db.manager, context, node.id)).resolves.toMatchObject({
            instanceId: first.instanceId,
            ownerRef: provider.key,
            sourceKey: source.sourceKey,
            node: { nodeKey: 'check', expansionKey: 'root' }
        })
        for (const foreign of [
            { ...context, projectId: randomUUID() },
            { ...context, actor: { ...context.actor, tenantId: randomUUID() } },
            { ...context, actor: { ...context.actor, organizationId: randomUUID() } }
        ])
            await expect(pipelineEntryFocus(db.manager, foreign, node.id)).rejects.toThrow()
        const initial = structuredClone(node.projection)
        for (const projection of [
            { ...initial, navigation: undefined },
            { ...initial, state: { ...initial.state, freshness: 'superseded' as const } },
            { ...initial, state: { ...initial.state, applicability: 'excluded' as const } }
        ]) {
            await db.getRepository(ProjectPipelineNodeEntity).update(node.id, { projection })
            await expect(pipelineEntryFocus(db.manager, context, node.id)).rejects.toThrow()
        }
        await db.getRepository(ProjectPipelineNodeEntity).update(node.id, { projection: initial })
        source.sourceSequence++
        source.round = {
            ...source.round,
            key: 'round-2',
            sequence: 2,
            generation: 2,
            supersedesKey: 'round-1',
            inputDigest: 'b'.repeat(64)
        }
        await store.apply(context, provider, source)
        await expect(pipelineEntryFocus(db.manager, context, node.id)).rejects.toThrow()
    })

    it('refuses startup after schema drift and accepts the idempotently repaired schema', async () => {
        const readiness = new ProjectPipelineSchemaService(db)
        await readiness.onModuleInit()
        await db.query('ALTER TABLE xpert_project_pipeline_operation DROP COLUMN "runtimeIntent"')
        await expect(readiness.onModuleInit()).rejects.toThrow('pipeline_operation_runtimeIntent')
        await db.query(
            readFileSync(join(__dirname, '../migrations/20261019-project-pipeline-runtime-intent.sql'), 'utf8')
        )
        await readiness.onModuleInit()
        await db.query('ALTER TABLE xpert_project_task DROP CONSTRAINT pipeline_task_instance_fk')
        await expect(readiness.onModuleInit()).rejects.toThrow('PIPELINE_SCHEMA_MIGRATION_REQUIRED')
        await db.query(migration)
        await readiness.onModuleInit()
    })

    it('does not let a late failed worker erase the status of a newer refresh', async () => {
        const refresh = new ProjectPipelineRefreshStore(db.getRepository(ProjectPipelineRefreshEntity))
        const input = { providerRef: provider.key, sourceKey: 'case-a' },
            old = randomUUID(),
            current = randomUUID()
        await refresh.begin(context, input, old, 'queued')
        await refresh.begin(context, input, current, 'queued')
        await refresh.update(context, input, current, 'ready')
        await refresh.update(context, input, old, 'failed', 'LINK_RECEIPT_FAILED')
        expect(
            await db.getRepository(ProjectPipelineRefreshEntity).findOneBy({ projectId: context.projectId })
        ).toMatchObject({ requestId: current, state: 'ready', errorCode: null })
    })

    const queueTest = process.env.XPERT_PIPELINE_TEST_REDIS_URL ? it : it.skip
    queueTest(
        'recovers queued work and a failed linked receipt after replacing the worker, without duplicating tasks or events',
        async () => {
            const input = snapshot()
            let receipts = 0
            const source = {
                ...provider,
                snapshot: async () => {
                    expect(RequestContext.currentTenantId()).toBe(context.actor.tenantId)
                    expect(RequestContext.getOrganizationId()).toBe(context.actor.organizationId)
                    expect(RequestContext.currentUserId()).toBe(context.actor.userId)
                    return input
                },
                linked: async () => {
                    expect(
                        await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })
                    ).toBe(1)
                    if (++receipts === 1) throw new Error('private provider response must not enter diagnostics')
                }
            }
            const fixture = pipelineQueueFixture(db, store, source, context, process.env.XPERT_PIPELINE_TEST_REDIS_URL!)
            try {
                await fixture.request()
                expect(await tasks()).toHaveLength(0)
                const first = fixture.startWorker()
                await untilPipeline(async () => (await fixture.queue.getDelayedCount()) === 1)
                await first.close()
                expect(
                    await db.getRepository(ProjectPipelineRefreshEntity).findOneBy({ projectId: context.projectId })
                ).toMatchObject({ state: 'failed', errorCode: 'LINK_RECEIPT_FAILED' })
                fixture.startWorker()
                await untilPipeline(
                    async () =>
                        (
                            await db
                                .getRepository(ProjectPipelineRefreshEntity)
                                .findOneBy({ projectId: context.projectId })
                        )?.state === 'ready'
                )
                expect(receipts).toBe(2)
                expect(await tasks()).toHaveLength(1)
                expect(
                    await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })
                ).toBe(1)
            } finally {
                await fixture.close()
            }
        },
        25_000
    )

    it('exposes dispatch and credential restrictions without changing stored revisions or business facts', async () => {
        const first = await store.apply(context, provider, snapshot())
        const access = { listReadable: async () => [{ role: 'manager', archived: false, canManage: true }] }
        const registry = { list: () => [], listForActor: () => [] }
        const taskGraph = new ProjectTaskGraphService(
            db.getRepository(XpertProjectTask),
            access as never,
            registry as never,
            { diagnostics: async () => [] } as never,
            registry as never
        )
        const query = new ProjectPipelineQueryService(
            db.getRepository(ProjectPipelineInstanceEntity),
            access as never,
            taskGraph,
            {} as never,
            new ProjectPipelineContributionRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
        )
        const previous = process.env.XPERT_PIPELINE_DISPATCH_ENABLED
        try {
            process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
            const enabled = await query.graph(context, first.instanceId)
            process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
            const paused = await query.graph(context, first.instanceId)
            expect(paused.dispatchEnabled).toBe(false)
            expect(paused.cursor).not.toBe(enabled.cursor)
            expect(paused.instance.revision).toBe(enabled.instance.revision)
            expect(paused.nodes).toEqual(enabled.nodes)
            expect(paused.tasks).toEqual(enabled.tasks)
            expect(paused.permissions).toEqual(enabled.permissions)
            const credential = jest
                .spyOn(RequestContext, 'currentApiPrincipal')
                .mockReturnValue({ principalType: 'client_secret' })
            try {
                const scoped = await query.graph(context, first.instanceId)
                expect(scoped.permissions).toEqual({ canEdit: false, canManage: false })
                expect(scoped.actions).toEqual({ cancel: false, retries: [] })
                expect(scoped.nodes).toEqual(paused.nodes)
                expect(scoped.cursor).not.toBe(paused.cursor)
            } finally {
                credential.mockRestore()
            }
        } finally {
            if (previous === undefined) delete process.env.XPERT_PIPELINE_DISPATCH_ENABLED
            else process.env.XPERT_PIPELINE_DISPATCH_ENABLED = previous
        }
    })

    it('authorizes every portfolio Project in one snapshot, including active membership and exact organization', async () => {
        const assistantAccess = {
            assertCanReadXpert: jest.fn().mockRejectedValue(new Error('Unexpected Assistant access lookup'))
        } as unknown as XpertProjectAccessService
        const access = new ProjectAccessRuntimeService(db.getRepository(XpertProject), assistantAccess)
        await db.getRepository(XpertProject).update(context.projectId, { ownerId: context.actor.userId })
        const second = { ...context, projectId: randomUUID() }
        await db
            .getRepository(XpertProject)
            .save({ id: second.projectId, name: 'Other project', ...context.actor, ownerId: randomUUID() })
        const membership = await db
            .getRepository(XpertProjectMembership)
            .save({ projectId: second.projectId, ...context.actor, role: 'member' })
        const source = snapshot()
        await store.apply(context, provider, source)
        await store.apply(second, provider, source)
        const registry = { list: () => [], listForActor: () => [] }
        // Task graph authorization is exercised separately; the portfolio uses the real snapshot ACL above.
        const taskGraph = new ProjectTaskGraphService(
            db.getRepository(XpertProjectTask),
            { listReadable: async () => [{ role: 'viewer', archived: false }] } as never,
            registry as never,
            { diagnostics: async () => [] } as never,
            registry as never
        )
        const analytics = new ProjectPipelineAnalyticsService(
            db.getRepository(ProjectPipelineInstanceEntity),
            access,
            taskGraph
        )
        const portfolio = new ProjectPipelinePortfolioService(
            db.getRepository(ProjectPipelineInstanceEntity),
            access,
            analytics
        )
        const input = {
            projectIds: [context.projectId, second.projectId],
            window: { from: '2026-10-18T00:00:00Z', to: '2026-10-19T00:00:00Z' }
        }
        const read = analytics.readWithinTransaction.bind(analytics)
        jest.spyOn(analytics, 'readWithinTransaction').mockImplementationOnce(async (...args) => {
            const newer = structuredClone(source)
            newer.sourceSequence = 2
            newer.tasks[0].status = 'done'
            newer.nodes[0].state.lifecycle = 'completed'
            await store.apply(second, provider, newer)
            return read(...args)
        })
        const before = await portfolio.read(context.actor, input)
        expect(before.totals.current.business).toMatchObject({ total: 2, completed: 0 })
        expect(before.byProject.map((row) => row.snapshotAt)).toEqual([before.snapshotAt, before.snapshotAt])
        expect(before.totals.coverage.recordedAttempts).toBe(0)
        expect(before.sharedAcrossProjects).toBe(0)
        expect(before.totals).not.toHaveProperty('humanWait')
        expect(before.byProject.every((row) => row.humanWait && row.queue)).toBe(true)
        expect((await portfolio.read(context.actor, input)).totals.current.business.completed).toBe(1)
        for (const actor of [
            { ...context.actor, tenantId: randomUUID() },
            { ...context.actor, organizationId: randomUUID() },
            { ...context.actor, userId: randomUUID() }
        ])
            await expect(portfolio.read(actor, input)).rejects.toMatchObject({ status: 403 })
        await db.getRepository(XpertProjectMembership).update(membership.id, { removedAt: new Date() })
        const spy = jest.spyOn(analytics, 'readWithinTransaction')
        spy.mockClear()
        await expect(portfolio.read(context.actor, input)).rejects.toMatchObject({ status: 403 })
        expect(spy).not.toHaveBeenCalled()
        await db.getRepository(XpertProjectMembership).update(membership.id, { removedAt: null, deletedAt: new Date() })
        await expect(portfolio.read(context.actor, input)).rejects.toMatchObject({ status: 403 })
        await db.getRepository(XpertProjectMembership).update(membership.id, { deletedAt: null })
        await db.getRepository(XpertProject).delete(second.projectId)
        await expect(portfolio.read(context.actor, input)).rejects.toMatchObject({ status: 403 })
    })

    it('aggregates two instances within the same authorized snapshot without fabricating legacy timing', async () => {
        const input = snapshot(),
            other = snapshot()
        other.sourceKey = 'case-b'
        other.subject.objectKey = 'case-b'
        other.round.subjectVersionSet[0].objectKey = 'case-b'
        await store.apply(context, provider, input)
        await store.apply(context, provider, other)
        const access = { listReadable: jest.fn(async () => [{ role: 'viewer', archived: false }]) }
        const registry = { list: () => [], listForActor: () => [] }
        const taskGraph = new ProjectTaskGraphService(
            db.getRepository(XpertProjectTask),
            access as never,
            registry as never,
            { diagnostics: async () => [] } as never,
            registry as never
        )
        const analytics = new ProjectPipelineAnalyticsService(
            db.getRepository(ProjectPipelineInstanceEntity),
            access as never,
            taskGraph
        )
        const read = taskGraph.graphWithinTransaction.bind(taskGraph)
        jest.spyOn(taskGraph, 'graphWithinTransaction').mockImplementationOnce(async (scope, manager) => {
            const newer = structuredClone(input)
            newer.sourceSequence = 2
            newer.tasks[0].status = 'done'
            newer.nodes[0].state.lifecycle = 'completed'
            newer.tasks[0].executions.push({ key: 'attempt-2', attempt: 2, status: 'succeeded' })
            await store.apply(context, provider, newer)
            return read(scope, manager)
        })
        const window = { from: '2026-10-18T00:00:00Z', to: '2026-10-19T00:00:00Z' }
        const before = await analytics.read(context, window)
        expect(before.current.business).toMatchObject({ total: 2, completed: 0 })
        // Legacy provider attempts have no durable node/round owner and cannot enter execution cohorts.
        expect(before.coverage).toMatchObject({ instances: 2, recordedAttempts: 0, attemptsWithoutStartTime: 0 })
        expect(before.executions.attempts.total).toBe(0)
        expect(before.byInstance).toHaveLength(2)
        const after = await analytics.read(context, window)
        expect(after.current.business.completed).toBe(1)
        expect(after.coverage.recordedAttempts).toBe(0)
        // Even if an upstream ACL were broader, SQL never substitutes another tenant's rows.
        const wrongTenant = await analytics.read(
            { ...context, actor: { ...context.actor, tenantId: randomUUID() } },
            window
        )
        expect(wrongTenant.coverage.instances).toBe(0)
        expect(wrongTenant.coverage.recordedAttempts).toBe(0)
        access.listReadable.mockResolvedValue([])
        await expect(analytics.read(context, window)).rejects.toMatchObject({ status: 403 })
    })

    it('reads tasks and pipeline nodes from the same database snapshot during a concurrent projection', async () => {
        const input = snapshot()
        const first = await store.apply(context, provider, input)
        const access = { listReadable: async () => [{ role: 'viewer', archived: false }] }
        const registry = { list: () => [], listForActor: () => [] }
        const taskGraph = new ProjectTaskGraphService(
            db.getRepository(XpertProjectTask),
            access as never,
            registry as never,
            { diagnostics: async () => [] } as never,
            registry as never
        )
        const query = new ProjectPipelineQueryService(
            db.getRepository(ProjectPipelineInstanceEntity),
            access as never,
            taskGraph,
            {} as never,
            new ProjectPipelineContributionRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
        )
        const read = taskGraph.graphWithinTransaction.bind(taskGraph)
        jest.spyOn(taskGraph, 'graphWithinTransaction').mockImplementationOnce(async (context, manager) => {
            const newer = structuredClone(input)
            newer.sourceSequence = 2
            newer.tasks[0].status = 'done'
            newer.nodes[0].state.lifecycle = 'completed'
            await store.apply(context, provider, newer)
            return read(context, manager)
        })
        const observed = await query.graph(context, first.instanceId)
        expect(observed.instance.revision).toBe(1)
        expect(observed.nodes[0].projection.state.lifecycle).toBe('active')
        expect(observed.tasks.tasks[0].status).toBe('review')
        expect(observed.statistics.work.completed).toBe(0)
        const latest = await query.graph(context, first.instanceId)
        expect(latest.instance.revision).toBe(2)
        expect(latest.nodes[0].projection.state.lifecycle).toBe('completed')
        expect(latest.tasks.tasks[0].status).toBe('done')
        expect(latest.statistics.work.completed).toBe(1)
    })

    it('commits task, node, links, source cursor and event together without equating runtime success to completion', async () => {
        const input = snapshot()
        const result = await store.apply(context, provider, input)
        expect(result.status).toBe('applied')
        expect(await tasks()).toEqual([
            expect.objectContaining({
                status: 'review',
                controlKind: 'provider',
                pipelineInstanceId: result.instanceId
            })
        ])
        expect(await db.getRepository(ProjectPipelineNodeEntity).findBy({ projectId: context.projectId })).toEqual([
            expect.objectContaining({
                projection: expect.objectContaining({
                    state: expect.objectContaining({ lifecycle: 'active', runtime: 'succeeded' })
                })
            })
        ])
        expect(await db.getRepository(ProjectPipelineTaskLinkEntity).countBy({ projectId: context.projectId })).toBe(1)
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(1)
    })

    it('replays an identical receipt idempotently and ignores late snapshots', async () => {
        const input = snapshot()
        const first = await store.apply(context, provider, input)
        expect(await store.apply(context, provider, input)).toMatchObject({ ...first, status: 'unchanged' })
        const newer = structuredClone(input)
        newer.sourceSequence = 3
        newer.tasks[0].status = 'done'
        await store.apply(context, provider, newer)
        expect(await store.apply(context, provider, { ...input, sourceSequence: 2 })).toMatchObject({
            status: 'stale',
            revision: 2
        })
        expect((await tasks())[0].status).toBe('done')
        expect(await db.getRepository(XpertProjectTaskExecution).countBy({ projectId: context.projectId })).toBe(1)
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(2)
    })

    it('rejects epoch, same-sequence, definition and round-input conflicts without partial changes', async () => {
        const input = snapshot()
        await store.apply(context, provider, input)
        for (const [change, code] of [
            [{ ...input, title: 'changed' }, 'SOURCE_VERSION_CONFLICT'],
            [{ ...input, sourceEpoch: randomUUID(), sourceSequence: 2 }, 'SOURCE_EPOCH_CHANGED'],
            [
                { ...input, sourceSequence: 2, definition: { ...input.definition, title: 'changed' } },
                'DEFINITION_VERSION_IMMUTABLE'
            ],
            [
                { ...input, sourceSequence: 2, round: { ...input.round, inputDigest: 'b'.repeat(64) } },
                'ROUND_INPUT_IMMUTABLE'
            ]
        ] as const)
            await expect(store.apply(context, provider, change)).rejects.toMatchObject({ response: { code } })
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(1)
    })

    it('rolls back an already written Task when later node validation fails', async () => {
        const input = snapshot()
        const first = await store.apply(context, provider, input)
        const bad = structuredClone(input)
        bad.sourceSequence = 2
        bad.tasks[0].status = 'done'
        bad.nodes = []
        await expect(store.apply(context, provider, bad)).rejects.toMatchObject({
            response: { code: 'NODE_TOMBSTONE_REQUIRED' }
        })
        expect((await tasks())[0].status).toBe('review')
        expect(
            await db.getRepository(ProjectPipelineInstanceEntity).findOneByOrFail({ id: first.instanceId })
        ).toMatchObject({ revision: 1, sourceSequence: '1' })
        expect(await db.getRepository(ProjectPipelineEventEntity).countBy({ projectId: context.projectId })).toBe(1)
    })

    it('isolates instances and preserves task state and attempts after explicit tombstones', async () => {
        const a = snapshot()
        const b = { ...snapshot(), sourceKey: 'case-b', subject: { ...a.subject, objectKey: 'case-b' } }
        const first = await store.apply(context, provider, a)
        const second = await store.apply(context, provider, b)
        expect(first.tasks[0].taskId).not.toBe(second.tasks[0].taskId)
        const removed = {
            ...a,
            sourceSequence: 2,
            nodes: [],
            tasks: [],
            taskTombstones: [{ key: 'check', reason: 'removed' as const }],
            nodeTombstones: [{ key: 'check', reason: 'removed' as const }]
        }
        await store.apply(context, provider, removed)
        expect(await db.getRepository(XpertProjectTask).findOneByOrFail({ id: first.tasks[0].taskId })).toMatchObject({
            status: 'review',
            pipelineDisposition: 'removed'
        })
        expect(await db.getRepository(XpertProjectTask).findOneByOrFail({ id: second.tasks[0].taskId })).toMatchObject({
            status: 'review',
            pipelineDisposition: 'active'
        })
        expect(await db.getRepository(XpertProjectTaskExecution).countBy({ projectId: context.projectId })).toBe(2)
    })

    it('serializes concurrent commits and cannot roll a newer source cursor backward', async () => {
        const input = snapshot()
        await store.apply(context, provider, input)
        const latest = structuredClone(input)
        latest.sourceSequence = 3
        latest.tasks[0].status = 'done'
        await Promise.all([
            store.apply(context, provider, latest),
            store.apply(context, provider, { ...input, sourceSequence: 2 })
        ])
        expect((await tasks())[0].status).toBe('done')
        expect(
            (await db.getRepository(ProjectPipelineInstanceEntity).findOneByOrFail({ projectId: context.projectId }))
                .sourceSequence
        ).toBe('3')
    })

    it('projects selection separately from business status and preserves attempts across re-selection', async () => {
        const input = snapshot()
        const first = await store.apply(context, provider, input)
        const excluded = structuredClone(input)
        excluded.sourceSequence = 2
        excluded.nodes[0].state.applicability = 'excluded'
        await store.apply(context, provider, excluded)
        expect((await tasks())[0]).toMatchObject({ status: 'review', pipelineDisposition: 'excluded' })
        // Previously projected rows are reconciled read-only against explicit current node facts.
        await db
            .getRepository(XpertProjectTask)
            .update({ id: first.tasks[0].taskId }, { pipelineDisposition: 'active' })
        expect((await pipelineTaskDispositions(db.manager, context, await tasks())).get(first.tasks[0].taskId)).toBe(
            'excluded'
        )
        expect(
            (await pipelineTaskDispositions(db.manager, { ...context, projectId: randomUUID() }, await tasks())).size
        ).toBe(0)
        expect((await tasks())[0]).toMatchObject({ status: 'review', pipelineDisposition: 'active' })
        const shared = structuredClone(excluded)
        shared.sourceSequence = 3
        shared.nodes.push({
            ...shared.nodes[0],
            key: 'selected-owner',
            expansionKey: 'another',
            state: { ...shared.nodes[0].state, applicability: 'undetermined' }
        })
        await store.apply(context, provider, shared)
        expect((await tasks())[0]).toMatchObject({ status: 'review', pipelineDisposition: 'active' })
        shared.sourceSequence = 4
        for (const node of shared.nodes) node.state.freshness = 'superseded'
        await store.apply(context, provider, shared)
        expect((await tasks())[0]).toMatchObject({ status: 'review', pipelineDisposition: 'superseded' })
        expect(await db.getRepository(XpertProjectTaskExecution).countBy({ taskId: first.tasks[0].taskId })).toBe(1)
    })

    it('enforces scope before any write and rejects cross-project links at the database boundary', async () => {
        const input = snapshot()
        await expect(
            store.apply({ ...context, actor: { ...context.actor, organizationId: randomUUID() } }, provider, input)
        ).rejects.toThrow()
        expect(await tasks()).toHaveLength(0)
        const first = await store.apply(context, provider, input)
        await expect(
            db.query('UPDATE xpert_project_task SET \"projectId\"=NULL WHERE id=$1', [first.tasks[0].taskId])
        ).rejects.toMatchObject({ code: '23514' })
        const node = await db.getRepository(ProjectPipelineNodeEntity).findOneByOrFail({ projectId: context.projectId })
        const other = randomUUID()
        await db.getRepository(XpertProject).save({ id: other, name: 'Other', ...context.actor })
        const otherInstance = await store.apply({ ...context, projectId: other }, provider, snapshot())
        await expect(
            db.getRepository(ProjectPipelineTaskLinkEntity).insert({
                id: randomUUID(),
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId,
                projectId: other,
                nodeInstanceId: node.id,
                taskId: otherInstance.tasks[0].taskId,
                relation: 'primary'
            })
        ).rejects.toMatchObject({ code: '23503' })
    })

    it('persists an unconfirmed intent before the native conversation exists and attaches its confirmed identity atomically', async () => {
        const runner = db.createQueryRunner()
        const tableName = db.getMetadata(XpertProjectTaskExecution).tablePath
        const column = (await runner.getTable(tableName))!.findColumnByName('conversationId')!
        const nativeTable = `${schema}.accepted_native_conversation`
        const foreign = new TableForeignKey({
            name: 'acceptance_native_conversation_fk',
            columnNames: ['conversationId'],
            referencedTableName: nativeTable,
            referencedColumnNames: ['id']
        })
        await runner.createTable(
            new Table({
                name: nativeTable,
                columns: [{ name: 'id', type: column.type, length: column.length, isPrimary: true }]
            })
        )
        await runner.createForeignKey(tableName, foreign)
        try {
            const input = snapshot()
            input.tasks[0].executions[0].status = 'queued'
            const first = await store.apply(context, provider, input)
            const conversationId = randomUUID()
            const confirmed = structuredClone(input)
            confirmed.sourceSequence = 2
            Object.assign(confirmed.tasks[0].executions[0], {
                status: 'running',
                conversationId,
                agentExecutionId: randomUUID()
            })
            await expect(store.apply(context, provider, confirmed)).rejects.toMatchObject({
                driverError: { code: '23503' }
            })
            expect((await store.checkpoint(context, provider.key, input.sourceKey))!.sourceSequence).toBe(1)
            await runner.query(`INSERT INTO "${schema}"."accepted_native_conversation" (id) VALUES ($1)`, [
                conversationId
            ])
            await store.apply(context, provider, confirmed)
            expect(await db.getRepository(XpertProjectTaskExecution).countBy({ taskId: first.tasks[0].taskId })).toBe(1)
            expect(
                await db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ taskId: first.tasks[0].taskId })
            ).toMatchObject({ status: 'running', conversationId })
        } finally {
            await runner.dropForeignKey(tableName, foreign)
            await runner.dropTable(nativeTable)
            await runner.release()
        }
    })

    it('reads the exact committed producer checkpoint and fences stale supersession after concurrent advancement', async () => {
        const input = snapshot()
        expect(await store.checkpoint(context, provider.key, input.sourceKey)).toBeNull()
        await store.apply(context, provider, input)
        const checkpoint = await store.checkpoint(context, provider.key, input.sourceKey)
        expect(checkpoint).toMatchObject({
            sourceEpoch: input.sourceEpoch,
            sourceSequence: 1,
            run: input.run,
            round: { key: input.round.key, sequence: 1, generation: 1 }
        })
        for (const foreign of [
            { ...context, projectId: randomUUID() },
            { ...context, actor: { ...context.actor, tenantId: randomUUID() } },
            { ...context, actor: { ...context.actor, organizationId: randomUUID() } }
        ]) {
            expect(await store.checkpoint(foreign, provider.key, input.sourceKey)).toBeNull()
        }
        expect(await store.checkpoint(context, 'other.flow@1', input.sourceKey)).toBeNull()
        const second = structuredClone(input)
        second.sourceSequence = 2
        second.round = {
            ...input.round,
            key: 'round-2',
            sequence: 2,
            generation: 2,
            inputDigest: 'b'.repeat(64),
            supersedesKey: input.round.key
        }
        await store.apply(context, provider, second)
        const skipped = structuredClone(second)
        skipped.sourceSequence = 4
        skipped.round = {
            ...second.round,
            key: 'round-4',
            sequence: 4,
            generation: 4,
            inputDigest: 'd'.repeat(64),
            supersedesKey: checkpoint!.round.key
        }
        await expect(store.apply(context, provider, skipped)).rejects.toMatchObject({
            response: { code: 'ROUND_SUPERSESSION_REQUIRED' }
        })
        skipped.round.supersedesKey = (await store.checkpoint(context, provider.key, input.sourceKey))!.round.key
        await store.apply(context, provider, skipped)
        expect(await store.checkpoint(context, provider.key, input.sourceKey)).toMatchObject({
            sourceSequence: 4,
            round: { key: 'round-4' }
        })
    })

    it('reads frozen provider task history, paginates rounds and refuses cross-instance round ids', async () => {
        const input = snapshot()
        const first = await store.apply(context, provider, input)
        const oldId = (await db.getRepository(ProjectPipelineInstanceEntity).findOneByOrFail({ id: first.instanceId }))
            .currentRoundId
        const newer = structuredClone(input)
        newer.sourceSequence = 2
        newer.round = {
            ...input.round,
            key: 'round-2',
            sequence: 2,
            generation: 2,
            inputDigest: 'b'.repeat(64),
            supersedesKey: input.round.key
        }
        newer.tasks[0].status = 'done'
        newer.tasks[0].title = 'New input accepted'
        newer.nodes[0].state.lifecycle = 'completed'
        await store.apply(context, provider, newer)
        const access = { listReadable: async () => [{ role: 'manager', archived: false, canManage: true }] }
        const registry = { list: () => [], listForActor: () => [] }
        const tasks = new ProjectTaskGraphService(
            db.getRepository(XpertProjectTask),
            access as never,
            registry as never,
            { diagnostics: async () => [] } as never,
            registry as never
        )
        const query = new ProjectPipelineQueryService(
            db.getRepository(ProjectPipelineInstanceEntity),
            access as never,
            tasks,
            {} as never,
            new ProjectPipelineContributionRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
        )
        const current = await query.graph(context, first.instanceId)
        const history = await query.graph(context, first.instanceId, { roundId: oldId })
        expect(history).toMatchObject({
            historical: true,
            historyComplete: true,
            permissions: { canEdit: false, canManage: false },
            actions: { cancel: false, retries: [] }
        })
        expect(history.tasks.tasks[0]).toMatchObject({ title: input.tasks[0].title, status: 'review' })
        expect(current.tasks.tasks[0]).toMatchObject({ title: 'New input accepted', status: 'done' })
        expect(history.statistics.work.completed).toBe(0)
        expect(current.statistics.work.completed).toBe(1)
        // Legacy task history is retained, but cannot establish node/round execution ownership.
        expect(history.tasks.executions).toHaveLength(0)
        expect(history.executionAttribution).toMatchObject({ scope: 'node_round', unattributedCount: 1 })
        expect(history.nodes.every((node) => node.executionIds.length === 0)).toBe(true)
        const page = await query.rounds(context, first.instanceId, { limit: 1 })
        expect(page.items).toHaveLength(1)
        expect(page.items[0].current).toBe(true)
        const rest = await query.rounds(context, first.instanceId, { limit: 1, after: page.next })
        expect(rest.items[0]).toMatchObject({ id: oldId, current: false, state: 'superseded' })
        expect(rest.next).toBeNull()
        const another = await store.apply(context, provider, {
            ...snapshot(),
            sourceKey: 'another',
            subject: { ...input.subject, objectKey: 'another' }
        })
        await expect(query.graph(context, another.instanceId, { roundId: oldId })).rejects.toMatchObject({
            status: 404
        })
        await expect(query.rounds(context, another.instanceId, { after: oldId })).rejects.toMatchObject({ status: 404 })
        await db.getRepository(ProjectPipelineRoundEntity).update(oldId, { projectionTasks: null })
        const legacy = await query.graph(context, first.instanceId, { roundId: oldId })
        expect(legacy.historyComplete).toBe(false)
        expect(legacy.tasks.tasks).toEqual([])
        await expect(store.apply(context, provider, { ...input, sourceSequence: 3 })).rejects.toMatchObject({
            response: { code: 'ROUND_GENERATION_REGRESSION' }
        })
    })

    it('does not resurrect terminal runs or rewrite an execution attempt as a retry', async () => {
        const input = snapshot()
        await store.apply(context, provider, input)
        const retry = structuredClone(input)
        retry.sourceSequence = 2
        retry.tasks[0].executions[0].status = 'running'
        await expect(store.apply(context, provider, retry)).rejects.toMatchObject({
            response: { code: 'ATTEMPT_TERMINAL_IMMUTABLE' }
        })
        const ended = {
            ...input,
            sourceSequence: 2,
            run: { ...input.run, state: 'completed' as const },
            round: { ...input.round, state: 'completed' as const }
        }
        await store.apply(context, provider, ended)
        await expect(store.apply(context, provider, { ...input, sourceSequence: 3 })).rejects.toMatchObject({
            response: { code: 'RUN_TERMINAL_IMMUTABLE' }
        })
    })
})
