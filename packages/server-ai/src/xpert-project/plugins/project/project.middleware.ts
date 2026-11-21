import { AIMessage, isToolMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
    AgentMiddlewareStrategy,
    RequestContext,
    type AgentMiddleware,
    type IAgentMiddlewareContext,
    type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'
import { isPlanModeEnabledFromState } from '../../../shared/agent/plan-mode'
import { CONVERSATION_TURN, type ConversationMiddlewareContext } from '../../../chat-conversation/conversation-turn'
import { ProjectSelectionService } from '../../services/project-selection-request'

const selectionTool = 'request_project_selection'
const selectionRequested = 'PROJECT_SELECTION_REQUESTED'

export const PROJECT_MIDDLEWARE = 'ProjectMiddleware'

@Injectable()
@AgentMiddlewareStrategy(PROJECT_MIDDLEWARE)
export class ProjectMiddleware implements IAgentMiddlewareStrategy {
    constructor(
        @Inject(ProjectSelectionService) private readonly selections: Pick<ProjectSelectionService, 'request'>
    ) {}

    readonly meta: TAgentMiddlewareMeta = {
        name: PROJECT_MIDDLEWARE,
        label: { en_US: 'Projects', zh_Hans: '项目' },
        description: {
            en_US: 'Choose or create a project for the current conversation.',
            zh_Hans: '为当前对话选择或创建项目。'
        },
        configSchema: { type: 'object', properties: {}, additionalProperties: false }
    }

    getToolNames() {
        return [selectionTool]
    }

    createMiddleware(
        options: unknown,
        context: IAgentMiddlewareContext & ConversationMiddlewareContext
    ): AgentMiddleware {
        z.object({})
            .strict()
            .parse(options ?? {})
        const turn = context[CONVERSATION_TURN]
        if (context.projectId || !turn) return { name: PROJECT_MIDDLEWARE, tools: [] }
        const scope = { ...turn }
        const picker = tool(
            async () => {
                await this.selections.request(scope)
                return selectionRequested
            },
            {
                name: selectionTool,
                description:
                    'Request the user to choose or create a Project only when their current request asks to perform project work now or explicitly move this conversation. Discussing a future deliverable, naming it, or mentioning an example does not authorize project setup. Call this tool on its own and wait for the user to choose the destination.',
                schema: z.object({}).strict()
            }
        )
        return {
            name: PROJECT_MIDDLEWARE,
            tools: [picker],
            wrapToolCall: (request, next) => {
                if (request.toolCall.name === selectionTool && isPlanModeEnabledFromState(request.state))
                    throw new Error('Project selection is unavailable in Plan Mode')
                return next(request)
            },
            wrapModelCall: async (request, next) => {
                const last = request.messages.at(-1)
                if (
                    last &&
                    isToolMessage(last) &&
                    last.name === selectionTool &&
                    last.status !== 'error' &&
                    last.content === selectionRequested
                ) {
                    const prompt = 'Confirm the project in this conversation to continue your request.'
                    return new AIMessage(
                        t('server-ai:ProjectMove.ConfirmInChat', {
                            lng: RequestContext.getLanguageCode(),
                            defaultValue: prompt
                        }) || prompt
                    )
                }
                const inPlan = isPlanModeEnabledFromState(request.state)
                const tools = inPlan ? request.tools.filter((tool) => tool.name !== selectionTool) : request.tools
                const canOffer = tools.some((tool) => tool.name === selectionTool)
                if (!canOffer) return next({ ...request, tools })
                const guidance =
                    'Follow the current turn intent. For discussion, explanation or planning, answer directly without requesting a Project or starting preparation for future work, even if the user mentions a deliverable, title or example. Only when the user asks to perform project work now or explicitly move this conversation, call request_project_selection on its own if a Project is needed. Wait for confirmation before continuing the work.'
                const content = request.systemMessage?.content ?? ''
                const response = await next({
                    ...request,
                    tools,
                    systemMessage: new SystemMessage({
                        content:
                            typeof content === 'string'
                                ? content + '\n\n' + guidance
                                : [...content, { type: 'text', text: guidance }]
                    })
                })
                // Destination consent ends this turn before any sibling operation can run.
                const selection = response.tool_calls?.find((call) => call.name === selectionTool)
                if (selection && response.tool_calls.length > 1) {
                    return new AIMessage({
                        content: response.content,
                        tool_calls: [selection],
                        id: response.id,
                        usage_metadata: response.usage_metadata,
                        response_metadata: response.response_metadata
                    })
                }
                return response
            }
        }
    }
}
