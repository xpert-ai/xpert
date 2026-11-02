import { QueryBus } from '@nestjs/cqrs'
import { AiModelTypeEnum, AiProviderRole, AppPlatformEnvironment, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { IsNull } from 'typeorm'
import { AIModelGetProviderQuery } from '../../ai-model/queries/get-provider.query'
import { Copilot } from '../../copilot/copilot.entity'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { PlatformModelsService } from './platform-models.service'

type Configuration = AppPlatformEnvironment['configurations'][string]
const configuration: Configuration = {
    primary: { provider: 'provider', model: 'chat' },
    auxiliaryModels: [],
    tools: []
}
const copilot = (overrides: Partial<Copilot> = {}) =>
    Object.assign(new Copilot(), {
        id: 'tenant-model',
        tenantId: 'tenant',
        organizationId: null,
        enabled: true,
        role: AiProviderRole.Primary,
        modelProvider: { providerName: 'provider', isValid: true },
        ...overrides
    })

function fixture(rows = [copilot()]) {
    const models = { find: jest.fn().mockResolvedValue(rows) }
    const tools = { find: jest.fn().mockResolvedValue([{ id: 'tool-source' }]) }
    const database = {
        getRepository: jest.fn((entity) => {
            if (entity === Copilot) return models
            if (entity === XpertToolset) return tools
            throw new Error('Unexpected repository')
        })
    }
    const queries = new QueryBus(null)
    // Initialization requires an available model manager, not pricing or maximum-cost metadata.
    const getModelManager = jest.fn().mockReturnValue({})
    const query = jest.spyOn(queries, 'execute').mockResolvedValue({ getModelManager })
    return { service: new PlatformModelsService(database as never, queries), models, tools, query, getModelManager }
}

describe('managed platform model and tool bindings', () => {
    it('prefers an organization model over the tenant default within the requested scope', async () => {
        const f = fixture([copilot(), copilot({ id: 'organization-model', organizationId: 'org' })])
        const selected = await f.service.resolve('tenant', 'org', configuration)
        expect(selected.primary).toEqual({
            copilotId: 'organization-model',
            model: 'chat',
            modelType: AiModelTypeEnum.LLM
        })
        expect(f.models.find).toHaveBeenCalledWith({
            where: [
                { tenantId: 'tenant', organizationId: 'org', enabled: true },
                { tenantId: 'tenant', organizationId: IsNull(), enabled: true }
            ],
            relations: ['modelProvider']
        })
        expect(f.query).toHaveBeenCalledWith(new AIModelGetProviderQuery('provider'))
        expect(f.getModelManager).toHaveBeenCalledWith(AiModelTypeEnum.LLM)
    })

    it('resolves all declared model roles and keeps identities for actual usage accounting', async () => {
        const f = fixture([
            copilot(),
            copilot({ id: 'embedding', role: AiProviderRole.Embedding }),
            copilot({ id: 'vision', role: AiProviderRole.Secondary })
        ])
        const selected = await f.service.resolve('tenant', 'org', {
            ...configuration,
            auxiliaryModels: [{ provider: 'provider', model: 'image', modelType: AiModelTypeEnum.IMAGE }],
            embedding: { provider: 'provider', model: 'embed/v2' },
            vision: { provider: 'provider', model: 'vision', role: 'secondary' },
            speechToText: { provider: 'provider', model: 'speech' }
        })
        expect(selected).toMatchObject({
            primary: { copilotId: 'tenant-model' },
            embeddingModelId: 'embedding/embed%2Fv2',
            visionModelId: 'vision/vision',
            speechToTextModelId: 'tenant-model/speech',
            auxiliary: [{ copilotId: 'tenant-model', model: 'image', modelType: AiModelTypeEnum.IMAGE }]
        })
        expect(selected.billingModels.map(({ model, provider, modelType }) => [model, provider, modelType])).toEqual([
            ['chat', 'provider', AiModelTypeEnum.LLM],
            ['image', 'provider', AiModelTypeEnum.IMAGE],
            ['embed/v2', 'provider', AiModelTypeEnum.TEXT_EMBEDDING],
            ['vision', 'provider', AiModelTypeEnum.LLM],
            ['speech', 'provider', AiModelTypeEnum.SPEECH2TEXT]
        ])
    })

    it.each(
        [
            [],
            [copilot(), copilot({ id: 'duplicate' })],
            [copilot({ id: 'one', organizationId: 'org' }), copilot({ id: 'two', organizationId: 'org' })],
            [copilot({ modelProvider: { providerName: 'provider', isValid: false } })],
            [copilot({ modelProvider: { providerName: 'other' } })],
            [copilot({ role: AiProviderRole.Embedding })]
        ].map((rows) => ({ rows }))
    )('rejects missing, invalid or ambiguous bindings (%#)', async ({ rows }) => {
        const f = fixture(rows)
        await expect(f.service.resolve('tenant', 'org', configuration)).rejects.toMatchObject({
            response: { code: 'application_model_binding_unavailable' }
        })
    })

    it('rejects an unloaded provider or an unsupported model type', async () => {
        const f = fixture()
        f.getModelManager.mockReturnValue(undefined)
        await expect(f.service.resolve('tenant', 'org', configuration)).rejects.toMatchObject({
            response: { code: 'application_model_binding_unavailable' }
        })
        f.query.mockResolvedValue(undefined)
        await expect(f.service.resolve('tenant', 'org', configuration)).rejects.toMatchObject({
            response: { code: 'application_model_binding_unavailable' }
        })
    })

    it('binds only the explicitly named tenant tool source', async () => {
        const f = fixture()
        const config = { ...configuration, tools: [{ provider: 'search', sourceName: 'managed-search' }] }
        await expect(f.service.toolSources('tenant', config)).resolves.toEqual(['tool-source'])
        expect(f.tools.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: IsNull(),
                workspaceId: IsNull(),
                category: XpertToolsetCategoryEnum.BUILTIN,
                type: 'search',
                name: 'managed-search'
            },
            take: 2
        })
        for (const rows of [[], [{ id: 'one' }, { id: 'two' }]]) {
            f.tools.find.mockResolvedValue(rows)
            await expect(f.service.toolSources('tenant', config)).rejects.toMatchObject({
                response: { code: 'application_tool_binding_unavailable' }
            })
        }
    })
})
