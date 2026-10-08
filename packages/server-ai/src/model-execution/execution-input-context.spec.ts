import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, ModelGatewayUsageSourceEnum, type ModelExecutionModel } from '@xpert-ai/contracts'
import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'
import { captureRequestContext } from '../shared/request-context'
import type { ModelExecutionGrant } from './execution.entity'
import { executionError } from './execution-errors'
import { ModelExecutionChatService } from './execution-chat.service'
import { ModelExecutionOpenAIController } from './execution-openai.controller'
import { ModelExecutionNativeController } from './execution-native.controller'

function fixture() {
    const model = {
        id: 'selected',
        copilotId: 'copilot',
        provider: 'fixture',
        model: 'qwen3.6-plus',
        modelType: AiModelTypeEnum.LLM,
        capabilities: [],
        protocols: ['openai_chat', 'openai_responses_chat', 'anthropic_messages_chat']
    }
    const identity = {
        grant: {
            id: 'grant',
            tenantId: 'tenant',
            defaultModelId: model.id,
            // Old snapshots must not reintroduce the retired cap, even before persistence normalization.
            limits: { maxInputTokens: 1, maxOutputTokens: 100 },
            absoluteExpiresAt: new Date(Date.now() + 60000),
            context: { xpertId: 'assistant', runtimeOrganizationId: 'org', billableUserId: 'payer' }
        },
        models: [model],
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'payer' },
        snapshot: captureRequestContext({ tenantId: 'tenant', organizationId: 'org', user: { id: 'payer' } as never })
    }
    const grants = { authenticate: jest.fn(async () => identity), revalidate: jest.fn(async () => identity) }
    const admission = {
        begin: jest.fn(
            async (_grant: ModelExecutionGrant, _model: ModelExecutionModel, _output: number, _input: number) => ({
                requestId: 'call',
                startedAt: new Date()
            })
        ),
        dispatch: jest.fn()
    }
    const metering = { finish: jest.fn() }
    const invoke = jest.fn(
        async (_messages: BaseMessage[]) =>
            new AIMessage({
                content: '已核对',
                usage_metadata: { input_tokens: 40000, output_tokens: 5, total_tokens: 40005 }
            })
    )
    const runnable = { invoke, bind: jest.fn() }
    runnable.bind.mockReturnValue(runnable)
    const runtime = { createModelClient: jest.fn(async () => runnable) }
    const assistants = { authorize: jest.fn(async () => ({ billableUserId: 'payer' })) }
    const service = new ModelExecutionChatService(
        grants as never,
        admission as never,
        assistants as never,
        runtime as never,
        metering as never
    )
    const openai = new ModelExecutionOpenAIController(grants as never, service)
    const native = new ModelExecutionNativeController(
        grants as never,
        {
            require: jest.fn(async () => ({ chatBridgeProtocols: ['openai_responses', 'anthropic_messages'] }))
        } as never,
        admission as never,
        metering as never,
        assistants as never,
        {} as never,
        service
    )
    const request = Object.assign(new EventEmitter(), { headers: { authorization: 'Bearer fixture' } }) as Request
    const response = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        headersSent: false,
        status: jest.fn(),
        json: jest.fn(),
        destroy: jest.fn()
    })
    response.status.mockReturnValue(response)
    const res = response as unknown as Response
    const content = '中文代码与工具输出 function sum(a, b) { return a + b }\n'.repeat(5000)
    const run = (protocol: string, output?: number) =>
        protocol === 'chat'
            ? openai.chat(request, res, {
                  model: 'assistant-default',
                  max_tokens: output,
                  messages: [{ role: 'user', content }]
              })
            : protocol === 'responses'
              ? native.responses(request, res, {
                    model: 'assistant-default',
                    max_output_tokens: output,
                    input: content
                })
              : native.messages(request, res, {
                    model: 'assistant-default',
                    max_tokens: output ?? 100,
                    messages: [{ role: 'user', content }]
                })
    return { run, content, invoke, admission, grants, metering, response, runtime }
}

describe('model-owned input context across CLI protocols', () => {
    it.each(['chat', 'responses', 'messages'])(
        'forwards a >128KB request through %s without a platform input cap',
        async (protocol) => {
            const f = fixture()
            expect(Buffer.byteLength(f.content)).toBeGreaterThan(128000)
            await f.run(protocol)
            expect(f.invoke).toHaveBeenCalledTimes(1)
            expect(f.invoke.mock.calls[0][0][0].content).toBe(f.content)
            const reservation = f.admission.begin.mock.calls[0][3]
            expect(reservation).toBeGreaterThan(0)
            expect(reservation).toBeLessThan(Buffer.byteLength(f.content))
            expect(f.admission.dispatch).toHaveBeenCalledTimes(1)
            expect(f.metering.finish).toHaveBeenCalledWith(
                expect.objectContaining({
                    usage: expect.objectContaining({
                        source: ModelGatewayUsageSourceEnum.Provider,
                        inputTokens: 40000,
                        totalTokens: 40005
                    })
                })
            )
        }
    )
    it.each(['chat', 'responses', 'messages'])('forwards an explicit 65536 output request on %s', async (protocol) => {
        const f = fixture()
        await f.run(protocol, 65536)
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.admission.begin.mock.calls[0][2]).toBe(65536)
        expect(f.runtime.createModelClient).toHaveBeenCalledWith(
            expect.objectContaining({ options: { max_tokens: 65536, maxRetries: 0 } }),
            expect.any(Object),
            expect.any(Object)
        )
    })
    it('does not inject an output cap when the caller omits it', async () => {
        const f = fixture()
        await f.run('chat')
        expect(f.runtime.createModelClient).toHaveBeenCalledWith(
            expect.objectContaining({ options: { maxRetries: 0 } }),
            expect.any(Object),
            expect.any(Object)
        )
    })
    it.each(['chat', 'responses', 'messages'])(
        'still checks revoked authorization for %s before dispatch',
        async (protocol) => {
            const f = fixture()
            f.grants.revalidate.mockResolvedValue({ ...(await f.grants.authenticate()), models: [] })
            await f.run(protocol)
            expect(f.invoke).not.toHaveBeenCalled()
            expect(f.admission.dispatch).not.toHaveBeenCalled()
        }
    )
    it('still enforces the cumulative budget before provider access', async () => {
        const f = fixture()
        f.admission.begin.mockRejectedValue(executionError('Budget'))
        await f.run('chat')
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.response.status).toHaveBeenCalledWith(429)
    })
})
