jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('@xpert-ai/plugin-sdk'),
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'organization',
        getLanguageCode: () => 'en-US'
    }
}))

import {
    AiModelTypeEnum,
    AiProviderRole,
    LanguagesEnum,
    ModelFeature,
    TXpertTemplate,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { AssistantCapabilityService } from './assistant-capability.service'
import { RealtimeModelCatalog } from './realtime-voice.capability'
import { parseCapabilityTemplateDraft } from './template-draft'

describe('Template installation model resolution', () => {
    const selected = { copilotId: 'tenant-connection', model: 'tool-model', modelType: AiModelTypeEnum.LLM }
    const template: TXpertTemplate = {
        id: 'legacy-plugin:assistant',
        name: 'Assistant',
        title: 'Assistant',
        type: XpertTypeEnum.Agent,
        description: '',
        category: '',
        copyright: '',
        avatar: {},
        export_data: JSON.stringify({
            team: { agent: { key: 'primary' }, copilotModel: { model: 'source-model', modelType: 'llm' } },
            nodes: [{ type: 'agent', key: 'primary', entity: { key: 'primary' } }],
            connections: []
        })
    }
    const connection = {
        id: selected.copilotId,
        organizationId: null,
        role: AiProviderRole.Secondary,
        providerWithModels: {
            provider: 'sample',
            models: [
                { model: selected.model, model_type: AiModelTypeEnum.LLM, features: [ModelFeature.TOOL_CALL] },
                { model: 'text-only', model_type: AiModelTypeEnum.LLM, features: [] }
            ]
        }
    }
    const queries = { execute: jest.fn() }
    const service = new AssistantCapabilityService(
        { list: () => [] } as never,
        queries as never,
        new RealtimeModelCatalog(queries as never)
    )
    const setup = (source = template) => service.setup(source, LanguagesEnum.English)
    const install = (source = template, model = selected) => {
        const draft = parseCapabilityTemplateDraft(source.export_data)
        return service.prepareInstallation(source, draft, LanguagesEnum.English, [], model, []).then(() => draft)
    }
    beforeEach(() => {
        queries.execute.mockReset().mockResolvedValue([connection])
    })

    it('offers authorized tenant models for a legacy template without a Primary and requires a selection', async () => {
        const result = await setup()
        expect(result).toMatchObject({ canInstall: true, requiresModel: true, requiredModelFeatures: [] })
        expect(result.models.map((option) => option.copilotModel.model)).toEqual(['tool-model', 'text-only'])
        expect(result.defaultModelId).toBeUndefined()
        expect((await install()).team.copilotModel).toEqual(selected)
        const draft = parseCapabilityTemplateDraft(template.export_data)
        await expect(
            service.prepareInstallation(template, draft, LanguagesEnum.English, [], undefined, [])
        ).rejects.toThrow()
    })

    it.each([undefined, { model: '' }, { model: 'denied', modelType: AiModelTypeEnum.LLM }])(
        'keeps model selection available when the Primary default is invalid: %j',
        async (copilotModel) => {
            queries.execute.mockResolvedValue([{ ...connection, role: AiProviderRole.Primary, copilotModel }])
            expect(await setup()).toMatchObject({ canInstall: true, requiresModel: true, defaultModelId: undefined })
            expect((await install()).team.copilotModel).toEqual(selected)
        }
    )

    it('preselects an authorized tenant default and resolves it on the server without exposing its options', async () => {
        const options = { temperature: 0.2 }
        queries.execute.mockResolvedValue([
            { ...connection, role: AiProviderRole.Primary, copilotModel: { ...selected, options } }
        ])
        const result = await setup()
        expect(result.defaultModelId).toBe('tenant-connection/tool-model')
        expect(result.models[0].copilotModel.options).toBeUndefined()
        const draft = parseCapabilityTemplateDraft(template.export_data)
        await service.prepareInstallation(template, draft, LanguagesEnum.English, [], undefined, [])
        expect(draft.team.copilotModel).toEqual({ ...selected, options })
    })

    it('skips incomplete organization defaults and prefers a valid organization default over tenant defaults', async () => {
        queries.execute.mockResolvedValue([
            { ...connection, role: AiProviderRole.Primary, copilotModel: selected },
            { ...connection, id: 'a-empty', organizationId: 'organization', role: AiProviderRole.Primary },
            {
                ...connection,
                id: 'z-valid',
                organizationId: 'organization',
                role: AiProviderRole.Primary,
                copilotModel: selected
            }
        ])
        expect((await setup()).defaultModelId).toBe('z-valid/tool-model')
    })

    it('preserves an authorized existing binding and its options without a Primary', async () => {
        const draft = parseCapabilityTemplateDraft(template.export_data)
        draft.team.copilotModel = { ...selected, options: { temperature: 0.1 } }
        const source = { ...template, export_data: JSON.stringify(draft) }
        expect((await setup(source)).defaultModelId).toBe('tenant-connection/tool-model')
        await service.prepareInstallation(source, draft, LanguagesEnum.English, [], undefined, [])
        expect(draft.team.copilotModel).toEqual({ ...selected, options: { temperature: 0.1 } })
    })

    it.each(['existing', 'default'] as const)(
        'preserves %s model options after the UI submits the preselected model identity',
        async (source) => {
            const options = { temperature: 0.2 }
            const draft = parseCapabilityTemplateDraft(template.export_data)
            if (source === 'existing') draft.team.copilotModel = { ...selected, options }
            else
                queries.execute.mockResolvedValue([
                    { ...connection, role: AiProviderRole.Primary, copilotModel: { ...selected, options } }
                ])
            await service.prepareInstallation(template, draft, LanguagesEnum.English, [], selected, [])
            expect(draft.team.copilotModel).toEqual({ ...selected, options })

            const different = { ...selected, model: 'text-only' }
            await service.prepareInstallation(template, draft, LanguagesEnum.English, [], different, [])
            expect(draft.team.copilotModel).toEqual(different)
        }
    )

    it('revalidates revoked selections before mutating the draft, even when another default is authorized', async () => {
        await setup()
        queries.execute.mockResolvedValue([
            {
                ...connection,
                role: AiProviderRole.Primary,
                copilotModel: { model: 'text-only' },
                providerWithModels: {
                    ...connection.providerWithModels,
                    models: [connection.providerWithModels.models[1]]
                }
            }
        ])
        const draft = parseCapabilityTemplateDraft(template.export_data)
        const before = structuredClone(draft)
        await expect(
            service.prepareInstallation(template, draft, LanguagesEnum.English, [], selected, [])
        ).rejects.toThrow()
        expect(draft).toEqual(before)
    })

    it('filters incompatible defaults and rejects a submitted model that lacks required capabilities', async () => {
        const source: TXpertTemplate = {
            ...template,
            manifest: { schemaVersion: 2, version: '1', execution: { modelFeatures: [ModelFeature.TOOL_CALL] } }
        }
        queries.execute.mockResolvedValue([
            {
                ...connection,
                role: AiProviderRole.Primary,
                copilotModel: { model: 'text-only' }
            }
        ])
        const result = await setup(source)
        expect(result.models).toHaveLength(1)
        expect(result.defaultModelId).toBeUndefined()
        await expect(install(source, { ...selected, model: 'text-only' })).rejects.toThrow()
        expect((await install(source)).team.copilotModel).toEqual(selected)
    })

    it('reports unavailable models and refuses import when the governed catalog is empty', async () => {
        queries.execute.mockResolvedValue([])
        expect(await setup()).toMatchObject({ canInstall: false, models: [] })
        await expect(install()).rejects.toThrow()
    })
})
