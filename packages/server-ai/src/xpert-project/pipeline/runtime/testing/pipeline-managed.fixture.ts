import { pipelineRuntimeBridgeFixture } from './pipeline-runtime-bridge.fixture'
import {
    AgentRuntimeBindingEntity,
    AgentInvocationEntity,
    AgentInvocationEventEntity,
    AgentInvocationWaitEntity
} from '../../../../agent-invocation/invocation.entity'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Test, TestingModule } from '@nestjs/testing'
import { DiscoveryModule } from '@nestjs/core'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, Table } from 'typeorm'
import { coreEntities } from '../../../../../../server/src/core/entities'
import { ALL_AI_ENTITIES } from '../../../../core/entities'
import {
    projectPipelineConfigurationSchema,
    type ProjectPipelineOperationReceipt,
    type ProjectPipelinePolicyReceipt
} from '@xpert-ai/contracts'
import {
    ProjectPipelineContributionRegistry,
    ProjectPipelineRuntimeAdapterRegistry,
    StrategyBus,
    DefaultRuntimeCapabilityRegistry,
    AssistantTaskRuntimeCapability,
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    type AgentMiddlewareAssistantTaskInput,
    type AgentMiddlewareAssistantTaskStatusInput,
    type AgentMiddlewareAssistantTaskResult,
    type ProjectPipelineAssistantOperation,
    type ProjectPipelineContext,
    type ProjectPipelineOperationContext
} from '@xpert-ai/plugin-sdk'
import { XpertProjectAccessService } from '../../../services/project-access.service'
import { PublishedXpertAccessService } from '../../../../xpert/published-xpert-access.service'
import { runWithCapturedRequestContext } from '../../../../shared/request-context'
import { ProjectAccessRuntimeService } from '../../../services/project-access-runtime.service'
import { XpertProject } from '../../../entities/project.entity'
import { XpertWorkspace } from '../../../../xpert-workspace/workspace.entity'
import { XpertProjectTask } from '../../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../../entities/project-task-execution.entity'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineAttentionEntity,
    ProjectPipelineDecisionEntity
} from '../../persistence/pipeline.entity'
import { ProjectPipelineConfigurationService } from '../../configuration/project-pipeline-configuration.service'
import { ProjectPipelineManagedStartService } from '../pipeline-managed-start.service'
import { ProjectPipelineCoordinatorService } from '../pipeline-coordinator.service'
import { ProjectPipelineOperationStore } from '../pipeline-operation.store'
import { ProjectPipelineOperationRunnerService } from '../pipeline-operation-runner.service'
import { ProjectPipelineOperationObserverService } from '../pipeline-operation-observer.service'
import { ProjectPipelineEvidenceService } from '../pipeline-evidence.service'
import { ProjectPipelineDecisionService } from '../pipeline-decision.service'
import { ProjectPipelineRoundService } from '../pipeline-round.service'
import { ProjectPipelineBuiltinAdapters } from '../pipeline-builtin-adapters'
import { ProjectPipelineAssistantBridgeService } from '../pipeline-assistant-bridge.service'
import { ProjectPipelineLifecycleService } from '../pipeline-lifecycle.service'
import { readPipelineHumanWaitStatistics } from '../../queries/pipeline-human-wait-statistics'
import { recordPipelineModelBudgetDenial } from '../../budget/pipeline-model-budget-denial'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname))
    throw new Error('Dedicated pipeline test database required')
