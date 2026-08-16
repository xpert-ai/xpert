import { XpertAgentExecutionRecordUsageCommand } from '../record-usage.command'
import { XpertAgentExecutionRecordUsageHandler } from './record-usage.handler'

describe('XpertAgentExecutionRecordUsageHandler', () => {
    it.each([
        { usageType: undefined, label: 'actual' },
        { usageType: 'estimated' as const, label: 'estimated' }
    ])('records $label usage without reading and overwriting the execution', async ({ usageType }) => {
        const executionService = { recordUsage: jest.fn(async () => undefined) }
        const handler = new XpertAgentExecutionRecordUsageHandler(executionService as never)
        const usage = { ...(usageType ? { type: usageType } : {}), tokens: 12 }

        await handler.execute(new XpertAgentExecutionRecordUsageCommand('execution-1', usage))

        expect(executionService.recordUsage).toHaveBeenCalledWith('execution-1', usage)
    })
})
