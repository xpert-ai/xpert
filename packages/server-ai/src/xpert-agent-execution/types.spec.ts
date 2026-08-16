import { assignExecutionUsage, createExecutionModelUsageRecorder } from './types'

jest.mock('../metrics', () => ({
    applicationMetrics: {
        recordLlmUsage: jest.fn()
    }
}))

describe('createExecutionModelUsageRecorder', () => {
    it('adds actual tool usage to tokens without double counting one provider request', async () => {
        const execution = {
            tokens: 10,
            inputTokens: 8,
            outputTokens: 2
        }
        const recorder = createExecutionModelUsageRecorder(execution, jest.fn())
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

        expect(execution).toEqual({
            tokens: 7827,
            inputTokens: 8,
            outputTokens: 2
        })
    })

    it('persists and mirrors actual middleware usage on the shared execution object', async () => {
        const execution = { id: 'execution-1', tokens: 5, totalPrice: 1 }
        const persist = jest.fn(async () => undefined)
        const recorder = createExecutionModelUsageRecorder(execution, persist)

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

        expect(persist).toHaveBeenCalledWith('execution-1', { tokens: 12 })
        expect(execution.tokens).toBe(17)
        expect(execution.totalPrice).toBe(1)
    })

    it('resolves the current invocation execution when usage is reported', async () => {
        const firstExecution = { id: 'execution-1', tokens: 0 }
        const secondExecution = { id: 'execution-2', tokens: 0 }
        let currentExecution = firstExecution
        const persist = jest.fn(async () => undefined)
        const recorder = createExecutionModelUsageRecorder(() => currentExecution, persist)
        currentExecution = secondExecution

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

        expect(persist).toHaveBeenCalledWith('execution-2', { tokens: 12 })
        expect(firstExecution.tokens).toBe(0)
        expect(secondExecution.tokens).toBe(12)
    })

    it('persists and mirrors estimated usage in tokens with its type', async () => {
        const execution = { id: 'execution-1', tokens: 5 }
        const persist = jest.fn(async () => undefined)
        const recorder = createExecutionModelUsageRecorder(execution, persist)

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

        expect(persist).toHaveBeenCalledWith('execution-1', { type: 'estimated', tokens: 12 })
        expect(execution.tokens).toBe(17)
    })

    it('does not mutate local totals when persistence fails', async () => {
        const execution = { id: 'execution-1', tokens: 5 }
        const persist = jest.fn(async () => {
            throw new Error('persistence failed')
        })
        const recorder = createExecutionModelUsageRecorder(execution, persist)

        await expect(
            recorder.reportUsage({
                requestId: 'request-1',
                provider: 'siliconflow',
                promptTokens: 10,
                completionTokens: 2,
                totalTokens: 12
            })
        ).rejects.toThrow('persistence failed')

        expect(execution.tokens).toBe(5)
    })

    it('ignores invalid provider usage reports', async () => {
        const execution = { tokens: 10 }
        const recorder = createExecutionModelUsageRecorder(execution, jest.fn())

        await recorder.reportUsage({
            requestId: 'request-1',
            provider: 'siliconflow',
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 1
        })

        expect(execution).toEqual({ tokens: 10 })
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
