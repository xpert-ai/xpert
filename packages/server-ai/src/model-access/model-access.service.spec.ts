import {
    AiModelTypeEnum,
    AIPermissionsEnum,
    ModelAccessChannelEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessEventTypeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum,
    ModelAccessSourceEnum,
    ModelAccessUnavailableReasonEnum,
    UserType,
    UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { FeatureOrganization, RequestContext } from '@xpert-ai/server-core'
import { NotFoundException } from '@nestjs/common'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot/queries/copilot-model-find.query'
import { ModelAccessEvent } from './model-access-event.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { ModelAccessService, modelAccessEndOfDay } from './model-access.service'
import { UserModelGrant } from './user-model-grant.entity'

function queryBuilder<T>(result: T, results: T[] = []) {
    const builder = {
        leftJoinAndSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        setLock: jest.fn(),
        take: jest.fn(),
        skip: jest.fn(),
        getOne: jest.fn().mockResolvedValue(result),
        getMany: jest.fn().mockResolvedValue(results),
        getManyAndCount: jest.fn().mockResolvedValue([results, results.length])
    }
    builder.leftJoinAndSelect.mockReturnValue(builder)
    builder.where.mockReturnValue(builder)
    builder.andWhere.mockReturnValue(builder)
    builder.orderBy.mockReturnValue(builder)
    builder.setLock.mockReturnValue(builder)
    builder.take.mockReturnValue(builder)
    builder.skip.mockReturnValue(builder)
    return builder
}

function createFixture() {
    const grantQueryBuilder = queryBuilder<unknown>(null)
    const requestQueryBuilder = queryBuilder<unknown>(null)
    const featureQueryBuilder = queryBuilder({ isEnabled: true })
    const dataSource = {
        transaction: jest.fn()
    }
    const membershipService = {
        resolveBillableUserId: jest.fn().mockResolvedValue('creator-user'),
        isMembershipAccessEnabled: jest.fn().mockResolvedValue(true),
        isMembershipPlanEnabled: jest.fn().mockResolvedValue(true),
        hasActiveMembershipPlan: jest.fn().mockResolvedValue(true),
        findModelAccess: jest.fn(),
        isModelAllowed: jest.fn(),
        resolveModelMultiplierForPlan: jest.fn().mockReturnValue(2),
        hasConsumableBalance: jest.fn().mockResolvedValue(true),
        assertCanUse: jest.fn().mockResolvedValue(undefined)
    }
    const copilotRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Primary',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
    }
    const providerModelRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null)
    }
    const grantRepository = {
        createQueryBuilder: jest.fn(() => grantQueryBuilder),
        find: jest.fn().mockResolvedValue([])
    }
    const requestRepository = {
        createQueryBuilder: jest.fn(() => requestQueryBuilder)
    }
    const eventRepository = {
        find: jest.fn().mockResolvedValue([])
    }
    const publicationRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((input) => ({
            id: `publication-${input.copilotModelId}`,
            createdAt: new Date('2026-07-27T00:00:00.000Z'),
            ...input
        })),
        save: jest.fn(async (input) => input)
    }
    const userRepository = {
        findOne: jest.fn().mockResolvedValue({ id: 'creator-user', type: 'user' })
    }
    const organizationRepository = {
        findOne: jest.fn().mockResolvedValue({
            id: 'default-org',
            timeZone: 'Asia/Shanghai'
        })
    }
    const providersService = {
        getProvider: jest.fn().mockReturnValue({
            getProviderModels: jest.fn().mockReturnValue([
                {
                    model: 'gpt-4.1',
                    model_type: AiModelTypeEnum.LLM,
                    label: { en_US: 'GPT-4.1', zh_Hans: 'GPT-4.1' }
                }
            ]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'openai',
                label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' }
            })
        })
    }
    const queryBus = {
        execute: jest.fn()
    }
    const service = new ModelAccessService(
        dataSource as never,
        requestRepository as never,
        grantRepository as never,
        eventRepository as never,
        publicationRepository as never,
        copilotRepository as never,
        providerModelRepository as never,
        userRepository as never,
        organizationRepository as never,
        { createQueryBuilder: jest.fn(() => featureQueryBuilder) } as never,
        queryBus as never,
        providersService as never,
        membershipService as never
    )
    jest.spyOn(service, 'processDueGrants').mockResolvedValue(0)

    const input = {
        tenantId: 'tenant-1',
        organizationId: 'runtime-org',
        userId: 'technical-runtime-user',
        xpertId: 'xpert-1',
        copilotId: 'copilot-1',
        copilotModelId: 'gpt-4.1',
        modelType: AiModelTypeEnum.LLM
    }

    return {
        featureQueryBuilder,
        copilotRepository,
        dataSource,
        eventRepository,
        grantQueryBuilder,
        grantRepository,
        input,
        membershipService,
        organizationRepository,
        publicationRepository,
        providerModelRepository,
        providersService,
        queryBus,
        requestQueryBuilder,
        service,
        userRepository
    }
}

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

