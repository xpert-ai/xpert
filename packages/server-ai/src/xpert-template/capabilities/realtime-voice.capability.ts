import {
    AiModelTypeEnum,
    ModelFeature,
    RealtimeModelOption,
    TXpertTeamDraft,
    resolveI18nText
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AssistantCapabilityProvider, IAssistantCapabilityProvider, RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { FindCopilotModelsQuery } from '../../copilot/queries'
import { CopilotWithProviderDto } from '../../copilot/dto'

@Injectable()
export class RealtimeModelCatalog {
    constructor(private readonly queries: QueryBus) {}

    async list(): Promise<RealtimeModelOption[]> {
        const copilots = await this.queries.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
            new FindCopilotModelsQuery(AiModelTypeEnum.REALTIME)
        )
        return copilots.flatMap((copilot) =>
            copilot.providerWithModels.models.flatMap((model) => {
                if (
                    !model.realtime?.voices.length ||
                    !model.realtime.voices.some((v) => v.id === model.realtime.defaultVoice)
                )
                    return []
                return [
                    {
                        ...model.realtime,
                        id: `${copilot.id}/${encodeURIComponent(model.model)}`,
                        label: `${resolveI18nText(copilot.providerWithModels.label, RequestContext.getLanguageCode()) || copilot.providerWithModels.provider} / ${resolveI18nText(model.label, RequestContext.getLanguageCode()) || model.model}`,
                        copilotModel: { copilotId: copilot.id, model: model.model, modelType: AiModelTypeEnum.REALTIME }
                    }
                ]
            })
        )
    }
}

@Injectable()
@AssistantCapabilityProvider('realtime-voice')
export class RealtimeVoiceCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = 'realtime-voice'
    readonly availableForBlankAssistant = true
    readonly templates = [{ templateId: 'xpert-bosi-desktop', required: false }]
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Realtime voice calls', zh_Hans: '实时语音通话' }
    readonly description = {
        en_US: 'Talk to Bosi while it works. Choose a separate realtime voice model and voice.',
        zh_Hans: '与 Bosi 实时通话并交办任务，单独选择语音模型和音色。'
    }
    constructor(private readonly catalog: RealtimeModelCatalog) {}
    isEnabled(draft: TXpertTeamDraft) {
        return draft.team.features?.realtimeVoice?.enabled === true
    }
    async check() {
        const available = (await this.catalog.list()).length > 0
        return { available, reason: available ? undefined : t('server-ai:Error.RealtimeModelRequired') }
    }
    async apply({ draft }: { draft: TXpertTeamDraft }) {
        draft.team.features = { ...draft.team.features, realtimeVoice: { enabled: true } }
    }
}
