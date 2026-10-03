import { z } from 'zod/v3'
import { ModelExecutionChatService } from './execution-chat.service'
import { parseChatBridgeRequest } from './execution-chat-bridge-request'
import { ChatBridgeWriter } from './execution-chat-bridge-writer'
import { chatBridgeProtocol } from './execution-tool-model'
import { Body, Controller, HttpException, Post, Req, Res } from '@nestjs/common'
import { Public } from '@xpert-ai/server-core'
import { ILLMUsage, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import type { NativeModelProtocol } from '@xpert-ai/plugin-sdk'
import type { Request, Response } from 'express'
import { once } from 'node:events'
import { ModelExecutionGrantService } from './execution-grant.service'
import { ModelExecutionPolicyService } from './execution-policy'
import { ModelExecutionAdmissionService } from './execution-admission.service'
import { ModelExecutionMeteringService } from './execution-metering.service'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'
import { ModelExecutionNativeProviderService } from './execution-native-provider.service'
import {
    NativeStreamUsage,
    assertNativeResponse,
    nativeFrames,
    parseNativeRequest,
    readNativeUsage
} from './execution-native-protocol'
import { runWithCapturedRequestContext } from '../shared/request-context'
import { executionError } from './execution-errors'

@Public()
@Controller('model-execution')
export class ModelExecutionNativeController {
    constructor(
        private readonly grants: ModelExecutionGrantService,
        private readonly policies: ModelExecutionPolicyService,
        private readonly admission: ModelExecutionAdmissionService,
        private readonly metering: ModelExecutionMeteringService,
        private readonly assistants: AssistantExecutionPolicyService,
        private readonly providers: ModelExecutionNativeProviderService,
        private readonly chatExecution: ModelExecutionChatService
    ) {}
    @Post('openai/v1/responses')
    responses(@Req() request: Request, @Res() response: Response, @Body() body: unknown) {
        return this.generate('openai_responses', request, response, body)
    }
    @Post('anthropic/v1/messages')
    messages(@Req() request: Request, @Res() response: Response, @Body() body: unknown) {
        return this.generate('anthropic_messages', request, response, body)
    }
    private async generate(protocol: NativeModelProtocol, request: Request, response: Response, body: unknown) {
        const abort = new AbortController()
        const disconnect = () => {
            if (!response.writableEnded) abort.abort()
        }
        request.once('aborted', disconnect)
        response.once('close', disconnect)
        let timer: ReturnType<typeof setTimeout>
        let stopWatching: (() => void) | undefined
        try {
            const envelopeResult = z.object({ model: z.string().min(1) }).safeParse(body)
            if (!envelopeResult.success) throw executionError('Invalid')
            const envelope = envelopeResult.data
            const authorization =
                request.headers.authorization ??
                (typeof request.headers['x-api-key'] === 'string'
                    ? `Bearer ${request.headers['x-api-key']}`
                    : undefined)
            const identity = await this.grants.authenticate(authorization),
                { grant } = identity
            const policy = await this.policies.require(grant.tenantId)
            stopWatching = this.grants.watch?.(grant, abort)
            const id = envelope.model === 'assistant-default' ? grant.defaultModelId : envelope.model
            const model = identity.models.find((item) => item.id === id)
            if (!model) throw executionError('Model')
            if (!model.protocols.includes(protocol) && model.protocols.includes(chatBridgeProtocol[protocol])) {
                if (!policy.chatBridgeProtocols?.includes(protocol)) throw executionError('Unavailable')
                const { parsed, customTools, toolNames } = parseChatBridgeRequest(body, protocol)
                timer = setTimeout(
                    () => abort.abort(),
                    Math.max(1, Math.min(600000, grant.absoluteExpiresAt.getTime() - Date.now()))
                )
                timer.unref()
                return await this.chatExecution.execute({
                    identity,
                    model,
                    parsed,
                    protocol: chatBridgeProtocol[protocol],
                    bodyBytes: Math.max(
                        Buffer.byteLength(JSON.stringify(body), 'utf8'),
                        Buffer.byteLength(JSON.stringify(parsed), 'utf8')
                    ),
                    response,
                    abort,
                    writer: new ChatBridgeWriter(
                        response,
                        abort.signal,
                        protocol,
                        parsed.stream,
                        customTools,
                        toolNames
                    )
                })
            }
            if (!policy.nativeProtocols?.includes(protocol) || !model.protocols.includes(protocol))
                throw executionError('Unavailable')
            const parsed = parseNativeRequest(body, protocol)
            if (!model) throw executionError('Model')
            const outputKey = protocol === 'openai_responses' ? 'max_output_tokens' : 'max_tokens'
            const output = parsed[outputKey] ?? grant.limits.maxOutputTokens
            if (
                typeof output !== 'number' ||
                !Number.isSafeInteger(output) ||
                output <= 0 ||
                output > grant.limits.maxOutputTokens
            )
                throw executionError('OutputLimit')
            if (Buffer.byteLength(JSON.stringify(body), 'utf8') > grant.limits.maxInputTokens)
                throw executionError('InputLimit')
            parsed.model = model.model
            parsed[outputKey] = output
            timer = setTimeout(
                () => abort.abort(),
                Math.max(1, Math.min(600000, grant.absoluteExpiresAt.getTime() - Date.now()))
            )
            timer.unref()
            await runWithCapturedRequestContext(identity.snapshot, async () => {
                const resolution = await this.assistants.authorize(identity.actor, grant.context.xpertId, model)
                const client = await this.providers.client(grant.tenantId, model, protocol)
                const call = await this.admission.begin(grant, model, output)
                const streamUsage = new NativeStreamUsage(protocol)
                let receipt: ReturnType<typeof readNativeUsage> = null,
                    error: unknown
                try {
                    const fresh = (await this.grants.revalidate(grant)).models.find(
                        (item) => item.id === model.id && item.protocols.includes(protocol)
                    )
                    if (!fresh) throw executionError('Model')
                    if (output > grant.limits.maxOutputTokens) throw executionError('OutputLimit')
                    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > grant.limits.maxInputTokens)
                        throw executionError('InputLimit')
                    await this.assistants.authorize(identity.actor, grant.context.xpertId, fresh)
                    abort.signal.throwIfAborted()
                    await this.admission.dispatch(call, grant)
                    const headers: Record<string, string> = {}
                    for (const [key, value] of Object.entries(request.headers))
                        if (key.startsWith('anthropic-') && typeof value === 'string' && value.length <= 4096)
                            headers[key] = value
                    const upstream = await client.generate(parsed, headers, abort.signal)
                    if (!upstream.ok || !upstream.body) {
                        await upstream.body?.cancel()
                        throw executionError('Unavailable')
                    }
                    const providerRequestId = upstream.headers.get('x-request-id') ?? upstream.headers.get('request-id')
                    if (parsed.stream) {
                        if (!upstream.headers.get('content-type')?.includes('text/event-stream'))
                            throw executionError('Unavailable')
                        response.status(200).setHeader('content-type', 'text/event-stream; charset=utf-8')
                        response.setHeader('cache-control', 'no-cache, no-transform')
                        for await (const frame of nativeFrames(upstream.body)) {
                            if (frame.value !== undefined) streamUsage.accept(frame.value)
                            if (streamUsage.failed) throw executionError('Unavailable')
                            if (!response.write(frame.raw)) await once(response, 'drain', { signal: abort.signal })
                        }
                        if (!streamUsage.ended) throw executionError('Unavailable')
                        receipt = streamUsage.receipt
                    } else {
                        const reader = upstream.body.getReader()
                        const chunks: Uint8Array[] = []
                        let size = 0
                        try {
                            for (;;) {
                                const { value, done } = await reader.read()
                                if (done) break
                                size += value.byteLength
                                if (size > 16 * 1024 * 1024) throw executionError('Invalid')
                                chunks.push(value)
                            }
                        } finally {
                            await reader.cancel().catch(() => undefined)
                            reader.releaseLock()
                        }
                        const raw = Buffer.concat(chunks).toString('utf8'),
                            value: unknown = JSON.parse(raw)
                        receipt = readNativeUsage(value, protocol)
                        assertNativeResponse(value, protocol)
                        response.status(200).setHeader('content-type', 'application/json')
                        response.write(raw)
                    }
                    if (receipt && providerRequestId) receipt.providerRequestId = providerRequestId.slice(0, 256)
                } catch (caught) {
                    error = caught
                    receipt ??= streamUsage.receipt
                }
                const tokens = receipt?.usage
                let price: ILLMUsage | null = null
                if (tokens) {
                    try {
                        price = client.priceUsage(tokens, receipt.pricingContext)
                    } catch {
                        /* Persist the actual token fact as unpriced if the price catalog is unavailable. */
                    }
                }
                await this.metering.finish({
                    call,
                    grant,
                    model,
                    resolution,
                    error,
                    providerUsage: price,
                    providerRequestId: receipt?.providerRequestId,
                    usage: {
                        inputTokens: tokens?.promptTokens ?? 0,
                        outputTokens: tokens?.completionTokens ?? 0,
                        totalTokens: tokens?.totalTokens ?? 0,
                        source: tokens ? ModelGatewayUsageSourceEnum.Provider : ModelGatewayUsageSourceEnum.None,
                        cacheReadInputTokens: tokens?.cacheReadInputTokens,
                        cacheWriteInputTokens: tokens?.cacheWriteInputTokens,
                        reasoningTokens: tokens?.reasoningTokens,
                        priceAmount: price?.pricingStatus === 'unpriced' ? null : price?.totalPrice,
                        priceCurrency: price?.currency
                    }
                })
                if (error) throw error
                response.end()
            })
        } catch (error) {
            const status = error instanceof HttpException ? error.getStatus() : 502
            if (!response.headersSent && !response.destroyed)
                response.status(status).json({
                    type: 'error',
                    error: {
                        type: status === 429 ? 'rate_limit_error' : 'invalid_request_error',
                        message:
                            error instanceof HttpException && status < 500
                                ? error.message
                                : executionError('Unavailable').message
                    }
                })
            else if (!response.destroyed && !response.writableEnded) response.destroy()
        } finally {
            stopWatching?.()
            clearTimeout(timer)
            request.off('aborted', disconnect)
            response.off('close', disconnect)
            abort.abort()
        }
    }
}