describe('ModelAccessService model resolution', () => {
    it('disables a selected model removed from the provider catalog', async () => {
        const { copilotRepository, input, membershipService, providersService, service } = createFixture()
        const removedModel = 'deepseek-coder'
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Primary',
            enabled: true,
            copilotModel: {
                model: removedModel,
                modelType: AiModelTypeEnum.LLM
            },
            modelProvider: {
                id: 'provider-1',
                providerName: 'deepseek',
                isValid: true
            }
        })
        providersService.getProvider.mockReturnValue({
            getProviderModels: jest.fn().mockReturnValue([]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'deepseek',
                label: { en_US: 'DeepSeek', zh_Hans: 'DeepSeek' }
            })
        })
        const plan = { id: 'plan-1' }
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: { planId: 'plan-1', plan }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        await expect(
            service.resolveModelAccess({
                ...input,
                organizationId: null,
                copilotModelId: removedModel
            })
        ).resolves.toMatchObject({
            allowed: false,
            unavailableReason: ModelAccessUnavailableReasonEnum.ModelDisabled
        })
    })

    it('uses the organization plan for credential models when the user cannot manage providers', async () => {
        const { copilotRepository, input, membershipService, service, userRepository } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'runtime-org',
            name: 'Organization Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                providerName: 'openai',
                credentials: { api_key: 'configured' },
                isValid: true
            }
        })
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: {
                rolePermissions: [{ permission: AIPermissionsEnum.MEMBERSHIP_EDIT, enabled: true }]
            }
        })
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: 'runtime-org',
            membership: { planId: 'organization-plan', plan: {} }
        })
        membershipService.isModelAllowed.mockReturnValue(false)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            accessSource: null,
            organizationId: 'runtime-org',
            scope: ModelAccessOwnershipScopeEnum.Organization
        })
        expect(membershipService.findModelAccess).toHaveBeenCalled()
    })

    it('keeps organization credential models direct for provider managers even when they manage memberships', async () => {
        const { copilotRepository, input, membershipService, service, userRepository } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'runtime-org',
            name: 'Organization Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                providerName: 'openai',
                credentials: { api_key: 'configured' },
                isValid: true
            }
        })
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: {
                rolePermissions: [
                    { permission: AIPermissionsEnum.COPILOT_EDIT, enabled: true },
                    { permission: AIPermissionsEnum.MEMBERSHIP_EDIT, enabled: true }
                ]
            }
        })
        const plan = { id: 'organization-plan' }
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: 'runtime-org',
            membership: { planId: 'organization-plan', plan }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Direct,
            organizationId: 'runtime-org'
        })
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })

    it('keeps organization credential models direct when no organization plan is configured', async () => {
        const { copilotRepository, input, membershipService, service, userRepository } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'runtime-org',
            name: 'Organization Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                providerName: 'openai',
                credentials: { api_key: 'configured' },
                isValid: true
            }
        })
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: { rolePermissions: [] }
        })
        membershipService.hasActiveMembershipPlan.mockResolvedValue(false)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Direct,
            organizationId: 'runtime-org'
        })
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })

    it('does not use direct access without configured organization credentials', async () => {
        const { copilotRepository, input, membershipService, service, userRepository } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'runtime-org',
            name: 'Organization Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                providerName: 'openai',
                credentials: {},
                isValid: true
            }
        })
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: { rolePermissions: [] }
        })
        const plan = { id: 'organization-plan' }
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: 'runtime-org',
            membership: { planId: 'organization-plan', plan }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Plan,
            planId: 'organization-plan',
            organizationId: 'runtime-org'
        })
    })

    it('allows an organization model directly when organization membership is disabled', async () => {
        const { copilotRepository, input, membershipService, service } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'runtime-org',
            name: 'Organization Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !organizationId)
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: { planId: 'tenant-plan', plan: {} }
        })

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: 'direct',
            organizationId: 'runtime-org',
            scope: ModelAccessOwnershipScopeEnum.Organization
        })
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })

    it('blocks tenant models in an organization when tenant membership is disabled', async () => {
        const { input, membershipService, service } = createFixture()
        membershipService.isMembershipAccessEnabled.mockResolvedValue(false)
        membershipService.isMembershipPlanEnabled.mockResolvedValue(false)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            organizationId: null,
            scope: ModelAccessOwnershipScopeEnum.Tenant,
            unavailableReason: ModelAccessUnavailableReasonEnum.FeatureDisabled
        })
    })

    it('blocks tenant models when the organization has configured its own models', async () => {
        const { copilotRepository, input, membershipService, service } = createFixture()
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !organizationId)
        copilotRepository.find.mockResolvedValue([
            {
                id: 'organization-copilot',
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                enabled: true,
                modelProvider: {
                    id: 'organization-provider',
                    providerName: 'openai',
                    isValid: true
                }
            }
        ])

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            organizationId: null,
            scope: ModelAccessOwnershipScopeEnum.Tenant,
            unavailableReason: ModelAccessUnavailableReasonEnum.FeatureDisabled
        })
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })

    it('falls back to tenant membership models when only an empty organization Copilot remains', async () => {
        const { copilotRepository, input, membershipService, service } = createFixture()
        copilotRepository.find.mockResolvedValue([
            {
                id: 'organization-copilot',
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                enabled: true,
                modelProvider: null
            }
        ])
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !organizationId)
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: {
                planId: 'tenant-plan',
                plan: { id: 'tenant-plan' }
            }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Plan,
            organizationId: null,
            scope: ModelAccessOwnershipScopeEnum.Tenant
        })
    })

    it('resolves an organization-scoped provider from the persisted model scope', async () => {
        const { copilotRepository, input, membershipService, providersService, service } = createFixture()
        const organizationProvider = {
            getProviderModels: jest.fn().mockReturnValue([
                {
                    model: 'gpt-4.1',
                    model_type: AiModelTypeEnum.LLM,
                    label: { en_US: 'GPT-4.1', zh_Hans: 'GPT-4.1' }
                }
            ]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'openai',
                label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' }
            })
        }
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            name: 'Organization Provider',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        providersService.getProvider.mockImplementation(
            (_name: string, _throwError = false, organizationId?: string) =>
                organizationId === 'organization-1' ? organizationProvider : undefined
        )
        membershipService.findModelAccess.mockResolvedValue(null)

        await expect(
            service.resolveModelAccess({
                ...input,
                organizationId: 'organization-1'
            })
        ).resolves.toMatchObject({
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            organizationId: 'organization-1'
        })
        expect(providersService.getProvider).toHaveBeenCalledWith('openai', false, 'organization-1')
    })

    it('gives plan access precedence over an active personal grant', async () => {
        const { grantQueryBuilder, input, membershipService, service } = createFixture()
        grantQueryBuilder.getOne.mockResolvedValue({
            id: 'grant-1',
            status: UserModelGrantStatusEnum.Active,
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant
        })
        const plan = { id: 'plan-1' }
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: { planId: 'plan-1', plan }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        const result = await service.resolveModelAccess(input)

        expect(result).toMatchObject({
            allowed: true,
            billableUserId: 'creator-user',
            accessSource: ModelAccessSourceEnum.Plan,
            planId: 'plan-1',
            multiplier: 2
        })
        expect(result.grantId).toBeUndefined()
        expect(membershipService.resolveModelMultiplierForPlan).toHaveBeenCalledWith(plan, 'openai', 'gpt-4.1')
    })

    it('resolves a catalog batch with one shared access context and bulk target loading', async () => {
        const {
            copilotRepository,
            grantRepository,
            membershipService,
            providerModelRepository,
            providersService,
            service
        } = createFixture()
        copilotRepository.find.mockResolvedValue([
            {
                id: 'copilot-1',
                tenantId: 'tenant-1',
                organizationId: null,
                name: 'Primary',
                enabled: true,
                modelProvider: {
                    id: 'provider-1',
                    providerName: 'openai',
                    isValid: true
                }
            }
        ])
        providersService.getProvider.mockReturnValue({
            getProviderModels: jest.fn().mockReturnValue([
                {
                    model: 'gpt-4.1',
                    model_type: AiModelTypeEnum.LLM,
                    label: { en_US: 'GPT-4.1', zh_Hans: 'GPT-4.1' }
                },
                {
                    model: 'gpt-4.2',
                    model_type: AiModelTypeEnum.LLM,
                    label: { en_US: 'GPT-4.2', zh_Hans: 'GPT-4.2' }
                }
            ]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'openai',
                label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' }
            })
        })
        const plan = { id: 'plan-1' }
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: { planId: 'plan-1', plan }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        await expect(
            service.canUseCatalogModels({
                tenantId: 'tenant-1',
                organizationId: null,
                userId: 'runtime-user',
                xpertId: 'xpert-1',
                models: [
                    {
                        copilotId: 'copilot-1',
                        copilotModelId: 'gpt-4.1',
                        modelType: AiModelTypeEnum.LLM
                    },
                    {
                        copilotId: 'copilot-1',
                        copilotModelId: 'gpt-4.2',
                        modelType: AiModelTypeEnum.LLM
                    }
                ]
            })
        ).resolves.toEqual([true, true])

        expect(membershipService.resolveBillableUserId).toHaveBeenCalledTimes(1)
        expect(service.processDueGrants).toHaveBeenCalledTimes(1)
        expect(service.processDueGrants).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'creator-user',
            modelType: AiModelTypeEnum.LLM
        })
        expect(membershipService.findModelAccess).toHaveBeenCalledTimes(1)
        expect(membershipService.hasConsumableBalance).toHaveBeenCalledTimes(1)
        expect(copilotRepository.find).toHaveBeenCalledTimes(1)
        expect(copilotRepository.findOne).not.toHaveBeenCalled()
        expect(providerModelRepository.find).toHaveBeenCalledTimes(1)
        expect(providerModelRepository.findOne).not.toHaveBeenCalled()
        expect(grantRepository.createQueryBuilder).toHaveBeenCalledTimes(1)
    })

    it('filters organization credential models through the active plan for users without provider access', async () => {
        const { copilotRepository, membershipService, service, userRepository } = createFixture()
        copilotRepository.find.mockResolvedValue([
            {
                id: 'copilot-1',
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                name: 'Organization Provider',
                enabled: true,
                modelProvider: {
                    id: 'provider-1',
                    tenantId: 'tenant-1',
                    organizationId: 'runtime-org',
                    providerName: 'openai',
                    credentials: { api_key: 'configured' },
                    isValid: true
                }
            }
        ])
        userRepository.findOne.mockResolvedValue({
            id: 'creator-user',
            type: UserType.USER,
            role: { rolePermissions: [] }
        })
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: 'runtime-org',
            membership: { planId: 'organization-plan', plan: {} }
        })
        membershipService.isModelAllowed.mockReturnValue(false)

        await expect(
            service.canUseCatalogModels({
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                userId: 'runtime-user',
                models: [
                    {
                        copilotId: 'copilot-1',
                        copilotModelId: 'gpt-4.1',
                        modelType: AiModelTypeEnum.LLM
                    }
                ]
            })
        ).resolves.toEqual([false])
    })

    it('uses an organization catalog membership for tenant catalog models', async () => {
        const { input, membershipService, service } = createFixture()
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !!organizationId)
        const plan = {
            id: 'organization-catalog-plan',
            catalogSourcePlanId: 'tenant-catalog-plan'
        }
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: 'runtime-org',
            membership: { planId: 'organization-catalog-plan', plan }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Plan,
            planId: 'organization-catalog-plan',
            organizationId: null,
            scope: ModelAccessOwnershipScopeEnum.Tenant
        })
        expect(membershipService.isModelAllowed).toHaveBeenCalledWith(plan, 'openai', 'gpt-4.1', 'copilot-1')
    })

    it('restores the same personal grant after the plan stops including the model', async () => {
        const { grantQueryBuilder, input, membershipService, service } = createFixture()
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            modelType: AiModelTypeEnum.LLM,
            status: UserModelGrantStatusEnum.Active,
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            lastUnavailableReason: null,
            modelSnapshot: {}
        }
        grantQueryBuilder.getOne.mockResolvedValue(grant)
        const plan = { id: 'plan-1' }
        membershipService.findModelAccess
            .mockResolvedValueOnce({
                organizationId: null,
                membership: { planId: 'plan-1', plan }
            })
            .mockResolvedValueOnce(null)
        membershipService.isModelAllowed.mockReturnValueOnce(true).mockReturnValueOnce(false)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Plan,
            planId: 'plan-1'
        })
        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            multiplier: 1,
            unavailableReason: ModelAccessUnavailableReasonEnum.MembershipRequired
        })

        expect(grant).toMatchObject({
            id: 'grant-1',
            status: UserModelGrantStatusEnum.Active
        })
    })

    it('does not allow a disabled model even when the membership plan includes it', async () => {
        const { copilotRepository, input, membershipService, service } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Primary',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: false
            }
        })
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: { planId: 'plan-1', plan: {} }
        })
        membershipService.isModelAllowed.mockReturnValue(true)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            accessSource: ModelAccessSourceEnum.Plan,
            unavailableReason: ModelAccessUnavailableReasonEnum.ModelDisabled
        })
    })

    it('keeps a grant visible with fixed 1x pricing while generic quota checks still reject calls', async () => {
        const { grantQueryBuilder, input, membershipService, service } = createFixture()
        grantQueryBuilder.getOne.mockResolvedValue({
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            modelType: AiModelTypeEnum.LLM,
            status: UserModelGrantStatusEnum.Active,
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            modelSnapshot: {}
        })
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: { planId: 'plan-1', plan: {} }
        })
        membershipService.isModelAllowed.mockReturnValue(false)
        membershipService.hasConsumableBalance.mockResolvedValue(false)
        membershipService.assertCanUse.mockRejectedValue(new Error('quota exhausted'))

        const resolution = await service.resolveModelAccess(input)

        expect(resolution).toMatchObject({
            allowed: true,
            billableUserId: 'creator-user',
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            multiplier: 1,
            unavailableReason: 'quota_exhausted'
        })
        await expect(service.assertCanUseModel(input)).rejects.toThrow('quota exhausted')
        expect(membershipService.assertCanUse).toHaveBeenCalledWith(
            {
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                copilotOrganizationId: null,
                copilotId: 'copilot-1',
                userId: 'creator-user',
                provider: 'openai',
                model: 'gpt-4.1'
            },
            expect.objectContaining({
                accessSource: ModelAccessSourceEnum.Grant,
                grantId: 'grant-1',
                multiplier: 1
            })
        )
    })

    it('uses the current organization membership when a tenant model is used through a personal grant', async () => {
        const { grantQueryBuilder, input, membershipService, service } = createFixture()
        grantQueryBuilder.getOne.mockResolvedValue({
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            modelType: AiModelTypeEnum.LLM,
            status: UserModelGrantStatusEnum.Active,
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            modelSnapshot: {}
        })
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: 'runtime-org',
            membership: {
                planId: 'organization-plan',
                plan: { id: 'organization-plan' }
            }
        })
        membershipService.isModelAllowed.mockReturnValue(false)

        const resolution = await service.assertCanUseModel(input)

        expect(resolution).toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            planId: 'organization-plan',
            multiplier: 1,
            scope: ModelAccessOwnershipScopeEnum.Tenant,
            organizationId: null
        })
        expect(membershipService.assertCanUse).toHaveBeenCalledWith(
            {
                tenantId: 'tenant-1',
                organizationId: 'runtime-org',
                copilotOrganizationId: null,
                copilotId: 'copilot-1',
                userId: 'creator-user',
                provider: 'openai',
                model: 'gpt-4.1'
            },
            resolution
        )
    })

    it('uses the exact copilot, model type, and model id when resolving a grant', async () => {
        const { grantQueryBuilder, input, membershipService, service } = createFixture()
        membershipService.findModelAccess.mockResolvedValue(null)

        await service.resolveModelAccess(input)

        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.copilotId = :copilotId', {
            copilotId: 'copilot-1'
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.copilotModelId = :copilotModelId', {
            copilotModelId: 'gpt-4.1'
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.modelType = :modelType', {
            modelType: AiModelTypeEnum.LLM
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith(
            '(grant.organizationId IS NULL OR grant.organizationId = :runtimeOrganizationId)',
            { runtimeOrganizationId: 'runtime-org' }
        )
    })

    it('does not let a technical user consume an existing personal grant', async () => {
        const { grantQueryBuilder, input, membershipService, service, userRepository } = createFixture()
        grantQueryBuilder.getOne.mockResolvedValue({
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            modelType: AiModelTypeEnum.LLM,
            status: UserModelGrantStatusEnum.Active,
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            lastUnavailableReason: 'technical_user',
            modelSnapshot: {}
        })
        membershipService.findModelAccess.mockResolvedValue(null)
        userRepository.findOne.mockResolvedValue({ id: 'creator-user', type: 'communication' })

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            unavailableReason: 'technical_user'
        })
    })

    it('keeps a grant suspended when its model is restored while the feature remains disabled', async () => {
        const { featureQueryBuilder, grantRepository, service } = createFixture()
        featureQueryBuilder.getOne.mockResolvedValue({ isEnabled: false })
        grantRepository.find.mockResolvedValue([
            {
                id: 'grant-1',
                tenantId: 'tenant-1',
                organizationId: null,
                userId: 'creator-user',
                requestId: 'request-1',
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                status: UserModelGrantStatusEnum.Active,
                ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
                lastUnavailableReason: 'feature_disabled',
                modelSnapshot: {}
            }
        ])

        await expect(
            service.handleCopilotStateChanged({
                id: 'copilot-1',
                tenantId: 'tenant-1',
                enabled: true
            })
        ).resolves.toBeUndefined()
    })

    it('suspends a grant while the feature is disabled and restores it when reopened', async () => {
        const { featureQueryBuilder, grantQueryBuilder, input, membershipService, service } = createFixture()
        grantQueryBuilder.getOne.mockResolvedValue({
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            modelType: AiModelTypeEnum.LLM,
            status: UserModelGrantStatusEnum.Active,
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            modelSnapshot: {}
        })
        membershipService.findModelAccess.mockResolvedValue(null)
        featureQueryBuilder.getOne.mockResolvedValue({ isEnabled: false })

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            accessSource: ModelAccessSourceEnum.Grant,
            unavailableReason: ModelAccessUnavailableReasonEnum.FeatureDisabled
        })

        featureQueryBuilder.getOne.mockResolvedValue({ isEnabled: true })

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Grant,
            unavailableReason: ModelAccessUnavailableReasonEnum.MembershipRequired
        })
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

