import { AIMessageChunk, BaseMessage, isAIMessage } from '@langchain/core/messages'
import { ILLMUsage, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpException,
    HttpStatus,
    NotFoundException,
    Post,
    Req,
    Res
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Request, Response } from 'express'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Public } from '@xpert-ai/server-core'
import {
    ModelGatewayRequestLimitException,
    ModelGatewayService,
    ModelGatewayUsage,
    MODEL_GATEWAY_UPSTREAM_TIMEOUT_MS
} from './model-gateway.service'
import {
    assertRequestCapabilities,
    bindOpenAIRequest,
    messageText,
    parseOpenAIChatRequest,
    responseToolCalls,
    responseUsage,
    toLangChainMessages
} from './openai-adapter'
import { modelGatewayMessage } from './model-gateway.i18n'

@ApiTags('OpenAI-compatible model gateway')
@Public()
@Controller('openai/v1')
export class ModelGatewayOpenAIController {
    constructor(private readonly service: ModelGatewayService) {}

    @Get('models')
    async models(@Req() request: Request) {
        try {
            const identity = await this.service.authenticate(request.headers.authorization)
            const items = await this.service.listAccessiblePublications(identity)
            return {
                object: 'list',
                data: items.map(({ publication }) => ({
                    id: publication.externalModelId,
                    object: 'model',
                    created: Math.floor(new Date(publication.createdAt).getTime() / 1000),
                    owned_by: 'xpert'
                }))
            }
        } catch (error) {
            throw this.openAIError(error)
        }
    }

