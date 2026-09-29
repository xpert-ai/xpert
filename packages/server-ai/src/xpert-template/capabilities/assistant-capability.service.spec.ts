jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant'),
        getOrganizationId: jest.fn(() => 'organization'),
        getLanguageCode: () => 'en-US'
    }
}))

import { AiModelTypeEnum, LanguagesEnum, ModelFeature, TXpertTemplate } from '@xpert-ai/contracts'
import { AssistantCapabilityProviderRegistry, IAssistantCapabilityProvider } from '@xpert-ai/plugin-sdk'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { AssistantCapabilityService } from './assistant-capability.service'
import {
    capabilityTemplateId,
    parseCapabilityTemplateId,
    parseTemplateCapabilities
} from './template-capability-reference'
import { parseCapabilityTemplateDraft } from './template-draft'

const language = LanguagesEnum.English
const model = { copilotId: 'authorized', model: 'capable', modelType: AiModelTypeEnum.LLM }
const template = {
    id: 'sample',
    export_data: JSON.stringify({
        team: { agent: { key: 'primary' } },
        nodes: [{ key: 'primary', type: 'agent', entity: {} }],
        connections: []
    })
} as TXpertTemplate

describe('Assistant capabilities (OSS)', () => {
    const providers: IAssistantCapabilityProvider[] = []
    const registry = { list: () => providers }
    const query = { execute: jest.fn() }
    const service = new AssistantCapabilityService(
        registry as unknown as AssistantCapabilityProviderRegistry,
        query as unknown as QueryBus
    )
    const createProvider = (key: string, features: ModelFeature[] = []): IAssistantCapabilityProvider => ({
        key,
        label: key,
        description: key,
        templates: [{ templateId: template.id, required: false }],
        requiredModelFeatures: features,
        check: jest.fn(async () => ({ available: true })),
        apply: jest.fn(async ({ draft }) => {
            draft.team.description = key
        })
    })
    beforeEach(() => {
        providers.splice(0)
        jest.clearAllMocks()
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue('organization')
        query.execute.mockResolvedValue([
            {
                id: 'authorized',
                credentials: 'do-not-expose',
                providerWithModels: {
                    models: [
                        { model: 'text', features: [ModelFeature.TOOL_CALL] },
                        {
                            model: model.model,
                            features: [ModelFeature.VISION, ModelFeature.MULTI_TOOL_CALL],
                            label: 'Capable'
                        }
                    ]
                }
            }
        ])
    })
    it('works without any distribution providers and leaves ordinary templates unchanged', async () => {
        expect(await service.setup(template, language)).toMatchObject({
            canInstall: true,
            optionalCapabilities: [],
            requiredModelFeatures: []
        })
        expect(await service.compose(template, language, [], jest.fn())).toBe(template)
        expect(query.execute).not.toHaveBeenCalled()
        await expect(service.setup(template, language, ['missing'])).rejects.toThrow()
    })
    it('creates a blank Assistant with all capabilities off and lists only explicitly compatible providers', async () => {
        providers.push(createProvider('template-only'), {
            ...createProvider('optional-tool'),
            availableForBlankAssistant: true
        })
        const blank = service.blankTemplate()
        const draft = parseCapabilityTemplateDraft(blank.export_data)
        expect(draft.nodes).toHaveLength(1)
        expect(draft.connections).toEqual([])
        expect(draft.team.features?.sandbox?.enabled).not.toBe(true)
        const check = await service.setup(blank, language)
        expect(check.optionalCapabilities.map(({ key }) => key)).toEqual(['optional-tool'])
        expect(check.requiresModel).toBe(true)
        expect(check.models).toHaveLength(2)
        expect(providers[1].check).not.toHaveBeenCalled()
        await expect(service.setup(blank, language, ['template-only'])).rejects.toThrow()
        await expect(service.prepareInstallation(blank, draft, language, [], undefined, [])).rejects.toThrow()
        await service.prepareInstallation(blank, draft, language, [], model, [])
        expect(draft.team.copilotModel).toEqual(model)
        query.execute.mockResolvedValue([])
        await expect(service.prepareInstallation(blank, draft, language, [], model, [])).rejects.toThrow()
    })
    it('offers arbitrary registered capabilities, defaults off, and checks only enabled ones', async () => {
        const provider = createProvider('document-analysis', [ModelFeature.VISION])
        providers.push(provider)
        expect(await service.setup(template, language)).toMatchObject({
            canInstall: true,
            optionalCapabilities: [{ key: provider.key }]
        })
        expect(provider.check).not.toHaveBeenCalled()
        expect(query.execute).not.toHaveBeenCalled()
        await service.setup(template, language, [provider.key])
        expect(provider.check).toHaveBeenCalledTimes(1)
    })
    it('combines model requirements and exposes only authorized safe bindings', async () => {
        providers.push(
            createProvider('documents', [ModelFeature.VISION]),
            createProvider('automation', [ModelFeature.TOOL_CALL])
        )
        const result = await service.setup(template, language, ['documents', 'automation'])
        expect(new Set(result.requiredModelFeatures)).toEqual(new Set([ModelFeature.VISION, ModelFeature.TOOL_CALL]))
        expect(result.models).toEqual([{ id: 'authorized/capable', label: 'Capable', copilotModel: model }])
        expect(JSON.stringify(result)).not.toContain('do-not-expose')
    })
    it('fails closed for required/selected uninstalled providers, but omits unavailable optional offerings', async () => {
        expect(
            (await service.setup({ ...template, capabilities: [{ key: 'missing' }] }, language)).optionalCapabilities
        ).toEqual([])
        await expect(
            service.setup({ ...template, capabilities: [{ key: 'missing', required: true }] }, language)
        ).rejects.toThrow()
        await expect(
            service.setup({ ...template, capabilities: [{ key: 'missing' }] }, language, ['missing'])
        ).rejects.toThrow()
    })
    it('supports template-declared requirements and cannot turn them off', async () => {
        const provider = createProvider('documents', [ModelFeature.VISION])
        providers.push(provider)
        const required = { ...template, capabilities: [{ key: 'documents', required: true }] }
        expect(await service.setup(required, language)).toMatchObject({
            optionalCapabilities: [],
            requiredModelFeatures: [ModelFeature.VISION]
        })
        expect(provider.check).toHaveBeenCalled()
    })
    it('checks organization, availability and revoked model access before draft mutation', async () => {
        const provider = createProvider('documents', [ModelFeature.VISION])
        providers.push(provider)
        const draft = parseCapabilityTemplateDraft(template.export_data),
            before = structuredClone(draft)
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(null)
        await expect(service.setup(template, language, ['documents'])).rejects.toThrow()
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue('organization')
        jest.mocked(provider.check).mockResolvedValueOnce({ available: false, reason: 'Unavailable' })
        expect(await service.setup(template, language, ['documents'])).toMatchObject({
            canInstall: false,
            reason: 'Unavailable'
        })
        await expect(
            service.prepareInstallation(template, draft, language, ['documents'], { ...model, copilotId: 'forged' }, [])
        ).rejects.toThrow()
        query.execute.mockResolvedValue([])
        await expect(service.prepareInstallation(template, draft, language, ['documents'], model, [])).rejects.toThrow()
        expect(draft).toEqual(before)
    })
    it('composes selected providers into a stable variant and preserves selection when reloading', async () => {
        const provider = createProvider('documents', [ModelFeature.VISION])
        providers.push(provider)
        const result = await service.compose(template, language, ['documents'], jest.fn())
        expect(parseCapabilityTemplateId(result.id)).toEqual({ templateId: 'sample', capabilities: ['documents'] })
        expect(result.enabledCapabilities).toEqual(['documents'])
        expect(parseCapabilityTemplateDraft(result.export_data).team.description).toBe('documents')
        expect(parseCapabilityTemplateDraft(template.export_data).team.description).toBeUndefined()
        const draft = parseCapabilityTemplateDraft(result.export_data)
        await service.prepareInstallation(result, draft, language, [], model, [])
        expect(draft.team.copilotModel).toEqual(model)
        expect(draft.nodes[0].entity).toMatchObject({ copilotModel: null })
    })
    it('checks the actual target workspace draft during installation', async () => {
        const provider = createProvider('workspace-tool')
        providers.push(provider)
        const draft = parseCapabilityTemplateDraft(template.export_data)
        draft.team.workspaceId = 'selected-workspace'
        await service.prepareInstallation(template, draft, language, ['workspace-tool'], undefined, [])
        expect(provider.check).toHaveBeenCalledWith(
            expect.objectContaining({
                draft: expect.objectContaining({ team: expect.objectContaining({ workspaceId: 'selected-workspace' }) })
            })
        )
    })

    it('normalizes selections and rejects malformed/nested variant identities', () => {
        expect(capabilityTemplateId('sample', ['b', 'a', 'a'])).toBe(capabilityTemplateId('sample', ['a', 'b']))
        const id = capabilityTemplateId('sample', ['a'])
        expect(capabilityTemplateId(id, ['b'])).toBe(capabilityTemplateId('sample', ['a', 'b']))
        expect(() => parseTemplateCapabilities(['not a key'])).toThrow()
        expect(() => parseTemplateCapabilities([42])).toThrow()
        expect(() => parseCapabilityTemplateId('capabilities~invalid')).toThrow()
        expect(() =>
            parseCapabilityTemplateId(
                'capabilities~' +
                    Buffer.from(JSON.stringify({ templateId: id, capabilities: ['b'] })).toString('base64url')
            )
        ).toThrow()
    })
})
