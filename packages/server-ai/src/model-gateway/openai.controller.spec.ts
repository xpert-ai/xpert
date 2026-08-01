import { AIMessage } from '@langchain/core/messages'
import { EventEmitter } from 'node:events'
import {
    AiModelTypeEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelGatewayCallStatusEnum
} from '@xpert-ai/contracts'
import { ModelGatewayPublication } from './model-gateway-publication.entity'
import { ModelGatewayOpenAIController } from './openai.controller'
import { ModelGatewayRequestLimitException, ModelGatewayService } from './model-gateway.service'

function createResponse() {
    const response = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        setHeader: jest.fn(),
        status: jest.fn(),
        json: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        flushHeaders: jest.fn()
    })
    response.status.mockReturnValue(response)
    response.json.mockReturnValue(response)
    return response
}

function createRequest() {
    return Object.assign(new EventEmitter(), {
        headers: { authorization: 'Bearer key' }
    })
}

function callable() {
    return {
        publication: {
            id: 'publication-1',
            tenantId: 'tenant-1',
            copilotId: 'copilot-1',
            copilotModelId: 'source-model',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'source-model',
            externalModelId: 'tenant-chat',
            capabilities: []
        } as ModelGatewayPublication,
        resolution: {
            allowed: true,
            channel: ModelAccessChannelEnum.ExternalApi,
            billableUserId: 'user-1',
            copilotId: 'copilot-1',
            copilotModelId: 'source-model',
            provider: 'openai',
            modelType: AiModelTypeEnum.LLM,
            model: 'source-model',
            accessSource: ModelAccessSourceEnum.Grant,
            multiplier: 1,
            scope: ModelAccessOwnershipScopeEnum.Tenant,
            organizationId: null,
            grantId: 'grant-1'
        }
    }
}

describe('ModelGatewayOpenAIController', () => {
    it('returns an OpenAI rate-limit error and Retry-After instead of queueing', async () => {
        const service = {
            authenticate: jest.fn().mockResolvedValue({
                apiKey: { id: 'key-1', tenantId: 'tenant-1' },
                user: { id: 'user-1' }
            }),
            requireCallablePublication: jest.fn().mockResolvedValue(callable()),
            startCall: jest
                .fn()
                .mockRejectedValue(new ModelGatewayRequestLimitException('Concurrent request limit reached.', 1))
        }
        const controller = new ModelGatewayOpenAIController(service as unknown as ModelGatewayService)
        const response = createResponse()

        await controller.chat(createRequest() as never, response as never, {
            model: 'tenant-chat',
            messages: [{ role: 'user', content: 'Hello' }]
        })

        expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1')
        expect(response.status).toHaveBeenCalledWith(429)
        expect(response.json).toHaveBeenCalledWith({
            error: expect.objectContaining({
                type: 'rate_limit_error',
                code: 'rate_limit_exceeded'
            })
        })
    })

    it('returns a completed response when usage settlement fails', async () => {
        const call = {
            id: 'call-1',
            requestId: 'request-1',
            status: ModelGatewayCallStatusEnum.Started,
            startedAt: new Date('2026-07-27T00:00:00.000Z')
        }
        const invoke = jest.fn().mockResolvedValue(new AIMessage('Hello'))
        const service = {
            authenticate: jest.fn().mockResolvedValue({
                apiKey: { id: 'key-1', tenantId: 'tenant-1' },
                user: { id: 'user-1' }
            }),
            requireCallablePublication: jest.fn().mockResolvedValue(callable()),
            startCall: jest.fn().mockResolvedValue(call),
            createChatModel: jest.fn().mockResolvedValue({
                invoke
            }),
            finishCall: jest.fn().mockRejectedValue(new Error('ledger unavailable')),
            recordSettlementFailure: jest.fn().mockResolvedValue(null)
        }
        const controller = new ModelGatewayOpenAIController(service as unknown as ModelGatewayService)
        const response = createResponse()

        await controller.chat(createRequest() as never, response as never, {
            model: 'tenant-chat',
            messages: [{ role: 'user', content: 'Hello' }]
        })

        expect(service.finishCall).toHaveBeenCalledTimes(2)
        expect(invoke).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
        expect(service.recordSettlementFailure).toHaveBeenCalledWith(
            call,
            expect.objectContaining({ totalTokens: expect.any(Number) }),
            expect.any(Error),
            expect.objectContaining({
                error: undefined,
                responseBody: expect.objectContaining({ object: 'chat.completion' })
            })
        )
        expect(response.status).not.toHaveBeenCalled()
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                object: 'chat.completion',
                choices: [
                    expect.objectContaining({
                        message: expect.objectContaining({ content: 'Hello' })
                    })
                ]
            })
        )
    })
})
