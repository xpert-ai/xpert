// Model-only removal of superseded scratch lists; authoritative Project decisions are never touched.
// Only complete single-call pairs are removed. Unanswered/error/signed exchanges remain intact.
import { isAIMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'

export function currentTodoContext(messages: BaseMessage[]): BaseMessage[] {
    const superseded = new Set<number>()
    let latest = false
    for (let index = messages.length - 2; index >= 0; index--) {
        const call = messages[index],
            reply = messages[index + 1]
        if (
            !isAIMessage(call) ||
            call.content !== '' ||
            call.tool_calls?.length !== 1 ||
            call.tool_calls[0].name !== 'write_todos' ||
            !Array.isArray(call.tool_calls[0].args.todos) ||
            !isToolMessage(reply) ||
            reply.tool_call_id !== call.tool_calls[0].id ||
            reply.status === 'error' ||
            (reply.name && reply.name !== 'write_todos') ||
            call.invalid_tool_calls?.length ||
            Object.keys(call.additional_kwargs).some((key) => !['reasoning_content', 'tool_calls'].includes(key)) ||
            call.response_metadata.output
        )
            continue
        if (latest) {
            superseded.add(index)
            superseded.add(index + 1)
        }
        latest = true
    }
    return superseded.size ? messages.filter((_, index) => !superseded.has(index)) : messages
}
