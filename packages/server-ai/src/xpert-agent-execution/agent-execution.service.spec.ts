import { XpertAgentExecutionService } from './agent-execution.service'

describe('XpertAgentExecutionService', () => {
    it('atomically adds usage to tokens', async () => {
        const repository = {
            increment: jest.fn(async () => undefined)
        }
        const service = new XpertAgentExecutionService(repository as never)

        await service.addTokens('execution-1', 12)

        expect(repository.increment).toHaveBeenCalledWith({ id: 'execution-1' }, 'tokens', 12)
    })
})
