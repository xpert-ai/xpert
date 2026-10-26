import { nativeCompletion } from './control-evidence.fixture'
import * as hostProfile from '../../configuration/pipeline-host-profile'
import { observeProjectTaskInvocations } from '../../../runtime/project-task-invocation-view'
import { AgentInvocationEntity } from '../../../../agent-invocation/invocation.entity'
import { randomUUID } from 'node:crypto'
import { projectPipelineConfigurationSchema } from '@xpert-ai/contracts'
import { XpertProjectTask } from '../../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../../entities/project-task-execution.entity'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineAttentionEntity
} from '../../persistence/pipeline.entity'
import { ProjectPipelineOperationObserverService } from '../pipeline-operation-observer.service'
import { ProjectPipelineAssistantBridgeService } from '../pipeline-assistant-bridge.service'
import { ProjectPipelineBindingEntity } from '../../persistence/pipeline.entity'
import { pipelineTaskFacts } from '../../queries/pipeline-task-facts'
import { managedPipelineFixture } from './pipeline-managed.fixture'

export function registerManagedCases1(fixture: ReturnType<typeof managedPipelineFixture>) {
    it('refuses unsupported configuration and rechecks a previously saved binding before resolving subjects', async () => {
        const { bindingId } = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.configuration
        })
        const host = jest
            .spyOn(hostProfile, 'pipelineHostCapabilities')
            .mockReturnValue({ protocols: [1], features: {} })
        try {
            await expect(
                fixture.start.configure(fixture.context, {
                    requestId: randomUUID(),
                    configuration: fixture.configuration
                })
            ).rejects.toMatchObject({
                response: { code: 'PIPELINE_CONFIGURATION_INVALID' }
            })
            await expect(
                fixture.start.start(fixture.context, {
                    bindingId,
                    objectKey: 'document',
                    triggerKey: 'compatibility',
                    title: 'Compatibility'
                })
            ).rejects.toMatchObject({ response: { code: 'PIPELINE_HOST_INCOMPATIBLE' } })
            expect(fixture.checkCurrent).not.toHaveBeenCalled()
            expect(
                await fixture.db
                    .getRepository(ProjectPipelineRunEntity)
                    .countBy({ projectId: fixture.context.projectId })
            ).toBe(0)
            expect(
                await fixture.db
                    .getRepository(ProjectPipelineBindingEntity)
                    .countBy({ projectId: fixture.context.projectId })
            ).toBe(1)
        } finally {
            host.mockRestore()
        }
    })
    it('projects a durable Runtime Invocation into its exact Task and recovers without another start', async () => {
        await fixture.launchRuntime()
        const [operation] = await fixture.operations()
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        const stored = await fixture.db
            .getRepository(ProjectPipelineOperationEntity)
            .createQueryBuilder('operation')
            .addSelect('operation.runtimeIntent')
            .where('operation.id = :id', { id: operation.id })
            .getOneOrFail()
        expect(stored.state).toBe('pending')
        expect(stored.runtimeIntent).toMatchObject({
            scope: {
                callerType: 'project_pipeline',
                projectId: fixture.context.projectId,
                pipelineOrigin: { operationId: operation.id }
            },
            input: { prompt: 'Assess the pinned neutral input' }
        })
        const attempt = await fixture.db
            .getRepository(XpertProjectTaskExecution)
            .findOneByOrFail({ sourceKey: operation.id })
        expect(attempt.invocationId).toBe(stored.runtimeIntent.invocationId)
        expect(attempt.agentExecutionId).toBeNull()
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.prepare).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.inspect).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.collect).toHaveBeenCalledTimes(1)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
        expect(
            await fixture.db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ id: attempt.id })
        ).toMatchObject({
            status: 'succeeded',
            invocationId: attempt.invocationId
        })
        expect(
            await fixture.db.getRepository(AgentInvocationEntity).countBy({ ownerId: fixture.context.actor.userId })
        ).toBe(1)
        const [view] = await observeProjectTaskInvocations(
            fixture.db.manager,
            {
                projectId: fixture.context.projectId,
                tenantId: fixture.context.actor.tenantId,
                organizationId: fixture.context.actor.organizationId
            },
            [attempt]
        )
        expect(view).toMatchObject({ invocationStatus: 'succeeded', runtimeProvider: 'neutral-runtime' })
    })
    it('rolls back a failed Task projection and recovers the already committed Runtime terminal result', async () => {
        await fixture.launchRuntime()
        const [operation] = await fixture.operations()
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        const attempt = await fixture.db
            .getRepository(XpertProjectTaskExecution)
            .findOneByOrFail({ sourceKey: operation.id })
        const apply = jest
            .spyOn(ProjectPipelineOperationObserverService.prototype, 'apply')
            .mockRejectedValueOnce(Error('Projection unavailable'))
        await fixture.readyAgain(operation.id)
        try {
            await expect(fixture.request(() => fixture.runner.run(fixture.context, operation.id))).rejects.toThrow(
                'Projection unavailable'
            )
        } finally {
            apply.mockRestore()
        }
        expect(
            await fixture.db.getRepository(AgentInvocationEntity).findOneByOrFail({ id: attempt.invocationId })
        ).toMatchObject({ invocation: { status: 'succeeded' } })
        expect(
            await fixture.db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ id: attempt.id })
        ).toMatchObject({
            status: 'running'
        })
        await fixture.db
            .getRepository(ProjectPipelineOperationEntity)
            .update(operation.id, { leaseExpiresAt: new Date(0), nextCheckAt: new Date(0) })
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.inspect).toHaveBeenCalledTimes(1)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
        expect(
            await fixture.db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ id: attempt.id })
        ).toMatchObject({
            status: 'succeeded'
        })
    })
    it('rejects a new run while paused, replays accepted triggers and still cancels queued work', async () => {
        const { bindingId } = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.configuration
        })
        const request = { bindingId, objectKey: 'document', triggerKey: 'drain-check', title: 'Drain check' }
        const launched = await fixture.start.start(fixture.context, request)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        expect(await fixture.start.start(fixture.context, request)).toEqual(launched)
        await expect(
            fixture.start.start(fixture.context, { ...request, triggerKey: 'new-trigger' })
        ).rejects.toMatchObject({
            response: { code: 'PIPELINE_DISPATCH_PAUSED' },
            status: 503
        })
        await expect(
            fixture.rounds.next(fixture.context, {
                instanceId: launched.instanceId,
                requestId: randomUUID(),
                expectedRevision: launched.revision
            })
        ).rejects.toMatchObject({ response: { code: 'PIPELINE_DISPATCH_PAUSED' } })
        for (const operation of await fixture.operations()) await fixture.runner.run(fixture.context, operation.id)
        expect(fixture.execute).not.toHaveBeenCalled()
        await fixture.lifecycle.cancel(fixture.context, await fixture.commandInput(launched.instanceId))
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
        ).toMatchObject({
            state: 'cancelled'
        })
    })
    it('fixes the native model budget on the instance and rejects removal or replacement on a new Run', async () => {
        const source = projectPipelineConfigurationSchema.parse({
            ...fixture.configuration,
            template: {
                ...fixture.configuration.template,
                hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } }
            },
            binding: {
                ...fixture.configuration.binding,
                limits: {
                    ...fixture.configuration.binding.limits,
                    nativeModelBudget: { maxCalls: 2, maxTokens: 100, reservationTokens: 50 }
                }
            }
        })
        const first = await fixture.start.configure(fixture.context, { requestId: randomUUID(), configuration: source })
        const run = await fixture.start.start(fixture.context, {
            bindingId: first.bindingId,
            objectKey: 'document',
            triggerKey: 'budget-one',
            title: 'Budget'
        })
        await fixture.db.getRepository(ProjectPipelineRunEntity).update(run.runId, { state: 'completed' })
        for (const budget of [undefined, { maxCalls: 100, maxTokens: 10000, reservationTokens: 50 }]) {
            const saved = await fixture.start.configure(fixture.context, {
                requestId: randomUUID(),
                configuration: {
                    ...source,
                    binding: { ...source.binding, limits: { ...source.binding.limits!, nativeModelBudget: budget } }
                }
            })
            await expect(
                fixture.start.start(fixture.context, {
                    bindingId: saved.bindingId,
                    objectKey: 'document',
                    triggerKey: 'budget-two',
                    title: 'Budget'
                })
            ).rejects.toMatchObject({ response: { code: 'INSTANCE_BUDGET_IMMUTABLE' } })
        }
        expect(await fixture.db.getRepository(ProjectPipelineRunEntity).countBy({ instanceId: run.instanceId })).toBe(1)
    })
    it('shows persisted service receipt status without treating domain completion or missing native records as success', async () => {
        await fixture.launch()
        const operation = (await fixture.operations())[0]
        const tasks = await fixture.db.getRepository(XpertProjectTask).findBy({ projectId: fixture.context.projectId })
        const read = async () =>
            pipelineTaskFacts(
                fixture.db.manager,
                fixture.context,
                tasks,
                await fixture.db
                    .getRepository(XpertProjectTaskExecution)
                    .findBy({ projectId: fixture.context.projectId })
            )
        expect([...(await read()).services.values()].map((value) => value.runtimeStatus)).toEqual(['queued', 'queued'])
        fixture.execute.mockRejectedValueOnce(new Error('Lost receipt'))
        await fixture.runner.run(fixture.context, operation.id)
        expect([...(await read()).services.values()].map((value) => value.runtimeStatus)).toContain('unknown')
        await fixture.readyAgain(operation.id)
        await fixture.runner.run(fixture.context, operation.id)
        const completed = await fixture.db
            .getRepository(ProjectPipelineOperationEntity)
            .findOneByOrFail({ id: operation.id })
        expect([...(await read()).services.values()]).toContainEqual({
            runtimeStatus: 'succeeded',
            runtimeProvider: 'pipeline-service',
            runtimeServiceRef: completed.handlerRef,
            runtimeStartedAt: completed.dispatchStartedAt.toISOString(),
            runtimeCompletedAt: completed.terminalObservedAt.toISOString()
        })
        const attempts = await fixture.db
            .getRepository(XpertProjectTaskExecution)
            .findBy({ projectId: fixture.context.projectId })
        expect(
            (
                await pipelineTaskFacts(
                    fixture.db.manager,
                    fixture.context,
                    tasks,
                    attempts.map((attempt) => Object.assign(attempt, { agentExecutionId: randomUUID() }))
                )
            ).services.size
        ).toBe(0)
        expect(
            (
                await pipelineTaskFacts(
                    fixture.db.manager,
                    { ...fixture.context, projectId: randomUUID() },
                    tasks,
                    attempts
                )
            ).services.size
        ).toBe(0)
    })
    it('rejects unknown retries, stale commands and revoked editors without changing their intents', async () => {
        const launched = await fixture.launch(),
            operation = (await fixture.operations())[0]
        fixture.execute.mockRejectedValueOnce(new Error('Response lost'))
        await fixture.runner.run(fixture.context, operation.id)
        const input = {
            ...(await fixture.commandInput(launched.instanceId)),
            operationId: operation.id,
            inputDigest: operation.context.work.inputDigest,
            generation: operation.context.work.generation
        }
        await expect(fixture.lifecycle.retry(fixture.context, input)).rejects.toMatchObject({
            response: { code: 'OPERATION_RETRY_UNSAFE' }
        })
        await expect(
            fixture.lifecycle.cancel(fixture.context, {
                ...(await fixture.commandInput(launched.instanceId)),
                expectedRevision: 1
            })
        ).rejects.toMatchObject({ response: { code: 'RUN_REVISION_CONFLICT' } })
        fixture.access.assertEdit.mockRejectedValueOnce(new Error('revoked'))
        await expect(
            fixture.lifecycle.cancel(fixture.context, await fixture.commandInput(launched.instanceId))
        ).rejects.toThrow('revoked')
        expect(await fixture.operations()).toHaveLength(2)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown', cancelRequestedAt: null })
    })
    it('releases old-round capacity after known native termination even when old output collection is unavailable', async () => {
        const launched = await fixture.launchAssistant(),
            operation = (await fixture.operations())[0]
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        fixture.subjectVersion = '2'
        const next = await fixture.rounds.next(fixture.context, await fixture.commandInput(launched.instanceId))
        fixture.collect.mockRejectedValueOnce(new Error('Old domain output unavailable'))
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'superseded', receipt: { status: 'unknown', execution: { status: 'succeeded' } } })
        expect((await fixture.operations()).filter((item) => item.roundId === next.roundId)).toHaveLength(2)
        expect(fixture.nativeStart).toHaveBeenCalledTimes(1)
    })
    it('keeps successful native runtime distinct from output acceptance and retries collection without another execution', async () => {
        await fixture.launchAssistant()
        const operation = (await fixture.operations())[0]
        fixture.nativeStart.mockImplementationOnce(async (input) => ({
            status: 'succeeded',
            control: nativeCompletion(input.executionId!),
            executionId: input.executionId!
        }))
        fixture.collect.mockRejectedValueOnce(new Error('Domain evidence unavailable'))
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown' })
        const attempt = await fixture.db
            .getRepository(XpertProjectTaskExecution)
            .findOneByOrFail({ sourceKey: operation.id })
        expect(attempt).toMatchObject({
            agentExecutionId: operation.id,
            status: 'succeeded',
            completedAt: expect.any(Date)
        })
        expect(
            await fixture.db.getRepository(XpertProjectTask).findOneByOrFail({ id: attempt.taskId })
        ).not.toMatchObject({
            status: 'done'
        })
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.nativeStart).toHaveBeenCalledTimes(1)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
    })
    it('rejects mismatched actor and a revoked Project executor binding before native invocation', async () => {
        await expect(
            fixture.module.get(ProjectPipelineAssistantBridgeService).resolve(fixture.context, fixture.assistantId)
        ).rejects.toThrow()
        fixture.assistantAccess.assertCanUseXpert.mockRejectedValueOnce(new Error('Binding unavailable'))
        await expect(fixture.launchAssistant()).rejects.toThrow('Binding unavailable')
        expect(fixture.nativeStart).not.toHaveBeenCalled()
        expect(await fixture.operations()).toHaveLength(0)
    })
    it('rejects adapter attempts to override the governed native target', async () => {
        await fixture.launchAssistant()
        const operation = (await fixture.operations())[0]
        fixture.prepare.mockResolvedValueOnce({ prompt: 'Assess', ...{ xpertId: randomUUID() } })
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.nativeStart).not.toHaveBeenCalled()
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown' })
    })
    it('resolves a lost dispatch response by inspection with no replay and resolves its attention', async () => {
        await fixture.launch()
        const operation = (await fixture.operations())[0]
        fixture.execute.mockRejectedValueOnce(new Error('response lost after acceptance'))
        await fixture.runner.run(fixture.context, operation.id)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown', receipt: { status: 'unknown' } })
        expect(
            await fixture.db
                .getRepository(ProjectPipelineAttentionEntity)
                .countBy({ projectId: fixture.context.projectId, state: 'open', kind: 'unknown' })
        ).toBe(1)
        await fixture.readyAgain(operation.id)
        await fixture.runner.run(fixture.context, operation.id)
        expect(fixture.execute).toHaveBeenCalledTimes(1)
        expect(fixture.inspect).toHaveBeenCalledWith(
            expect.objectContaining({ idempotencyKey: operation.id }),
            undefined
        )
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
        expect(
            await fixture.db
                .getRepository(ProjectPipelineAttentionEntity)
                .countBy({ projectId: fixture.context.projectId, state: 'open', kind: 'unknown' })
        ).toBe(0)
    })
    it('rechecks access before a queued operation calls an adapter', async () => {
        await fixture.launch()
        fixture.access.assertEdit.mockRejectedValueOnce(new Error('revoked'))
        await expect(fixture.runner.run(fixture.context, (await fixture.operations())[0].id)).rejects.toThrow('revoked')
        expect(fixture.execute).not.toHaveBeenCalled()
        expect((await fixture.operations()).every((operation) => operation.state === 'queued')).toBe(true)
    })
    it('keeps old unknown work observable and holds new-round dispatch until a terminal receipt is confirmed', async () => {
        const launched = await fixture.launch()
        const old = (await fixture.operations())[0]
        fixture.execute.mockRejectedValueOnce(new Error('response lost'))
        await fixture.runner.run(fixture.context, old.id)
        fixture.subjectVersion = '2'
        const instance = await fixture.db
            .getRepository(ProjectPipelineInstanceEntity)
            .findOneByOrFail({ id: launched.instanceId })
        const next = await fixture.rounds.next(fixture.context, {
            instanceId: instance.id,
            expectedRevision: instance.revision,
            requestId: randomUUID()
        })
        expect((await fixture.operations()).filter((operation) => operation.roundId === next.roundId)).toHaveLength(0)
        expect(
            await fixture.db.getRepository(ProjectPipelineRoundEntity).findOneByOrFail({ id: launched.roundId })
        ).toMatchObject({ state: 'superseded' })
        // Inspect remains permitted even though this subject is no longer current.
        fixture.checkCurrent.mockResolvedValue(false)
        await fixture.readyAgain(old.id)
        await fixture.runner.run(fixture.context, old.id)
        expect(fixture.inspect).toHaveBeenCalledTimes(1)
        expect(fixture.execute).toHaveBeenCalledTimes(1)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: old.id })
        ).toMatchObject({
            state: 'superseded',
            receipt: { status: 'succeeded' }
        })
        expect((await fixture.operations()).filter((operation) => operation.roundId === next.roundId)).toHaveLength(2)
        expect(
            (await fixture.db.getRepository(ProjectPipelineNodeEntity).findOneByOrFail({ id: old.nodeInstanceId }))
                .projection.state
        ).toMatchObject({ freshness: 'superseded', lifecycle: 'active' })
    })
}
