jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { IXpertProjectTaskExecution } from '@xpert-ai/contracts'
import { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { projectTaskInvocationView } from './project-task-invocation-view'

const attempt: IXpertProjectTaskExecution = {
    id: 'attempt',
    taskId: 'task',
    projectId: 'project',
    invocationId: 'invocation',
    attempt: 1,
    status: 'queued',
    dispatchState: 'submitted'
}
function invocation(status: AgentInvocation['status']): AgentInvocation {
    return {
        id: 'invocation',
        status,
        revision: 1,
        scope: {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'actor',
            parentExecutionId: 'parent',
            callerAgentKey: 'main'
        },
        createdAt: '2026-10-06T00:00:00Z',
        updatedAt: '2026-10-06T00:01:00Z',
        request: {
            target: { bindingId: 'binding', provider: 'test', reference: 'agent', revision: '1', configuration: {} },
            callId: 'call',
            input: { prompt: 'task' },
            dispatch: {
                version: 1,
                requestId: 'request',
                sourceMessageId: 'source',
                replyTo: { xpertId: 'xpert', agentKey: 'main', conversationId: 'conversation', threadId: 'thread' },
                projectTask: {
                    projectId: 'project',
                    projectTaskId: 'task',
                    taskExecutionId: 'attempt',
                    purpose: { type: 'implementation' },
                    specification: {
                        digest: 'digest',
                        specification: { version: 1, title: 'Task', requirements: ['Finish'], steps: [] }
                    }
                }
            }
        }
    }
}
describe('Project task invocation read projection', () => {
    it('does not manufacture a process start from an admitted running invocation', () => {
        expect(projectTaskInvocationView(attempt, invocation('running')).runtimeProvider).toBe('test')
        expect(projectTaskInvocationView(attempt, invocation('running'))).toMatchObject({
            status: 'queued',
            invocationStatus: 'running',
            runtimeStartedAt: null,
            runtimeCompletedAt: null
        })
    })
    it.each(['waiting', 'unknown', 'cancelling'] as const)(
        'preserves %s without declaring failure or completion',
        (status) => {
            const observed = { ...invocation(status), handle: { sessionId: 'session', runId: 'run' } }
            expect(projectTaskInvocationView(attempt, observed)).toMatchObject({
                invocationStatus: status,
                runtimeCompletedAt: null
            })
            expect(attempt.status).toBe('queued')
        }
    )
    it('projects Runtime success without modifying the persisted attempt or business task', () => {
        const observed = invocation('succeeded')
        expect(projectTaskInvocationView(attempt, observed)).toMatchObject({
            status: 'succeeded',
            invocationStatus: 'succeeded'
        })
        expect(attempt.status).toBe('queued')
    })
    it('refuses unrelated observations and treats a missing submitted invocation as unknown', () => {
        const unrelated = invocation('succeeded')
        unrelated.request.dispatch.projectTask.taskExecutionId = 'other'
        expect(projectTaskInvocationView(attempt, unrelated).invocationStatus).toBe('unknown')
        expect(projectTaskInvocationView(attempt, unrelated).runtimeProvider).toBeUndefined()
        expect(projectTaskInvocationView(attempt).invocationStatus).toBe('unknown')
        expect(projectTaskInvocationView({ ...attempt, dispatchState: 'pending' }).invocationStatus).toBe('queued')
    })
})
