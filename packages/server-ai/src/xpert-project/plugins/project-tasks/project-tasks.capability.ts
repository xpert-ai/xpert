import { BadRequestException, Injectable } from '@nestjs/common'
import {
    IWFNMiddleware,
    ModelFeature,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import {
    AssistantCapabilityApplyContext,
    AssistantCapabilityProvider,
    IAssistantCapabilityProvider
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { PROJECT_TASKS_MIDDLEWARE } from './constants'

const instructions = `Use Project Tasks to organize work in the current project: define goals, completion requirements, owners and dependencies before delegating. List authorized task runtimes before choosing an executor. Creating a task or changing its schedule does not start execution; explicitly dispatch it when appropriate. Runtime success is not task acceptance: inspect the current execution and deliverables, then explicitly accept the result or request rework with evidence. If a call's outcome is uncertain, inspect the task before requesting another attempt. Without an active project, ask the user to open a project conversation; never invent project context or bypass project permissions. Summarize task names, progress, results and next steps in user-facing replies; keep internal IDs and revisions in tool calls.`

@Injectable()
@AssistantCapabilityProvider(PROJECT_TASKS_MIDDLEWARE)
export class ProjectTasksCapabilityProvider implements IAssistantCapabilityProvider {
    readonly key = PROJECT_TASKS_MIDDLEWARE
    readonly availableForBlankAssistant = true
    readonly supportsQuickCreation = true
    readonly templates = [{ templateId: 'xpert-bosi-desktop', required: false }]
    readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
    readonly label = { en_US: 'Project management', zh_Hans: '项目管理' }
    readonly description = {
        en_US: 'Plan project tasks, track progress, delegate to authorized executors and review results. Use in a project conversation.',
        zh_Hans: '拆解项目任务、跟踪进度、委托已授权的执行器并验收结果。在项目会话中使用。'
    }

    isEnabled(draft: TXpertTeamDraft) {
        return draft.nodes.some(
            (node) =>
                isProjectMiddleware(node) &&
                node.entity.provider === PROJECT_TASKS_MIDDLEWARE &&
                draft.connections.some(
                    (edge) => edge.type === 'workflow' && edge.from === draft.team.agent?.key && edge.to === node.key
                )
        )
    }

    async check() {
        // Registered with the built-in middleware; project and executor authorization happen at runtime.
        return { available: true }
    }

    async apply({ draft }: AssistantCapabilityApplyContext) {
        const agent = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
        if (agent?.type !== 'agent') throw new BadRequestException(t('server-ai:Error.TemplateCapabilityDraftInvalid'))
        if (!this.isEnabled(draft)) {
            const base = 'Capability_ProjectTasks'
            let key = base
            for (let suffix = 2; draft.nodes.some((node) => node.key === key); suffix++) key = `${base}_${suffix}`
            const entity: IWFNMiddleware = {
                id: key,
                key,
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                title: 'Project Tasks',
                provider: PROJECT_TASKS_MIDDLEWARE,
                required: true,
                options: {}
            }
            draft.nodes.push({ type: 'workflow', key, position: { x: 620, y: 160 * (draft.nodes.length - 1) }, entity })
            draft.connections.push({
                key: `${agent.key}/${key}`,
                type: 'workflow',
                from: agent.key,
                to: key,
                required: true
            })
            agent.entity.options = {
                ...agent.entity.options,
                parallelToolCalls: false,
                middlewares: {
                    ...agent.entity.options?.middlewares,
                    order: [...(agent.entity.options?.middlewares?.order ?? []), key]
                }
            }
        }
        if (!agent.entity.prompt?.includes(instructions))
            agent.entity.prompt = [agent.entity.prompt, instructions].filter(Boolean).join('\n\n')
    }
}

function isProjectMiddleware(node: TXpertTeamNode): node is TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } {
    return node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
}
