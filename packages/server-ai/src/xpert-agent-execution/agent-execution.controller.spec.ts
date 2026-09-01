jest.mock('./agent-execution.service', () => ({
    XpertAgentExecutionService: class {}
}))
jest.mock('./dto', () => ({
    XpertAgentExecutionDTO: class XpertAgentExecutionDTO {
        constructor(value: object) {
            Object.assign(this, value)
        }
    }
}))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentUserId: jest.fn(),
        hasRoles: jest.fn()
    },
    ParseJsonPipe: class {},
    TransformInterceptor: class {}
}))

import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import { XpertAgentExecutionController } from './agent-execution.controller'
import {
    AssertXpertAgentExecutionAccessQuery,
    XpertAgentExecutionCheckpointsQuery,
    XpertAgentExecutionStateQuery
} from './queries'

describe('XpertAgentExecutionController', () => {
    let queryBus: { execute: jest.Mock }
    let service: { findAllByXpertAgent: jest.Mock }
    let controller: XpertAgentExecutionController

    beforeEach(() => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        jest.mocked(RequestContext.hasRoles).mockReturnValue(false)
        queryBus = {
            execute: jest.fn()
        }
        service = {
            findAllByXpertAgent: jest.fn()
        }

        controller = new XpertAgentExecutionController(
            service as never,
            queryBus as never,
            {
                run: jest.fn(async (_organizationId, callback) => callback())
            } as never
        )
    })

    it('serializes nested LangGraph messages and forwards checkpointId', async () => {
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof AssertXpertAgentExecutionAccessQuery) {
                return { id: 'execution-1', threadId: 'thread-1' }
            }
            return {
                messages: [new HumanMessage('hello')],
                toolResult: {
                    messages: [new AIMessage('world')]
                }
            }
        })

        const result = await controller.getState('execution-1', 'checkpoint-history')

        expect(queryBus.execute.mock.calls[0][0]).toEqual(new AssertXpertAgentExecutionAccessQuery('execution-1'))
        expect(queryBus.execute.mock.calls[1][0]).toEqual(
            new XpertAgentExecutionStateQuery('execution-1', 'checkpoint-history')
        )
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
        queryBus.execute.mockImplementation(async (query) =>
            query instanceof AssertXpertAgentExecutionAccessQuery
                ? { id: 'execution-1', threadId: 'thread-1' }
                : [{ checkpointId: 'checkpoint-1' }]
        )

        const result = await controller.getCheckpoints('execution-1')

        expect(queryBus.execute.mock.calls[0][0]).toEqual(new AssertXpertAgentExecutionAccessQuery('execution-1'))
        expect(queryBus.execute.mock.calls[1][0]).toEqual(new XpertAgentExecutionCheckpointsQuery('execution-1'))
        expect(result).toEqual([{ checkpointId: 'checkpoint-1' }])
    })

    it('does not read state after execution access is denied', async () => {
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof AssertXpertAgentExecutionAccessQuery) {
                throw new ForbiddenException('Access denied')
            }
            throw new Error(`Unexpected query: ${query.constructor.name}`)
        })

        await expect(controller.getState('victim-execution')).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute.mock.calls.some(([query]) => query instanceof XpertAgentExecutionStateQuery)).toBe(
            false
        )
    })

    it('limits studio execution history to the current user for non-admins', async () => {
        service.findAllByXpertAgent.mockResolvedValue({ items: [], total: 0 })

        await controller.findAllByXpertAgent('xpert-1', 'agent-1', {} as never)

        expect(service.findAllByXpertAgent).toHaveBeenCalledWith('xpert-1', 'agent-1', {}, 'user-1')
    })

    it('does not expose inherited generic CRUD endpoints', () => {
        expect('findById' in controller).toBe(false)
        expect('findAll' in controller).toBe(false)
        expect('create' in controller).toBe(false)
        expect('update' in controller).toBe(false)
        expect('delete' in controller).toBe(false)
    })
})
