import { Injectable } from '@nestjs/common'
import { ModelFeature, type TXpertTeamDraft } from '@xpert-ai/contracts'
import {
    AssistantCapabilityProvider,
    applyAssistantMiddleware,
    hasAssistantMiddleware,
    type AssistantCapabilityApplyContext,
    type IAssistantCapabilityProvider
} from '@xpert-ai/plugin-sdk'
import { PROJECT_MIDDLEWARE } from './project.middleware'

export const PROJECT_CAPABILITY = 'project-management'

@Injectable()
@AssistantCapabilityProvider(PROJECT_CAPABILITY)
export class ProjectCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = PROJECT_CAPABILITY
    readonly availableForBlankAssistant = true
    readonly supportsQuickCreation = true
    readonly templates = [{ templateId: 'xpert-bosi-desktop', required: false }]
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Project management', zh_Hans: '项目管理' }
    readonly description = {
        en_US: 'Choose or create a project in the conversation, move the conversation into it and continue the current request.',
        zh_Hans: '在对话中选择或创建项目，将当前对话移入项目并继续处理请求。'
    }

    isEnabled(draft: TXpertTeamDraft) {
        return hasAssistantMiddleware(draft, PROJECT_MIDDLEWARE)
    }

    async check() {
        return { available: true }
    }

    async apply({ draft }: AssistantCapabilityApplyContext) {
        applyAssistantMiddleware(draft, {
            provider: PROJECT_MIDDLEWARE,
            key: 'Capability_Project',
            title: 'Projects',
            instructions: '',
            preserveToolConcurrency: true
        })
    }
}
