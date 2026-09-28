jest.mock('../../../desktop-shell/desktop-shell-operation.service', () => ({ DesktopShellOperationService: class {} }))

jest.mock('../../thread-run-control.service', () => ({ ThreadRunControlService: class {} }))
jest.mock('../../conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))
jest.mock('../../conversation.service', () => ({ ChatConversationService: class {} }))
jest.mock('../../../xpert-agent-execution/agent-execution.service', () => ({ XpertAgentExecutionService: class {} }))
jest.mock('../../../shared/', () => ({ ExecutionCancelService: class {} }))
jest.mock('../../../chat-message/chat-message.entity', () => ({ ChatMessage: class {} }))

import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { CancelConversationCommand } from '../cancel-conversation.command'
import { CancelConversationHandler } from './cancel-conversation.handler'
import type { DesktopShellOperationService } from '../../../desktop-shell/desktop-shell-operation.service'

describe('CancelConversationHandler', () => {
    function createHandler(conversation: Record<string, any> | null) {
        const messageRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) }
        const service = {
            findOne: jest.fn().mockResolvedValue(conversation),
            findOneByOptions: jest.fn().mockResolvedValue(conversation),
            repository: {
                save: jest.fn(),
                update: jest.fn().mockResolvedValue({ affected: 1 }),
                manager: { getRepository: jest.fn().mockReturnValue(messageRepository) }
            }
        }
        const executionService = { update: jest.fn().mockResolvedValue(undefined) }
        const executionCancelService = { cancelExecutions: jest.fn().mockResolvedValue(undefined) }
        const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
        const desktopShellOperations = { cancelRuns: jest.fn().mockResolvedValue(undefined) }
        const handler = new CancelConversationHandler(
            service as any,
            executionService as any,
            executionCancelService as any,
            commandBus as any,
            undefined,
            undefined,
            desktopShellOperations as unknown as DesktopShellOperationService
        )

        return {
            handler,
            service,
            messageRepository,
            executionService,
            executionCancelService,
            commandBus,
            desktopShellOperations
        }
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
        expect(context.desktopShellOperations.cancelRuns).toHaveBeenCalledWith(['execution-1'])
        expect(context.executionService.update).toHaveBeenCalledWith('execution-1', {
            status: XpertAgentExecutionStatusEnum.INTERRUPTED,
            error: 'Canceled by user'
        })
        expect(context.executionCancelService.cancelExecutions).toHaveBeenCalledWith(
            ['execution-1'],
            'Canceled by user'
        )
        expect(conversation.status).toBe('interrupted')
        expect(context.service.repository.update).toHaveBeenCalledWith(conversation.id, {
            status: 'interrupted',
            error: 'Canceled by user'
        })
        expect(context.service.repository.save).not.toHaveBeenCalled()
    })

    it('updates only the canceled message status without saving or reparenting the hydrated tree', async () => {
        const conversation = {
            id: 'conversation-1',
            messages: [
                { id: 'old-ai', role: 'ai', executionId: 'old-run', status: 'done', parentId: 'older-human' },
                {
                    id: 'current-ai',
                    role: 'ai',
                    executionId: 'current-run',
                    status: 'answering',
                    parentId: 'current-human'
                }
            ]
        }
        const context = createHandler(conversation)
        await context.handler.execute(
            new CancelConversationCommand({ conversationId: conversation.id, executionId: 'current-run' })
        )
        expect(context.messageRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: conversation.id,
                id: expect.objectContaining({ _value: ['current-ai'] })
            }),
            { status: 'aborted', error: 'Canceled by user' }
        )
        expect(conversation.messages[0]).toMatchObject({ status: 'done', parentId: 'older-human' })
        expect(conversation.messages[1].parentId).toBe('current-human')
        expect(context.service.repository.save).not.toHaveBeenCalled()
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
