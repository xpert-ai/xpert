import type { RemoveEvent, SoftRemoveEvent } from 'typeorm'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ChatMessageSubscriber } from '../chat-message/chat-message.subscriber'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationSubscriber } from '../chat-conversation/conversation.subscriber'
import { McpAppHistory } from './mcp-app-history.entity'

describe('MCP App history follows message retention', () => {
    it.each(['beforeSoftRemove', 'beforeRemove'] as const)(
        'cleans only the removed message cards: %s',
        async (method) => {
            const manager = {
                findOne: jest.fn().mockResolvedValue({
                    tenantId: 'tenant',
                    events: [
                        { data: { type: 'McpApp', appInstanceId: 'first' } },
                        { data: { type: 'McpApp', appInstanceId: 'second' } }
                    ]
                }),
                delete: jest.fn()
            }
            const event = { entity: { id: 'message' }, manager } as unknown as RemoveEvent<ChatMessage> &
                SoftRemoveEvent<ChatMessage>
            await new ChatMessageSubscriber()[method](event)
            expect(manager.findOne).toHaveBeenCalledWith(ChatMessage, { where: { id: 'message' }, withDeleted: true })
            expect(manager.delete).toHaveBeenCalledWith(McpAppHistory, {
                id: expect.objectContaining({ _value: ['first', 'second'] }),
                tenantId: 'tenant'
            })
        }
    )
    it('clears conversation history on a soft remove as well as physical FK cascade', async () => {
        const manager = { delete: jest.fn() }
        await new ChatConversationSubscriber().beforeSoftRemove({
            entity: { id: 'conversation' },
            manager
        } as unknown as SoftRemoveEvent<ChatConversation>)
        expect(manager.delete).toHaveBeenCalledWith(McpAppHistory, { conversationId: 'conversation' })
    })
})
