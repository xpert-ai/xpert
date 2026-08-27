import { AiModelTypeEnum, AiProviderRole, FetchFrom } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot-model-find.query'
import { FindCopilotModelsHandler } from './copilot-model-find.handler'

describe('FindCopilotModelsHandler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('includes the currently selected copilot model when the provider catalog does not list it', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const service = {
            findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([
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
        const modelAccessService = {
            canUseCatalogModels: jest.fn().mockImplementation(async ({ models }) => models.map(() => true))
        }
        const handler = new FindCopilotModelsHandler(
            queryBus as never,
            service as never,
            providersService as never,
            modelAccessService as never
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
        expect(modelAccessService.canUseCatalogModels).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'user-1',
            models: expect.arrayContaining([
                expect.objectContaining({
                    copilotId: 'copilot-primary',
                    copilotModelId: 'qwen3.6-plus',
                    modelType: AiModelTypeEnum.LLM
                })
            ])
        })
    })

    it('includes provider-selectable models in management catalogs', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const queryBus = {
            execute: jest.fn().mockResolvedValue([
                {
                    modelName: 'custom-configured',
                    modelType: AiModelTypeEnum.LLM,
                    modelProperties: {}
                }
            ])
        }
        const service = {
            findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-primary',
                    organizationId: null,
                    copilotModel: {
                        model: 'selected-configured',
                        modelType: AiModelTypeEnum.LLM
                    },
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'openai-compatible'
                    }
                }
            ])
        }
        const getProviderModels = jest.fn().mockReturnValue([
            {
                model: 'provider-capability-only',
                model_type: AiModelTypeEnum.LLM,
                fetch_from: FetchFrom.PREDEFINED_MODEL
            }
        ])
        const providersService = {
            getProvider: jest.fn().mockReturnValue({
                getProviderModels,
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
        const modelAccessService = {
            canUseCatalogModels: jest.fn()
        }
        const handler = new FindCopilotModelsHandler(
            queryBus as never,
            service as never,
            providersService as never,
            modelAccessService as never
        )
        Object.defineProperty(handler, 'configService', {
            value: { get: jest.fn().mockReturnValue('http://localhost:3000') }
        })

        const result = await handler.execute(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM, CopilotModelCatalogMode.Management)
        )

        expect(result[0].providerWithModels.models.map((model) => model.model)).toEqual([
            'custom-configured',
            'provider-capability-only',
            'selected-configured'
        ])
        expect(getProviderModels).toHaveBeenCalledWith(AiModelTypeEnum.LLM)
        expect(modelAccessService.canUseCatalogModels).not.toHaveBeenCalled()
    })

    it('does not infer LLM for a selected copilot model without an explicit model type', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const handler = new FindCopilotModelsHandler(
            { execute: jest.fn().mockResolvedValue([]) } as never,
            {
                findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([
                    {
                        id: 'copilot-primary',
                        copilotModel: {
                            model: 'legacy-selected-model'
                        },
                        modelProvider: {
                            id: 'provider-1',
                            providerName: 'openai-compatible'
                        }
                    }
                ])
            } as never,
            {
                getProvider: jest.fn().mockReturnValue({
                    getProviderModels: jest.fn().mockReturnValue([]),
                    getProviderSchema: jest.fn().mockReturnValue({
                        provider: 'openai-compatible',
                        supported_model_types: [AiModelTypeEnum.LLM],
                        models: []
                    })
                })
            } as never,
            {
                canUseCatalogModels: jest.fn()
            } as never
        )
        Object.defineProperty(handler, 'configService', {
            value: { get: jest.fn().mockReturnValue('http://localhost:3000') }
        })

        await expect(handler.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM))).resolves.toEqual([])
    })

    it('shows models allowed by the unified plan-or-grant resolver', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const queryBus = {
            execute: jest.fn().mockResolvedValue([])
        }
        const service = {
            findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-primary',
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'openai-compatible'
                    }
                },
                {
                    id: 'copilot-secondary',
                    modelProvider: {
                        id: 'provider-2',
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
        const modelAccessService = {
            canUseCatalogModels: jest
                .fn()
                .mockImplementation(async ({ models }) =>
                    models.map(({ copilotModelId }) => copilotModelId === 'free-model')
                )
        }
        const handler = new FindCopilotModelsHandler(
            queryBus as never,
            service as never,
            providersService as never,
            modelAccessService as never
        )
        Object.defineProperty(handler, 'configService', {
            value: { get: jest.fn().mockReturnValue('http://localhost:3000') }
        })

        const result = await handler.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM))

        expect(result).toHaveLength(2)
        expect(result.map((copilot) => copilot.providerWithModels.models.map((model) => model.model))).toEqual([
            ['free-model'],
            ['free-model']
        ])
        expect(modelAccessService.canUseCatalogModels).toHaveBeenCalledTimes(1)
        expect(service.findAllEnabledCopilotsWithoutMembership).toHaveBeenCalledWith('tenant-1', 'org-1')
        expect(modelAccessService.canUseCatalogModels).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            models: expect.arrayContaining([
                expect.objectContaining({
                    copilotId: 'copilot-primary',
                    copilotModelId: 'free-model',
                    modelType: AiModelTypeEnum.LLM
                }),
                expect.objectContaining({
                    copilotId: 'copilot-primary',
                    copilotModelId: 'paid-model',
                    modelType: AiModelTypeEnum.LLM
                }),
                expect.objectContaining({
                    copilotId: 'copilot-secondary',
                    copilotModelId: 'free-model',
                    modelType: AiModelTypeEnum.LLM
                }),
                expect.objectContaining({
                    copilotId: 'copilot-secondary',
                    copilotModelId: 'paid-model',
                    modelType: AiModelTypeEnum.LLM
                })
            ])
        })
    })

    it('uses an explicit internal access user for Xpert creator catalogs', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('collaborator-user')
        const service = {
            findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-primary',
                    copilotModel: null,
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'test-provider'
                    }
                }
            ])
        }
        const providersService = {
            getProvider: jest.fn().mockReturnValue({
                getProviderModels: jest.fn().mockReturnValue([
                    {
                        model: 'creator-model',
                        model_type: AiModelTypeEnum.LLM
                    }
                ]),
                getProviderSchema: jest.fn().mockReturnValue({
                    provider: 'test-provider'
                })
            })
        }
        const modelAccessService = {
            canUseCatalogModels: jest.fn().mockImplementation(async ({ models }) => models.map(() => true))
        }
        const handler = new FindCopilotModelsHandler(
            { execute: jest.fn().mockResolvedValue([]) } as never,
            service as never,
            providersService as never,
            modelAccessService as never
        )
        Object.defineProperty(handler, 'configService', {
            value: { get: jest.fn().mockReturnValue('http://localhost:3000') }
        })

        await handler.execute(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM, CopilotModelCatalogMode.Available, 'creator-user')
        )

        expect(modelAccessService.canUseCatalogModels).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'creator-user',
            models: [
                expect.objectContaining({
                    copilotModelId: 'creator-model'
                })
            ]
        })
    })

    it('matches membership provider catalogs to copilot roles without requiring a default model', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = {
            findAllAvailablesCopilots: jest.fn(),
            findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue([
                {
                    id: 'copilot-tenant',
                    organizationId: null,
                    role: AiProviderRole.Primary,
                    modelProvider: {
                        id: 'provider-tenant',
                        providerName: 'openai-compatible'
                    }
                },
                {
                    id: 'copilot-primary',
                    organizationId: 'org-1',
                    role: AiProviderRole.Primary,
                    copilotModel: null,
                    modelProvider: {
                        id: 'provider-primary',
                        providerName: 'openai-compatible'
                    }
                },
                {
                    id: 'copilot-secondary',
                    organizationId: 'org-1',
                    role: AiProviderRole.Secondary,
                    copilotModel: null,
                    modelProvider: {
                        id: 'provider-secondary',
                        providerName: 'openai-compatible'
                    }
                },
                {
                    id: 'copilot-embedding',
                    organizationId: 'org-1',
                    role: AiProviderRole.Embedding,
                    copilotModel: {
                        model: 'llm-model',
                        modelType: AiModelTypeEnum.LLM
                    },
                    modelProvider: {
                        id: 'provider-embedding',
                        providerName: 'openai-compatible'
                    }
                },
                {
                    id: 'copilot-reasoning',
                    organizationId: 'org-1',
                    role: AiProviderRole.Reasoning,
                    copilotModel: null,
                    modelProvider: {
                        id: 'provider-reasoning',
                        providerName: 'openai-compatible'
                    }
                },
                {
                    id: 'copilot-legacy-rerank',
                    organizationId: 'org-1',
                    role: null,
                    copilotModel: {
                        model: 'rerank-model',
                        modelType: AiModelTypeEnum.RERANK
                    },
                    modelProvider: {
                        id: 'provider-legacy-rerank',
                        providerName: 'openai-compatible'
                    }
                }
            ])
        }
        const getProviderModels = jest.fn((modelType: AiModelTypeEnum) => {
            if (modelType === AiModelTypeEnum.LLM) {
                return [
                    {
                        model: 'llm-model',
                        model_type: AiModelTypeEnum.LLM,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: { zh_Hans: 'LLM', en_US: 'LLM' }
                    }
                ]
            }
            if (modelType === AiModelTypeEnum.TEXT_EMBEDDING) {
                return [
                    {
                        model: 'embedding-model',
                        model_type: AiModelTypeEnum.TEXT_EMBEDDING,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: { zh_Hans: 'Embedding', en_US: 'Embedding' }
                    }
                ]
            }
            if (modelType === AiModelTypeEnum.RERANK) {
                return [
                    {
                        model: 'rerank-model',
                        model_type: AiModelTypeEnum.RERANK,
                        fetch_from: FetchFrom.PREDEFINED_MODEL,
                        model_properties: {},
                        features: [],
                        label: { zh_Hans: 'Rerank', en_US: 'Rerank' }
                    }
                ]
            }
            return []
        })
        const providersService = {
            getProvider: jest.fn().mockReturnValue({
                getProviderModels,
                getProviderSchema: jest.fn().mockReturnValue({
                    provider: 'openai-compatible',
                    label: { zh_Hans: 'OpenAI Compatible', en_US: 'OpenAI Compatible' },
                    supported_model_types: [
                        AiModelTypeEnum.LLM,
                        AiModelTypeEnum.TEXT_EMBEDDING,
                        AiModelTypeEnum.RERANK
                    ],
                    models: []
                })
            })
        }
        const modelAccessService = {
            canUseCatalogModels: jest.fn()
        }
        const handler = new FindCopilotModelsHandler(
            { execute: jest.fn().mockResolvedValue([]) } as never,
            service as never,
            providersService as never,
            modelAccessService as never
        )
        Object.defineProperty(handler, 'configService', {
            value: { get: jest.fn().mockReturnValue('http://localhost:3000') }
        })

        const llmResult = await handler.execute(
            new FindCopilotModelsQuery(AiModelTypeEnum.LLM, CopilotModelCatalogMode.MembershipManagement)
        )
        const embeddingResult = await handler.execute(
            new FindCopilotModelsQuery(AiModelTypeEnum.TEXT_EMBEDDING, CopilotModelCatalogMode.MembershipManagement)
        )
        const rerankResult = await handler.execute(
            new FindCopilotModelsQuery(AiModelTypeEnum.RERANK, CopilotModelCatalogMode.MembershipManagement)
        )

        expect(llmResult.map((copilot) => copilot.id)).toEqual([
            'copilot-primary',
            'copilot-secondary',
            'copilot-reasoning'
        ])
        expect(llmResult.map((copilot) => copilot.providerWithModels.models.map((model) => model.model))).toEqual([
            ['llm-model'],
            ['llm-model'],
            ['llm-model']
        ])
        expect(embeddingResult.map((copilot) => copilot.id)).toEqual(['copilot-embedding'])
        expect(embeddingResult[0].providerWithModels.models.map((model) => model.model)).toEqual(['embedding-model'])
        expect(rerankResult.map((copilot) => copilot.id)).toEqual(['copilot-legacy-rerank'])
        expect(rerankResult[0].providerWithModels.models.map((model) => model.model)).toEqual(['rerank-model'])
        expect(service.findAllAvailablesCopilots).not.toHaveBeenCalled()
        expect(service.findAllEnabledCopilotsWithoutMembership).toHaveBeenCalledWith('tenant-1', 'org-1')
        expect(modelAccessService.canUseCatalogModels).not.toHaveBeenCalled()
    })
})
