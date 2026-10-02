import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'
import { AiModelTypeEnum, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelExecutionNativeController } from './execution-native.controller'
import { captureRequestContext } from '../shared/request-context'

function fixture(streaming = true) {
    const model = {
        id: 'selected',
        copilotId: 'copilot',
        providerScopeId: 'provider-org-model',
        providerOrganizationId: 'provider-org',
        provider: 'native-fixture',
        model: 'actual-model',
        modelType: AiModelTypeEnum.LLM,
        protocols: ['openai_responses', 'anthropic_messages'],
        capabilities: []
    }
    const grant = {
        id: 'grant',
        tenantId: 'tenant',
        defaultModelId: model.id,
        limits: { maxInputTokens: 10000, maxOutputTokens: 100 },
        absoluteExpiresAt: new Date(Date.now() + 60000),
        context: { xpertId: 'assistant' }
    }
    const identity = {
        grant,
        models: [model],
        actor: { userId: 'payer', tenantId: 'tenant', organizationId: 'runtime-org' },
        snapshot: captureRequestContext({
            tenantId: 'tenant',
            organizationId: 'runtime-org',
            user: { id: 'payer' } as never
        })
    }
    const nativeResponse = {
        id: 'receipt',
        object: 'response',
        status: 'completed',
        output: [{ type: 'reasoning', encrypted_content: 'opaque' }],
        usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }
    }
    const generate = jest.fn(async () => {
        expect(RequestContext.currentUserId()).toBe('payer')
        const body = streaming
            ? `data: ${JSON.stringify({ type: 'response.completed', response: nativeResponse })}\n\n`
            : JSON.stringify(nativeResponse)
        return new globalThis.Response(body, {
            headers: {
                'content-type': streaming ? 'text/event-stream' : 'application/json',
                'x-request-id': 'upstream-receipt'
            }
        })
    })
    const priceUsage = jest.fn(() => {
        throw new Error('No price catalog')
    })
    const grants = { authenticate: jest.fn(async () => identity), revalidate: jest.fn(async () => identity) }
    const policies = {
        require: jest.fn(async () => ({
            enabled: true,
            nativeProtocols: ['openai_responses', 'anthropic_messages'],
            chatBridgeProtocols: [] as string[]
        }))
    }
    const admission = { begin: jest.fn(async () => ({ id: 'call', requestId: 'attempt' })), dispatch: jest.fn() }
    const metering = { finish: jest.fn() },
        assistants = { authorize: jest.fn(async () => ({ billableUserId: 'payer' })) }
    const providers = { client: jest.fn(async () => ({ protocol: 'openai_responses', generate, priceUsage })) }
    const chatExecution = { execute: jest.fn() }
    const controller = new ModelExecutionNativeController(
        grants as never,
        policies as never,
        admission as never,
        metering as never,
        assistants as never,
        providers as never,
        chatExecution as never
    )
    const request = Object.assign(new EventEmitter(), { headers: { authorization: 'Bearer execution-only' } })
    const response = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        headersSent: false,
        status: jest.fn(),
        setHeader: jest.fn(),
        write: jest.fn((_chunk: string) => true),
        json: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
    })
    response.status.mockReturnValue(response)
    response.setHeader.mockReturnValue(response)
    const invoke = (body = { model: 'assistant-default', input: 'x', stream: streaming }) =>
        controller.responses(request as Request, response as unknown as Response, body)
    return {
        controller,
        chatExecution,
        invoke,
        model,
        identity,
        grants,
        policies,
        admission,
        metering,
        generate,
        response,
        nativeResponse
    }
}
describe('native gateway execution lifecycle', () => {
    it.each([true, false])(
        'maps the pinned model, preserves native output and meters actual unpriced facts (stream=%s)',
        async (stream) => {
            const f = fixture(stream)
            await f.invoke()
            expect(f.generate).toHaveBeenCalledTimes(1)
            expect(f.generate).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'actual-model', max_output_tokens: 100, store: false }),
                {},
                expect.any(AbortSignal)
            )
            expect(f.admission.dispatch).toHaveBeenCalledTimes(1)
            expect(f.metering.finish).toHaveBeenCalledTimes(1)
            expect(f.metering.finish).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerUsage: null,
                    providerRequestId: 'upstream-receipt',
                    usage: expect.objectContaining({
                        inputTokens: 10,
                        outputTokens: 3,
                        totalTokens: 13,
                        source: ModelGatewayUsageSourceEnum.Provider
                    })
                })
            )
            expect(f.response.write.mock.calls[0][0]).toContain('opaque')
            expect(f.response.end).toHaveBeenCalledTimes(1)
        }
    )
    it('leaves native inference closed when the separate rollout flag is absent', async () => {
        const f = fixture()
        f.policies.require.mockResolvedValue({ enabled: true, nativeProtocols: [], chatBridgeProtocols: [] })
        await f.invoke()
        expect(f.generate).not.toHaveBeenCalled()
        expect(f.admission.begin).not.toHaveBeenCalled()
    })
    it('rechecks model authorization after admission and never dispatches a revoked model', async () => {
        const f = fixture()
        f.grants.revalidate.mockResolvedValue({ ...f.identity, models: [] })
        await f.invoke()
        expect(f.generate).not.toHaveBeenCalled()
        expect(f.admission.dispatch).not.toHaveBeenCalled()
        expect(f.metering.finish).toHaveBeenCalledWith(
            expect.objectContaining({ usage: expect.objectContaining({ source: ModelGatewayUsageSourceEnum.None }) })
        )
    })
    it('does not create an actual fact or retry a truncated stream', async () => {
        const f = fixture()
        f.generate.mockImplementation(
            async () =>
                new globalThis.Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n', {
                    headers: { 'content-type': 'text/event-stream' }
                })
        )
        await f.invoke()
        expect(f.generate).toHaveBeenCalledTimes(1)
        expect(f.metering.finish).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.any(Error),
                usage: expect.objectContaining({ source: ModelGatewayUsageSourceEnum.None, totalTokens: 0 })
            })
        )
    })
    it('retains actual usage but filters raw provider errors returned with HTTP 200', async () => {
        const f = fixture(false)
        f.generate.mockImplementation(
            async () =>
                new globalThis.Response(
                    JSON.stringify({
                        ...f.nativeResponse,
                        status: 'failed',
                        error: { message: 'private provider diagnostic' }
                    })
                )
        )
        await f.invoke()
        expect(f.generate).toHaveBeenCalledTimes(1)
        expect(f.response.write).not.toHaveBeenCalled()
        expect(f.metering.finish).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.any(Error),
                usage: expect.objectContaining({ source: ModelGatewayUsageSourceEnum.Provider, totalTokens: 13 })
            })
        )
        expect(JSON.stringify(f.response.json.mock.calls)).not.toContain('private provider diagnostic')
    })
    it('rechecks a tightened input allowance before dispatch', async () => {
        const f = fixture()
        f.grants.revalidate.mockImplementation(async () => {
            f.identity.grant.limits.maxInputTokens = 1
            return f.identity
        })
        await f.invoke()
        expect(f.generate).not.toHaveBeenCalled()
        expect(f.admission.dispatch).not.toHaveBeenCalled()
    })
})

