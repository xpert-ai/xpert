import { ForbiddenException } from '@nestjs/common'
import { ChatMessageFeedbackRatingEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ChatMessageFeedbackController } from './feedback.controller'

describe('ChatMessageFeedbackController authorization boundary', () => {
    let service: {
        createAuthorized: jest.Mock
        deleteAuthorized: jest.Mock
        deleteSummary: jest.Mock
        findAllAuthorized: jest.Mock
        findOneAuthorized: jest.Mock
        triggerSummary: jest.Mock
        updateAuthorized: jest.Mock
    }
    let controller: ChatMessageFeedbackController

    beforeEach(() => {
        service = {
            createAuthorized: jest.fn(),
            deleteAuthorized: jest.fn(),
            deleteSummary: jest.fn(),
            findAllAuthorized: jest.fn(),
            findOneAuthorized: jest.fn(),
            triggerSummary: jest.fn().mockResolvedValue(undefined),
            updateAuthorized: jest.fn()
        }
        controller = new ChatMessageFeedbackController(service as never)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it.each(['message.fileAssets', 'message.attachments', 'conversation.messages.fileAssets'])(
        'rejects managed-file relation expansion from the legacy feedback list: %s',
        async (relation) => {
            await expect(
                controller.findAll(
                    {
                        where: { conversationId: 'conversation-1' },
                        relations: [relation],
                        take: 20,
                        skip: 0,
                        order: {},
                        withDeleted: false
                    },
                    undefined,
                    undefined
                )
            ).rejects.toBeInstanceOf(ForbiddenException)

            expect(service.findAllAuthorized).not.toHaveBeenCalled()
        }
    )

    it('passes only feedback fields and authorized target ids to create', async () => {
        const feedback = { id: 'feedback-1' }
        service.createAuthorized.mockResolvedValue(feedback)

        await expect(
            controller.create({
                conversationId: 'conversation-1',
                messageId: 'message-1',
                rating: ChatMessageFeedbackRatingEnum.LIKE,
                content: 'useful',
                createdById: 'attacker',
                tenantId: 'victim-tenant'
            } as never)
        ).resolves.toBe(feedback)

        expect(service.createAuthorized).toHaveBeenCalledWith({
            conversationId: 'conversation-1',
            messageId: 'message-1',
            rating: ChatMessageFeedbackRatingEnum.LIKE,
            content: 'useful'
        })
    })

    it('does not trigger summary work when target authorization rejects create', async () => {
        service.createAuthorized.mockRejectedValue(new ForbiddenException())

        await expect(
            controller.create({
                conversationId: 'victim-conversation',
                messageId: 'victim-message',
                rating: ChatMessageFeedbackRatingEnum.LIKE
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.triggerSummary).not.toHaveBeenCalled()
    })

    it('authorizes summary cleanup before deleting feedback', async () => {
        service.deleteSummary.mockRejectedValue(new ForbiddenException())

        await expect(controller.delete('victim-feedback')).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.deleteAuthorized).not.toHaveBeenCalled()
    })
})
