import { Test } from '@nestjs/testing'
import { DiscoveryModule } from '@nestjs/core'
import { QueryBus } from '@nestjs/cqrs'
import {
    LanguagesEnum,
    ModelFeature,
    WorkflowNodeTypeEnum,
    type IWFNMiddleware,
    type TXpertTeamDraft
} from '@xpert-ai/contracts'
import {
    AssistantCapabilityProviderRegistry,
    StrategyBus,
    RequestContext,
    type AssistantCapabilityApplyContext
} from '@xpert-ai/plugin-sdk'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { RealtimeModelCatalog } from '../../xpert-template/capabilities/realtime-voice.capability'
import { blankAssistantTemplate } from '../../xpert-template/capabilities/blank-assistant-template'
import { parseCapabilityTemplateDraft } from '../../xpert-template/capabilities/template-draft'
import {
    recordCapabilityState,
    removeCapabilityState,
    updateAssistantPrompt
} from '../../xpert-template/capabilities/capability-state'
import { RESOURCE_ASSISTANT_CAPABILITY, RESOURCE_ASSISTANT_MIDDLEWARE } from '../resource-assistant.constants'
import { ResourceAssistantCapabilityProvider } from './resource-assistant.capability'

function context(): AssistantCapabilityApplyContext {
    const template = blankAssistantTemplate([{ key: RESOURCE_ASSISTANT_CAPABILITY }])
    return {
        template,
        draft: parseCapabilityTemplateDraft(template.export_data),
        language: LanguagesEnum.English,
        loadTemplate: jest.fn()
    }
}

afterEach(() => jest.restoreAllMocks())

it('is discovered in Assistant creation and configuration, defaults off and checks model tool support', async () => {
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
    jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue(LanguagesEnum.English)
    const execute = jest.fn().mockResolvedValue([
        {
            id: 'authorized',
            providerWithModels: {
                provider: 'model-provider',
                models: [
                    { model: 'text-only', features: [] },
                    { model: 'tool-model', features: [ModelFeature.TOOL_CALL] }
                ]
            }
        }
    ])
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
            ResourceAssistantCapabilityProvider,
            AssistantCapabilityProviderRegistry,
            StrategyBus,
            RequestContext,
            AssistantCapabilityService,
            RealtimeModelCatalog,
            { provide: QueryBus, useValue: { execute } }
        ]
    }).compile()
    await module.init()
    const provider = module.get(ResourceAssistantCapabilityProvider)
    expect(module.get(AssistantCapabilityProviderRegistry).get(provider.key)).toBe(provider)
    const service = module.get(AssistantCapabilityService)
    const blank = service.blankTemplate()
    expect(blank.capabilities).toEqual([{ key: provider.key, required: false }])
    const setup = await service.setup(blank, LanguagesEnum.English)
    expect(setup.optionalCapabilities).toEqual([
        expect.objectContaining({ key: provider.key, supportsQuickCreation: true })
    ])
    const off = await service.compose(blank, LanguagesEnum.English, [], jest.fn())
    expect(provider.isEnabled(parseCapabilityTemplateDraft(off.export_data))).toBe(false)
    const enabledSetup = await service.setup(blank, LanguagesEnum.English, [provider.key])
    expect(enabledSetup.requiredModelFeatures).toEqual([ModelFeature.TOOL_CALL])
    expect(enabledSetup.models.map((model) => model.copilotModel.model)).toEqual(['tool-model'])
    const enabled = await service.compose(blank, LanguagesEnum.English, [provider.key], jest.fn())
    const draft = parseCapabilityTemplateDraft(enabled.export_data)
    expect(provider.isEnabled(draft)).toBe(true)
    expect(draft.team.options?.assistantCapabilities?.selected).toEqual([provider.key])
    const base = removeCapabilityState(draft)
    const configuration = service.configurationTemplate(base)
    expect(await service.configurationOptions(configuration, base, LanguagesEnum.English, [])).toEqual([
        expect.objectContaining({ key: provider.key, required: false, available: true })
    ])
    await module.close()
})

it('composes one required navigation middleware without Projects, resource access or repeated instructions', async () => {
    const provider = new ResourceAssistantCapabilityProvider()
    const input = context()
    expect(await provider.check()).toEqual({ available: true })
    await provider.apply(input)
    const once = structuredClone(input.draft)
    await provider.apply(input)
    expect(input.draft).toEqual(once)
    expect(input.draft.nodes).toHaveLength(2)
    expect(input.draft.nodes[1].entity).toMatchObject({
        provider: RESOURCE_ASSISTANT_MIDDLEWARE,
        required: true,
        options: {}
    })
    expect(input.draft.connections).toEqual([
        expect.objectContaining({ from: input.draft.team.agent.key, to: input.draft.nodes[1].key })
    ])
    expect(input.loadTemplate).not.toHaveBeenCalled()
})

it('preserves a manually configured middleware and disabled tools', async () => {
    const provider = new ResourceAssistantCapabilityProvider()
    const input = context()
    await provider.apply(input)
    const node = input.draft.nodes[1]
    const entity: IWFNMiddleware = {
        id: node.key,
        key: node.key,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: RESOURCE_ASSISTANT_MIDDLEWARE,
        required: false,
        tools: { resource_open: false }
    }
    node.entity = entity
    const before = structuredClone(input.draft)
    await provider.apply(input)
    expect(input.draft).toEqual(before)
})

it('removes managed contributions while preserving edited user instructions and unrelated nodes', async () => {
    const provider = new ResourceAssistantCapabilityProvider()
    const input = context()
    const before = structuredClone(input.draft)
    await provider.apply(input)
    recordCapabilityState(before, input.draft, [provider.key])
    updateAssistantPrompt(input.draft, 'User instructions')
    const unrelated: TXpertTeamDraft['nodes'][number] = {
        type: 'agent',
        key: 'unrelated',
        position: { x: 0, y: 0 },
        entity: { key: 'unrelated', prompt: 'Keep me' }
    }
    input.draft.nodes.push(unrelated)
    const restored = removeCapabilityState(input.draft)
    expect(provider.isEnabled(restored)).toBe(false)
    expect(restored.nodes).toHaveLength(2)
    expect(restored.nodes[0].entity).toMatchObject({ prompt: 'User instructions' })
    expect(restored.nodes[1]).toEqual(unrelated)
    expect(restored.connections).toEqual([])
    expect(restored.team.options?.assistantCapabilities).toBeUndefined()
})

it('does not count a child Agent connection as enabling the primary Agent', async () => {
    const provider = new ResourceAssistantCapabilityProvider()
    const input = context()
    await provider.apply(input)
    input.draft.connections[0].from = 'child'
    expect(provider.isEnabled(input.draft)).toBe(false)
    await provider.apply(input)
    expect(provider.isEnabled(input.draft)).toBe(true)
    expect(new Set(input.draft.nodes.map((node) => node.key)).size).toBe(input.draft.nodes.length)
    expect(input.draft.connections[0].from).toBe('child')
})

it('rejects composition without the declared primary Agent', async () => {
    const input = context()
    input.draft.nodes = []
    await expect(new ResourceAssistantCapabilityProvider().apply(input)).rejects.toThrow()
})
