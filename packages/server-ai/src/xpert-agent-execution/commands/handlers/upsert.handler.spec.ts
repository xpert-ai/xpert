import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecutionUpsertCommand } from '../upsert.command'
import { XpertAgentExecutionUpsertHandler } from './upsert.handler'

describe('XpertAgentExecutionUpsertHandler', () => {
    it('creates a caller-specified execution id when it does not exist', async () => {
        const service = {
            findOneOrFailByIdString: jest.fn(async () => ({ success: false })),
            create: jest.fn(async (entity) => entity),
            update: jest.fn(),
            findOne: jest.fn()
        }
        const handler = new XpertAgentExecutionUpsertHandler(service as never, {} as never, {} as never)

        const result = await handler.execute(
            new XpertAgentExecutionUpsertCommand({
                id: 'execution-1',
                threadId: 'thread-1',
                status: XpertAgentExecutionStatusEnum.RUNNING
            })
        )

        expect(service.create).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'execution-1', threadId: 'thread-1' })
        )
        expect(result.id).toBe('execution-1')
    })

    it('updates the same execution id on a retry', async () => {
        const service = {
            findOneOrFailByIdString: jest.fn(async () => ({ success: true, record: { id: 'execution-1' } })),
            create: jest.fn(),
            update: jest.fn(async () => undefined),
            findOne: jest.fn(async () => ({ id: 'execution-1', status: XpertAgentExecutionStatusEnum.RUNNING }))
        }
        const handler = new XpertAgentExecutionUpsertHandler(service as never, {} as never, {} as never)

        await handler.execute(
            new XpertAgentExecutionUpsertCommand({
                id: 'execution-1',
                status: XpertAgentExecutionStatusEnum.RUNNING
            })
        )

        expect(service.update).toHaveBeenCalledWith('execution-1', expect.objectContaining({ id: 'execution-1' }))
        expect(service.create).not.toHaveBeenCalled()
    })
})
