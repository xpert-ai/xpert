jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import type { IXpertProjectTaskExecution, ProjectTaskExecutionPurpose, ProjectTaskReviewReport } from '@xpert-ai/contracts'
import type { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { observeProjectTaskInvocations, projectTaskInvocationView } from './project-task-invocation-view'

const implementationId = '00000000-0000-4000-8000-000000000001'
const implementationInvocationId = '00000000-0000-4000-8000-000000000002'
const otherId = '00000000-0000-4000-8000-000000000003'
const digest = `sha256:${'a'.repeat(64)}`

function fixture(verdict: ProjectTaskReviewReport['verdict'] = 'pass') {
    const purpose: Extract<ProjectTaskExecutionPurpose, { type?: 'review' }> = {
        type: 'review', implementationExecutionId: implementationId, implementationInvocationId,
        specificationDigest: digest,
        evidence: [{ type: 'invocation_result', invocationId: implementationInvocationId, revision: 3 }]
    }
    const report = {
        version: 1, verdict, specificationDigest: digest, implementationInvocationId,
        evidence: structuredClone(purpose.evidence), findings: ['Checked the supplied evidence'], limitations: ['Evidence only']
    } satisfies ProjectTaskReviewReport
    const attempt: IXpertProjectTaskExecution = {
        id: 'review-attempt', taskId: 'review-task', projectId: 'project', invocationId: 'review-invocation',
        attempt: 1, status: 'queued', dispatchState: 'submitted', purpose: structuredClone(purpose), reviewVerdict: 'pass'
    }
    const invocation: AgentInvocation = {
        id: attempt.invocationId, revision: 1, status: 'succeeded',
        createdAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-11T00:01:00Z',
        scope: { tenantId: 'tenant', organizationId: 'org', userId: 'user', projectId: 'project', parentExecutionId: 'parent', callerAgentKey: 'main' },
        request: {
            target: { bindingId: 'binding', provider: 'review-runtime', reference: 'agent', revision: '1', configuration: {} },
            callId: 'call', input: { prompt: 'Review the candidate' },
            dispatch: {
                version: 1, requestId: 'request', sourceMessageId: 'source',
                replyTo: { xpertId: 'assistant', agentKey: 'main', conversationId: 'conversation', threadId: 'thread' },
                projectTask: {
                    projectId: attempt.projectId, projectTaskId: attempt.taskId, taskExecutionId: attempt.id,
                    purpose: structuredClone(purpose),
                    specification: { digest, specification: { version: 1, title: 'Task', requirements: ['Finish'], steps: [] } }
                }
            }
        },
        result: { text: JSON.stringify(report) }
    }
    return { attempt, invocation, purpose, report }
}

describe('execution review verdict projection', () => {
    it.each(['pass', 'changes_required', 'indeterminate'] as const)('reads the validated %s verdict without persisting it', (verdict) => {
        const f = fixture(verdict)
        const before = structuredClone(f)
        expect(projectTaskInvocationView(f.attempt, f.invocation)).toMatchObject({ status: 'succeeded', reviewVerdict: verdict })
        expect(f).toEqual(before)
    })

    it('reads execution review reports and rejects an evidence-only report for the same execution review', () => {
        const f = fixture()
        const purpose: ProjectTaskExecutionPurpose = { ...f.purpose, mode: 'execution', candidatePaths: ['plugin'] }
        f.attempt.purpose = purpose
        f.invocation.request.dispatch.projectTask.purpose = structuredClone(purpose)
        const report: ProjectTaskReviewReport = {
            version: 2, mode: 'execution', verdict: 'pass', specificationDigest: digest, implementationInvocationId,
            evidence: f.purpose.evidence, summary: 'Verified in the test environment',
            checks: [{ description: 'Run tests', command: 'npm test', outcome: 'passed', actual: 'All checks passed' }],
            findings: [], limitations: []
        }
        f.invocation.result.text = JSON.stringify(report)
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewVerdict).toBe('pass')
        f.invocation.result.text = JSON.stringify(f.report)
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewVerdict).toBeNull()
    })

    it('waits for confirmed native completion before projecting a valid report', () => {
        const f = fixture()
        f.invocation.controlAdapter = 'native-assistant-task'
        f.invocation.handle = { sessionId: 'session', runId: otherId }
        expect(projectTaskInvocationView(f.attempt, f.invocation)).toMatchObject({ status: 'running', reviewVerdict: null })
        f.invocation.controlEvidence = {
            version: 1, source: 'platform', subject: { kind: 'execution', id: otherId }, scope: 'owned_subtree',
            state: 'settled', desired: 'terminated', observedAt: f.invocation.updatedAt,
            taskId: implementationId, rootId: implementationInvocationId, executionId: otherId, revision: 1, threadId: 'thread'
        }
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewVerdict).toBe('pass')
        f.invocation.controlEvidence.subject.id = 'other-run'
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewVerdict).toBeNull()
    })

    it('requires completion evidence for a current provider even if it reports succeeded', () => {
        const f = fixture()
        f.invocation.completionEvidence = 2
        expect(projectTaskInvocationView(f.attempt, f.invocation)).toMatchObject({ status: 'queued', reviewVerdict: null })
    })

    it.each(['queued', 'running', 'waiting', 'cancelling', 'unknown', 'failed', 'cancelled'] as const)(
        'clears a previous verdict when runtime status is %s', (status) => {
            const f = fixture()
            f.invocation.status = status
            expect(projectTaskInvocationView(f.attempt, f.invocation).reviewVerdict).toBeNull()
        }
    )

    const unrelated: [string, (f: ReturnType<typeof fixture>) => void][] = [
        ['Invocation ID', (f) => { f.invocation.id = 'other' }],
        ['execution ID', (f) => { f.invocation.request.dispatch.projectTask.taskExecutionId = 'other' }],
        ['task ID', (f) => { f.invocation.request.dispatch.projectTask.projectTaskId = 'other' }],
        ['dispatch project', (f) => { f.invocation.request.dispatch.projectTask.projectId = 'other' }],
        ['Invocation project', (f) => { f.invocation.scope.projectId = 'other' }],
        ['implementation purpose', (f) => { f.attempt.purpose = { type: 'implementation' } }],
        ['dispatch purpose', (f) => { f.invocation.request.dispatch.projectTask.purpose = { type: 'implementation' } }],
        ['candidate execution', (f) => { f.invocation.request.dispatch.projectTask.purpose = { ...f.purpose, implementationExecutionId: otherId } }],
        ['evidence revision', (f) => { f.invocation.request.dispatch.projectTask.purpose = { ...f.purpose, evidence: [{ type: 'invocation_result', invocationId: implementationInvocationId, revision: 4 }] } }]
    ]
    it.each(unrelated)('rejects mismatched %s even when the report itself is valid', (_name, mutate) => {
        const f = fixture()
        mutate(f)
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewVerdict).toBeNull()
    })

    it.each(['missing', 'prose', 'specification', 'implementation', 'evidence', 'extra field'] as const)(
        'clears a stale verdict for a %s report', (kind) => {
            const f = fixture()
            f.invocation.result.text = kind === 'missing' ? undefined : kind === 'prose' ? 'All tests passed' : JSON.stringify({
                ...f.report,
                ...(kind === 'specification' ? { specificationDigest: `sha256:${'b'.repeat(64)}` } : {}),
                ...(kind === 'implementation' ? { implementationInvocationId: otherId } : {}),
                ...(kind === 'evidence' ? { evidence: [{ type: 'invocation_result', invocationId: implementationInvocationId, revision: 4 }] } : {}),
                ...(kind === 'extra field' ? { approved: true } : {})
            })
            expect(projectTaskInvocationView(f.attempt, f.invocation).reviewVerdict).toBeNull()
        }
    )

    it('clears stale verdicts when the Invocation is absent or its identifier is missing', () => {
        const f = fixture()
        expect(projectTaskInvocationView(f.attempt)).toMatchObject({ reviewVerdict: null, invocationStatus: 'unknown' })
        f.attempt.dispatchState = 'pending'
        expect(projectTaskInvocationView(f.attempt)).toMatchObject({ reviewVerdict: null, invocationStatus: 'queued' })
        f.attempt.invocationId = null
        expect(projectTaskInvocationView(f.attempt)).toMatchObject({ reviewVerdict: null, status: 'queued' })
    })

    it('uses the scoped batch read and clears stale values when no authorized Invocation can be observed', async () => {
        const f = fixture()
        const records = [{ id: f.invocation.id, invocation: f.invocation }]
        const find = jest.fn(async () => records)
        const manager = Object.assign(Object.create(EntityManager.prototype) as EntityManager, {
            getRepository: jest.fn((entity: object) => {
                if (entity !== AgentInvocationEntity) throw new Error('Unexpected repository read')
                return { find }
            })
        })
        const scope = { tenantId: 'tenant', organizationId: 'org', projectId: 'project' }
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewVerdict).toBe('pass')
        expect(find).toHaveBeenCalledTimes(1)
        expect(find).toHaveBeenCalledWith({ where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' }) })
        f.invocation.scope.projectId = 'other'
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewVerdict).toBeNull()
        records.length = 0
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewVerdict).toBeNull()
        find.mockClear()
        expect((await observeProjectTaskInvocations(manager, { ...scope, organizationId: null }, [f.attempt]))[0].reviewVerdict).toBeNull()
        f.attempt.invocationId = null
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewVerdict).toBeNull()
        expect(find).not.toHaveBeenCalled()
        expect(f.attempt.reviewVerdict).toBe('pass')
    })
})
