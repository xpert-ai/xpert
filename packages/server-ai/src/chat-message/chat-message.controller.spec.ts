jest.mock('@xpert-ai/server-core', () => ({
    TransformInterceptor: class TransformInterceptor {},
    UUIDValidationPipe: class UUIDValidationPipe {}
}))

jest.mock('./commands', () => ({
    SuggestedQuestionsCommand: class SuggestedQuestionsCommand {
        constructor(public readonly params: { messageId: string }) {}
    }
}))

jest.mock('./chat-message.service', () => ({
    ChatMessageService: class ChatMessageService {}
}))

import { ChatMessageController } from './chat-message.controller'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'

describe('ChatMessageController', () => {
    it('does not expose generic CRUD routes that can read or bind file relations', () => {
        const controller = new ChatMessageController({} as never, { execute: jest.fn() } as never, {} as never)
        const legacyCrud = controller as ChatMessageController & {
            findById?: unknown
            findAll?: unknown
            create?: unknown
            update?: unknown
            delete?: unknown
        }

        expect(legacyCrud.findById).toBeUndefined()
        expect(legacyCrud.findAll).toBeUndefined()
        expect(legacyCrud.create).toBeUndefined()
        expect(legacyCrud.update).toBeUndefined()
        expect(legacyCrud.delete).toBeUndefined()
    })

    it('authorizes the parent conversation before generating suggested questions', async () => {
        const service = {
            findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
                id: 'message-1',
                conversationId: 'conversation-1'
            })
        }
        const commandBus = { execute: jest.fn().mockResolvedValue(['Next?']) }
        const queryBus = { execute: jest.fn().mockResolvedValue({ id: 'conversation-1' }) }
        const controller = new ChatMessageController(service as never, commandBus as never, queryBus as never)

        await expect(controller.suggestedQuestions('message-1')).resolves.toEqual(['Next?'])

        expect(queryBus.execute).toHaveBeenCalledWith(new AssertChatConversationAccessQuery({ id: 'conversation-1' }))
        expect(queryBus.execute.mock.invocationCallOrder[0]).toBeLessThan(
            commandBus.execute.mock.invocationCallOrder[0]
        )
    })
})
