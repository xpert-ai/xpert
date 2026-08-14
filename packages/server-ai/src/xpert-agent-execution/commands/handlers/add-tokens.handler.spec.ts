import { XpertAgentExecutionAddTokensCommand } from '../add-tokens.command'
import { XpertAgentExecutionAddTokensHandler } from './add-tokens.handler'

describe('XpertAgentExecutionAddTokensHandler', () => {
    it.each([
        { usageType: undefined, label: 'actual' },
        { usageType: 'estimated' as const, label: 'estimated' }
    ])('increments $label usage without reading and overwriting the execution', async ({ usageType }) => {
        const executionService = { addTokens: jest.fn(async () => undefined) }
        const handler = new XpertAgentExecutionAddTokensHandler(executionService as never)

        await handler.execute(new XpertAgentExecutionAddTokensCommand('execution-1', 12, usageType))

        expect(executionService.addTokens).toHaveBeenCalledWith('execution-1', 12)
    })
})
