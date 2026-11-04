import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { ResolveAssistantModelCommand, ResolveAssistantModelHandler } from './resolve-assistant-model.command'

it('restricts organization model credentials to the live executor Assistant published configuration', async () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
    const model = { copilotId: 'provider', model: 'published-model', modelType: AiModelTypeEnum.LLM }
    const access = { isPrincipal: jest.fn().mockResolvedValue(true), find: jest.fn().mockResolvedValue({}) }
    const database = {
        getRepository: () => ({ findOne: async () => ({ active: true, publishAt: new Date(), copilotModel: model }) })
    } as unknown as DataSource
    const handler = new ResolveAssistantModelHandler(access, database)
    await expect(handler.execute(new ResolveAssistantModelCommand(actor, 'assistant', model))).resolves.toBe(true)
    await expect(
        handler.execute(new ResolveAssistantModelCommand(actor, 'assistant', { ...model, model: 'unrelated-model' }))
    ).rejects.toThrow()
    access.find.mockResolvedValueOnce(null)
    await expect(handler.execute(new ResolveAssistantModelCommand(actor, 'other-assistant', model))).rejects.toThrow()
    access.isPrincipal.mockResolvedValueOnce(false)
    await expect(
        handler.execute(new ResolveAssistantModelCommand({ ...actor, userId: 'human' }, 'assistant', model))
    ).resolves.toBe(false)
})