const integration = url ? describe : describe.skip
const configuration = projectPipelineConfigurationSchema.parse({
    schemaVersion: 1,
    template: {
        key: 'neutral.assess',
        version: '1.0.0',
        title: 'Neutral assessment',
        executionAuthority: 'platform',
        subjectResolverRef: 'neutral.subject@1',
        topology: { source: 'definition' },
        roles: [{ key: 'worker', allowedKinds: ['service'] }],
        lanes: [{ key: 'work', roleKey: 'worker', label: 'Work', order: 0 }],
        stages: [{ key: 'assess', label: 'Assess', order: 0 }],
        nodes: [
            { key: 'begin', kind: 'fork', stageKey: 'assess' },
            ...['alpha', 'beta'].map((key) => ({
                key,
                kind: 'work',
                stageKey: 'assess',
                laneKey: 'work',
                executorSlot: 'worker',
                operationRef: 'neutral.assess@1',
                completionRef: 'neutral.accept@1'
            })),
            { key: 'join', kind: 'join', stageKey: 'assess', join: { mode: 'all_selected', accept: 'completed' } },
            {
                key: 'route',
                kind: 'router',
                stageKey: 'assess',
                policyRef: 'neutral.route@1',
                outcomes: ['accept', 'revise'],
                unmatched: 'block'
            },
            { key: 'done', kind: 'terminal', stageKey: 'assess', outcome: 'accept' },
            {
                key: 'revision',
                kind: 'terminal',
                stageKey: 'assess',
                outcome: 'revise',
                disposition: 'await_new_subject'
            }
        ],
        edges: [
            { from: 'begin', to: 'alpha' },
            { from: 'begin', to: 'beta' },
            { from: 'alpha', to: 'join' },
            { from: 'beta', to: 'join' },
            { from: 'join', to: 'route' },
            { from: 'route', to: 'done', outcome: 'accept' },
            { from: 'route', to: 'revision', outcome: 'revise' }
        ],
        roundPolicy: {
            entryNodeKey: 'begin',
            maxRounds: 3,
            onRework: 'await_new_subject_then_next_round',
            onLimit: 'attention',
            newVersionWhileActive: 'supersede_round',
            terminalOutcomes: ['accept', 'revise']
        },
        failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
    },
    binding: {
        templateRef: 'neutral.assess@1.0.0',
        roleBindings: { worker: { kind: 'service', selectionKey: 'worker' } },
        executorBindings: { worker: { kind: 'service', selectionKey: 'worker', roleKey: 'worker' } },
        parameters: {},
        limits: { maxConcurrentExecutions: 2, maxTechnicalAttemptsPerNode: 3, runTimeoutMinutes: 60 }
    }
})

function humanGateConfiguration() {
    if (configuration.template.executionAuthority !== 'platform') throw new Error('managed template required')
    const gate = projectPipelineConfigurationSchema.parse({
        ...configuration,
        template: {
            ...configuration.template,
            key: 'neutral.gate',
            roles: [...configuration.template.roles, { key: 'owner', allowedKinds: ['human'] }],
            lanes: [...configuration.template.lanes, { key: 'owner', roleKey: 'owner', label: 'Owner', order: 1 }],
            nodes: [
                {
                    key: 'gate',
                    kind: 'human_gate',
                    stageKey: 'assess',
                    laneKey: 'owner',
                    policyRef: 'neutral.route@1',
                    candidateRoleKey: 'owner',
                    outcomes: ['accept', 'revise'],
                    outputPorts: { decision: 'platform.human-decision@1' }
                },
                {
                    key: 'consume',
                    kind: 'work',
                    stageKey: 'assess',
                    laneKey: 'work',
                    executorSlot: 'worker',
                    operationRef: 'neutral.consume@1',
                    completionRef: 'platform.output-validated@1',
                    inputBindings: { approval: { from: 'node_output', nodeKey: 'gate', port: 'decision' } }
                },
                { key: 'done', kind: 'terminal', stageKey: 'assess', outcome: 'accept' },
                {
                    key: 'revision',
                    kind: 'terminal',
                    stageKey: 'assess',
                    outcome: 'revise',
                    disposition: 'await_new_subject'
                }
            ],
            edges: [
                { from: 'gate', to: 'consume', outcome: 'accept' },
                { from: 'consume', to: 'done' },
                { from: 'gate', to: 'revision', outcome: 'revise' }
            ],
            roundPolicy: { ...configuration.template.roundPolicy, entryNodeKey: 'gate' }
        },
        binding: {
            ...configuration.binding,
            templateRef: 'neutral.gate@1.0.0',
            roleBindings: { owner: { kind: 'human', selectionKey: 'authorized_owners' } }
        }
    })
    return gate
}

