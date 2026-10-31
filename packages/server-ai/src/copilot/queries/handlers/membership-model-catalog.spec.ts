import { AiModelTypeEnum, AiProviderRole, FetchFrom, ProviderModel, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull } from 'typeorm'
import { CopilotProviderModel } from '../../../copilot-provider/models/copilot-provider-model.entity'
import { CopilotProvider } from '../../../copilot-provider/copilot-provider.entity'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { Copilot } from '../../copilot.entity'
import { CopilotService } from '../../copilot.service'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot-model-find.query'
import { FindCopilotModelsHandler } from './copilot-model-find.handler'
import { MembershipService } from '../../../membership/membership.service'
import { ModelAccessService } from '../../../model-access/model-access.service'

const voiceModels = [
    [AiModelTypeEnum.TTS, 'qwen3-tts-flash'],
    [AiModelTypeEnum.SPEECH2TEXT, 'qwen3-asr-flash'],
    [AiModelTypeEnum.REALTIME, 'qwen3.8-omni-flash-realtime']
] as const

function builtin(modelType: AiModelTypeEnum, model: string, deprecated = false): ProviderModel {
    return {
        model,
        model_type: modelType,
        deprecated,
        fetch_from: FetchFrom.PREDEFINED_MODEL,
        label: { en_US: model, zh_Hans: model },
        model_properties: {}
    }
}

function copilot(
    id: string,
    organizationId: string | null = 'org-1',
    role: AiProviderRole = AiProviderRole.Primary
): Copilot {
    return Object.assign(new Copilot(), {
        id,
        tenantId: 'tenant-1',
        organizationId,
        role,
        enabled: true,
        modelProvider: Object.assign(new CopilotProvider(), {
            id: `provider-${id}`,
            providerName: 'tongyi',
            isValid: true
        })
    })
}

function fixture(copilots = [copilot('primary')]) {
    const builtins: ProviderModel[] = [
        ...voiceModels.map(([type, name]) => builtin(type, name)),
        builtin(AiModelTypeEnum.LLM, 'chat-model'),
        builtin(AiModelTypeEnum.TEXT_EMBEDDING, 'embedding-model'),
        builtin(AiModelTypeEnum.RERANK, 'rerank-model')
    ]
    const customModels: CopilotProviderModel[] = []
    const queryBus = {
        execute: jest.fn(async (query: GetCopilotProviderModelQuery) =>
            customModels.filter(
                (model) => model.providerId === query.providerId && model.modelType === query.params.modelType
            )
        )
    }
    const provider = {
        getProviderModels: jest.fn((type: AiModelTypeEnum) => builtins.filter((model) => model.model_type === type)),
        getProviderSchema: () => ({ provider: 'tongyi' })
    }
    const providers = { getProvider: jest.fn(() => provider) }
    const service = { findAllEnabledCopilotsWithoutMembership: jest.fn().mockResolvedValue(copilots) }
    const access = { canUseCatalogModels: jest.fn().mockResolvedValue([]) }
    const handler = new FindCopilotModelsHandler(
        queryBus as never,
        service as never,
        providers as never,
        access as never,
        { resolve: async () => ({ configured: false, binding: null }) } as never
    )
    Object.defineProperty(handler, 'configService', { value: { get: () => 'http://localhost:3000' } })
    return {
        handler,
        service,
        providers,
        provider,
        access,
        customModels,
        builtins,
        copilots,
        query: (type: AiModelTypeEnum) =>
            handler.execute(new FindCopilotModelsQuery(type, CopilotModelCatalogMode.MembershipManagement)),
        addCustom: (
            modelName: string,
            modelType = AiModelTypeEnum.TTS,
            properties: Partial<CopilotProviderModel> = {}
        ) => {
            customModels.push(
                Object.assign(new CopilotProviderModel(), {
                    providerId: copilots[0].modelProvider.id,
                    modelName,
                    modelType,
                    modelProperties: {},
                    ...properties
                })
            )
        }
    }
}

