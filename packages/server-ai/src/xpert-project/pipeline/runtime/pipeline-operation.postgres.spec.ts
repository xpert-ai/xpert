import * as hostProfile from '../configuration/pipeline-host-profile'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { XpertWorkspace } from '../../../xpert-workspace/workspace.entity'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, Table } from 'typeorm'
import { coreEntities } from '../../../../../server/src/core/entities'
import { ALL_AI_ENTITIES } from '../../../core/entities'
import { projectPipelineConfigurationSchema, type ProjectPipelineOperationReceipt } from '@xpert-ai/contracts'
import { AuthorizeProjectPipelineRuntimeHandler } from './pipeline-runtime-access.handler'
import { AuthorizeProjectPipelineRuntimeCommand } from './pipeline-runtime-access.command'
import { projectPipelineInvocationScopeSchema } from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import {
    ProjectPipelineDefinitionEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import { ProjectPipelineOperationStore, type PipelineOperationReservation } from './pipeline-operation.store'
import { initialPipelineNodeState } from './pipeline-round-planner'
import { pipelineDigest } from '../persistence/pipeline-identity'
import { readPipelineQueueStatistics } from '../queries/pipeline-queue-statistics'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname))
    throw new Error('Dedicated pipeline test database required')
const integration = url ? describe : describe.skip
const configuration = projectPipelineConfigurationSchema.parse({
    schemaVersion: 1,
    template: {
        key: 'neutral.inspect',
        version: '1.0.0',
        title: 'Neutral review',
        executionAuthority: 'platform',
        subjectResolverRef: 'neutral.subject@1',
        topology: { source: 'definition' },
        roles: [{ key: 'worker', allowedKinds: ['service'] }],
        lanes: [{ key: 'work', roleKey: 'worker', label: 'Work', order: 0 }],
        stages: [{ key: 'review', label: 'Review', order: 0 }],
        nodes: [
            {
                key: 'inspect',
                kind: 'work',
                stageKey: 'review',
                laneKey: 'work',
                executorSlot: 'worker',
                operationRef: 'neutral.inspect@1',
                completionRef: 'neutral.accept@1',
                inputBindings: { subject: { from: 'subject' } }
            },
            { key: 'done', kind: 'terminal', stageKey: 'review', outcome: 'accepted' }
        ],
        edges: [{ from: 'inspect', to: 'done' }],
        roundPolicy: {
            entryNodeKey: 'inspect',
            maxRounds: 3,
            onRework: 'await_new_subject_then_next_round',
            onLimit: 'attention',
            newVersionWhileActive: 'supersede_round',
            terminalOutcomes: ['accepted']
        },
        failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
    },
    binding: {
        templateRef: 'neutral.inspect@1.0.0',
        roleBindings: { worker: { kind: 'service', selectionKey: 'worker' } },
        executorBindings: { worker: { kind: 'service', selectionKey: 'worker', roleKey: 'worker' } },
        parameters: {},
        limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 3, runTimeoutMinutes: 60 }
    }
})

