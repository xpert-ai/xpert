jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentUserId: () => 'viewer' } }))
jest.mock('../../xpert-agent-execution/agent-execution.entity', () => ({ XpertAgentExecution: class {} }))
jest.mock('../../chat-message/chat-message.entity', () => ({ ChatMessage: class {} }))
jest.mock('../../xpert-project/entities/project-task.entity', () => ({ XpertProjectTask: class {} }))
jest.mock('../../xpert-project/entities/project-task-execution.entity', () => ({ XpertProjectTaskExecution: class {} }))
jest.mock('../../agent-invocation/invocation.entity', () => ({ AgentInvocationEntity: class {} }))
jest.mock('../../xpert-project/services/project-access.service', () => ({ XpertProjectAccessService: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { DataSource } from 'typeorm'
import { createResourceCardContent, IChatConversation } from '@xpert-ai/contracts'
import { ThreadActivityService } from './thread-activity.service'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertProjectTaskExecution } from '../../xpert-project/entities/project-task-execution.entity'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { projectTaskCard } from '../../xpert-project/runtime/project-task-card'

function fixture() {
    const date = new Date('2026-10-06T00:00:00Z')
    const runs = {
        find: jest.fn().mockResolvedValue([{ id: 'run', status: 'success', createdAt: date, updatedAt: date }])
    }
    const card = createResourceCardContent(
        projectTaskCard({ type: 'execution', id: 'attempt', title: 'Original title', status: 'running', attempt: 1 })
    )
    const query = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'message', executionId: 'run', content: [card] }])
    }
    const messages = {
        find: jest.fn().mockResolvedValue([{ executionId: 'run', updatedAt: date }]),
        createQueryBuilder: () => query
    }
    const attempts = {
        findOneBy: jest.fn().mockResolvedValue({
            id: 'attempt',
            taskId: 'task',
            invocationId: 'invocation',
            attempt: 1,
            purpose: { type: 'implementation' }
        })
    }
    const invocations = {
        findOneBy: jest.fn().mockResolvedValue({
            invocation: {
                scope: { parentExecutionId: 'run' },
                status: 'succeeded',
                request: {
                    target: { provider: 'opencode' },
                    dispatch: {
                        projectTask: { projectId: 'project', projectTaskId: 'task', taskExecutionId: 'attempt' }
                    }
                }
            }
        })
    }
    const dataSource = {
        getRepository: (entity: unknown) => {
            if (entity === XpertAgentExecution) return runs
            if (entity === ChatMessage) return messages
            if (entity === XpertProjectTaskExecution) return attempts
            if (entity === AgentInvocationEntity) return invocations
            throw new Error('Unexpected entity')
        }
    } as unknown as DataSource
    const projects = { assertCanRead: jest.fn() }
    const service = new ThreadActivityService(dataSource, projects as unknown as XpertProjectAccessService)
    const conversation = {
        id: 'conversation',
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project'
    } as IChatConversation
    return { service, conversation, runs, messages, attempts, invocations, projects, query }
}

describe('authorized thread activity projection', () => {
    it('binds a card to its persisted message and scopes all execution reads', async () => {
        const f = fixture()
        const snapshot = await f.service.snapshot(f.conversation, 'thread')
        expect(f.projects.assertCanRead).toHaveBeenCalledWith('project')
        expect(f.runs.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org', threadId: 'thread' })
            })
        )
        expect(f.attempts.findOneBy).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'project', conversationId: 'conversation', threadId: 'thread' })
        )
        expect(f.invocations.findOneBy).toHaveBeenCalledWith({
            id: 'invocation',
            tenantId: 'tenant',
            organizationId: 'org',
            ownerId: 'viewer'
        })
        expect(snapshot.cards[0]).toMatchObject({
            messageId: 'message',
            executionId: 'run',
            data: { title: 'Original title' }
        })
        expect(snapshot.cards[0].data.description).toContain('succeeded')
        expect(snapshot.cards[0].data.description).not.toContain('done')
        expect(snapshot.runs[0].messageRevision).toBe('2026-10-06T00:00:00.000Z')
    })
    it('does not expose another Computer owner’s execution or foreign project attempts', async () => {
        const f = fixture()
        f.invocations.findOneBy.mockResolvedValue(null)
        const snapshot = await f.service.snapshot(f.conversation, 'thread')
        expect(snapshot.cards[0].data.description).toContain('restricted')
        expect(snapshot.cards[0].data.description).not.toContain('opencode')
        f.attempts.findOneBy.mockResolvedValue(null)
        expect((await f.service.snapshot(f.conversation, 'thread')).cards).toEqual([])
    })
    it('stops projecting cards when project permission is revoked', async () => {
        const f = fixture()
        f.projects.assertCanRead.mockRejectedValue(new Error('Forbidden'))
        await expect(f.service.snapshot(f.conversation, 'thread')).rejects.toThrow('Forbidden')
        expect(f.attempts.findOneBy).not.toHaveBeenCalled()
        expect(f.query.getMany).not.toHaveBeenCalled()
    })
})
