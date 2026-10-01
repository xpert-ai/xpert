jest.mock('i18next', () => ({ t: (key: string) => key }))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'org',
        getLanguageCode: () => 'en-US'
    }
}))
jest.mock('../../sandbox/sandbox.service', () => ({ SandboxService: class {} }))
jest.mock('../xpert.service', () => ({ XpertService: class {} }))
jest.mock('../../xpert-workspace', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../../xpert-template/xpert-template.service', () => ({ XpertTemplateService: class {} }))
import { AiModelTypeEnum, LanguagesEnum, ModelFeature, TXpertTeamDraft } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AssistantCapabilityProviderRegistry, IAssistantCapabilityProvider } from '@xpert-ai/plugin-sdk'
import { AssistantConfigurationService } from './assistant-configuration.service'
import { XpertService } from '../xpert.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { blankAssistantTemplate } from '../../xpert-template/capabilities/blank-assistant-template'
import { parseCapabilityTemplateDraft } from '../../xpert-template/capabilities/template-draft'
import { primaryAgent } from '../../xpert-template/capabilities/capability-state'

import {
    DesktopShellCapabilityProvider,
    SandboxToolsCapabilityProvider
} from '../../xpert-template/capabilities/builtin-capabilities'
import { SandboxService } from '../../sandbox/sandbox.service'

