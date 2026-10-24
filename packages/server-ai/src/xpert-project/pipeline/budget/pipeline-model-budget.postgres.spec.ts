import { ProjectPipelineModelBudgetStore, pipelineModelBudgetTotals } from './pipeline-model-budget.store'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { ProjectPipelineModelReservationEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineEventEntity } from '../persistence/pipeline.entity'
import { readPipelineModelBudgetDenial } from './pipeline-model-budget-denial'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { XpertWorkspace } from '../../../xpert-workspace/workspace.entity'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, Table } from 'typeorm'
import { coreEntities } from '../../../../../server/src/core/entities'
import { ALL_AI_ENTITIES } from '../../../core/entities'
import { projectPipelineConfigurationSchema, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
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
    ProjectPipelineOperationEntity,
    ProjectPipelineProviderActionEntity,
    ProjectPipelineNativeGrantEntity
} from '../persistence/pipeline.entity'
import { ProjectPipelineOperationStore, type PipelineOperationReservation } from '../runtime/pipeline-operation.store'
import { initialPipelineNodeState } from '../runtime/pipeline-round-planner'
import { pipelineDigest } from '../persistence/pipeline-identity'

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
        projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
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

integration('native model budget across durable instances', () => {
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
            XpertWorkspace,
            XpertAgentExecution
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
    async function native(maxCalls = 2, maxTokens = 100, reservationTokens = 50) {
        const operation = await reserve(),
            childId = randomUUID()
        await db.getRepository(ProjectPipelineInstanceEntity).update(input.work.instanceId, {
            nativeModelBudget: { maxCalls, maxTokens, reservationTokens }
        })
        await db.getRepository(ProjectPipelineOperationEntity).update(operation.id, {
            state: 'pending',
            dispatchStartedAt: new Date(),
            assistantIntent: {
                executionId: operation.id,
                conversationId: randomUUID(),
                workspaceId: randomUUID(),
                xpertId: randomUUID(),
                publishedVersion: '1',
                input: { prompt: 'Test native budget' }
            }
        })
        await db.getRepository(XpertAgentExecution).save([
            { id: operation.id, tenantId: context.actor.tenantId, organizationId: context.actor.organizationId },
            {
                id: childId,
                parentId: operation.id,
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId
            }
        ])
        return {
            budget: new ProjectPipelineModelBudgetStore(db),
            operation,
            call: { actor: context.actor, executionId: childId, requestId: randomUUID() }
        }
    }
    async function totals() {
        const instance = await db.manager.findOneByOrFail(ProjectPipelineInstanceEntity, { id: input.work.instanceId })
        return pipelineModelBudgetTotals(db.manager, instance)
    }
    it('serializes competing workers before their provider calls and retains unknown holds after reconstruction', async () => {
        const f = await native(1)
        const other = new ProjectPipelineModelBudgetStore(db)
        const outcomes = await Promise.allSettled([
            f.budget.admit(f.call),
            other.admit({ ...f.call, requestId: randomUUID() })
        ])
        expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
        expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(1)
        expect(await totals()).toEqual({ calls: 1, tokens: 50, held: 1, actual: 0 })
        await expect(
            new ProjectPipelineModelBudgetStore(db).admit({ ...f.call, requestId: randomUUID() })
        ).rejects.toThrow()
    })
    it('reconciles actual usage once, permits unused capacity, and rejects conflicting usage', async () => {
        const f = await native()
        await f.budget.admit(f.call)
        await f.budget.settle({ ...f.call, actualTokens: 15 })
        await f.budget.settle({ ...f.call, actualTokens: 15 })
        await expect(f.budget.settle({ ...f.call, actualTokens: 16 })).rejects.toThrow()
        await f.budget.admit({ ...f.call, requestId: randomUUID() })
        expect(await totals()).toEqual({ calls: 2, tokens: 65, held: 1, actual: 15 })
    })
    it('commits one exact denial before rejecting the model and keeps it across reconstruction without charging a call', async () => {
        const f = await native(1)
        await f.budget.admit(f.call)
        await f.budget.settle({ ...f.call, actualTokens: 20 })
        const before = await db.manager.findOneByOrFail(ProjectPipelineInstanceEntity, { id: input.work.instanceId })
        for (let i = 0; i < 2; i++)
            await expect(
                new ProjectPipelineModelBudgetStore(db).admit({ ...f.call, requestId: randomUUID() })
            ).rejects.toMatchObject({ response: { code: 'MODEL_BUDGET_EXCEEDED' } })
        expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBe('MODEL_BUDGET_EXCEEDED')
        expect(await readPipelineModelBudgetDenial(db.manager, context, randomUUID())).toBeNull()
        expect(
            await readPipelineModelBudgetDenial(db.manager, { ...context, projectId: randomUUID() }, f.operation.id)
        ).toBeNull()
        expect(
            await db.manager.countBy(ProjectPipelineEventEntity, {
                instanceId: input.work.instanceId,
                type: 'model.admission_denied'
            })
        ).toBe(1)
        const current = await db.manager.findOneByOrFail(ProjectPipelineInstanceEntity, { id: input.work.instanceId })
        expect(current.revision).toBe(before.revision + 1)
        expect(await totals()).toEqual({ calls: 1, tokens: 20, held: 0, actual: 20 })
    })
    it('keeps an over-reservation actual total and prevents another call rather than clamping consumption', async () => {
        const f = await native(10)
        await f.budget.admit(f.call)
        await f.budget.settle({ ...f.call, actualTokens: 120 })
        expect(await totals()).toEqual({ calls: 1, tokens: 120, held: 0, actual: 120 })
        await expect(f.budget.admit({ ...f.call, requestId: randomUUID() })).rejects.toThrow()
    })
    it('neither soft deletion nor a new operation resets the instance budget', async () => {
        const f = await native(1)
        await f.budget.admit(f.call)
        await db.getRepository(ProjectPipelineModelReservationEntity).softDelete({ operationId: f.operation.id })
        await db
            .getRepository(ProjectPipelineOperationEntity)
            .update(f.operation.id, { state: 'failed', terminalObservedAt: new Date() })
        input = { ...input, attempt: 2 }
        const next = await native(1)
        await expect(next.budget.admit(next.call)).rejects.toThrow()
        expect(await totals()).toEqual({ calls: 1, tokens: 50, held: 1, actual: 0 })
    })
    it('rejects reused request identities and never settles unknown or zero token counts', async () => {
        const f = await native()
        await f.budget.admit(f.call)
        await expect(f.budget.admit(f.call)).rejects.toThrow()
        for (const actualTokens of [0, -1, NaN, Infinity, 1.2])
            await expect(f.budget.settle({ ...f.call, actualTokens })).rejects.toThrow()
        await expect(f.budget.settle({ ...f.call, requestId: randomUUID(), actualTokens: 10 })).rejects.toThrow()
        expect(await totals()).toEqual({ calls: 1, tokens: 50, held: 1, actual: 0 })
    })
    it('does not admit cancelled or superseded executions but still accepts their late real usage', async () => {
        const f = await native()
        await f.budget.admit(f.call)
        await db.getRepository(ProjectPipelineOperationEntity).update(f.operation.id, { cancelRequestedAt: new Date() })
        await expect(f.budget.admit({ ...f.call, requestId: randomUUID() })).rejects.toThrow()
        await f.budget.settle({ ...f.call, actualTokens: 18 })
        expect(await totals()).toMatchObject({ tokens: 18, held: 0 })
    })
    it('requires exact scoped ancestry and the original delegated actor', async () => {
        const f = await native()
        await expect(f.budget.admit({ ...f.call, actor: { ...f.call.actor, userId: randomUUID() } })).rejects.toThrow()
        expect(await f.budget.admit({ ...f.call, actor: { ...f.call.actor, tenantId: randomUUID() } })).toBe(false)
        expect(await f.budget.admit({ ...f.call, actor: { ...f.call.actor, organizationId: randomUUID() } })).toBe(
            false
        )
        expect(await f.budget.admit({ ...f.call, executionId: randomUUID() })).toBe(false)
        expect(await totals()).toEqual({ calls: 0, tokens: 0, held: 0, actual: 0 })
    })
})
