jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import type { IXpertProjectTaskExecution, ProjectTaskExecutionPurpose } from '@xpert-ai/contracts'
import type { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { observeProjectTaskInvocations, projectTaskInvocationView } from './project-task-invocation-view'

const implementationId = '00000000-0000-4000-8000-000000000001'
const implementationInvocationId = '00000000-0000-4000-8000-000000000002'
const otherId = '00000000-0000-4000-8000-000000000003'
const digest = `sha256:${'a'.repeat(64)}`

function fixture(markdown = '# Review\nThe deployment has not been checked.') {
    const purpose: Extract<ProjectTaskExecutionPurpose, { type?: 'review' }> = {
        type: 'review',
        implementationExecutionId: implementationId,
        implementationInvocationId,
        specificationDigest: digest,
        evidence: [{ type: 'invocation_result', invocationId: implementationInvocationId, revision: 3 }]
    }
    const report = markdown
    const attempt: IXpertProjectTaskExecution = {
        id: 'review-attempt',
        taskId: 'review-task',
        projectId: 'project',
        invocationId: 'review-invocation',
        attempt: 1,
        status: 'queued',
        dispatchState: 'submitted',
        purpose: structuredClone(purpose),
        reviewReportAvailable: true
    }
    const invocation: AgentInvocation = {
        id: attempt.invocationId,
        revision: 1,
        status: 'succeeded',
        createdAt: '2026-11-11T00:00:00Z',
        updatedAt: '2026-11-11T00:01:00Z',
        scope: {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            projectId: 'project',
            parentExecutionId: 'parent',
            callerAgentKey: 'main'
        },
        request: {
            target: {
                bindingId: 'binding',
                provider: 'review-runtime',
                reference: 'agent',
                revision: '1',
                configuration: {}
            },
            callId: 'call',
            input: { prompt: 'Review the candidate' },
            dispatch: {
                version: 1,
                requestId: 'request',
                sourceMessageId: 'source',
                replyTo: { xpertId: 'assistant', agentKey: 'main', conversationId: 'conversation', threadId: 'thread' },
                projectTask: {
                    projectId: attempt.projectId,
                    projectTaskId: attempt.taskId,
                    taskExecutionId: attempt.id,
                    purpose: structuredClone(purpose),
                    specification: {
                        digest,
                        specification: { version: 1, title: 'Task', requirements: ['Finish'], steps: [] }
                    }
                }
            }
        },
        result: { text: report }
    }
    return { attempt, invocation, purpose, report }
}

describe('execution review report projection', () => {
    it.each(['# Review\nAll checks passed', 'Deployment not tested', '```json\n{"verdict":"pass"}\n```'])(
        'preserves report presence without deriving a verdict',
        (markdown) => {
            const f = fixture(markdown)
            const before = structuredClone(f)
            expect(projectTaskInvocationView(f.attempt, f.invocation)).toMatchObject({
                status: 'succeeded',
                reviewReportAvailable: true
            })
            expect(f).toEqual(before)
        }
    )

    it('waits for confirmed native completion before projecting a valid report', () => {
        const f = fixture()
        f.invocation.controlAdapter = 'native-assistant-task'
        f.invocation.handle = { sessionId: 'session', runId: otherId }
        expect(projectTaskInvocationView(f.attempt, f.invocation)).toMatchObject({
            status: 'running',
            reviewReportAvailable: false
        })
        f.invocation.controlEvidence = {
            version: 1,
            source: 'platform',
            subject: { kind: 'execution', id: otherId },
            scope: 'owned_subtree',
            state: 'settled',
            desired: 'terminated',
            observedAt: f.invocation.updatedAt,
            taskId: implementationId,
            rootId: implementationInvocationId,
            executionId: otherId,
            revision: 1,
            threadId: 'thread'
        }
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewReportAvailable).toBe(true)
        f.invocation.controlEvidence.subject.id = 'other-run'
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewReportAvailable).toBe(false)
    })

    it('requires completion evidence for a current provider even if it reports succeeded', () => {
        const f = fixture()
        f.invocation.completionEvidence = 2
        expect(projectTaskInvocationView(f.attempt, f.invocation)).toMatchObject({
            status: 'queued',
            reviewReportAvailable: false
        })
    })

    it.each(['queued', 'running', 'waiting', 'cancelling', 'unknown', 'failed', 'cancelled'] as const)(
        'clears a previous report when runtime status is %s',
        (status) => {
            const f = fixture()
            f.invocation.status = status
            expect(projectTaskInvocationView(f.attempt, f.invocation).reviewReportAvailable).toBe(false)
        }
    )

    const unrelated: [string, (f: ReturnType<typeof fixture>) => void][] = [
        [
            'Invocation ID',
            (f) => {
                f.invocation.id = 'other'
            }
        ],
        [
            'execution ID',
            (f) => {
                f.invocation.request.dispatch.projectTask.taskExecutionId = 'other'
            }
        ],
        [
            'task ID',
            (f) => {
                f.invocation.request.dispatch.projectTask.projectTaskId = 'other'
            }
        ],
        [
            'dispatch project',
            (f) => {
                f.invocation.request.dispatch.projectTask.projectId = 'other'
            }
        ],
        [
            'Invocation project',
            (f) => {
                f.invocation.scope.projectId = 'other'
            }
        ],
        [
            'implementation purpose',
            (f) => {
                f.attempt.purpose = { type: 'implementation' }
            }
        ],
        [
            'dispatch purpose',
            (f) => {
                f.invocation.request.dispatch.projectTask.purpose = { type: 'implementation' }
            }
        ],
        [
            'candidate execution',
            (f) => {
                f.invocation.request.dispatch.projectTask.purpose = { ...f.purpose, implementationExecutionId: otherId }
            }
        ],
        [
            'evidence revision',
            (f) => {
                f.invocation.request.dispatch.projectTask.purpose = {
                    ...f.purpose,
                    evidence: [{ type: 'invocation_result', invocationId: implementationInvocationId, revision: 4 }]
                }
            }
        ]
    ]
    it.each(unrelated)('rejects mismatched %s even when the report itself is valid', (_name, mutate) => {
        const f = fixture()
        mutate(f)
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewReportAvailable).toBe(false)
    })

    it.each(['', '   ', undefined])('does not expose a missing report', (text) => {
        const f = fixture()
        f.invocation.result.text = text
        expect(projectTaskInvocationView(f.attempt, f.invocation).reviewReportAvailable).toBe(false)
    })

    it('clears stale report projections when the Invocation is absent or its identifier is missing', () => {
        const f = fixture()
        expect(projectTaskInvocationView(f.attempt)).toMatchObject({
            reviewReportAvailable: false,
            invocationStatus: 'unknown'
        })
        f.attempt.dispatchState = 'pending'
        expect(projectTaskInvocationView(f.attempt)).toMatchObject({
            reviewReportAvailable: false,
            invocationStatus: 'queued'
        })
        f.attempt.invocationId = null
        expect(projectTaskInvocationView(f.attempt)).toMatchObject({ reviewReportAvailable: false, status: 'queued' })
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
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewReportAvailable).toBe(true)
        expect(find).toHaveBeenCalledTimes(1)
        expect(find).toHaveBeenCalledWith({
            where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' })
        })
        f.invocation.scope.projectId = 'other'
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewReportAvailable).toBe(false)
        records.length = 0
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewReportAvailable).toBe(false)
        find.mockClear()
        expect(
            (await observeProjectTaskInvocations(manager, { ...scope, organizationId: null }, [f.attempt]))[0]
                .reviewReportAvailable
        ).toBe(false)
        f.attempt.invocationId = null
        expect((await observeProjectTaskInvocations(manager, scope, [f.attempt]))[0].reviewReportAvailable).toBe(false)
        expect(find).not.toHaveBeenCalled()
        expect(f.attempt.reviewReportAvailable).toBe(true)
    })
})
