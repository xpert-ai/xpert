import { EventEmitter } from 'node:events'
import { Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import {
    AiModelTypeEnum,
    ModelFeature,
    ModelGatewayUsageSourceEnum,
    type ModelExecutionModel,
    type ModelExecutionParameters
} from '@xpert-ai/contracts'
import { builtinCliModelProfiles } from '@xpert-ai/cli-model-profiles'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelExecutionNativeController } from './execution-native.controller'
import { NativeUpstreamError } from './execution-native-upstream-error'
import { captureRequestContext } from '../shared/request-context'
import { parseExecutionPolicy } from './execution-policy'
import { executionToolModels } from './execution-tool-model'

it('logs only safe transport diagnostics while keeping the client error sanitized', async () => {
    const f = fixture()
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
        f.generate.mockRejectedValueOnce(
            Object.assign(new TypeError('private-key-and-request-body'), {
                cause: { code: 'UND_ERR_HEADERS_TIMEOUT', message: 'private-provider-body' }
            })
        )
        await f.invoke()
        expect(warn).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'native_model_request_failed',
                errorType: 'TypeError',
                transportCode: 'UND_ERR_HEADERS_TIMEOUT'
            })
        )
        expect(JSON.stringify(warn.mock.calls)).not.toContain('private-')
        expect(JSON.stringify(f.response.json.mock.calls)).not.toContain('private-')
    } finally {
        warn.mockRestore()
    }
})

