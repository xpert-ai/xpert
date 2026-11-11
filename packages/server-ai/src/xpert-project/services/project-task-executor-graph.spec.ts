jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import type { ProjectTaskExecutionPurpose } from '@xpert-ai/contracts'
import type { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { ProjectTaskGraphService } from './project-task-graph.service'

const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
const subject = { implementationTaskId: 'implementation', implementationExecutionId: 'candidate', specificationDigest: 'digest' }
const reviewPurpose: ProjectTaskExecutionPurpose = {
    type: 'review', ...subject, implementationInvocationId: 'candidate-invocation', evidence: []
}

function fixture() {
    const tasks = ['review', 'implementation', 'review-no-executor', 'review-not-started'].map((id) =>
        Object.assign(new XpertProjectTask(), {
            id, projectId: context.projectId, name: id, kind: 'task', status: 'review', revision: 1,
            reviewSubject: id === 'implementation' ? null : subject
        })
    )
    const attempts: XpertProjectTaskExecution[] = []
    const records: AgentInvocationEntity[] = []
    function add(taskId: string, ordinal: number, purpose: ProjectTaskExecutionPurpose, provider?: string) {
        const id = `${taskId}-${ordinal}`
        const invocationId = `invocation-${id}`
        attempts.push(Object.assign(new XpertProjectTaskExecution(), {
            id, taskId, projectId: context.projectId, invocationId, attempt: ordinal, purpose, status: 'queued'
        }))
        if (!provider) return
        const invocation: AgentInvocation = {
            id: invocationId, status: 'succeeded', revision: 1,
            scope: { ...context.actor, projectId: context.projectId, parentExecutionId: 'parent', callerAgentKey: 'main' },
            createdAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-11T00:01:00Z',
            request: {
                target: { bindingId: 'binding', provider, reference: 'agent', revision: '1', configuration: {} },
                callId: id, input: { prompt: 'Task' },
                dispatch: {
                    version: 1, requestId: id, sourceMessageId: 'source',
                    replyTo: { xpertId: 'assistant', agentKey: 'main', conversationId: 'conversation', threadId: 'thread' },
                    projectTask: {
                        projectId: context.projectId, projectTaskId: taskId, taskExecutionId: id, purpose,
                        specification: {
                            digest: 'digest', specification: { version: 1, title: 'Task', requirements: ['Finish'], steps: [] }
                        }
                    }
                }
            }
        }
        records.push(Object.assign(new AgentInvocationEntity(), { id: invocationId, invocation }))
    }
    add('review', 2, reviewPurpose, 'review-runtime')
    add('review', 1, reviewPurpose, 'old-review-runtime')
    add('implementation', 1, { type: 'implementation' }, 'implementation-runtime')
    add('implementation', 9, reviewPurpose, 'separate-review-runtime')
    add('review-no-executor', 1, reviewPurpose, 'old-review-runtime')
    add('review-no-executor', 2, reviewPurpose)
    const findInvocations = jest.fn(async () => records)
    const manager = Object.assign(Object.create(EntityManager.prototype) as EntityManager, {
        find: jest.fn(async (entity: object) => {
            if (entity === XpertProjectTask) return tasks
            if (entity === XpertProjectTaskExecution) return attempts
            return []
        }),
        findOne: jest.fn(async () => ({ id: context.projectId, name: 'Project' })),
        getRepository: jest.fn((entity: object) => {
            if (entity !== AgentInvocationEntity) throw new Error('Unexpected repository read')
            return { find: findInvocations }
        })
    })
    const service = Object.create(ProjectTaskGraphService.prototype) as ProjectTaskGraphService
    Object.assign(service, {
        tasks: { manager }, access: { listReadable: async () => [{ role: 'editor', archived: false }] },
        providers: { list: () => [] }, pipelineProviders: { listForActor: () => [] },
        projection: { diagnostics: async () => [] }
    })
    return { service, manager, tasks, attempts, findInvocations }
}

describe('task graph executor identity', () => {
    it.each(['ordinary', 'transactional'] as const)(
        'projects each task executor in the %s graph without exposing review ownership or changing acceptance',
        async (mode) => {
            const f = fixture()
            const graph = mode === 'ordinary'
                ? await f.service.graph(context)
                : await f.service.graphWithinTransaction(context, f.manager)
            expect(graph.tasks.map((task) => [task.id, task.executor])).toEqual([
                ['review', { provider: 'review-runtime' }],
                ['implementation', { provider: 'implementation-runtime' }],
                ['review-no-executor', null],
                ['review-not-started', null]
            ])
            for (const task of graph.tasks) {
                expect(task).not.toHaveProperty('reviewSubject')
                expect(task).not.toHaveProperty('reviewVerdict')
                expect(task.status).toBe('review')
            }
            expect(f.tasks.every((task) => task.status === 'review')).toBe(true)
            expect(f.attempts.every((attempt) => attempt.status === 'queued')).toBe(true)
            expect(f.findInvocations).toHaveBeenCalledTimes(1)
            expect(f.findInvocations).toHaveBeenCalledWith({
                where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' })
            })
        }
    )
})
