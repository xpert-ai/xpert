import {
    AiModelTypeEnum,
    AIPermissionsEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelAccessUnavailableReasonEnum,
    UserModelGrantStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../../copilot/queries/copilot-model-find.query'
import { ModelAccessEvent } from '../model-access-event.entity'
import { ModelAccessRequest } from '../model-access-request.entity'
import { createFixture } from '../testing/model-access-service.test-fixture'

describe('ModelAccessService organization model configuration', () => {
    it('ignores an enabled organization Copilot after its Provider has been deleted', async () => {
        const { copilotRepository, providersService, service } = createFixture()
        copilotRepository.find.mockResolvedValue([
            {
                id: 'copilot-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                enabled: true,
                modelProvider: null
            }
        ])

        await expect(service.hasConfiguredOrganizationModels('tenant-1', 'org-1')).resolves.toBe(false)
        expect(providersService.getProvider).not.toHaveBeenCalled()
    })

    it('recognizes an enabled organization Copilot with a valid Provider model', async () => {
        const { copilotRepository, service } = createFixture()
        copilotRepository.find.mockResolvedValue([
            {
                id: 'copilot-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                enabled: true,
                modelProvider: {
                    id: 'provider-1',
                    providerName: 'openai',
                    isValid: true
                }
            }
        ])

        await expect(service.hasConfiguredOrganizationModels('tenant-1', 'org-1')).resolves.toBe(true)
    })
})

describe('ModelAccessService catalog', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('exposes organization models as direct access when organization membership is disabled', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const { copilotRepository, membershipService, queryBus, service } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            name: 'Organization Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        membershipService.findModelAccess.mockResolvedValue(null)
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !organizationId)
        queryBus.execute.mockImplementation(async (query: FindCopilotModelsQuery) =>
            query.type === AiModelTypeEnum.LLM
                ? [
                      {
                          id: 'copilot-1',
                          organizationId: 'org-1',
                          providerWithModels: {
                              provider: 'openai',
                              models: [
                                  {
                                      model: 'gpt-4.1',
                                      model_type: AiModelTypeEnum.LLM
                                  }
                              ]
                          }
                      }
                  ]
                : []
        )

        await expect(service.getCatalog()).resolves.toMatchObject({
            items: [
                {
                    copilotId: 'copilot-1',
                    copilotModelId: 'gpt-4.1',
                    ownershipScope: ModelAccessOwnershipScopeEnum.Organization,
                    organizationId: 'org-1',
                    accessSource: ModelAccessSourceEnum.Direct,
                    planIncluded: false,
                    allowed: true,
                    requestable: false
                }
            ],
            canRequest: false
        })
        expect(membershipService.hasConsumableBalance).not.toHaveBeenCalled()
    })

    it('automatically exposes tenant chat models for external API application', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { membershipService, publicationRepository, queryBus, service, userRepository } = createFixture()
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: {
                rolePermissions: [
                    {
                        permission: AIPermissionsEnum.MODEL_GATEWAY_USE,
                        enabled: true
                    }
                ]
            }
        })
        membershipService.findModelAccess.mockResolvedValue(null)
        queryBus.execute.mockImplementation(async (query: FindCopilotModelsQuery) =>
            query.type === AiModelTypeEnum.LLM
                ? [
                      {
                          id: 'copilot-1',
                          organizationId: null,
                          providerWithModels: {
                              provider: 'openai',
                              models: [
                                  {
                                      model: 'gpt-4.1',
                                      model_type: AiModelTypeEnum.LLM
                                  }
                              ]
                          }
                      }
                  ]
                : []
        )

        await expect(service.getExternalCatalog()).resolves.toMatchObject({
            eligible: true,
            items: [
                {
                    copilotId: 'copilot-1',
                    copilotModelId: 'gpt-4.1',
                    externalModelId: 'gpt-4.1',
                    requestable: true
                }
            ]
        })
        expect(publicationRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1'
            })
        )
        expect(publicationRepository.create.mock.calls[0][0]).not.toHaveProperty('status')
        expect(publicationRepository.create.mock.calls[0][0]).not.toHaveProperty('validationStatus')
        expect(publicationRepository.create.mock.calls[0][0]).not.toHaveProperty('firstPublishedAt')
    })

    it('reports why an approved external model is not currently callable', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { grantQueryBuilder, membershipService, queryBus, service, userRepository } = createFixture()
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: {
                rolePermissions: [
                    {
                        permission: AIPermissionsEnum.MODEL_GATEWAY_USE,
                        enabled: true
                    }
                ]
            }
        })
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: {
                plan: {}
            }
        })
        membershipService.hasConsumableBalance.mockResolvedValue(false)
        membershipService.isModelAllowed.mockReturnValue(false)
        grantQueryBuilder.getMany.mockResolvedValue([
            {
                id: 'grant-1',
                tenantId: 'tenant-1',
                organizationId: null,
                userId: 'creator-user',
                channel: ModelAccessChannelEnum.ExternalApi,
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                provider: 'openai',
                modelType: AiModelTypeEnum.LLM,
                model: 'gpt-4.1',
                status: UserModelGrantStatusEnum.Active,
                ownershipScope: ModelAccessOwnershipScopeEnum.Tenant
            }
        ])
        queryBus.execute.mockImplementation(async (query: FindCopilotModelsQuery) =>
            query.type === AiModelTypeEnum.LLM
                ? [
                      {
                          id: 'copilot-1',
                          organizationId: null,
                          providerWithModels: {
                              provider: 'openai',
                              models: [
                                  {
                                      model: 'gpt-4.1',
                                      model_type: AiModelTypeEnum.LLM
                                  }
                              ]
                          }
                      }
                  ]
                : []
        )

        await expect(service.getExternalCatalog()).resolves.toMatchObject({
            items: [
                {
                    grant: { id: 'grant-1' },
                    allowed: false,
                    unavailableReason: ModelAccessUnavailableReasonEnum.QuotaExhausted
                }
            ]
        })
    })

    it('creates an external API request directly from the selected tenant model', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        const { dataSource, service, userRepository } = createFixture()
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: {
                rolePermissions: [
                    {
                        permission: AIPermissionsEnum.MODEL_GATEWAY_USE,
                        enabled: true
                    }
                ]
            }
        })
        const requestRepository = {
            create: jest.fn((input) => input),
            save: jest.fn(async (input) => ({ id: 'request-1', ...input })),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null,
                channel: ModelAccessChannelEnum.ExternalApi
            })
        }
        const eventRepository = {
            create: jest.fn((input) => input),
            save: jest.fn(async (input) => ({ id: 'event-1', ...input }))
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.createExternalRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Use from my client'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            channel: ModelAccessChannelEnum.ExternalApi,
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            externalModelId: 'gpt-4.1'
        })
        expect(requestRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: ModelAccessChannelEnum.ExternalApi,
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                externalModelId: 'gpt-4.1'
            })
        )
    })

    it('routes an organization external API request to organization approval', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const { copilotRepository, dataSource, publicationRepository, service, userRepository } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            name: 'Organization model',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: {
                rolePermissions: [
                    {
                        permission: AIPermissionsEnum.MODEL_GATEWAY_USE,
                        enabled: true
                    }
                ]
            }
        })
        const requestRepository = {
            create: jest.fn((input) => input),
            save: jest.fn(async (input) => ({ id: 'request-1', ...input })),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: 'org-1',
                channel: ModelAccessChannelEnum.ExternalApi
            })
        }
        const eventRepository = {
            create: jest.fn((input) => input),
            save: jest.fn(async (input) => ({ id: 'event-1', ...input }))
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.createExternalRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Use from the organization client'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            channel: ModelAccessChannelEnum.ExternalApi,
            organizationId: 'org-1',
            requestedFromOrganizationId: 'org-1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Organization
        })
        expect(publicationRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotId: 'copilot-1'
            })
        )
        expect(requestRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                requestedFromOrganizationId: 'org-1',
                ownershipScope: ModelAccessOwnershipScopeEnum.Organization
            })
        )
    })

    it('does not expose an invalid custom provider model as requestable', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { providerModelRepository, queryBus, service } = createFixture()
        providerModelRepository.findOne.mockResolvedValue({
            modelName: 'invalid-custom',
            isValid: false
        })
        queryBus.execute.mockImplementation(async (query: FindCopilotModelsQuery) =>
            query.type === AiModelTypeEnum.LLM
                ? [
                      {
                          id: 'copilot-1',
                          organizationId: null,
                          providerWithModels: {
                              provider: 'openai',
                              models: [
                                  {
                                      model: 'invalid-custom',
                                      model_type: AiModelTypeEnum.LLM,
                                      label: {
                                          en_US: 'Invalid custom',
                                          zh_Hans: 'Invalid custom'
                                      }
                                  }
                              ]
                          }
                      }
                  ]
                : []
        )

        await expect(service.getCatalog()).resolves.toMatchObject({
            items: [
                {
                    copilotModelId: 'invalid-custom',
                    allowed: false,
                    requestable: false
                }
            ],
            canRequest: false
        })
        expect(providerModelRepository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                providerId: 'provider-1',
                modelType: AiModelTypeEnum.LLM,
                modelName: 'invalid-custom'
            }
        })
        expect(
            new Set(
                queryBus.execute.mock.calls.map(([query]) =>
                    query instanceof FindCopilotModelsQuery ? query.catalogMode : null
                )
            )
        ).toEqual(new Set([CopilotModelCatalogMode.Available, CopilotModelCatalogMode.Management]))
    })

    it('does not expose a deprecated predefined model as requestable', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { copilotRepository, providersService, queryBus, service, userRepository } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: null,
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'siliconflow',
                isValid: true
            }
        })
        providersService.getProvider.mockReturnValue({
            getProviderModels: jest.fn().mockReturnValue([
                {
                    model: 'moonshotai/Kimi-K2-Thinking',
                    model_type: AiModelTypeEnum.LLM,
                    deprecated: true
                }
            ]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'siliconflow',
                label: { en_US: 'SiliconFlow', zh_Hans: 'SiliconFlow' }
            })
        })
        queryBus.execute.mockImplementation(async (query: FindCopilotModelsQuery) =>
            query.type === AiModelTypeEnum.LLM
                ? [
                      {
                          id: 'copilot-1',
                          organizationId: null,
                          providerWithModels: {
                              provider: 'siliconflow',
                              models: [
                                  {
                                      model: 'moonshotai/Kimi-K2-Thinking',
                                      model_type: AiModelTypeEnum.LLM,
                                      deprecated: true
                                  }
                              ]
                          }
                      }
                  ]
                : []
        )

        await expect(service.getCatalog()).resolves.toMatchObject({
            items: [
                {
                    copilotModelId: 'moonshotai/Kimi-K2-Thinking',
                    allowed: false,
                    requestable: false
                }
            ],
            canRequest: false
        })

        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: {
                rolePermissions: [
                    {
                        permission: AIPermissionsEnum.MODEL_GATEWAY_USE,
                        enabled: true
                    }
                ]
            }
        })
        await expect(service.getExternalCatalog()).resolves.toMatchObject({
            items: [
                {
                    copilotModelId: 'moonshotai/Kimi-K2-Thinking',
                    deprecated: true,
                    requestable: false
                }
            ]
        })
    })

    it('keeps available plan models while management catalog models are requestable', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { copilotRepository, membershipService, providersService, queryBus, service } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Primary',
            enabled: true,
            copilotModel: {
                model: 'configured-candidate',
                modelType: AiModelTypeEnum.LLM
            },
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        providersService.getProvider.mockReturnValue({
            getProviderModels: jest.fn().mockReturnValue([
                {
                    model: 'plan-model',
                    model_type: AiModelTypeEnum.LLM
                },
                {
                    model: 'configured-candidate',
                    model_type: AiModelTypeEnum.LLM
                }
            ]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'openai',
                label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' }
            })
        })
        membershipService.findModelAccess.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: {
                plan: {
                    allowedModels: [{ provider: 'openai', model: 'plan-model' }]
                }
            }
        })
        membershipService.isModelAllowed.mockImplementation(
            (_plan: unknown, _provider: string, model: string) => model === 'plan-model'
        )
        queryBus.execute.mockImplementation(async (query: FindCopilotModelsQuery) => {
            if (query.type !== AiModelTypeEnum.LLM) {
                return []
            }
            const model =
                query.catalogMode === CopilotModelCatalogMode.Available ? 'plan-model' : 'configured-candidate'
            return [
                {
                    id: 'copilot-1',
                    organizationId: null,
                    providerWithModels: {
                        provider: 'openai',
                        models: [
                            {
                                model,
                                model_type: AiModelTypeEnum.LLM
                            }
                        ]
                    }
                }
            ]
        })

        await expect(service.getCatalog()).resolves.toMatchObject({
            items: expect.arrayContaining([
                expect.objectContaining({
                    copilotModelId: 'plan-model',
                    planIncluded: true,
                    allowed: true,
                    requestable: false
                }),
                expect.objectContaining({
                    copilotModelId: 'configured-candidate',
                    planIncluded: false,
                    allowed: false,
                    requestable: true
                })
            ]),
            canRequest: true
        })
    })

    it('does not include tenant models when an organization has its own membership models', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const { copilotRepository, membershipService, providersService, queryBus, service } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Tenant Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        providersService.getProvider.mockReturnValue({
            getProviderModels: jest.fn().mockReturnValue([
                {
                    model: 'plan-model',
                    model_type: AiModelTypeEnum.LLM
                }
            ]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'openai',
                label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' }
            })
        })
        membershipService.findModelAccess.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership: {
                plan: {
                    catalogSourcePlanId: 'tenant-catalog-plan',
                    allowedModels: [{ provider: 'openai', model: 'plan-model' }]
                }
            }
        })
        copilotRepository.find.mockResolvedValue([
            {
                id: 'organization-copilot',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                enabled: true,
                modelProvider: {
                    id: 'organization-provider',
                    providerName: 'openai',
                    isValid: true
                }
            }
        ])
        membershipService.isModelAllowed.mockReturnValue(true)
        queryBus.execute.mockImplementation(async (query: FindCopilotModelsQuery) =>
            query.type === AiModelTypeEnum.LLM
                ? [
                      {
                          id: 'copilot-1',
                          organizationId: null,
                          providerWithModels: {
                              provider: 'openai',
                              models: [
                                  {
                                      model: 'plan-model',
                                      model_type: AiModelTypeEnum.LLM
                                  }
                              ]
                          }
                      }
                  ]
                : []
        )

        await expect(service.getCatalog()).resolves.toMatchObject({
            items: [
                expect.objectContaining({
                    copilotModelId: 'plan-model',
                    ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
                    organizationId: null,
                    planIncluded: false,
                    allowed: false,
                    requestable: false,
                    unavailableReason: ModelAccessUnavailableReasonEnum.FeatureDisabled
                })
            ]
        })
    })
})

