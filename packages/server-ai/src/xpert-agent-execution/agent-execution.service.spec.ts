import { XpertAgentExecutionService } from './agent-execution.service'

describe('XpertAgentExecutionService', () => {
    it('atomically records tokens and actual usage details', async () => {
        const manager = {
            increment: jest.fn(async () => undefined),
            update: jest.fn(async () => undefined)
        }
        const repository = {
            manager: {
                transaction: jest.fn(async (callback) => callback(manager))
            }
        }
        const service = new XpertAgentExecutionService(repository as never)
        const details = {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            promptUnitPrice: 1,
            promptPriceUnit: 1000,
            promptPrice: 0.01,
            completionUnitPrice: 2,
            completionPriceUnit: 1000,
            completionPrice: 0.004,
            totalPrice: 0.014,
            currency: 'USD',
            latency: 20
        }

        await service.recordUsage('execution-1', { tokens: 12, details })

        expect(manager.increment).toHaveBeenCalledWith(expect.any(Function), { id: 'execution-1' }, 'tokens', 12)
        expect(manager.update).toHaveBeenCalledWith(
            expect.any(Function),
            { id: 'execution-1' },
            expect.objectContaining({
                responseLatency: 0.02,
                totalPrice: 0.014,
                inputTokens: 10,
                outputTokens: 2
            })
        )
    })

    it('only increments tokens for estimated usage', async () => {
        const manager = {
            increment: jest.fn(async () => undefined),
            update: jest.fn(async () => undefined)
        }
        const repository = {
            manager: {
                transaction: jest.fn(async (callback) => callback(manager))
            }
        }
        const service = new XpertAgentExecutionService(repository as never)

        await service.recordUsage('execution-1', { type: 'estimated', tokens: 12 })

        expect(manager.increment).toHaveBeenCalledWith(expect.any(Function), { id: 'execution-1' }, 'tokens', 12)
        expect(manager.update).not.toHaveBeenCalled()
    })
})