describe('ModelAccessService approval idempotency', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('returns the existing grant without revalidating an expired approval input', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'admin-1',
            tenantId: 'tenant-1'
        })
        const { dataSource, service } = createFixture()
        const request = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: null,
            status: ModelAccessRequestStatusEnum.Approved
        }
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            requestId: 'request-1',
            status: UserModelGrantStatusEnum.Active
        }
        const requestQueryBuilder = queryBuilder(request)
        const eventRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        const grantRepository = {
            findOne: jest.fn().mockResolvedValue(grant)
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return {
                        createQueryBuilder: jest.fn(() => requestQueryBuilder)
                    }
                }
                if (entity === UserModelGrant) {
                    return grantRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.approveRequest('request-1', {
                validUntil: '2020-01-01T00:00:00.000Z'
            })
        ).resolves.toMatchObject({
            id: 'grant-1',
            events: []
        })
        expect(grantRepository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                requestId: 'request-1'
            }
        })
        expect(requestQueryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write')
    })
})

describe('ModelAccessService admin scope isolation', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('rejects requests outside the current tenant and organization scope', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'admin-1',
            tenantId: 'tenant-1'
        })
        const { dataSource, service } = createFixture()
        const requestQueryBuilder = queryBuilder<ModelAccessRequest>(null)
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return {
                        createQueryBuilder: jest.fn(() => requestQueryBuilder)
                    }
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(service.approveRequest('request-outside-scope', {})).rejects.toBeInstanceOf(NotFoundException)
        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.tenantId = :tenantId', {
            tenantId: 'tenant-1'
        })
        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.organizationId = :scopeOrganizationId', {
            scopeOrganizationId: 'org-1'
        })
    })
})

