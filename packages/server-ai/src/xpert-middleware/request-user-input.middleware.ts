import { Injectable } from '@nestjs/common'
import { SystemMessage } from '@langchain/core/messages'
import { REQUEST_USER_INPUT_TOOL_NAME } from '@xpert-ai/chatkit-types'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    AgentMiddlewareStrategy,
    type AgentMiddleware,
    type IAgentMiddlewareContext,
    type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { createUserInputMiddleware, REQUEST_USER_INPUT_MIDDLEWARE_NAME } from '../shared/agent/user-input'
import { getPlanModePrompt, isPlanModeEnabledFromState } from '../shared/agent/plan-mode'
import { ClientToolMiddleware } from './client-tool.middleware'

@Injectable()
@AgentMiddlewareStrategy(REQUEST_USER_INPUT_MIDDLEWARE_NAME)
export class RequestUserInputMiddleware implements IAgentMiddlewareStrategy {
    readonly meta: TAgentMiddlewareMeta = {
        name: REQUEST_USER_INPUT_MIDDLEWARE_NAME,
        label: { en_US: 'Ask for user input', zh_Hans: '向用户提问' },
        description: {
            en_US: 'Ask for missing information and wait for the user to submit a response.',
            zh_Hans: '询问缺少的信息，等待用户提交回答后继续任务。'
        },
        builtin: true,
        icon: {
            type: 'svg',
            value: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/></svg>'
        },
        configSchema: { type: 'object', properties: {}, additionalProperties: false }
    }

    constructor(private readonly clientTools: ClientToolMiddleware) {}

    getToolNames() {
        return [REQUEST_USER_INPUT_TOOL_NAME]
    }

    async createMiddleware(_options: unknown, context: IAgentMiddlewareContext): Promise<AgentMiddleware> {
        const middleware = await createUserInputMiddleware(this.clientTools, context)
        return {
            ...middleware,
            name: REQUEST_USER_INPUT_MIDDLEWARE_NAME,
            wrapModelCall: (request, handler) => {
                if (!isPlanModeEnabledFromState(request.state)) {
                    return middleware.wrapModelCall ? middleware.wrapModelCall(request, handler) : handler(request)
                }
                const prompt = getPlanModePrompt(
                    request.tools.some((tool) => tool.name === REQUEST_USER_INPUT_TOOL_NAME)
                )
                const content = request.systemMessage?.content ?? ''
                return handler({
                    ...request,
                    systemMessage: new SystemMessage({
                        content:
                            typeof content === 'string'
                                ? `${content}\n\n${prompt}`
                                : [...content, { type: 'text', text: prompt }]
                    })
                })
            }
        }
    }
}
