import { randomUUID } from 'node:crypto'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../../agent-invocation/invocation.entity'
import { ProjectPipelineTaskLinkEntity } from '../pipeline/persistence/pipeline.entity'
import { ProjectPipelineProjectionProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectTaskProjectionService } from './task-projection/project-task-projection.service'
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
            { provide: ProjectPipelineProjectionProviderRegistry, useValue: { listForActor: () => [] } },
            ProjectTaskGraphService,
            { provide: ProjectTaskProjectionService, useValue: { diagnostics: async () => [], request: jest.fn() } },
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
    it('opens an owned Pipeline Invocation through its exact task link without inventing a conversation', async () => {
        const f = await fixture(),
            id = randomUUID(),
            operationId = randomUUID()
        const c = { projectId: id, actor: { tenantId: id, organizationId: id, userId: id } }
        const attempt = { id, invocationId: id, taskId: id, sourceKey: operationId }
        const invocation = {
            id,
            scope: {
                tenantId: id,
                organizationId: id,
                userId: id,
                projectId: id,
                workspaceId: id,
                callerType: 'project_pipeline',
                callerAgentKey: 'pipeline_node',
                parentExecutionId: `pipeline-operation:${operationId}`,
                pipelineOrigin: {
                    instanceId: id,
                    runId: id,
                    roundId: id,
                    nodeInstanceId: id,
                    operationId,
                    generation: 1,
                    inputDigest: 'a'.repeat(64)
                }
            },
            request: { callId: operationId, target: { bindingId: id } }
        }
        f.manager.findOneBy.mockImplementation(async (entity) =>
            entity === XpertProjectTaskExecution
                ? attempt
                : entity === AgentInvocationEntity
                  ? { invocation }
                  : entity === AgentRuntimeBindingEntity
                    ? { workspaceIds: [id] }
                    : null
        )
        f.manager.existsBy.mockImplementation(
            async (entity, where) =>
                entity === ProjectPipelineTaskLinkEntity && where.nodeInstanceId === id && where.taskId === id
        )
        expect(await f.service.resolveExecution(c, id)).toEqual({
            kind: 'runtime_invocation',
            projectId: id,
            taskId: id,
            taskExecutionId: id,
            invocationId: id,
            codingInvocationId: undefined
        })
        expect(f.manager.findOneBy.mock.calls.some(([entity]) => entity === ChatConversation)).toBe(false)
        f.manager.existsBy.mockResolvedValue(false)
        await expect(f.service.resolveExecution(c, id)).rejects.toThrow()
        f.manager.existsBy.mockResolvedValue(true)
        invocation.scope.userId = randomUUID()
        await expect(f.service.resolveExecution(c, id)).rejects.toThrow()
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
