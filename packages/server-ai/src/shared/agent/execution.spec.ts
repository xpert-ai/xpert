import { type IXpertAgentExecution, XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { type CommandBus, type QueryBus } from '@nestjs/cqrs'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands'
import { ExecutionCancelledError } from '../execution/execution-cancelled.error'
import { wrapAgentExecution } from './execution'

function fixture() {
    const row = {
        id: 'execution',
        status: Status.RUNNING,
        createdAt: new Date('2026-10-07T12:00:00Z'),
        updatedAt: new Date('2026-10-07T12:00:00Z'),
        tokens: 0,
        inputTokens: 0
    }
    const execute = jest.fn(async (command: XpertAgentExecutionUpsertCommand) => {
        Object.assign(row, command.execution)
        return { ...row }
    })
    const query = jest.fn(async () => ({ ...row }))
    const execution: Partial<IXpertAgentExecution> = { agentKey: 'worker', threadId: 'thread' }
    return {
        row,
        execute,
        query,
        params: {
            commandBus: { execute } as unknown as CommandBus,
            queryBus: { execute: query } as unknown as QueryBus,
            execution
        }
    }
}

describe('agent execution finalization', () => {
    it('preserves concurrent usage and audit updates while persisting callback metadata and checkpoints', async () => {
        const { row, execute, query, params } = fixture()
        const state = { result: 'done' }
        const updatedAt = new Date('2026-10-07T12:05:00Z')
        const run = wrapAgentExecution(async (execution) => {
            expect(execution.id).toBe(row.id)
            // Usage updates are persisted independently while the callback is running.
            row.tokens = 120
            row.inputTokens = 100
            row.updatedAt = updatedAt
            execution.metadata = { model: 'worker-model' }
            execution.checkpointId = 'final-checkpoint'
            return { output: 'Completed', state }
        }, params)

        expect(await run()).toBe(state)
        const finalization = execute.mock.calls[1][0].execution
        expect(finalization).toEqual(
            expect.objectContaining({
                id: row.id,
                status: Status.SUCCESS,
                checkpointId: 'final-checkpoint',
                metadata: { model: 'worker-model' },
                outputs: { output: 'Completed' },
                elapsedTime: expect.any(Number)
            })
        )
        for (const field of ['createdAt', 'updatedAt', 'tokens', 'inputTokens']) {
            expect(finalization).not.toHaveProperty(field)
        }
        expect(row.tokens).toBe(120)
        expect(row.inputTokens).toBe(100)
        expect(row.updatedAt).toEqual(updatedAt)
        expect(query).toHaveBeenCalledTimes(1)
    })

    it.each([
        [new Error('Execution failed'), Status.ERROR],
        [new ExecutionCancelledError('execution', 'Cancelled'), Status.INTERRUPTED]
    ])('persists failure/cancellation without replaying the initial row: %s', async (error, status) => {
        const { row, execute, params } = fixture()
        const run = wrapAgentExecution(async () => {
            row.tokens = 20
            throw error
        }, params)
        await expect(run()).rejects.toBe(error)
        expect(execute.mock.calls[1][0].execution).toEqual(expect.objectContaining({ id: row.id, status }))
        expect(row.tokens).toBe(20)
    })
})
