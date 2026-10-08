import { createHash } from 'node:crypto'
import {
    AssistantConfiguration,
    AssistantConfigurationInput,
    AssistantCapabilityConfiguration,
    AssistantCapabilityDraftInput,
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
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { XpertService } from '../xpert.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { parseCapabilityTemplateDraft } from '../../xpert-template/capabilities/template-draft'
import {
    primaryAgent,
    recordCapabilityState,
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
        const realtimeVoice = draft.team.features?.realtimeVoice
        const base = removeCapabilityState(draft)
        return { xpert, workspace, revision, base, selected, realtimeVoice }
    }

    async get(id: string, language: LanguagesEnum, selection?: string[]): Promise<AssistantConfiguration> {
        const { xpert, workspace, revision, base, selected, realtimeVoice } = await this.load(id, language)
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
            realtimeVoice:
                realtimeVoice?.copilotModel && realtimeVoice.voice
                    ? {
                          modelId: `${realtimeVoice.copilotModel.copilotId}/${encodeURIComponent(realtimeVoice.copilotModel.model)}`,
                          voice: realtimeVoice.voice
                      }
                    : undefined,
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
        await this.capabilities.configureRealtimeVoice(draft, input.realtimeVoice)
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

    async getCapabilities(
        id: string,
        language: LanguagesEnum,
        selection?: string[]
    ): Promise<AssistantCapabilityConfiguration> {
        const { xpert, revision, base, selected, realtimeVoice } = await this.load(id, language)
        const template = this.capabilities.configurationTemplate(base)
        // Editing capabilities must not require replacing a model when no capability needs one.
        template.requiresModelSelection = false
        const providers = await this.xperts.getSandboxProviders()
        const setup = await this.capabilities.setup(template, language, selection ?? selected, providers)
        // The settings dialog must offer models before the user enables realtime calls.
        setup.realtimeModels ??= await this.capabilities.realtimeModels()
        const model = primaryAgent(base).entity.copilotModel ?? base.team.copilotModel ?? xpert.copilotModel
        const modelId = model?.copilotId && model.model ? `${model.copilotId}/${encodeURIComponent(model.model)}` : ''
        return {
            revision,
            realtimeVoice:
                realtimeVoice?.copilotModel && realtimeVoice.voice
                    ? {
                          modelId: `${realtimeVoice.copilotModel.copilotId}/${encodeURIComponent(realtimeVoice.copilotModel.model)}`,
                          voice: realtimeVoice.voice
                      }
                    : undefined,
            selected: selection ?? selected,
            options: await this.capabilities.configurationOptions(template, base, language, providers),
            setup,
            modelId,
            // A failed runtime check returns before model discovery; do not misreport it as an incompatible model.
            modelAvailable: setup.canInstall
                ? !setup.requiresModel || setup.models.some((item) => item.id === modelId)
                : null
        }
    }

    /** Compose only: the dialog owns draft persistence and the explicit save-and-publish transaction. */
    async previewCapabilities(
        id: string,
        language: LanguagesEnum,
        input: AssistantCapabilityDraftInput
    ): Promise<TXpertTeamDraft> {
        const { revision, base, xpert, realtimeVoice } = await this.load(id, language)
        if (revision !== input.revision) throw new ConflictException(t('server-ai:Error.AssistantConfigurationStale'))
        // Apply a user's provider choice only after removing capability-owned sandbox settings.
        // Mutating the recorded overlay first would make removeCapabilityState report a conflict.
        if (input.sandboxProvider !== undefined) {
            base.team.features = {
                ...base.team.features,
                sandbox: { ...base.team.features?.sandbox, provider: input.sandboxProvider || undefined }
            }
        }
        const template = this.capabilities.configurationTemplate(base)
        template.requiresModelSelection = false
        const providers = await this.xperts.getSandboxProviders()
        const setup = await this.capabilities.setup(template, language, input.capabilities, providers)
        if (!setup.canInstall) throw new BadRequestException(setup.reason)
        const model = primaryAgent(base).entity.copilotModel ?? base.team.copilotModel ?? xpert.copilotModel
        if (
            setup.requiresModel &&
            !setup.models.some(
                (item) => item.copilotModel.copilotId === model?.copilotId && item.copilotModel.model === model?.model
            )
        )
            throw new BadRequestException(t('server-ai:Error.TemplateCapabilityModelRequired'))
        const composed = await this.capabilities.compose(template, language, input.capabilities, (key) =>
            this.templates.getTemplateDetail(key, language)
        )
        const draft = parseCapabilityTemplateDraft(composed.export_data)
        // Keep an explicit empty selection so old template variants cannot re-enable removed capabilities on reload.
        if (!draft.team.options?.assistantCapabilities) recordCapabilityState(base, draft, input.capabilities)
        const previousVoice =
            realtimeVoice?.copilotModel && realtimeVoice.voice
                ? {
                      modelId: `${realtimeVoice.copilotModel.copilotId}/${encodeURIComponent(realtimeVoice.copilotModel.model)}`,
                      voice: realtimeVoice.voice
                  }
                : undefined
        await this.capabilities.configureRealtimeVoice(
            draft,
            draft.team.features?.realtimeVoice?.enabled ? (input.realtimeVoice ?? previousVoice) : undefined
        )
        const check = await this.capabilities.setup(composed, language, input.capabilities, providers, draft)
        if (!check.canInstall) throw new BadRequestException(check.reason)
        if (
            check.requiresModel &&
            !check.models.some(
                (item) => item.copilotModel.copilotId === model?.copilotId && item.copilotModel.model === model?.model
            )
        )
            throw new BadRequestException(t('server-ai:Error.TemplateCapabilityModelRequired'))
        const current = await this.load(id, language)
        if (current.revision !== input.revision)
            throw new ConflictException(t('server-ai:Error.AssistantConfigurationStale'))
        return draft
    }
}
