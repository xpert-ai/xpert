import { Test } from '@nestjs/testing'
import { IsNull } from 'typeorm'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationBindXpertCommand } from '../bind-xpert.command'
import { ChatConversationBindXpertHandler } from './bind-xpert.handler'

describe('ChatConversationBindXpertHandler', () => {
    const service = {
        update: jest.fn(),
        findOne: jest.fn(),
        repository: {
            findOneByOrFail: jest.fn()
        }
    }

    let handler: ChatConversationBindXpertHandler

    beforeEach(async () => {
        jest.clearAllMocks()
        service.update.mockResolvedValue({ affected: 1 })
        service.repository.findOneByOrFail.mockResolvedValue({
            id: 'conversation-1',
            xpertId: 'xpert-1'
        })

        const moduleRef = await Test.createTestingModule({
            providers: [
                ChatConversationBindXpertHandler,
                {
                    provide: ChatConversationService,
                    useValue: service
                }
            ]
        }).compile()

        handler = moduleRef.get(ChatConversationBindXpertHandler)
    })

    it('binds only conversations whose xpertId is still null', async () => {
        await expect(
            handler.execute(new ChatConversationBindXpertCommand('conversation-1', 'xpert-1'))
        ).resolves.toEqual({
            id: 'conversation-1',
            xpertId: 'xpert-1'
        })

        expect(service.update).toHaveBeenCalledWith(
            {
                id: 'conversation-1',
                xpertId: IsNull()
            },
            {
                xpertId: 'xpert-1'
            }
        )
        expect(service.repository.findOneByOrFail).toHaveBeenCalledWith({
            id: 'conversation-1'
        })
    })

    it('returns the persisted winner when another request binds first', async () => {
        service.update.mockResolvedValue({ affected: 0 })
        service.repository.findOneByOrFail.mockResolvedValue({
            id: 'conversation-1',
            xpertId: 'xpert-2'
        })

        await expect(
            handler.execute(new ChatConversationBindXpertCommand('conversation-1', 'xpert-1'))
        ).resolves.toEqual({
            id: 'conversation-1',
            xpertId: 'xpert-2'
        })
    })

    it('does not refetch the bound conversation through the switched request scope', async () => {
        service.findOne.mockRejectedValue(new Error('Conversation is hidden by the current scope'))

        await expect(
            handler.execute(new ChatConversationBindXpertCommand('conversation-1', 'xpert-1'))
        ).resolves.toEqual({
            id: 'conversation-1',
            xpertId: 'xpert-1'
        })

        expect(service.findOne).not.toHaveBeenCalled()
    })
})
