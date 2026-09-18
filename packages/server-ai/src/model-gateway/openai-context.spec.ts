import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
    AiModelTypeEnum,
    IModelAccessResolution,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelGatewayCallStatusEnum
} from '@xpert-ai/contracts'
import {
    AIModelProviderRegistry,
    IAIModelProviderStrategy,
    RequestContext,
    RequestContextMiddleware,
    getTenantGlobalScopeKey,
    setDefaultTenantId
} from '@xpert-ai/plugin-sdk'
import {
    AuthGuard,
    PluginScopeGuard,
    RequestContext as LegacyRequestContext,
    RequestContextMiddleware as LegacyRequestContextMiddleware,
    User
} from '@xpert-ai/server-core'
import { EventEmitter } from 'node:events'
import { AIProvidersService } from '../ai-model/ai-model.service'
import { AIModelGetProviderQuery } from '../ai-model/queries/get-provider.query'
import { AIModelGetProviderHandler } from '../ai-model/queries/handlers/get-provider.handler'
import { CopilotGetOneQuery } from '../copilot/queries/get-one.query'
import { GetCopilotProviderModelQuery } from '../copilot-provider/queries/get-model.query'
import { AgentMiddlewareModelRuntimeService } from '../shared/agent/middleware-runtime/model-runtime.service'
import { runWithCapturedRequestContext } from '../shared/request-context'
import { ModelGatewayApiKey } from './model-gateway-api-key.entity'
import { ModelGatewayCall } from './model-gateway-call.entity'
import { ModelGatewayPublication } from './model-gateway-publication.entity'
import {
    MODEL_GATEWAY_UPSTREAM_TIMEOUT_MS,
    ModelGatewayRequestLimitException,
    ModelGatewayService
} from './model-gateway.service'
import { ModelGatewayOpenAIController } from './openai.controller'

function currentScope() {
    return {
        tenantId: RequestContext.currentTenantId(),
        organizationId: RequestContext.getOrganizationId(),
        userId: RequestContext.currentUserId(),
        legacyTenantId: LegacyRequestContext.currentTenantId(),
        legacyOrganizationId: LegacyRequestContext.getOrganizationId(),
        legacyUserId: LegacyRequestContext.currentUserId()
    }
}

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