it('dispatches an explicitly pinned Chat bridge through the same governed Chat lifecycle', async () => {
    const f = fixture()
    f.model.protocols = ['openai_chat', 'openai_responses_chat']
    f.policies.require.mockResolvedValue({
        enabled: true,
        nativeProtocols: [],
        chatBridgeProtocols: ['openai_responses']
    })
    await f.invoke()
    expect(f.generate).not.toHaveBeenCalled()
    expect(f.chatExecution.execute).toHaveBeenCalledTimes(1)
    expect(f.chatExecution.execute).toHaveBeenCalledWith(
        expect.objectContaining({ protocol: 'openai_responses_chat', model: f.model })
    )
})
it('never falls back to Chat after a native provider fails', async () => {
    const f = fixture()
    f.generate.mockRejectedValue(new Error('native failed'))
    await f.invoke()
    expect(f.generate).toHaveBeenCalledTimes(1)
    expect(f.chatExecution.execute).not.toHaveBeenCalled()
})
it('rejects a disabled bridge before admission or provider access', async () => {
    const f = fixture()
    f.model.protocols = ['openai_chat', 'openai_responses_chat']
    await f.invoke()
    expect(f.admission.begin).not.toHaveBeenCalled()
    expect(f.chatExecution.execute).not.toHaveBeenCalled()
})
