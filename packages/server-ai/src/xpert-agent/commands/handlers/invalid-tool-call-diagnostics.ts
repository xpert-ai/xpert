import type { InvalidToolCall } from '@langchain/core/messages'
import type { TAgentExecutionMetadata } from '@xpert-ai/contracts'
import { t } from 'i18next'

const INVALID_TOOL_CALL_LOG_EVENT = 'xpert.invalid_tool_calls'
const MAX_INVALID_TOOL_CALL_ARGS_LOG_CHARS = 20_000
const MAX_INVALID_TOOL_CALL_ARGS_USER_CHARS = 4_000

export type InvalidToolCallDiagnosticsInput = {
    diagnosticId: string
    invalidToolCalls: InvalidToolCall[]
    threadId?: string
    executionId?: string
    xpertId?: string
    agentKey: string
    agentChannel: string
    model?: TAgentExecutionMetadata | null
    aiMessageId?: string
}

export type InvalidToolCallDiagnostics = {
    event: typeof INVALID_TOOL_CALL_LOG_EVENT
    diagnosticId: string
    threadId?: string
    executionId?: string
    xpertId?: string
    agentKey: string
    agentChannel: string
    model?: TAgentExecutionMetadata | null
    aiMessageId?: string
    invalidToolCalls: Array<{
        id?: string
        name?: string
        error: string
        argsPreview: string
        rawArgsLength: number
        truncated: boolean
        jsonHint?: string
    }>
}

export function createInvalidToolCallDiagnostics(input: InvalidToolCallDiagnosticsInput): InvalidToolCallDiagnostics {
    return {
        event: INVALID_TOOL_CALL_LOG_EVENT,
        diagnosticId: input.diagnosticId,
        threadId: input.threadId,
        executionId: input.executionId,
        xpertId: input.xpertId,
        agentKey: input.agentKey,
        agentChannel: input.agentChannel,
        model: input.model,
        aiMessageId: input.aiMessageId,
        invalidToolCalls: input.invalidToolCalls.map((call) => {
            const rawArgs = call.args ?? ''
            const redactedArgs = redactInvalidToolCallArgs(rawArgs)
            const truncated = redactedArgs.length > MAX_INVALID_TOOL_CALL_ARGS_LOG_CHARS
            const jsonHint = createMalformedJsonHint(rawArgs)

            return {
                id: call.id,
                name: call.name,
                error: call.error ?? 'Invalid tool call',
                argsPreview: truncated ? redactedArgs.slice(0, MAX_INVALID_TOOL_CALL_ARGS_LOG_CHARS) : redactedArgs,
                rawArgsLength: rawArgs.length,
                truncated,
                ...(jsonHint ? { jsonHint } : {})
            }
        })
    }
}

export function createInvalidToolCallErrorMessage(invalidToolCalls: InvalidToolCall[], diagnosticId: string) {
    const detail = invalidToolCalls
        .map((call) => {
            const rawArgs = call.args ?? ''
            const argsPreview = summarizeInvalidToolCallArgs(rawArgs, MAX_INVALID_TOOL_CALL_ARGS_USER_CHARS)
            const truncation = rawArgs.length > MAX_INVALID_TOOL_CALL_ARGS_USER_CHARS ? ', preview truncated' : ''
            const jsonHint = createMalformedJsonHint(rawArgs)

            return `${call.name ?? call.id ?? 'tool'}: ${call.error ?? 'Invalid tool call'} Args (${rawArgs.length} chars${truncation}): ${argsPreview}${jsonHint ? ` Hint: ${jsonHint}` : ''}`
        })
        .join('; ')
    const prefix = t('server-ai:Error.InvalidToolCalls') || 'Model returned invalid tool calls:'

    return `${prefix}${detail ? `${detail} ` : ''}(diagnosticId: ${diagnosticId})`
}

