import { DiscoverConversationResourcesCommand } from '../content-resource/commands/discover-conversation-resources.command'
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { GroupResourceToolsService } from './group-resource-tools.service'
import { GroupAccessService } from './group-access.service'
import { GroupMessagesService } from './group-messages.service'
import { GroupParticipant, GroupMessageRecipient } from './group.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'

async function fixture() {
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const userId = randomUUID(),
        senderId = randomUUID(),
        clientMessageId = randomUUID()
    const group = Object.assign(new ChatConversation(), scope, { id: randomUUID(), projectId: randomUUID() })
    const member = Object.assign(new GroupParticipant(), scope, {
        id: randomUUID(),
        groupId: group.id,
        subjectId: randomUUID(),
        runtimeThreadId: randomUUID(),
        runtimeConversationId: randomUUID(),
        active: true
    })
    const source = Object.assign(new ChatMessage(), scope, {
        id: randomUUID(),
        role: 'human',
        createdById: userId,
        messageEnvelope: { correlation: { messageId: clientMessageId } },
        groupCommunication: {
            intent: 'request',
            senderId,
            recipientIds: [member.id],
            rootMessageId: randomUUID(),
            rootUserId: userId,
            hop: 0
        }
    })
    const receipt = Object.assign(new GroupMessageRecipient(), scope, {
        id: randomUUID(),
        groupId: group.id,
        messageId: source.id,
        executionId: randomUUID()
    })
    const thread = Object.assign(new ChatConversationThread(), {
        status: 'busy',
        runControl: { executionId: receipt.executionId }
    })
    const referenceId = randomUUID()
    const execute = jest.fn().mockImplementation(async (command: object) =>
        command instanceof DiscoverConversationResourcesCommand
            ? {
                  items: [
                      {
                          resource: { kind: 'group-reference', id: referenceId },
                          projectId: group.projectId,
                          title: 'Inventory'
                      }
                  ],
                  nextCursor: null
              }
            : {
                  items: [
                      {
                          resource: { kind: 'group-reference', id: referenceId },
                          projectId: group.projectId,
                          title: 'Inventory'
                      }
                  ],
                  hasMore: false
              }
    )
    const publish = jest.fn().mockResolvedValue({})
    const module = await Test.createTestingModule({
        providers: [
            GroupResourceToolsService,
            { provide: CommandBus, useValue: { execute } },
            { provide: GroupMessagesService, useValue: { publish } },
            {
                provide: GroupAccessService,
                useValue: {
                    assistant: jest.fn(),
                    withRootUser: async (_group: ChatConversation, user: string, callback: () => Promise<unknown>) => {
                        expect(user).toBe(userId)
                        return callback()
                    }
                }
            },
            {
                provide: DataSource,
                useValue: {
                    getRepository: (entity: object) => ({
                        findOneBy: async () => {
                            if (entity === ChatConversationThread) return thread
                            if (entity === GroupParticipant) return member.active ? member : null
                            if (entity === ChatConversation) return group
                            if (entity === ChatMessage) return source
                            throw new Error('Unexpected repository')
                        }
                    })
                }
            }
        ]
    }).compile()
    return {
        scope,
        userId,
        senderId,
        clientMessageId,
        group,
        member,
        source,
        receipt,
        thread,
        execute,
        publish,
        tools: [
            ...module.get(GroupResourceToolsService).createNavigationTools(receipt, member),
            ...module.get(GroupResourceToolsService).createAnalysisTools(receipt, member)
        ]
    }
}

it('binds metadata access to the actual human and emits an inert fallback plus a targeted request', async () => {
    const f = await fixture()
    await f.tools[1].invoke({ name: 'resource_open', type: 'tool_call', id: 'call-1', args: { query: 'Inventory' } })
    expect(f.execute.mock.calls[0][0]).toMatchObject({
        scope: {
            actor: { ...f.scope, userId: f.userId },
            projectId: f.group.projectId,
            conversationId: f.member.runtimeConversationId,
            assistantId: f.member.subjectId
        }
    })
    expect(f.publish.mock.calls[0][4]).toBe(`tool:${f.receipt.executionId}:call-1`)
    expect(f.publish.mock.calls[0][7]).toMatchObject({
        resourceNavigation: { participantId: f.senderId, clientMessageId: f.clientMessageId },
        resourceLinks: [{ projectId: f.group.projectId }]
    })
})

it('rejects old executions, removed members and Assistant/background requests before directory access', async () => {
    for (const mutate of [
        (f: Awaited<ReturnType<typeof fixture>>) => {
            f.thread.runControl.executionId = randomUUID()
        },
        (f: Awaited<ReturnType<typeof fixture>>) => {
            f.member.active = false
        },
        (f: Awaited<ReturnType<typeof fixture>>) => {
            f.source.role = 'ai'
        }
    ]) {
        const f = await fixture()
        mutate(f)
        await expect(f.tools[0].invoke({ query: 'Inventory' })).rejects.toThrow()
        expect(f.execute).not.toHaveBeenCalled()
        expect(f.publish).not.toHaveBeenCalled()
    }
})

it('does not publish after reference authorization is revoked', async () => {
    const f = await fixture()
    f.execute.mockRejectedValueOnce(new Error('revoked'))
    await expect(f.tools[1].invoke({ query: 'Inventory' })).rejects.toThrow('revoked')
    expect(f.publish).not.toHaveBeenCalled()
})

it('binds headless data analysis to the human, Assistant and active execution, rejecting supplied scope', async () => {
    const f = await fixture()
    const describe = f.tools.find((tool) => tool.name === 'resource_describe')
    const query = f.tools.find((tool) => tool.name === 'resource_query')
    const referenceId = randomUUID()
    await describe.invoke({ referenceId })
    expect(f.execute.mock.calls[0][0]).toMatchObject({
        actor: { ...f.scope, userId: f.userId },
        groupId: f.group.id,
        assistantId: f.member.subjectId,
        executionId: f.receipt.executionId,
        operation: { kind: 'describe', referenceId }
    })
    f.execute.mockClear()
    await expect(query.invoke({ referenceId, query: { datasetKey: 'stock', actorId: randomUUID() } })).rejects.toThrow()
    expect(f.execute).not.toHaveBeenCalled()
    f.member.active = false
    await expect(describe.invoke({ referenceId })).rejects.toThrow()
    expect(f.execute).not.toHaveBeenCalled()
})