function fixture(providers: IAssistantCapabilityProvider[] = []) {
    const draft = parseCapabilityTemplateDraft(blankAssistantTemplate([]).export_data)
    draft.team.workspaceId = 'workspace'
    draft.team.copilotModel = {
        copilotId: 'provider',
        model: 'llm',
        modelType: AiModelTypeEnum.LLM,
        options: { temperature: 0.2 }
    }
    const entity = {
        id: 'expert',
        tenantId: 'tenant',
        organizationId: 'org',
        workspaceId: 'workspace',
        draft: draft as TXpertTeamDraft | null,
        graph: { nodes: draft.nodes, connections: draft.connections },
        agent: primaryAgent(draft).entity,
        options: draft.team.options,
        updatedAt: 'today',
        environmentId: 'environment'
    }
    const xperts = {
        findOne: jest.fn(async () => entity),
        getSandboxProviders: jest.fn(async () => []),
        saveDraft: jest.fn(async (_id: string, draft: TXpertTeamDraft) => {
            entity.draft = draft
        }),
        publish: jest.fn()
    }
    const access = { assertCanAuthor: jest.fn(async () => ({ workspace: { id: 'workspace', name: 'Workspace' } })) }
    const queries = {
        execute: jest.fn(async () => [
            { id: 'provider', providerWithModels: { models: [{ model: 'llm', features: [ModelFeature.TOOL_CALL] }] } }
        ])
    }
    const capabilities = new AssistantCapabilityService(
        { list: () => providers } as unknown as AssistantCapabilityProviderRegistry,
        queries as unknown as QueryBus
    )
    const service = new AssistantConfigurationService(
        xperts as unknown as XpertService,
        access as unknown as XpertWorkspaceAccessService,
        {} as XpertTemplateService,
        capabilities
    )
    return { entity, xperts, access, queries, service }
}
const language = LanguagesEnum.English
const settings = { prompt: 'Answer concisely.', modelId: 'provider/llm', capabilities: [] }
describe('Assistant configuration authoring', () => {
    it('updates the primary prompt and model, preserves the graph and publishes a version', async () => {
        const { service, xperts, entity } = fixture()
        entity.draft.team.copilotModel = {
            copilotId: 'provider',
            model: 'llm',
            modelType: AiModelTypeEnum.LLM,
            options: { temperature: 0.2 }
        }
        const loaded = await service.get('expert', language)
        await service.save('expert', language, { ...settings, revision: loaded.revision })
        expect(primaryAgent(entity.draft).entity.prompt).toBe(settings.prompt)
        expect(entity.draft.team.copilotModel).toMatchObject({
            copilotId: 'provider',
            model: 'llm',
            options: { temperature: 0.2 }
        })
        expect(xperts.publish).toHaveBeenCalledWith('expert', true, 'environment', expect.any(String))
    })
    it('edits a published expert without an existing draft, then reloads the published result', async () => {
        const { service, entity } = fixture()
        entity.draft = null
        const loaded = await service.get('expert', language)
        await service.save('expert', language, { ...settings, revision: loaded.revision })
        expect(primaryAgent(entity.draft).entity.prompt).toBe(settings.prompt)
        entity.graph = { nodes: entity.draft.nodes, connections: entity.draft.connections }
        entity.options = entity.draft.team.options
        entity.draft = null
        expect((await service.get('expert', language)).prompt).toBe(settings.prompt)
    })
    it('does not expose prompts or mutate anything without current organization and authoring access', async () => {
        const { service, access, xperts, entity } = fixture()
        entity.organizationId = 'another'
        await expect(service.get('expert', language)).rejects.toBeInstanceOf(ForbiddenException)
        expect(access.assertCanAuthor).not.toHaveBeenCalled()
        entity.organizationId = 'org'
        access.assertCanAuthor.mockRejectedValue(new ForbiddenException())
        await expect(service.get('expert', language)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.save('expert', language, { ...settings, revision: 'x' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })
    it('rejects stale revisions and revoked models before saving', async () => {
        const { service, entity, queries, xperts } = fixture()
        const { revision } = await service.get('expert', language)
        entity.updatedAt = 'changed'
        await expect(service.save('expert', language, { ...settings, revision })).rejects.toThrow()
        entity.updatedAt = 'today'
        queries.execute.mockResolvedValue([])
        await expect(service.save('expert', language, { ...settings, revision })).rejects.toThrow()
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })
    it('rejects edits made while model validation is awaiting', async () => {
        const { service, entity, queries, xperts } = fixture()
        const { revision } = await service.get('expert', language)
        const authorized = await queries.execute()
        queries.execute.mockImplementation(async () => {
            entity.updatedAt = 'changed'
            return authorized
        })
        await expect(service.save('expert', language, { ...settings, revision })).rejects.toThrow()
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })
    it('reports a saved draft explicitly when publishing fails', async () => {
        const { service, xperts } = fixture()
        const { revision } = await service.get('expert', language)
        xperts.publish.mockRejectedValue(new Error('failure'))
        await expect(service.save('expert', language, { ...settings, revision })).rejects.toThrow()
        expect(xperts.saveDraft).toHaveBeenCalledTimes(1)
        expect(xperts.publish).toHaveBeenCalledTimes(1)
    })
})

describe('Dialog capability draft composition', () => {
    it('composes provider changes with the capability overlay, then disables cleanly without persistence', async () => {
        const providers = [{ type: 'sandbox-a' }, { type: 'sandbox-b' }]
        const sandbox = { listProviders: async () => providers, getDefaultProviderType: async () => 'sandbox-a' }
        const { service, entity, xperts } = fixture([
            new SandboxToolsCapabilityProvider(sandbox as unknown as SandboxService)
        ])
        xperts.getSandboxProviders.mockResolvedValue(providers)
        let setup = await service.getCapabilities('expert', language)
        entity.draft = await service.previewCapabilities('expert', language, {
            revision: setup.revision,
            capabilities: ['sandbox-tools'],
            sandboxProvider: 'sandbox-a'
        })
        setup = await service.getCapabilities('expert', language)
        entity.draft = await service.previewCapabilities('expert', language, {
            revision: setup.revision,
            capabilities: ['sandbox-tools'],
            sandboxProvider: 'sandbox-b'
        })
        expect(entity.draft.team.features.sandbox).toEqual({ enabled: true, provider: 'sandbox-b' })
        setup = await service.getCapabilities('expert', language)
        await expect(
            service.previewCapabilities('expert', language, {
                revision: setup.revision,
                capabilities: ['sandbox-tools'],
                sandboxProvider: 'missing'
            })
        ).rejects.toThrow()
        const disabled = await service.previewCapabilities('expert', language, {
            revision: setup.revision,
            capabilities: []
        })
        expect(disabled.team.features.sandbox.enabled).not.toBe(true)
        expect(disabled.nodes.some((node) => node.key === 'Capability_SandboxShell')).toBe(false)
        expect(xperts.saveDraft).not.toHaveBeenCalled()
        expect(xperts.publish).not.toHaveBeenCalled()
    })

    it('composes and removes managed nodes without saving or publishing, preserving custom graph and model settings', async () => {
        const { service, entity, xperts } = fixture([new DesktopShellCapabilityProvider()])
        entity.draft.team.options = { messagePresentation: { mode: 'bubbles' } }
        const custom = {
            type: 'agent' as const,
            key: 'custom',
            position: { x: 30, y: 40 },
            entity: { key: 'custom', prompt: 'Keep me' }
        }
        entity.draft.nodes.push(custom)
        primaryAgent(entity.draft).entity.prompt = 'User-authored instructions'
        primaryAgent(entity.draft).entity.options = {}
        const before = structuredClone(entity.draft)
        const setup = await service.getCapabilities('expert', language, ['desktop-shell'])
        expect(setup.modelAvailable).toBe(true)
        expect(setup.options).toEqual([
            expect.objectContaining({ key: 'desktop-shell', required: false, available: true })
        ])
        const enabled = await service.previewCapabilities('expert', language, {
            revision: setup.revision,
            capabilities: ['desktop-shell']
        })
        expect(entity.draft).toEqual(before)
        expect(enabled.team.options.assistantCapabilities.selected).toEqual(['desktop-shell'])
        expect(enabled.nodes).toContainEqual(custom)
        expect(enabled.team.options.messagePresentation).toEqual({ mode: 'bubbles' })
        expect(enabled.team.copilotModel).toEqual(before.team.copilotModel)
        expect(enabled.nodes.some((node) => node.key === 'Capability_DesktopShell')).toBe(true)
        entity.draft = enabled
        const next = await service.getCapabilities('expert', language)
        const disabled = await service.previewCapabilities('expert', language, {
            revision: next.revision,
            capabilities: []
        })
        expect(disabled.nodes).toEqual(before.nodes)
        expect(disabled.connections).toEqual(before.connections)
        expect(disabled.team.options.assistantCapabilities.selected).toEqual([])
        expect(xperts.saveDraft).not.toHaveBeenCalled()
        expect(xperts.publish).not.toHaveBeenCalled()
    })

    it('lists an unavailable sandbox without trying to provision it, and rejects enabling it', async () => {
        const sandbox = { listProviders: jest.fn(async () => []), getDefaultProviderType: jest.fn() }
        const { service, xperts } = fixture([new SandboxToolsCapabilityProvider(sandbox as unknown as SandboxService)])
        const setup = await service.getCapabilities('expert', language)
        expect(setup.options[0]).toMatchObject({ key: 'sandbox-tools', available: false })
        await expect(
            service.previewCapabilities('expert', language, {
                revision: setup.revision,
                capabilities: ['sandbox-tools']
            })
        ).rejects.toThrow()
        expect(sandbox.getDefaultProviderType).not.toHaveBeenCalled()
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })

    it('preserves pre-existing Studio capabilities as required instead of removing them', async () => {
        const provider = new DesktopShellCapabilityProvider()
        const { service, entity } = fixture([provider])
        await provider.apply({
            draft: entity.draft,
            template: blankAssistantTemplate([]),
            language,
            loadTemplate: jest.fn()
        })
        const setup = await service.getCapabilities('expert', language)
        expect(setup.options[0].required).toBe(true)
        const result = await service.previewCapabilities('expert', language, {
            revision: setup.revision,
            capabilities: []
        })
        expect(result.nodes).toEqual(entity.draft.nodes)
    })

    it('rejects stale revisions, revoked models and unauthorized workspace access', async () => {
        const { service, entity, queries, access, xperts } = fixture([new DesktopShellCapabilityProvider()])
        const { revision } = await service.getCapabilities('expert', language)
        const input = { revision, capabilities: ['desktop-shell'] }
        entity.updatedAt = 'changed'
        await expect(service.previewCapabilities('expert', language, input)).rejects.toThrow()
        entity.updatedAt = 'today'
        queries.execute.mockResolvedValue([])
        await expect(service.previewCapabilities('expert', language, input)).rejects.toThrow()
        access.assertCanAuthor.mockRejectedValue(new ForbiddenException())
        await expect(service.getCapabilities('expert', language)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.previewCapabilities('expert', language, input)).rejects.toBeInstanceOf(ForbiddenException)
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })

    it('detects intervening edits and Studio changes to managed contributions', async () => {
        const { service, entity, queries } = fixture([new DesktopShellCapabilityProvider()])
        const { revision } = await service.getCapabilities('expert', language)
        const authorized = await queries.execute()
        queries.execute.mockImplementation(async () => {
            entity.updatedAt = 'changed'
            return authorized
        })
        await expect(
            service.previewCapabilities('expert', language, { revision, capabilities: ['desktop-shell'] })
        ).rejects.toThrow()
        queries.execute.mockResolvedValue(authorized)
        entity.updatedAt = 'today'
        entity.draft = await service.previewCapabilities('expert', language, {
            revision,
            capabilities: ['desktop-shell']
        })
        primaryAgent(entity.draft).entity.prompt += '\nStudio edits'
        await expect(service.getCapabilities('expert', language)).rejects.toThrow('AssistantCapabilityConflict')
    })
})
