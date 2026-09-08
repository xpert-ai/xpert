import { AIMessage, SystemMessage } from '@langchain/core/messages'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import { channelName } from '@xpert-ai/contracts'
import type { AgentMiddleware, ModelRequest } from '@xpert-ai/plugin-sdk'

/** Inspect prepared Agent state; final invocation validation is tested separately. */
export async function prepareAutomaticCompression(
    middleware: AgentMiddleware,
    state: ModelRequest['state'],
    runtime: ModelRequest['runtime'],
    systemMessage?: SystemMessage
) {
    if (!middleware.wrapModelCall) throw new Error('Missing compression wrapper')
    let update: ModelRequest['agentStateUpdate']
    await middleware.wrapModelCall(
        {
            model: new FakeListChatModel({ responses: ['unused'] }),
            messages: state.messages ?? [],
            systemMessage,
            tools: [],
            state: { [channelName('Agent_1')]: state },
            runtime
        },
        (request) => {
            update = request.agentStateUpdate
            return new AIMessage('unused')
        }
    )
    return update
}
