import { AgentMiddlewareRegistry, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { createPlanModeMiddlewareEntries } from './plan-mode'
import { createUserInputMiddlewareEntries } from './user-input'

export function createRuntimeUserInputMiddlewareEntries(
    registry: AgentMiddlewareRegistry,
    context: Omit<IAgentMiddlewareContext, 'node'>,
    planMode?: boolean
) {
    return planMode
        ? createPlanModeMiddlewareEntries(registry, context, true)
        : createUserInputMiddlewareEntries(registry, context)
}
