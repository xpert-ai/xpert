import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { GroupAccessService } from './group-access.service'
import { GroupRuntimeViewService } from './group-runtime-view.service'
import { GroupMessageRecipient, GroupParticipant } from './group.entity'
import { GetGroupConversationEntryCommand } from './group-conversation-entry.command'
import { GetGroupConversationEntryHandler } from './group-conversation-entry.handler'

async function fixture() {
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const group = Object.assign(new ChatConversation(), {
        ...scope,
        id: randomUUID(),
        threadId: randomUUID(),
        xpertId: randomUUID(),
        title: 'Group D',
        purpose: 'group'
    })
    const member = Object.assign(new GroupParticipant(), {
        ...scope,
        id: randomUUID(),
        groupId: group.id,
        subjectId: randomUUID(),
        name: 'Assistant C',
        kind: 'assistant',
        active: true,
        runtimeThreadId: randomUUID(),
        runtimeConversationId: randomUUID()
    })
    const runtime = Object.assign(new ChatConversation(), {
        ...scope,
        id: member.runtimeConversationId,
        threadId: member.runtimeThreadId,
        xpertId: member.subjectId,
        purpose: 'group_assistant_runtime'
    })
    const execution = Object.assign(new XpertAgentExecution(), {
        ...scope,
        id: randomUUID(),
        threadId: runtime.threadId,
        xpertId: member.subjectId,
        status: 'success'
    })
    const now = new Date('2026-10-10T01:00:00Z')
    const question = Object.assign(new ChatMessage(), { id: randomUUID(), content: 'Public question' })
    const input = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        role: 'human',
        content: 'Private generated context',
        executionId: execution.id,
        createdAt: now
    })
    const output = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        role: 'ai',
        content: 'Answer',
        executionId: execution.id,
        createdAt: now
    })
    const source = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        groupPublicationId: `output:${output.id}`,
        groupCommunication: {
            intent: 'message',
            senderId: member.id,
            recipientIds: [],
            rootMessageId: question.id,
            rootUserId: randomUUID(),
            hop: 1
        }
    })
    const receipt = Object.assign(new GroupMessageRecipient(), {
        ...scope,
        id: randomUUID(),
        groupId: group.id,
        participantId: member.id,
        messageId: question.id,
        executionId: execution.id,
        inputMessageId: input.id
    })
    const access = {
        authorize: jest.fn().mockResolvedValue({ group }),
        assistant: jest.fn().mockResolvedValue({ workspaceId: 'workspace', avatar: { type: 'emoji', emoji: '💡' } })
    }
    const workspace = { assertCanRead: jest.fn().mockResolvedValue(undefined) }
    const project = { assertCanReadXpert: jest.fn().mockResolvedValue(undefined) }
    const members = { findOneBy: jest.fn().mockResolvedValue(member) }
    const conversations = { findOneBy: jest.fn().mockResolvedValue(runtime) }
    const executions = { findOneBy: jest.fn().mockResolvedValue(execution) }
    const receipts = { findOneBy: jest.fn().mockResolvedValue(receipt), findBy: jest.fn().mockResolvedValue([receipt]) }
    const messages = {
        findOneBy: jest.fn(async (where: { id: string }) => (where.id === source.id ? source : output)),
        find: jest.fn().mockResolvedValue([
            input,
            Object.assign(new ChatMessage(), {
                id: randomUUID(),
                role: 'human',
                content: 'Unmatched machine input',
                createdAt: now
            }),
            output
        ]),
        findBy: jest.fn().mockResolvedValue([question])
    }
    const module = await Test.createTestingModule({
        providers: [
            GroupRuntimeViewService,
            GetGroupConversationEntryHandler,
            {
                provide: DataSource,
                useValue: {
                    getRepository: (entity: unknown) => {
                        if (entity === GroupParticipant) return members
                        if (entity === ChatConversation) return conversations
                        if (entity === XpertAgentExecution) return executions
                        if (entity === GroupMessageRecipient) return receipts
                        if (entity === ChatMessage) return messages
                        throw new Error('Unexpected entity')
                    }
                }
            },
            { provide: GroupAccessService, useValue: access },
            { provide: XpertWorkspaceAccessService, useValue: workspace },
            { provide: XpertProjectAccessService, useValue: project }
        ]
    }).compile()
    return {
        view: module.get(GroupRuntimeViewService),
        entry: module.get(GetGroupConversationEntryHandler),
        scope,
        group,
        member,
        runtime,
        execution,
        input,
        output,
        source,
        receipt,
        access,
        workspace,
        project,
        members,
        conversations,
        executions,
        receipts,
        messages
    }
}

