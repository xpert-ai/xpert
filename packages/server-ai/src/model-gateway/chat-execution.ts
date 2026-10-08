// Invariants: both gateway identities share this protocol executor. The lifecycle owns
// admission and exactly-once settlement; model clients must disable their default ledger callback.
import { AIMessage, AIMessageChunk, isAIMessage, isAIMessageChunk, isBaseMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ILLMUsage, ModelFeature } from '@xpert-ai/contracts'
import { BadGatewayException } from '@nestjs/common'
import type { Response } from 'express'
import type { ModelGatewayUsage } from './model-gateway.service'
import {
    assertRequestCapabilities,
    bindOpenAIRequest,
    messageText,
    OpenAIChatRequest,
    responseToolCalls,
    responseUsage,
    toLangChainMessages
} from './openai-adapter'
import type { GatewayChatWriter, GatewayChatToolDelta } from './chat-writer'
import { modelGatewayMessage } from './model-gateway.i18n'

export interface GatewayChatLifecycle {
    capabilities: ModelFeature[]
    begin(): Promise<{ requestId: string; startedAt: Date }>
    createModel(callback: (usage: ILLMUsage) => void): Promise<BaseChatModel>
    beforeDispatch?(): Promise<void>
    settle(input: {
        usage: ModelGatewayUsage
        providerUsage: ILLMUsage | null
        responseBody?: unknown
        error?: unknown
    }): Promise<void>
}

export async function executeGatewayChat(input: {
    response: Response
    parsed: OpenAIChatRequest
    signal: AbortSignal
    lifecycle: GatewayChatLifecycle
    writer?: GatewayChatWriter
    onActivity?: () => void
}) {
    const { response, parsed, signal, lifecycle, writer } = input
    assertRequestCapabilities(parsed, lifecycle.capabilities)
    const messages = toLangChainMessages(parsed.messages)
    const call = await lifecycle.begin()
    let providerUsage: ILLMUsage | null = null
    let settled = false
    let output = ''
    let lastUsageChunk: AIMessage | AIMessageChunk | undefined
    const settle = async (error?: unknown, responseBody?: unknown) => {
        if (settled) return
        await lifecycle.settle({
            usage: responseUsage(messages, output, providerUsage, lastUsageChunk),
            providerUsage,
            error,
            responseBody
        })
        settled = true
    }
    try {
        const model = await lifecycle.createModel((usage) => {
            if (providerUsage?.type !== 'estimated' && providerUsage?.totalTokens > 0 && usage.type === 'estimated')
                return
            providerUsage = usage
        })
        const runnable = bindOpenAIRequest(model, parsed)
        await lifecycle.beforeDispatch?.()
        input.onActivity?.()
        const base = {
            id: `chatcmpl-${call.requestId}`,
            created: Math.floor(call.startedAt.getTime() / 1000),
            model: parsed.model
        }
        if (!parsed.stream) {
            const raw = await runnable.invoke(messages, { signal })
            if (!isAIMessage(raw))
                throw new BadGatewayException(
                    modelGatewayMessage(
                        'ModelGatewayUpstreamAssistantExpected',
                        'The upstream model did not return an assistant message.'
                    )
                )
            lastUsageChunk = raw
            output = messageText(raw)
            const tools = responseToolCalls(raw)
            const usage = responseUsage(messages, output, providerUsage, raw)
            const payload = {
                ...base,
                object: 'chat.completion',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: output || null,
                            ...(tools.length ? { tool_calls: tools } : {})
                        },
                        finish_reason: finishReason(raw.response_metadata, tools.length > 0)
                    }
                ],
                usage: openAIUsage(usage)
            }
            await lifecycle.settle({ usage, providerUsage, responseBody: payload })
            settled = true
            if (writer)
                return writer.complete({ base, text: output, tools, reason: payload.choices[0].finish_reason, usage })
            return response.json(payload)
        }
        if (writer) await writer.start(base)
        else {
            response.status(200)
            response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
            response.setHeader('Cache-Control', 'no-cache, no-transform')
            response.setHeader('Connection', 'keep-alive')
            response.flushHeaders()
        }
        const chunk = (delta: object, reason: string | null = null) => ({
            ...base,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta, finish_reason: reason }]
        })
        if (!writer) writeSse(response, chunk({ role: 'assistant' }))
        let hasTools = false
        let reason = 'stop'
        for await (const raw of await runnable.stream(messages, { signal })) {
            input.onActivity?.()
            if (!isBaseMessageChunk(raw) || !isAIMessageChunk(raw)) continue
            if (raw.usage_metadata) lastUsageChunk = raw
            const content = messageText(raw)
            output += content
            const toolCalls: GatewayChatToolDelta[] = (raw.tool_call_chunks ?? []).map((tool, index) => ({
                index: tool.index ?? index,
                ...(tool.id ? { id: tool.id } : {}),
                type: 'function',
                function: { ...(tool.name ? { name: tool.name } : {}), arguments: tool.args ?? '' }
            }))
            hasTools ||= toolCalls.length > 0
            reason = finishReason(raw.response_metadata, hasTools, reason)
            if (writer) await writer.delta(content, toolCalls)
            else if (content || toolCalls.length)
                writeSse(
                    response,
                    chunk({
                        ...(content ? { content } : {}),
                        ...(toolCalls.length ? { tool_calls: toolCalls } : {})
                    })
                )
        }
        const usage = responseUsage(messages, output, providerUsage, lastUsageChunk)
        if (writer) {
            await settle(undefined, { content: output, finish_reason: reason })
            await writer.complete({ base, text: output, reason, usage })
            return
        }
        writeSse(response, chunk({}, reason))
        if (parsed.streamIncludeUsage)
            writeSse(response, { ...base, object: 'chat.completion.chunk', choices: [], usage: openAIUsage(usage) })
        await settle(undefined, { content: output, finish_reason: reason })
        finishStream(response)
    } catch (error) {
        await settle(error)
        if (!response.headersSent) throw error
        if (writer) {
            await writer.fail()
            return
        }
        writeSse(response, {
            error: {
                type: 'upstream_error',
                message: modelGatewayMessage('ModelGatewayStreamFailed', 'The model stream could not be completed.'),
                code: 'stream_failed'
            }
        })
        finishStream(response)
    }
}

function finishReason(metadata: object, tools: boolean, fallback = 'stop'): string {
    if ('finish_reason' in metadata && typeof metadata.finish_reason === 'string' && metadata.finish_reason)
        return metadata.finish_reason
    return tools ? 'tool_calls' : fallback
}
function openAIUsage(usage: ModelGatewayUsage) {
    return { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.totalTokens }
}
function writeSse(response: Response, payload: unknown) {
    if (!response.destroyed && !response.writableEnded) response.write(`data: ${JSON.stringify(payload)}\n\n`)
}
function finishStream(response: Response) {
    if (!response.destroyed && !response.writableEnded) {
        response.write('data: [DONE]\n\n')
        response.end()
    }
}
