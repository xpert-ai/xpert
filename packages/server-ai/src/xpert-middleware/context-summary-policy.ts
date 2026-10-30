// Invariants: select whole call groups; never infer completion from shell text or tool names.
// User instructions remain verbatim and ordered; generated snapshots are not user instructions.
import { BaseMessage, isAIMessage, isHumanMessage, isSystemMessage, isToolMessage } from '@langchain/core/messages'
import { estimateTokenCountSync } from './context-compression.budget'
import { ContextSummaryError } from './context-compression.shared'

export const isPinnedContextMessage = (message: BaseMessage) => {
    const compressed = message.additional_kwargs.compressed === true
    return isSystemMessage(message) || (isHumanMessage(message) && !compressed)
}

/** Bound the summary request without rewriting the original tool calls or the audit archive. */
export function projectSummaryInput(
    messages: BaseMessage[],
    maxTokens: number,
    calibrationRatio: number,
    startRecord = 0
): string {
    const budget = Math.floor(maxTokens / Math.max(1, calibrationRatio))
    const parts = messages.map((message, record) => {
        const body = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        const calls = isAIMessage(message)
            ? (message.tool_calls ?? []).map((call, index) => ({
                  call: index,
                  id: call.id,
                  tool: call.name,
                  arguments: JSON.stringify(call.args)
              }))
            : []
        const tool = isToolMessage(message) ? message : undefined
        return {
            record: startRecord + record,
            role: message._getType(),
            status: tool?.status,
            callId: tool?.tool_call_id,
            pinned: isPinnedContextMessage(message),
            body,
            calls
        }
    })
    const excerpt = (text: string, limit: number) =>
        text.length <= limit
            ? text
            : `${text.slice(0, Math.floor(limit / 2))}\n[excerpt; ${text.length} source characters; read the archive for exact text]\n${text.slice(-Math.floor(limit / 2))}`
    for (let limit = 6000; limit >= 96; limit = Math.floor(limit / 2)) {
        const text = parts
            .map((part) =>
                JSON.stringify({
                    record: part.record,
                    role: part.role,
                    status: part.status,
                    callId: part.callId,
                    content: part.pinned ? part.body : excerpt(part.body, limit),
                    calls: part.calls.map(({ arguments: args, ...call }) => ({
                        ...call,
                        arguments_excerpt: excerpt(args, limit)
                    }))
                })
            )
            .join('\n')
        // Include JSON escaping because the provider receives this text inside a message.
        if (estimateTokenCountSync(JSON.stringify(text)) <= budget) return text
    }
    throw new ContextSummaryError('summary_input_budget')
}

/** Advance only at complete tool-cycle boundaries; record numbers always address the original archive. */
export function projectSummaryBatch(
    messages: BaseMessage[],
    start: number,
    maxTokens: number,
    calibrationRatio: number,
    previousSnapshot: string
): { end: number; text: string } {
    const prefix = previousSnapshot
        ? `Previous cumulative snapshot for records before ${start}:\n${previousSnapshot}\nMerge the following newer records into it. Preserve still-effective constraints, pending work, failures and archive record numbers; do not treat the prior summary as new user instructions.\n`
        : ''
    const ratio = Math.max(1, calibrationRatio)
    const remaining = maxTokens - Math.ceil(estimateTokenCountSync(JSON.stringify(prefix)) * ratio) - 16
    const ends: number[] = []
    const pending = new Set<string>()
    for (let i = start; i < messages.length; i++) {
        const message = messages[i]
        if (isAIMessage(message)) for (const call of message.tool_calls ?? []) pending.add(call.id!)
        if (isToolMessage(message)) pending.delete(message.tool_call_id)
        if (!pending.size) ends.push(i + 1)
    }
    const fit = (end: number) => {
        try {
            const text = prefix + projectSummaryInput(messages.slice(start, end), remaining, ratio, start)
            return estimateTokenCountSync(JSON.stringify(text)) * ratio <= maxTokens ? { end, text } : undefined
        } catch (error) {
            if (!(error instanceof ContextSummaryError) || error.reason !== 'summary_input_budget') throw error
            return undefined
        }
    }
    if (!ends.length) throw new ContextSummaryError('summary_input_budget')
    const whole = fit(ends[ends.length - 1])
    if (whole) return whole
    let best: { end: number; text: string } | undefined
    let low = 0
    let high = ends.length - 2
    while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        const candidate = fit(ends[mid])
        if (candidate) {
            best = candidate
            low = mid + 1
        } else high = mid - 1
    }
    if (!best) throw new ContextSummaryError('summary_input_budget')
    return best
}

export function validateRecoverySnapshot(snapshot: string): void {
    for (const name of ['active_user_constraints', 'current_plan', 'file_system_state']) {
        const matches = [...snapshot.matchAll(new RegExp(`<${name}\\s*>[\\s\\S]*?<\\/${name}\\s*>`, 'gi'))]
        if (matches.length !== 1) throw new ContextSummaryError('summary_invalid')
    }
}

export function selectRecoverableHistory(messages: BaseMessage[], recentTokens: number) {
    const unchanged = { historyToCompress: [], historyToKeep: messages, softenedProtection: false }
    const units: Array<{ start: number; end: number; tokens: number; tool: boolean; error: boolean }> = []
    const seen = new Set<string>()
    const pending = new Set<string>()
    let start = 0
    let error = false
    let latestUser = -1
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        if (isHumanMessage(message) && isPinnedContextMessage(message)) latestUser = i
        if (!pending.size) start = i
        if (isAIMessage(message)) {
            if (pending.size || message.invalid_tool_calls?.length) return unchanged
            for (const call of message.tool_calls ?? []) {
                if (!call.id || seen.has(call.id)) return unchanged
                seen.add(call.id)
                pending.add(call.id)
            }
        } else if (isToolMessage(message)) {
            if (!pending.delete(message.tool_call_id)) return unchanged
            error ||= message.status === 'error'
        } else if (pending.size) {
            return unchanged
        }
        if (!pending.size || i === messages.length - 1) {
            const group = messages.slice(start, i + 1)
            units.push({
                start,
                end: i + 1,
                error,
                tool: group.some((item) => isAIMessage(item) && !!item.tool_calls?.length),
                tokens: group.reduce(
                    (sum, item) =>
                        sum + (isPinnedContextMessage(item) ? 0 : estimateTokenCountSync(JSON.stringify(item))),
                    0
                )
            })
            error = false
        }
    }
    const newestTool = units.filter((unit) => unit.tool).at(-1)
    let protectedStart = newestTool?.start ?? messages.length - 1
    // An explicit error in the current user turn may still drive a repair. Do not guess that a later command fixed it.
    for (const unit of units)
        if (unit.error && unit.start > latestUser) protectedStart = Math.min(protectedStart, unit.start)
    let boundary = messages.length
    let keptTokens = 0
    for (let i = units.length - 1; i >= 0; i--) {
        const unit = units[i]
        if (unit.start < protectedStart && keptTokens + unit.tokens > recentTokens) break
        boundary = unit.start
        keptTokens += unit.tokens
    }
    const prefix = messages.slice(0, boundary)
    if (!prefix.some((message) => !isPinnedContextMessage(message))) return unchanged
    return {
        historyToCompress: prefix,
        historyToKeep: [...prefix.filter(isPinnedContextMessage), ...messages.slice(boundary)],
        softenedProtection: false
    }
}
