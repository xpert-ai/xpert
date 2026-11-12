import { randomUUID } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ProjectTaskDecisionInput, type ProjectTaskExecutionReviewReport } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectTaskDecisionService } from '../project-task-decision.service'
import type { Fixture } from './project-task-decision.cases'
import { ProjectRuntimeObservationHandler } from '../project-runtime-observation.handler'
import { ProjectRuntimeObservationCommand } from '../../../handoff/runtime-messaging/runtime-message.commands'
import { projectTaskRuntimeError } from '../project-task-runtime.errors'
export function projectTaskCoordinationCases(fixture: () => Fixture) {
    describe('independent review task coordination', () => {
        let f: Fixture, decisions: ProjectTaskDecisionService
        beforeEach(() => {
            f = fixture()
            jest.spyOn(f.context, 'actor').mockImplementation(() => f.scope)
            const access = Object.assign(
                Object.create(XpertProjectAccessService.prototype) as XpertProjectAccessService,
                { assertCanEdit: jest.fn() }
            )
            decisions = new ProjectTaskDecisionService(
                f.database.getRepository(XpertProjectTask),
                access,
                f.context,
                f.factory,
                f.reviews
            )
        })
        async function finish(invocationId: string, text = 'Implementation with checks') {
            const saved = await f.store.read(invocationId, f.scope)
            const invocation = {
                ...saved.invocation,
                status: 'succeeded' as const,
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
        async function reviewer(assign = true) {
            const repo = f.database.getRepository(AgentRuntimeBindingEntity)
            const binding = await repo.findOneBy({ id: f.input.bindingId })
            const id = randomUUID()
            await repo.save({ ...binding, id, target: { ...binding.target, bindingId: id, provider: 'opencode',
                configuration: { executionEnvironment: { type: 'computer' } } } })
            if (assign) f.input = { ...f.input, purpose: { type: 'implementation', reviewer: { bindingId: id, mode: 'evidence_only' } } }
            return id
        }
        async function summaryParent() {
            const repo = f.database.getRepository(XpertProjectTask)
            const implementation = await repo.findOneBy({ id: f.input.taskId })
            const parent = await repo.save(repo.create({ ...implementation, id: randomUUID(), kind: 'summary',
                name: 'Delivery', title: 'Delivery', requirements: ['Deliver the verified candidate'] }))
            await repo.update({ id: implementation.id }, { parentTaskId: parent.id })
            f.input.expectedRevision = (await repo.findOneBy({ id: implementation.id })).revision
            return parent
        }
        async function observe(invocationId: string) {
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(f.scope.userId)
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(f.scope.tenantId)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(f.scope.organizationId)
            await new ProjectRuntimeObservationHandler(f.database).execute(new ProjectRuntimeObservationCommand(invocationId))
        }
        async function review(input: ProjectTaskDecisionInput, bindingId: string, verdict = 'pass') {
            const purpose = { type: 'review' as const, implementationExecutionId: input.implementationExecutionId,
                implementationInvocationId: input.evidence[0].type === 'invocation_result' ? input.evidence[0].invocationId : '',
                specificationDigest: input.specificationDigest, evidence: input.evidence }
            const request = { ...f.input, bindingId, requestId: randomUUID(), expectedRevision: input.expectedRevision,
                purpose, reviewAsSubtask: true }
            const receipt = await f.service.dispatch(f.scope.projectId, request, f.caller)
            expect((await f.service.dispatch(f.scope.projectId, request, f.caller)).taskExecutionId).toBe(receipt.taskExecutionId)
            expect(receipt.projectTaskId).not.toBe(input.taskId)
            const text = verdict === 'malformed' ? 'Everything passed' : JSON.stringify({ version: 1, verdict,
                implementationInvocationId: purpose.implementationInvocationId, specificationDigest: purpose.specificationDigest,
                evidence: purpose.evidence, findings: ['Review observations'], limitations: ['Evidence only'] })
            await finish(receipt.invocationId, text)
            await observe(receipt.invocationId)
            return receipt
        }
        const task = (id: string) => f.database.getRepository(XpertProjectTask).findOneBy({ id })

        async function feedbackDecision() {
            const input = await implemented(), binding = await reviewer(false)
            const receipt = await review(input, binding, 'changes_required')
            const saved = await f.store.read(receipt.invocationId, f.scope)
            const dispatch = saved.invocation.request.dispatch, reference = dispatch?.projectTask
            if (reference?.purpose.type !== 'review') throw new Error('Expected review fixture')
            // Seed a historical report from an execution-capable host. This does not enable execution review in OS.
            const purpose = { ...reference.purpose, mode: 'execution' as const, candidatePaths: ['src'] }
            const report: ProjectTaskExecutionReviewReport = {
                version: 2, mode: 'execution', verdict: 'changes_required',
                implementationInvocationId: purpose.implementationInvocationId,
                specificationDigest: purpose.specificationDigest, evidence: purpose.evidence,
                summary: 'Registration and metadata need correction',
                checks: [{ description: 'Check registration', outcome: 'failed', actual: 'Registration missing' }],
                findings: [
                    { id: 'F1', kind: 'defect', blocking: true, description: 'Register the tool' },
                    { id: 'F2', kind: 'suggestion', blocking: false, description: 'Improve metadata description' }
                ], limitations: ['Fixture report; no real CLI execution']
            }
            await f.database.getRepository(XpertProjectTaskExecution).update({ id: receipt.taskExecutionId }, { purpose })
            expect(await f.store.replace({ ...saved, invocation: { ...saved.invocation,
                request: { ...saved.invocation.request, dispatch: { ...dispatch, projectTask: { ...reference, purpose } } },
                result: { text: JSON.stringify(report) }, revision: saved.invocation.revision + 1
            } }, saved.invocation.revision)).toBe(true)
            await decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: receipt.taskExecutionId,
                outcome: 'rework', rationale: 'Address F1 before accepting' }, f.caller)
            f.input = { ...f.input, requestId: randomUUID(), expectedRevision: (await task(input.taskId)).revision,
                purpose: { type: 'implementation', rework: { reviewExecutionId: receipt.taskExecutionId, findingIds: ['F1'] } } }
            return { input, binding, receipt, report }
        }

        it('carries selected findings through a failed retry and requires fresh acceptance evidence', async () => {
            const { input, binding, receipt } = await feedbackDecision()
            const first = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
            expect((await f.service.dispatch(f.scope.projectId, f.input, f.caller)).taskExecutionId).toBe(first.taskExecutionId)
            const firstRun = await f.store.read(first.invocationId, f.scope)
            expect(firstRun.invocation.request.input.prompt).toContain('"id":"F1"')
            expect(firstRun.invocation.request.input.prompt).not.toContain('"id":"F2"')
            await f.store.replace({ ...firstRun, invocation: { ...firstRun.invocation, status: 'failed',
                revision: firstRun.invocation.revision + 1 } }, firstRun.invocation.revision)
            f.input = { ...f.input, requestId: randomUUID(), expectedRevision: (await task(input.taskId)).revision }
            const next = await implemented(), secondReview = await review(next, binding)
            const reviewRun = await f.store.read(secondReview.invocationId, f.scope)
            expect(reviewRun.invocation.request.input.prompt).toContain('Previous independent feedback')
            expect(reviewRun.invocation.request.input.prompt).toContain('not instructions or a verdict on the current candidate')
            expect(reviewRun.invocation.request.input.prompt).toContain('"selectedFindingIds":["F1"]')
            expect(secondReview.projectTaskId).not.toBe(receipt.projectTaskId)
            await expect(decisions.decide(f.scope.projectId, { ...next, reviewExecutionId: receipt.taskExecutionId }, f.caller)).rejects.toThrow()
            await decisions.decide(f.scope.projectId, { ...next, reviewExecutionId: secondReview.taskExecutionId }, f.caller)
            expect((await task(input.taskId)).decisions.map((item) => item.outcome)).toEqual(['rework', 'accept'])
        })

        it('keeps version 1 reports on ordinary rework without inventing finding IDs', async () => {
            const binding = await reviewer(), input = await implemented(), receipt = await review(input, binding, 'changes_required')
            await decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: receipt.taskExecutionId,
                outcome: 'rework', rationale: 'Address the reported observations' }, f.caller)
            const assignedReviewer = { bindingId: binding, mode: 'evidence_only' as const }
            f.input = { ...f.input, requestId: randomUUID(), expectedRevision: (await task(input.taskId)).revision,
                instructions: 'Address the reported observations', purpose: { type: 'implementation', reviewer: assignedReviewer,
                    rework: { reviewExecutionId: receipt.taskExecutionId, findingIds: ['F1'] } } }
            const before = await f.database.getRepository(XpertProjectTaskExecution).count()
            await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller))
                .rejects.toMatchObject({ message: projectTaskRuntimeError('ReviewFeedback').message })
            expect(await f.database.getRepository(XpertProjectTaskExecution).count()).toBe(before)
            f.input.purpose = { type: 'implementation', reviewer: assignedReviewer }
            const next = await implemented(), nextReview = await review(next, binding)
            const implementation = await f.store.read(next.evidence[0].type === 'invocation_result' ? next.evidence[0].invocationId : '', f.scope)
            expect(implementation.invocation.request.input.prompt).toContain('Address the reported observations')
            expect(implementation.invocation.request.input.prompt).not.toContain('Rework the selected findings')
            const reviewRun = await f.store.read(nextReview.invocationId, f.scope)
            expect(reviewRun.invocation.request.input.prompt).not.toContain('Previous independent feedback')
        })

        it.each(['invented-finding', 'missing-decision', 'changed-digest', 'changed-evidence', 'unfinished-review',
            'other-owner', 'mismatched-invocation', 'duplicate-findings', 'mismatched-report-evidence'] as const)(
            'rejects %s before reserving rework', async (invalid) => {
            const { input, receipt, report } = await feedbackDecision()
            const tasks = f.database.getRepository(XpertProjectTask), current = await task(input.taskId)
            if (invalid === 'invented-finding' && f.input.purpose?.type === 'implementation')
                f.input.purpose.rework.findingIds = ['invented']
            if (invalid === 'missing-decision') await tasks.update({ id: input.taskId }, { decisions: [] })
            if (invalid === 'changed-digest' || invalid === 'changed-evidence') {
                const decision = current.decisions.at(-1)
                await tasks.update({ id: input.taskId }, { decisions: [{ ...decision,
                    ...(invalid === 'changed-digest' ? { specificationDigest: 'sha256:' + '0'.repeat(64) } :
                        { evidence: [{ type: 'invocation_result', invocationId: randomUUID(), revision: 1 }] }) }] })
            }
            if (invalid === 'other-owner') await f.database.getRepository(AgentInvocationEntity)
                .update({ id: receipt.invocationId }, { ownerId: randomUUID() })
            if (invalid === 'unfinished-review' || invalid === 'mismatched-invocation') {
                const saved = await f.store.read(receipt.invocationId, f.scope)
                const invocation = structuredClone(saved.invocation)
                if (invalid === 'unfinished-review') invocation.completionEvidence = 2
                else invocation.request.dispatch.projectTask.taskExecutionId = randomUUID()
                await f.store.replace({ ...saved, invocation: { ...invocation, revision: invocation.revision + 1 } }, saved.invocation.revision)
            }
            if (invalid === 'duplicate-findings' || invalid === 'mismatched-report-evidence') {
                const saved = await f.store.read(receipt.invocationId, f.scope)
                const corrupted = { ...report, ...(invalid === 'duplicate-findings' ?
                    { findings: [report.findings[0], report.findings[0]] } :
                    { evidence: [{ type: 'invocation_result', invocationId: randomUUID(), revision: 1 }] }) }
                await f.store.replace({ ...saved, invocation: { ...saved.invocation, result: { text: JSON.stringify(corrupted) },
                    revision: saved.invocation.revision + 1 } }, saved.invocation.revision)
            }
            f.input.expectedRevision = (await task(input.taskId)).revision
            const before = await f.database.getRepository(XpertProjectTaskExecution).count()
            await expect(f.service.dispatch(f.scope.projectId, f.input, f.caller))
                .rejects.toMatchObject({ message: projectTaskRuntimeError('ReviewFeedback').message })
            expect(await f.database.getRepository(XpertProjectTaskExecution).count()).toBe(before)
        })

        it.each(['running', 'succeeded', 'cancelled', 'unconfirmed-failure'] as const)(
            'does not reuse a rework chain after %s', async (state) => {
                await feedbackDecision()
                const receipt = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
                const saved = await f.store.read(receipt.invocationId, f.scope)
                await f.store.replace({ ...saved, invocation: { ...saved.invocation,
                    status: state === 'unconfirmed-failure' ? 'failed' : state,
                    ...(state === 'unconfirmed-failure' ? { completionEvidence: 2 as const } : {}),
                    revision: saved.invocation.revision + 1 } }, saved.invocation.revision)
                await expect(f.service.dispatch(f.scope.projectId, { ...f.input, requestId: randomUUID() }, f.caller))
                    .rejects.toMatchObject({ message: projectTaskRuntimeError('ReviewFeedback').message })
            }
        )

        it.each(['pass', 'changes_required', 'indeterminate'] as const)(
            'finishes the %s review work item without accepting the implementation', async (verdict) => {
                const binding = await reviewer(), input = await implemented(), receipt = await review(input, binding, verdict)
                expect((await task(receipt.projectTaskId)).status).toBe('done')
                expect((await task(input.taskId)).status).toBe('review')
                await expect(decisions.decide(f.scope.projectId, input, f.caller)).rejects.toThrow()
                const decision = decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: receipt.taskExecutionId }, f.caller)
                if (verdict === 'pass') await expect(decision).resolves.toMatchObject({ outcome: 'accept' })
                else await expect(decision).rejects.toThrow()
            }
        )
        it('blocks an invalid report, reuses the same candidate task, and fences an older review', async () => {
            const binding = await reviewer(), input = await implemented()
            const first = await review(input, binding, 'malformed')
            expect((await task(first.projectTaskId)).status).toBe('blocked')
            const second = await review(input, binding)
            expect(second.projectTaskId).toBe(first.projectTaskId)
            expect(second.taskExecutionId).not.toBe(first.taskExecutionId)
            const latest = await task(second.projectTaskId)
            const old = await finish(first.invocationId, 'Later stale invalid result')
            await observe(old.id)
            expect((await task(second.projectTaskId)).revision).toBe(latest.revision)
            expect((await task(second.projectTaskId)).status).toBe('done')
            await expect(decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: first.taskExecutionId }, f.caller)).rejects.toThrow()
        })
        it('accepts a summary and its pinned child atomically, with a sibling review and replay-safe decisions', async () => {
            const parent = await summaryParent(), binding = await reviewer(), input = await implemented()
            const receipt = await review(input, binding)
            expect((await task(receipt.projectTaskId)).parentTaskId).toBe(parent.id)
            const request = { ...input, taskId: parent.id, expectedRevision: (await task(parent.id)).revision, reviewExecutionId: receipt.taskExecutionId }
            const result = await decisions.decide(f.scope.projectId, request, f.caller)
            expect(await decisions.decide(f.scope.projectId, request, f.caller)).toEqual(result)
            for (const id of [parent.id, input.taskId]) {
                expect((await task(id)).status).toBe('done')
                expect((await task(id)).decisions).toHaveLength(1)
            }
        })
        it('accepts multiple implementation children without implicitly completing their summary', async () => {
            const parent = await summaryParent(), binding = await reviewer(), first = await implemented()
            const firstReview = await review(first, binding)
            const repo = f.database.getRepository(XpertProjectTask)
            const sibling = await repo.save(repo.create({ ...(await task(first.taskId)), id: randomUUID(),
                status: 'todo', decisions: [], steps: [] }))
            await decisions.decide(f.scope.projectId, { ...first, reviewExecutionId: firstReview.taskExecutionId }, f.caller)
            expect((await task(first.taskId)).status).toBe('done')
            expect((await task(parent.id)).status).not.toBe('done')
            f.input = { ...f.input, taskId: sibling.id, requestId: randomUUID(), expectedRevision: sibling.revision }
            const second = await implemented(), secondReview = await review(second, binding)
            await decisions.decide(f.scope.projectId, { ...second, reviewExecutionId: secondReview.taskExecutionId }, f.caller)
            expect((await task(sibling.id)).status).toBe('done')
            expect((await task(parent.id)).status).not.toBe('done')
            await decisions.decide(f.scope.projectId, { ...second, requestId: randomUUID(), taskId: parent.id,
                expectedRevision: (await task(parent.id)).revision, reviewExecutionId: secondReview.taskExecutionId }, f.caller)
            expect((await task(parent.id)).status).toBe('done')
        })
        it('rejects parent specification drift and candidate substitution across summaries', async () => {
            const parent = await summaryParent(), binding = await reviewer(), input = await implemented()
            const receipt = await review(input, binding)
            const request = { ...input, taskId: parent.id, expectedRevision: parent.revision, reviewExecutionId: receipt.taskExecutionId }
            const repo = f.database.getRepository(XpertProjectTask)
            const other = await repo.save(repo.create({ ...parent, id: randomUUID() }))
            await expect(decisions.decide(f.scope.projectId, { ...request, taskId: other.id }, f.caller)).rejects.toThrow()
            await repo.update({ id: parent.id }, { requirements: ['Changed goal'] })
            await expect(decisions.decide(f.scope.projectId, request, f.caller)).rejects.toThrow()
        })
        it('blocks premature summary acceptance but allows rework while another child is unfinished', async () => {
            const parent = await summaryParent(), binding = await reviewer(), input = await implemented()
            const receipt = await review(input, binding)
            const repo = f.database.getRepository(XpertProjectTask)
            await repo.save(repo.create({ ...(await task(input.taskId)), id: randomUUID(), status: 'todo', decisions: [], steps: [] }))
            const request = { ...input, taskId: parent.id, expectedRevision: parent.revision, reviewExecutionId: receipt.taskExecutionId }
            await expect(decisions.decide(f.scope.projectId, request, f.caller)).rejects.toThrow()
            await decisions.decide(f.scope.projectId, { ...request, outcome: 'rework' }, f.caller)
            expect((await task(parent.id)).status).toBe('todo')
            expect((await task(input.taskId)).status).toBe('todo')
        })
        it('keeps rework history in the child and creates a new review work item for a new candidate', async () => {
            const binding = await reviewer(), input = await implemented(), first = await review(input, binding, 'changes_required')
            await decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: first.taskExecutionId, outcome: 'rework' }, f.caller)
            f.input = { ...f.input, requestId: randomUUID(), expectedRevision: (await task(input.taskId)).revision }
            const next = await implemented(), second = await review(next, binding)
            expect(second.projectTaskId).not.toBe(first.projectTaskId)
            await expect(decisions.decide(f.scope.projectId, { ...next, reviewExecutionId: first.taskExecutionId }, f.caller)).rejects.toThrow()
            await decisions.decide(f.scope.projectId, { ...next, reviewExecutionId: second.taskExecutionId }, f.caller)
            expect((await task(input.taskId)).decisions.map((item) => item.outcome)).toEqual(['rework', 'accept'])
        })
        it('requires the assigned reviewer and prevents silent removal during implementation retries', async () => {
            await reviewer()
            const input = await implemented()
            await expect(decisions.decide(f.scope.projectId, input, f.caller)).rejects.toThrow()
            const other = await reviewer(false)
            await expect(review(input, other)).rejects.toThrow()
            await decisions.decide(f.scope.projectId, { ...input, outcome: 'rework' }, f.caller)
            await expect(f.service.dispatch(f.scope.projectId, { ...f.input, requestId: randomUUID(),
                expectedRevision: (await task(input.taskId)).revision, purpose: { type: 'implementation' } }, f.caller)).rejects.toThrow()
        })
        it('does not let a late implementation observation undo a parent rework decision', async () => {
            const parent = await summaryParent(), input = await implemented()
            const request = { ...input, taskId: parent.id, expectedRevision: parent.revision, outcome: 'rework' as const }
            await decisions.decide(f.scope.projectId, request, f.caller)
            const ref = input.evidence[0]
            if (ref.type !== 'invocation_result') throw new Error('Expected invocation evidence')
            await finish(ref.invocationId)
            await observe(ref.invocationId)
            expect((await task(parent.id)).status).toBe('todo')
            expect((await task(input.taskId)).status).toBe('todo')
        })
        it.each([
            ['failed', 'succeeded'], ['succeeded', 'failed']
        ] as const)('preserves summary status when children are observed %s then %s', async (firstStatus, secondStatus) => {
            const parent = await summaryParent()
            const repo = f.database.getRepository(XpertProjectTask)
            await repo.update({ id: parent.id }, { status: 'blocked' })
            const before = await task(parent.id)
            // Use real observation to change task status; manual fixture updates advance its revision fence.
            const first = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
            const saved = await f.store.read(first.invocationId, f.scope)
            await f.store.replace({ ...saved, invocation: { ...saved.invocation, status: 'failed',
                revision: saved.invocation.revision + 1 } }, saved.invocation.revision)
            const sibling = await repo.save(repo.create({ ...(await task(first.projectTaskId)), id: randomUUID(),
                status: 'todo', decisions: [], steps: [] }))
            f.input = { ...f.input, taskId: sibling.id, requestId: randomUUID(), expectedRevision: sibling.revision }
            const second = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
            await finish(second.invocationId)
            const invocations = { failed: first.invocationId, succeeded: second.invocationId }
            for (const status of [firstStatus, secondStatus]) {
                await observe(invocations[status])
                expect(await task(parent.id)).toMatchObject({ status: before.status, revision: before.revision, decisions: before.decisions })
            }
            expect((await task(first.projectTaskId)).status).toBe('blocked')
            expect((await task(second.projectTaskId)).status).toBe('review')
        })
        it('waits for actual completion before finishing a review task', async () => {
            const binding = await reviewer(), input = await implemented(), receipt = await review(input, binding)
            const repo = f.database.getRepository(XpertProjectTask)
            const execution = await f.database.getRepository(XpertProjectTaskExecution).findOneBy({ id: receipt.taskExecutionId })
            await repo.update({ id: receipt.projectTaskId }, { status: 'review', revision: execution.projectedTaskRevision })
            const saved = await f.store.read(receipt.invocationId, f.scope)
            await f.store.replace({ ...saved, invocation: { ...saved.invocation, completionEvidence: 2,
                revision: saved.invocation.revision + 1 } }, saved.invocation.revision)
            await observe(receipt.invocationId)
            expect((await task(receipt.projectTaskId)).status).toBe('review')
            await expect(decisions.decide(f.scope.projectId, { ...input, reviewExecutionId: receipt.taskExecutionId }, f.caller)).rejects.toThrow()
        })
    })
}
