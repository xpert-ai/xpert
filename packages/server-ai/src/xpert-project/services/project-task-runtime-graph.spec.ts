import { XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { ProjectTaskGraphService } from './project-task-graph.service'

describe('task timeline execution timestamps', () => {
    it('refreshes actual completion from runtime instead of the earlier business receipt or elapsed time', async () => {
        const runtime = Object.assign(new XpertAgentExecution(), {
            id: 'run',
            status: Status.RUNNING,
            createdAt: new Date('2026-10-07T12:00:00Z'),
            updatedAt: new Date('2026-10-07T12:00:00Z'),
            completedAt: null,
            elapsedTime: 300000
        })
        const attempt = {
            id: 'attempt',
            taskId: 'task',
            agentExecutionId: runtime.id,
            startedAt: new Date('2026-10-07T11:59:00Z'),
            completedAt: new Date('2026-10-07T12:01:00Z')
        }
        const manager = {
            find: jest.fn(async (entity: unknown) => {
                if (entity === XpertProjectTaskExecution) return [attempt]
                if (entity === XpertAgentExecution) return [runtime]
                return []
            }),
            findOne: jest.fn(async () => ({ id: 'project', name: 'Project' }))
        }
        const service = new ProjectTaskGraphService(
            { manager, find: async () => [{ id: 'task', status: 'in_progress', revision: 1 }] } as never,
            { listReadable: async () => [{ role: 'editor', archived: false }] } as never,
            { list: () => [] } as never
        )
        const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
        const running = await service.graph(context)
        expect(running.tasks[0]).toMatchObject({ actualStartAt: '2026-10-07T12:00:00.000Z', actualEndAt: null })
        runtime.status = Status.SUCCESS
        runtime.completedAt = new Date('2026-10-07T14:05:00Z')
        const completed = await service.graph(context)
        expect(completed.tasks[0].actualEndAt).toBe('2026-10-07T14:05:00.000Z')
        expect(completed.executions[0].runtimeCompletedAt).toBe('2026-10-07T14:05:00.000Z')
        expect(completed.cursor).not.toBe(running.cursor)
        runtime.updatedAt = new Date('2026-10-08T00:00:00Z')
        expect((await service.graph(context)).cursor).toBe(completed.cursor)
        runtime.status = Status.RUNNING
        runtime.completedAt = null
        expect((await service.graph(context)).tasks[0].actualEndAt).toBeNull()
    })
})
