import { AgentRuntimeBindingEntity, AgentInvocationEntity } from '../../../../agent-invocation/invocation.entity'
import { randomUUID } from 'node:crypto'
import { ProjectPipelineContributionRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../../services/project-access-runtime.service'
import { XpertWorkspace } from '../../../../xpert-workspace/workspace.entity'
import { XpertProjectTask } from '../../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../../entities/project-task-execution.entity'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineAttentionEntity,
    ProjectPipelineDecisionEntity
} from '../../persistence/pipeline.entity'
import { operationQueueFixture } from './pipeline-operation-queue.fixture'
import { untilPipeline } from '../../projection/testing/pipeline-queue.fixture'
import { ProjectPipelineAssistantBridgeService } from '../pipeline-assistant-bridge.service'
import { ProjectPipelineBindingsService } from '../../configuration/pipeline-bindings.service'
import { ProjectPipelineCatalogService } from '../../configuration/pipeline-catalog.service'
import { ProjectPipelineBindingEntity } from '../../persistence/pipeline.entity'
import { pipelineTaskFacts } from '../../queries/pipeline-task-facts'
import { managedPipelineFixture } from './pipeline-managed.fixture'

export function registerManagedCases3(fixture: ReturnType<typeof managedPipelineFixture>) {
    it('uses the explicitly selected multi-workspace grant for dispatch and blocks removal before observation', async () => {
        const launched = await fixture.launchRuntime(true),
            [operation] = await fixture.operations()
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.start.mock.calls[0][1].scope.workspaceId).toBe(fixture.workspaceId)
        const invocation = await fixture.db
            .getRepository(AgentInvocationEntity)
            .findOneByOrFail({ ownerId: fixture.context.actor.userId })
        const scope = invocation.invocation.scope
        await expect(
            fixture.runtimeFixture.factory
                .createCapturedApi({ ...scope, workspaceId: randomUUID() })
                .inspect(invocation.id)
        ).rejects.toThrow()
        await fixture.db
            .getRepository(AgentRuntimeBindingEntity)
            .update(launched.bindingId, { workspaceIds: [randomUUID()] })
        await expect(fixture.runtimeFixture.factory.createCapturedApi(scope).inspect(invocation.id)).rejects.toThrow()
        expect(fixture.runtimeFixture.inspect).not.toHaveBeenCalled()
    })
    it('lists only supported enabled grants and existing same-organization workspace metadata', async () => {
        const launched = await fixture.launchRuntime(true)
        const candidates = await fixture.request(() => fixture.runtimeFixture.bridge.candidates(fixture.context))
        expect(candidates).toEqual([
            {
                id: launched.bindingId,
                title: 'Neutral Runtime',
                provider: 'neutral-runtime',
                revision: '1',
                workspaces: [{ id: fixture.workspaceId, name: 'Authorized Runtime workspace' }]
            }
        ])
        await fixture.db.getRepository(AgentRuntimeBindingEntity).update(launched.bindingId, { enabled: false })
        expect(await fixture.request(() => fixture.runtimeFixture.bridge.candidates(fixture.context))).toEqual([])
        await fixture.db.getRepository(AgentRuntimeBindingEntity).update(launched.bindingId, { enabled: true })
        await fixture.db.getRepository(XpertWorkspace).update(fixture.workspaceId, { status: 'archived' })
        expect(await fixture.request(() => fixture.runtimeFixture.bridge.candidates(fixture.context))).toEqual([])
        await expect(
            fixture.runtimeFixture.factory.resolveProjectPipelineTarget(
                fixture.context.actor,
                fixture.context.projectId,
                launched.bindingId,
                fixture.workspaceId
            )
        ).rejects.toThrow()
        await fixture.db.getRepository(XpertWorkspace).delete(fixture.workspaceId)
        expect(await fixture.request(() => fixture.runtimeFixture.bridge.candidates(fixture.context))).toEqual([])
        await expect(
            fixture.runtimeFixture.factory.resolveProjectPipelineTarget(
                fixture.context.actor,
                fixture.context.projectId,
                launched.bindingId,
                fixture.workspaceId
            )
        ).rejects.toThrow()
    })
    it('cancels the original Runtime invocation and never reroutes it to a new binding', async () => {
        const launched = await fixture.launchRuntime()
        const [operation] = await fixture.operations()
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        await fixture.lifecycle.cancel(fixture.context, {
            instanceId: launched.instanceId,
            requestId: randomUUID(),
            expectedRevision: (
                await fixture.db
                    .getRepository(ProjectPipelineInstanceEntity)
                    .findOneByOrFail({ id: launched.instanceId })
            ).revision
        })
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.cancel).toHaveBeenCalledTimes(1)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'superseded', receipt: { status: 'cancelled', execution: { status: 'cancelled' } } })
        expect(
            await fixture.db
                .getRepository(AgentInvocationEntity)
                .findOneByOrFail({ ownerId: fixture.context.actor.userId })
        ).toMatchObject({ invocation: { status: 'cancelled' } })
    })
    it('retains Runtime success while evidence collection is unavailable without repeating execution', async () => {
        await fixture.launchRuntime()
        const [operation] = await fixture.operations()
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        fixture.runtimeFixture.collect.mockRejectedValueOnce(Error('Evidence store unavailable'))
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown', receipt: { execution: { status: 'succeeded' } } })
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.inspect).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.collect).toHaveBeenCalledTimes(2)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
    })
    it('resolves resources before claim, passes a durable grant and recovers without resolving or executing twice', async () => {
        await fixture.launchResources()
        const [first, second] = await fixture.operations()
        fixture.execute.mockResolvedValue({ status: 'pending', receiptKey: 'receipt-1' })
        await fixture.runner.run(fixture.context, first.id)
        await fixture.runner.run(fixture.context, second.id)
        expect(fixture.resolveResources).toHaveBeenCalledTimes(2)
        expect(fixture.execute).toHaveBeenCalledTimes(1)
        expect(fixture.execute.mock.calls[0][0]).toMatchObject({
            resources: { resolverRef: 'neutral.resources@1', claims: [{ key: 'c'.repeat(64), mode: 'exclusive' }] }
        })
        expect(
            await fixture.db.manager.findOneByOrFail(ProjectPipelineOperationEntity, { id: second.id })
        ).toMatchObject({
            state: 'queued',
            leaseFence: 0
        })
        await fixture.readyAgain(first.id)
        await fixture.runner.run(fixture.context, first.id)
        expect(fixture.resolveResources).toHaveBeenCalledTimes(2)
        expect(fixture.inspect).toHaveBeenCalledTimes(1)
        expect(fixture.inspect.mock.calls[0][0].resources).toEqual(fixture.execute.mock.calls[0][0].resources)
        await fixture.readyAgain(second.id)
        await fixture.runner.run(fixture.context, second.id)
        expect(fixture.execute).toHaveBeenCalledTimes(2)
        expect(fixture.resolveResources).toHaveBeenCalledTimes(2)
    })
    it('saves catalog bindings idempotently and reads immutable configurations with scoped pagination', async () => {
        const registry = fixture.module.get(ProjectPipelineContributionRegistry)
        const saved = new ProjectPipelineBindingsService(
            fixture.db.getRepository(ProjectPipelineBindingEntity),
            fixture.module.get(ProjectAccessRuntimeService)
        )
        const catalog = new ProjectPipelineCatalogService(
            fixture.module.get(ProjectAccessRuntimeService),
            registry,
            fixture.start,
            fixture.module.get(ProjectPipelineAssistantBridgeService),
            saved,
            fixture.runtimeFixture.bridge
        )
        const input = {
            contributionKey: 'neutral',
            templateRef: fixture.configuration.binding.templateRef,
            requestId: randomUUID(),
            assistants: {},
            parameters: {}
        }
        const first = await catalog.configure(fixture.context, input)
        expect(await catalog.configure(fixture.context, input)).toEqual(first)
        const second = await catalog.configure(fixture.context, { ...input, requestId: randomUUID() })
        expect(await fixture.db.getRepository(ProjectPipelineOperationEntity).count()).toBe(0)
        expect(await catalog.binding(fixture.context, first.bindingId)).toMatchObject({
            id: first.bindingId,
            configuration: fixture.configuration
        })
        const page = await catalog.bindings(fixture.context, { limit: 1 })
        expect(page.items.map((item) => item.id)).toEqual([second.bindingId])
        expect(page.next).toBe(second.bindingId)
        expect(await catalog.bindings(fixture.context, { after: page.next!, limit: 1 })).toMatchObject({
            items: [{ id: first.bindingId }],
            next: null
        })
        await expect(
            catalog.binding({ ...fixture.context, projectId: randomUUID() }, first.bindingId)
        ).rejects.toMatchObject({
            status: 404
        })
        await expect(
            catalog.bindings({ ...fixture.context, projectId: randomUUID() }, { after: first.bindingId })
        ).rejects.toMatchObject({ status: 404 })
        fixture.access.assertManage.mockRejectedValueOnce(new Error('revoked'))
        await expect(catalog.binding(fixture.context, first.bindingId)).rejects.toThrow('revoked')
    })
    it('retains configured Assistant identity before execution and reads legacy assignments without writes', async () => {
        await fixture.launchAssistant()
        const tasks = await fixture.db.getRepository(XpertProjectTask).findBy({ projectId: fixture.context.projectId })
        expect(tasks.every((task) => task.assigneeXpertId === fixture.assistantId)).toBe(true)
        await fixture.db
            .getRepository(XpertProjectTask)
            .update({ projectId: fixture.context.projectId }, { assigneeXpertId: null })
        const legacy = await fixture.db.getRepository(XpertProjectTask).findBy({ projectId: fixture.context.projectId })
        const facts = await pipelineTaskFacts(fixture.db.manager, fixture.context, legacy, [])
        expect([...facts.assignees.values()]).toEqual(tasks.map(() => fixture.assistantId))
        expect(
            (await fixture.db.getRepository(XpertProjectTask).findBy({ projectId: fixture.context.projectId })).every(
                (task) => task.assigneeXpertId === null
            )
        ).toBe(true)
        expect(
            (await pipelineTaskFacts(fixture.db.manager, { ...fixture.context, projectId: randomUUID() }, legacy, []))
                .assignees.size
        ).toBe(0)
        expect(fixture.nativeStart).not.toHaveBeenCalled()
    })
    it('cancels unstarted and claimed intents atomically and rejects their stale dispatch fences', async () => {
        const launched = await fixture.launch(),
            operation = (await fixture.operations())[0],
            workerId = randomUUID()
        const claim = await fixture.store.claim(fixture.context, operation.id, workerId)
        const input = await fixture.commandInput(launched.instanceId)
        const cancelled = await fixture.lifecycle.cancel(fixture.context, input)
        expect(await fixture.lifecycle.cancel(fixture.context, input)).toEqual(cancelled)
        expect(await fixture.store.beginDispatch(fixture.context, operation.id, workerId, claim!.fence)).toBe(false)
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
        ).toMatchObject({
            state: 'cancelled'
        })
        expect((await fixture.operations()).every((item) => item.state === 'cancelled')).toBe(true)
        expect(
            (
                await fixture.db
                    .getRepository(XpertProjectTaskExecution)
                    .findBy({ projectId: fixture.context.projectId })
            ).every((item) => item.status === 'cancelled')
        ).toBe(true)
        expect(fixture.execute).not.toHaveBeenCalled()
        expect(fixture.cancel).not.toHaveBeenCalled()
        await expect(
            fixture.lifecycle.cancel(fixture.context, { ...input, expectedRevision: 99 })
        ).rejects.toMatchObject({
            response: { code: 'COMMAND_INPUT_IMMUTABLE' }
        })
    })
    it('retries a declared confirmed failure once, preserves its attempt and reopens a subsequent failure attention', async () => {
        const launched = await fixture.launch(),
            operation = (await fixture.operations())[0]
        fixture.execute.mockResolvedValue({ status: 'failed', receiptKey: 'receipt-1', code: 'TRANSIENT_FAILURE' })
        await fixture.runner.run(fixture.context, operation.id)
        const before = await fixture.db
            .getRepository(XpertProjectTaskExecution)
            .findOneByOrFail({ sourceKey: operation.id })
        const input = {
            ...(await fixture.commandInput(launched.instanceId)),
            operationId: operation.id,
            inputDigest: operation.context.work.inputDigest,
            generation: operation.context.work.generation
        }
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        const pausedRevision = (await fixture.commandInput(launched.instanceId)).expectedRevision
        await expect(fixture.lifecycle.retry(fixture.context, input)).rejects.toMatchObject({
            response: { code: 'PIPELINE_DISPATCH_PAUSED' }
        })
        expect((await fixture.commandInput(launched.instanceId)).expectedRevision).toBe(pausedRevision)
        expect(await fixture.operations()).toHaveLength(2)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        const retry = await fixture.lifecycle.retry(fixture.context, input)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        expect(await fixture.lifecycle.retry(fixture.context, input)).toEqual(retry)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        const second = (await fixture.operations()).find(
            (item) => item.nodeInstanceId === operation.nodeInstanceId && item.attempt === 2
        )!
        expect(second).toBeDefined()
        expect(
            await fixture.db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ sourceKey: operation.id })
        ).toEqual(before)
        await fixture.runner.run(fixture.context, second.id)
        expect(
            await fixture.db
                .getRepository(ProjectPipelineAttentionEntity)
                .findOneByOrFail({ nodeInstanceId: operation.nodeInstanceId, kind: 'blocked' })
        ).toMatchObject({ state: 'open', revision: 2 })
        expect(await fixture.operations()).toHaveLength(3)
        const tasks = await fixture.db.getRepository(XpertProjectTask).findBy({ projectId: fixture.context.projectId })
        const attempts = await fixture.db
            .getRepository(XpertProjectTaskExecution)
            .findBy({ projectId: fixture.context.projectId })
        const facts = await pipelineTaskFacts(fixture.db.manager, fixture.context, tasks, attempts)
        expect(facts.kinds.get(before.id)).toBe('initial')
        expect(facts.kinds.get(attempts.find((attempt) => attempt.sourceKey === second.id)!.id)).toBe('technical_retry')
        expect(
            (
                await pipelineTaskFacts(
                    fixture.db.manager,
                    { ...fixture.context, projectId: randomUUID() },
                    tasks,
                    attempts
                )
            ).kinds.size
        ).toBe(0)
        expect(
            (
                await pipelineTaskFacts(
                    fixture.db.manager,
                    fixture.context,
                    tasks.map((task) => Object.assign(task, { controlKind: 'provider' })),
                    attempts
                )
            ).kinds.size
        ).toBe(0)
    })
    it('inspects the pinned native identity after the accessible Assistant publishes a new version', async () => {
        await fixture.launchAssistant()
        const operation = (await fixture.operations())[0]
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        fixture.published.getAccessiblePublishedXpert.mockResolvedValue({
            id: randomUUID(),
            workspaceId: fixture.workspaceId,
            version: '2',
            ...fixture.context.actor
        })
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.nativeStatus).toHaveBeenCalledWith(
            expect.objectContaining({ xpertId: fixture.assistantId, executionId: operation.id })
        )
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
    })
    it('does not accept a native receipt for a different execution or published version', async () => {
        await fixture.launchAssistant()
        const operation = (await fixture.operations())[0]
        fixture.nativeStart.mockResolvedValueOnce({
            status: 'succeeded',
            executionId: randomUUID(),
            executorPublishedVersion: 'other'
        })
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown' })
        expect(fixture.collect).not.toHaveBeenCalled()
    })
    it('atomically creates controlled Tasks and two intents, joins only accepted work, then persists a policy decision', async () => {
        const launched = await fixture.launch()
        const initial = await fixture.operations()
        expect(initial).toHaveLength(2)
        expect(
            await fixture.db.getRepository(XpertProjectTask).findBy({ projectId: fixture.context.projectId })
        ).toEqual(expect.arrayContaining([expect.objectContaining({ controlKind: 'pipeline', status: 'in_progress' })]))
        expect(fixture.execute).not.toHaveBeenCalled()
        await fixture.runner.run(fixture.context, initial[0].id)
        expect((await fixture.operations()).filter((row) => row.kind === 'policy')).toHaveLength(0)
        await fixture.runner.run(fixture.context, initial[1].id)
        const policy = (await fixture.operations()).find((row) => row.kind === 'policy')!
        await fixture.runner.run(fixture.context, policy.id)
        expect(fixture.execute).toHaveBeenCalledTimes(2)
        expect(fixture.inspect).not.toHaveBeenCalled()
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
        ).toMatchObject({
            state: 'completed'
        })
        expect(
            await fixture.db
                .getRepository(ProjectPipelineDecisionEntity)
                .findBy({ projectId: fixture.context.projectId })
        ).toEqual([expect.objectContaining({ outcome: 'accept', generation: 1 })])
        expect(
            await fixture.db
                .getRepository(ProjectPipelineNodeEntity)
                .findOneByOrFail({ roundId: launched.roundId, nodeKey: 'revision' })
        ).toMatchObject({
            projection: { state: { applicability: 'excluded', lifecycle: 'pending' } }
        })
        expect(
            (await fixture.db.getRepository(XpertProjectTask).findBy({ projectId: fixture.context.projectId })).every(
                (task) => task.status === 'done'
            )
        ).toBe(true)
    })
    it('requires a changed subject and enforces the total instance round limit without overwriting old inputs', async () => {
        const launched = await fixture.launch()
        const input = async () => ({
            instanceId: launched.instanceId,
            requestId: randomUUID(),
            expectedRevision: (
                await fixture.db
                    .getRepository(ProjectPipelineInstanceEntity)
                    .findOneByOrFail({ id: launched.instanceId })
            ).revision
        })
        await expect(fixture.rounds.next(fixture.context, await input())).rejects.toMatchObject({
            response: { code: 'NEW_SUBJECT_VERSION_REQUIRED' }
        })
        fixture.subjectVersion = '2'
        const request = await input(),
            second = await fixture.rounds.next(fixture.context, request)
        expect(await fixture.rounds.next(fixture.context, request)).toEqual(second)
        fixture.subjectVersion = '3'
        await fixture.rounds.next(fixture.context, await input())
        fixture.subjectVersion = '4'
        await expect(fixture.rounds.next(fixture.context, await input())).rejects.toMatchObject({
            response: { code: 'ROUND_LIMIT_EXCEEDED' }
        })
        expect(await fixture.db.getRepository(ProjectPipelineRoundEntity).countBy({ runId: launched.runId })).toBe(3)
        expect(
            (await fixture.db.getRepository(ProjectPipelineRoundEntity).findOneByOrFail({ id: launched.roundId }))
                .subjectVersionSet[0].version
        ).toBe('1')
    })
    ;(process.env.XPERT_PIPELINE_TEST_REDIS_URL ? it : it.skip)(
        'recovers committed intents through real Managed Queue workers after replacing the worker',
        async () => {
            const queue = operationQueueFixture(
                fixture.store,
                fixture.runner,
                process.env.XPERT_PIPELINE_TEST_REDIS_URL!
            )
            const launched = await fixture.launch()
            fixture.execute.mockImplementation(async () => {
                expect(RequestContext.currentUserId()).toBe(fixture.context.actor.userId)
                expect(RequestContext.currentTenantId()).toBe(fixture.context.actor.tenantId)
                expect(RequestContext.getOrganizationId()).toBe(fixture.context.actor.organizationId)
                return { status: 'succeeded', receiptKey: 'receipt-1', outputs: {} }
            })
            try {
                await queue.recover()
                const first = queue.startWorker()
                await untilPipeline(
                    async () =>
                        (await fixture.operations()).filter(
                            (operation) => operation.kind === 'operation' && operation.state === 'accepted'
                        ).length === 2
                )
                await first.close()
                // The next policy intent exists only in PostgreSQL until a fresh recovery instance scans it.
                await queue.recover()
                queue.startWorker()
                await untilPipeline(
                    async () =>
                        (
                            await fixture.db
                                .getRepository(ProjectPipelineRunEntity)
                                .findOneByOrFail({ id: launched.runId })
                        ).state === 'completed'
                )
                expect(fixture.execute).toHaveBeenCalledTimes(2)
                expect(fixture.evaluate).toHaveBeenCalledTimes(1)
            } finally {
                await queue.close()
            }
        },
        30_000
    )
}