async function createFixture(
    options: {
        tenantId?: string
        organizationId?: string | null
        registerProvider?: boolean
    } = {}
) {
    const tenantId = options.tenantId ?? 'tenant-1'
    const organizationId = options.organizationId === undefined ? 'org-1' : options.organizationId
    const userId = `user-${tenantId}`
    const scopes: Array<{ stage: string } & ReturnType<typeof currentScope>> = []
    const requestIds: Array<string | undefined> = []
    const recordScope = (stage: string) => {
        scopes.push({ stage, ...currentScope() })
        requestIds.push(RequestContext.currentRequestContext()?.reqId)
    }
    const model = {
        invoke: jest.fn<Promise<AIMessage>, [unknown, { signal: AbortSignal }]>(async () => {
            await Promise.resolve()
            recordScope('invoke')
            return new AIMessage('Hello')
        }),
        stream: jest.fn<AsyncGenerator<AIMessageChunk>, [unknown, { signal: AbortSignal }]>(async function* () {
            await Promise.resolve()
            recordScope('stream')
            yield new AIMessageChunk('Hello')
        })
    }
    const provider: IAIModelProviderStrategy = {
        name: 'xirang',
        validateCredentials: jest.fn(),
        validateProviderCredentials: jest.fn(),
        getBaseUrl: jest.fn(),
        getAuthorization: jest.fn(),
        getModels: jest.fn(),
        getModelInstance: jest.fn(async () => {
            recordScope('provider')
            return model as never
        }),
        getProviderModels: jest.fn(() => []),
        getProviderSchema: jest.fn(),
        getProviderServerPath: jest.fn(),
        getModelManager: jest.fn().mockReturnValue({ getParameterRules: () => [] })
    }
    const registry = new AIModelProviderRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
    if (options.registerProvider !== false) {
        registry.register('xirang', provider, {
            kind: 'plugin',
            pluginName: '@fixture/xirang',
            scopeKey: organizationId ?? getTenantGlobalScopeKey(tenantId)
        })
    }
    const module = await Test.createTestingModule({
        providers: [AIProvidersService, { provide: AIModelProviderRegistry, useValue: registry }]
    }).compile()
    const handler = new AIModelGetProviderHandler(undefined, module.get(AIProvidersService))
    const queryBus = {
        execute: jest.fn(async (query: unknown) => {
            if (query instanceof CopilotGetOneQuery) {
                return {
                    id: 'copilot-1',
                    tenantId,
                    organizationId,
                    modelProvider: { id: 'provider-1', providerName: 'xirang', tenantId, organizationId }
                }
            }
            if (query instanceof GetCopilotProviderModelQuery) {
                recordScope('custom-models')
                return []
            }
            if (query instanceof AIModelGetProviderQuery) return handler.execute(query)
            throw new Error('Unexpected model runtime query')
        })
    }
    const runtime = new AgentMiddlewareModelRuntimeService(
        undefined,
        queryBus as never,
        undefined,
        undefined,
        undefined
    )
    const service = new ModelGatewayService(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        runtime as never,
        undefined
    )
    const apiKey = Object.assign(new ModelGatewayApiKey(), {
        id: 'key-1',
        tenantId,
        organizationId: organizationId ?? 'key-org',
        userId
    })
    const identity = { apiKey, user: Object.assign(new User(), { id: userId, tenantId }) }
    const publication = Object.assign(new ModelGatewayPublication(), {
        id: 'publication-1',
        tenantId,
        organizationId,
        copilotId: 'copilot-1',
        copilotModelId: 'glm-5.3',
        model: 'glm-5.3',
        modelType: AiModelTypeEnum.LLM,
        provider: 'xirang',
        externalModelId: 'glm-5.3',
        capabilities: []
    })
    const resolution: IModelAccessResolution = {
        allowed: true,
        channel: ModelAccessChannelEnum.ExternalApi,
        billableUserId: userId,
        copilotId: publication.copilotId,
        copilotModelId: publication.copilotModelId,
        provider: 'xirang',
        modelType: AiModelTypeEnum.LLM,
        model: 'glm-5.3',
        accessSource: ModelAccessSourceEnum.Grant,
        multiplier: 1,
        scope: organizationId ? ModelAccessOwnershipScopeEnum.Organization : ModelAccessOwnershipScopeEnum.Tenant,
        organizationId,
        grantId: 'grant-1'
    }
    const callable = { publication, resolution }
    const call = Object.assign(new ModelGatewayCall(), {
        id: 'call-1',
        requestId: 'request-1',
        startedAt: new Date(),
        status: ModelGatewayCallStatusEnum.Started
    })
    jest.spyOn(service, 'authenticate').mockResolvedValue(identity)
    jest.spyOn(service, 'requireCallablePublication').mockImplementation(async () => {
        recordScope('authorize')
        return callable
    })
    jest.spyOn(service, 'listAccessiblePublications').mockImplementation(async () => {
        recordScope('list')
        return [callable]
    })
    jest.spyOn(service, 'startCall').mockImplementation(async () => {
        recordScope('start')
        return call
    })
    jest.spyOn(service, 'finishCall').mockImplementation(async () => {
        recordScope('settle')
        return call
    })
    const controller = new ModelGatewayOpenAIController(service)
    const request = Object.assign(new EventEmitter(), { headers: { authorization: 'Bearer fixture-key' } })
    const response = createResponse()
    const chat = (stream = false) =>
        controller.chat(request as never, response as never, {
            model: 'glm-5.3',
            messages: [{ role: 'user', content: 'Hello' }],
            ...(stream ? { stream } : {})
        })
    const expected = (org = organizationId) => ({
        tenantId,
        organizationId: org,
        userId,
        legacyTenantId: tenantId,
        legacyOrganizationId: org,
        legacyUserId: userId
    })
    return {
        module,
        service,
        controller,
        registry,
        provider,
        model,
        scopes,
        requestIds,
        request,
        response,
        chat,
        expected,
        identity
    }
}

