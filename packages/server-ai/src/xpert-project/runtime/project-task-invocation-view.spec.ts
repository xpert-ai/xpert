jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { IXpertProjectTaskExecution } from '@xpert-ai/contracts'
import { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { observeProjectTaskInvocations, projectTaskInvocationView } from './project-task-invocation-view'

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
    it('does not project a legacy cancelled string as an actual completion', () => {
        const observed = { ...invocation('cancelled'), handle: { sessionId: 'session', runId: 'run' } }
        expect(projectTaskInvocationView(attempt, observed)).toMatchObject({
            status: 'running',
            invocationStatus: 'cancelling',
            runtimeCompletedAt: null
        })
    })
    it('projects Runtime success without modifying the persisted attempt or business task', () => {
        const observed = invocation('succeeded')
        expect(projectTaskInvocationView(attempt, observed)).toMatchObject({
            status: 'succeeded',
            invocationStatus: 'succeeded'
        })
        expect(attempt.status).toBe('queued')
    })
    it('requires the exact stored Pipeline node-to-task link and operation identity', async () => {
        const id = '00000000-0000-4000-8000-000000000001'
        const observed = invocation('succeeded')
        observed.scope = {
            tenantId: id,
            organizationId: id,
            userId: id,
            workspaceId: id,
            projectId: id,
            callerType: 'project_pipeline',
            callerAgentKey: 'pipeline_node',
            parentExecutionId: `pipeline-operation:${id}`,
            pipelineOrigin: {
                instanceId: id,
                runId: id,
                roundId: id,
                nodeInstanceId: id,
                operationId: id,
                generation: 1,
                inputDigest: 'a'.repeat(64)
            }
        }
        delete observed.request.dispatch
        observed.request.callId = id
        const source = { ...attempt, projectId: id, sourceKey: id },
            link = { projectId: id, taskId: attempt.taskId, nodeInstanceId: id }
        expect(projectTaskInvocationView(source, observed, link).invocationStatus).toBe('succeeded')
        const oldId = '00000000-0000-4000-8000-000000000002'
        const older = structuredClone(observed)
        older.id = 'older-invocation'
        older.scope.pipelineOrigin.nodeInstanceId = oldId
        older.scope.pipelineOrigin.operationId = oldId
        older.scope.parentExecutionId = `pipeline-operation:${oldId}`
        older.request.callId = oldId
        const olderAttempt = { ...source, id: 'older-attempt', invocationId: older.id, sourceKey: oldId }
        const findInvocations = jest.fn(async () => [
            { id: older.id, invocation: older },
            { id: observed.id, invocation: observed }
        ])
        const findLinks = jest.fn(async () => [{ ...link, nodeInstanceId: oldId }, link])
        const manager = {
            getRepository: (entity: unknown) => ({
                find: entity === AgentInvocationEntity ? findInvocations : findLinks
            })
        } as unknown as EntityManager
        const scope = { projectId: id, tenantId: id, organizationId: id }
        expect(
            (await observeProjectTaskInvocations(manager, scope, [source, olderAttempt])).map(
                (item) => item.invocationStatus
            )
        ).toEqual(['succeeded', 'succeeded'])
        expect(findInvocations).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: id, organizationId: id })
            })
        )
        expect(findLinks).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining(scope)
            })
        )

        expect(projectTaskInvocationView(source, observed).invocationStatus).toBe('unknown')
        expect(projectTaskInvocationView(source, observed, { ...link, taskId: 'another' }).invocationStatus).toBe(
            'unknown'
        )
        expect(projectTaskInvocationView({ ...source, sourceKey: 'another' }, observed, link).invocationStatus).toBe(
            'unknown'
        )
        observed.scope.pipelineOrigin.operationId = '00000000-0000-4000-8000-000000000002'
        expect(projectTaskInvocationView(source, observed, link).invocationStatus).toBe('unknown')
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
