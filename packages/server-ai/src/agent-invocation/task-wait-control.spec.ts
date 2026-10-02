jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { AgentInvocationWaitEntity } from './invocation.entity'
import { AgentInvocationWaitStore } from './invocation-wait.store'
import { CheckTaskWaitClaimHandler, CheckTaskWaitClaimQuery } from './task-wait-control'

describe('continuation claim fence', () => {
    it('rejects a cancelled, replaced, expired or missing continuation claim', async () => {
        const row = Object.assign(new AgentInvocationWaitEntity(), {
            id: 'wait',
            leaseToken: 'new-lease',
            threadId: 'thread',
            state: 'ready',
            leaseUntil: new Date(Date.now() + 60000)
        })
        const findOneBy = jest.fn(async (where: Partial<AgentInvocationWaitEntity>) =>
            Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value) ? row : null
        )
        const module = await Test.createTestingModule({
            providers: [
                CheckTaskWaitClaimHandler,
                { provide: AgentInvocationWaitStore, useValue: { records: { findOneBy } } }
            ]
        }).compile()
        const handler = module.get(CheckTaskWaitClaimHandler)
        expect(await handler.execute(new CheckTaskWaitClaimQuery('wait', 'old-lease', 'thread'))).toBe(false)
        expect(await handler.execute(new CheckTaskWaitClaimQuery('wait', 'new-lease', 'another-thread'))).toBe(false)
        const query = new CheckTaskWaitClaimQuery('wait', 'new-lease', 'thread')
        expect(await handler.execute(query)).toBe(true)
        row.state = 'stale'
        expect(await handler.execute(query)).toBe(false)
        row.state = 'ready'
        row.leaseUntil = new Date(Date.now() - 1)
        expect(await handler.execute(query)).toBe(false)
        await module.close()
    })
})
