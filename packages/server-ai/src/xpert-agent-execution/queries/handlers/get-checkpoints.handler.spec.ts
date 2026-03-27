jest.mock('../../agent-execution.service', () => ({
    XpertAgentExecutionService: class {}
}))

import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { XpertAgentExecutionCheckpointsQuery } from '../get-checkpoints.query'
import { XpertAgentExecutionCheckpointsHandler } from './get-checkpoints.handler'

describe('XpertAgentExecutionCheckpointsHandler', () => {
    let service: { findOne: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let handler: XpertAgentExecutionCheckpointsHandler

    beforeEach(() => {
        service = {
            findOne: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }

        handler = new XpertAgentExecutionCheckpointsHandler(service as any, queryBus as any)
    })

    it('returns lineage from oldest to newest and marks the current checkpoint', async () => {
        service.findOne.mockResolvedValue({
            id: 'execution-1',
            threadId: 'thread-1',
            checkpointNs: '',
            checkpointId: 'checkpoint-3'
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (!(query instanceof CopilotCheckpointGetTupleQuery)) {
                return null
            }

            switch (query.configurable.checkpoint_id) {
                case 'checkpoint-3':
                    return createCheckpointTuple('checkpoint-3', 'checkpoint-2', '2026-03-25T10:03:00.000Z', 'loop')
                case 'checkpoint-2':
                    return createCheckpointTuple('checkpoint-2', 'checkpoint-1', '2026-03-25T10:02:00.000Z', 'loop')
                case 'checkpoint-1':
                    return createCheckpointTuple('checkpoint-1', null, '2026-03-25T10:01:00.000Z', 'input')
                default:
                    return null
            }
        })

        const result = await handler.execute(new XpertAgentExecutionCheckpointsQuery('execution-1'))

        expect(result).toEqual([
            {
                threadId: 'thread-1',
                checkpointNs: '',
                checkpointId: 'checkpoint-1',
                parentCheckpointId: null,
                createdAt: '2026-03-25T10:01:00.000Z',
                metadata: {
                    source: 'input',
                    step: -1
                },
                isCurrent: false
            },
            {
                threadId: 'thread-1',
                checkpointNs: '',
                checkpointId: 'checkpoint-2',
                parentCheckpointId: 'checkpoint-1',
                createdAt: '2026-03-25T10:02:00.000Z',
                metadata: {
                    source: 'loop',
                    step: 1
                },
                isCurrent: false
            },
            {
                threadId: 'thread-1',
                checkpointNs: '',
                checkpointId: 'checkpoint-3',
                parentCheckpointId: 'checkpoint-2',
                createdAt: '2026-03-25T10:03:00.000Z',
                metadata: {
                    source: 'loop',
                    step: 1
                },
                isCurrent: true
            }
        ])
        expect(queryBus.execute.mock.calls.map(([query]) => query.configurable.checkpoint_id)).toEqual([
            'checkpoint-3',
            'checkpoint-2',
            'checkpoint-1'
        ])
    })
})

function createCheckpointTuple(
    checkpointId: string,
    parentCheckpointId: string | null,
    ts: string,
    source: 'input' | 'loop'
) {
    return {
        config: {
            configurable: {
                thread_id: 'thread-1',
                checkpoint_ns: '',
                checkpoint_id: checkpointId
            }
        },
        checkpoint: {
            ts,
            channel_values: {}
        },
        metadata: {
            source,
            step: source === 'input' ? -1 : 1
        },
        parentConfig: parentCheckpointId
            ? {
                  configurable: {
                      thread_id: 'thread-1',
                      checkpoint_ns: '',
                      checkpoint_id: parentCheckpointId
                  }
              }
            : undefined
    }
}
