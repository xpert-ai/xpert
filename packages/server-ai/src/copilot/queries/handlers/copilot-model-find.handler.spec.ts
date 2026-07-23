import { AiModelTypeEnum, FetchFrom } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { FindCopilotModelsQuery } from '../copilot-model-find.query'
import { FindCopilotModelsHandler } from './copilot-model-find.handler'

describe('FindCopilotModelsHandler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('includes the currently selected copilot model when the provider catalog does not list it', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const service = {
            findAllAvailablesCopilots: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-primary',
                    copilotModel: {
                        model: 'qwen3.6-plus',
                        modelType: AiModelTypeEnum.LLM
                    },
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'openai-compatible'
                    }
                }
            ])
        }
        const providersService = {
            getProvider: jest.fn().mockReturnValue({
                getProviderModels: jest.fn().mockReturnValue([
                    {
                        model: 'glm-5',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: {
                            zh_Hans: 'glm-5',
                            en_US: 'glm-5'
                        }
                    }
                ]),
                getProviderSchema: jest.fn().mockReturnValue({
                    provider: 'openai-compatible',
                    label: {
                        zh_Hans: 'OpenAI Compatible',
                        en_US: 'OpenAI Compatible'
                    },
                    supported_model_types: [AiModelTypeEnum.LLM],
                    models: []
                })
            })
        }
        const configService = {
            get: jest.fn().mockReturnValue('http://localhost:3000')
        }
        const membershipService = {
            isMembershipAccessEnabled: jest.fn().mockResolvedValue(false),
            findModelAccess: jest.fn(),
            isModelAllowed: jest.fn()
        }
        const handler = new FindCopilotModelsHandler(
            queryBus as never,
            service as never,
            providersService as never,
            membershipService as never
        )
        Object.defineProperty(handler, 'configService', {
            value: configService
        })

        const result = await handler.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM))

        expect(result).toHaveLength(1)
        expect(result[0].providerWithModels.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    model: 'qwen3.6-plus',
                    model_type: AiModelTypeEnum.LLM,
                    fetch_from: FetchFrom.CUSTOMIZABLE_MODEL
                })
            ])
        )
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })

    it('shows only models allowed by the active plan when the membership feature is enabled', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const service = {
            findAllAvailablesCopilots: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-primary',
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'openai-compatible'
                    }
                }
            ])
        }
        const providersService = {
            getProvider: jest.fn().mockReturnValue({
                getProviderModels: jest.fn().mockReturnValue([
                    {
                        model: 'free-model',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: { zh_Hans: 'Free', en_US: 'Free' }
                    },
                    {
                        model: 'paid-model',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: { zh_Hans: 'Paid', en_US: 'Paid' }
                    }
                ]),
                getProviderSchema: jest.fn().mockReturnValue({
                    provider: 'openai-compatible',
                    label: { zh_Hans: 'OpenAI Compatible', en_US: 'OpenAI Compatible' },
                    supported_model_types: [AiModelTypeEnum.LLM],
                    models: []
                })
            })
        }
        const membershipService = {
            isMembershipAccessEnabled: jest.fn().mockResolvedValue(true),
            findModelAccess: jest.fn().mockResolvedValue({
                membership: {
                    plan: {
                        allowedModels: [{ provider: 'openai-compatible', model: 'free-model' }]
                    }
                }
            }),
            isModelAllowed: jest.fn((_plan: unknown, _provider: unknown, model: string) => model === 'free-model')
        }
        const handler = new FindCopilotModelsHandler(
            queryBus as never,
            service as never,
            providersService as never,
            membershipService as never
        )
        Object.defineProperty(handler, 'configService', {
            value: { get: jest.fn().mockReturnValue('http://localhost:3000') }
        })

        const result = await handler.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM))

        expect(result).toHaveLength(1)
        expect(result[0].providerWithModels.models.map((model) => model.model)).toEqual(['free-model'])
        expect(membershipService.isModelAllowed).toHaveBeenCalledTimes(2)
    })

    it('loads the complete model catalog for membership management without applying the current plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = {
            findAllAvailablesCopilots: jest.fn(),
            findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-primary',
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'openai-compatible'
                    }
                }
            ])
        }
        const providersService = {
            getProvider: jest.fn().mockReturnValue({
                getProviderModels: jest.fn().mockReturnValue([
                    {
                        model: 'paid-model',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: { zh_Hans: 'Paid', en_US: 'Paid' }
                    }
                ]),
                getProviderSchema: jest.fn().mockReturnValue({
                    provider: 'openai-compatible',
                    label: { zh_Hans: 'OpenAI Compatible', en_US: 'OpenAI Compatible' },
                    supported_model_types: [AiModelTypeEnum.LLM],
                    models: []
                })
            })
        }
        const membershipService = {
            isMembershipAccessEnabled: jest.fn(),
            findModelAccess: jest.fn(),
            isModelAllowed: jest.fn()
        }
        const handler = new FindCopilotModelsHandler(
            { execute: jest.fn().mockResolvedValue([]) } as never,
            service as never,
            providersService as never,
            membershipService as never
        )
        Object.defineProperty(handler, 'configService', {
            value: { get: jest.fn().mockReturnValue('http://localhost:3000') }
        })

        const result = await handler.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM, true))

        expect(result[0].providerWithModels.models.map((model) => model.model)).toEqual(['paid-model'])
        expect(service.findAllAvailablesCopilots).not.toHaveBeenCalled()
        expect(service.findAllEnabledCopilotsWithoutMembership).toHaveBeenCalledWith('tenant-1', 'org-1')
        expect(membershipService.isMembershipAccessEnabled).not.toHaveBeenCalled()
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })
})
