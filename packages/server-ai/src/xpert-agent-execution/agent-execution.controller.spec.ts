jest.mock('./agent-execution.service', () => ({
    XpertAgentExecutionService: class {}
}))
jest.mock('@xpert-ai/server-core', () => ({
    CrudController: class {
        constructor() {}
    },
    ParseJsonPipe: class {},
    TransformInterceptor: class {}
}))

import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { XpertAgentExecutionController } from './agent-execution.controller'
import { XpertAgentExecutionCheckpointsQuery, XpertAgentExecutionStateQuery } from './queries'

describe('XpertAgentExecutionController', () => {
    let queryBus: { execute: jest.Mock }
    let controller: XpertAgentExecutionController

    beforeEach(() => {
        queryBus = {
            execute: jest.fn()
        }

        controller = new XpertAgentExecutionController({} as any, {} as any, queryBus as any)
    })

    it('serializes nested LangGraph messages and forwards checkpointId', async () => {
        queryBus.execute.mockResolvedValue({
            messages: [new HumanMessage('hello')],
            toolResult: {
                messages: [new AIMessage('world')]
            }
        })

        const result = await controller.getState('execution-1', 'checkpoint-history')

        expect(queryBus.execute.mock.calls[0][0]).toEqual(new XpertAgentExecutionStateQuery('execution-1', 'checkpoint-history'))
        expect(result).toEqual({
            messages: [
                {
                    type: 'human',
                    data: expect.objectContaining({
                        content: 'hello'
                    })
                }
            ],
            toolResult: {
                messages: [
                    {
                        type: 'ai',
                        data: expect.objectContaining({
                            content: 'world'
                        })
                    }
                ]
            }
        })
    })

    it('forwards checkpoint lineage requests by execution id', async () => {
        queryBus.execute.mockResolvedValue([{ checkpointId: 'checkpoint-1' }])

        const result = await controller.getCheckpoints('execution-1')

        expect(queryBus.execute.mock.calls[0][0]).toEqual(new XpertAgentExecutionCheckpointsQuery('execution-1'))
        expect(result).toEqual([{ checkpointId: 'checkpoint-1' }])
    })
})
