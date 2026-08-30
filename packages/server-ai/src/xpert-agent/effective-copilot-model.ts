import { IXpert, IXpertAgent, TChatOptions, TCopilotModel } from '@xpert-ai/contracts'

/**
 * Apply the request override only to the root Assistant's published Primary Agent.
 * Direct sub-Agent, swarm member, nested graph, and explicitly configured node models
 * must continue to use their authored configuration.
 */
export function resolveEffectiveCopilotModel(
    team: IXpert,
    agent: IXpertAgent,
    options: Pick<TChatOptions, 'xpertId' | 'primaryAgentKey' | 'primaryCopilotModel'>
): TCopilotModel | undefined {
    const configuredModel = agent.copilotModel ?? team.copilotModel
    if (
        options.primaryCopilotModel &&
        options.primaryAgentKey &&
        options.xpertId === team.id &&
        options.primaryAgentKey === agent.key
    ) {
        return options.primaryCopilotModel
    }
    return configuredModel
}
