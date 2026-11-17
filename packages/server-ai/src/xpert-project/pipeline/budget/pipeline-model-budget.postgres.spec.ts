import { Xpert } from '../../../xpert/xpert.entity'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType, type IUser } from '@xpert-ai/contracts'
import { ProjectPipelineModelBudgetManagementService } from './pipeline-model-budget-management.service'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { AssistantPrincipalAccessService } from '../../../xpert/assistant-principal/assistant-principal-access.service'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import { ProjectPipelineModelBudgetStore, pipelineModelBudgetTotals } from './pipeline-model-budget.store'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { ProjectPipelineModelReservationEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineEventEntity } from '../persistence/pipeline.entity'
import { pipelineModelBudgetDenials, readPipelineModelBudgetDenial } from './pipeline-model-budget-denial'
import { registerBudgetDenialOrderingTests } from './pipeline-model-budget-denial.postgres-cases'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { AgentRuntimeInbox } from '../../../handoff/runtime-messaging/runtime-message.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import type { AgentInvocation, AgentRuntimeReplyTarget } from '@xpert-ai/plugin-sdk'
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
    let management: ProjectPipelineModelBudgetManagementService, access: ProjectAccessRuntimeService
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
            XpertProjectMembership,
            Xpert,
            XpertProjectTask,
            XpertProjectTaskExecution,
            AgentRuntimeBindingEntity,
            XpertWorkspace,
            XpertAgentExecution,
            AgentInvocationEntity,
            AgentRuntimeInbox,
            ChatConversationThread
        ])
            await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
        const junction = db.getMetadata(XpertProject).findRelationWithPropertyPath('xperts').junctionEntityMetadata
        await runner.createTable(Table.create(junction, db.driver))
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
        const module = await Test.createTestingModule({
            providers: [
                ProjectPipelineModelBudgetManagementService,
                ProjectAccessRuntimeService,
                { provide: DataSource, useValue: db },
                { provide: getRepositoryToken(XpertProject), useValue: db.getRepository(XpertProject) },
                { provide: XpertProjectAccessService, useValue: {} },
                { provide: AssistantPrincipalAccessService, useValue: { isPrincipal: async () => false } }
            ]
        }).compile()
        management = module.get(ProjectPipelineModelBudgetManagementService)
        access = module.get(ProjectAccessRuntimeService)
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
        jest.restoreAllMocks()
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
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(context.actor.userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(context.actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(context.actor.organizationId)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: context.actor.userId } as IUser)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
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
            await manager.save(XpertProject, {
                id: context.projectId,
                name: 'Neutral test project',
                ownerId: context.actor.userId,
                status: 'active',
                ...context.actor
            })
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
    registerBudgetDenialOrderingTests(() => ({ db, context, native }))
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
            {
                id: operation.id,
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId,
                createdById: context.actor.userId,
                threadId: randomUUID(),
                agentKey: 'general_agent',
                type: 'project_agent'
            },
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
            call: { actor: context.actor, executionId: childId, requestId: randomUUID(), estimatedTokens: 50 }
        }
    }
    async function totals() {
        const instance = await db.manager.findOneByOrFail(ProjectPipelineInstanceEntity, { id: input.work.instanceId })
        return pipelineModelBudgetTotals(db.manager, instance)
    }
    async function continuation(sourceExecutionId: string) {
        const id = randomUUID(),
            inboxId = randomUUID(),
            threadId = randomUUID()
        const audit = {
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId,
            createdById: context.actor.userId
        }
        const replyTo: AgentRuntimeReplyTarget = {
            type: 'project_agent',
            projectId: context.projectId,
            conversationId: randomUUID(),
            threadId,
            agentKey: 'general_agent'
        }
        const invocation: AgentInvocation = {
            id: randomUUID(),
            revision: 1,
            status: 'succeeded',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            scope: {
                ...context.actor,
                organizationId: context.actor.organizationId,
                projectId: context.projectId,
                parentExecutionId: sourceExecutionId,
                conversationId: replyTo.conversationId,
                callerType: 'project_agent',
                callerAgentKey: replyTo.agentKey
            },
            request: {
                callId: 'child',
                input: { prompt: 'return 2' },
                target: {
                    provider: 'test',
                    bindingId: randomUUID(),
                    reference: 'test',
                    revision: '1',
                    configuration: {}
                },
                dispatch: { version: 1, requestId: randomUUID(), sourceMessageId: 'source', replyTo }
            }
        }
        await db.getRepository(AgentInvocationEntity).save({
            ...audit,
            id: invocation.id,
            ownerId: context.actor.userId,
            invocation,
            providerSource: { kind: 'builtin', scopeKey: 'global' }
        })
        await db.getRepository(AgentRuntimeInbox).save({
            ...audit,
            id: inboxId,
            ownerId: context.actor.userId,
            invocationId: invocation.id,
            consumptionKey: id,
            messageId: id,
            state: 'processing',
            phase: 'started',
            event: { version: 1, kind: 'result', invocationId: invocation.id, revision: 1, status: 'succeeded' },
            claim: {
                invocationId: invocation.id,
                resultRevision: 1,
                recipient: replyTo,
                consumer: { type: 'follow_up', executionId: id }
            }
        })
        await db.getRepository(XpertAgentExecution).save({
            ...audit,
            id,
            threadId,
            agentKey: replyTo.agentKey,
            type: 'project_agent',
            status: XpertAgentExecutionStatusEnum.RUNNING,
            metadata: { runtimeContinuation: { inboxId } }
        })
        await db.getRepository(ChatConversationThread).save({
            ...audit,
            threadId,
            conversationId: replyTo.conversationId,
            status: 'busy',
            runControl: { executionId: id, state: 'running' }
        })
        return {
            id,
            inboxId,
            threadId,
            invocation,
            call: { actor: context.actor, executionId: id, requestId: randomUUID(), estimatedTokens: 50 }
        }
    }
    async function recovery(sourceId: string, kind: 'retriedFromExecutionId' | 'resumedFromExecutionId') {
        const source = await db.getRepository(XpertAgentExecution).findOneByOrFail({ id: sourceId })
        const id = randomUUID()
        const audit = {
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId,
            createdById: context.actor.userId
        }
        await db.getRepository(XpertAgentExecution).save({
            ...audit,
            id,
            threadId: source.threadId,
            agentKey: source.agentKey,
            type: source.type,
            xpertId: source.xpertId,
            status: XpertAgentExecutionStatusEnum.RUNNING,
            metadata: { [kind]: sourceId }
        })
        const thread = await db.getRepository(ChatConversationThread).findOneBy({ threadId: source.threadId })
        await db.getRepository(ChatConversationThread).save({
            ...audit,
            ...(thread ?? { threadId: source.threadId, conversationId: randomUUID() }),
            status: 'busy',
            runControl: { executionId: id, state: 'running' }
        })
        return {
            id,
            threadId: source.threadId,
            call: { actor: context.actor, executionId: id, requestId: randomUUID(), estimatedTokens: 50 }
        }
    }
    it.each(['retriedFromExecutionId', 'resumedFromExecutionId'] as const)(
        'charges %s and its CLI result continuation after an audited budget increase',
        async (kind) => {
            const f = await native(10, 50)
            await f.budget.admit(f.call)
            await f.budget.settle({ ...f.call, actualTokens: 50 })
            const resumed = await recovery(f.operation.id, kind)
            await expect(f.budget.admit(resumed.call)).rejects.toMatchObject({
                response: { code: 'MODEL_BUDGET_EXCEEDED' }
            })
            await management.increase(context, await increaseInput(200))
            expect(await f.budget.admit(resumed.call)).toBe(true)
            await f.budget.settle({ ...resumed.call, actualTokens: 35 })
            await db
                .getRepository(XpertAgentExecution)
                .update(resumed.id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
            await db.getRepository(ChatConversationThread).update({ threadId: resumed.threadId }, { runControl: null })
            const result = await continuation(resumed.id)
            expect(await new ProjectPipelineModelBudgetStore(db).admit(result.call)).toBe(true)
            await f.budget.settle({ ...result.call, actualTokens: 45 })
            await f.budget.settle({ ...result.call, actualTokens: 45 })
            expect(await totals()).toEqual({ calls: 3, tokens: 130, held: 0, actual: 130 })
            expect(
                await db.getRepository(ProjectPipelineModelReservationEntity).countBy({ operationId: f.operation.id })
            ).toBe(3)
        }
    )
    it('retries a finished continuation using the new root control, without reopening its processed inbox', async () => {
        const f = await native(),
            c = await continuation(f.operation.id)
        await db.getRepository(AgentRuntimeInbox).update(c.inboxId, { state: 'processed' })
        await db.getRepository(XpertAgentExecution).update(c.id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
        const retry = await recovery(c.id, 'retriedFromExecutionId')
        expect(await f.budget.admit(retry.call)).toBe(true)
        await db.getRepository(ProjectPipelineRunEntity).update(input.work.runId, { state: 'cancelled' })
        await f.budget.settle({ ...retry.call, actualTokens: 14 })
        await expect(f.budget.admit({ ...retry.call, requestId: randomUUID() })).rejects.toThrow()
        expect(await totals()).toEqual({ calls: 1, tokens: 14, held: 0, actual: 14 })
    })
    it.each([
        'missing',
        'cycle',
        'actor',
        'tenant',
        'organization',
        'thread',
        'assistant',
        'agent',
        'type',
        'parent',
        'ambiguous',
        'paused',
        'superseded',
        'cancelled'
    ] as const)('rejects invalid recovery (%s) before a reservation', async (kind) => {
        const f = await native(),
            r = await recovery(f.operation.id, 'retriedFromExecutionId')
        const executions = db.getRepository(XpertAgentExecution)
        if (kind === 'missing' || kind === 'cycle')
            await executions.update(r.id, {
                metadata: { retriedFromExecutionId: kind === 'cycle' ? r.id : randomUUID() }
            })
        if (kind === 'actor') await executions.update(r.id, { createdById: randomUUID() })
        if (kind === 'tenant') await executions.update(f.operation.id, { tenantId: randomUUID() })
        if (kind === 'organization') await executions.update(f.operation.id, { organizationId: randomUUID() })
        if (kind === 'thread') await executions.update(r.id, { threadId: randomUUID() })
        if (kind === 'assistant') await executions.update(r.id, { xpertId: randomUUID() })
        if (kind === 'agent') await executions.update(r.id, { agentKey: 'other' })
        if (kind === 'type') await executions.update(r.id, { type: 'llm' })
        if (kind === 'parent') await executions.update(r.id, { parentId: f.operation.id })
        if (kind === 'ambiguous')
            await executions.update(r.id, {
                metadata: {
                    retriedFromExecutionId: f.operation.id,
                    resumedFromExecutionId: f.operation.id
                }
            })
        if (kind === 'paused')
            await db.getRepository(ChatConversationThread).update(
                { threadId: r.threadId },
                {
                    runControl: { executionId: r.id, state: 'paused' }
                }
            )
        if (kind === 'superseded')
            await db.getRepository(ProjectPipelineRoundEntity).update(input.work.roundId, { state: 'superseded' })
        if (kind === 'cancelled')
            await db
                .getRepository(ProjectPipelineOperationEntity)
                .update(f.operation.id, { cancelRequestedAt: new Date() })
        await expect(f.budget.admit(r.call)).rejects.toThrow()
        expect(await totals()).toEqual({ calls: 0, tokens: 0, held: 0, actual: 0 })
    })
    it('keeps unrelated ordinary chat recovery outside the pipeline budget', async () => {
        const f = await native()
        const ordinary = randomUUID()
        const source = await db.getRepository(XpertAgentExecution).findOneByOrFail({ id: f.operation.id })
        await db.getRepository(XpertAgentExecution).save({ ...source, id: ordinary })
        const r = await recovery(ordinary, 'retriedFromExecutionId')
        expect(await f.budget.admit({ ...r.call, estimatedTokens: undefined })).toBe(false)
        expect(await totals()).toEqual({ calls: 0, tokens: 0, held: 0, actual: 0 })
    })
    it('reserves the current estimate across competing workers and retains the hold for unknown usage', async () => {
        const f = await native(10, 100, 10)
        const results = await Promise.allSettled([
            f.budget.admit({ ...f.call, estimatedTokens: 70 }),
            new ProjectPipelineModelBudgetStore(db).admit({ ...f.call, requestId: randomUUID(), estimatedTokens: 70 })
        ])
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
        expect(await totals()).toEqual({ calls: 1, tokens: 70, held: 1, actual: 0 })
    })
    it('blocks a managed request with unavailable estimate before holding budget', async () => {
        const f = await native()
        await expect(f.budget.admit({ ...f.call, estimatedTokens: undefined })).rejects.toMatchObject({
            response: { code: 'MODEL_BUDGET_ESTIMATE_UNAVAILABLE' }
        })
        expect(await totals()).toEqual({ calls: 0, tokens: 0, held: 0, actual: 0 })
    })
    it('keeps two result continuations in the original budget after its initial operation succeeds', async () => {
        const f = await native(3, 200, 50)
        await f.budget.admit(f.call)
        await f.budget.settle({ ...f.call, actualTokens: 20 })
        await db
            .getRepository(ProjectPipelineOperationEntity)
            .update(f.operation.id, { state: 'succeeded', terminalObservedAt: new Date() })
        const first = await continuation(f.operation.id)
        expect(await f.budget.admit(first.call)).toBe(true)
        await f.budget.settle({ ...first.call, actualTokens: 30 })
        await db.getRepository(AgentRuntimeInbox).update(first.inboxId, { state: 'processed' })
        await db.getRepository(XpertAgentExecution).update(first.id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
        const second = await continuation(first.id)
        expect(await new ProjectPipelineModelBudgetStore(db).admit(second.call)).toBe(true)
        await f.budget.settle({ ...second.call, actualTokens: 40 })
        await f.budget.settle({ ...second.call, actualTokens: 40 })
        expect(await totals()).toEqual({ calls: 3, tokens: 90, held: 0, actual: 90 })
        await expect(f.budget.admit({ ...second.call, requestId: randomUUID() })).rejects.toMatchObject({
            response: { code: 'MODEL_BUDGET_EXCEEDED' }
        })
        expect(
            await db.getRepository(ProjectPipelineModelReservationEntity).countBy({ operationId: f.operation.id })
        ).toBe(3)
    })
    it('recovers pre-upgrade continuation ownership only from a unique durable claim', async () => {
        const f = await native(),
            c = await continuation(f.operation.id)
        await db.getRepository(XpertAgentExecution).update(c.id, { metadata: {} })
        expect(await f.budget.admit(c.call)).toBe(true)
        await f.budget.settle({ ...c.call, actualTokens: 11 })
        const inbox = await db.getRepository(AgentRuntimeInbox).findOneByOrFail({ id: c.inboxId })
        await db
            .getRepository(AgentRuntimeInbox)
            .save({ ...inbox, id: randomUUID(), consumptionKey: randomUUID(), messageId: randomUUID() })
        await expect(f.budget.admit({ ...c.call, requestId: randomUUID() })).rejects.toThrow()
        expect(await totals()).toEqual({ calls: 1, tokens: 11, held: 0, actual: 11 })
    })
    it.each([
        ['succeeded', 'continuation'],
        ['accepted', 'continuation'],
        ['accepted', 'retriedFromExecutionId'],
        ['accepted', 'resumedFromExecutionId']
    ] as const)('charges the final authorized summary after %s via %s', async (state, origin) => {
        const f = await native(),
            c = origin === 'continuation' ? await continuation(f.operation.id) : await recovery(f.operation.id, origin)
        await db
            .getRepository(ProjectPipelineOperationEntity)
            .update(f.operation.id, { state, terminalObservedAt: new Date() })
        await db.getRepository(ProjectPipelineRunEntity).update(input.work.runId, { state: 'completed' })
        await db.getRepository(ProjectPipelineRoundEntity).update(input.work.roundId, { state: 'completed' })
        expect(await f.budget.admit(c.call)).toBe(true)
        await f.budget.settle({ ...c.call, actualTokens: 9 })
        expect(await totals()).toEqual({ calls: 1, tokens: 9, held: 0, actual: 9 })
    })
    it.each(['cancelled', 'paused', 'superseded', 'foreign_thread'] as const)(
        'keeps accepted-operation recovery closed when %s',
        async (kind) => {
            const f = await native(),
                r = await recovery(f.operation.id, 'retriedFromExecutionId')
            await db.getRepository(ProjectPipelineOperationEntity).update(f.operation.id, {
                state: 'accepted',
                terminalObservedAt: new Date(),
                ...(kind === 'cancelled' ? { cancelRequestedAt: new Date() } : {})
            })
            await db.getRepository(ProjectPipelineRunEntity).update(input.work.runId, { state: 'completed' })
            await db.getRepository(ProjectPipelineRoundEntity).update(input.work.roundId, {
                state: kind === 'superseded' ? 'superseded' : 'completed'
            })
            if (kind === 'paused' || kind === 'foreign_thread')
                await db.getRepository(ChatConversationThread).update(
                    { threadId: r.threadId },
                    {
                        runControl: {
                            executionId: kind === 'foreign_thread' ? randomUUID() : r.id,
                            state: kind === 'paused' ? 'paused' : 'running'
                        }
                    }
                )
            await expect(f.budget.admit(r.call)).rejects.toMatchObject({
                response: { code: 'MODEL_BUDGET_EXECUTION_CLOSED' }
            })
            expect(await totals()).toEqual({ calls: 0, tokens: 0, held: 0, actual: 0 })
        }
    )
    it.each(['cancel', 'run', 'round', 'thread', 'claim', 'actor', 'project', 'missing_source'] as const)(
        'rejects invalid continuation authority (%s) before reserving a model call',
        async (kind) => {
            const f = await native(),
                c = await continuation(f.operation.id)
            if (kind === 'cancel')
                await db
                    .getRepository(ProjectPipelineOperationEntity)
                    .update(f.operation.id, { cancelRequestedAt: new Date() })
            if (kind === 'run')
                await db.getRepository(ProjectPipelineRunEntity).update(input.work.runId, { state: 'cancelled' })
            if (kind === 'round')
                await db.getRepository(ProjectPipelineRoundEntity).update(input.work.roundId, { state: 'superseded' })
            if (kind === 'thread')
                await db
                    .getRepository(ChatConversationThread)
                    .update({ threadId: c.threadId }, { runControl: { executionId: randomUUID(), state: 'running' } })
            if (kind === 'claim') {
                const inbox = await db.getRepository(AgentRuntimeInbox).findOneByOrFail({ id: c.inboxId })
                await db.getRepository(AgentRuntimeInbox).update(c.inboxId, {
                    claim: { ...inbox.claim, consumer: { type: 'follow_up', executionId: randomUUID() } }
                })
            }
            if (kind === 'actor') await db.getRepository(AgentRuntimeInbox).update(c.inboxId, { ownerId: randomUUID() })
            if (kind === 'project' || kind === 'missing_source') {
                if (kind === 'project') c.invocation.scope.projectId = randomUUID()
                else c.invocation.scope.parentExecutionId = randomUUID()
                const repository = db.getRepository(AgentInvocationEntity)
                const record = await repository.findOneByOrFail({ id: c.invocation.id })
                record.invocation = c.invocation
                await repository.save(record)
            }
            await expect(f.budget.admit(c.call)).rejects.toThrow()
            expect(await totals()).toEqual({ calls: 0, tokens: 0, held: 0, actual: 0 })
        }
    )
    it('settles a continuation once after cancellation without admitting more work', async () => {
        const f = await native(),
            c = await continuation(f.operation.id)
        await f.budget.admit(c.call)
        await db.getRepository(AgentRuntimeInbox).update(c.inboxId, { state: 'processed' })
        await db.getRepository(ProjectPipelineRunEntity).update(input.work.runId, { state: 'cancelled' })
        await f.budget.settle({ ...c.call, actualTokens: 12 })
        await f.budget.settle({ ...c.call, actualTokens: 12 })
        expect(await totals()).toEqual({ calls: 1, tokens: 12, held: 0, actual: 12 })
        await expect(f.budget.admit({ ...c.call, requestId: randomUUID() })).rejects.toThrow()
    })
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
    it('projects a denied continuation and clears it only after a real smaller request is admitted', async () => {
        const f = await native(10, 100, 10)
        await f.budget.admit({ ...f.call, estimatedTokens: 70 })
        await f.budget.settle({ ...f.call, actualTokens: 60 })
        await expect(f.budget.admit({ ...f.call, requestId: randomUUID(), estimatedTokens: 50 })).rejects.toThrow()
        const denied = await pipelineModelBudgetDenials(db.manager, context, [f.operation])
        expect(denied).toHaveLength(1)
        expect(denied[0].executionId).toBe(f.call.executionId)
        expect(
            await pipelineModelBudgetDenials(db.manager, { ...context, projectId: randomUUID() }, [f.operation])
        ).toEqual([])
        const smaller = { ...f.call, requestId: randomUUID(), estimatedTokens: 20 }
        await f.budget.admit(smaller)
        await f.budget.settle({ ...smaller, actualTokens: 10 })
        expect(await pipelineModelBudgetDenials(db.manager, context, [f.operation])).toEqual([])
        expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBeNull()
        await expect(f.budget.admit({ ...f.call, requestId: randomUUID(), estimatedTokens: 40 })).rejects.toThrow()
        expect(await pipelineModelBudgetDenials(db.manager, context, [f.operation])).toHaveLength(1)
        expect(
            await db.manager.countBy(ProjectPipelineEventEntity, {
                instanceId: input.work.instanceId,
                type: 'model.admission_denied'
            })
        ).toBe(2)
        expect(await totals()).toEqual({ calls: 2, tokens: 70, held: 0, actual: 70 })
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
    async function increaseInput(maxTokens = 300) {
        const instance = await db.manager.findOneByOrFail(ProjectPipelineInstanceEntity, { id: input.work.instanceId })
        return {
            instanceId: instance.id,
            requestId: randomUUID(),
            expectedRevision: instance.revision,
            maxTokens,
            reason: 'Human authorized this total ceiling'
        }
    }
    it('raises only the total ceiling, retaining actual usage, unknown holds and denial history across reloads', async () => {
        const f = await native(10)
        await f.budget.admit(f.call)
        await f.budget.settle({ ...f.call, actualTokens: 40 })
        await f.budget.admit({ ...f.call, requestId: randomUUID() })
        await expect(f.budget.admit({ ...f.call, requestId: randomUUID() })).rejects.toThrow()
        const usage = await totals()
        const request = await increaseInput()
        const receipt = await management.increase(context, request)
        expect(receipt.createdById).toBe(context.actor.userId)
        expect(receipt.payload.budgetIncrease).toEqual({
            requestId: request.requestId,
            previousMaxTokens: 100,
            maxTokens: 300,
            reason: request.reason
        })
        expect(await totals()).toEqual(usage)
        const state = await new ProjectPipelineModelBudgetManagementService(db, access).inspect(
            context,
            request.instanceId
        )
        expect(state.basePolicy).toEqual({ maxCalls: 10, maxTokens: 100, reservationTokens: 50 })
        expect(state.policy).toEqual({ ...state.basePolicy, maxTokens: 300 })
        expect(state.increases).toHaveLength(1)
        expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBe('MODEL_BUDGET_EXCEEDED')
        expect((await db.manager.findOneByOrFail(ProjectPipelineOperationEntity, { id: f.operation.id })).state).toBe(
            'pending'
        )
        await expect(
            new ProjectPipelineModelBudgetStore(db).admit({ ...f.call, requestId: randomUUID() })
        ).resolves.toBe(true)
        expect(await totals()).toEqual({ calls: 3, tokens: 140, held: 2, actual: 40 })
    })
    it('replays the exact audited request once and rejects changes, stale revisions and reductions', async () => {
        await native()
        const request = await increaseInput()
        const first = await management.increase(context, request)
        expect((await management.increase(context, request)).id).toBe(first.id)
        await expect(management.increase(context, { ...request, maxTokens: 400 })).rejects.toThrow()
        await expect(
            management.increase(context, { ...request, requestId: randomUUID(), maxTokens: 400 })
        ).rejects.toThrow()
        await expect(management.increase(context, await increaseInput(300))).rejects.toThrow()
        await expect(management.increase(context, await increaseInput(100))).rejects.toThrow()
        expect((await management.inspect(context, request.instanceId)).increases).toHaveLength(1)
    })
    it('serializes concurrent increases with revision compare-and-swap', async () => {
        await native()
        const request = await increaseInput()
        const results = await Promise.allSettled([
            management.increase(context, request),
            management.increase(context, { ...request, requestId: randomUUID(), maxTokens: 400 })
        ])
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
        expect((await management.inspect(context, request.instanceId)).increases).toHaveLength(1)
    })
    it('denies delegated and communication identities before any budget change', async () => {
        await native()
        const request = await increaseInput()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({ principalType: 'api_key' } as ReturnType<
            typeof RequestContext.currentApiPrincipal
        >)
        await expect(management.increase(context, request)).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret'
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        await expect(management.increase(context, request)).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(undefined)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ type: UserType.COMMUNICATION } as IUser)
        await expect(management.increase(context, request)).rejects.toThrow()
    })
    it('rechecks real manager membership inside the transaction and rejects foreign scope', async () => {
        await native()
        const request = await increaseInput()
        for (const actor of [
            { ...context.actor, userId: randomUUID() },
            { ...context.actor, tenantId: randomUUID() },
            { ...context.actor, organizationId: randomUUID() }
        ])
            await expect(management.increase({ ...context, actor }, request)).rejects.toThrow()
        await expect(management.increase({ ...context, projectId: randomUUID() }, request)).rejects.toThrow()
        await expect(management.increase(context, { ...request, instanceId: randomUUID() })).rejects.toThrow()
        const original = access.assertManage.bind(access)
        jest.spyOn(access, 'assertManage').mockImplementationOnce(async (c) => {
            const result = await original(c)
            await db.manager.update(XpertProject, context.projectId, { ownerId: randomUUID() })
            return result
        })
        await expect(management.increase(context, request)).rejects.toThrow()
        expect(
            await db.manager.countBy(ProjectPipelineEventEntity, {
                instanceId: request.instanceId,
                type: 'model.budget_increased'
            })
        ).toBe(0)
    })
    it('retains the call limit and immutable base policy when a new operation starts', async () => {
        const f = await native(1)
        await f.budget.admit(f.call)
        await management.increase(context, await increaseInput())
        await db.manager.update(ProjectPipelineOperationEntity, f.operation.id, {
            state: 'failed',
            terminalObservedAt: new Date()
        })
        input = { ...input, attempt: 2 }
        const next = await native(1)
        await expect(next.budget.admit(next.call)).rejects.toThrow()
        expect((await management.inspect(context, input.work.instanceId)).policy.maxTokens).toBe(300)
        expect(await totals()).toEqual({ calls: 1, tokens: 50, held: 1, actual: 0 })
    })
})
