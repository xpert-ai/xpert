import type { TXpertTeamDraft } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AssistantCapabilityService } from './assistant-capability.service'
import { XpertTemplateService } from '../xpert-template.service'
import { parseCapabilityTemplateDraft } from './template-draft'
import { recordCapabilityState, removeCapabilityState } from './capability-state'

import { RecomposeAssistantCapabilitiesQuery } from './recompose-capabilities.query'

@QueryHandler(RecomposeAssistantCapabilitiesQuery)
export class RecomposeAssistantCapabilitiesHandler implements IQueryHandler<RecomposeAssistantCapabilitiesQuery> {
    constructor(
        private readonly capabilities: AssistantCapabilityService,
        private readonly templates: XpertTemplateService
    ) {}

    async execute({
        installed,
        incoming,
        language,
        sandboxProviders
    }: RecomposeAssistantCapabilitiesQuery): Promise<TXpertTeamDraft> {
        const current = installed.draft ?? { team: installed, ...installed.graph }
        const state = current.team.options?.assistantCapabilities
        if (!state) return incoming
        // Validate ownership before replacing the base; Studio edits must be reviewed instead of discarded.
        removeCapabilityState(current)
        const base = removeCapabilityState(incoming)
        const sandboxProvider = state.sandbox && current.team.features?.sandbox?.provider
        if (sandboxProvider)
            base.team.features = {
                ...base.team.features,
                sandbox: { ...base.team.features?.sandbox, provider: sandboxProvider }
            }
        const template = this.capabilities.configurationTemplate(base)
        const composed = await this.capabilities.compose(template, language, state.selected, (id) =>
            this.templates.getTemplateDetail(id, language)
        )
        const draft = parseCapabilityTemplateDraft(composed.export_data)
        await this.capabilities.prepareInstallation(
            template,
            draft,
            language,
            state.selected,
            base.team.copilotModel,
            sandboxProviders
        )
        const voice = current.team.features?.realtimeVoice
        if (draft.team.features?.realtimeVoice?.enabled)
            await this.capabilities.configureRealtimeVoice(
                draft,
                voice?.copilotModel && voice.voice
                    ? {
                          modelId: `${voice.copilotModel.copilotId}/${encodeURIComponent(voice.copilotModel.model)}`,
                          voice: voice.voice
                      }
                    : undefined
            )
        if (!draft.team.options?.assistantCapabilities) recordCapabilityState(base, draft, state.selected)
        return draft
    }
}
