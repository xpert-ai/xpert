jest.mock('i18next', () => ({ t: (key: string) => key }))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'org',
        getLanguageCode: () => 'en-US'
    }
}))
jest.mock('../xpert.service', () => ({ XpertService: class {} }))
jest.mock('../../xpert-workspace', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../../xpert-template/xpert-template.service', () => ({ XpertTemplateService: class {} }))
import { AiModelTypeEnum, LanguagesEnum, TXpertTeamDraft } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AssistantCapabilityProviderRegistry } from '@xpert-ai/plugin-sdk'
import { AssistantConfigurationService } from './assistant-configuration.service'
import { XpertService } from '../xpert.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { blankAssistantTemplate } from '../../xpert-template/capabilities/blank-assistant-template'
import { parseCapabilityTemplateDraft } from '../../xpert-template/capabilities/template-draft'
import { primaryAgent } from '../../xpert-template/capabilities/capability-state'

function fixture() {
    const draft = parseCapabilityTemplateDraft(blankAssistantTemplate([]).export_data)
    draft.team.workspaceId = 'workspace'
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
            { id: 'provider', providerWithModels: { models: [{ model: 'llm', features: [] }] } }
        ])
    }
    const capabilities = new AssistantCapabilityService(
        { list: () => [] } as unknown as AssistantCapabilityProviderRegistry,
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
