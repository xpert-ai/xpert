import { QueryBus } from '@nestjs/cqrs'
import { FindThreadQuery } from '../thread-find.query'
import { FindThreadHandler } from './thread-find.handler'

describe('FindThreadHandler', () => {
    it('returns an empty thread state before the first checkpoint is created', async () => {
        const queryBus = Object.create(QueryBus.prototype) as QueryBus
        queryBus.execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'conversation-1',
                threadId: 'thread-1',
                status: 'idle',
                xpertId: 'xpert-1'
            })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
        const handler = new FindThreadHandler(queryBus)

        await expect(handler.execute(new FindThreadQuery('thread-1'))).resolves.toMatchObject({
            threadId: 'thread-1',
            metadata: {
                assistant_id: 'xpert-1'
            },
            values: {}
        })
    })

    it('returns the persisted state when a checkpoint exists', async () => {
        const queryBus = Object.create(QueryBus.prototype) as QueryBus
        queryBus.execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'conversation-1',
                threadId: 'thread-1',
                status: 'idle',
                xpertId: 'xpert-1'
            })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
                checkpoint: {
                    channel_values: {
                        messages: [{ id: 'message-1' }]
                    }
                }
            })
        const handler = new FindThreadHandler(queryBus)

        await expect(handler.execute(new FindThreadQuery('thread-1'))).resolves.toMatchObject({
            values: {
                messages: [{ id: 'message-1' }]
            }
        })
    })
})
