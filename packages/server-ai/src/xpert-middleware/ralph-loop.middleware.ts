import { Injectable } from '@nestjs/common'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { ChatConversationGoalService } from '../chat-conversation/goal/conversation-goal.service'
import {
    buildConversationGoalAgentMiddleware,
    buildConversationGoalMiddlewareMeta,
    ConversationGoalMiddlewareConfig
} from './conversation-goal.middleware.shared'

export const RALPH_LOOP_MIDDLEWARE_NAME = 'ralph-loop'

export type RalphLoopMiddlewareConfig = ConversationGoalMiddlewareConfig

@Injectable()
@AgentMiddlewareStrategy(RALPH_LOOP_MIDDLEWARE_NAME)
export class RalphLoopMiddleware implements IAgentMiddlewareStrategy {
    constructor(private readonly goalService: ChatConversationGoalService) {}

    meta = buildConversationGoalMiddlewareMeta({
        middlewareName: RALPH_LOOP_MIDDLEWARE_NAME,
        label: {
            en_US: 'Ralph Loop',
            zh_Hans: 'Ralph 循环'
        },
        description: {
            en_US: 'Legacy alias for conversation goal persistence and automatic continuations.',
            zh_Hans: '会话目标持久化与自动续跑的历史别名。'
        }
    })

    createMiddleware(
        options: RalphLoopMiddlewareConfig = {},
        context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        return buildConversationGoalAgentMiddleware(this.goalService, options, context, {
            middlewareName: RALPH_LOOP_MIDDLEWARE_NAME,
            label: this.meta.label,
            description: this.meta.description
        })
    }
}
