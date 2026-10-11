import {
    AiModelTypeEnum,
    AIPermissionsEnum,
    CredentialFormTypeEnum,
    ModelAccessSourceEnum,
    UserType
} from '@xpert-ai/contracts'
import { ModelAccessService } from './model-access.service'

function createFixture() {
    const provider = {
        id: 'provider-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        providerName: 'openai-compatible',
        credentials: null,
        isValid: null
    }
    const copilot = {
        id: 'copilot-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        enabled: true,
        modelProvider: provider
    }
    const model = {
        providerId: provider.id,
        modelName: 'custom-model',
        modelType: AiModelTypeEnum.LLM,
        isValid: null,
        modelProperties: { api_key: 'test-key', endpoint_url: 'https://example.com/v1' }
    }
    const input = {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        copilotId: copilot.id,
        copilotModelId: model.modelName,
        modelType: model.modelType
    }
    const membershipService = {
        resolveBillableUserId: jest.fn().mockResolvedValue(input.userId),
        isMembershipPlanEnabled: jest.fn().mockResolvedValue(true),
        hasActiveMembershipPlan: jest.fn().mockResolvedValue(false),
        findModelAccess: jest.fn().mockResolvedValue({
            organizationId: null,
            membership: { planId: 'tenant-plan', plan: {} }
        }),
        isModelAllowed: jest.fn().mockReturnValue(true),
        hasConsumableBalance: jest.fn().mockResolvedValue(true),
        resolveModelMultiplierForPlan: jest.fn().mockReturnValue(2)
    }
    const copilotRepository = {
        findOne: jest.fn().mockResolvedValue(copilot),
        find: jest.fn().mockResolvedValue([copilot])
    }
    const providerModelRepository = {
        findOne: jest.fn().mockResolvedValue(model),
        find: jest.fn().mockResolvedValue([model])
    }
    const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue([])
    }
    const user = { id: input.userId, type: UserType.USER, role: { rolePermissions: [] } }
    const userRepository = { findOne: jest.fn().mockResolvedValue(user) }
    const schema = {
        provider: provider.providerName,
        model_credential_schema: {
            credential_form_schemas: [{ variable: 'api_key', type: CredentialFormTypeEnum.SECRET_INPUT }]
        }
    }
    const providersService = {
        getProvider: jest.fn().mockReturnValue({
            getProviderModels: () => [],
            getProviderSchema: () => schema
        })
    }
    const service = new ModelAccessService(
        {} as never,
        {} as never,
        { createQueryBuilder: () => queryBuilder } as never,
        {} as never,
        {} as never,
        copilotRepository as never,
        providerModelRepository as never,
        userRepository as never,
        {} as never,
        { createQueryBuilder: () => queryBuilder } as never,
        {} as never,
        providersService as never,
        membershipService as never
    )
    jest.spyOn(service, 'processDueGrants').mockResolvedValue(0)

    return {
        service,
        input,
        model,
        provider,
        copilot,
        membershipService,
        providerModelRepository,
        userRepository,
        user
    }
}

describe('ModelAccessService model credentials', () => {
    afterEach(() => jest.restoreAllMocks())

    it('uses a saved model key directly when only a tenant membership exists', async () => {
        const { service, input, membershipService } = createFixture()

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Direct,
            organizationId: input.organizationId,
            multiplier: 1
        })
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
        expect(membershipService.hasConsumableBalance).not.toHaveBeenCalled()
    })

    it('makes only the model with its own key available in the catalog', async () => {
        const { service, input, model, providerModelRepository } = createFixture()
        providerModelRepository.find.mockResolvedValue([
            model,
            { ...model, modelName: 'no-key-model', modelProperties: { endpoint_url: 'https://example.com/v1' } }
        ])

        await expect(
            service.canUseCatalogModels({
                ...input,
                models: [input, { ...input, copilotModelId: 'no-key-model' }]
            })
        ).resolves.toEqual([true, false])
    })

    it('keeps model keys direct for provider managers with an organization plan', async () => {
        const { service, input, membershipService, userRepository, user } = createFixture()
        membershipService.hasActiveMembershipPlan.mockResolvedValue(true)
        userRepository.findOne.mockResolvedValue({
            ...user,
            role: { rolePermissions: [{ permission: AIPermissionsEnum.COPILOT_EDIT, enabled: true }] }
        })

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Direct
        })
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })

    it('checks the exact default model without resolving membership access', async () => {
        const { service, input, model, providerModelRepository, membershipService } = createFixture()
        await expect(service.hasOrganizationModelCredentials(input)).resolves.toBe(true)
        expect(providerModelRepository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: input.tenantId,
                providerId: model.providerId,
                modelName: input.copilotModelId,
                modelType: input.modelType
            }
        })

        providerModelRepository.findOne.mockResolvedValue(null)
        await expect(service.hasOrganizationModelCredentials({ ...input, copilotModelId: 'missing' })).resolves.toBe(
            false
        )
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
    })

    it.each([true, false])("preserves ordinary members' organization plan decision: %s", async (included) => {
        const { service, input, membershipService } = createFixture()
        membershipService.hasActiveMembershipPlan.mockResolvedValue(true)
        const plan = { id: 'organization-plan' }
        membershipService.findModelAccess.mockResolvedValue({
            organizationId: input.organizationId,
            membership: { planId: plan.id, plan }
        })
        membershipService.isModelAllowed.mockReturnValue(included)

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: included,
            accessSource: included ? ModelAccessSourceEnum.Plan : null,
            ...(included ? { planId: plan.id, multiplier: 2 } : {})
        })
        expect(membershipService.isModelAllowed).toHaveBeenCalledWith(
            plan,
            'openai-compatible',
            input.copilotModelId,
            input.copilotId
        )
    })

    it('preserves tenant plan access even when a tenant model has its own key', async () => {
        const { service, input, provider, copilot } = createFixture()
        provider.organizationId = null
        copilot.organizationId = null

        await expect(service.resolveModelAccess({ ...input, organizationId: null })).resolves.toMatchObject({
            allowed: true,
            accessSource: ModelAccessSourceEnum.Plan,
            planId: 'tenant-plan',
            multiplier: 2
        })
    })

    it.each(['provider', 'model', 'copilot'])('keeps an invalid or disabled %s unavailable', async (disabled) => {
        const { service, input, provider, model, copilot } = createFixture()
        if (disabled === 'provider') provider.isValid = false
        if (disabled === 'model') model.isValid = false
        if (disabled === 'copilot') copilot.enabled = false

        await expect(service.resolveModelAccess(input)).resolves.toMatchObject({
            allowed: false
        })
    })
})
