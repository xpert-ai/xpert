jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { AuthorizeGroupTaskCallerCommand } from '../../chat-group/group-project/group-task.commands'
import { getRepositoryToken } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'

describe('Project task caller authorization', () => {
    afterEach(() => jest.restoreAllMocks())
    async function fixture() {
        const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        const projectId = randomUUID()
        const caller = {
            type: 'xpert' as const,
            executionId: randomUUID(),
            conversationId: randomUUID(),
            xpertId: randomUUID(),
            agentKey: 'main',
            threadId: 'thread',
            sourceMessageId: 'message'
        }
        const conversation = {
            id: caller.conversationId,
            threadId: 'thread',
            createdById: actor.userId,
            purpose: 'chat'
        }
        const commands = { execute: jest.fn() }
        const execution = {
            id: caller.executionId,
            xpertId: caller.xpertId,
            threadId: 'thread',
            agentKey: 'main',
            xpert: { workspaceId: randomUUID() }
        }
        const conversations = { findOneBy: jest.fn(async () => conversation) }
        const executions = { findOne: jest.fn(async () => execution) }
        const access = {
            assertCanEdit: jest.fn(async () => ({ project: { workspaceId: 'project-workspace' } })),
            assertCanUseXpert: jest.fn()
        }
        const module = await Test.createTestingModule({
            providers: [
                ProjectTaskRuntimeContextService,
                { provide: CommandBus, useValue: commands },
                { provide: XpertProjectAccessService, useValue: access },
                { provide: getRepositoryToken(ChatConversation), useValue: conversations },
                { provide: getRepositoryToken(XpertAgentExecution), useValue: executions }
            ]
        }).compile()
        return {
            service: module.get(ProjectTaskRuntimeContextService),
            actor,
            caller,
            projectId,
            access,
            conversation,
            execution,
            conversations,
            executions,
            commands
        }
    }
    it('revalidates the explicit responsible Assistant using the captured actor scope', async () => {
        const f = await fixture()
        const scope = await f.service.resolve(f.projectId, f.caller)
        const assignee = randomUUID()
        await f.service.assertResponsibleAssistant(scope, assignee)
        expect(f.access.assertCanUseXpert).toHaveBeenLastCalledWith(f.projectId, assignee, scope)
        f.access.assertCanUseXpert.mockRejectedValueOnce(new Error('Not a project member'))
        await expect(f.service.assertResponsibleAssistant(scope, assignee)).rejects.toThrow('Not a project member')
    })
    it('derives the scope from the authenticated actor and owned execution, never model input', async () => {
        const f = await fixture()
        expect(await f.service.resolve(f.projectId, f.caller)).toEqual({
            ...f.actor,
            projectId: f.projectId,
            conversationId: f.caller.conversationId,
            parentExecutionId: f.caller.executionId,
            callerXpertId: f.caller.xpertId,
            callerAgentKey: 'main',
            workspaceId: f.execution.xpert.workspaceId
        })
        expect(f.conversations.findOneBy).toHaveBeenCalledWith({
            id: f.caller.conversationId,
            projectId: f.projectId,
            tenantId: f.actor.tenantId,
            organizationId: f.actor.organizationId
        })
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
    it('authorizes later group initiators through group policy while retaining private conversation ownership', async () => {
        const f = await fixture()
        f.conversation.createdById = randomUUID()
        await expect(f.service.resolve(f.projectId, f.caller)).rejects.toThrow()
        expect(f.commands.execute).not.toHaveBeenCalled()
        f.conversation.purpose = 'group_assistant_runtime'
        const scope = await f.service.resolve(f.projectId, f.caller)
        expect(f.commands.execute).toHaveBeenCalledWith(new AuthorizeGroupTaskCallerCommand(scope))
        expect(f.executions.findOne).toHaveBeenLastCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ createdById: f.actor.userId })
            })
        )
        f.commands.execute.mockRejectedValueOnce(new Error('Group membership revoked'))
        await expect(f.service.resolve(f.projectId, f.caller)).rejects.toThrow('Group membership revoked')
    })
    it('authorizes the explicitly typed Project general agent against the project workspace', async () => {
        const f = await fixture()
        Object.assign(f.execution, { xpertId: null, xpert: null, type: 'project_agent', agentKey: 'general_agent' })
        const caller = { ...f.caller, type: 'project_agent' as const, xpertId: undefined, agentKey: 'general_agent' }
        expect(await f.service.resolve(f.projectId, caller)).toMatchObject({
            callerType: 'project_agent',
            workspaceId: 'project-workspace',
            callerAgentKey: 'general_agent'
        })
        expect(f.access.assertCanUseXpert).not.toHaveBeenCalled()
        Object.assign(f.execution, { type: 'agent' })
        await expect(f.service.resolve(f.projectId, caller)).rejects.toThrow()
    })
    it.each(['project', 'assistant', 'conversation', 'execution', 'thread', 'agentKey'])(
        'rejects a mismatched %s',
        async (field) => {
            const f = await fixture()
            if (field === 'project') f.access.assertCanEdit.mockRejectedValue(new Error('Denied'))
            if (field === 'assistant') f.execution.xpertId = randomUUID()
            if (field === 'conversation') f.conversations.findOneBy.mockResolvedValue(null)
            if (field === 'execution') f.executions.findOne.mockResolvedValue(null)
            if (field === 'thread') f.execution.threadId = 'other'
            if (field === 'agentKey') f.execution.agentKey = 'other'
            await expect(f.service.resolve(f.projectId, f.caller)).rejects.toThrow()
        }
    )
    it('rejects extra caller identity fields at the command boundary', async () => {
        const f = await fixture()
        await expect(f.service.resolve(f.projectId, { ...f.caller, ...f.actor })).rejects.toThrow()
        expect(f.access.assertCanEdit).not.toHaveBeenCalled()
    })
})
