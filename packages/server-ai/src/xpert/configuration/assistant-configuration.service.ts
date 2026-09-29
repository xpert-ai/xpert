import { createHash } from 'node:crypto'
import {
    AssistantConfiguration,
    AssistantConfigurationInput,
    LanguagesEnum,
    TXpertTeamDraft
} from '@xpert-ai/contracts'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    UnprocessableEntityException,
    forwardRef
} from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { XpertService } from '../xpert.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { parseCapabilityTemplateDraft } from '../../xpert-template/capabilities/template-draft'
import {
    primaryAgent,
    removeCapabilityState,
    updateAssistantPrompt
} from '../../xpert-template/capabilities/capability-state'
import { parseCapabilityTemplateId } from '../../xpert-template/capabilities/template-capability-reference'

@Injectable()
export class AssistantConfigurationService {
    constructor(
        @Inject(forwardRef(() => XpertService)) private readonly xperts: XpertService,
        private readonly access: XpertWorkspaceAccessService,
        private readonly templates: XpertTemplateService,
        private readonly capabilities: AssistantCapabilityService
    ) {}

    private async load(id: string, language: LanguagesEnum) {
        const xpert = await this.xperts.findOne(id, { relations: ['agent', 'agent.copilotModel', 'copilotModel'] })
        if (
            !RequestContext.getOrganizationId() ||
            xpert.tenantId !== RequestContext.currentTenantId() ||
            xpert.organizationId !== RequestContext.getOrganizationId() ||
            !xpert.workspaceId
        )
            throw new ForbiddenException(t('server-ai:Error.AssistantConfigurationForbidden'))
        const { workspace } = await this.access.assertCanAuthor(xpert.workspaceId)
        const { draft: saved, graph, agents, ...team } = xpert
        const nodes = saved?.nodes ?? graph?.nodes
        const connections = saved?.connections ?? graph?.connections
        if (!nodes || !connections) throw new BadRequestException(t('server-ai:Error.TemplateCapabilityDraftInvalid'))
        const revision = createHash('sha256')
            .update(JSON.stringify([xpert.updatedAt, saved, graph]))
            .digest('hex')
        // Publishing clears the draft; the persisted graph is the editable baseline in that case.
        const draft: TXpertTeamDraft = structuredClone({
            team: { ...team, ...saved?.team, agent: saved?.team?.agent ?? xpert.agent },
            nodes,
            connections
        })
        // Migrate prior capability variants only when their generated contribution still matches the live graph.
        if (!draft.team.options?.assistantCapabilities) {
            const source = draft.team.options?.templateSource ?? xpert.options?.templateSource
            const reference = source?.templateId && parseCapabilityTemplateId(source.templateId)
            if (reference?.capabilities.length) {
                const template = await this.templates.getTemplateDetail(source.templateId, language)
                const state = parseCapabilityTemplateDraft(template.export_data).team.options?.assistantCapabilities
                if (state) draft.team.options = { ...draft.team.options, assistantCapabilities: state }
            }
        }
        const selected = draft.team.options?.assistantCapabilities?.selected ?? []
        const base = removeCapabilityState(draft)
        return { xpert, workspace, revision, base, selected }
    }

    async get(id: string, language: LanguagesEnum, selection?: string[]): Promise<AssistantConfiguration> {
        const { xpert, workspace, revision, base, selected } = await this.load(id, language)
        const capabilities = selection ?? selected
        const template = this.capabilities.configurationTemplate(base)
        const composed = await this.capabilities.compose(template, language, capabilities, (key) =>
            this.templates.getTemplateDetail(key, language)
        )
        const setup = await this.capabilities.setup(
            composed,
            language,
            capabilities,
            await this.xperts.getSandboxProviders()
        )
        const primary = primaryAgent(base).entity
        const model = primary.copilotModel ?? base.team.copilotModel ?? xpert.copilotModel
        return {
            revision,
            workspace: { id: workspace.id, name: workspace.name },
            prompt: primary.prompt ?? '',
            capabilities,
            setup,
            modelId: model?.copilotId && model.model ? `${model.copilotId}/${encodeURIComponent(model.model)}` : ''
        }
    }

    async save(id: string, language: LanguagesEnum, input: AssistantConfigurationInput) {
        const { xpert, revision, base } = await this.load(id, language)
        if (input.revision !== revision) throw new ConflictException(t('server-ai:Error.AssistantConfigurationStale'))
        const template = this.capabilities.configurationTemplate(base)
        const composed = await this.capabilities.compose(template, language, input.capabilities, (key) =>
            this.templates.getTemplateDetail(key, language)
        )
        const draft: TXpertTeamDraft = parseCapabilityTemplateDraft(composed.export_data)
        const providers = await this.xperts.getSandboxProviders()
        const setup = await this.capabilities.setup(composed, language, input.capabilities, providers)
        const model = setup.models.find((item) => item.id === input.modelId)?.copilotModel
        await this.capabilities.prepareInstallation(composed, draft, language, input.capabilities, model, providers)
        const previousModel = primaryAgent(base).entity.copilotModel ?? base.team.copilotModel ?? xpert.copilotModel
        if (previousModel?.copilotId === model?.copilotId && previousModel?.model === model?.model)
            draft.team.copilotModel.options = previousModel?.options
        updateAssistantPrompt(draft, input.prompt)
        // Model/runtime checks may await external providers; check for intervening edits before writing.
        const current = await this.load(id, language)
        if (current.revision !== input.revision)
            throw new ConflictException(t('server-ai:Error.AssistantConfigurationStale'))
        // Keep identity, workspace, bindings, tools and other Studio-authored nodes from the existing draft.
        await this.xperts.saveDraft(id, draft)
        try {
            await this.xperts.publish(
                id,
                true,
                xpert.environmentId ?? null,
                t('server-ai:AssistantConfigurationReleaseNotes')
            )
        } catch {
            // Never pretend a saved draft is already active, or retry publishing implicitly.
            throw new UnprocessableEntityException(t('server-ai:Error.AssistantConfigurationPublishFailed'))
        }
        return { id }
    }
}
