import { IXpert, IXpertAgent, TChatOptions, TCopilotModel } from '@xpert-ai/contracts'

/**
 * Runtime selection replaces the root Assistant base model and Primary model.
 * Other Agents inherit the base only when they have no authored model.
 * Nested Assistants retain their own model configuration.
 */
export function resolveEffectiveCopilotModel(
    team: IXpert,
    agent: IXpertAgent,
    options: Pick<TChatOptions, 'xpertId' | 'primaryAgentKey' | 'primaryCopilotModel' | 'primaryModelSource'>
): TCopilotModel | undefined {
    const inheritsSelection =
        options.xpertId === team.id &&
        (options.primaryModelSource === 'explicit' || options.primaryModelSource === 'preference')
    const assistantModel = inheritsSelection ? (options.primaryCopilotModel ?? team.copilotModel) : team.copilotModel
    if (
        options.primaryCopilotModel &&
        options.primaryAgentKey &&
        options.xpertId === team.id &&
        options.primaryAgentKey === agent.key
    ) {
        return options.primaryCopilotModel
    }
    return agent.copilotModel ?? assistantModel
}
