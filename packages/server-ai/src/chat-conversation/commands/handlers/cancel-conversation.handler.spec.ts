import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { CancelConversationCommand } from '../cancel-conversation.command'
import { CancelConversationHandler } from './cancel-conversation.handler'

describe('CancelConversationHandler', () => {
    function createHandler(conversation: Record<string, any> | null) {
        const service = {
            findOne: jest.fn().mockResolvedValue(conversation),
            findOneByOptions: jest.fn().mockResolvedValue(conversation),
            repository: { save: jest.fn().mockImplementation(async (value) => value) }
        }
        const executionService = { update: jest.fn().mockResolvedValue(undefined) }
        const executionCancelService = { cancelExecutions: jest.fn().mockResolvedValue(undefined) }
        const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
        const handler = new CancelConversationHandler(
            service as any,
            executionService as any,
            executionCancelService as any,
            commandBus as any
        )

        return { handler, service, executionService, executionCancelService, commandBus }
    }

    it('cancels an explicit execution before its AI message has been persisted', async () => {
        const conversation = { id: 'conversation-1', status: 'processing', messages: [] }
        const context = createHandler(conversation)

        const result = await context.handler.execute(
            new CancelConversationCommand({
                conversationId: conversation.id,
                threadId: 'thread-1',
                executionId: 'execution-1'
            })
        )

        expect(result).toEqual({ canceledExecutionIds: ['execution-1'] })
        expect(context.executionService.update).toHaveBeenCalledWith('execution-1', {
            status: XpertAgentExecutionStatusEnum.INTERRUPTED,
            error: 'Canceled by user'
        })
        expect(context.executionCancelService.cancelExecutions).toHaveBeenCalledWith(
            ['execution-1'],
            'Canceled by user'
        )
        expect(conversation.status).toBe('interrupted')
        expect(context.service.repository.save).toHaveBeenCalledWith(conversation)
    })

    it('does nothing without an explicit execution or a persisted AI message', async () => {
        const context = createHandler({ id: 'conversation-1', messages: [] })

        await expect(
            context.handler.execute(new CancelConversationCommand({ conversationId: 'conversation-1' }))
        ).resolves.toEqual({ canceledExecutionIds: [] })
        expect(context.executionService.update).not.toHaveBeenCalled()
        expect(context.executionCancelService.cancelExecutions).not.toHaveBeenCalled()
    })
})
