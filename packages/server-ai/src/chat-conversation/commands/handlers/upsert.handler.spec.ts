import { ChatConversationUpsertCommand } from '../upsert.command'
import { ChatConversationUpsertHandler } from './upsert.handler'

describe('ChatConversationUpsertHandler', () => {
    it('uses save for entities with ids before reloading relations', async () => {
        const service = {
            save: jest.fn().mockResolvedValue(undefined),
            create: jest.fn(),
            findOne: jest.fn().mockResolvedValue({
                id: 'conversation-1',
                attachments: [{ id: 'file-1' }]
            })
        }
        const handler = new ChatConversationUpsertHandler(service as any, {} as any)

        const result = await handler.execute(
            new ChatConversationUpsertCommand(
                {
                    id: 'conversation-1',
                    attachments: [{ id: 'file-1' }] as any
                },
                ['attachments']
            )
        )

        expect(service.save).toHaveBeenCalledWith({
            id: 'conversation-1',
            attachments: [{ id: 'file-1' }]
        })
        expect(service.findOne).toHaveBeenCalledWith('conversation-1', {
            relations: ['attachments']
        })
        expect(result).toEqual({
            id: 'conversation-1',
            attachments: [{ id: 'file-1' }]
        })
    })
})