    @Post('chat/completions')
    async chat(@Req() request: Request, @Res() response: Response, @Body() body: unknown) {
        let call: Awaited<ReturnType<ModelGatewayService['startCall']>> | null = null
        let resolution: Awaited<ReturnType<ModelGatewayService['requireCallablePublication']>>['resolution'] | null =
            null
        let providerUsage: ILLMUsage | null = null
        const execution = this.createExecutionSignal(request, response)
        try {
            const parsed = parseOpenAIChatRequest(body)
            const identity = await this.service.authenticate(request.headers.authorization)
            const callable = await this.service.requireCallablePublication(identity, parsed.model)
            resolution = callable.resolution
            assertRequestCapabilities(parsed, callable.publication.capabilities)
            const messages = toLangChainMessages(parsed.messages)
            call = await this.service.startCall({
                identity,
                publication: callable.publication,
                resolution,
                requestBody: body
            })
            const model = await this.service.createChatModel(callable.publication, resolution, (usage) => {
                providerUsage = usage
            })
            const runnable = bindOpenAIRequest(model, parsed)
            if (parsed.stream) {
                return this.streamChat({
                    response,
                    parsed,
                    messages,
                    runnable,
                    call,
                    resolution,
                    signal: execution.signal,
                    getProviderUsage: () => providerUsage
                })
            }
            const raw = await runnable.invoke(messages, { signal: execution.signal })
            if (!isAIMessage(raw)) {
                throw new BadRequestException(
                    modelGatewayMessage(
                        'ModelGatewayUpstreamAssistantExpected',
                        'The upstream model did not return an assistant message.'
                    )
                )
            }
            const text = messageText(raw)
            const toolCalls = responseToolCalls(raw)
            const usage = responseUsage(messages, text, providerUsage, raw)
            const payload = {
                id: `chatcmpl-${call.requestId}`,
                object: 'chat.completion',
                created: Math.floor(call.startedAt.getTime() / 1000),
                model: parsed.model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: text || null,
                            ...(toolCalls.length ? { tool_calls: toolCalls } : {})
                        },
                        finish_reason: toolCalls.length ? 'tool_calls' : 'stop'
                    }
                ],
                usage: this.openAIUsage(usage)
            }
            await this.settleCall({
                call,
                resolution,
                usage,
                responseBody: payload
            })
            return response.json(payload)
        } catch (error) {
            if (call && resolution) {
                await this.finishFailedCall(call, resolution, providerUsage, error)
            }
            this.applyRetryAfter(response, error)
            if (response.destroyed || response.writableEnded) {
                return
            }
            const openAIError = this.openAIError(error)
            return response.status(openAIError.getStatus()).json(openAIError.getResponse())
        } finally {
            execution.cleanup()
        }
    }

    private async streamChat(input: {
        response: Response
        parsed: ReturnType<typeof parseOpenAIChatRequest>
        messages: BaseMessage[]
        runnable: ReturnType<typeof bindOpenAIRequest>
        call: NonNullable<Awaited<ReturnType<ModelGatewayService['startCall']>>>
        resolution: NonNullable<Awaited<ReturnType<ModelGatewayService['requireCallablePublication']>>['resolution']>
        signal: AbortSignal
        getProviderUsage: () => ILLMUsage | null
    }) {
        input.response.status(200)
        input.response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        input.response.setHeader('Cache-Control', 'no-cache, no-transform')
        input.response.setHeader('Connection', 'keep-alive')
        input.response.flushHeaders()

        const completionId = `chatcmpl-${input.call.requestId}`
        const created = Math.floor(input.call.startedAt.getTime() / 1000)
        this.writeSse(input.response, {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: input.parsed.model,
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
        })
        let text = ''
        let lastChunk: AIMessageChunk | null = null
        let hasToolCalls = false
        try {
            const stream = await input.runnable.stream(input.messages, { signal: input.signal })
            for await (const raw of stream) {
                if (!(raw instanceof AIMessageChunk)) {
                    continue
                }
                lastChunk = raw
                const content = messageText(raw)
                text += content
                const toolCallChunks = (raw.tool_call_chunks ?? []).map((toolCall, index) => ({
                    index: toolCall.index ?? index,
                    ...(toolCall.id ? { id: toolCall.id } : {}),
                    type: 'function',
                    function: {
                        ...(toolCall.name ? { name: toolCall.name } : {}),
                        arguments:
                            typeof toolCall.args === 'string'
                                ? toolCall.args
                                : toolCall.args
                                  ? JSON.stringify(toolCall.args)
                                  : ''
                    }
                }))
                hasToolCalls ||= toolCallChunks.length > 0
                if (content || toolCallChunks.length) {
                    this.writeSse(input.response, {
                        id: completionId,
                        object: 'chat.completion.chunk',
                        created,
                        model: input.parsed.model,
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    ...(content ? { content } : {}),
                                    ...(toolCallChunks.length ? { tool_calls: toolCallChunks } : {})
                                },
                                finish_reason: null
                            }
                        ]
                    })
                }
            }
            const usage = responseUsage(input.messages, text, input.getProviderUsage(), lastChunk ?? undefined)
            this.writeSse(input.response, {
                id: completionId,
                object: 'chat.completion.chunk',
                created,
                model: input.parsed.model,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: hasToolCalls ? 'tool_calls' : 'stop'
                    }
                ]
            })
            if (input.parsed.streamIncludeUsage) {
                this.writeSse(input.response, {
                    id: completionId,
                    object: 'chat.completion.chunk',
                    created,
                    model: input.parsed.model,
                    choices: [],
                    usage: this.openAIUsage(usage)
                })
            }
            await this.settleCall({
                call: input.call,
                resolution: input.resolution,
                usage,
                responseBody: { content: text, finish_reason: hasToolCalls ? 'tool_calls' : 'stop' }
            })
            if (!input.response.destroyed && !input.response.writableEnded) {
                input.response.write('data: [DONE]\n\n')
                input.response.end()
            }
        } catch (error) {
            const usage = responseUsage(input.messages, text, input.getProviderUsage(), lastChunk ?? undefined)
            await this.settleCall({
                call: input.call,
                resolution: input.resolution,
                usage,
                error
            })
            this.writeSse(input.response, this.openAIError(error).getResponse())
            if (!input.response.destroyed && !input.response.writableEnded) {
                input.response.write('data: [DONE]\n\n')
                input.response.end()
            }
        }
    }

    private async finishFailedCall(
        call: Awaited<ReturnType<ModelGatewayService['startCall']>>,
        resolution: Awaited<ReturnType<ModelGatewayService['requireCallablePublication']>>['resolution'],
        providerUsage: ILLMUsage | null,
        error: unknown
    ) {
        const usage: ModelGatewayUsage = {
            inputTokens: providerUsage?.promptTokens ?? 0,
            outputTokens: providerUsage?.completionTokens ?? 0,
            totalTokens: providerUsage?.totalTokens ?? 0,
            source: providerUsage ? ModelGatewayUsageSourceEnum.Provider : ModelGatewayUsageSourceEnum.None,
            priceAmount: providerUsage?.totalPrice,
            priceCurrency: providerUsage?.currency
        }
        await this.settleCall({ call, resolution, usage, error })
    }

    private async settleCall(input: {
        call: Awaited<ReturnType<ModelGatewayService['startCall']>>
        resolution: Awaited<ReturnType<ModelGatewayService['requireCallablePublication']>>['resolution']
        usage: ModelGatewayUsage
        responseBody?: unknown
        error?: unknown
    }) {
        try {
            await this.service.finishCall(input)
            return
        } catch {
            try {
                await this.service.finishCall(input)
                return
            } catch (retryError) {
                await this.service.recordSettlementFailure(input.call, input.usage, retryError, {
                    error: input.error,
                    responseBody: input.responseBody
                })
            }
        }
    }

    private openAIUsage(usage: ModelGatewayUsage) {
        return {
            prompt_tokens: usage.inputTokens,
            completion_tokens: usage.outputTokens,
            total_tokens: usage.totalTokens
        }
    }

    private writeSse(response: Response, payload: unknown) {
        if (!response.destroyed && !response.writableEnded) {
            response.write(`data: ${JSON.stringify(payload)}\n\n`)
        }
    }

    private applyRetryAfter(response: Response, error: unknown) {
        if (error instanceof ModelGatewayRequestLimitException) {
            response.setHeader('Retry-After', String(error.retryAfterSeconds))
        }
    }

    private createExecutionSignal(request: Request, response: Response) {
        const controller = new AbortController()
        const abortForDisconnect = () => {
            if (!response.writableEnded && !controller.signal.aborted) {
                controller.abort(
                    new Error(
                        modelGatewayMessage(
                            'ModelGatewayClientDisconnected',
                            'The client disconnected before the model call completed.'
                        )
                    )
                )
            }
        }
        request.once('aborted', abortForDisconnect)
        response.once('close', abortForDisconnect)
        const timeout = setTimeout(() => {
            if (!controller.signal.aborted) {
                controller.abort(
                    new Error(
                        modelGatewayMessage(
                            'ModelGatewayRequestTimedOut',
                            'The upstream model call exceeded the gateway timeout.'
                        )
                    )
                )
            }
        }, MODEL_GATEWAY_UPSTREAM_TIMEOUT_MS)
        timeout.unref()
        return {
            signal: controller.signal,
            cleanup: () => {
                clearTimeout(timeout)
                request.off('aborted', abortForDisconnect)
                response.off('close', abortForDisconnect)
            }
        }
    }

    private openAIError(error: unknown) {
        const status =
            error instanceof HttpException
                ? error.getStatus()
                : error instanceof NotFoundException
                  ? HttpStatus.NOT_FOUND
                  : HttpStatus.BAD_GATEWAY
        const requestLimited = error instanceof ModelGatewayRequestLimitException
        const type =
            status === HttpStatus.UNAUTHORIZED
                ? 'authentication_error'
                : status === HttpStatus.FORBIDDEN
                  ? 'permission_error'
                  : requestLimited
                    ? 'rate_limit_error'
                    : status === HttpStatus.NOT_FOUND
                      ? 'invalid_request_error'
                      : status >= 500
                        ? 'upstream_error'
                        : 'invalid_request_error'
        return new HttpException(
            {
                error: {
                    message: getErrorMessage(error),
                    type,
                    param: null,
                    code: requestLimited
                        ? error.openAICode
                        : status === HttpStatus.TOO_MANY_REQUESTS
                          ? 'insufficient_quota'
                          : null
                }
            },
            status
        )
    }
}
