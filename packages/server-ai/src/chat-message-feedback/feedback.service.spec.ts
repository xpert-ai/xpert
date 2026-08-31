import { ForbiddenException } from '@nestjs/common'
import { ChatMessageFeedbackRatingEnum } from '@xpert-ai/contracts'
import { ChatMessageFeedbackService } from './feedback.service'

describe('ChatMessageFeedbackService authorization', () => {
    const createService = () => {
        const conversationService = {
            assertAccess: jest.fn(),
            triggerSummary: jest.fn(),
            deleteSummary: jest.fn()
        }
        const messageService = {
            findOneInOrganizationOrTenant: jest.fn()
        }
        const service = new ChatMessageFeedbackService(
            {} as never,
            conversationService as never,
            messageService as never,
            {} as never,
            {} as never
        )
        return { service, conversationService, messageService }
    }

    it('rejects creating feedback for a conversation the current user cannot access', async () => {
        const { service, conversationService, messageService } = createService()
        conversationService.assertAccess.mockRejectedValue(new ForbiddenException())
        const create = jest.spyOn(service, 'create')

        await expect(
            service.createAuthorized({
                conversationId: 'victim-conversation',
                messageId: 'victim-message',
                rating: ChatMessageFeedbackRatingEnum.LIKE
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(conversationService.assertAccess).toHaveBeenCalledWith('victim-conversation', 'contribute')
        expect(messageService.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
    })

    it('rejects a message UUID that does not belong to the authorized conversation', async () => {
        const { service, conversationService, messageService } = createService()
        conversationService.assertAccess.mockResolvedValue({ id: 'conversation-1' })
        messageService.findOneInOrganizationOrTenant.mockResolvedValue(null)
        const create = jest.spyOn(service, 'create')

        await expect(
            service.createAuthorized({
                conversationId: 'conversation-1',
                messageId: 'victim-message',
                rating: ChatMessageFeedbackRatingEnum.LIKE
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(messageService.findOneInOrganizationOrTenant).toHaveBeenCalledWith('victim-message', {
            where: { conversationId: 'conversation-1' }
        })
        expect(create).not.toHaveBeenCalled()
    })

    it('creates feedback only after the conversation and message are authorized', async () => {
        const { service, conversationService, messageService } = createService()
        conversationService.assertAccess.mockResolvedValue({ id: 'conversation-1' })
        messageService.findOneInOrganizationOrTenant.mockResolvedValue({
            id: 'message-1',
            conversationId: 'conversation-1'
        })
        const saved = { id: 'feedback-1', conversationId: 'conversation-1', messageId: 'message-1' }
        const create = jest.spyOn(service, 'create').mockResolvedValue(saved as never)

        await expect(
            service.createAuthorized({
                conversationId: 'conversation-1',
                messageId: 'message-1',
                rating: ChatMessageFeedbackRatingEnum.LIKE,
                content: 'useful'
            })
        ).resolves.toBe(saved)

        expect(create).toHaveBeenCalledWith({
            conversationId: 'conversation-1',
            messageId: 'message-1',
            rating: ChatMessageFeedbackRatingEnum.LIKE,
            content: 'useful'
        })
    })

    it('requires an exact authorized conversation scope for feedback lists', async () => {
        const { service, conversationService } = createService()
        const findAll = jest.spyOn(service, 'findAll')

        await expect(service.findAllAuthorized({ where: {} })).rejects.toBeInstanceOf(ForbiddenException)

        expect(conversationService.assertAccess).not.toHaveBeenCalled()
        expect(findAll).not.toHaveBeenCalled()
    })

    it('rejects nested managed-file relation expansion before querying feedback', async () => {
        const { service, conversationService } = createService()
        const findAll = jest.spyOn(service, 'findAll')

        await expect(
            service.findAllAuthorized({
                where: { conversationId: 'conversation-1' },
                relations: ['message.fileAssets']
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(conversationService.assertAccess).not.toHaveBeenCalled()
        expect(findAll).not.toHaveBeenCalled()
    })
})
