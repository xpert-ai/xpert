import { AgentRuntimeBindingEntity } from '../../../../agent-invocation/invocation.entity'
import { randomUUID } from 'node:crypto'
import { projectPipelineConfigurationSchema, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../../services/project-access-runtime.service'
import type { XpertProjectAccessService } from '../../../services/project-access.service'
import { XpertProjectTaskExecution } from '../../../entities/project-task-execution.entity'
import { XpertProject } from '../../../entities/project.entity'
import {
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineAttentionEntity,
    ProjectPipelineDecisionEntity
} from '../../persistence/pipeline.entity'
import { ProjectPipelineBindingsService } from '../../configuration/pipeline-bindings.service'
import { ProjectPipelineBindingEntity, ProjectPipelineDefinitionEntity } from '../../persistence/pipeline.entity'
import { readPipelineHumanWaitStatistics } from '../../queries/pipeline-human-wait-statistics'
import { managedPipelineFixture } from './pipeline-managed.fixture'

export function registerManagedCases2(fixture: ReturnType<typeof managedPipelineFixture>) {
    it('runs interactive user work without an allowlist and rechecks live Project access in the worker', async () => {
        const assistantAccess = {
            assertCanReadXpert: jest.fn().mockRejectedValue(new Error('Unexpected Assistant access lookup'))
        } as unknown as XpertProjectAccessService
        const access = new ProjectAccessRuntimeService(fixture.db.getRepository(XpertProject), assistantAccess)
        fixture.access.assertEdit.mockImplementation((input) => access.assertEdit(input))
        fixture.access.assertManage.mockImplementation((input) => access.assertManage(input))
        await fixture.db.getRepository(XpertProject).update(fixture.context.projectId, {
            ownerId: fixture.context.actor.userId
        })
        const credential = jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            id: fixture.context.actor.userId,
            tenantId: fixture.context.actor.tenantId,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: fixture.assistantId }
        })
        try {
            await fixture.launch()
        } finally {
            credential.mockRestore()
        }
        const operations = await fixture.operations()
        expect(operations).toHaveLength(2)
        expect(operations[0].context.actor).toEqual(fixture.context.actor)
        await fixture.request(() => fixture.runner.run(fixture.context, operations[0].id))
        expect(fixture.execute).toHaveBeenCalledTimes(1)
        await fixture.db.getRepository(XpertProject).update(fixture.context.projectId, { ownerId: randomUUID() })
        await expect(
            fixture.request(() => fixture.runner.run(fixture.context, operations[1].id))
        ).rejects.toMatchObject({ status: 403 })
        expect(fixture.execute).toHaveBeenCalledTimes(1)
    })

    it('rejects ambiguous Runtime workspace grants before any work is admitted', async () => {
        const bindingId = randomUUID()
        await fixture.db.getRepository(AgentRuntimeBindingEntity).save({
            id: bindingId,
            title: 'Ambiguous Runtime',
            ...fixture.context.actor,
            workspaceIds: [fixture.workspaceId, randomUUID()],
            enabled: true,
            target: {
                bindingId,
                provider: 'neutral-runtime',
                revision: '1',
                reference: 'neutral',
                configuration: {}
            }
        })
        await expect(
            fixture.runtimeFixture.factory.resolveProjectPipelineTarget(
                fixture.context.actor,
                fixture.context.projectId,
                bindingId
            )
        ).rejects.toThrow()
        expect(fixture.runtimeFixture.start).not.toHaveBeenCalled()
        await expect(
            fixture.runtimeFixture.factory.resolveProjectPipelineTarget(
                fixture.context.actor,
                fixture.context.projectId,
                bindingId,
                randomUUID()
            )
        ).rejects.toThrow()
        expect(
            await fixture.runtimeFixture.factory.resolveProjectPipelineTarget(
                fixture.context.actor,
                fixture.context.projectId,
                bindingId,
                fixture.workspaceId
            )
        ).toMatchObject({ workspaceId: fixture.workspaceId })
    })
    it('retains a lost Runtime launch receipt and observes the original durable invocation', async () => {
        fixture.runtimeFixture.start.mockImplementationOnce(async (_input, runtimeContext) => {
            await runtimeContext.checkpoint({
                status: 'running',
                handle: { sessionId: runtimeContext.invocationId, runId: runtimeContext.invocationId }
            })
            throw new Error('Lost start response')
        })
        await fixture.launchRuntime()
        const [operation] = await fixture.operations()
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown' })
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.inspect).toHaveBeenCalledTimes(1)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
    })
    it('keeps the original Runtime unknown when its binding is replaced, then recovers when restored', async () => {
        const launched = await fixture.launchRuntime(),
            [operation] = await fixture.operations()
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        const binding = await fixture.db
            .getRepository(AgentRuntimeBindingEntity)
            .findOneByOrFail({ id: launched.bindingId })
        await fixture.db
            .getRepository(AgentRuntimeBindingEntity)
            .createQueryBuilder()
            .update()
            .set({ target: () => ':target::jsonb' })
            .where({ id: binding.id })
            .setParameters({ target: JSON.stringify({ ...binding.target, revision: '2' }) })
            .execute()
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.inspect).not.toHaveBeenCalled()
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown' })
        await fixture.db
            .getRepository(AgentRuntimeBindingEntity)
            .createQueryBuilder()
            .update()
            .set({ target: () => ':target::jsonb' })
            .where({ id: binding.id })
            .setParameters({ target: JSON.stringify(binding.target) })
            .execute()
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(fixture.runtimeFixture.inspect).toHaveBeenCalledTimes(1)
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'accepted' })
    })
    it('does not claim or dispatch if resource resolution fails, and reauthorizes before resolving', async () => {
        await fixture.launchResources()
        const [first] = await fixture.operations()
        fixture.resolveResources.mockRejectedValueOnce(Error('resource unavailable'))
        await expect(fixture.runner.run(fixture.context, first.id)).rejects.toThrow('resource unavailable')
        expect(
            await fixture.db.manager.findOneByOrFail(ProjectPipelineOperationEntity, { id: first.id })
        ).toMatchObject({
            state: 'queued',
            leaseFence: 0,
            resourceReservation: null
        })
        expect(fixture.execute).not.toHaveBeenCalled()
        fixture.access.assertEdit.mockRejectedValueOnce(Error('revoked'))
        await expect(fixture.runner.run(fixture.context, first.id)).rejects.toThrow('revoked')
        expect(fixture.resolveResources).toHaveBeenCalledTimes(1)
    })
    it('observes in-flight effects while paused and holds newly ready successors until resumed', async () => {
        await fixture.launch()
        fixture.execute.mockResolvedValue({ status: 'pending', receiptKey: 'receipt-1' })
        for (const operation of await fixture.operations()) await fixture.runner.run(fixture.context, operation.id)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        for (const operation of await fixture.operations()) {
            await fixture.readyAgain(operation.id)
            await fixture.runner.run(fixture.context, operation.id)
        }
        expect(fixture.execute).toHaveBeenCalledTimes(2)
        expect(fixture.inspect).toHaveBeenCalledTimes(2)
        const policy = (await fixture.operations()).find((item) => item.kind === 'policy')
        expect(policy).toMatchObject({ state: 'queued', leaseFence: 0 })
        expect((await fixture.store.due()).some((item) => item.id === policy.id)).toBe(false)
        await fixture.runner.run(fixture.context, policy.id)
        expect(fixture.evaluate).not.toHaveBeenCalled()
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        await fixture.runner.run(fixture.context, policy.id)
        expect(fixture.evaluate).toHaveBeenCalledTimes(1)
    })
    it('keeps declared requirements immutable and negotiates saved configuration reads without deleting history', async () => {
        const saved = new ProjectPipelineBindingsService(
            fixture.db.getRepository(ProjectPipelineBindingEntity),
            fixture.module.get(ProjectAccessRuntimeService)
        )
        const old = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.configuration
        })
        const modern = projectPipelineConfigurationSchema.parse({
            ...fixture.configuration,
            template: {
                ...fixture.configuration.template,
                version: '2.0.0',
                hostRequirements: { protocol: 1, features: { 'pipeline.managed': 1 } }
            },
            binding: { ...fixture.configuration.binding, templateRef: `${fixture.configuration.template.key}@2.0.0` }
        })
        const configured = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: modern
        })
        expect(await saved.list(fixture.context, { limit: 1 })).toMatchObject({
            items: [{ id: old.bindingId }],
            next: null
        })
        expect((await saved.list(fixture.context, { protocol: 1 })).items).toHaveLength(2)
        await expect(saved.get(fixture.context, configured.bindingId)).rejects.toMatchObject({
            response: { code: 'PIPELINE_CLIENT_UPGRADE_REQUIRED' }
        })
        expect(await saved.get(fixture.context, configured.bindingId, { protocol: 1 })).toMatchObject({
            configuration: modern
        })
        const downgraded = { ...modern, template: { ...modern.template, hostRequirements: undefined } }
        await expect(
            fixture.start.configure(fixture.context, { requestId: randomUUID(), configuration: downgraded })
        ).rejects.toMatchObject({ response: { code: 'DEFINITION_VERSION_IMMUTABLE' } })
        expect(
            await fixture.db
                .getRepository(ProjectPipelineBindingEntity)
                .countBy({ projectId: fixture.context.projectId })
        ).toBe(2)
    })
    it('filters native budgets before pagination and requires catalog protocol 2 for exact reads', async () => {
        const saved = new ProjectPipelineBindingsService(
            fixture.db.getRepository(ProjectPipelineBindingEntity),
            fixture.module.get(ProjectAccessRuntimeService)
        )
        const old = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.configuration
        })
        const source = projectPipelineConfigurationSchema.parse({
            ...fixture.configuration,
            template: {
                ...fixture.configuration.template,
                version: '3.0.0',
                hostRequirements: { protocol: 1, features: { 'pipeline.native_model_budget': 1 } }
            },
            binding: {
                ...fixture.configuration.binding,
                templateRef: `${fixture.configuration.template.key}@3.0.0`,
                limits: {
                    ...fixture.configuration.binding.limits,
                    nativeModelBudget: { maxCalls: 2, maxTokens: 100, reservationTokens: 50 }
                }
            }
        })
        const current = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: source
        })
        for (const input of [{}, { protocol: 1 as const }]) {
            expect(await saved.list(fixture.context, { ...input, limit: 1 })).toMatchObject({
                items: [{ id: old.bindingId }],
                next: null
            })
            await expect(saved.get(fixture.context, current.bindingId, input)).rejects.toMatchObject({
                response: { code: 'PIPELINE_CLIENT_UPGRADE_REQUIRED' }
            })
        }
        const page = await saved.list(fixture.context, { protocol: 2, limit: 1 })
        expect(page).toMatchObject({
            items: [{ id: current.bindingId, configuration: source }],
            next: current.bindingId
        })
        expect(await saved.list(fixture.context, { protocol: 2, limit: 1, after: page.next! })).toMatchObject({
            items: [{ id: old.bindingId }],
            next: null
        })
        expect(await saved.get(fixture.context, current.bindingId, { protocol: 2 })).toMatchObject({
            configuration: source
        })
        expect(
            await fixture.db
                .getRepository(ProjectPipelineBindingEntity)
                .countBy({ projectId: fixture.context.projectId })
        ).toBe(2)
    })
    it('keeps a lost cancellation receipt pending, inspects without resending and never advances successors', async () => {
        const launched = await fixture.launch(),
            operation = (await fixture.operations())[0]
        fixture.execute.mockResolvedValueOnce({ status: 'pending', receiptKey: 'receipt-1' })
        await fixture.runner.run(fixture.context, operation.id)
        await fixture.lifecycle.cancel(fixture.context, await fixture.commandInput(launched.instanceId))
        fixture.cancel.mockRejectedValueOnce(new Error('Cancellation response lost'))
        await fixture.runner.run(fixture.context, operation.id)
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
        ).toMatchObject({
            state: 'cancelling'
        })
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown', cancelDispatchedAt: expect.any(Date) })
        await fixture.readyAgain(operation.id)
        await fixture.runner.run(fixture.context, operation.id)
        expect(fixture.cancel).toHaveBeenCalledTimes(1)
        expect(fixture.execute).toHaveBeenCalledTimes(1)
        expect(fixture.inspect).toHaveBeenCalledTimes(1)
        expect(await fixture.operations()).toHaveLength(2)
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
        ).toMatchObject({
            state: 'cancelled'
        })
        expect(
            await fixture.db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ sourceKey: operation.id })
        ).toMatchObject({ status: 'succeeded' })
        expect(
            await fixture.db
                .getRepository(ProjectPipelineDecisionEntity)
                .countBy({ projectId: fixture.context.projectId })
        ).toBe(0)
    })
    it('persists a normal user configuration without starting work and preserves genuine binding conflicts', async () => {
        await fixture.request(async () => {
            expect(RequestContext.currentApiPrincipal()).toBeNull()
            const requestId = randomUUID()
            const receipt = await fixture.start.configure(fixture.context, {
                requestId,
                configuration: fixture.configuration
            })
            const bindings = fixture.db.getRepository(ProjectPipelineBindingEntity)
            expect(await bindings.findOneByOrFail({ id: receipt.bindingId })).toMatchObject({
                revision: 1,
                createdById: fixture.context.actor.userId,
                configuration: fixture.configuration.binding
            })
            await expect(
                fixture.start.configure(fixture.context, {
                    requestId,
                    configuration: {
                        ...fixture.configuration,
                        binding: { ...fixture.configuration.binding, parameters: { changed: true } }
                    }
                })
            ).rejects.toMatchObject({ status: 409, response: { code: 'BINDING_REQUEST_CONFLICT' } })
            expect(await bindings.count()).toBe(1)
            expect((await bindings.findOneByOrFail({ id: receipt.bindingId })).configuration).toEqual(
                fixture.configuration.binding
            )
            expect(await fixture.operations()).toHaveLength(0)
        })
    })
    it.each(['client_secret', 'api_key'] as const)(
        'persists a scoped %s configuration but never widens it into background execution',
        async (principalType) => {
            const spy = jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
                id: fixture.context.actor.userId,
                tenantId: fixture.context.actor.tenantId,
                principalType,
                resourceScope: { kind: 'assistant', xpertId: fixture.assistantId }
            })
            try {
                const { bindingId } = await fixture.start.configure(fixture.context, {
                    requestId: randomUUID(),
                    configuration: fixture.configuration
                })
                expect(await fixture.operations()).toHaveLength(0)
                await expect(
                    fixture.start.start(fixture.context, {
                        bindingId,
                        objectKey: 'document',
                        triggerKey: 'trigger',
                        title: 'Document assessment'
                    })
                ).rejects.toMatchObject({
                    status: 403,
                    response: { code: 'PIPELINE_SCOPED_DELEGATION_UNAVAILABLE' }
                })
            } finally {
                spy.mockRestore()
            }
            expect(await fixture.operations()).toHaveLength(0)
            expect(await fixture.db.getRepository(ProjectPipelineDefinitionEntity).count()).toBe(1)
            expect(await fixture.db.getRepository(ProjectPipelineBindingEntity).count()).toBe(1)
        }
    )
    it('persists native identity and input before dispatch, then links the original runtime attempt after recovery', async () => {
        await fixture.launchAssistant()
        const operation = (await fixture.operations())[0]
        fixture.nativeStart.mockImplementationOnce(async (input) => {
            const saved = await fixture.db
                .getRepository(ProjectPipelineOperationEntity)
                .createQueryBuilder('operation')
                .addSelect('operation.assistantIntent')
                .where({ id: operation.id })
                .getOneOrFail()
            expect(saved.assistantIntent).toMatchObject({
                executionId: operation.id,
                input: { prompt: 'Assess the pinned document' }
            })
            expect(saved.dispatchStartedAt).toBeInstanceOf(Date)
            expect(input).toMatchObject({
                projectId: fixture.context.projectId,
                executionId: operation.id,
                clientMessageId: operation.id,
                xpertId: fixture.assistantId
            })
            throw new Error('Response lost after native acceptance')
        })
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(
            await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'unknown' })
        await fixture.readyAgain(operation.id)
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        expect(fixture.nativeStart).toHaveBeenCalledTimes(1)
        expect(fixture.nativeStatus).toHaveBeenCalledTimes(1)
        expect(fixture.prepare).toHaveBeenCalledTimes(1)
        const completed = await fixture.db
            .getRepository(ProjectPipelineOperationEntity)
            .findOneByOrFail({ id: operation.id })
        expect(completed.state).toBe('accepted')
        expect(
            await fixture.db.getRepository(XpertProjectTaskExecution).findOneByOrFail({ sourceKey: operation.id })
        ).toMatchObject({
            agentExecutionId: operation.id,
            xpertId: fixture.assistantId,
            status: 'succeeded',
            startedAt: completed.dispatchStartedAt,
            completedAt: completed.terminalObservedAt,
            conversationId: fixture.nativeStatus.mock.calls[0][0].conversationId
        })
    })
    it('uses explicit terminal disposition for a new-subject wait without interpreting the outcome name', async () => {
        fixture.evaluate.mockResolvedValue({ status: 'decided', outcome: 'revise', evidence: [] })
        const launched = await fixture.launch()
        for (const operation of await fixture.operations()) await fixture.runner.run(fixture.context, operation.id)
        await fixture.runner.run(fixture.context, (await fixture.operations()).find((row) => row.kind === 'policy')!.id)
        expect(
            await fixture.db.getRepository(ProjectPipelineRoundEntity).findOneByOrFail({ id: launched.roundId })
        ).toMatchObject({ state: 'awaiting_new_subject' })
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
        ).toMatchObject({
            state: 'waiting'
        })
    })
    it('serializes concurrent launches and rejects a second active trigger', async () => {
        const { bindingId } = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.configuration
        })
        const request = { bindingId, objectKey: 'document', triggerKey: 'trigger', title: 'Assessment' }
        const results = await Promise.all([
            fixture.start.start(fixture.context, request),
            fixture.start.start(fixture.context, request)
        ])
        expect(results[0].runId).toBe(results[1].runId)
        expect(await fixture.operations()).toHaveLength(2)
        await expect(fixture.start.start(fixture.context, { ...request, triggerKey: 'another' })).rejects.toMatchObject(
            {
                response: { code: 'ACTIVE_RUN_EXISTS' }
            }
        )
        await Promise.all([
            fixture.coordinator.advance(fixture.context, results[0].instanceId),
            fixture.coordinator.advance(fixture.context, results[0].instanceId)
        ])
        expect(await fixture.operations()).toHaveLength(2)
    })
    it('authorizes an exact human gate decision, rejects stale versions, and records an idempotent decision', async () => {
        const gate = fixture.humanGateConfiguration()
        const { bindingId } = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: gate
        })
        const launched = await fixture.start.start(fixture.context, {
            bindingId,
            objectKey: 'document',
            triggerKey: 'human',
            title: 'Human decision'
        })
        const attention = await fixture.db
            .getRepository(ProjectPipelineAttentionEntity)
            .findOneByOrFail({ projectId: fixture.context.projectId, kind: 'human' })
        const input = {
            requestId: randomUUID(),
            attentionId: attention.id,
            expectedRevision: attention.revision,
            inputDigest: attention.inputDigest,
            generation: attention.generation,
            outcome: 'accept',
            evidence: []
        }
        fixture.authorizeDecision.mockResolvedValueOnce(false)
        await expect(fixture.decisions.decide(fixture.context, input)).rejects.toMatchObject({
            response: { code: 'DECISION_NOT_AUTHORIZED' }
        })
        await expect(fixture.decisions.decide(fixture.context, { ...input, generation: 99 })).rejects.toMatchObject({
            response: { code: 'DECISION_VERSION_CONFLICT' }
        })
        fixture.checkCurrent.mockResolvedValueOnce(false)
        await expect(fixture.decisions.decide(fixture.context, input)).rejects.toMatchObject({
            response: { code: 'SUBJECT_SUPERSEDED' }
        })
        const waitStatistics = (waiting: string[]) =>
            readPipelineHumanWaitStatistics(
                fixture.db.manager,
                fixture.context,
                [launched.instanceId],
                waiting,
                { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 1000).toISOString() },
                new Date(Date.now() + 1000).toISOString()
            )
        expect(await waitStatistics([attention.nodeInstanceId])).toMatchObject({
            intervals: 1,
            ongoing: 1,
            coverage: { snapshots: 1 }
        })
        await fixture.db.query(
            `ALTER TABLE xpert_project_pipeline_event ADD CONSTRAINT wait_decision_failure CHECK (jsonb_array_length(payload->'humanWaitSnapshot'->'nodeIds') > 0) NOT VALID`
        )
        await expect(fixture.decisions.decide(fixture.context, input)).rejects.toThrow()
        expect(
            await fixture.db
                .getRepository(ProjectPipelineDecisionEntity)
                .countBy({ projectId: fixture.context.projectId })
        ).toBe(0)
        expect((await waitStatistics([attention.nodeInstanceId])).coverage.snapshots).toBe(1)
        await fixture.db.query('ALTER TABLE xpert_project_pipeline_event DROP CONSTRAINT wait_decision_failure')
        const first = await fixture.decisions.decide(fixture.context, input)
        const completedWait = await waitStatistics([])
        expect(completedWait).toMatchObject({
            intervals: 1,
            ongoing: 0,
            coverage: { missingEvents: 0, invalidEvents: 0 }
        })
        expect(await fixture.decisions.decide(fixture.context, input)).toEqual(first)
        expect((await waitStatistics([])).coverage.snapshots).toBe(completedWait.coverage.snapshots)
        expect(
            await fixture.db
                .getRepository(ProjectPipelineDecisionEntity)
                .countBy({ projectId: fixture.context.projectId })
        ).toBe(1)
        expect(fixture.execute).not.toHaveBeenCalled()
        const downstream = (await fixture.operations())[0]
        expect(downstream.context.inputs.approval).toMatchObject({
            kind: 'evidence',
            value: { resolverRef: 'platform.pipeline-decision@1', schemaRef: 'platform.human-decision@1' }
        })
        await fixture.runner.run(fixture.context, downstream.id)
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
        ).toMatchObject({
            state: 'completed'
        })
        expect(fixture.authorizeDecision).toHaveBeenCalledWith(
            expect.objectContaining({ actor: fixture.context.actor }),
            {
                candidateSelectionKey: 'authorized_owners',
                outcome: 'accept',
                evidence: []
            }
        )
        expect(fixture.execute).toHaveBeenCalledTimes(1)
    })
}
