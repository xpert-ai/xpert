import {
    AiModelTypeEnum,
    AIPermissionsEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelAccessUnavailableReasonEnum,
    UserModelGrantStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { createFixture } from './model-access-service.test-fixture'

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
            lifecycle,
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
        expect(lifecycle.processDueGrants).toHaveBeenCalledTimes(1)
        expect(lifecycle.processDueGrants).toHaveBeenCalledWith({
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

    it('reports missing membership when neither a usable plan nor a personal grant exists', async () => {
        const { input, membershipService, service } = createFixture()
        membershipService.findModelAccess.mockResolvedValue(null)
        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            accessSource: null,
            unavailableReason: ModelAccessUnavailableReasonEnum.MembershipRequired
        })
    })

    it('does not misreport an excluded model as an expired membership', async () => {
        const { input, membershipService, service } = createFixture()
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: null,
            membership: { planId: 'plan-1', plan: {} }
        })
        membershipService.isModelAllowed.mockReturnValue(false)
        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false,
            accessSource: null,
            unavailableReason: null
        })
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