describe('ModelAccessService synchronized provider catalog', () => {
    const options = {
        modelDiscovery: { mode: 'configured', syncedAt: '2026-10-13T00:00:00Z', availableModelIds: ['live'] }
    }
    it.each([null, 'missing'])(
        'rejects direct execution of an unconfigured or missing model (%s)',
        async (sourceId) => {
            const { copilotRepository, providerModelRepository, input, membershipService, service } = createFixture()
            copilotRepository.findOne.mockResolvedValue({
                id: 'copilot-1',
                tenantId: 'tenant-1',
                organizationId: null,
                name: 'Primary',
                enabled: true,
                copilotModel: { model: 'gpt-4.1', modelType: AiModelTypeEnum.LLM },
                modelProvider: { id: 'provider-1', providerName: 'openai', isValid: true, options }
            })
            if (sourceId)
                providerModelRepository.findOne.mockResolvedValue({
                    modelName: 'gpt-4.1',
                    modelType: AiModelTypeEnum.LLM,
                    modelProperties: { discovery_model_id: sourceId }
                })
            membershipService.findModelAccess.mockResolvedValue({
                organizationId: null,
                membership: { planId: 'plan-1', plan: {} }
            })
            membershipService.isModelAllowed.mockReturnValue(true)
            await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
                allowed: false,
                unavailableReason: ModelAccessUnavailableReasonEnum.ModelDisabled
            })
            await expect(service.assertCanUseModel(input)).rejects.toThrow()
        }
    )

    it('does not count catalog or selected fallbacks as configured organization models', async () => {
        const { copilotRepository, providerModelRepository, service } = createFixture()
        copilotRepository.find.mockResolvedValue([
            {
                id: 'copilot-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                enabled: true,
                copilotModel: { model: 'gpt-4.1' },
                modelProvider: { id: 'provider-1', providerName: 'openai', isValid: true, options }
            }
        ])
        providerModelRepository.find.mockResolvedValue([
            { modelName: 'old', modelProperties: { discovery_model_id: 'missing' } }
        ])
        await expect(service.hasConfiguredOrganizationModels('tenant-1', 'org-1')).resolves.toBe(false)
        providerModelRepository.find.mockResolvedValue([{ modelName: 'manual', modelProperties: {} }])
        await expect(service.hasConfiguredOrganizationModels('tenant-1', 'org-1')).resolves.toBe(true)
    })
})