function fixture(streaming = true, parameters?: ModelExecutionParameters) {
    const model: ModelExecutionModel = {
        id: 'selected',
        copilotId: 'copilot',
        providerScopeId: 'provider-org-model',
        providerOrganizationId: 'provider-org',
        provider: 'native-fixture',
        model: 'actual-model',
        modelType: AiModelTypeEnum.LLM,
        protocols: ['openai_responses', 'anthropic_messages'],
        capabilities: [],
        parameters
    }
    const grant = {
        id: 'grant',
        tenantId: 'tenant',
        defaultModelId: model.id,
        limits: { maxOutputTokens: 100 },
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
        providers,
        invoke,
        model,
        identity,
        grants,
        policies,
        admission,
        metering,
        generate,
        response,
        nativeResponse,
        request
    }
}
describe('native gateway execution lifecycle', () => {
    it('keeps declared Responses native under the default policy from Codex xhigh through provider dispatch', async () => {
        const f = fixture(false, { reasoning_effort: 'xhigh', max_tokens: 10631 })
        const policy = parseExecutionPolicy(undefined)
        const models = executionToolModels(
            [
                {
                    ...f.model,
                    protocols: ['openai_chat', 'openai_responses'],
                    capabilities: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL]
                }
            ],
            { id: 'codex', version: '0.159.2' },
            policy
        )
        expect(models).toHaveLength(1)
        expect(models[0].protocols).toEqual(['openai_chat', 'openai_responses'])
        f.identity.models = models
        f.policies.require.mockResolvedValue({
            enabled: true,
            nativeProtocols: policy.nativeProtocols ?? [],
            chatBridgeProtocols: policy.chatBridgeProtocols ?? []
        })
        const profile = builtinCliModelProfiles.get('codex')
        if (!profile) throw new Error('Missing Codex profile')
        const config = profile.configure({
            directory: '/tmp/native-responses-policy-test',
            gatewayBaseUrl: policy.gatewayBaseUrl,
            defaultModelId: f.model.id,
            models,
            managed: true
        })
        expect(config.args).toContain('model_reasoning_effort="xhigh"')
        expect(config.args).not.toContain('model_reasoning_effort="none"')
        expect(config.args).not.toContain('model_reasoning_summary="none"')
        const effortArgument = config.args.find((arg) => arg.startsWith('model_reasoning_effort='))
        if (!effortArgument) throw new Error('Missing reasoning effort')
        const effort: unknown = JSON.parse(effortArgument.slice('model_reasoning_effort='.length))
        const input = [{ type: 'reasoning', encrypted_content: 'opaque-native-context' }]
        await f.controller.responses(f.request as Request, f.response as unknown as Response, {
            model: 'assistant-default',
            input,
            stream: false,
            reasoning: { effort }
        })
        expect(f.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'actual-model',
                input,
                reasoning: { effort: 'xhigh' },
                max_output_tokens: 10631
            }),
            {},
            expect.any(AbortSignal)
        )
        expect(f.chatExecution.execute).not.toHaveBeenCalled()
        expect(f.response.write.mock.calls[0][0]).toContain('opaque')
    })

    it.each([
        [400, 'invalid_request_error'],
        [404, 'invalid_request_error'],
        [413, 'invalid_request_error'],
        [422, 'invalid_request_error'],
        [429, 'rate_limit_error'],
        [500, 'api_error'],
        [502, 'api_error'],
        [503, 'api_error'],
        [504, 'api_error']
    ] as const)(
        'retains upstream HTTP %s with safe diagnostics, correct error classification and one metering finish',
        async (status, errorType) => {
            const f = fixture()
            f.generate.mockResolvedValue(
                new globalThis.Response('<html>private provider credentials</html>', {
                    status,
                    headers: {
                        'content-type': 'text/html',
                        'retry-after': '60',
                        'x-request-id': 'provider-request-1',
                        'cf-ray': 'a51f0599dc5bbe3d-AMS',
                        authorization: 'Bearer private',
                        'set-cookie': 'private=value'
                    }
                })
            )
            await f.invoke()
            expect(f.response.status).toHaveBeenCalledWith(status)
            expect(f.response.json).toHaveBeenCalledWith({
                type: 'error',
                error: {
                    type: errorType,
                    message: 'The upstream model service failed to complete the request.'
                }
            })
            expect(f.response.setHeader.mock.calls).toEqual([
                ['retry-after', '60'],
                ['x-upstream-request-id', 'provider-request-1'],
                ['x-upstream-cf-ray', 'a51f0599dc5bbe3d-AMS']
            ])
            expect(f.generate).toHaveBeenCalledTimes(1)
            expect(f.response.write).not.toHaveBeenCalled()
            expect(f.metering.finish).toHaveBeenCalledTimes(1)
            expect(f.metering.finish).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.any(NativeUpstreamError),
                    usage: expect.objectContaining({ source: ModelGatewayUsageSourceEnum.None, totalTokens: 0 })
                })
            )
            expect(JSON.stringify(f.response.json.mock.calls)).not.toContain('private')
        }
    )

    it.each([401, 403, 407])(
        'does not confuse upstream credential rejection %s with execution authorization',
        async (status) => {
            const f = fixture(false)
            f.generate.mockResolvedValue(new globalThis.Response('private', { status }))
            await f.invoke()
            expect(f.response.status).toHaveBeenCalledWith(502)
            expect(f.response.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({ type: 'api_error' })
                })
            )
        }
    )

    it('sanitizes transport exceptions without retrying the provider', async () => {
        const f = fixture()
        f.generate.mockRejectedValue(new Error('private credential and URL'))
        await f.invoke()
        expect(f.response.status).toHaveBeenCalledWith(502)
        expect(f.generate).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(f.response.json.mock.calls)).not.toContain('private')
        expect(f.metering.finish).toHaveBeenCalledTimes(1)
    })

    it.each([new globalThis.Response(null, { status: 204 }), new globalThis.Response('<html>not SSE</html>')])(
        'classifies an invalid successful upstream response as a gateway failure',
        async (upstream) => {
            const f = fixture()
            f.generate.mockResolvedValue(upstream)
            await f.invoke()
            expect(f.response.status).toHaveBeenCalledWith(502)
            expect(f.response.write).not.toHaveBeenCalled()
        }
    )

    it('inherits native tuning and reserves its configured output without changing explicit fields', async () => {
        const f = fixture(false, { temperature: 0.6, top_p: 0.37, max_tokens: 12345, reasoning_effort: 'high' })
        await f.controller.responses(f.request as Request, f.response as unknown as Response, {
            model: 'assistant-default',
            input: 'offline',
            stream: false,
            temperature: 0
        })
        expect(f.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                temperature: 0,
                top_p: 0.37,
                max_output_tokens: 12345,
                reasoning: { effort: 'high' }
            }),
            {},
            expect.any(AbortSignal)
        )
        expect(f.admission.begin).toHaveBeenCalledWith(
            f.identity.grant,
            f.identity.models[0],
            12345,
            expect.any(Number)
        )
    })

    it('rejects an incompatible inherited parameter before opening the provider client', async () => {
        const f = fixture(false, { enable_thinking: true })
        await f.invoke()
        expect(f.providers.client).not.toHaveBeenCalled()
        expect(f.generate).not.toHaveBeenCalled()
        expect(f.response.status).toHaveBeenCalledWith(400)
    })
    it.each([true, false])(
        'maps the pinned model, preserves native output and meters actual unpriced facts (stream=%s)',
        async (stream) => {
            const f = fixture(stream)
            await f.invoke()
            expect(f.generate).toHaveBeenCalledTimes(1)
            expect(f.generate).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'actual-model', store: false }),
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
    it('leaves native inference closed when explicitly disabled by policy', async () => {
        const f = fixture()
        f.policies.require.mockResolvedValue({ enabled: true, nativeProtocols: [], chatBridgeProtocols: [] })
        await f.invoke()
        expect(f.generate).not.toHaveBeenCalled()
        expect(f.admission.begin).not.toHaveBeenCalled()
        expect(f.response.status).toHaveBeenCalledWith(403)
        expect(f.response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({ type: 'invalid_request_error' })
            })
        )
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
    it('closes a failed stream after headers were sent instead of writing a second response', async () => {
        const f = fixture()
        f.response.write.mockImplementation(() => {
            f.response.headersSent = true
            return true
        })
        f.generate.mockResolvedValue(
            new globalThis.Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n', {
                headers: { 'content-type': 'text/event-stream' }
            })
        )
        await f.invoke()
        expect(f.response.destroy).toHaveBeenCalledTimes(1)
        expect(f.response.json).not.toHaveBeenCalled()
        expect(f.generate).toHaveBeenCalledTimes(1)
        expect(f.metering.finish).toHaveBeenCalledTimes(1)
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
        expect(f.response.status).toHaveBeenCalledWith(502)
    })
    it('dispatches a large request even if a legacy grant carries a small input cap', async () => {
        const f = fixture(false)
        Object.assign(f.identity.grant.limits, { maxInputTokens: 1 })
        const input = '中文代码与命令输出'.repeat(20000)
        expect(Buffer.byteLength(input)).toBeGreaterThan(128000)
        await f.invoke({ model: 'assistant-default', input, stream: false })
        expect(f.generate).toHaveBeenCalledTimes(1)
        expect(f.generate).toHaveBeenCalledWith(expect.objectContaining({ input }), {}, expect.any(AbortSignal))
        expect(f.admission.begin).toHaveBeenCalledWith(f.identity.grant, f.model, 0, expect.any(Number))
        expect(f.admission.dispatch).toHaveBeenCalledTimes(1)
    })
    it('forwards a large native Anthropic request without applying the legacy input cap', async () => {
        const f = fixture(false)
        Object.assign(f.identity.grant.limits, { maxInputTokens: 1 })
        const content = '中文代码与命令输出'.repeat(20000)
        f.generate.mockImplementation(
            async () =>
                new globalThis.Response(
                    JSON.stringify({
                        type: 'message',
                        id: 'receipt',
                        role: 'assistant',
                        content: [{ type: 'text', text: 'ok' }],
                        usage: { input_tokens: 40000, output_tokens: 2 }
                    })
                )
        )
        await f.controller.messages(f.request as Request, f.response as unknown as Response, {
            model: 'assistant-default',
            messages: [{ role: 'user', content }],
            max_tokens: 100
        })
        expect(f.generate).toHaveBeenCalledWith(
            expect.objectContaining({ messages: [{ role: 'user', content }] }),
            {},
            expect.any(AbortSignal)
        )
        expect(f.admission.dispatch).toHaveBeenCalledTimes(1)
        expect(f.metering.finish).toHaveBeenCalledWith(
            expect.objectContaining({
                usage: expect.objectContaining({
                    inputTokens: 40000,
                    totalTokens: 40002,
                    source: ModelGatewayUsageSourceEnum.Provider
                })
            })
        )
    })
    it('ignores legacy output caps even when they change before dispatch', async () => {
        const f = fixture()
        f.grants.revalidate.mockImplementation(async () => {
            f.identity.grant.limits.maxOutputTokens = 1
            return f.identity
        })
        await f.invoke()
        expect(f.generate).toHaveBeenCalledTimes(1)
        expect(f.admission.dispatch).toHaveBeenCalledTimes(1)
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