/** Shared durable test scope; registering cases never starts work before the lifecycle hooks. */
export function managedPipelineFixture() {
    const schema = `pipeline_managed_${randomUUID().replace(/-/g, '')}`
    let db: DataSource,
        module: TestingModule,
        start: ProjectPipelineManagedStartService,
        runner: ProjectPipelineOperationRunnerService,
        context: ProjectPipelineContext,
        coordinator: ProjectPipelineCoordinatorService,
        decisions: ProjectPipelineDecisionService,
        rounds: ProjectPipelineRoundService,
        store: ProjectPipelineOperationStore,
        lifecycle: ProjectPipelineLifecycleService
    const access = {
        assertManage: jest.fn(),
        assertEdit: jest.fn(),
        listReadable: jest.fn(async () => [{ canManage: true }])
    }
    const execute = jest.fn<Promise<ProjectPipelineOperationReceipt>, [ProjectPipelineOperationContext]>()
    const inspect = jest.fn<Promise<ProjectPipelineOperationReceipt>, [ProjectPipelineOperationContext]>()
    const cancel = jest.fn<Promise<ProjectPipelineOperationReceipt>, []>()
    const evaluate = jest.fn<Promise<ProjectPipelinePolicyReceipt>, []>()
    const checkCurrent = jest.fn(async () => true)
    const resolveResources = jest.fn(async () => [{ key: 'c'.repeat(64), mode: 'exclusive' as const }])
    const authorizeDecision = jest.fn(async () => true)
    const assistantId = randomUUID(),
        workspaceId = randomUUID()
    const nativeStart = jest.fn<Promise<AgentMiddlewareAssistantTaskResult>, [AgentMiddlewareAssistantTaskInput]>()
    const nativeStatus = jest.fn<
        Promise<AgentMiddlewareAssistantTaskResult | null>,
        [AgentMiddlewareAssistantTaskStatusInput]
    >()
    const nativeCancel = jest.fn(async (_input: AgentMiddlewareAssistantTaskStatusInput) => ({
        canceledExecutionIds: [] as string[]
    }))
    const prepare = jest.fn<
        ReturnType<ProjectPipelineAssistantOperation['prepare']>,
        Parameters<ProjectPipelineAssistantOperation['prepare']>
    >()
    const collect = jest.fn<
        ReturnType<ProjectPipelineAssistantOperation['collect']>,
        Parameters<ProjectPipelineAssistantOperation['collect']>
    >()
    const assistantAccess = { assertCanUseXpert: jest.fn() }
    const published = { getAccessiblePublishedXpert: jest.fn() }
    const request = <T>(work: () => Promise<T>) =>
        runWithCapturedRequestContext(
            {
                user: { id: context.actor.userId, tenantId: context.actor.tenantId },
                headers: {
                    'tenant-id': context.actor.tenantId,
                    'organization-id': context.actor.organizationId!,
                    'x-scope-level': 'organization'
                }
            },
            work
        )
    let runtimeFixture: ReturnType<typeof pipelineRuntimeBridgeFixture>
    let subjectVersion = '1'
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            entities: [
                ...coreEntities,
                ...ALL_AI_ENTITIES,
                AgentRuntimeBindingEntity,
                AgentInvocationEntity,
                AgentInvocationEventEntity,
                AgentInvocationWaitEntity
            ],
            uuidExtension: 'pgcrypto',
            poolSize: 4,
            extra: { options: `-c search_path=${schema},public` }
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        const queryRunner = db.createQueryRunner()
        for (const entity of [
            XpertWorkspace,
            XpertProject,
            XpertProjectTask,
            XpertProjectTaskExecution,
            AgentRuntimeBindingEntity,
            AgentInvocationEntity,
            AgentInvocationEventEntity,
            AgentInvocationWaitEntity
        ])
            await queryRunner.createTable(Table.create(db.getMetadata(entity), db.driver))
        await queryRunner.release()
        for (const file of [
            '20261018-project-pipeline.sql',
            '20261018-project-pipeline-runtime.sql',
            '20261019-project-pipeline-resources.sql',
            '20261019-project-pipeline-runtime-intent.sql',
            '20261019-project-pipeline-provider-actions.sql',
            '20261019-project-pipeline-model-budget.sql',
            '20261019-project-pipeline-native-grant.sql'
        ])
            await db.query(readFileSync(join(__dirname, '../../migrations', file), 'utf8'))
        module = await Test.createTestingModule({
            imports: [DiscoveryModule],
            providers: [
                StrategyBus,
                ProjectPipelineContributionRegistry,
                ProjectPipelineRuntimeAdapterRegistry,
                ...ProjectPipelineBuiltinAdapters,
                ProjectPipelineAssistantBridgeService,
                ProjectPipelineOperationStore,
                {
                    provide: getRepositoryToken(ProjectPipelineOperationEntity),
                    useValue: db.getRepository(ProjectPipelineOperationEntity)
                },
                { provide: XpertProjectAccessService, useValue: assistantAccess },
                { provide: PublishedXpertAccessService, useValue: published },
                {
                    provide: XPERT_RUNTIME_CAPABILITIES_TOKEN,
                    useValue: new DefaultRuntimeCapabilityRegistry().register(AssistantTaskRuntimeCapability, {
                        startTask: nativeStart,
                        getTaskStatus: nativeStatus,
                        cancelTask: nativeCancel
                    })
                },
                {
                    provide: getRepositoryToken(ProjectPipelineDecisionEntity),
                    useValue: db.getRepository(ProjectPipelineDecisionEntity)
                },
                { provide: ProjectAccessRuntimeService, useValue: access }
            ]
        }).compile()
        await module.init()
        const adapters = module.get(ProjectPipelineRuntimeAdapterRegistry),
            catalog = module.get(ProjectPipelineContributionRegistry)
        const provenance = { kind: 'builtin' as const, scopeKey: 'builtin:global' }
        catalog.register(
            'neutral',
            {
                key: 'neutral',
                configurations: [configuration],
                forms: [
                    {
                        templateRef: configuration.binding.templateRef,
                        description: { en_US: 'Neutral assessment' },
                        assistantSlots: [],
                        parameters: []
                    }
                ],
                descriptors: [
                    { kind: 'schema', ref: 'neutral.document@1' },
                    { kind: 'subject', ref: 'neutral.subject@1', outputSchemaRef: 'neutral.document@1' },
                    { kind: 'resource', ref: 'neutral.resources@1' },
                    {
                        kind: 'operation',
                        ref: 'neutral.assess@1',
                        effects: 'read_only',
                        idempotency: 'read_only',
                        retry: 'after_confirmed_failure',
                        inputs: {},
                        outputs: {},
                        requiredCapabilities: []
                    },
                    {
                        kind: 'operation',
                        ref: 'neutral.consume@1',
                        effects: 'read_only',
                        idempotency: 'read_only',
                        inputs: { approval: { schemaRef: 'platform.human-decision@1', cardinality: 'one' } },
                        outputs: {},
                        requiredCapabilities: []
                    },
                    { kind: 'completion', ref: 'neutral.accept@1' },
                    { kind: 'policy', ref: 'neutral.route@1', outcomes: ['accept', 'revise'] }
                ]
            },
            provenance
        )
        adapters.register(
            'subject:neutral.subject@1',
            {
                kind: 'subject',
                ref: 'neutral.subject@1',
                checkCurrent,
                resolve: async (_context, objectKey) => ({
                    resolverRef: 'neutral.subject@1',
                    objectKey,
                    version: subjectVersion,
                    digest: subjectVersion.repeat(64)
                })
            },
            provenance
        )
        adapters.register(
            'operation:neutral.assess@1',
            { kind: 'operation', ref: 'neutral.assess@1', execute, inspect, cancel },
            provenance
        )
        adapters.register(
            'resource:neutral.resources@1',
            { kind: 'resource', ref: 'neutral.resources@1', resolve: resolveResources },
            provenance
        )
        adapters.register(
            'assistant_operation:neutral.assess@1',
            { kind: 'assistant_operation', ref: 'neutral.assess@1', prepare, collect },
            provenance
        )
        adapters.register(
            'operation:neutral.consume@1',
            { kind: 'operation', ref: 'neutral.consume@1', execute, inspect },
            provenance
        )
        adapters.register(
            'completion:neutral.accept@1',
            {
                kind: 'completion',
                ref: 'neutral.accept@1',
                evaluate: async () => ({ status: 'accepted', evidence: [] })
            },
            provenance
        )
        adapters.register(
            'policy:neutral.route@1',
            { kind: 'policy', ref: 'neutral.route@1', evaluate, authorizeDecision },
            provenance
        )
        const authorization = module.get(ProjectAccessRuntimeService)
        runtimeFixture = pipelineRuntimeBridgeFixture(db, adapters, authorization)
        store = module.get(ProjectPipelineOperationStore)
        coordinator = new ProjectPipelineCoordinatorService(
            db.getRepository(ProjectPipelineInstanceEntity),
            authorization,
            store
        )
        start = new ProjectPipelineManagedStartService(
            db.getRepository(XpertProject),
            authorization,
            new ProjectPipelineConfigurationService(authorization, catalog),
            adapters,
            coordinator,
            module.get(ProjectPipelineAssistantBridgeService),
            runtimeFixture.bridge
        )
        runner = new ProjectPipelineOperationRunnerService(
            db.getRepository(ProjectPipelineOperationEntity),
            authorization,
            store,
            adapters,
            new ProjectPipelineEvidenceService(adapters),
            new ProjectPipelineOperationObserverService(coordinator),
            module.get(ProjectPipelineAssistantBridgeService),
            runtimeFixture.bridge
        )
        decisions = new ProjectPipelineDecisionService(
            db.getRepository(ProjectPipelineAttentionEntity),
            authorization,
            adapters,
            new ProjectPipelineEvidenceService(adapters),
            coordinator
        )
        rounds = new ProjectPipelineRoundService(
            db.getRepository(ProjectPipelineInstanceEntity),
            authorization,
            adapters,
            coordinator
        )
        lifecycle = new ProjectPipelineLifecycleService(
            db.getRepository(ProjectPipelineInstanceEntity),
            authorization,
            catalog,
            coordinator
        )
    }, 30_000)
    afterAll(async () => {
        await module?.close()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    const dispatchSetting = process.env.XPERT_PIPELINE_DISPATCH_ENABLED
    afterEach(() => {
        if (dispatchSetting === undefined) delete process.env.XPERT_PIPELINE_DISPATCH_ENABLED
        else process.env.XPERT_PIPELINE_DISPATCH_ENABLED = dispatchSetting
    })
    beforeEach(async () => {
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        await db.query(`TRUNCATE TABLE "${schema}".xpert_project CASCADE`)
        jest.clearAllMocks()
        runtimeFixture.reset()
        access.assertEdit.mockResolvedValue(undefined)
        access.assertManage.mockResolvedValue(undefined)
        checkCurrent.mockResolvedValue(true)
        resolveResources.mockReset().mockResolvedValue([{ key: 'c'.repeat(64), mode: 'exclusive' }])
        authorizeDecision.mockResolvedValue(true)
        subjectVersion = '1'
        execute.mockResolvedValue({ status: 'succeeded', receiptKey: 'receipt-1', outputs: {} })
        inspect.mockResolvedValue({ status: 'succeeded', receiptKey: 'receipt-1', outputs: {} })
        cancel.mockReset().mockResolvedValue({ status: 'cancelled', receiptKey: 'receipt-1' })
        nativeCancel.mockReset().mockResolvedValue({ canceledExecutionIds: [] })
        evaluate.mockResolvedValue({ status: 'decided', outcome: 'accept', evidence: [] })
        context = {
            projectId: randomUUID(),
            actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
        }
        assistantAccess.assertCanUseXpert.mockResolvedValue(undefined)
        published.getAccessiblePublishedXpert.mockResolvedValue({
            id: assistantId,
            workspaceId,
            version: '1',
            ...context.actor
        })
        prepare
            .mockReset()
            .mockResolvedValue({ prompt: 'Assess the pinned document', context: { subject: 'document' } })
        collect.mockReset().mockResolvedValue({})
        nativeStart.mockReset().mockImplementation(async (input) => ({
            status: 'running',
            executionId: input.executionId!,
            conversationId: input.conversationId!,
            executorXpertId: input.xpertId,
            executorPublishedVersion: '1'
        }))
        nativeStatus.mockReset().mockImplementation(async (input) => ({
            status: 'succeeded',
            executionId: input.executionId!,
            conversationId: input.conversationId!,
            executorXpertId: input.xpertId,
            executorPublishedVersion: '1'
        }))
        await db
            .getRepository(XpertProject)
            .save({ id: context.projectId, name: 'Neutral assessment', workspaceId, ...context.actor })
        await db
            .getRepository(XpertWorkspace)
            .save({ id: workspaceId, name: 'Authorized Runtime workspace', status: 'active', ...context.actor })
    })
    const launch = async () => {
        const { bindingId } = await start.configure(context, { requestId: randomUUID(), configuration })
        return start.start(context, {
            bindingId,
            objectKey: 'document',
            triggerKey: 'trigger',
            title: 'Document assessment'
        })
    }
    const launchResources = async () => {
        if (configuration.template.executionAuthority !== 'platform') throw Error('platform required')
        const resourceConfig = projectPipelineConfigurationSchema.parse({
            ...configuration,
            template: {
                ...configuration.template,
                nodes: configuration.template.nodes.map((node) =>
                    node.kind === 'work' ? { ...node, resourceResolverRef: 'neutral.resources@1' } : node
                )
            }
        })
        const { bindingId } = await start.configure(context, { requestId: randomUUID(), configuration: resourceConfig })
        return start.start(context, {
            bindingId,
            objectKey: 'document',
            triggerKey: 'resource-trigger',
            title: 'Resource assessment'
        })
    }
    const launchRuntime = async (explicitWorkspace = false) => {
        await db.getRepository(XpertProject).update(context.projectId, { workspaceId: null })
        const bindingId = randomUUID()
        await db.getRepository(AgentRuntimeBindingEntity).save({
            id: bindingId,
            title: 'Neutral Runtime',
            ...context.actor,
            workspaceIds: explicitWorkspace ? [workspaceId, randomUUID()] : [workspaceId],
            enabled: true,
            target: {
                bindingId,
                provider: 'neutral-runtime',
                revision: '1',
                reference: 'neutral',
                configuration: {}
            }
        })
        const runtimeConfiguration = projectPipelineConfigurationSchema.parse({
            ...configuration,
            template: { ...configuration.template, roles: [{ key: 'worker', allowedKinds: ['runtime_binding'] }] },
            binding: {
                ...configuration.binding,
                roleBindings: { worker: { kind: 'runtime_binding', selectionKey: bindingId } },
                executorBindings: {
                    worker: {
                        kind: 'runtime_binding',
                        selectionKey: bindingId,
                        roleKey: 'worker',
                        ...(explicitWorkspace ? { workspaceId } : {})
                    }
                }
            }
        })
        const configured = await start.configure(context, {
            requestId: randomUUID(),
            configuration: runtimeConfiguration
        })
        const result = await request(() =>
            start.start(context, {
                bindingId: configured.bindingId,
                objectKey: 'document',
                triggerKey: 'runtime',
                title: 'Runtime assessment'
            })
        )
        return { ...result, bindingId }
    }
    const operations = () => db.getRepository(ProjectPipelineOperationEntity).findBy({ projectId: context.projectId })
    const readyAgain = (id: string) =>
        db.getRepository(ProjectPipelineOperationEntity).update(id, { nextCheckAt: new Date(0) })
    const commandInput = async (instanceId: string) => ({
        instanceId,
        requestId: randomUUID(),
        expectedRevision: (await db.getRepository(ProjectPipelineInstanceEntity).findOneByOrFail({ id: instanceId }))
            .revision
    })
    const launchAssistant = () =>
        request(async () => {
            const config = projectPipelineConfigurationSchema.parse({
                ...configuration,
                template: {
                    ...configuration.template,
                    key: 'neutral.assistant',
                    roles: [{ key: 'worker', allowedKinds: ['assistant'] }]
                },
                binding: {
                    ...configuration.binding,
                    templateRef: 'neutral.assistant@1.0.0',
                    roleBindings: { worker: { kind: 'assistant', selectionKey: assistantId } },
                    executorBindings: { worker: { kind: 'assistant', selectionKey: assistantId, roleKey: 'worker' } }
                }
            })
            const { bindingId } = await start.configure(context, { requestId: randomUUID(), configuration: config })
            return start.start(context, {
                bindingId,
                objectKey: 'document',
                triggerKey: 'native',
                title: 'Native assessment'
            })
        })
    it.each([true, false])(
        'requires the exact native execution cancellation receipt (confirmed=%s)',
        async (confirmed) => {
            const launched = await launchAssistant(),
                operation = (await operations())[0]
            await request(() => runner.run(context, operation.id))
            await lifecycle.cancel(context, await commandInput(launched.instanceId))
            nativeCancel.mockResolvedValueOnce({ canceledExecutionIds: [confirmed ? operation.id : randomUUID()] })
            await request(() => runner.run(context, operation.id))
            expect(nativeCancel).toHaveBeenCalledWith(
                expect.objectContaining({ executionId: operation.id, xpertId: assistantId })
            )
            expect(
                await db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
            ).toMatchObject({ state: confirmed ? 'cancelled' : 'cancelling' })
            expect(collect).not.toHaveBeenCalled()
            if (confirmed)
                expect(
                    await db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ sourceKey: operation.id })
                ).toMatchObject({ status: 'cancelled' })
        }
    )
    it.each([true, false])(
        'projects a persisted native denial to the exact failure attention (denied=%s)',
        async (denied) => {
            const launched = await launchAssistant(),
                operation = (await operations())[0]
            await request(() => runner.run(context, operation.id))
            if (denied)
                await db.transaction(async (manager) => {
                    const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
                        id: launched.instanceId
                    })
                    await recordPipelineModelBudgetDenial(manager, context, instance, operation)
                })
            nativeStatus.mockResolvedValueOnce({ status: 'failed', executionId: operation.id })
            await readyAgain(operation.id)
            await request(() => runner.run(context, operation.id))
            expect(
                await db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
            ).toMatchObject({
                state: 'failed',
                receipt: { code: denied ? 'MODEL_BUDGET_EXCEEDED' : 'ASSISTANT_EXECUTION_FAILED' }
            })
            expect(
                await db
                    .getRepository(ProjectPipelineAttentionEntity)
                    .findOneByOrFail({ nodeInstanceId: operation.nodeInstanceId, kind: 'blocked' })
            ).toMatchObject({ state: 'open', reasonCode: denied ? 'MODEL_BUDGET_EXCEEDED' : 'REQUIRED_NODE_FAILED' })
            expect(
                await db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ sourceKey: operation.id })
            ).toMatchObject({ status: 'failed' })
            expect(collect).not.toHaveBeenCalled()
        }
    )
    it.each(['cancel', 'supersede'])(
        'ends the old human interval on %s without treating it as a completed decision',
        async (mode) => {
            const { bindingId } = await start.configure(context, {
                requestId: randomUUID(),
                configuration: humanGateConfiguration()
            })
            const launched = await start.start(context, {
                bindingId,
                objectKey: 'document',
                triggerKey: 'human-end',
                title: 'Human wait end'
            })
            const previous = await db
                .getRepository(ProjectPipelineAttentionEntity)
                .findOneByOrFail({ projectId: context.projectId, kind: 'human' })
            const instance = await db
                .getRepository(ProjectPipelineInstanceEntity)
                .findOneByOrFail({ id: launched.instanceId })
            const input = { instanceId: instance.id, expectedRevision: instance.revision, requestId: randomUUID() }
            if (mode === 'cancel') await lifecycle.cancel(context, input)
            else {
                subjectVersion = '2'
                await rounds.next(context, input)
            }
            const open = await db
                .getRepository(ProjectPipelineAttentionEntity)
                .findBy({ projectId: context.projectId, kind: 'human', state: 'open' })
            expect(open.some((item) => item.nodeInstanceId === previous.nodeInstanceId)).toBe(false)
            const data = await readPipelineHumanWaitStatistics(
                db.manager,
                context,
                [instance.id],
                open.map((item) => item.nodeInstanceId),
                { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 1000).toISOString() },
                new Date(Date.now() + 1000).toISOString()
            )
            expect(data).toMatchObject({
                intervals: mode === 'cancel' ? 1 : 2,
                ongoing: mode === 'cancel' ? 0 : 1,
                coverage: { missingEvents: 0, invalidEvents: 0, currentUntrackedNodes: 0 }
            })
            expect(
                await db.getRepository(ProjectPipelineDecisionEntity).countBy({ projectId: context.projectId })
            ).toBe(0)
        }
    )
    return {
        get configuration() {
            return configuration
        },
        get humanGateConfiguration() {
            return humanGateConfiguration
        },
        get schema() {
            return schema
        },
        get db() {
            return db
        },
        set db(value: typeof db) {
            db = value
        },
        get module() {
            return module
        },
        set module(value: typeof module) {
            module = value
        },
        get start() {
            return start
        },
        set start(value: typeof start) {
            start = value
        },
        get runner() {
            return runner
        },
        set runner(value: typeof runner) {
            runner = value
        },
        get context() {
            return context
        },
        set context(value: typeof context) {
            context = value
        },
        get coordinator() {
            return coordinator
        },
        set coordinator(value: typeof coordinator) {
            coordinator = value
        },
        get decisions() {
            return decisions
        },
        set decisions(value: typeof decisions) {
            decisions = value
        },
        get rounds() {
            return rounds
        },
        set rounds(value: typeof rounds) {
            rounds = value
        },
        get store() {
            return store
        },
        set store(value: typeof store) {
            store = value
        },
        get lifecycle() {
            return lifecycle
        },
        set lifecycle(value: typeof lifecycle) {
            lifecycle = value
        },
        get access() {
            return access
        },
        get execute() {
            return execute
        },
        get inspect() {
            return inspect
        },
        get cancel() {
            return cancel
        },
        get evaluate() {
            return evaluate
        },
        get checkCurrent() {
            return checkCurrent
        },
        get resolveResources() {
            return resolveResources
        },
        get authorizeDecision() {
            return authorizeDecision
        },
        get assistantId() {
            return assistantId
        },
        get workspaceId() {
            return workspaceId
        },
        get nativeStart() {
            return nativeStart
        },
        get nativeStatus() {
            return nativeStatus
        },
        get nativeCancel() {
            return nativeCancel
        },
        get prepare() {
            return prepare
        },
        get collect() {
            return collect
        },
        get assistantAccess() {
            return assistantAccess
        },
        get published() {
            return published
        },
        get request() {
            return request
        },
        get runtimeFixture() {
            return runtimeFixture
        },
        set runtimeFixture(value: typeof runtimeFixture) {
            runtimeFixture = value
        },
        get subjectVersion() {
            return subjectVersion
        },
        set subjectVersion(value: typeof subjectVersion) {
            subjectVersion = value
        },
        get dispatchSetting() {
            return dispatchSetting
        },
        get launch() {
            return launch
        },
        get launchResources() {
            return launchResources
        },
        get launchRuntime() {
            return launchRuntime
        },
        get operations() {
            return operations
        },
        get readyAgain() {
            return readyAgain
        },
        get commandInput() {
            return commandInput
        },
        get launchAssistant() {
            return launchAssistant
        }
    }
}
