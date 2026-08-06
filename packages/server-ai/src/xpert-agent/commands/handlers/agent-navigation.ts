import { BaseMessage, isAIMessage, isToolMessage, ToolMessage } from '@langchain/core/messages'
import { ToolCall } from '@langchain/core/messages/tool'

/**
 * Build the declared destinations for the agent decision branch.
 *
 * LangGraph validates every `Send` target against this list. Middleware tools
 * are added to the graph dynamically, so their node names must be declared
 * alongside the ordinary workflow/model destinations.
 */
export function buildAgentDecisionPathMap(
    baseDecisionPathMap: string[],
    modelLoopEntryNode: string,
    toolNames: string[]
): string[] {
    return [...new Set([...baseDecisionPathMap, modelLoopEntryNode, ...toolNames])]
}

/**
 * Find tool calls from the latest assistant tool-call block that do not yet have
 * a tool response. This supports HITL resumes where a middleware appends
 * synthetic ToolMessages for rejected calls before the approved calls run.
 */
export function getPendingToolCallsAfterTrailingToolMessages(messages: BaseMessage[]): ToolCall[] {
    const answeredToolCallIds = new Set<string>()

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (isToolMessage(message)) {
            const toolCallId = (message as ToolMessage).tool_call_id
            if (toolCallId) {
                answeredToolCallIds.add(toolCallId)
            }
            continue
        }

        if (!isAIMessage(message)) {
            return []
        }

        return (message.tool_calls ?? []).filter((toolCall) => !toolCall.id || !answeredToolCallIds.has(toolCall.id))
    }

    return []
}
