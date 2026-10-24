import { AiModelTypeEnum, type IXpert, type TCopilotModel, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { t } from 'i18next'

export function hasApplicationSpeechModel(assistant: Pick<IXpert, 'features'> | null): boolean {
    const speech = assistant?.features?.speechToText
    return !!(
        speech?.enabled &&
        speech.copilotModel?.copilotId &&
        speech.copilotModel.model &&
        speech.copilotModel.modelType === AiModelTypeEnum.SPEECH2TEXT
    )
}

/** Compose from the published snapshot without saving a draft; the publication transaction rejects concurrent edits. */
export function createSpeechModelRepairDraft(assistant: IXpert, model: TCopilotModel): TXpertTeamDraft {
    if (assistant.draft) throw new ConflictException(t('server-ai:Error.ApplicationSpeechModelDraftPending'))
    if (!assistant.publishAt || !assistant.graph?.nodes || !assistant.graph.connections)
        throw new BadRequestException(t('server-ai:Error.TemplateCapabilityDraftInvalid'))
    const { draft: _draft, graph, ...team } = assistant
    return {
        team: { ...team, features: { ...team.features, speechToText: { enabled: true, copilotModel: model } } },
        nodes: graph.nodes,
        connections: graph.connections
    }
}
