import {
    AiModelTypeEnum,
    defaultModelConfiguration,
    ICopilotProviderModel,
    ModelExecutionModel,
    ModelExecutionPolicy,
    ModelFeature,
    UserType
} from '@xpert-ai/contracts'
import { builtinCliTools } from '@xpert-ai/cli-model-profiles'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot/queries/copilot-model-find.query'
import { FindCopilotModelsHandler } from '../copilot/queries/handlers/copilot-model-find.handler'
import { AssistantExecutionPolicyService } from '../model-execution/assistant-execution-policy.service'
import { parseExecutionPolicy } from '../model-execution/execution-policy'
import { executionToolModels } from '../model-execution/execution-tool-model'
import { ModelAccessService } from './model-access.service'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
const legacyProperties = {
    vision_support: 'support',
    function_calling_type: 'tool_call',
    stream_function_calling: 'supported'
}
const policy = parseExecutionPolicy({}) as Extract<ModelExecutionPolicy, { enabled: true }>
const configuration = defaultModelConfiguration(AiModelTypeEnum.LLM)
if (configuration.modelType !== AiModelTypeEnum.LLM) throw new Error('Expected LLM configuration')

// Persistence and authorization are fixtures; capability conversion and CLI admission use real services.
async function resolveModels(
    modelProperties: ICopilotProviderModel['modelProperties'],
    predefinedFeatures?: ModelFeature[]
) {
    const selected = { copilotId: 'copilot', model: 'custom-model', modelType: AiModelTypeEnum.LLM }
    const assistant = { id: 'assistant', ...actor, copilotModel: selected }
    const copilot = {
        id: selected.copilotId,
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        enabled: true,
        modelProvider: { id: 'provider', providerName: 'openai-compatible', isValid: true }
    }
    const custom = {
        tenantId: actor.tenantId,
        providerId: copilot.modelProvider.id,
        modelType: selected.modelType,
        modelName: selected.model,
        modelProperties
    }
    const getModelSchema = jest.fn(() => ({ features: [ModelFeature.VISION], model_properties: {} }))
    const providers = {
        getProvider: jest.fn(() => ({
            getProviderModels: () =>
                predefinedFeatures ? [{ model: selected.model, features: predefinedFeatures }] : [],
            getProviderSchema: () => ({ provider: 'openai-compatible', label: { en_US: 'Compatible' } }),
            getModelManager: () => ({ getModelSchema })
        }))
    }
    const copilots = {
        find: jest.fn().mockResolvedValue([copilot]),
        findOneBy: jest.fn().mockResolvedValue(copilot)
    }
    const access = new ModelAccessService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        copilots as never,
        { find: jest.fn().mockResolvedValue([custom]) } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        providers as never,
        {} as never
    )
    jest.spyOn(access, 'canUseCatalogModels').mockResolvedValue([true])
    const execution = new AssistantExecutionPolicyService(
        { findOne: jest.fn().mockResolvedValue({ xpert: assistant, threadId: null }) } as never,
        { execute: jest.fn().mockResolvedValue({ id: actor.userId, type: UserType.USER }) } as never,
        copilots as never,
        { findOneBy: jest.fn().mockResolvedValue(null) } as never,
        {} as never,
        access,
        { getAccessiblePublishedXpert: jest.fn().mockResolvedValue(assistant) } as never,
        { metadata: jest.fn().mockResolvedValue({ protocols: [] }) } as never
    )
    const catalog = new FindCopilotModelsHandler(
        { execute: jest.fn().mockResolvedValue([custom]) } as never,
        { findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([copilot]) } as never,
        providers as never,
        access,
        { resolve: async () => ({ configured: false, binding: null }) } as never
    )
    Object.defineProperty(catalog, 'configService', { value: { get: () => 'http://localhost:3000' } })
    const selection = await execution.resolve(actor, 'conversation')
    const models = await catalog.execute(
        new FindCopilotModelsQuery(AiModelTypeEnum.LLM, CopilotModelCatalogMode.Management)
    )
    return { ...selection, catalogFeatures: models[0].providerWithModels.models[0].features }
}

function admittedTools(models: ModelExecutionModel[], settings = policy) {
    return builtinCliTools
        .filter((tool) => executionToolModels(models, tool, settings).length > 0)
        .map((tool) => tool.id)
        .sort()
}

