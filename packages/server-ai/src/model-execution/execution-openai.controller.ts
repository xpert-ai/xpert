import { Body, Controller, Get, HttpException, Post, Req, Res } from '@nestjs/common'
import { Public } from '@xpert-ai/server-core'
import type { Request, Response } from 'express'
import { parseOpenAIChatRequest } from '../model-gateway/openai-adapter'
import { executionError } from './execution-errors'
import { ModelExecutionGrantService } from './execution-grant.service'
import { ModelExecutionChatService } from './execution-chat.service'

@Public()
@Controller('model-execution/openai/v1')
export class ModelExecutionOpenAIController {
    constructor(
        private readonly grants: ModelExecutionGrantService,
        private readonly chatExecution: ModelExecutionChatService
    ) {}

    @Get('models')
    async models(@Req() request: Request) {
        const identity = await this.grants.authenticate(request.headers.authorization)
        return {
            object: 'list',
            data: [
                ...(identity.models.some((model) => model.id === identity.grant.defaultModelId)
                    ? [{ id: 'assistant-default', object: 'model', owned_by: 'xpert' }]
                    : []),
                ...identity.models.map((model) => ({ id: model.id, object: 'model', owned_by: 'xpert' }))
            ]
        }
    }

    @Post('chat/completions')
    async chat(@Req() request: Request, @Res() response: Response, @Body() body: unknown) {
        const abort = new AbortController()
        const disconnected = () => {
            if (!response.writableEnded) abort.abort()
        }
        request.once('aborted', disconnected)
        response.once('close', disconnected)
        let stopWatching: (() => void) | undefined
        try {
            const parsed = parseOpenAIChatRequest(body)
            // Execution protocols currently support text and client tools only.
            if (
                parsed.messages.some(
                    (message) =>
                        Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url')
                )
            )
                throw executionError('BridgeUnsupported')
            const identity = await this.grants.authenticate(request.headers.authorization)
            const { grant } = identity
            stopWatching = this.grants.watch?.(grant, abort)
            const id = parsed.model === 'assistant-default' ? grant.defaultModelId : parsed.model
            const model = identity.models.find(
                (candidate) => candidate.id === id && candidate.protocols.includes('openai_chat')
            )
            if (!model) throw executionError('Model')
            await this.chatExecution.execute({
                identity,
                model,
                protocol: 'openai_chat',
                parsed,
                response,
                abort
            })
        } catch (error) {
            if (!response.headersSent && !response.destroyed && !response.writableEnded) {
                const status = error instanceof HttpException ? error.getStatus() : 502
                const safe =
                    error instanceof HttpException && status < 500
                        ? error.message
                        : executionError('Unavailable').message
                response.status(status).json({
                    error: {
                        message: safe,
                        type: status === 429 ? 'rate_limit_error' : 'invalid_request_error',
                        code: 'model_execution_failed'
                    }
                })
            } else if (!response.destroyed && !response.writableEnded) {
                response.destroy()
            }
        } finally {
            stopWatching?.()
            request.off('aborted', disconnected)
            response.off('close', disconnected)
        }
    }
}
