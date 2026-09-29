// The completed tool is a separate checkpointed node: resuming this gate must never replay its side effects.
import { HumanMessage, isToolMessage, isAIMessage, type BaseMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { interrupt } from '@langchain/langgraph'
import type { AgentStateAnnotation } from './state'
import { toolAfterHumanMessage } from './tool-after-message'

export function createInterruptAfterNode(agentChannel: string, tools: readonly { name: string; app?: boolean }[]) {
    return new RunnableLambda({
        func: async (state: typeof AgentStateAnnotation.State) => {
            const channel = agentChannel ? state[agentChannel] : state
            const messages: BaseMessage[] =
                channel && typeof channel === 'object' && 'messages' in channel && Array.isArray(channel.messages)
                    ? channel.messages
                    : []
            const lastAI = [...messages].reverse().find(isAIMessage)
            if (!lastAI) return {}
            const replies: HumanMessage[] = []
            for (const call of lastAI.tool_calls ?? []) {
                const spec = tools.find((tool) => tool.name === call.name)
                if (!spec) continue
                const result = messages.find((message) => isToolMessage(message) && message.tool_call_id === call.id)
                if (!result || !isToolMessage(result) || result.status === 'error') continue
                const response: unknown = interrupt({
                    type: 'tool_after',
                    toolName: call.name,
                    app: spec.app ?? false,
                    toolCallId: result.tool_call_id
                })
                const reply = toolAfterHumanMessage(response, result.tool_call_id)
                if (reply) replies.push(reply)
            }
            return replies.length
                ? agentChannel
                    ? { [agentChannel]: { messages: replies } }
                    : { messages: replies }
                : {}
        }
    })
}