async function startHttpFixture(fixture: Awaited<ReturnType<typeof createFixture>>) {
    const module = await Test.createTestingModule({
        controllers: [ModelGatewayOpenAIController],
        providers: [{ provide: ModelGatewayService, useValue: fixture.service }]
    }).compile()
    const app = module.createNestApplication({ logger: false })
    const legacyContext = new LegacyRequestContextMiddleware()
    const pluginContext = new RequestContextMiddleware()
    app.use(legacyContext.use.bind(legacyContext))
    app.use(pluginContext.use.bind(pluginContext))
    app.useGlobalGuards(new AuthGuard(new Reflector()), new PluginScopeGuard(new Reflector()))
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const baseUrl = await app.getUrl()
    return {
        app,
        models: () => fetch(`${baseUrl}/api/openai/v1/models`, { headers: { authorization: 'Bearer fixture-key' } }),
        chat: (body: object = {}, headers: Record<string, string> = {}) =>
            fetch(`${baseUrl}/api/openai/v1/chat/completions`, {
                method: 'POST',
                headers: { authorization: 'Bearer fixture-key', 'content-type': 'application/json', ...headers },
                body: JSON.stringify({ model: 'glm-5.3', messages: [{ role: 'user', content: 'Hello' }], ...body })
            })
    }
}

