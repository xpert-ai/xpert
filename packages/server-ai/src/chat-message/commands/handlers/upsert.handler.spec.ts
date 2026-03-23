import { ChatMessageUpsertCommand } from '../upsert.command'
import { ChatMessageUpsertHandler } from './upsert.handler'

describe('ChatMessageUpsertHandler', () => {
    it('uses save for entities with ids so relation fields like attachments can be persisted', async () => {
        const service = {
            save: jest.fn().mockResolvedValue({
                id: 'message-1'
            }),
            create: jest.fn()
        }
        const handler = new ChatMessageUpsertHandler(service as any, {} as any)

        await handler.execute(
            new ChatMessageUpsertCommand({
                id: 'message-1',
                role: 'human',
                content: 'Hello',
                attachments: [{ id: 'file-1' }] as any
            })
        )

        expect(service.save).toHaveBeenCalledWith({
            id: 'message-1',
            role: 'human',
            content: 'Hello',
            attachments: [{ id: 'file-1' }]
        })
        expect(service.create).not.toHaveBeenCalled()
    })
})
