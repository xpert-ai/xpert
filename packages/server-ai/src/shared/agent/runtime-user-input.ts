import { AgentMiddlewareRegistry, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { createPlanModeMiddlewareEntries } from './plan-mode'
import { canRequestUserInput } from './user-input-policy'
import { createUserInputMiddlewareEntries } from './user-input'

export async function createRuntimeUserInputMiddlewareEntries(
    registry: AgentMiddlewareRegistry,
    context: Omit<IAgentMiddlewareContext, 'node'>,
    planMode?: boolean
) {
    if (planMode) return createPlanModeMiddlewareEntries(registry, context, true)
    return canRequestUserInput(context) ? createUserInputMiddlewareEntries(registry, context) : []
}