describe('ModelAccessService request scope resolution', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it.each([
        {
            description: 'keeps a tenant model in tenant approval when requested from an organization page',
            copilotOrganizationId: null,
            expectedScope: ModelAccessOwnershipScopeEnum.Tenant,
            expectedOrganizationId: null
        },
        {
            description: 'routes an organization model to that organization approval scope',
            copilotOrganizationId: 'org-1',
            expectedScope: ModelAccessOwnershipScopeEnum.Organization,
            expectedOrganizationId: 'org-1'
        }
    ])('$description', async ({ copilotOrganizationId, expectedScope, expectedOrganizationId }) => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { copilotRepository, dataSource, eventRepository, membershipService, service } = createFixture()
        copilotRepository.findOne.mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: copilotOrganizationId,
            name: 'Primary',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
        membershipService.findModelAccess.mockResolvedValue(null)

        const requestRepository = {
            create: jest.fn((request) => request),
            save: jest.fn(async (request) => ({ ...request, id: 'request-1' })),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: 'org-1'
            })
        }
        const transactionEventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            find: eventRepository.find
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return transactionEventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed for authoring'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: expectedOrganizationId,
            requestedFromOrganizationId: 'org-1',
            ownershipScope: expectedScope
        })
        expect(requestRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: expectedOrganizationId,
                requestedFromOrganizationId: 'org-1',
                ownershipScope: expectedScope
            })
        )
    })

    it('rejects tenant model applications when tenant membership is disabled', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const { dataSource, membershipService, service } = createFixture()
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !!organizationId)

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed from the organization'
            })
        ).rejects.toThrow('Personal model access is disabled.')
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })
})

