import { randomUUID } from 'node:crypto'
import i18next from 'i18next'
import en from '../../../i18n/en.json'
import { DataSource } from 'typeorm'
import { AgentInvocationScope, RequestContext } from '@xpert-ai/plugin-sdk'
import { ProjectTaskDecisionInput, ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { TypeOrmAgentInvocationStore } from '../../../agent-invocation/typeorm-invocation.store'
import { AgentInvocationFactoryService } from '../../../agent-invocation/invocation-factory.service'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectTaskDecisionService } from '../project-task-decision.service'
import { ProjectTaskDispatchService } from '../project-task-dispatch.service'
import { ProjectTaskCaller } from '../project-task-dispatch.schema'
import { ProjectTaskRuntimeContextService } from '../project-task-runtime-context.service'
import { ProjectRuntimeObservationHandler } from '../project-runtime-observation.handler'
import { ProjectRuntimeObservationCommand } from '../../../handoff/runtime-messaging/runtime-message.commands'
import { ReadProjectTaskAcceptanceHandler } from '../../commands/handlers/read-project-task-acceptance.handler'
import { ReadProjectTaskAcceptanceCommand } from '../../commands/read-project-task-acceptance.command'

export type Fixture = {
    database: DataSource
    store: TypeOrmAgentInvocationStore
    service: ProjectTaskDispatchService
    factory: AgentInvocationFactoryService
    scope: AgentInvocationScope
    caller: ProjectTaskCaller
    input: ProjectTaskDispatchInput
    context: ProjectTaskRuntimeContextService
}