describe('OpenAI gateway authenticated model context', () => {
    beforeEach(() => setDefaultTenantId('default-tenant'))
    afterEach(() => {
        jest.restoreAllMocks()
        jest.useRealTimers()
        setDefaultTenantId(null)
    })

    it('calls an organization plugin without client scope headers through the real model runtime and registry', async () => {
        const fixture = await createFixture()
        await fixture.chat()
        expect(fixture.response.json).toHaveBeenCalledWith(expect.objectContaining({ object: 'chat.completion' }))
        expect(fixture.scopes).toContainEqual({ stage: 'authorize', ...fixture.expected() })
        for (const stage of ['custom-models', 'provider', 'invoke', 'settle']) {
            expect(fixture.scopes).toContainEqual({ stage, ...fixture.expected() })
        }
        await fixture.module.close()
    })

    it('uses trusted identity and publication scope instead of caller headers and restores the outer context', async () => {
        const fixture = await createFixture()
        const headers = {
            'tenant-id': 'wrong-tenant',
            'organization-id': 'wrong-org',
            'x-scope-level': 'organization',
            'x-request-id': 'external-request-1'
        }
        Object.assign(fixture.request.headers, headers)
        await runWithCapturedRequestContext({ user: null, headers }, async () => {
            const before = currentScope()
            await fixture.chat()
            expect(currentScope()).toEqual(before)
        })
        expect(fixture.response.json).toHaveBeenCalledWith(expect.objectContaining({ object: 'chat.completion' }))
        expect(fixture.scopes).toContainEqual({ stage: 'invoke', ...fixture.expected() })
        expect(new Set(fixture.requestIds)).toEqual(new Set(['external-request-1']))
        expect(fixture.request.headers).toMatchObject(headers)
        await fixture.module.close()
    })

    it('resolves tenant shared models without inheriting the API key organization or caller organization', async () => {
        const fixture = await createFixture({ organizationId: null })
        fixture.registry.register(
            'xirang',
            { ...fixture.provider, getModelInstance: jest.fn() },
            {
                kind: 'plugin',
                pluginName: '@fixture/org-shadow',
                scopeKey: 'key-org'
            }
        )
        await runWithCapturedRequestContext({ user: null, headers: { 'organization-id': 'key-org' } }, fixture.chat)
        expect(fixture.response.json).toHaveBeenCalledWith(expect.objectContaining({ object: 'chat.completion' }))
        expect(fixture.scopes).toContainEqual({ stage: 'invoke', ...fixture.expected(null) })
        await fixture.module.close()
    })

    it('keeps streaming and settlement inside the publication context', async () => {
        const fixture = await createFixture()
        await fixture.chat(true)
        expect(fixture.response.write).toHaveBeenCalledWith('data: [DONE]\n\n')
        for (const stage of ['stream', 'settle']) {
            expect(fixture.scopes).toContainEqual({ stage, ...fixture.expected() })
        }
        await fixture.module.close()
    })

    it('isolates concurrent calls for different tenants', async () => {
        const first = await createFixture({ tenantId: 'tenant-1', organizationId: 'org-1' })
        const second = await createFixture({ tenantId: 'tenant-2', organizationId: 'org-2' })
        await Promise.all([first.chat(), second.chat()])
        for (const fixture of [first, second]) {
            expect(fixture.response.json).toHaveBeenCalledWith(expect.objectContaining({ object: 'chat.completion' }))
            expect(fixture.scopes).toContainEqual({ stage: 'invoke', ...fixture.expected() })
            await fixture.module.close()
        }
    })

    it('restores authenticated context for model listing', async () => {
        const fixture = await createFixture()
        await fixture.controller.models(fixture.request as never)
        expect(fixture.scopes).toEqual([{ stage: 'list', ...fixture.expected() }])
        await fixture.module.close()
    })

    it('rejects an unregistered provider and settles the failed call in the trusted context', async () => {
        const fixture = await createFixture({ registerProvider: false })
        await fixture.chat()
        expect(fixture.response.status).toHaveBeenCalledWith(404)
        expect(fixture.scopes).toContainEqual({ stage: 'settle', ...fixture.expected() })
        await fixture.module.close()
    })

    it('serves HTTP chat and model listing through both real context middlewares and public route guards', async () => {
        const fixture = await createFixture()
        const http = await startHttpFixture(fixture)
        try {
            const response = await http.chat()
            expect(response.status).toBe(201)
            expect(await response.json()).toMatchObject({ object: 'chat.completion', model: 'glm-5.3' })
            const models = await http.models()
            expect(models.status).toBe(200)
            expect(await models.json()).toMatchObject({ object: 'list', data: [{ id: 'glm-5.3' }] })
            for (const stage of ['authorize', 'list', 'custom-models', 'provider', 'invoke', 'settle']) {
                expect(fixture.scopes).toContainEqual({ stage, ...fixture.expected() })
            }
            expect(fixture.service.authenticate).toHaveBeenCalledWith('Bearer fixture-key')
        } finally {
            await http.app.close()
            await fixture.module.close()
        }
    })

    it('ignores spoofed HTTP scope headers while preserving the request ID', async () => {
        const fixture = await createFixture()
        const http = await startHttpFixture(fixture)
        try {
            const response = await http.chat(
                {},
                {
                    'tenant-id': 'other-tenant',
                    'organization-id': 'other-org',
                    'x-scope-level': 'tenant',
                    'x-request-id': 'http-request-1'
                }
            )
            expect(response.status).toBe(201)
            await response.json()
            expect(fixture.scopes.every((scope) => scope.tenantId === 'tenant-1')).toBe(true)
            expect(fixture.scopes).toContainEqual({ stage: 'invoke', ...fixture.expected() })
            expect(new Set(fixture.requestIds)).toEqual(new Set(['http-request-1']))
        } finally {
            await http.app.close()
            await fixture.module.close()
        }
    })

    it.each([
        {
            stage: 'authenticate' as const,
            error: new UnauthorizedException('Invalid key'),
            status: 401,
            type: 'authentication_error'
        },
        {
            stage: 'requireCallablePublication' as const,
            error: new ForbiddenException('Not granted'),
            status: 403,
            type: 'permission_error'
        },
        {
            stage: 'startCall' as const,
            error: new ModelGatewayRequestLimitException('Rate limited', 2),
            status: 429,
            type: 'rate_limit_error'
        }
    ])('preserves HTTP $status rejection before invoking a provider', async ({ stage, error, status, type }) => {
        const fixture = await createFixture()
        jest.spyOn(fixture.service, stage).mockRejectedValueOnce(error)
        const http = await startHttpFixture(fixture)
        try {
            const response = await http.chat()
            expect(response.status).toBe(status)
            expect(await response.json()).toMatchObject({ error: { type } })
            if (status === 429) expect(response.headers.get('retry-after')).toBe('2')
            expect(fixture.provider.getModelInstance).not.toHaveBeenCalled()
            expect(fixture.service.finishCall).not.toHaveBeenCalled()
        } finally {
            await http.app.close()
            await fixture.module.close()
        }
    })

    it('streams HTTP SSE with usage and settles exactly once in the publication context', async () => {
        const fixture = await createFixture()
        const http = await startHttpFixture(fixture)
        try {
            const response = await http.chat({ stream: true, stream_options: { include_usage: true } })
            expect(response.status).toBe(200)
            expect(response.headers.get('content-type')).toContain('text/event-stream')
            const body = await response.text()
            expect(body).toContain('"content":"Hello"')
            expect(body).toContain('"usage":')
            expect(body).toMatch(/data: \[DONE\]\n\n$/)
            expect(fixture.service.finishCall).toHaveBeenCalledTimes(1)
            expect(fixture.scopes).toContainEqual({ stage: 'settle', ...fixture.expected() })
        } finally {
            await http.app.close()
            await fixture.module.close()
        }
    })

    it('settles an HTTP upstream error once and retains the source context', async () => {
        const fixture = await createFixture()
        const failure = new Error('Upstream unavailable')
        fixture.model.invoke.mockRejectedValueOnce(failure)
        const http = await startHttpFixture(fixture)
        try {
            const response = await http.chat()
            expect(response.status).toBe(502)
            expect(await response.json()).toMatchObject({ error: { type: 'upstream_error' } })
            expect(fixture.service.finishCall).toHaveBeenCalledTimes(1)
            expect(fixture.service.finishCall).toHaveBeenCalledWith(expect.objectContaining({ error: failure }))
            expect(fixture.scopes).toContainEqual({ stage: 'settle', ...fixture.expected() })
        } finally {
            await http.app.close()
            await fixture.module.close()
        }
    })

    it('aborts an in-flight stream when the HTTP client disconnects and settles in the source context', async () => {
        const fixture = await createFixture()
        const started = new Promise<AbortSignal>((resolve) => {
            fixture.model.stream.mockImplementationOnce(async function* (_messages, { signal }) {
                resolve(signal)
                yield new AIMessageChunk('Hello')
                await new Promise<never>((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
                })
            })
        })
        const finishCall = jest.mocked(fixture.service.finishCall).getMockImplementation()
        if (!finishCall) throw new Error('Missing fixture settlement implementation')
        const settled = new Promise<void>((resolve) => {
            jest.spyOn(fixture.service, 'finishCall').mockImplementationOnce(async (...args) => {
                const result = await finishCall(...args)
                resolve()
                return result
            })
        })
        const http = await startHttpFixture(fixture)
        try {
            const response = await http.chat({ stream: true })
            const signal = await started
            expect(signal.aborted).toBe(false)
            if (!response.body) throw new Error('Missing HTTP response stream')
            await response.body.cancel()
            await settled
            expect(signal.aborted).toBe(true)
            expect(fixture.service.finishCall).toHaveBeenCalledTimes(1)
            expect(fixture.service.finishCall).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.any(Error) })
            )
            expect(fixture.scopes).toContainEqual({ stage: 'settle', ...fixture.expected() })
        } finally {
            await http.app.close()
            await fixture.module.close()
        }
    })

    it('keeps the gateway timeout active until the upstream call completes and cleans up afterward', async () => {
        const fixture = await createFixture()
        const started = new Promise<AbortSignal>((resolve) => {
            fixture.model.invoke.mockImplementationOnce(async (_messages, { signal }) => {
                resolve(signal)
                return new Promise<never>((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
                })
            })
        })
        jest.useFakeTimers()
        try {
            const completion = fixture.chat()
            const signal = await started
            await jest.advanceTimersByTimeAsync(MODEL_GATEWAY_UPSTREAM_TIMEOUT_MS)
            await completion
            expect(signal.aborted).toBe(true)
            expect(fixture.response.status).toHaveBeenCalledWith(502)
            expect(fixture.service.finishCall).toHaveBeenCalledTimes(1)
            expect(fixture.scopes).toContainEqual({ stage: 'settle', ...fixture.expected() })
            expect(fixture.request.listenerCount('aborted')).toBe(0)
            expect(fixture.response.listenerCount('close')).toBe(0)
            expect(jest.getTimerCount()).toBe(0)
        } finally {
            jest.useRealTimers()
            await fixture.module.close()
        }
    })
})