describe('ModelAccessService request concurrency', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('creates a request without membership balance and returns the same pending request on retry', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { dataSource, grantQueryBuilder, membershipService, requestQueryBuilder, service } = createFixture()
        membershipService.findModelAccess.mockResolvedValue(null)
        membershipService.hasConsumableBalance.mockResolvedValue(false)
        grantQueryBuilder.getOne.mockResolvedValue(null)
        requestQueryBuilder.getOne.mockResolvedValue(null)

        const savedRequest = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: null,
            requesterId: 'creator-user',
            requestedFromOrganizationId: null,
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            reason: 'Needed for authoring',
            status: ModelAccessRequestStatusEnum.Requested,
            modelSnapshot: {}
        }
        const requestRepository = {
            create: jest.fn(() => ({ ...savedRequest, id: undefined })),
            save: jest.fn().mockResolvedValue(savedRequest),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null
            })
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            find: jest.fn().mockResolvedValue([])
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
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed for authoring'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            status: ModelAccessRequestStatusEnum.Requested
        })

        requestQueryBuilder.getOne.mockResolvedValue(savedRequest)

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Retry should be idempotent'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            status: ModelAccessRequestStatusEnum.Requested
        })

        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
        expect(membershipService.hasConsumableBalance).not.toHaveBeenCalled()
        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.status = :status', {
            status: ModelAccessRequestStatusEnum.Requested
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.status = :status', {
            status: UserModelGrantStatusEnum.Active
        })
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: ModelAccessEventTypeEnum.Requested,
                fromStatus: null,
                toStatus: ModelAccessRequestStatusEnum.Requested
            })
        )
    })

    it('rejects a new request while an active grant exists', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { dataSource, grantQueryBuilder, membershipService, service } = createFixture()
        membershipService.findModelAccess.mockResolvedValue(null)
        grantQueryBuilder.getOne.mockResolvedValue({
            id: 'grant-1',
            status: UserModelGrantStatusEnum.Active
        })

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Duplicate access'
            })
        ).rejects.toThrow('This model is already granted.')
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('returns the request created by a concurrent transaction after the unique constraint wins', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const { dataSource, eventRepository, grantQueryBuilder, membershipService, requestQueryBuilder, service } =
            createFixture()
        const concurrentRequest = {
            id: 'request-concurrent',
            tenantId: 'tenant-1',
            organizationId: null,
            requesterId: 'creator-user',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            modelType: AiModelTypeEnum.LLM,
            status: ModelAccessRequestStatusEnum.Requested
        }
        requestQueryBuilder.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrentRequest)
        grantQueryBuilder.getOne.mockResolvedValue(null)
        membershipService.findModelAccess.mockResolvedValue(null)
        dataSource.transaction.mockRejectedValue({ code: '23505' })

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed for authoring'
            })
        ).resolves.toEqual({
            ...concurrentRequest,
            events: []
        })

        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
        expect(eventRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                requestId: 'request-concurrent'
            },
            order: {
                createdAt: 'ASC'
            }
        })
    })
})