export function projectTaskDecisionCases(fixture: () => Fixture) {
    describe('business acceptance and independent review', () => {
        let f: Fixture, decisions: ProjectTaskDecisionService
        let verifyCandidate: jest.SpyInstance<Promise<boolean>, [AgentInvocationScope, string]>
        beforeAll(async () => { await i18next.init({ lng: 'en', resources: { en: { 'server-ai': en } } }) })
        beforeEach(() => {
            f = fixture()
            jest.spyOn(f.context, 'actor').mockImplementation(() => f.scope)
            const access = Object.assign(
                Object.create(XpertProjectAccessService.prototype) as XpertProjectAccessService,
                { assertCanEdit: jest.fn() }
            )
            verifyCandidate = jest.spyOn(f.factory, 'verifyExecutionReview').mockResolvedValue(true)
            // Model an execution-capable host without enabling any OS provider or importing a Pro environment.
            const resolveReviewTarget = f.factory.resolveReviewTarget.bind(f.factory)
            jest.spyOn(f.factory, 'resolveReviewTarget').mockImplementation((scope, bindingId, mode) =>
                mode === 'execution' ? f.factory.resolveBackgroundTarget(scope, bindingId) : resolveReviewTarget(scope, bindingId, mode))
            jest.spyOn(f.factory, 'createExecutionReviewPrompt').mockReturnValue('Independent execution-review fixture instructions')
            decisions = new ProjectTaskDecisionService(
                f.database.getRepository(XpertProjectTask),
                access,
                f.context,
                f.factory
            )
        })
        async function finish(invocationId: string, text = 'Implementation with checks', status: 'succeeded' | 'failed' = 'succeeded') {
            const saved = await f.store.read(invocationId, f.scope)
            const invocation = {
                ...saved.invocation,
                status,
                result: { text },
                revision: saved.invocation.revision + 1,
                updatedAt: new Date().toISOString()
            }
            await f.store.replace({ ...saved, invocation }, saved.invocation.revision)
            return invocation
        }
        async function implemented(): Promise<ProjectTaskDecisionInput> {
            const receipt = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
            const invocation = await finish(receipt.invocationId)
            await f.database.getRepository(XpertProjectTask).update({ id: f.input.taskId }, { status: 'review' })
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: f.input.taskId })
            const attempt = await f.database
                .getRepository(XpertProjectTaskExecution)
                .findOneBy({ id: receipt.taskExecutionId })
            return {
                requestId: randomUUID(),
                taskId: task.id,
                expectedRevision: task.revision,
                implementationExecutionId: attempt.id,
                specificationDigest: attempt.specificationSnapshot.digest,
                evidence: [{ type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision }],
                outcome: 'accept',
                rationale: 'Checked exact implementation',
                checks: ['Inspected test evidence']
            }
        }
        async function assignExecutionReviewer() {
            const binding = await f.database.getRepository(AgentRuntimeBindingEntity).findOneBy({ id: f.input.bindingId })
            const id = randomUUID()
            await f.database.getRepository(AgentRuntimeBindingEntity).save({
                ...binding, id,
                target: { ...binding.target, bindingId: id, provider: 'test', configuration: {} }
            })
            f.input = { ...f.input, purpose: { type: 'implementation', reviewer: { bindingId: id, mode: 'execution' } } }
            return id
        }
        async function executeReview(input: ProjectTaskDecisionInput, bindingId: string,
            verdict: 'pass' | 'changes_required' | 'indeterminate', reviewAsSubtask = false) {
            const purpose = {
                type: 'review' as const, mode: 'execution' as const, candidatePaths: ['plugin'],
                implementationExecutionId: input.implementationExecutionId,
                implementationInvocationId: input.evidence[0].type === 'invocation_result' ? input.evidence[0].invocationId : '',
                specificationDigest: input.specificationDigest, evidence: input.evidence
            }
            const receipt = await f.service.dispatch(f.scope.projectId, {
                ...f.input, bindingId, requestId: randomUUID(), expectedRevision: input.expectedRevision, purpose, reviewAsSubtask
            }, f.caller)
            if (reviewAsSubtask) {
                const row = await f.store.read(receipt.invocationId, f.scope)
                const replay = await f.service.dispatch(f.scope.projectId, {
                    ...f.input, bindingId, requestId: row.invocation.request.dispatch.requestId,
                    expectedRevision: input.expectedRevision, purpose, reviewAsSubtask
                }, f.caller)
                expect(replay.taskExecutionId).toBe(receipt.taskExecutionId)
                expect(replay.projectTaskId).toBe(receipt.projectTaskId)
            }
            const row = await f.store.read(receipt.invocationId, f.scope)
            expect(row.invocation.request.input.prompt).toContain('Independent execution-review fixture instructions')
            expect(row.invocation.request.input.prompt).not.toContain('All tools are disabled')
            const report = {
                version: 2, mode: 'execution', verdict,
                implementationInvocationId: purpose.implementationInvocationId,
                specificationDigest: purpose.specificationDigest, evidence: purpose.evidence,
                summary: 'Independent host invocation',
                checks: [{ description: 'Invoke installed plugin', outcome: verdict === 'pass' ? 'passed' : 'failed',
                    command: 'fixture-host invoke', expected: 'registered tool', actual: verdict === 'pass' ? 'tool returned' : 'tool missing' }],
                findings: verdict === 'pass' ? [] : [{ id: 'F1', kind: verdict === 'indeterminate' ? 'environment' : 'defect',
                    blocking: true, description: 'Plugin tool is unavailable', reproduction: 'Install and invoke tool',
                    expected: 'Registered tool', actual: 'Tool missing' }],
                limitations: []
            }
            await finish(receipt.invocationId, JSON.stringify(report))
            return receipt
        }
        async function summaryParent() {
            const repo = f.database.getRepository(XpertProjectTask)
            const implementation = await repo.findOneBy({ id: f.input.taskId })
            const parent = await repo.save(repo.create({ ...implementation, id: randomUUID(),
                kind: 'summary', name: 'Delivery', title: 'Delivery', requirements: ['Deliver the verified candidate'] }))
            await repo.update({ id: implementation.id }, { parentTaskId: parent.id })
            f.input.expectedRevision = (await repo.findOneBy({ id: implementation.id })).revision
            return parent
        }
        async function projectReview(invocationId: string) {
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(f.scope.userId)
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(f.scope.tenantId)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(f.scope.organizationId)
            await new ProjectRuntimeObservationHandler(f.database).execute(new ProjectRuntimeObservationCommand(invocationId))
        }
        it.each(['pass', 'changes_required', 'indeterminate'] as const)(
            'completes the independent review work item with %s without completing its delivery', async (verdict) => {
                const binding = await assignExecutionReviewer()
                const input = await implemented()
                const receipt = await executeReview(input, binding, verdict, true)
                expect(receipt.projectTaskId).not.toBe(input.taskId)
                await projectReview(receipt.invocationId)
                const child = await f.database.getRepository(XpertProjectTask).findOneBy({ id: receipt.projectTaskId })
                expect(child).toMatchObject({ status: 'done', parentTaskId: input.taskId,
                    reviewSubject: { implementationTaskId: input.taskId, implementationExecutionId: input.implementationExecutionId } })
                expect((await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe('review')
                const decision = decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: receipt.taskExecutionId }, f.caller)
                if (verdict === 'pass') await expect(decision).resolves.toMatchObject({ outcome: 'accept' })
                else await expect(decision).rejects.toThrow()
            })
        it('blocks malformed report delivery without accepting the review or losing the candidate', async () => {
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const review = await executeReview(input, binding, 'pass', true)
            await finish(review.invocationId, 'not a review report')
            await projectReview(review.invocationId)
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: review.projectTaskId })
            expect(task.status).toBe('blocked')
            const retry = await executeReview(input, binding, 'pass', true)
            expect(retry.projectTaskId).toBe(review.projectTaskId)
        })
        it('reuses the review task for the same candidate and fences an older review attempt', async () => {
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const first = await executeReview(input, binding, 'pass', true)
            await projectReview(first.invocationId)
            const second = await executeReview(input, binding, 'pass', true)
            expect(second.projectTaskId).toBe(first.projectTaskId)
            expect(second.taskExecutionId).not.toBe(first.taskExecutionId)
            await expect(decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: first.taskExecutionId }, f.caller)).rejects.toThrow()
            await expect(decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: second.taskExecutionId }, f.caller)).resolves.toMatchObject({ outcome: 'accept' })
        })
        it('accepts a summary only with its pinned implementation and independently reviewed sibling', async () => {
            const parent = await summaryParent()
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const review = await executeReview(input, binding, 'pass', true)
            const child = await f.database.getRepository(XpertProjectTask).findOneBy({ id: review.projectTaskId })
            expect(child.parentTaskId).toBe(parent.id)
            await expect(decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: review.taskExecutionId }, f.caller)).resolves.toMatchObject({ outcome: 'accept' })
            expect((await f.database.getRepository(XpertProjectTask).findOneBy({ id: parent.id })).status).not.toBe('done')
            await expect(decisions.decide(f.scope.projectId, { ...input, taskId: parent.id,
                expectedRevision: parent.revision, reviewExecutionId: review.taskExecutionId }, f.caller)).resolves.toMatchObject({ outcome: 'accept' })
            expect((await f.database.getRepository(XpertProjectTask).findOneBy({ id: parent.id })).status).toBe('done')
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(f.scope.userId)
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(f.scope.tenantId)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(f.scope.organizationId)
            const reader = new ReadProjectTaskAcceptanceHandler(f.database.getRepository(XpertProjectTask),
                Object.assign(Object.create(XpertProjectAccessService.prototype) as XpertProjectAccessService,
                    { assertCanRead: jest.fn() }))
            expect(await reader.execute(new ReadProjectTaskAcceptanceCommand({ actor: f.scope, projectId: f.scope.projectId }, parent.id)))
                .toMatchObject({ taskId: parent.id, decisionId: input.requestId, review: { verdict: 'pass' } })
        })
        it('rejects summary requirement drift and cross-parent implementation substitution', async () => {
            const parent = await summaryParent()
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const review = await executeReview(input, binding, 'pass', true)
            const repo = f.database.getRepository(XpertProjectTask)
            await repo.update({ id: parent.id }, { requirements: ['A changed requirement'] })
            const current = await repo.findOneBy({ id: parent.id })
            await expect(decisions.decide(f.scope.projectId, { ...input, taskId: parent.id,
                expectedRevision: current.revision, reviewExecutionId: review.taskExecutionId }, f.caller)).rejects.toThrow()
            const other = await repo.save(repo.create({ ...current, id: randomUUID() }))
            await expect(decisions.decide(f.scope.projectId, { ...input, taskId: other.id,
                expectedRevision: other.revision, reviewExecutionId: review.taskExecutionId }, f.caller)).rejects.toThrow()
        })
        it('keeps feedback-linked rework in the implementation task and creates a new candidate review', async () => {
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const first = await executeReview(input, binding, 'changes_required', true)
            await decisions.decide(f.scope.projectId, { ...input, outcome: 'rework', reviewExecutionId: first.taskExecutionId }, f.caller)
            const current = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            f.input = { ...f.input, requestId: randomUUID(), expectedRevision: current.revision,
                purpose: { type: 'implementation', reviewer: { bindingId: binding, mode: 'execution' },
                    rework: { reviewExecutionId: first.taskExecutionId, findingIds: ['F1'] } } }
            const next = await implemented()
            const second = await executeReview(next, binding, 'pass', true)
            expect(second.projectTaskId).not.toBe(first.projectTaskId)
            await expect(decisions.decide(f.scope.projectId, { ...next, reviewExecutionId: first.taskExecutionId }, f.caller)).rejects.toThrow()
            await expect(decisions.decide(f.scope.projectId, { ...next, reviewExecutionId: second.taskExecutionId }, f.caller)).resolves.toMatchObject({ outcome: 'accept' })
        })
        it('requires the assigned reviewer and preserves that assignment across retries', async () => {
            await assignExecutionReviewer()
            const input = await implemented()
            await expect(decisions.decide(f.scope.projectId, input, f.caller)).rejects.toThrow()
            await decisions.decide(f.scope.projectId, { ...input, outcome: 'rework' }, f.caller)
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            await expect(f.service.dispatch(f.scope.projectId, {
                ...f.input, requestId: randomUUID(), expectedRevision: task.revision, purpose: { type: 'implementation' }
            }, f.caller)).rejects.toThrow()
        })
        for (const verdict of ['pass', 'changes_required', 'indeterminate'] as const) {
            it(`uses executable review ${verdict} without accepting failed or blocked checks`, async () => {
                const binding = await assignExecutionReviewer()
                const input = await implemented()
                const receipt = await executeReview(input, binding, verdict)
                const decision = { ...input, reviewExecutionId: receipt.taskExecutionId }
                if (verdict === 'pass') {
                    const accepted = await decisions.decide(f.scope.projectId, decision, f.caller)
                    expect(accepted.outcome).toBe('accept')
                    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(f.scope.userId)
                    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(f.scope.tenantId)
                    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(f.scope.organizationId)
                    const reader = new ReadProjectTaskAcceptanceHandler(f.database.getRepository(XpertProjectTask),
                        Object.assign({} as XpertProjectAccessService, { assertCanRead: jest.fn() }))
                    expect(await reader.execute(new ReadProjectTaskAcceptanceCommand({ actor: f.scope, projectId: f.scope.projectId }, input.taskId)))
                        .toMatchObject({ decisionId: input.requestId, review: { mode: 'execution', verdict: 'pass' } })
                    await expect(reader.execute(new ReadProjectTaskAcceptanceCommand({ actor: { ...f.scope, tenantId: randomUUID() },
                        projectId: f.scope.projectId }, input.taskId))).rejects.toThrow()
                    await f.database.getRepository(XpertProjectTask).update({ id: input.taskId }, { status: 'review' })
                    await expect(reader.execute(new ReadProjectTaskAcceptanceCommand({ actor: f.scope, projectId: f.scope.projectId }, input.taskId))).resolves.toBeNull()
                    await f.database.getRepository(XpertProjectTask).update({ id: input.taskId }, { status: 'done' })
                    verifyCandidate.mockResolvedValue(false)
                    expect(await decisions.decide(f.scope.projectId, decision, f.caller)).toEqual(accepted)
                    expect(verifyCandidate).toHaveBeenCalledTimes(1)
                } else {
                    await expect(decisions.decide(f.scope.projectId, decision, f.caller)).rejects.toThrow()
                }
            })
        }
        it('refuses acceptance when the candidate changed after executable review', async () => {
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const review = await executeReview(input, binding, 'pass')
            verifyCandidate.mockResolvedValue(false)
            await expect(decisions.decide(f.scope.projectId, {
                ...input, reviewExecutionId: review.taskExecutionId
            }, f.caller)).rejects.toThrow()
            expect((await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe('review')
        })
        it('identifies an unreadable review before Runtime verification and preserves the pending task', async () => {
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const review = await executeReview(input, binding, 'pass')
            await finish(review.invocationId, 'A pass report exists on disk, but the result is not the review protocol')
            await expect(decisions.decide(f.scope.projectId, {
                ...input, reviewExecutionId: review.taskExecutionId
            }, f.caller)).rejects.toThrow('invalid_json')
            expect(verifyCandidate).not.toHaveBeenCalled()
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            expect(task.status).toBe('review')
            expect(task.decisions ?? []).toHaveLength(0)
        })
        it('reports an object summary and extra report fields without Runtime verification or accepting the task', async () => {
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const review = await executeReview(input, binding, 'pass')
            const row = await f.store.read(review.invocationId, f.scope)
            const report: unknown = JSON.parse(row.invocation.result.text)
            if (!report || typeof report !== 'object') throw new Error('Invalid report fixture')
            await finish(review.invocationId, '```xpert-task-result\n' + JSON.stringify({ version: 1,
                summary: { ...report, implementationExecutionId: input.implementationExecutionId, candidateSnapshot: {} }, items: []
            }) + '\n```')
            await expect(decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: review.taskExecutionId }, f.caller))
                .rejects.toThrow(/outer_envelope_invalid.*summary.*implementationExecutionId.*candidateSnapshot/)
            expect(verifyCandidate).not.toHaveBeenCalled()
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            expect(task.status).toBe('review')
            expect(task.decisions ?? []).toHaveLength(0)
        })
        it('persists exact feedback, dispatches rework, and requires a new review for the new candidate', async () => {
            const binding = await assignExecutionReviewer()
            const input = await implemented()
            const review = await executeReview(input, binding, 'changes_required')
            await decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: review.taskExecutionId,
                outcome: 'rework', rationale: 'Fix the missing registration reported in F1' }, f.caller)
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            const rework = { ...f.input, requestId: randomUUID(), expectedRevision: task.revision,
                purpose: { type: 'implementation' as const, reviewer: { bindingId: binding, mode: 'execution' as const },
                    rework: { reviewExecutionId: review.taskExecutionId, findingIds: ['F1'] } } }
            await expect(f.service.dispatch(f.scope.projectId, { ...rework, purpose: { ...rework.purpose,
                rework: { reviewExecutionId: review.taskExecutionId, findingIds: ['invented'] } } }, f.caller)).rejects.toThrow()
            const interrupted = await f.service.dispatch(f.scope.projectId, rework, f.caller)
            await finish(interrupted.invocationId, 'Environment failed before the repair finished', 'failed')
            const retryTask = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            const next = await f.service.dispatch(f.scope.projectId, {
                ...rework, requestId: randomUUID(), expectedRevision: retryTask.revision
            }, f.caller)
            const invocation = await finish(next.invocationId, 'Registered tool and regression check')
            expect(invocation.request.input.prompt).toContain('Plugin tool is unavailable')
            expect(invocation.request.input.prompt).toContain('F1')
            await f.database.getRepository(XpertProjectTask).update({ id: input.taskId }, { status: 'review' })
            const current = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            const nextDecision: ProjectTaskDecisionInput = { ...input, requestId: randomUUID(),
                expectedRevision: current.revision, implementationExecutionId: next.taskExecutionId,
                evidence: [{ type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision }] }
            await expect(decisions.decide(f.scope.projectId, {
                ...nextDecision, reviewExecutionId: review.taskExecutionId
            }, f.caller)).rejects.toThrow()
            const finalReview = await executeReview(nextDecision, binding, 'pass')
            const finalRun = await f.store.read(finalReview.invocationId, f.scope)
            expect(finalRun.invocation.request.input.prompt).toContain('Previous independent feedback')
            expect(finalRun.invocation.request.input.prompt).toContain('Plugin tool is unavailable')
            await decisions.decide(f.scope.projectId, { ...nextDecision, reviewExecutionId: finalReview.taskExecutionId }, f.caller)
            const accepted = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            expect(accepted.status).toBe('done')
            expect(accepted.decisions.map((item) => item.outcome)).toEqual(['rework', 'accept'])
            expect(await f.database.getRepository(XpertProjectTaskExecution).countBy({ taskId: input.taskId })).toBe(5)
        })
        it('commits decision and task status once; retry preserves the original result', async () => {
            const input = await implemented()
            const result = await decisions.decide(f.scope.projectId, input, f.caller)
            expect(result.outcome).toBe('accept')
            expect(await decisions.decide(f.scope.projectId, input, f.caller)).toEqual(result)
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: f.input.taskId })
            expect(task.status).toBe('done')
            expect(task.decisions).toHaveLength(1)
            await expect(
                decisions.decide(f.scope.projectId, { ...input, rationale: 'changed' }, f.caller)
            ).rejects.toThrow()
        })
        it('one concurrent decision wins the task revision', async () => {
            const input = await implemented()
            const results = await Promise.allSettled([
                decisions.decide(f.scope.projectId, input, f.caller),
                decisions.decide(f.scope.projectId, { ...input, requestId: randomUUID(), outcome: 'rework' }, f.caller)
            ])
            expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
        })
        it('rejects changed specifications even with the current generic revision', async () => {
            const input = await implemented()
            await f.database
                .getRepository(XpertProjectTask)
                .update({ id: input.taskId }, { requirements: ['New requirements'] })
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            await expect(
                decisions.decide(f.scope.projectId, { ...input, expectedRevision: task.revision }, f.caller)
            ).rejects.toThrow()
        })
        it('rejects old result revisions and another responsible caller', async () => {
            const input = await implemented()
            await expect(
                decisions.decide(
                    f.scope.projectId,
                    {
                        ...input,
                        evidence: [{ type: 'invocation_result', invocationId: f.input.requestId, revision: 0 }]
                    },
                    f.caller
                )
            ).rejects.toThrow()
            const original = f.scope.callerAgentKey
            f.scope.callerAgentKey = 'other-agent'
            await expect(decisions.decide(f.scope.projectId, input, f.caller)).rejects.toThrow()
            f.scope.callerAgentKey = original
        })
        it('keeps rework history and rejects acceptance of an older implementation', async () => {
            const input = await implemented()
            await decisions.decide(f.scope.projectId, { ...input, outcome: 'rework' }, f.caller)
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            expect(task.status).toBe('todo')
            const next = await f.service.dispatch(
                f.scope.projectId,
                { ...f.input, requestId: randomUUID(), expectedRevision: task.revision },
                f.caller
            )
            await finish(next.invocationId)
            await f.database.getRepository(XpertProjectTask).update({ id: input.taskId }, { status: 'review' })
            const latest = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            await expect(
                decisions.decide(
                    f.scope.projectId,
                    { ...input, requestId: randomUUID(), expectedRevision: latest.revision },
                    f.caller
                )
            ).rejects.toThrow()
            expect(latest.decisions).toHaveLength(1)
        })
        for (const verdict of ['pass', 'changes_required', 'indeterminate', 'prose'] as const) {
            it(`independent review ${verdict} cannot silently complete the task`, async () => {
                const input = await implemented()
                const binding = await f.database
                    .getRepository(AgentRuntimeBindingEntity)
                    .findOneBy({ id: f.input.bindingId })
                binding.target = {
                    ...binding.target,
                    provider: 'opencode',
                    configuration: { executionEnvironment: { type: 'computer' } }
                }
                await f.database.getRepository(AgentRuntimeBindingEntity).save(binding)
                // The implementation keeps its original binding snapshot; use a separate review binding.
                const reviewBindingId = randomUUID()
                await f.database.getRepository(AgentRuntimeBindingEntity).save({
                    ...binding,
                    id: reviewBindingId,
                    target: { ...binding.target, bindingId: reviewBindingId }
                })
                binding.target = { ...binding.target, provider: 'test', configuration: {} }
                await f.database.getRepository(AgentRuntimeBindingEntity).save(binding)
                const purpose = {
                    type: 'review' as const,
                    implementationExecutionId: input.implementationExecutionId,
                    implementationInvocationId:
                        input.evidence[0].type === 'invocation_result' ? input.evidence[0].invocationId : '',
                    specificationDigest: input.specificationDigest,
                    evidence: input.evidence
                }
                const receipt = await f.service.dispatch(
                    f.scope.projectId,
                    {
                        ...f.input,
                        bindingId: reviewBindingId,
                        requestId: randomUUID(),
                        expectedRevision: input.expectedRevision,
                        purpose
                    },
                    f.caller
                )
                const row = await f.database
                    .getRepository(AgentInvocationEntity)
                    .findOneBy({ id: receipt.invocationId })
                expect(row.invocation.request.input.prompt).toContain('All tools are disabled')
                expect(row.invocation.request.dispatch.projectTask.purpose).toEqual(purpose)
                await finish(
                    receipt.invocationId,
                    verdict === 'prose'
                        ? 'Everything passed'
                        : JSON.stringify({
                              version: 1,
                              verdict,
                              specificationDigest: purpose.specificationDigest,
                              implementationInvocationId: purpose.implementationInvocationId,
                              evidence: purpose.evidence,
                              findings: ['Reviewed supplied tests'],
                              limitations: ['No independent execution']
                          })
                )
                expect((await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe(
                    'review'
                )
                await expect(decisions.decide(f.scope.projectId, input, f.caller)).rejects.toThrow()
                const decision = decisions.decide(
                    f.scope.projectId,
                    { ...input, reviewExecutionId: receipt.taskExecutionId },
                    f.caller
                )
                if (verdict === 'pass') await expect(decision).resolves.toMatchObject({ outcome: 'accept' })
                else await expect(decision).rejects.toThrow()
            })
        }
    })
}
