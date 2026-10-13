jest.mock('../../store', () => ({ CopilotMemoryStore: class {} }))
import { CommandBus } from '@nestjs/cqrs'
import { LongTermMemoryTypeEnum } from '@xpert-ai/contracts'
import { CopilotStoreBulkPutHandler } from './bulk-put.handler'
import { CopilotStoreBulkPutCommand } from '../bulk-put.command'

describe('seed memory replay', () => {
    it('reuses keys after a partial write, without duplicating memories', async () => {
        const saved = new Map<string, unknown>()
        let fail = true
        const put = jest.fn(async (_namespace: string[], key: string, value: unknown) => {
            if (fail && key === 'seed-1') {
                fail = false
                throw new Error('interrupted')
            }
            saved.set(key, value)
        })
        const bus = { execute: jest.fn(async () => ({ put })) } as unknown as CommandBus
        const handler = new CopilotStoreBulkPutHandler(bus)
        const values = [
            { question: 'q0', answer: 'a0' },
            { question: 'q1', answer: 'a1' }
        ]
        const command = new CopilotStoreBulkPutCommand(LongTermMemoryTypeEnum.QA, values, ['assistant', 'qa'], null, [
            'seed-0',
            'seed-1'
        ])
        await expect(handler.execute(command)).rejects.toThrow('interrupted')
        await handler.execute(command)
        expect([...saved.values()]).toEqual(values)
        expect(saved.size).toBe(2)
    })
    it('keeps ordinary memory inserts independent and validates internal key alignment', async () => {
        const put = jest.fn()
        const handler = new CopilotStoreBulkPutHandler({
            execute: jest.fn(async () => ({ put }))
        } as unknown as CommandBus)
        const memory = [{ question: 'q', answer: 'a' }]
        const command = new CopilotStoreBulkPutCommand(LongTermMemoryTypeEnum.QA, memory, ['a', 'qa'], null)
        await handler.execute(command)
        await handler.execute(command)
        expect(put.mock.calls[0][1]).not.toBe(put.mock.calls[1][1])
        await expect(
            handler.execute(new CopilotStoreBulkPutCommand(LongTermMemoryTypeEnum.QA, memory, ['a', 'qa'], null, []))
        ).rejects.toThrow()
    })
})
