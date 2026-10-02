import { executeGatewayChat } from './chat-execution'
// Invariants: client scope headers do not select the gateway's tenant or organization.
// Resolve access in the API key scope, then run the model in its publication scope.
// Preserve both host and plugin contexts through streaming and usage settlement.
import { Body, Controller, Get, HttpException, HttpStatus, NotFoundException, Post, Req, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Request, Response } from 'express'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Public } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import {
    ModelGatewayIdentity,
    ModelGatewayRequestLimitException,
    ModelGatewayService,
    ModelGatewayUsage,
    MODEL_GATEWAY_UPSTREAM_TIMEOUT_MS
} from './model-gateway.service'
import { parseOpenAIChatRequest } from './openai-adapter'
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
            const items = await this.runWithModelContext(identity, identity.apiKey.organizationId, () =>
                this.service.listAccessiblePublications(identity)
            )
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
        const execution = this.createExecutionSignal(request, response)
        try {
            const parsed = parseOpenAIChatRequest(body)
            const identity = await this.service.authenticate(request.headers.authorization)
            return await this.runWithModelContext(identity, identity.apiKey.organizationId, async () => {
                const callable = await this.service.requireCallablePublication(identity, parsed.model)
                return this.runWithModelContext(identity, callable.publication.organizationId, () =>
                    this.invokeChat({ response, parsed, body, identity, callable, signal: execution.signal })
                )
            })
        } catch (error) {
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

    private runWithModelContext<T>(
        identity: ModelGatewayIdentity,
        organizationId: string | null | undefined,
        task: () => Promise<T>
    ): Promise<T> {
        return runWithCapturedRequestContext(
            captureRequestContext({
                user: identity.user,
                tenantId: identity.apiKey.tenantId,
                organizationId: organizationId ?? null,
                language: RequestContext.getLanguageCode(),
                headers: { 'x-request-id': RequestContext.currentRequestContext()?.reqId }
            }),
            task
        )
    }

    private async invokeChat(input: {
        response: Response
        parsed: ReturnType<typeof parseOpenAIChatRequest>
        body: unknown
        identity: ModelGatewayIdentity
        callable: Awaited<ReturnType<ModelGatewayService['requireCallablePublication']>>
        signal: AbortSignal
    }) {
        const { response, parsed, body, identity, callable, signal } = input
        let call: Awaited<ReturnType<ModelGatewayService['startCall']>>
        return executeGatewayChat({
            response,
            parsed,
            signal,
            lifecycle: {
                capabilities: callable.publication.capabilities,
                begin: async () =>
                    (call = await this.service.startCall({
                        identity,
                        publication: callable.publication,
                        resolution: callable.resolution,
                        requestBody: body
                    })),
                createModel: (callback) =>
                    this.service.createChatModel(callable.publication, callable.resolution, callback),
                settle: ({ usage, responseBody, error }) =>
                    this.settleCall({ call, resolution: callable.resolution, usage, responseBody, error })
            }
        })
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
