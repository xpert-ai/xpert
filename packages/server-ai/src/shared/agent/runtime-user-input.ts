import { AgentMiddlewareRegistry, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { createPlanModeMiddlewareEntries, createPlanModePromptEntry } from './plan-mode'
import { createUserInputMiddlewareEntries } from './user-input'

export async function createRuntimeUserInputMiddlewareEntries(
    registry: AgentMiddlewareRegistry,
    context: Omit<IAgentMiddlewareContext, 'node'>,
    planMode?: boolean
) {
    if (context.xpertFeatures?.requestUserInput?.enabled !== true) {
        return planMode ? [createPlanModePromptEntry(false)] : []
    }
    return planMode
        ? createPlanModeMiddlewareEntries(registry, context, true)
        : createUserInputMiddlewareEntries(registry, context)
}