describe('ModelAccessService organization cleanup', () => {
    it('closes organization requests and revokes organization grants when a user leaves', async () => {
        const { dataSource, service } = createFixture()
        const request = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            requestedFromOrganizationId: 'org-1',
            requesterId: 'user-1',
            status: ModelAccessRequestStatusEnum.Requested,
            modelSnapshot: {}
        }
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            requestId: 'request-1',
            userId: 'user-1',
            status: UserModelGrantStatusEnum.Active,
            modelSnapshot: {}
        }
        const requestRepository = {
            find: jest.fn().mockResolvedValue([request]),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: 'org-1'
            }),
            save: jest.fn(async (entity) => entity)
        }
        const grantRepository = {
            find: jest.fn().mockResolvedValue([grant]),
            save: jest.fn(async (entity) => entity)
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            findOne: jest.fn()
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === UserModelGrant) {
                    return grantRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await service.closeOrganizationAccessForRemovedUser({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(requestRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                requesterId: 'user-1',
                status: ModelAccessRequestStatusEnum.Requested
            }
        })
        expect(request).toMatchObject({
            status: ModelAccessRequestStatusEnum.Closed,
            closedReasonCode: ModelAccessClosedReasonCodeEnum.UserLeftOrganization
        })
        expect(grant).toMatchObject({
            status: UserModelGrantStatusEnum.Revoked,
            revokeReason: ModelAccessClosedReasonCodeEnum.UserLeftOrganization
        })
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: ModelAccessEventTypeEnum.UserLeftOrganization,
                systemReasonCode: ModelAccessClosedReasonCodeEnum.UserLeftOrganization
            })
        )
    })
})

