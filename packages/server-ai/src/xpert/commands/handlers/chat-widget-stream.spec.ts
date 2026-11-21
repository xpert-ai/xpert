jest.mock('../../xpert.service', () => ({ XpertService: class {} }))
jest.mock('../../../assistant-binding/assistant-binding.service', () => ({ AssistantBindingService: class {} }))

import { of, lastValueFrom, toArray } from 'rxjs'
import { ChatMessageTypeEnum, ChatMessageEventTypeEnum, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatMessageUpsertCommand } from '../../../chat-message/commands/upsert.command'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { CreateMemoryStoreCommand } from '../../../shared/commands/create-memory-store.command'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands/chat.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertChatCommand } from '../chat.command'
import { XpertChatHandler } from './chat.handler'

it('persists the Widget position before sending following text, without waiting for message end', async () => {
    const messageId = '00000000-0000-4000-8000-000000000001'
    const actor = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    const messages: Array<ChatMessageUpsertCommand['entity']> = []
    const xpert = {
        id: 'assistant',
        graph: { nodes: [], connections: [] },
        agent: { key: 'agent' },
        memory: null,
        features: {},
        agentConfig: {}
    }
    const reference = { messageId, widgetId: 'card', threadId: 'thread', provider: '@test/cards:review' }
    const commands = {
        execute: jest.fn(async (command: unknown) => {
            if (command instanceof CreateMemoryStoreCommand) return null
            if (command instanceof ChatConversationUpsertCommand)
                return command.entity.id
                    ? command.entity
                    : {
                          id: 'conversation',
                          threadId: 'thread',
                          messages: [],
                          options: command.entity.options,
                          status: command.entity.status
                      }
            if (command instanceof XpertAgentExecutionUpsertCommand)
                return { ...command.execution, id: 'run', threadId: 'thread' }
            if (command instanceof ChatMessageUpsertCommand) {
                const saved = { id: command.entity.role === 'human' ? 'human' : messageId, ...command.entity }
                messages.push(structuredClone(saved))
                return saved
            }
            if (command instanceof XpertAgentChatCommand)
                return of(
                    {
                        data: {
                            type: ChatMessageTypeEnum.MESSAGE,
                            data: { id: 'same-model-stream', type: 'text', text: 'Before' }
                        }
                    },
                    {
                        data: {
                            type: ChatMessageTypeEnum.EVENT,
                            event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                            data: { type: 'message_widget_published', reference }
                        }
                    },
                    {
                        data: {
                            type: ChatMessageTypeEnum.MESSAGE,
                            data: { id: 'same-model-stream', type: 'text', text: 'After' }
                        }
                    },
                    {
                        data: {
                            type: ChatMessageTypeEnum.EVENT,
                            event: ChatMessageEventTypeEnum.ON_AGENT_END,
                            data: { id: 'run', status: XpertAgentExecutionStatusEnum.SUCCESS }
                        }
                    }
                )
            return null
        })
    }
    const handler = new XpertChatHandler(
        { findOneForRuntime: async () => xpert } as never,
        {
            getBinding: async () => ({ assistantId: xpert.id }),
            getUserPreferenceByAssistantId: async () => null
        } as never,
        commands as never,
        { execute: async () => null } as never,
        { getByConversationId: async () => null } as never,
        { getAccessiblePublishedXpertFamilyIds: async () => [xpert.id] } as never,
        { wrapChatStream: (stream: unknown) => stream } as never,
        { assertRuntimeAccess: jest.fn() } as never
    )
    try {
        const stream = await handler.execute(
            new XpertChatCommand(
                { action: 'send', message: { input: { input: 'Show a card' } } },
                { xpertId: xpert.id, from: 'debugger' }
            )
        )
        const events = await lastValueFrom(stream.pipe(toArray()))
        const writes = messages.filter((message) => message.role === 'ai' && Array.isArray(message.content))
        expect(writes).toHaveLength(2)
        expect(writes[0].content).toMatchObject([
            { text: 'Before' },
            { id: 'card', data: { type: 'Widget', widgets: [] } }
        ])
        expect(writes[1].content).toMatchObject([{ text: 'Before' }, { id: 'card' }, { text: 'After' }])
        const widgetIndex = events.findIndex((event) => event.data.widgetReference?.widgetId === 'card')
        const afterIndex = events.findIndex((event) => event.data.data?.text === 'After')
        const endIndex = events.findIndex((event) => event.data.event === ChatMessageEventTypeEnum.ON_MESSAGE_END)
        expect(widgetIndex).toBeGreaterThan(-1)
        expect(widgetIndex).toBeLessThan(afterIndex)
        expect(afterIndex).toBeLessThan(endIndex)
        expect(events[afterIndex].data.data.id).not.toBe('same-model-stream')
    } finally {
        actor.mockRestore()
    }
})
