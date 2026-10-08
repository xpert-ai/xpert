import { once } from 'node:events'
import type { Response } from 'express'
import { ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import type { NativeModelProtocol } from '@xpert-ai/plugin-sdk'
import type { GatewayChatBase, GatewayChatToolDelta, GatewayChatWriter } from '../model-gateway/chat-writer'
import type { OpenAIResponseToolCall } from '../model-gateway/openai-adapter'
import { executionError } from './execution-errors'
import { z } from 'zod/v3'
import type { ChatBridgeToolName } from './execution-chat-bridge-request'

/** The writer has no provider access or billing callbacks. One bounded output is formatted once. */
export class ChatBridgeWriter implements GatewayChatWriter {
    private base: GatewayChatBase
    private sequence = 0
    private size = 0
    private textStarted = false
    private tools = new Map<number, OpenAIResponseToolCall>()
    constructor(
        private readonly response: Response,
        private readonly signal: AbortSignal,
        private readonly protocol: NativeModelProtocol,
        private readonly stream: boolean,
        private readonly customTools: Set<string>,
        private readonly toolNames = new Map<string, ChatBridgeToolName>()
    ) {}
    async start(base: GatewayChatBase) {
        this.base = base
        this.response.status(200).setHeader('content-type', 'text/event-stream; charset=utf-8')
        this.response.setHeader('cache-control', 'no-cache, no-transform')
        this.response.flushHeaders()
        if (this.protocol === 'openai_responses') {
            await this.event('response.created', { response: this.responsesEnvelope([], 'in_progress', null) })
            await this.event('response.in_progress', { response: this.responsesEnvelope([], 'in_progress', null) })
        } else
            await this.event('message_start', {
                message: this.messagesEnvelope([], null, { input_tokens: 0, output_tokens: 0 })
            })
    }
    async delta(text: string, tools: GatewayChatToolDelta[]) {
        this.size +=
            Buffer.byteLength(text) +
            tools.reduce((n, t) => n + Buffer.byteLength(t.function.arguments) + (t.function.name?.length ?? 0), 0)
        if (this.size > 16 * 1024 * 1024) throw executionError('Unavailable')
        if (text) {
            if (!this.textStarted) {
                this.textStarted = true
                if (this.protocol === 'openai_responses') {
                    await this.event('response.output_item.added', {
                        output_index: 0,
                        item: this.textItem('', 'in_progress')
                    })
                    await this.event('response.content_part.added', {
                        item_id: this.textId,
                        output_index: 0,
                        content_index: 0,
                        part: { type: 'output_text', text: '', annotations: [] }
                    })
                } else await this.event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
            }
            if (this.protocol === 'openai_responses')
                await this.event('response.output_text.delta', {
                    item_id: this.textId,
                    output_index: 0,
                    content_index: 0,
                    delta: text,
                    logprobs: []
                })
            else await this.event('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
        }
        for (const delta of tools) {
            if (!Number.isSafeInteger(delta.index) || delta.index < 0 || delta.index > 127)
                throw executionError('Unavailable')
            const current = this.tools.get(delta.index) ?? {
                id: '',
                type: 'function',
                function: { name: '', arguments: '' }
            }
            if (delta.id) {
                if (current.id && current.id !== delta.id) throw executionError('Unavailable')
                current.id = delta.id
            }
            current.function.name += delta.function.name ?? ''
            current.function.arguments += delta.function.arguments
            this.tools.set(delta.index, current)
        }
    }
    async complete(input: Parameters<GatewayChatWriter['complete']>[0]) {
        this.base = input.base
        if (Buffer.byteLength(input.text) + Buffer.byteLength(JSON.stringify(input.tools ?? [])) > 16 * 1024 * 1024)
            throw executionError('Unavailable')
        const tools = input.tools ?? [...this.tools.entries()].sort(([a], [b]) => a - b).map(([, value]) => value)
        if (tools.some((t) => !t.id || !t.function.name)) throw executionError('Unavailable')
        // Never represent an estimate as provider usage in a translated protocol.
        if (input.usage.source !== ModelGatewayUsageSourceEnum.Provider) throw executionError('Unavailable')
        if (this.protocol === 'openai_responses') await this.completeResponses(input, tools)
        else await this.completeMessages(input, tools)
        if (!this.response.writableEnded && !this.response.destroyed) this.response.end()
    }
    async fail() {
        if (this.response.destroyed || this.response.writableEnded) return
        await this.event('error', { error: { type: 'api_error', message: executionError('Unavailable').message } })
        this.response.end()
    }
    private get textId() {
        return `msg_${this.base.id}`
    }
    private textItem(text: string, status = 'completed') {
        return {
            id: this.textId,
            type: 'message',
            role: 'assistant',
            status,
            content: [{ type: 'output_text', text, annotations: [], logprobs: [] }]
        }
    }
    private responsesEnvelope(output: object[], status: string, usage: object | null) {
        return {
            id: `resp_${this.base.id}`,
            object: 'response',
            created_at: this.base.created,
            status,
            model: this.base.model,
            output,
            usage,
            error: null,
            incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
            store: false
        }
    }
    private messagesEnvelope(content: object[], reason: string | null, usage: object) {
        return {
            id: `msg_${this.base.id}`,
            type: 'message',
            role: 'assistant',
            model: this.base.model,
            content,
            stop_reason: reason,
            stop_sequence: null,
            usage
        }
    }
    private async completeResponses(
        input: Parameters<GatewayChatWriter['complete']>[0],
        tools: OpenAIResponseToolCall[]
    ) {
        const output: object[] = input.text ? [this.textItem(input.text)] : []
        if (this.stream && this.textStarted) {
            await this.event('response.output_text.done', {
                item_id: this.textId,
                output_index: 0,
                content_index: 0,
                text: input.text,
                logprobs: []
            })
            await this.event('response.content_part.done', {
                item_id: this.textId,
                output_index: 0,
                content_index: 0,
                part: this.textItem(input.text).content[0]
            })
            await this.event('response.output_item.done', { output_index: 0, item: this.textItem(input.text) })
        }
        for (const tool of tools) {
            const index = output.length,
                id = `fc_${tool.id}`,
                custom = this.customTools.has(tool.function.name)
            const value = custom
                ? z.object({ input: z.string() }).strict().parse(JSON.parse(tool.function.arguments)).input
                : tool.function.arguments
            const item = {
                id,
                type: custom ? 'custom_tool_call' : 'function_call',
                call_id: tool.id,
                ...(this.toolNames.get(tool.function.name) ?? { name: tool.function.name }),
                status: 'completed',
                ...(custom ? { input: value } : { arguments: value })
            }
            output.push(item)
            if (this.stream) {
                await this.event('response.output_item.added', {
                    output_index: index,
                    item: { ...item, status: 'in_progress', ...(custom ? { input: '' } : { arguments: '' }) }
                })
                const prefix = custom ? 'response.custom_tool_call_input' : 'response.function_call_arguments'
                await this.event(`${prefix}.delta`, { item_id: id, output_index: index, delta: value })
                await this.event(`${prefix}.done`, {
                    item_id: id,
                    output_index: index,
                    ...(custom ? { input: value } : { arguments: value })
                })
                await this.event('response.output_item.done', { output_index: index, item })
            }
        }
        const usage = {
            input_tokens: input.usage.inputTokens,
            output_tokens: input.usage.outputTokens,
            total_tokens: input.usage.totalTokens,
            input_tokens_details: { cached_tokens: input.usage.cacheReadInputTokens ?? 0 },
            output_tokens_details: { reasoning_tokens: input.usage.reasoningTokens ?? 0 }
        }
        const status = input.reason === 'length' ? 'incomplete' : 'completed'
        const envelope = this.responsesEnvelope(output, status, usage)
        if (this.stream) await this.event(`response.${status}`, { response: envelope })
        else this.response.status(200).json(envelope)
    }
    private async completeMessages(
        input: Parameters<GatewayChatWriter['complete']>[0],
        tools: OpenAIResponseToolCall[]
    ) {
        const content: object[] = input.text ? [{ type: 'text', text: input.text }] : []
        if (this.stream && this.textStarted) await this.event('content_block_stop', { index: 0 })
        for (const tool of tools) {
            const args = z.object({}).catchall(z.unknown()).parse(JSON.parse(tool.function.arguments))
            const block = { type: 'tool_use', id: tool.id, name: tool.function.name, input: args }
            const index = content.length
            content.push(block)
            if (this.stream) {
                await this.event('content_block_start', { index, content_block: { ...block, input: {} } })
                await this.event('content_block_delta', {
                    index,
                    delta: { type: 'input_json_delta', partial_json: tool.function.arguments }
                })
                await this.event('content_block_stop', { index })
            }
        }
        const reason =
            input.reason === 'length'
                ? 'max_tokens'
                : tools.length
                  ? 'tool_use'
                  : input.reason === 'content_filter'
                    ? 'refusal'
                    : 'end_turn'
        const usage = {
            input_tokens:
                input.usage.inputTokens -
                (input.usage.cacheReadInputTokens ?? 0) -
                (input.usage.cacheWriteInputTokens ?? 0),
            output_tokens: input.usage.outputTokens,
            cache_read_input_tokens: input.usage.cacheReadInputTokens ?? 0,
            cache_creation_input_tokens: input.usage.cacheWriteInputTokens ?? 0
        }
        if (this.stream) {
            await this.event('message_delta', { delta: { stop_reason: reason, stop_sequence: null }, usage })
            await this.event('message_stop', {})
        } else this.response.status(200).json(this.messagesEnvelope(content, reason, usage))
    }
    private async event(type: string, fields: object) {
        this.signal.throwIfAborted()
        if (this.response.destroyed || this.response.writableEnded) throw executionError('Unavailable')
        const payload = {
            type,
            ...(this.protocol === 'openai_responses' ? { sequence_number: this.sequence++ } : {}),
            ...fields
        }
        if (!this.response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`))
            await once(this.response, 'drain', { signal: this.signal })
    }
}
