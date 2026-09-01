import { AiModelTypeEnum, LanguagesEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { AssistantModelSelectionService } from './assistant-model-selection.service'

describe('AssistantModelSelectionService', () => {
    const primary = {
        copilotId: 'provider-a',
        modelType: AiModelTypeEnum.LLM,
        model: 'primary'
    }
    const fast = {
        copilotId: 'provider-b',
        modelType: AiModelTypeEnum.LLM,
        model: 'fast'
    }
    const xpert = {
        id: 'assistant-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        agent: { key: 'primary-agent', copilotModel: primary },
        options: { modelSelection: { allowedModels: [fast] } }
    }

    let userPreferenceService: {
        getDomain: jest.Mock
        setDomain: jest.Mock
        clearDomain: jest.Mock
    }
    let modelAccessService: { canUseCatalogModels: jest.Mock; getCatalogModelLabels: jest.Mock }
    let configService: { get: jest.Mock }
    let service: AssistantModelSelectionService

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        userPreferenceService = {
            getDomain: jest.fn().mockResolvedValue(null),
            setDomain: jest.fn().mockResolvedValue(undefined),
            clearDomain: jest.fn().mockResolvedValue(true)
        }
        modelAccessService = {
            canUseCatalogModels: jest.fn().mockResolvedValue([true, true]),
            getCatalogModelLabels: jest.fn().mockResolvedValue([null, null])
        }
        configService = { get: jest.fn().mockReturnValue('http://localhost:3000') }
        service = new AssistantModelSelectionService(
            userPreferenceService as never,
            modelAccessService as never,
            configService as never
        )
    })

    it('returns Primary first and a saved available preference', async () => {
        const fastId = service.getModelId(fast)
        userPreferenceService.getDomain.mockResolvedValue({ selectedModelId: fastId })

        const result = await service.getModels(xpert as never)

        expect(result.models.map((model) => model.label)).toEqual(['primary', 'fast'])
        expect(result.models[0]?.default).toBe(true)
        expect(result.selected_model_id).toBe(fastId)
        expect(result.preference_persistable).toBe(true)
        expect(modelAccessService.canUseCatalogModels).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                userId: 'user-1',
                xpertId: 'assistant-1'
            })
        )
    })

    it('localizes catalog model labels using the request language', async () => {
        jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue(LanguagesEnum.SimplifiedChinese)
        modelAccessService.getCatalogModelLabels.mockResolvedValue([
            {
                provider: 'provider-a',
                providerIconSmall: { en_US: 'icon.svg' },
                providerBackground: '#f0f0f0',
                modelLabel: { en_US: 'Primary', zh_Hans: '主模型' },
                providerLabel: { en_US: 'Provider A' }
            },
            { modelLabel: { en_US: 'Fast', zh_Hans: '快速模型' }, providerLabel: { zh_Hans: '供应商 B' } }
        ])

        const result = await service.getModels(xpert as never)

        expect(result.models).toEqual([
            expect.objectContaining({
                label: '主模型',
                description: 'Provider A',
                avatar: {
                    url: 'http://localhost:3000/api/ai-model/provider/provider-a/icon_small/zh_Hans?organizationId=organization-1',
                    background: '#f0f0f0'
                }
            }),
            expect.objectContaining({ label: '快速模型', description: '供应商 B' })
        ])
    })

    it('atomically clears an unavailable preference and falls back to Primary', async () => {
        const fastId = service.getModelId(fast)
        const preference = { selectedModelId: fastId }
        userPreferenceService.getDomain.mockResolvedValue(preference)
        modelAccessService.canUseCatalogModels.mockResolvedValue([true, false])

        const result = await service.getModels(xpert as never)

        expect(userPreferenceService.clearDomain).toHaveBeenCalledWith('assistant-1', 'modelSelection', preference)
        expect(result.selected_model_id).toBe(service.getModelId(primary))
        expect(result.models[1]?.disabled).toBe(true)
    })

    it('uses explicit selection ahead of preference and rejects invalid ids', async () => {
        const fastId = service.getModelId(fast)
        userPreferenceService.getDomain.mockResolvedValue({ selectedModelId: service.getModelId(primary) })

        await expect(service.resolveSelection(xpert as never, { explicitModelId: fastId })).resolves.toMatchObject({
            id: fastId,
            source: 'explicit',
            model: fast
        })
        await expect(
            service.resolveSelection(xpert as never, { explicitModelId: 'mdl_not_allowed' })
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('keeps continuation snapshots and falls back from an invalid retry model', async () => {
        const sourceId = service.getModelId(fast)

        await expect(
            service.resolveSelection(xpert as never, {
                continuationModelId: sourceId,
                continuationModelSnapshot: { ...fast, options: { temperature: 0.7 } },
                continuationSource: 'explicit'
            })
        ).resolves.toMatchObject({ id: sourceId, source: 'explicit' })

        await expect(service.resolveSelection(xpert as never, { retryModelId: 'mdl_removed' })).resolves.toMatchObject({
            id: service.getModelId(primary),
            source: 'fallback'
        })
    })

    it('writes and clears only the modelSelection preference domain', async () => {
        const fastId = service.getModelId(fast)

        await service.setPreference(xpert as never, fastId)
        expect(userPreferenceService.setDomain).toHaveBeenCalledWith('assistant-1', 'modelSelection', {
            selectedModelId: fastId
        })

        await service.setPreference(xpert as never, null)
        expect(userPreferenceService.clearDomain).toHaveBeenCalledWith('assistant-1', 'modelSelection')
    })

    it('does not persist preferences for API principals', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'api_key'
        } as never)

        expect(service.isPreferencePersistable()).toBe(false)
        await expect(service.setPreference(xpert as never, service.getModelId(fast))).rejects.toBeInstanceOf(
            ForbiddenException
        )
    })

    it.each([SecretTokenBindingType.PUBLIC_XPERT, SecretTokenBindingType.ENTERPRISE_XPERT])(
        'allows stable client-secret users to persist preferences (%s)',
        (bindingType) => {
            ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
                principalType: 'client_secret',
                clientSecretBindingType: bindingType
            })

            expect(service.isPreferencePersistable()).toBe(true)
        }
    )

    it('does not persist preferences for other client-secret bindings', () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT
        })

        expect(service.isPreferencePersistable()).toBe(false)
    })
})