describe('group execution view', () => {
    it('binds an Assistant output to its exact execution and replaces generated context with public questions', async () => {
        const {
            view,
            scope,
            group,
            member,
            runtime,
            execution,
            source,
            output,
            input,
            members,
            conversations,
            executions,
            messages
        } = await fixture()
        const result = await view.get(group.id, source.id, member.id)
        expect(result).toMatchObject({
            conversationId: runtime.id,
            threadId: runtime.threadId,
            executionId: execution.id,
            messageId: output.id,
            participantId: member.id,
            avatar: { type: 'emoji', emoji: '💡' }
        })
        expect(result.messages.map((message) => ({ id: message.id, content: message.content }))).toEqual([
            { id: input.id, content: 'Public question' },
            { id: output.id, content: 'Answer' }
        ])
        expect(JSON.stringify(result)).not.toContain('Private generated context')
        expect(JSON.stringify(result)).not.toContain('Unmatched machine input')
        expect(members.findOneBy).toHaveBeenCalledWith({
            ...scope,
            id: member.id,
            groupId: group.id,
            kind: 'assistant',
            active: true
        })
        expect(conversations.findOneBy).toHaveBeenCalledWith({
            ...scope,
            id: runtime.id,
            threadId: runtime.threadId,
            purpose: 'group_assistant_runtime'
        })
        expect(messages.findOneBy).toHaveBeenCalledWith({ ...scope, id: source.id, conversationId: group.id })
        expect(messages.findOneBy).toHaveBeenCalledWith({
            ...scope,
            id: output.id,
            conversationId: runtime.id,
            role: 'ai'
        })
        expect(executions.findOneBy).toHaveBeenCalledWith({
            ...scope,
            id: execution.id,
            threadId: runtime.threadId,
            xpertId: member.subjectId
        })
    })

    it('resolves a human question through its recipient receipt and input anchor', async () => {
        const { view, scope, group, member, source, input, execution, receipts } = await fixture()
        source.groupCommunication.senderId = randomUUID()
        source.groupPublicationId = null
        const result = await view.get(group.id, source.id, member.id)
        expect(result.executionId).toBe(execution.id)
        expect(result.messageId).toBe(input.id)
        expect(receipts.findOneBy).toHaveBeenCalledWith({
            ...scope,
            groupId: group.id,
            messageId: source.id,
            participantId: member.id
        })
    })

    it('resolves a tool publication through its server-generated execution key', async () => {
        const { view, group, member, source, execution } = await fixture()
        source.groupPublicationId = `tool:${execution.id}:tool-call-1`
        const result = await view.get(group.id, source.id, member.id)
        expect(result.executionId).toBe(execution.id)
        expect(result.messageId).toBeUndefined()
    })

    it.each(['group', 'assistant', 'workspace', 'project'] as const)(
        'does not substitute group membership for %s access',
        async (denied) => {
            const { view, group, member, runtime, source, access, workspace, project, messages } = await fixture()
            runtime.projectId = randomUUID()
            const error = new Error(`${denied} denied`)
            if (denied === 'group') access.authorize.mockRejectedValue(error)
            if (denied === 'assistant') access.assistant.mockRejectedValue(error)
            if (denied === 'workspace') workspace.assertCanRead.mockRejectedValue(error)
            if (denied === 'project') project.assertCanReadXpert.mockRejectedValue(error)
            await expect(view.get(group.id, source.id, member.id)).rejects.toThrow(`${denied} denied`)
            expect(messages.find).not.toHaveBeenCalled()
            if (denied === 'project')
                expect(project.assertCanReadXpert).toHaveBeenCalledWith(runtime.projectId, member.subjectId)
        }
    )

    it.each(['member', 'runtime', 'runtime-assistant', 'source', 'execution'] as const)(
        'fails closed when the %s binding is missing or changed',
        async (invalid) => {
            const { view, group, member, source, runtime, members, conversations, messages, executions } =
                await fixture()
            if (invalid === 'member') members.findOneBy.mockResolvedValue(null)
            if (invalid === 'runtime') conversations.findOneBy.mockResolvedValue(null)
            if (invalid === 'runtime-assistant') runtime.xpertId = randomUUID()
            if (invalid === 'source') messages.findOneBy.mockResolvedValue(null)
            if (invalid === 'execution') executions.findOneBy.mockResolvedValue(null)
            await expect(view.get(group.id, source.id, member.id)).rejects.toMatchObject({ status: 403 })
            expect(messages.find).not.toHaveBeenCalled()
        }
    )

    it('does not infer execution links from message text or from an unstarted receipt', async () => {
        const { view, group, member, source, execution, receipts, messages } = await fixture()
        source.groupPublicationId = 'unrecognized'
        source.content = `tool:${execution.id}:fake`
        await expect(view.get(group.id, source.id, member.id)).rejects.toMatchObject({ status: 409 })
        source.groupCommunication.senderId = randomUUID()
        receipts.findOneBy.mockResolvedValue(null)
        await expect(view.get(group.id, source.id, member.id)).rejects.toMatchObject({ status: 409 })
        expect(messages.find).not.toHaveBeenCalled()
    })
})

describe('group shared ChatKit entry', () => {
    it('returns only authorized public entry metadata', async () => {
        const { entry, access, group } = await fixture()
        const result = await entry.execute(new GetGroupConversationEntryCommand(group.id))
        expect(access.authorize).toHaveBeenCalledWith(group.id)
        expect(result).toEqual({
            id: group.id,
            threadId: group.threadId,
            xpertId: group.xpertId,
            title: group.title,
            purpose: 'group'
        })
    })

    it('propagates membership denial without returning entry metadata', async () => {
        const { entry, access, group } = await fixture()
        access.authorize.mockRejectedValue(new Error('membership denied'))
        await expect(entry.execute(new GetGroupConversationEntryCommand(group.id))).rejects.toThrow('membership denied')
    })
})
