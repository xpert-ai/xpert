jest.mock('../../agent-execution.entity', () => ({ XpertAgentExecution: class {} }))
jest.mock('../../../xpert/queries', () => ({ FindXpertQuery: class {} }))

import { QueryBus } from '@nestjs/cqrs'
import { MoreThan, Repository } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../../agent-execution.entity'
import { GetThreadContextUsageQuery } from '../get-thread-context-usage.query'
import { GetThreadContextUsageHandler } from './get-thread-context-usage.handler'

describe('GetThreadContextUsageHandler', () => {
    const measured = {
        id: 'measured-run',
        status: XpertAgentExecutionStatusEnum.SUCCESS,
        updatedAt: new Date('2026-09-18T04:57:00Z'),
        inputTokens: 320380,
        outputTokens: 2883,
        tokens: 1600474
    }
    let findOne: jest.Mock
    let handler: GetThreadContextUsageHandler

    beforeEach(() => {
        findOne = jest.fn()
        handler = new GetThreadContextUsageHandler(
            { findOne } as unknown as Repository<XpertAgentExecution>,
            { execute: jest.fn() } as unknown as QueryBus
        )
    })

    it.each([XpertAgentExecutionStatusEnum.ERROR, XpertAgentExecutionStatusEnum.SUCCESS])(
        'keeps the last measured input when a newer %s execution has no model usage',
        async (status) => {
            findOne.mockResolvedValueOnce({ id: 'empty-run', status, inputTokens: 0 }).mockResolvedValueOnce(measured)

            const result = await handler.execute(new GetThreadContextUsageQuery('thread-1', 'agent-1'))

            expect(result).toMatchObject({
                status: 'stale',
                run_id: 'measured-run',
                updated_at: measured.updatedAt.toISOString(),
                usage: { context_tokens: 320380 }
            })
            expect(findOne).toHaveBeenLastCalledWith({
                where: { threadId: 'thread-1', agentKey: 'agent-1', inputTokens: MoreThan(0) },
                order: { createdAt: 'DESC', updatedAt: 'DESC' }
            })
        }
    )

    it('marks the first failed call as unavailable instead of a measured zero', async () => {
        findOne.mockResolvedValueOnce({ id: 'empty-run', inputTokens: 0 }).mockResolvedValueOnce(null)
        await expect(handler.execute(new GetThreadContextUsageQuery('thread-1', 'agent-1'))).resolves.toMatchObject({
            status: 'unavailable',
            run_id: null
        })
    })

    it('uses new successful measurements without summing the run token total', async () => {
        findOne.mockResolvedValueOnce(measured)
        await expect(handler.execute(new GetThreadContextUsageQuery('thread-1', 'agent-1'))).resolves.toMatchObject({
            status: 'current',
            run_id: measured.id,
            usage: { context_tokens: 320380 }
        })
        expect(findOne).toHaveBeenCalledTimes(1)
    })

    it.each([
        XpertAgentExecutionStatusEnum.ERROR,
        XpertAgentExecutionStatusEnum.TIMEOUT,
        XpertAgentExecutionStatusEnum.INTERRUPTED
    ])('keeps usage already measured within a later %s run and marks it stale', async (status) => {
        findOne.mockResolvedValueOnce({ ...measured, status })
        await expect(handler.execute(new GetThreadContextUsageQuery('thread-1', 'agent-1'))).resolves.toMatchObject({
            status: 'stale',
            run_id: measured.id,
            usage: { context_tokens: 320380 }
        })
        expect(findOne).toHaveBeenCalledTimes(1)
    })

    it('returns unavailable when the agent has no executions', async () => {
        findOne.mockResolvedValueOnce(null)
        await expect(handler.execute(new GetThreadContextUsageQuery('thread-1', 'agent-2'))).resolves.toMatchObject({
            agent_key: 'agent-2',
            status: 'unavailable',
            run_id: null
        })
    })
})