describe('membership model catalog', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
    })
    afterEach(() => jest.restoreAllMocks())

    it.each(voiceModels)(
        'lists %s from a Primary provider without a default model or personal grant',
        async (type, name) => {
            const f = fixture()
            const result = await f.query(type)
            expect(result.map((item) => item.id)).toEqual(['primary'])
            expect(result[0].providerWithModels.models.map((model) => model.model)).toEqual([name])
            expect(f.provider.getProviderModels).toHaveBeenCalledWith(type)
            expect(f.service.findAllEnabledCopilotsWithoutMembership).toHaveBeenCalledWith('tenant-1', 'org-1')
            expect(f.access.canUseCatalogModels).not.toHaveBeenCalled()
        }
    )

    it.each([AiModelTypeEnum.LLM, AiModelTypeEnum.TEXT_EMBEDDING, AiModelTypeEnum.RERANK])(
        'uses actual %s capabilities for every role and preserves separate Copilot targets',
        async (type) => {
            const f = fixture(Object.values(AiProviderRole).map((role) => copilot(role, 'org-1', role)))
            const name = f.builtins.find((model) => model.model_type === type).model
            f.addCustom(name, type)
            const result = await f.query(type)
            expect(result.map((item) => item.id)).toEqual(Object.values(AiProviderRole))
            for (const item of result) {
                expect(item.providerWithModels.models.map((model) => model.model)).toEqual([name])
            }
        }
    )

    it.each(['org-1', null])('restricts membership choices to the exact scope %s', async (organizationId) => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        const f = fixture([copilot('tenant', null), copilot('current'), copilot('other', 'org-2')])
        expect((await f.query(AiModelTypeEnum.TTS)).map((item) => item.id)).toEqual([
            organizationId ? 'current' : 'tenant'
        ])
    })

    it.each(['org-1', null])(
        'keeps the database query tenant-scoped and enabled-only in %s',
        async (organizationId) => {
            const repository = { find: jest.fn().mockResolvedValue([]) }
            const service = new CopilotService(
                repository as never,
                {} as never,
                {} as never,
                {} as never,
                {} as never,
                { inspect: async () => ({ defaults: 0 }) } as never
            )
            await service.findAllEnabledCopilotsWithoutMembership('tenant-1', organizationId)
            const tenantWhere = { tenantId: 'tenant-1', enabled: true, organizationId: IsNull() }
            expect(repository.find).toHaveBeenCalledWith({
                where: organizationId
                    ? [{ tenantId: 'tenant-1', enabled: true, organizationId }, tenantWhere]
                    : tenantWhere,
                relations: ['modelProvider']
            })
        }
    )

    it('excludes disabled Copilots and invalid or missing provider configurations', async () => {
        const disabled = copilot('disabled')
        disabled.enabled = false
        const invalid = copilot('invalid')
        invalid.modelProvider.isValid = false
        const missing = copilot('missing')
        missing.modelProvider = null
        const f = fixture([disabled, invalid, missing, copilot('valid')])
        expect((await f.query(AiModelTypeEnum.TTS)).map((item) => item.id)).toEqual(['valid'])
        expect(f.provider.getProviderModels).toHaveBeenCalledTimes(1)
    })

    it('omits unsupported types and unloaded provider plugins', async () => {
        const f = fixture()
        expect(await f.query(AiModelTypeEnum.MODERATION)).toEqual([])
        f.providers.getProvider.mockReturnValue(null)
        expect(await f.query(AiModelTypeEnum.TTS)).toEqual([])
    })

    it('excludes deprecated builtins and invalid custom models, including overlapping definitions', async () => {
        const f = fixture()
        f.builtins.push(
            builtin(AiModelTypeEnum.TTS, 'deprecated', true),
            builtin(AiModelTypeEnum.TTS, 'invalid-overlap')
        )
        f.addCustom('deprecated')
        f.addCustom('invalid-overlap', AiModelTypeEnum.TTS, { isValid: false })
        f.addCustom('invalid-custom', AiModelTypeEnum.TTS, { isValid: false })
        f.addCustom('valid-custom')
        f.addCustom('qwen3-tts-flash')
        const result = await f.query(AiModelTypeEnum.TTS)
        expect(result[0].providerWithModels.models.map((model) => model.model)).toEqual([
            'valid-custom',
            'qwen3-tts-flash'
        ])
    })

    it.each(voiceModels)('preserves configured-only availability for %s', async (type, name) => {
        const f = fixture()
        f.copilots[0].modelProvider.options = {
            modelDiscovery: { mode: 'configured', syncedAt: '2026-10-22T00:00:00Z', availableModelIds: ['live'] }
        }
        f.builtins.push(builtin(type, 'deprecated', true))
        f.addCustom('live-import', type, { modelProperties: { discovery_model_id: 'live' } })
        f.addCustom('missing-import', type, { modelProperties: { discovery_model_id: 'gone' } })
        f.addCustom(name, type, { modelProperties: { discovery_model_id: 'gone' } })
        f.addCustom('manual', type)
        f.addCustom('deprecated', type)
        f.addCustom('invalid', type, { isValid: false })
        const result = await f.query(type)
        expect(result[0].providerWithModels.models.map((model) => model.model)).toEqual(['live-import', 'manual'])
    })

    it.each(voiceModels)('does not revive a removed, deprecated or invalid selected %s model', async (type, name) => {
        const f = fixture()
        f.copilots[0].copilotModel = { model: name, modelType: type }
        f.builtins.splice(0)
        expect(await f.query(type)).toEqual([])
        f.builtins.push(builtin(type, name, true))
        expect(await f.query(type)).toEqual([])
        f.builtins[0].deprecated = false
        f.addCustom(name, type, { isValid: false })
        expect(await f.query(type)).toEqual([])
    })

    it.each(voiceModels)('authorizes the exact selected %s target through the runtime resolver', async (type, name) => {
        const selected = copilot('selected')
        const sameName = copilot('same-name')
        const otherProvider = copilot('other-provider')
        otherProvider.modelProvider.providerName = 'another-provider'
        const f = fixture([selected, sameName, otherProvider, copilot('other-org', 'org-2'), copilot('tenant', null)])
        const catalog = await f.query(type)
        const option = catalog.find((item) => item.id === selected.id)
        const allowedModels = [
            {
                provider: option.providerWithModels.provider,
                model: option.providerWithModels.models[0].model,
                copilotId: option.id
            }
        ]
        const membership = {
            resolveBillableUserId: jest.fn().mockResolvedValue('user-1'),
            isMembershipPlanEnabled: jest.fn().mockResolvedValue(true),
            hasActiveMembershipPlan: jest.fn().mockResolvedValue(true),
            findModelAccess: jest.fn().mockResolvedValue({
                organizationId: 'org-1',
                membership: { planId: 'plan-1', plan: { allowedModels } }
            }),
            isModelAllowed: jest.fn(MembershipService.prototype.isModelAllowed),
            resolveModelMultiplierForPlan: jest.fn().mockReturnValue(1),
            hasConsumableBalance: jest.fn().mockResolvedValue(true)
        }
        const grantQuery = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([])
        }
        // Mock persistence/feature state; target loading and plan authorization use the real resolver.
        const repository = {
            find: jest.fn(async ({ where }: { where: { tenantId: string } }) =>
                f.copilots.filter((item) => item.tenantId === where.tenantId)
            )
        }
        const access = new ModelAccessService(
            {} as never,
            {} as never,
            { createQueryBuilder: () => grantQuery } as never,
            {} as never,
            {} as never,
            repository as never,
            { find: jest.fn(async () => f.customModels) } as never,
            { findOne: jest.fn().mockResolvedValue({ id: 'user-1', type: UserType.USER }) } as never,
            {} as never,
            {} as never,
            {} as never,
            f.providers as never,
            membership as never
        )
        jest.spyOn(access, 'processDueGrants').mockResolvedValue(0)
        const input = {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            models: f.copilots.map((item) => ({ copilotId: item.id, copilotModelId: name, modelType: type }))
        }
        expect(await access.canUseCatalogModels(input)).toEqual([true, false, false, false, false])
        expect(membership.isModelAllowed).toHaveBeenCalledWith({ allowedModels }, 'tongyi', name, 'selected', type)

        selected.modelProvider.providerName = 'another-provider'
        expect(await access.canUseCatalogModels(input)).toEqual([false, false, false, false, false])
        selected.modelProvider.providerName = 'tongyi'
        f.builtins.push(builtin(type, 'unselected-model'))
        expect(
            await access.canUseCatalogModels({
                ...input,
                models: [{ copilotId: selected.id, copilotModelId: 'unselected-model', modelType: type }]
            })
        ).toEqual([false])

        // Even a same-provider/model rule cannot cross a Copilot or organization boundary.
        membership.findModelAccess.mockResolvedValue({
            organizationId: 'org-2',
            membership: { planId: 'plan-2', plan: { allowedModels } }
        })
        expect(await access.canUseCatalogModels(input)).toEqual([false, false, false, false, false])
        expect(await access.canUseCatalogModels({ ...input, tenantId: 'tenant-2' })).toEqual([
            false,
            false,
            false,
            false,
            false
        ])

        // Matching plan rules must still reject targets that became unavailable after selection.
        membership.findModelAccess.mockResolvedValue({
            organizationId: 'org-1',
            membership: { planId: 'plan-1', plan: { allowedModels } }
        })
        selected.modelProvider.isValid = false
        expect(await access.canUseCatalogModels(input)).toEqual([false, false, false, false, false])
        selected.modelProvider.isValid = true
        f.addCustom(name, type, { isValid: false })
        expect(await access.canUseCatalogModels(input)).toEqual([false, false, false, false, false])
        f.customModels[0].isValid = true
        f.builtins.find((model) => model.model === name).deprecated = true
        expect(await access.canUseCatalogModels(input)).toEqual([false, false, false, false, false])
    })
})
