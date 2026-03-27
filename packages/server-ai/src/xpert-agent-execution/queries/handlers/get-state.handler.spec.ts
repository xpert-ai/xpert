jest.mock('../../agent-execution.service', () => ({
    XpertAgentExecutionService: class {}
}))

import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { XpertAgentExecutionStateQuery } from '../get-state.query'
import { XpertAgentExecutionStateHandler } from './get-state.handler'

describe('XpertAgentExecutionStateHandler', () => {
    let service: { findOne: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let handler: XpertAgentExecutionStateHandler

    beforeEach(() => {
        service = {
            findOne: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }

        handler = new XpertAgentExecutionStateHandler(service as any, queryBus as any)
    })

    it('loads a specific checkpoint state when checkpointId is provided', async () => {
        service.findOne.mockResolvedValue({
            id: 'execution-1',
            threadId: 'thread-1',
            checkpointNs: 'agent-1',
            checkpointId: 'checkpoint-current'
        })
        queryBus.execute.mockResolvedValue({
            checkpoint: {
                channel_values: {
                    output: 'checkpoint snapshot'
                }
            }
        })

        const result = await handler.execute(new XpertAgentExecutionStateQuery('execution-1', 'checkpoint-history'))

        expect(result).toEqual({
            output: 'checkpoint snapshot'
        })
        expect(queryBus.execute.mock.calls[0][0]).toBeInstanceOf(CopilotCheckpointGetTupleQuery)
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: 'agent-1',
                    checkpoint_id: 'checkpoint-history'
                }
            })
        )
    })
})