describe('ModelAccessService lifecycle batches', () => {
    type LifecycleReconciler = {
        reconcilePendingRequest(request: ModelAccessRequest): Promise<boolean>
        reconcileGrantAvailability(grant: UserModelGrant): Promise<boolean>
    }

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('limits each lifecycle query and returns keyset cursors for the next batch', async () => {
        const { grantQueryBuilder, requestQueryBuilder, service } = createFixture()
        const requests = Array.from(
            { length: 200 },
            (_, index) => ({ id: `request-${index + 1}` }) as ModelAccessRequest
        )
        const grants = Array.from({ length: 200 }, (_, index) => ({ id: `grant-${index + 1}` }) as UserModelGrant)
        requestQueryBuilder.getMany.mockResolvedValue(requests)
        grantQueryBuilder.getMany.mockResolvedValue(grants)
        const reconciler = service as unknown as LifecycleReconciler
        jest.spyOn(reconciler, 'reconcilePendingRequest').mockResolvedValue(false)
        jest.spyOn(reconciler, 'reconcileGrantAvailability').mockResolvedValue(false)

        await expect(
            service.reconcileLifecycleBatch({
                requestAfterId: 'request-0',
                grantAfterId: 'grant-0',
                limit: 500
            })
        ).resolves.toEqual({
            requests: 0,
            grants: 0,
            nextRequestAfterId: 'request-200',
            nextGrantAfterId: 'grant-200'
        })

        expect(requestQueryBuilder.andWhere).toHaveBeenCalledWith('request.id > :requestAfterId', {
            requestAfterId: 'request-0'
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.id > :grantAfterId', {
            grantAfterId: 'grant-0'
        })
        expect(requestQueryBuilder.orderBy).toHaveBeenCalledWith('request.id', 'ASC')
        expect(grantQueryBuilder.orderBy).toHaveBeenCalledWith('grant.id', 'ASC')
        expect(requestQueryBuilder.take).toHaveBeenCalledWith(200)
        expect(grantQueryBuilder.take).toHaveBeenCalledWith(200)
    })

    it('resets each cursor after the final partial batch', async () => {
        const { grantQueryBuilder, requestQueryBuilder, service } = createFixture()
        requestQueryBuilder.getMany.mockResolvedValue([{ id: 'request-last' } as ModelAccessRequest])
        grantQueryBuilder.getMany.mockResolvedValue([{ id: 'grant-last' } as UserModelGrant])
        const reconciler = service as unknown as LifecycleReconciler
        jest.spyOn(reconciler, 'reconcilePendingRequest').mockResolvedValue(true)
        jest.spyOn(reconciler, 'reconcileGrantAvailability').mockResolvedValue(true)

        await expect(service.reconcileLifecycleBatch({ limit: 200 })).resolves.toEqual({
            requests: 1,
            grants: 1,
            nextRequestAfterId: null,
            nextGrantAfterId: null
        })
    })
})

describe('ModelAccessService request lifecycle', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('allows a fresh request after the requester withdraws the previous one', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('creator-user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'creator-user',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)

        const { dataSource, grantQueryBuilder, membershipService, requestQueryBuilder, service } = createFixture()
        const previousRequest = {
            id: 'request-1',
            tenantId: 'tenant-1',
            organizationId: null,
            requesterId: 'creator-user',
            requestedFromOrganizationId: null,
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            reason: 'Original reason',
            status: ModelAccessRequestStatusEnum.Requested,
            modelSnapshot: {}
        }
        const transactionRequestQueryBuilder = queryBuilder(previousRequest)
        const requestRepository = {
            createQueryBuilder: jest.fn(() => transactionRequestQueryBuilder),
            create: jest.fn((request) => request),
            save: jest.fn(async (request) =>
                'id' in request && request.id ? request : { ...request, id: 'request-2' }
            ),
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null
            })
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            find: jest.fn().mockResolvedValue([])
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
        membershipService.findModelAccess.mockResolvedValue(null)
        grantQueryBuilder.getOne.mockResolvedValue(null)
        requestQueryBuilder.getOne.mockResolvedValue(null)

        await expect(
            service.withdrawRequest('request-1', {
                reason: 'No longer needed'
            })
        ).resolves.toMatchObject({
            id: 'request-1',
            status: ModelAccessRequestStatusEnum.Withdrawn,
            decisionReason: 'No longer needed'
        })

        await expect(
            service.createRequest({
                copilotId: 'copilot-1',
                copilotModelId: 'gpt-4.1',
                modelType: AiModelTypeEnum.LLM,
                reason: 'Needed again'
            })
        ).resolves.toMatchObject({
            id: 'request-2',
            status: ModelAccessRequestStatusEnum.Requested,
            reason: 'Needed again'
        })

        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: 'request-1',
                eventType: ModelAccessEventTypeEnum.Withdrawn,
                fromStatus: ModelAccessRequestStatusEnum.Requested,
                toStatus: ModelAccessRequestStatusEnum.Withdrawn,
                reason: 'No longer needed'
            })
        )
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: 'request-2',
                eventType: ModelAccessEventTypeEnum.Requested,
                fromStatus: null,
                toStatus: ModelAccessRequestStatusEnum.Requested,
                reason: 'Needed again'
            })
        )
    })
})

