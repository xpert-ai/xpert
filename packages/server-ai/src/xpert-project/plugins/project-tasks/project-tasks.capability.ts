import { Injectable } from '@nestjs/common'
import { ModelFeature, TXpertTeamDraft } from '@xpert-ai/contracts'
import {
    AssistantCapabilityApplyContext,
    AssistantCapabilityProvider,
    IAssistantCapabilityProvider,
    applyAssistantMiddleware,
    hasAssistantMiddleware
} from '@xpert-ai/plugin-sdk'
import { PROJECT_TASKS_MIDDLEWARE } from './constants'
import { PROJECT_MIDDLEWARE } from '../project/project.middleware'

const instructions = `Use Project Tasks to organize work in the current project: define goals, completion requirements, owners and dependencies before delegating. List authorized task runtimes before choosing an executor. Creating a task or changing its schedule does not start execution; explicitly dispatch it when appropriate. Runtime success is not task acceptance: inspect the current execution and deliverables, then explicitly accept the result or request rework with evidence. If a call's outcome is uncertain, inspect the task before requesting another attempt. When the user requests project work without an active project, call request_project_selection and wait for confirmation in the current conversation. Answer discussions and planning directly; never invent project context or bypass project permissions. Summarize task names, progress, results and next steps in user-facing replies; keep internal IDs and revisions in tool calls.`

@Injectable()
@AssistantCapabilityProvider(PROJECT_TASKS_MIDDLEWARE)
export class ProjectTasksCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = PROJECT_TASKS_MIDDLEWARE
    readonly availableForBlankAssistant = true
    readonly supportsQuickCreation = true
    readonly templates = [{ templateId: 'xpert-bosi-desktop', required: false }]
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Project tasks', zh_Hans: '项目任务' }
    readonly description = {
        en_US: 'Plan project tasks, track progress, delegate to authorized executors and review results. Choose or create a project in the conversation when needed.',
        zh_Hans: '拆解项目任务、跟踪进度、委托已授权的执行器并验收结果。需要时可在当前对话中选择或创建项目。'
    }

    isEnabled(draft: TXpertTeamDraft) {
        return hasAssistantMiddleware(draft, PROJECT_TASKS_MIDDLEWARE)
    }

    async check() {
        return { available: true }
    }

    async apply({ draft }: AssistantCapabilityApplyContext) {
        applyAssistantMiddleware(draft, {
            provider: PROJECT_TASKS_MIDDLEWARE,
            key: 'Capability_ProjectTasks',
            title: 'Project Tasks',
            instructions
        })
        applyAssistantMiddleware(draft, {
            provider: PROJECT_MIDDLEWARE,
            key: 'Capability_Project',
            title: 'Projects',
            instructions: '',
            preserveToolConcurrency: true
        })
    }
}
