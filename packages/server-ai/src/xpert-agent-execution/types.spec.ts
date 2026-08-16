import { assignExecutionUsage, createExecutionModelUsageRecorder } from './types'

jest.mock('../metrics', () => ({
    applicationMetrics: {
        recordLlmUsage: jest.fn()
    }
}))

describe('createExecutionModelUsageRecorder', () => {
    it('persists actual tool usage without double counting one provider request', async () => {
        const persist = jest.fn(async () => undefined)
        const recorder = createExecutionModelUsageRecorder('execution-1', persist)
        const usage = {
            requestId: 'request-1',
            provider: 'siliconflow',
            model: 'Qwen/Qwen2.5-VL-72B-Instruct',
            promptTokens: 7632,
            completionTokens: 185,
            totalTokens: 7817
        }

        await recorder.reportUsage(usage)
        await recorder.reportUsage(usage)

        expect(persist).toHaveBeenCalledTimes(1)
        expect(persist).toHaveBeenCalledWith('execution-1', {
            tokens: 7817
        })
    })

    it('persists complete actual middleware usage directly against the execution id', async () => {
        const persist = jest.fn(async () => undefined)
        const recorder = createExecutionModelUsageRecorder('execution-1', persist)
        const usage = {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            promptUnitPrice: 0,
            promptPriceUnit: 0,
            promptPrice: 0,
            completionUnitPrice: 0,
            completionPriceUnit: 0,
            completionPrice: 0,
            totalPrice: 0,
            currency: 'USD',
            latency: 20
        }

        await recorder.usageCallback(usage)

        expect(persist).toHaveBeenCalledWith('execution-1', { tokens: 12, details: usage })
    })

    it('resolves the current invocation execution id when usage is reported', async () => {
        let currentExecutionId = 'execution-1'
        const persist = jest.fn(async () => undefined)
        const recorder = createExecutionModelUsageRecorder(() => currentExecutionId, persist)
        currentExecutionId = 'execution-2'

        await recorder.usageCallback({
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            promptUnitPrice: 0,
            promptPriceUnit: 0,
            promptPrice: 0,
            completionUnitPrice: 0,
            completionPriceUnit: 0,
            completionPrice: 0,
            totalPrice: 0,
            currency: 'USD',
            latency: 20
        })

        expect(persist).toHaveBeenCalledWith(
            'execution-2',
            expect.objectContaining({ tokens: 12, details: expect.objectContaining({ totalTokens: 12 }) })
        )
    })

    it('persists estimated usage with its type', async () => {
        const persist = jest.fn(async () => undefined)
        const recorder = createExecutionModelUsageRecorder('execution-1', persist)

        await recorder.usageCallback({
            type: 'estimated',
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            promptUnitPrice: 0,
            promptPriceUnit: 0,
            promptPrice: 0,
            completionUnitPrice: 0,
            completionPriceUnit: 0,
            completionPrice: 0,
            totalPrice: 0,
            currency: 'USD',
            latency: 20
        })

        expect(persist).toHaveBeenCalledWith(
            'execution-1',
            expect.objectContaining({
                type: 'estimated',
                tokens: 12,
                details: expect.objectContaining({ totalTokens: 12 })
            })
        )
    })

    it('allows a failed provider usage report to be retried', async () => {
        const persist = jest.fn(async () => {
            throw new Error('persistence failed')
        })
        const recorder = createExecutionModelUsageRecorder('execution-1', persist)
        const usage = {
            requestId: 'request-1',
            provider: 'siliconflow',
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12
        }

        await expect(recorder.reportUsage(usage)).rejects.toThrow('persistence failed')
        await expect(recorder.reportUsage(usage)).rejects.toThrow('persistence failed')

        expect(persist).toHaveBeenCalledTimes(2)
    })

    it('ignores invalid provider usage reports', async () => {
        const persist = jest.fn()
        const recorder = createExecutionModelUsageRecorder('execution-1', persist)

        await recorder.reportUsage({
            requestId: 'request-1',
            provider: 'siliconflow',
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 1
        })

        expect(persist).not.toHaveBeenCalled()
    })
})

describe('assignExecutionUsage', () => {
    it('adds estimated usage to tokens without treating it as authoritative pricing usage', () => {
        const execution = { tokens: 5, totalPrice: 1 }
        const recordUsage = assignExecutionUsage(execution)

        recordUsage({
            type: 'estimated',
            promptTokens: 10,
            promptUnitPrice: 0,
            promptPriceUnit: 0,
            promptPrice: 0,
            completionTokens: 2,
            completionUnitPrice: 0,
            completionPriceUnit: 0,
            completionPrice: 0,
            totalTokens: 12,
            totalPrice: 0,
            currency: 'USD',
            latency: 20
        })

        expect(execution.tokens).toBe(17)
        expect(execution.totalPrice).toBe(1)
    })
})