describe('ModelAccessService grant lifecycle', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('rejects shortening a grant and allows extending it to permanent with an audit event', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'admin-1',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
        jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(false)

        const { dataSource, service } = createFixture()
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            status: UserModelGrantStatusEnum.Active,
            validUntil: new Date('2027-05-01T00:00:00.000Z'),
            approvedAt: new Date('2026-07-27T00:00:00.000Z'),
            modelSnapshot: {}
        }
        const transactionGrantQueryBuilder = queryBuilder(grant)
        const grantRepository = {
            createQueryBuilder: jest.fn(() => transactionGrantQueryBuilder),
            save: jest.fn(async (entity) => entity)
        }
        const requestRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null
            })
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event),
            find: jest.fn().mockResolvedValue([])
        }
        const grantFeatureRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder({ isEnabled: true }))
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === UserModelGrant) {
                    return grantRepository
                }
                if (entity === ModelAccessRequest) {
                    return requestRepository
                }
                if (entity === ModelAccessEvent) {
                    return eventRepository
                }
                if (entity === FeatureOrganization) {
                    return grantFeatureRepository
                }
                throw new Error('Unexpected repository')
            })
        }
        dataSource.transaction.mockImplementation(async (callback) => callback(manager))

        await expect(
            service.extendGrant('grant-1', {
                validUntil: '2027-04-01T00:00:00.000Z'
            })
        ).rejects.toThrow('The new expiration must be later than the current expiration.')

        await expect(
            service.extendGrant('grant-1', {
                validUntil: null,
                note: 'Approved for permanent use'
            })
        ).resolves.toMatchObject({
            id: 'grant-1',
            status: UserModelGrantStatusEnum.Active,
            validUntil: null
        })

        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                grantId: 'grant-1',
                eventType: ModelAccessEventTypeEnum.Extended,
                fromStatus: UserModelGrantStatusEnum.Active,
                toStatus: UserModelGrantStatusEnum.Active,
                reason: 'Approved for permanent use',
                metadata: expect.objectContaining({
                    previousValidUntil: '2027-05-01T00:00:00.000Z',
                    validUntil: null
                })
            })
        )
    })

    it('expires due grants in a bounded batch and records the status transition', async () => {
        const { dataSource, service } = createFixture()
        jest.mocked(service.processDueGrants).mockRestore()
        const grant = {
            id: 'grant-1',
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'creator-user',
            requestId: 'request-1',
            copilotId: 'copilot-1',
            copilotModelId: 'gpt-4.1',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'gpt-4.1',
            ownershipScope: ModelAccessOwnershipScopeEnum.Tenant,
            status: UserModelGrantStatusEnum.Active,
            validUntil: new Date('2026-07-26T23:59:59.999Z'),
            approvedAt: new Date('2026-07-01T00:00:00.000Z'),
            modelSnapshot: {}
        }
        const dueGrantQueryBuilder = queryBuilder(null, [grant])
        const grantRepository = {
            createQueryBuilder: jest.fn(() => dueGrantQueryBuilder),
            save: jest.fn(async (entity) => entity)
        }
        const requestRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'request-1',
                requestedFromOrganizationId: null
            })
        }
        const eventRepository = {
            create: jest.fn((event) => event),
            save: jest.fn(async (event) => event)
        }
        const manager = {
            getRepository: jest.fn((entity) => {
                if (entity === UserModelGrant) {
                    return grantRepository
                }
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

        await expect(service.processDueGrants({ tenantId: 'tenant-1' })).resolves.toBe(1)

        expect(dueGrantQueryBuilder.take).toHaveBeenCalledWith(500)
        expect(grantRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'grant-1',
                status: UserModelGrantStatusEnum.Expired
            })
        )
        expect(eventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                grantId: 'grant-1',
                eventType: ModelAccessEventTypeEnum.GrantExpired,
                fromStatus: UserModelGrantStatusEnum.Active,
                toStatus: UserModelGrantStatusEnum.Expired
            })
        )
    })
})

describe('model access expiration dates', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('uses the tenant timezone end of day in a fixed-offset zone', () => {
        expect(modelAccessEndOfDay('2027-03-14', 'Asia/Shanghai').toISOString()).toBe('2027-03-14T15:59:59.999Z')
    })

    it('uses the tenant timezone end of day across daylight-saving time', () => {
        expect(modelAccessEndOfDay('2027-03-14', 'America/New_York').toISOString()).toBe('2027-03-15T03:59:59.999Z')
    })

    it('includes the selected tenant-local day in the admin expiration filter', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { grantQueryBuilder, organizationRepository, service } = createFixture()

        await service.findAdminGrants({ expiresBefore: '2027-03-14' })

        expect(organizationRepository.findOne).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-1', isDefault: true },
            select: { id: true, timeZone: true }
        })
        expect(grantQueryBuilder.andWhere).toHaveBeenCalledWith('grant.validUntil <= :expiresBefore', {
            expiresBefore: new Date('2027-03-14T15:59:59.999Z')
        })
    })
})
