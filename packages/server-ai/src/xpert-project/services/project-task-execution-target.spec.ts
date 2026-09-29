import { ProjectTaskGraphService, projectTaskIdentity } from './project-task-graph.service'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectTaskProviderRegistry } from '@xpert-ai/plugin-sdk'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'

const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
async function fixture() {
    const manager = { findOneBy: jest.fn(), existsBy: jest.fn() }
    const access = { listReadable: jest.fn().mockResolvedValue([{ id: 'project' }]), assertEdit: jest.fn() }
    const providers = { list: jest.fn().mockReturnValue([]) }
    const module = await Test.createTestingModule({
        providers: [
            ProjectTaskGraphService,
            { provide: getRepositoryToken(XpertProjectTask), useValue: { manager } },
            { provide: ProjectAccessRuntimeService, useValue: access },
            { provide: ProjectTaskProviderRegistry, useValue: providers }
        ]
    }).compile()
    return { service: module.get(ProjectTaskGraphService), manager, access, providers }
}

describe('project task execution identity and navigation', () => {
    it('keeps stable task identities on replay and isolates providers and projects', () => {
        expect(projectTaskIdentity('p', 'bid', 'step')).toBe(projectTaskIdentity('p', 'bid', 'step'))
        expect(
            new Set(
                ['p', 'other'].flatMap((project) =>
                    ['bid', 'other'].map((provider) => projectTaskIdentity(project, provider, 'step'))
                )
            ).size
        ).toBe(4)
    })
    it('requires project membership before reading provider or execution data', async () => {
        const f = await fixture()
        f.access.listReadable.mockResolvedValue([])
        await expect(f.service.graph(context)).rejects.toThrow()
        await expect(f.service.resolveExecution(context, 'attempt')).rejects.toThrow()
        expect(f.providers.list).not.toHaveBeenCalled()
        expect(f.manager.findOneBy).not.toHaveBeenCalled()
    })
    it('resolves nested expert attempts through the real root message rather than the latest conversation', async () => {
        const f = await fixture()
        f.manager.findOneBy.mockImplementation(async (entity, where) => {
            if (entity === XpertProjectTaskExecution)
                return { id: 'attempt-2', taskId: 'task', conversationId: 'conversation', agentExecutionId: 'figure-2' }
            if (entity === ChatConversation)
                return { id: 'conversation', threadId: 'thread', xpertId: 'primary-assistant' }
            if (entity === XpertAgentExecution)
                return where.id === 'figure-2'
                    ? { id: 'figure-2', parentId: 'writer-2' }
                    : where.id === 'writer-2'
                      ? { id: 'writer-2', parentId: 'root-2' }
                      : { id: 'root-2' }
            return null
        })
        f.manager.existsBy.mockImplementation(async (_entity, where) => where.executionId === 'root-2')
        expect(await f.service.resolveExecution(context, 'attempt-2')).toMatchObject({
            taskExecutionId: 'attempt-2',
            conversationId: 'conversation',
            agentExecutionId: 'figure-2',
            xpertId: 'primary-assistant'
        })
        expect(f.manager.findOneBy).toHaveBeenCalledWith(
            ChatConversation,
            expect.objectContaining({ projectId: 'project', tenantId: 'tenant', organizationId: 'org' })
        )
    })
    it('rejects records whose conversation belongs to a different project', async () => {
        const f = await fixture()
        f.manager.findOneBy.mockImplementation(async (entity) =>
            entity === XpertProjectTaskExecution
                ? { id: 'attempt', conversationId: 'foreign', agentExecutionId: 'foreign-run' }
                : null
        )
        await expect(f.service.resolveExecution(context, 'attempt')).rejects.toThrow()
        expect(f.manager.existsBy).not.toHaveBeenCalled()
    })
    it('opens the recorded conversation branch instead of its current default thread', async () => {
        const f = await fixture()
        f.manager.findOneBy.mockImplementation(async (entity) => {
            if (entity === XpertProjectTaskExecution)
                return {
                    id: 'attempt',
                    taskId: 'task',
                    conversationId: 'conversation',
                    threadId: 'branch',
                    agentExecutionId: 'expert'
                }
            if (entity === ChatConversation)
                return { id: 'conversation', threadId: 'main', xpertId: 'primary-assistant' }
            if (entity === ChatConversationThread) return { threadId: 'branch', conversationId: 'conversation' }
            if (entity === XpertAgentExecution) return { id: 'expert' }
            return null
        })
        f.manager.existsBy.mockResolvedValue(true)
        expect(await f.service.resolveExecution(context, 'attempt')).toMatchObject({
            threadId: 'branch',
            agentExecutionId: 'expert'
        })
        f.manager.findOneBy.mockImplementation(async (entity) => {
            if (entity === XpertProjectTaskExecution)
                return {
                    id: 'attempt',
                    conversationId: 'conversation',
                    threadId: 'foreign',
                    agentExecutionId: 'expert'
                }
            if (entity === ChatConversation)
                return { id: 'conversation', threadId: 'main', xpertId: 'primary-assistant' }
            if (entity === ChatConversationThread) return { threadId: 'foreign', conversationId: 'other-conversation' }
            return null
        })
        await expect(f.service.resolveExecution(context, 'attempt')).rejects.toThrow()
    })
})