describe('persisted model capabilities through CLI admission', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
    })
    afterEach(() => jest.restoreAllMocks())

    it('preserves legacy streaming tools in both catalogs without inferring Codex parallel-tool support', async () => {
        const { models, catalogFeatures } = await resolveModels(legacyProperties)
        expect(models[0].capabilities).toEqual([
            ModelFeature.VISION,
            ModelFeature.TOOL_CALL,
            ModelFeature.STREAM_TOOL_CALL
        ])
        expect(catalogFeatures).toEqual(models[0].capabilities)
        expect(admittedTools(models)).toEqual(['aider', 'claude', 'codebuddy', 'kimi', 'opencode', 'qwen'])
    })

    it.each(['not_supported', 'unsupported', undefined])(
        'keeps Aider available but rejects streaming CLIs when streaming support is %s',
        async (stream_function_calling) => {
            const { models, catalogFeatures } = await resolveModels({ ...legacyProperties, stream_function_calling })
            expect(models[0].capabilities).toEqual([ModelFeature.VISION, ModelFeature.TOOL_CALL])
            expect(catalogFeatures).toEqual(models[0].capabilities)
            expect(admittedTools(models)).toEqual(['aider'])
        }
    )

    it('preserves an explicit legacy multi_tool_call declaration separately from streaming support', async () => {
        const { models, catalogFeatures } = await resolveModels({
            ...legacyProperties,
            function_calling_type: 'multi_tool_call'
        })
        expect(models[0].capabilities).toEqual([
            ModelFeature.VISION,
            ModelFeature.TOOL_CALL,
            ModelFeature.MULTI_TOOL_CALL,
            ModelFeature.STREAM_TOOL_CALL
        ])
        expect(catalogFeatures).toEqual(models[0].capabilities)
        expect(admittedTools(models)).toEqual(builtinCliTools.map((tool) => tool.id).sort())
    })

    it.each([
        { features: [], tools: ['aider'] },
        { features: [ModelFeature.TOOL_CALL], tools: ['aider'] },
        {
            features: [ModelFeature.STREAM_TOOL_CALL],
            tools: ['aider', 'claude', 'codebuddy', 'kimi', 'opencode', 'qwen']
        },
        {
            features: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL],
            tools: builtinCliTools.map((tool) => tool.id).sort()
        }
    ])('keeps explicit configuration features authoritative: $features', async ({ features, tools }) => {
        const { models, catalogFeatures } = await resolveModels(
            {
                ...legacyProperties,
                function_calling_type: 'multi_tool_call',
                model_configuration: { ...configuration, features }
            },
            [ModelFeature.VISION, ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL]
        )
        expect(models[0].capabilities).toEqual(features)
        expect(catalogFeatures).toEqual(features)
        expect(admittedTools(models)).toEqual(tools)
    })

    it('preserves predefined capabilities ahead of the legacy fallback, including an empty list', async () => {
        const { models } = await resolveModels(legacyProperties, [])
        expect(models[0].capabilities).toEqual([])
        expect(admittedTools(models)).toEqual(['aider'])
    })

    it('uses explicitly configured streaming and multi-tool support even when legacy flags deny them', async () => {
        const features = [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL]
        const { models, catalogFeatures } = await resolveModels({
            function_calling_type: 'no_call',
            stream_function_calling: 'not_supported',
            model_configuration: { ...configuration, features }
        })
        expect(models[0].capabilities).toEqual(features)
        expect(catalogFeatures).toEqual(features)
        expect(admittedTools(models)).toEqual(builtinCliTools.map((tool) => tool.id).sort())
    })

    it('does not bypass protocol, policy or bridge-version checks after converting legacy capabilities', async () => {
        const { models } = await resolveModels({ ...legacyProperties, function_calling_type: 'multi_tool_call' })
        expect(admittedTools(models, { ...policy, chatBridgeProtocols: [] })).toEqual([
            'aider',
            'codebuddy',
            'kimi',
            'opencode',
            'qwen'
        ])
        expect(admittedTools(models, { ...policy, tools: [] })).toEqual([])
        const codex = { id: 'codex', version: '99.0.0', executable: '/codex' }
        expect(executionToolModels(models, codex, { ...policy, tools: [codex] })).toEqual([])
    })
})