integration('durable pipeline operation outbox', () => {
    const schema = `pipeline_operation_${randomUUID().replace(/-/g, '')}`
    let db: DataSource,
        store: ProjectPipelineOperationStore,
        context: ProjectPipelineContext,
        input: PipelineOperationReservation,
        taskId: string
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            entities: [...coreEntities, ...ALL_AI_ENTITIES, AgentRuntimeBindingEntity],
            uuidExtension: 'pgcrypto',
            poolSize: 4,
            extra: { options: `-c search_path=${schema},public` }
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        const runner = db.createQueryRunner()
        for (const entity of [
            XpertProject,
            XpertProjectTask,
            XpertProjectTaskExecution,
            AgentRuntimeBindingEntity,
            XpertWorkspace
        ])
            await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
        await runner.release()
        for (const file of [
            '20261018-project-pipeline.sql',
            '20261018-project-pipeline-runtime.sql',
            '20261019-project-pipeline-resources.sql',
            '20261019-project-pipeline-runtime-intent.sql',
            '20261019-project-pipeline-provider-actions.sql',
            '20261019-project-pipeline-model-budget.sql',
            '20261019-project-pipeline-native-grant.sql'
        ]) {
            const migration = readFileSync(join(__dirname, '../migrations', file), 'utf8')
            await db.query(migration)
            await db.query(migration)
        }
        store = new ProjectPipelineOperationStore(db.getRepository(ProjectPipelineOperationEntity))
    }, 30_000)
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    const dispatchSetting = process.env.XPERT_PIPELINE_DISPATCH_ENABLED
    const capacityKeys = [
        'XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS',
        'XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_TENANT',
        'XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_ASSISTANT'
    ]
    const capacitySettings = capacityKeys.map((key) => process.env[key])
    afterEach(() => {
        if (dispatchSetting === undefined) delete process.env.XPERT_PIPELINE_DISPATCH_ENABLED
        else process.env.XPERT_PIPELINE_DISPATCH_ENABLED = dispatchSetting
        capacityKeys.forEach((key, index) => {
            if (capacitySettings[index] === undefined) delete process.env[key]
            else process.env[key] = capacitySettings[index]
        })
    })
    beforeEach(async () => {
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        capacityKeys.forEach((key) => {
            delete process.env[key]
        })
        context = {
            projectId: randomUUID(),
            actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
        }
        const audit = {
            projectId: context.projectId,
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId,
            createdById: context.actor.userId
        }
        const definitionId = randomUUID(),
            instanceId = randomUUID(),
            runId = randomUUID(),
            roundId = randomUUID(),
            nodeInstanceId = randomUUID()
        taskId = randomUUID()
        const subjects = [
            { resolverRef: 'neutral.subject@1', objectKey: 'document-1', version: '1', digest: 'a'.repeat(64) }
        ]
        input = {
            work: { instanceId, runId, roundId, nodeInstanceId, generation: 1, inputDigest: 'a'.repeat(64) },
            attempt: 1,
            kind: 'operation',
            handlerRef: 'neutral.inspect@1',
            completionRef: 'neutral.accept@1',
            inputs: { subject: { kind: 'subjects', value: subjects } },
            subjects,
            parameters: {}
        }
        await db.transaction(async (manager) => {
            await manager.save(XpertProject, { id: context.projectId, name: 'Neutral test project', ...context.actor })
            await manager.save(ProjectPipelineDefinitionEntity, {
                ...audit,
                id: definitionId,
                ownerRef: 'neutral@1',
                templateKey: configuration.template.key,
                version: '1.0.0',
                digest: pipelineDigest(configuration.template),
                definition: configuration.template
            })
            await manager.save(ProjectPipelineInstanceEntity, {
                ...audit,
                id: instanceId,
                ownerRef: 'neutral@1',
                sourceKey: 'document-1',
                authority: 'platform',
                title: 'Neutral test review',
                definitionId,
                subject: { resolverRef: 'neutral.subject@1', objectKey: 'document-1' },
                currentRunId: runId,
                currentRoundId: roundId
            })
            await manager.save(ProjectPipelineRunEntity, {
                ...audit,
                id: runId,
                instanceId,
                sourceKey: 'trigger-1',
                definitionId,
                bindingSnapshot: configuration.binding,
                state: 'active'
            })
            await manager.save(ProjectPipelineRoundEntity, {
                ...audit,
                id: roundId,
                runId,
                sourceKey: 'round-1',
                sequence: 1,
                generation: 1,
                inputDigest: input.work.inputDigest,
                subjectVersionSet: subjects,
                state: 'active',
                edges: []
            })
            await manager.save(XpertProjectTask, {
                ...audit,
                id: taskId,
                name: 'Inspect evidence',
                status: 'todo',
                controlKind: 'pipeline',
                pipelineInstanceId: instanceId,
                pipelineDisposition: 'active'
            })
            await manager.save(ProjectPipelineNodeEntity, {
                ...audit,
                id: nodeInstanceId,
                roundId,
                sourceKey: 'inspect',
                nodeKey: 'inspect',
                expansionKey: 'root',
                taskIds: [taskId],
                projection: {
                    key: 'inspect',
                    nodeKey: 'inspect',
                    expansionKey: 'root',
                    title: 'Inspect',
                    kind: 'work',
                    laneKey: 'work',
                    stageKey: 'review',
                    state: { ...initialPipelineNodeState(), applicability: 'selected', readiness: 'ready' },
                    taskKeys: ['inspect'],
                    evidence: []
                }
            })
        })
    })
    const reserve = () => db.transaction((manager) => store.reserve(manager, context, input))
    const expire = (id: string) =>
        db
            .getRepository(ProjectPipelineOperationEntity)
            .update(id, { leaseExpiresAt: new Date(0), nextCheckAt: new Date(0) })
    const success: ProjectPipelineOperationReceipt = { status: 'succeeded', receiptKey: 'receipt-1', outputs: {} }

    it('leaves queued and unknown work untouched by an incompatible worker, then resumes the original operation', async () => {
        const operation = await reserve(),
            profile = hostProfile.pipelineHostCapabilities()
        const host = jest
            .spyOn(hostProfile, 'pipelineHostCapabilities')
            .mockReturnValue({ protocols: [1], features: { 'pipeline.core': [1] } })
        try {
            expect(await store.resourcePreparation(context, operation.id)).toBeNull()
            expect(await store.claim(context, operation.id, randomUUID())).toBeNull()
            expect(
                await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
            ).toMatchObject({ state: 'queued', leaseFence: 0, dispatchStartedAt: null, receipt: null })
            expect((await store.due()).some((item) => item.id === operation.id)).toBe(false)
            host.mockReturnValue(profile)
            await expire(operation.id)
            const worker = randomUUID(),
                claim = await store.claim(context, operation.id, worker)
            expect(claim?.mode).toBe('execute')
            host.mockReturnValue({ protocols: [], features: {} })
            expect(await store.beginDispatch(context, operation.id, worker, claim!.fence)).toBe(false)
            host.mockReturnValue(profile)
            expect(await store.beginDispatch(context, operation.id, worker, claim!.fence)).toBe(true)
            await store.settle(
                context,
                operation.id,
                worker,
                claim!.fence,
                { receipt: { status: 'unknown', receiptKey: 'original' } },
                async () => undefined
            )
            const original = await db
                .getRepository(ProjectPipelineOperationEntity)
                .findOneByOrFail({ id: operation.id })
            await expire(operation.id)
            host.mockReturnValue({ protocols: [], features: {} })
            expect(await store.claim(context, operation.id, randomUUID())).toBeNull()
            expect(
                await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
            ).toMatchObject({
                state: 'unknown',
                leaseFence: original.leaseFence,
                dispatchStartedAt: original.dispatchStartedAt,
                receipt: original.receipt
            })
            host.mockReturnValue(profile)
            await expire(operation.id)
            expect((await store.claim(context, operation.id, randomUUID()))?.mode).toBe('inspect')
            expect(
                await db.getRepository(ProjectPipelineOperationEntity).countBy({ projectId: context.projectId })
            ).toBe(1)
        } finally {
            host.mockRestore()
        }
    })

    it('authorizes an exact durable Runtime origin without granting a dispatch lease', async () => {
        const workspaceId = randomUUID(),
            bindingId = randomUUID()
        await db
            .getRepository(XpertWorkspace)
            .save({ id: workspaceId, name: 'Runtime origin workspace', ...context.actor, status: 'active' })
        await db.getRepository(AgentRuntimeBindingEntity).save({
            id: bindingId,
            title: 'Neutral Runtime',
            ...context.actor,
            workspaceIds: [workspaceId],
            enabled: true,
            target: {
                bindingId,
                provider: 'neutral-runtime',
                revision: '1',
                reference: 'neutral',
                configuration: {}
            }
        })
        const run = await db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: input.work.runId })
        const definition = await db
            .getRepository(ProjectPipelineDefinitionEntity)
            .findOneByOrFail({ id: run.definitionId })
        const runtimeConfiguration = projectPipelineConfigurationSchema.parse({
            ...configuration,
            template: { ...configuration.template, roles: [{ key: 'worker', allowedKinds: ['runtime_binding'] }] },
            binding: {
                ...configuration.binding,
                roleBindings: { worker: { kind: 'runtime_binding', selectionKey: bindingId } },
                executorBindings: { worker: { kind: 'runtime_binding', selectionKey: bindingId, roleKey: 'worker' } }
            }
        })
        await db
            .getRepository(ProjectPipelineDefinitionEntity)
            .update(definition.id, { definition: runtimeConfiguration.template })
        run.bindingSnapshot = runtimeConfiguration.binding
        await db.manager.save(run)
        const operation = await reserve()
        const scope = projectPipelineInvocationScopeSchema.parse({
            ...context.actor,
            projectId: context.projectId,
            workspaceId,
            callerType: 'project_pipeline',
            callerAgentKey: 'pipeline_node',
            parentExecutionId: `pipeline-operation:${operation.id}`,
            pipelineOrigin: operation.context.work
        })
        const access = { assertEdit: jest.fn(async () => undefined) }
        const handler = new AuthorizeProjectPipelineRuntimeHandler(
            db.getRepository(ProjectPipelineOperationEntity),
            access as never
        )
        await handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId))
        await expect(
            handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId, 'dispatch'))
        ).rejects.toMatchObject({ response: { code: 'OPERATION_DISPATCH_NOT_AUTHORIZED' } })
        expect(
            await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'queued', leaseFence: 0, dispatchStartedAt: null })
        for (const patch of [
            { userId: randomUUID() },
            { tenantId: randomUUID() },
            { organizationId: randomUUID() },
            { workspaceId: randomUUID() },
            { projectId: randomUUID() },
            { pipelineOrigin: { ...scope.pipelineOrigin, generation: 2 } },
            { pipelineOrigin: { ...scope.pipelineOrigin, inputDigest: 'b'.repeat(64) } },
            { pipelineOrigin: { ...scope.pipelineOrigin, nodeInstanceId: randomUUID() } }
        ])
            await expect(
                handler.execute(new AuthorizeProjectPipelineRuntimeCommand({ ...scope, ...patch }, bindingId))
            ).rejects.toMatchObject({ response: { code: 'EXECUTOR_SCOPE_MISMATCH' } })
        await expect(
            handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, randomUUID()))
        ).rejects.toMatchObject({ response: { code: 'EXECUTOR_SCOPE_MISMATCH' } })
        const workerId = randomUUID(),
            claim = await store.claim(context, operation.id, workerId)
        await store.beginDispatch(context, operation.id, workerId, claim.fence)
        await handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId, 'dispatch'))
        await db.getRepository(ProjectPipelineOperationEntity).update(operation.id, { leaseExpiresAt: new Date(0) })
        await expect(
            handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId, 'dispatch'))
        ).rejects.toMatchObject({ response: { code: 'OPERATION_DISPATCH_NOT_AUTHORIZED' } })
        await handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId))
        await db
            .getRepository(ProjectPipelineOperationEntity)
            .update(operation.id, { leaseExpiresAt: new Date(Date.now() + 30_000) })
        await db.getRepository(ProjectPipelineInstanceEntity).update(operation.instanceId, { currentRoundId: null })
        await expect(
            handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId, 'dispatch'))
        ).rejects.toMatchObject({ response: { code: 'OPERATION_DISPATCH_NOT_AUTHORIZED' } })
        await handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId))
        await db.getRepository(ProjectPipelineOperationEntity).update(operation.id, { state: 'superseded' })
        await expect(
            handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId, 'dispatch'))
        ).rejects.toMatchObject({ response: { code: 'OPERATION_DISPATCH_NOT_AUTHORIZED' } })
        await handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId))
        access.assertEdit.mockRejectedValue(new Error('revoked'))
        await expect(handler.execute(new AuthorizeProjectPipelineRuntimeCommand(scope, bindingId))).rejects.toThrow(
            'revoked'
        )
    })

    it('measures a durable admission wait, keeps the snapshot stable, and rejects foreign metric scopes', async () => {
        const row = await reserve(),
            worker = randomUUID()
        const from = new Date(row.createdAt.getTime() - 1).toISOString(),
            to = new Date(row.createdAt.getTime() + 60000).toISOString()
        const read = (actorContext = context, manager = db.manager) =>
            readPipelineQueueStatistics(manager, actorContext, [row.instanceId], { from, to }, to)
        await db.transaction('REPEATABLE READ', async (manager) => {
            expect((await read(context, manager)).total).toMatchObject({ total: 1, queued: 1, dispatched: 0 })
            const claim = await store.claim(context, row.id, worker)
            expect(await store.beginDispatch(context, row.id, worker, claim.fence)).toBe(true)
            expect((await read(context, manager)).total).toMatchObject({ queued: 1, dispatched: 0 })
        })
        const dispatched = await read()
        expect(dispatched.total).toMatchObject({ total: 1, queued: 0, dispatched: 1, unavailable: 0 })
        expect(dispatched.total.dispatchWait.meanMs).toBeGreaterThanOrEqual(0)
        expect(dispatched.bySource[0].metrics.total).toBe(1)
        for (const foreign of [
            { ...context, projectId: randomUUID() },
            { ...context, actor: { ...context.actor, tenantId: randomUUID() } },
            { ...context, actor: { ...context.actor, organizationId: randomUUID() } }
        ])
            expect((await read(foreign)).total.total).toBe(0)
        await db.getRepository(ProjectPipelineOperationEntity).softDelete(row.id)
        expect((await read()).total.total).toBe(0)
    })

    async function sibling(sameTenant = true, assistantId?: string) {
        const nextContext: ProjectPipelineContext = {
            projectId: randomUUID(),
            actor: { ...context.actor, ...(sameTenant ? {} : { tenantId: randomUUID(), organizationId: randomUUID() }) }
        }
        const audit = {
            projectId: nextContext.projectId,
            tenantId: nextContext.actor.tenantId,
            organizationId: nextContext.actor.organizationId,
            createdById: nextContext.actor.userId
        }
        const next = {
            instanceId: randomUUID(),
            runId: randomUUID(),
            roundId: randomUUID(),
            nodeInstanceId: randomUUID()
        }
        const definitionId = randomUUID(),
            nextTaskId = randomUUID()
        await db.transaction(async (manager) => {
            const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { id: input.work.runId })
            const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, { id: run.definitionId })
            const template = assistantId
                ? { ...definition.definition, roles: [{ key: 'worker', allowedKinds: ['assistant' as const] }] }
                : definition.definition
            const binding = assistantId
                ? {
                      ...run.bindingSnapshot,
                      roleBindings: { worker: { kind: 'assistant' as const, selectionKey: assistantId } },
                      executorBindings: {
                          worker: { kind: 'assistant' as const, selectionKey: assistantId, roleKey: 'worker' }
                      }
                  }
                : run.bindingSnapshot
            await manager.save(XpertProject, {
                id: nextContext.projectId,
                name: 'Sibling admission project',
                ...nextContext.actor
            })
            await manager.save(ProjectPipelineDefinitionEntity, {
                ...definition,
                ...audit,
                id: definitionId,
                definition: template,
                digest: pipelineDigest(template)
            })
            const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { id: input.work.instanceId })
            await manager.save(ProjectPipelineInstanceEntity, {
                ...instance,
                ...audit,
                id: next.instanceId,
                definitionId,
                currentRunId: next.runId,
                currentRoundId: next.roundId
            })
            await manager.save(ProjectPipelineRunEntity, {
                ...run,
                ...audit,
                id: next.runId,
                instanceId: next.instanceId,
                definitionId,
                bindingSnapshot: binding
            })
            const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, { id: input.work.roundId })
            await manager.save(ProjectPipelineRoundEntity, { ...round, ...audit, id: next.roundId, runId: next.runId })
            await manager.save(XpertProjectTask, {
                ...audit,
                id: nextTaskId,
                name: 'Sibling task',
                status: 'todo',
                controlKind: 'pipeline',
                pipelineInstanceId: next.instanceId,
                pipelineDisposition: 'active'
            })
            const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, { id: input.work.nodeInstanceId })
            await manager.save(ProjectPipelineNodeEntity, {
                ...node,
                ...audit,
                id: next.nodeInstanceId,
                roundId: next.roundId,
                taskIds: [nextTaskId]
            })
        })
        const operation = await db.transaction((manager) =>
            store.reserve(manager, nextContext, { ...input, work: { ...input.work, ...next } })
        )
        return { context: nextContext, operation }
    }

    describe('physical resource occupancy', () => {
        const resources = (mode: 'shared' | 'exclusive' = 'exclusive', key = 'b'.repeat(64)) => ({
            resolverRef: 'neutral.resources@1',
            claims: [{ key, mode }]
        })
        beforeEach(async () => {
            await db.createQueryBuilder().delete().from(ProjectPipelineOperationEntity).execute()
            const run = await db.manager.findOneByOrFail(ProjectPipelineRunEntity, { id: input.work.runId })
            const definition = await db.manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
                id: run.definitionId
            })
            if (definition.definition.executionAuthority !== 'platform') throw Error('platform required')
            const template = {
                ...definition.definition,
                nodes: definition.definition.nodes.map((node) =>
                    node.kind === 'work' ? { ...node, resourceResolverRef: 'neutral.resources@1' } : node
                )
            }
            await db.getRepository(ProjectPipelineDefinitionEntity).update(definition.id, { definition: template })
        })
        it('blocks an unresolved resource without consuming execute rights; persists immutable canonical resolution', async () => {
            const row = await reserve()
            expect(await store.resourcePreparation(context, row.id)).toMatchObject({
                resolverRef: 'neutral.resources@1',
                context: row.context
            })
            expect(await store.claim(context, row.id, randomUUID())).toBeNull()
            expect(await db.manager.findOneByOrFail(ProjectPipelineOperationEntity, { id: row.id })).toMatchObject({
                leaseFence: 0,
                state: 'queued'
            })
            await store.prepareResources(context, row.id, resources())
            await store.prepareResources(context, row.id, resources())
            expect(await store.resourcePreparation(context, row.id)).toBeNull()
            await expect(store.prepareResources(context, row.id, resources('shared'))).rejects.toThrow()
            await expire(row.id)
            expect((await store.claim(context, row.id, randomUUID())).mode).toBe('execute')
        })
        it('serializes exclusive claims across Projects and tenants and leaves no partial allocation', async () => {
            const row = await reserve(),
                other = await sibling(false)
            const claims = {
                resolverRef: 'neutral.resources@1',
                claims: [...resources().claims, ...resources('exclusive', 'c'.repeat(64)).claims]
            }
            await store.prepareResources(context, row.id, claims)
            await store.prepareResources(other.context, other.operation.id, {
                ...claims,
                claims: [...claims.claims].reverse()
            })
            const results = await Promise.all([
                store.claim(context, row.id, randomUUID()),
                store.claim(other.context, other.operation.id, randomUUID())
            ])
            expect(results.filter(Boolean)).toHaveLength(1)
            const queued = await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ state: 'queued' })
            expect(queued).toMatchObject({ leaseFence: 0, dispatchStartedAt: null })
        })
        it('allows shared readers and independent resources, but blocks an exclusive writer', async () => {
            const row = await reserve(),
                reader = await sibling(),
                writer = await sibling(),
                independent = await sibling()
            for (const [actor, operation, reservation] of [
                [context, row, resources('shared')],
                [reader.context, reader.operation, resources('shared')],
                [writer.context, writer.operation, resources()],
                [independent.context, independent.operation, resources('exclusive', 'd'.repeat(64))]
            ] as const)
                await store.prepareResources(actor, operation.id, reservation)
            expect(await store.claim(context, row.id, randomUUID())).not.toBeNull()
            expect(await store.claim(reader.context, reader.operation.id, randomUUID())).not.toBeNull()
            expect(await store.claim(writer.context, writer.operation.id, randomUUID())).toBeNull()
            expect(await store.claim(independent.context, independent.operation.id, randomUUID())).not.toBeNull()
        })
        it('holds unknown and soft-deleted work after worker expiry and releases only on confirmed terminal evidence', async () => {
            const row = await reserve(),
                other = await sibling()
            await store.prepareResources(context, row.id, resources())
            await store.prepareResources(other.context, other.operation.id, resources())
            await store.claim(context, row.id, randomUUID())
            await expire(row.id)
            const worker = randomUUID(),
                claim = await store.claim(context, row.id, worker)
            expect(claim.mode).toBe('inspect')
            await store.settle(
                context,
                row.id,
                worker,
                claim.fence,
                { receipt: { status: 'unknown' } },
                async () => undefined
            )
            await db.getRepository(ProjectPipelineOperationEntity).softDelete(row.id)
            expect(await store.claim(other.context, other.operation.id, randomUUID())).toBeNull()
            await db.getRepository(ProjectPipelineOperationEntity).restore(row.id)
            await expire(row.id)
            const next = await store.claim(context, row.id, worker)
            await store.settle(
                context,
                row.id,
                worker,
                next.fence,
                { receipt: { status: 'cancelled', receiptKey: row.id } },
                async () => undefined
            )
            await expire(other.operation.id)
            expect((await store.claim(other.context, other.operation.id, randomUUID())).mode).toBe('execute')
        })
        it('does not free occupancy if terminal observation and Task projection roll back', async () => {
            const row = await reserve(),
                other = await sibling()
            await store.prepareResources(context, row.id, resources())
            await store.prepareResources(other.context, other.operation.id, resources())
            const worker = randomUUID(),
                claim = await store.claim(context, row.id, worker)
            await expect(
                store.settle(context, row.id, worker, claim.fence, { receipt: success }, async () => {
                    throw Error('projection failure')
                })
            ).rejects.toThrow('projection failure')
            expect(await store.claim(other.context, other.operation.id, randomUUID())).toBeNull()
        })
        it('rejects foreign actor, resolver substitution and invalid resource payloads before occupancy', async () => {
            const row = await reserve()
            await expect(
                store.prepareResources(
                    { ...context, actor: { ...context.actor, userId: randomUUID() } },
                    row.id,
                    resources()
                )
            ).rejects.toThrow()
            await expect(
                store.prepareResources({ ...context, projectId: randomUUID() }, row.id, resources())
            ).rejects.toThrow()
            await expect(
                store.prepareResources(context, row.id, { ...resources(), resolverRef: 'foreign.resources@1' })
            ).rejects.toThrow()
            await expect(store.prepareResources(context, row.id, { ...resources(), claims: [] })).rejects.toThrow()
            expect(await db.manager.findOneByOrFail(ProjectPipelineOperationEntity, { id: row.id })).toMatchObject({
                resourceReservation: null,
                leaseFence: 0
            })
        })
    })

    describe('cross-Project admission', () => {
        beforeEach(async () => {
            await db.createQueryBuilder().delete().from(ProjectPipelineOperationEntity).execute()
        })
        it('serializes concurrent global claims and leaves excess work queued without consuming execute rights', async () => {
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS = '1'
            const row = await reserve(),
                other = await sibling(false)
            const claims = await Promise.all([
                store.claim(context, row.id, randomUUID()),
                store.claim(other.context, other.operation.id, randomUUID())
            ])
            expect(claims.filter(Boolean)).toHaveLength(1)
            const waiting = claims[0] ? other : { context, operation: row }
            const saved = await db
                .getRepository(ProjectPipelineOperationEntity)
                .findOneByOrFail({ id: waiting.operation.id })
            expect(saved).toMatchObject({ state: 'queued', leaseFence: 0, dispatchStartedAt: null })
            expect(saved.nextCheckAt.getTime()).toBeGreaterThan(Date.now())
        })
        it('retains capacity after lease expiry and unknown observations, but permits inspection and confirmed release', async () => {
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS = '1'
            const row = await reserve(),
                other = await sibling(false)
            await store.claim(context, row.id, randomUUID())
            await expire(row.id)
            expect(await store.claim(other.context, other.operation.id, randomUUID())).toBeNull()
            const worker = randomUUID(),
                observation = await store.claim(context, row.id, worker)
            expect(observation.mode).toBe('inspect')
            await store.settle(
                context,
                row.id,
                worker,
                observation.fence,
                { receipt: { status: 'unknown' } },
                async () => undefined
            )
            await expire(other.operation.id)
            expect(await store.claim(other.context, other.operation.id, randomUUID())).toBeNull()
            await expire(row.id)
            const terminalWorker = randomUUID(),
                terminalClaim = await store.claim(context, row.id, terminalWorker)
            await store.settle(
                context,
                row.id,
                terminalWorker,
                terminalClaim.fence,
                { receipt: { status: 'failed', receiptKey: row.id, code: 'CONFIRMED_FAILURE' } },
                async () => undefined
            )
            await expire(other.operation.id)
            expect((await store.claim(other.context, other.operation.id, randomUUID())).mode).toBe('execute')
        })
        it('shares tenant capacity across Projects while keeping another tenant independent', async () => {
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_TENANT = '1'
            const row = await reserve(),
                same = await sibling(),
                other = await sibling(false)
            await store.claim(context, row.id, randomUUID())
            expect(await store.claim(same.context, same.operation.id, randomUUID())).toBeNull()
            expect((await store.claim(other.context, other.operation.id, randomUUID())).mode).toBe('execute')
        })
        it('keeps superseded and soft-deleted unknown work counted until its external effect is confirmed terminal', async () => {
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS = '1'
            const row = await reserve(),
                other = await sibling(false),
                worker = randomUUID()
            const claim = await store.claim(context, row.id, worker)
            await db.getRepository(ProjectPipelineRoundEntity).update(input.work.roundId, { state: 'superseded' })
            await store.settle(
                context,
                row.id,
                worker,
                claim.fence,
                { receipt: { status: 'unknown' } },
                async () => undefined
            )
            await db.getRepository(ProjectPipelineOperationEntity).softDelete(row.id)
            expect(await store.claim(other.context, other.operation.id, randomUUID())).toBeNull()
        })
        it('allows cancellation and completion evaluation while new work waits for capacity', async () => {
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS = '1'
            const row = await reserve(),
                other = await sibling(false),
                worker = randomUUID()
            const claim = await store.claim(context, row.id, worker)
            await store.settle(context, row.id, worker, claim.fence, { receipt: success }, async () => undefined)
            // External success releases the slot even when business acceptance is still pending.
            expect((await store.claim(other.context, other.operation.id, randomUUID())).mode).toBe('execute')
            await expire(row.id)
            expect((await store.claim(context, row.id, randomUUID())).mode).toBe('evaluate')
            await expire(other.operation.id)
            await db
                .getRepository(ProjectPipelineOperationEntity)
                .update(other.operation.id, { cancelRequestedAt: new Date() })
            expect((await store.claim(other.context, other.operation.id, randomUUID())).mode).toBe('cancel')
        })
        it('counts the exact Assistant before native intent preparation across Projects, without conflating service labels', async () => {
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_ASSISTANT = '1'
            const assistantId = randomUUID(),
                first = await sibling(true, assistantId),
                same = await sibling(true, assistantId)
            const different = await sibling(true, randomUUID()),
                service = await reserve()
            expect((await store.claim(first.context, first.operation.id, randomUUID())).mode).toBe('execute')
            expect(await store.claim(same.context, same.operation.id, randomUUID())).toBeNull()
            expect((await store.claim(different.context, different.operation.id, randomUUID())).mode).toBe('execute')
            expect((await store.claim(context, service.id, randomUUID())).mode).toBe('execute')
        })
        it('rolls back a failed claim transaction without retaining a phantom capacity slot', async () => {
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS = 'invalid'
            const row = await reserve(),
                other = await sibling(false)
            await expect(store.claim(context, row.id, randomUUID())).rejects.toThrow()
            expect(
                await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: row.id })
            ).toMatchObject({ state: 'queued', leaseFence: 0 })
            process.env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS = '1'
            expect((await store.claim(other.context, other.operation.id, randomUUID())).mode).toBe('execute')
        })
    })

    it('keeps paused queued intents unclaimed and resumes them exactly once', async () => {
        const row = await reserve()
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        expect(await store.claim(context, row.id, randomUUID())).toBeNull()
        expect((await store.due()).some((item) => item.id === row.id)).toBe(false)
        expect(await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: row.id })).toMatchObject({
            state: 'queued',
            leaseFence: 0,
            dispatchStartedAt: null
        })
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        expect((await store.claim(context, row.id, randomUUID())).mode).toBe('execute')
        await expire(row.id)
        expect((await store.claim(context, row.id, randomUUID())).mode).toBe('inspect')
    })
    it('fences dispatch after a pause but retains observation and cancellation for claimed work', async () => {
        const row = await reserve(),
            worker = randomUUID()
        const claim = await store.claim(context, row.id, worker)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        expect(await store.beginDispatch(context, row.id, worker, claim.fence)).toBe(false)
        await expire(row.id)
        expect((await store.due()).some((item) => item.id === row.id)).toBe(true)
        expect((await store.claim(context, row.id, randomUUID())).mode).toBe('inspect')
        await expire(row.id)
        await db.getRepository(ProjectPipelineOperationEntity).update(row.id, { cancelRequestedAt: new Date() })
        const cancelWorker = randomUUID(),
            cancellation = await store.claim(context, row.id, cancelWorker)
        expect(cancellation.mode).toBe('cancel')
        expect(await store.beginCancel(context, row.id, cancelWorker, cancellation.fence)).toBe(true)
    })
    it('rolls back the queued intent together with a failed Task update', async () => {
        await expect(
            db.transaction(async (manager) => {
                await store.reserve(manager, context, input)
                await manager.update(XpertProjectTask, taskId, { status: 'in_progress' })
                throw new Error('after task write')
            })
        ).rejects.toThrow('after task write')
        expect(await db.getRepository(ProjectPipelineOperationEntity).countBy({ projectId: context.projectId })).toBe(0)
        expect((await db.getRepository(XpertProjectTask).findOneByOrFail({ id: taskId })).status).toBe('todo')
    })
    it('reserves a stable operation once and rejects changing its immutable inputs', async () => {
        const first = await reserve(),
            second = await reserve()
        expect(second.id).toBe(first.id)
        expect((await store.due()).some((operation) => operation.id === first.id)).toBe(true)
        await expect(
            db.transaction((manager) => store.reserve(manager, context, { ...input, parameters: { changed: true } }))
        ).rejects.toMatchObject({ response: { code: 'OPERATION_INPUT_IMMUTABLE' } })
    })
    it('grants one concurrent execute lease, then recovers an expired lease only through inspect', async () => {
        const operation = await reserve(),
            worker = randomUUID()
        const claims = await Promise.all([
            store.claim(context, operation.id, worker),
            store.claim(context, operation.id, randomUUID())
        ])
        expect(claims.filter(Boolean)).toHaveLength(1)
        expect(claims.find(Boolean)?.mode).toBe('execute')
        await expire(operation.id)
        const next = await store.claim(context, operation.id, randomUUID())
        expect(next).toMatchObject({ mode: 'inspect', fence: 2 })
        const apply = jest.fn()
        expect(await store.settle(context, operation.id, worker, 1, { receipt: success }, apply)).toEqual({
            status: 'stale'
        })
        expect(apply).not.toHaveBeenCalled()
    })
    it('atomically rolls back receipt and Task/Node projection, leaving the original effect for inspection', async () => {
        const operation = await reserve(),
            worker = randomUUID()
        const claim = await store.claim(context, operation.id, worker)
        await expect(
            store.settle(context, operation.id, worker, claim!.fence, { receipt: success }, async (manager) => {
                await manager.update(XpertProjectTask, taskId, { status: 'review' })
                throw new Error('node projection failed')
            })
        ).rejects.toThrow('node projection failed')
        expect(
            await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'dispatching', receipt: null })
        expect((await db.getRepository(XpertProjectTask).findOneByOrFail({ id: taskId })).status).toBe('todo')
        await expire(operation.id)
        expect(await store.claim(context, operation.id, randomUUID())).toMatchObject({ mode: 'inspect' })
    })
    it('keeps runtime success awaiting evaluation, then accepts without re-executing', async () => {
        const operation = await reserve(),
            worker = randomUUID()
        const first = await store.claim(context, operation.id, worker)
        await store.settle(context, operation.id, worker, first!.fence, { receipt: success }, async (manager) => {
            await manager.update(XpertProjectTask, taskId, { status: 'review' })
        })
        await expire(operation.id)
        const next = await store.claim(context, operation.id, worker)
        expect(next?.mode).toBe('evaluate')
        await store.settle(
            context,
            operation.id,
            worker,
            next!.fence,
            { receipt: success, completion: { status: 'accepted', evidence: [] } },
            async (manager) => {
                await manager.update(XpertProjectTask, taskId, { status: 'done' })
            }
        )
        expect(await store.claim(context, operation.id, worker)).toBeNull()
        expect((await db.getRepository(XpertProjectTask).findOneByOrFail({ id: taskId })).status).toBe('done')
    })
    it('records a superseded late result without advancing its old generation', async () => {
        const operation = await reserve(),
            worker = randomUUID()
        const claim = await store.claim(context, operation.id, worker)
        await db.getRepository(ProjectPipelineRoundEntity).update(input.work.roundId, { state: 'superseded' })
        const apply = jest.fn()
        expect(await store.settle(context, operation.id, worker, claim!.fence, { receipt: success }, apply)).toEqual({
            status: 'superseded'
        })
        expect(apply).not.toHaveBeenCalled()
        expect(
            await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'superseded', receipt: success })
    })
    it('rejects another actor and another project before claiming work', async () => {
        const operation = await reserve()
        await expect(
            store.claim({ ...context, actor: { ...context.actor, userId: randomUUID() } }, operation.id, randomUUID())
        ).rejects.toMatchObject({ response: { code: 'OPERATION_ACTOR_MISMATCH' } })
        await expect(store.claim({ ...context, projectId: randomUUID() }, operation.id, randomUUID())).rejects.toThrow()
        expect(
            (await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })).state
        ).toBe('queued')
    })
})