function summarizeInvalidToolCallArgs(args: string, maximum: number) {
    if (!args) return '(empty)'
    const redactedArgs = redactInvalidToolCallArgs(args)
    if (args.length <= maximum) return redactedArgs

    const parseErrorOffset = findJsonParseErrorOffset(args)
    if (parseErrorOffset !== null) {
        const separator = '\n… [redacted args preview truncated] …\n'
        const locationLabel = `Around JSON parse error at character ${parseErrorOffset}:\n`
        const edgeLength = Math.min(400, Math.floor(maximum * 0.1))
        const contextLength = Math.max(0, maximum - edgeLength * 2 - separator.length * 2 - locationLabel.length)
        const contextStart = Math.max(0, parseErrorOffset - Math.floor(contextLength / 2))
        const contextEnd = Math.min(args.length, contextStart + contextLength)
        const head = redactInvalidToolCallArgs(args.slice(0, edgeLength))
        const context = redactInvalidToolCallArgs(args.slice(contextStart, contextEnd))
        const tail = redactInvalidToolCallArgs(args.slice(-edgeLength))

        return `${head}${separator}${locationLabel}${context}${separator}${tail}`
    }

    const separator = '\n… [redacted args preview truncated; middle omitted] …\n'
    const available = Math.max(0, maximum - separator.length)
    const headLength = Math.ceil(available * 0.7)
    const tailLength = available - headLength
    return `${redactedArgs.slice(0, headLength)}${separator}${redactedArgs.slice(redactedArgs.length - tailLength)}`
}

function findJsonParseErrorOffset(args: string) {
    try {
        JSON.parse(args)
        return null
    } catch (error) {
        if (!(error instanceof Error)) return null
        const position = error.message.match(/(?:position|character)\s+(\d+)/i)
        if (position) return Math.min(Number(position[1]), args.length)

        const contextualExcerpt = error.message.match(/,\s+\.\.\.(.*?)\.\.\. is not valid JSON/i)?.[1]
        if (contextualExcerpt) {
            const candidates = [contextualExcerpt, contextualExcerpt.replace(/"$/, '')]
            for (const candidate of candidates) {
                const offset = args.indexOf(candidate)
                if (offset >= 0) {
                    const unexpectedToken = error.message.match(/Unexpected token ['"](.+?)['"]/i)?.[1]
                    const tokenOffset = unexpectedToken ? candidate.indexOf(unexpectedToken) : -1
                    return offset + (tokenOffset >= 0 ? tokenOffset : Math.floor(candidate.length / 2))
                }
            }
        }

        const lineAndColumn = error.message.match(/line\s+(\d+)\s+column\s+(\d+)/i)
        if (!lineAndColumn) return null
        const targetLine = Number(lineAndColumn[1])
        const targetColumn = Number(lineAndColumn[2])
        const lines = args.split('\n')
        if (targetLine < 1 || targetLine > lines.length) return null
        return lines.slice(0, targetLine - 1).reduce((total, line) => total + line.length + 1, 0) + targetColumn - 1
    }
}

function createMalformedJsonHint(args: string) {
    const parseErrorOffset = findJsonParseErrorOffset(args)
    if (parseErrorOffset === null) return null
    const quoteOffset = findLikelyUnescapedQuoteOffset(args, parseErrorOffset)
    if (quoteOffset === null) return null
    const fieldName = findJsonStringFieldName(args, quoteOffset)
    const fieldLabel = fieldName ? ` in JSON string field "${fieldName}"` : ''

    return `Likely unescaped ASCII double quote${fieldLabel} near character ${quoteOffset}. Escape it as \\" or use typographic quotation marks (“…” or 「…」) inside prose.`
}

function findLikelyUnescapedQuoteOffset(args: string, parseErrorOffset: number) {
    const quoteOffset = args.lastIndexOf('"', Math.max(0, parseErrorOffset))
    if (quoteOffset < 0) return null
    const nextNonWhitespaceOffset = args.slice(quoteOffset + 1).search(/\S/)
    if (nextNonWhitespaceOffset < 0) return null
    const nextCharacter = args[quoteOffset + 1 + nextNonWhitespaceOffset]

    return ',:}]'.includes(nextCharacter) ? null : quoteOffset
}

function findJsonStringFieldName(args: string, quoteOffset: number) {
    const prefix = args.slice(0, quoteOffset)
    const fieldPattern = /"([^"\\]+)"\s*:\s*"/g
    let fieldName: string | null = null
    let match: RegExpExecArray | null
    while ((match = fieldPattern.exec(prefix)) !== null) {
        fieldName = match[1]
    }
    return fieldName
}

function redactInvalidToolCallArgs(args: string) {
    return args
        .replace(
            /("(?:api[_-]?key|authorization|password|secret|token|access[_-]?token|refresh[_-]?token|client[_-]?secret)"\s*:\s*)"([^"\\]*(?:\\.[^"\\]*)*)"/gi,
            '$1"[REDACTED]"'
        )
        .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
        .replace(
            /\b(api[_-]?key|authorization|password|secret|token|access[_-]?token|refresh[_-]?token|client[_-]?secret)(\s*[=:]\s*)([^\s,;}"']+)/gi,
            '$1$2[REDACTED]'
        )
}
