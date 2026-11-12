import { Injectable } from '@nestjs/common'
import { ModelFeature, type TXpertTeamDraft } from '@xpert-ai/contracts'
import {
    applyAssistantMiddleware,
    AssistantCapabilityProvider,
    hasAssistantMiddleware,
    type AssistantCapabilityApplyContext,
    type IAssistantCapabilityProvider
} from '@xpert-ai/plugin-sdk'

@Injectable()
@AssistantCapabilityProvider('scheduler')
export class SchedulerCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = 'scheduler'
    readonly availableForBlankAssistant = true
    readonly supportsQuickCreation = true
    readonly templates = [{ templateId: 'xpert-bosi-desktop', required: false }]
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Scheduled tasks', zh_Hans: '计划任务' }
    readonly description = {
        en_US: 'Schedule checks in an existing chat or a new chat each run, and notify when new differences appear.',
        zh_Hans: '在已有聊天中定时检查，或每次运行时新建聊天；发现新差异时通知。'
    }
    isEnabled(draft: TXpertTeamDraft) {
        return hasAssistantMiddleware(draft, this.key)
    }
    async check() {
        return { available: true }
    }
    async apply({ draft }: AssistantCapabilityApplyContext) {
        applyAssistantMiddleware(draft, {
            provider: this.key,
            key: 'Capability_Scheduler',
            title: 'Scheduled tasks',
            instructions:
                'When ongoing work needs a later check, use create_scheduler. For recurring difference checks choose current_conversation, existing_conversation or new_chat according to the requested destination. Set intervalMinutes when the requested frequency differs from 30 minutes. Review existing tasks before creating another follow-up.'
        })
    }
}
