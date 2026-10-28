// Invariants: only an agent entry stages input; tool/model loops never stage it.
// A consumed receipt and its messages commit together, so checkpoint resume cannot replay
// an already consumed input. Message text and LangGraph trigger names are not identity.
import { HumanMessage, ToolMessage } from '@langchain/core/messages'
import { HumanMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import type { IEnvironment, IXpertAgent, TMessageChannel } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { createHumanMessage } from '../shared/agent/message'
import { AgentStateAnnotation, stateToParameters } from '../shared/agent/state'
import { getPendingToolCallsAfterTrailingToolMessages } from './commands/handlers/agent-navigation'

type InputState = typeof AgentStateAnnotation.State
type MessageOptions = Parameters<typeof createHumanMessage>[4]

export function createStageAgentInputNode(channel: string, inputMessageId?: string, useRootIdentity = true) {
    return RunnableLambda.from((state: InputState) => {
        const previous = state[channel] as TMessageChannel | undefined
        const id = (useRootIdentity ? state.inputIdentity?.id : undefined) ?? inputMessageId ?? randomUUID()
        // A repeated delivery of the same persisted input is not another turn.
        if (previous?.inputReceipt?.id === id) return {}
        return { [channel]: { inputReceipt: { id, status: 'pending' as const } } }
    })
}

export function hasPendingAgentInput(
    channel?: Pick<TMessageChannel, 'inputReceipt'>,
    retryInputCheckpointId?: string
): boolean {
    return channel?.inputReceipt?.status === 'pending' || (!channel?.inputReceipt && Boolean(retryInputCheckpointId))
}

export async function prepareAgentInput(
    state: InputState,
    channel: TMessageChannel | undefined,
    agent: IXpertAgent,
    environment: IEnvironment,
    commandBus: CommandBus,
    queryBus: QueryBus,
    options: MessageOptions,
    retryInputCheckpointId?: string
) {
    // Pre-receipt input checkpoints may already schedule the old pre-turn/model
    // nodes. Only a server-verified Retry boundary may bootstrap their input.
    const receipt =
        channel?.inputReceipt ??
        (retryInputCheckpointId ? { id: `retry:${retryInputCheckpointId}`, status: 'pending' as const } : undefined)
    const humanMessages: HumanMessage[] = []
    const interruptedTools: ToolMessage[] = []
    if (receipt?.status !== 'pending') return { humanMessages, interruptedTools, inputReceipt: receipt }

    const templates = agent.promptTemplates?.filter((template) => !!template.text?.trim())
    for (const template of templates ?? []) {
        humanMessages.push(
            await HumanMessagePromptTemplate.fromTemplate(template.text, { templateFormat: 'mustache' }).format(
                stateToParameters(state, environment)
            )
        )
    }
    if (
        (!humanMessages.length || (options?.resourceSkillContext && state.human?.resourceSkills !== undefined)) &&
        state.human
    ) {
        humanMessages.push(
            await createHumanMessage(
                commandBus,
                queryBus,
                state,
                agent.options?.attachment ?? agent.options?.vision,
                options
            )
        )
    }
    humanMessages.forEach((message, index) => {
        // Set the ID through the constructor so LangChain serialization retains it.
        humanMessages[index] = new HumanMessage({ ...message, id: `input:${receipt.id}:${agent.key}:${index}` })
    })

    // A new Send supersedes an interrupted tool round. Preserve completed results
    // and close only unanswered calls; do not imply that their side effects stopped.
    for (const call of getPendingToolCallsAfterTrailingToolMessages(channel?.messages ?? [])) {
        if (!call.id) continue
        interruptedTools.push(
            new ToolMessage({
                id: `interrupted:${call.id}`,
                tool_call_id: call.id,
                name: call.name,
                status: 'error',
                content: t('server-ai:Error.ToolResultUnavailableForNewInput', {
                    defaultValue:
                        'The previous turn was interrupted before this tool result was recorded. Its outcome is unknown. Follow the new user input; do not repeat this operation unless that input requires it.'
                })
            })
        )
    }
    return { humanMessages, interruptedTools, inputReceipt: { id: receipt.id, status: 'consumed' as const } }
}
