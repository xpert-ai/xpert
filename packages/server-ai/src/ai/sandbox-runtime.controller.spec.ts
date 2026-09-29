import 'reflect-metadata'
import { ForbiddenException, INestApplication, Module, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Reflector, RouterModule } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import { sign } from 'jsonwebtoken'
import type { DataSource } from 'typeorm'
import {
    AIPermissionsEnum,
    ApiKeyBindingType,
    IApiKey,
    ISecretToken,
    IUser,
    SecretTokenBindingType
} from '@xpert-ai/contracts'
import { RequestContext, RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { I18nService } from 'nestjs-i18n'
import { AuthGuard } from '../../../server/src/shared/guards/auth.guard'
import { SecretTokenStrategy } from '../../../server/src/secret-token/secret-token.strategy'
import type { SecretTokenService } from '../../../server/src/secret-token/secret-token.service'
import type { ApiKeyService } from '../../../server/src/api-key/api-key.service'
import { ApiKeyStrategy } from '../../../server/src/api-key/api-key.strategy'
import { buildApiKeyPrincipal } from '../../../server/src/api-key/api-key-principal'
import { UseApiKeyQuery } from '../../../server/src/api-key/queries'
import type { UserService } from '../../../server/src/user'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { WorkspacePathMapperFactory } from '../shared/volume/workspace-path-mapper.factory'
import { VOLUME_CLIENT } from '../shared/volume/volume'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { SandboxController } from '../sandbox/sandbox.controller'
import { SandboxRuntimeController } from './sandbox-runtime.controller'
import { SandboxManagedServiceError } from '../sandbox/sandbox-managed-service.error'
import { SandboxManagedServiceErrorCode } from '@xpert-ai/contracts'
import { SandboxConversationContextService } from '../sandbox/sandbox-conversation-context.service'
import { SandboxManagedServiceService } from '../sandbox/sandbox-managed-service.service'
import { SandboxPreviewSessionService } from '../sandbox/sandbox-preview-session.service'

jest.mock('../../../server/src/secret-token/secret-token.service', () => ({ SecretTokenService: class {} }))
jest.mock('../../../server/src/api-key/api-key.service', () => ({ ApiKeyService: class {} }))

// Use production HTTP guards and token validation; only persistence and sandbox operations are fixtures.
describe('AI sandbox runtime HTTP authentication', () => {
    const signingSecret = 'sandbox-auth-test-only'
    const actor = {
        id: 'user',
        tenantId: 'tenant',
        role: { rolePermissions: [{ permission: AIPermissionsEnum.XPERT_PROJECT_CREATE, enabled: true }] }
    } as IUser
    const tokens = new Map<string, ISecretToken>()
    const apiKeys = new Map<string, IApiKey>()
    const threads = { findOne: jest.fn() }
    const conversations = { findOneBy: jest.fn() }
    const services = { listByThreadId: jest.fn(), stopByThreadId: jest.fn(), listByConversationId: jest.fn() }
    let app: INestApplication
    let origin: string

    class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
        constructor() {
            super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: signingSecret })
        }
        validate() {
            return actor
        }
    }
    class TestBasicStrategy extends PassportStrategy(Strategy, 'basic') {
        constructor() {
            super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: signingSecret })
        }
        validate() {
            throw new UnauthorizedException()
        }
    }

    beforeAll(async () => {
        const secretTokens = {
            findOneByOptions: jest.fn(async (options: { where: { token: string } }) => tokens.get(options.where.token))
        }
        const users = { findOneByIdWithinTenant: jest.fn(async () => actor) }
        const apiKeyService = {
            findOneOrFailByIdString: jest.fn(async () => ({ record: apiKeys.get('sk-x-valid') })),
            update: jest.fn(),
            resolvePrincipal: jest.fn(
                async (apiKey: IApiKey, options: Parameters<ApiKeyService['resolvePrincipal']>[1]) =>
                    buildApiKeyPrincipal(apiKey, {
                        ...options,
                        actingUser: actor,
                        requestedOrganizationId: options?.requestedOrganizationId ?? apiKey.organizationId
                    })
            )
        }
        const apiKeyQueries = {
            execute: jest.fn(async (query: UseApiKeyQuery) => {
                const apiKey = apiKeys.get(query.token)
                if (!apiKey) throw new UnauthorizedException()
                return apiKey
            })
        }
        const providers = [
            { provide: I18nService, useValue: {} },
            { provide: CommandBus, useValue: {} },
            { provide: QueryBus, useValue: {} },
            { provide: getRepositoryToken(ChatConversation), useValue: conversations },
            { provide: getRepositoryToken(ChatConversationThread), useValue: threads },
            { provide: SandboxConversationContextService, useValue: {} },
            { provide: SandboxManagedServiceService, useValue: services },
            { provide: SandboxPreviewSessionService, useValue: {} },
            {
                provide: SuperAdminOrganizationScopeService,
                useValue: { run: (_org: string, work: () => unknown) => work() }
            },
            { provide: WorkspacePathMapperFactory, useValue: {} },
            { provide: XpertProjectAccessService, useValue: {} },
            { provide: VOLUME_CLIENT, useValue: {} },
            TestJwtStrategy,
            TestBasicStrategy,
            {
                provide: ApiKeyStrategy,
                useFactory: () =>
                    new ApiKeyStrategy(apiKeyQueries as unknown as QueryBus, apiKeyService as unknown as ApiKeyService)
            },
            {
                provide: SecretTokenStrategy,
                useFactory: () =>
                    new SecretTokenStrategy(
                        secretTokens as unknown as SecretTokenService,
                        apiKeyService as unknown as ApiKeyService,
                        users as unknown as UserService,
                        {} as DataSource
                    )
            }
        ]
        @Module({ controllers: [SandboxRuntimeController], providers })
        class RuntimeModule {}
        @Module({ controllers: [SandboxController], providers })
        class ManagementModule {}
        const module = await Test.createTestingModule({
            imports: [
                RuntimeModule,
                ManagementModule,
                RouterModule.register([
                    { path: 'ai', module: RuntimeModule },
                    { path: 'sandbox', module: ManagementModule }
                ])
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api')
        const context = new RequestContextMiddleware()
        app.use(context.use.bind(context))
        app.useGlobalGuards(new AuthGuard(app.get(Reflector)))
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })

    afterAll(async () => {
        await app?.close()
    })

    beforeEach(() => {
        jest.clearAllMocks()
        tokens.clear()
        apiKeys.clear()
        apiKeys.set('sk-x-valid', {
            id: 'api-key',
            token: 'sk-x-valid',
            type: ApiKeyBindingType.ASSISTANT,
            entityId: 'assistant',
            tenantId: 'tenant',
            organizationId: 'org',
            createdById: actor.id,
            createdBy: actor
        })
        tokens.set('cs-x-valid', {
            id: 'session',
            type: SecretTokenBindingType.USER_XPERT,
            entityId: 'assistant',
            createdById: 'user',
            tenantId: 'tenant',
            organizationId: 'org',
            validUntil: new Date(Date.now() + 60_000),
            expired: false
        } as ISecretToken)
        tokens.set('cs-x-expired', { ...tokens.get('cs-x-valid')!, validUntil: new Date(0) })
        threads.findOne.mockResolvedValue({
            conversation: {
                id: 'conversation',
                xpertId: 'assistant',
                tenantId: 'tenant',
                organizationId: 'org',
                createdById: actor.id
            }
        })
        conversations.findOneBy.mockResolvedValue(null)
        services.listByThreadId.mockImplementation(async () => ({
            actor: RequestContext.currentUserId(),
            canCreate: RequestContext.hasPermission(AIPermissionsEnum.XPERT_PROJECT_CREATE)
        }))
        services.stopByThreadId.mockResolvedValue({ id: 'service', status: 'stopped' })
    })

    function request(path = 'threads/thread/services', token = 'cs-x-valid', method = 'GET') {
        return fetch(`${origin}/api/ai/sandbox/${path}`, {
            method,
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
    }

    it('accepts the AI SDK route and restores user permissions from a real client-secret strategy', async () => {
        const response = await request('threads/thread/services?organizationId=org')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ actor: 'user', canCreate: true })
        expect(services.listByThreadId).toHaveBeenCalledWith('thread')
    })

    it.each(['', 'cs-x-invalid', 'cs-x-expired'])('rejects missing/invalid/expired tokens (%s)', async (token) => {
        expect((await request(undefined, token)).status).toBe(401)
        expect(services.listByThreadId).not.toHaveBeenCalled()
    })

    it('accepts an Assistant-bound API key', async () => {
        expect((await request(undefined, 'sk-x-valid')).status).toBe(200)
        expect(services.listByThreadId).toHaveBeenCalledWith('thread')
    })

    it('accepts a client secret backed by an Assistant API key', async () => {
        Object.assign(tokens.get('cs-x-valid')!, { type: SecretTokenBindingType.API_KEY, entityId: 'api-key' })
        expect((await request()).status).toBe(200)
    })

    it.each([
        { entityId: 'other-assistant' },
        { tenantId: 'other-tenant' },
        { organizationId: 'other-org' },
        { type: ApiKeyBindingType.WORKSPACE },
        { type: ApiKeyBindingType.INTEGRATION },
        { type: ApiKeyBindingType.CLIENT },
        { type: undefined }
    ])('rejects API keys without the matching Assistant scope (%p)', async (override) => {
        Object.assign(apiKeys.get('sk-x-valid')!, override)
        expect((await request(undefined, 'sk-x-valid')).status).toBe(403)
        expect(services.listByThreadId).not.toHaveBeenCalled()
    })

    it.each([{ xpertId: 'other-assistant' }, { tenantId: 'other-tenant' }, { organizationId: 'other-org' }])(
        'rejects sessions outside the binding scope (%p)',
        async (override) => {
            threads.findOne.mockResolvedValue({
                conversation: { xpertId: 'assistant', tenantId: 'tenant', organizationId: 'org', ...override }
            })
            expect((await request()).status).toBe(403)
            expect(services.listByThreadId).not.toHaveBeenCalled()
        }
    )

    it('accepts public sessions only within their own Assistant conversation', async () => {
        tokens.get('cs-x-valid')!.type = SecretTokenBindingType.PUBLIC_XPERT
        expect((await request()).status).toBe(200)
    })

    it("rejects public sessions accessing another user's conversation", async () => {
        tokens.get('cs-x-valid')!.type = SecretTokenBindingType.PUBLIC_XPERT
        threads.findOne.mockResolvedValue({
            conversation: { xpertId: 'assistant', tenantId: 'tenant', organizationId: 'org', createdById: 'other-user' }
        })
        expect((await request()).status).toBe(403)
        expect(services.listByThreadId).not.toHaveBeenCalled()
    })

    it('rejects API key organization header overrides', async () => {
        const response = await fetch(`${origin}/api/ai/sandbox/threads/thread/services`, {
            headers: { Authorization: 'Bearer sk-x-valid', 'organization-id': 'other-org' }
        })
        expect(response.status).toBe(403)
        expect(services.listByThreadId).not.toHaveBeenCalled()
    })

    it('rejects organization overrides even for an otherwise valid session', async () => {
        expect((await request('threads/thread/services?organizationId=other-org')).status).toBe(403)
        expect(services.listByThreadId).not.toHaveBeenCalled()
    })

    it('supports legacy root threads without a thread record', async () => {
        const { conversation } = await threads.findOne()
        threads.findOne.mockResolvedValue(null)
        conversations.findOneBy.mockResolvedValue(conversation)
        expect((await request()).status).toBe(200)
    })

    it('preserves downstream workspace access rejection', async () => {
        services.listByThreadId.mockRejectedValueOnce(new ForbiddenException())
        expect((await request()).status).toBe(403)
    })

    it('authenticates service stop operations too', async () => {
        expect((await request('threads/thread/services/service/stop', 'cs-x-valid', 'POST')).status).toBe(201)
        expect(services.stopByThreadId).toHaveBeenCalledWith('thread', 'service')
    })

    it('keeps ordinary platform JWT access working on both APIs', async () => {
        const token = sign({ id: 'user' }, signingSecret)
        expect((await request(undefined, token)).status).toBe(200)
        const response = await fetch(`${origin}/api/sandbox/threads/thread/services`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        expect(response.status).toBe(200)
    })

    it('preserves managed-service error codes and HTTP statuses', async () => {
        services.listByThreadId.mockRejectedValueOnce(
            new SandboxManagedServiceError(SandboxManagedServiceErrorCode.ServiceNotFound, 'Missing service', 404)
        )
        const response = await request()
        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({ code: SandboxManagedServiceErrorCode.ServiceNotFound })
    })

    it('does not open other sandbox routes to ChatKit credentials', async () => {
        const headers = { Authorization: 'Bearer cs-x-valid' }
        expect((await fetch(`${origin}/api/sandbox/threads/thread/services`, { headers })).status).toBe(401)
        expect((await fetch(`${origin}/api/sandbox/conversations/conversation/services`, { headers })).status).toBe(401)
        expect(services.listByThreadId).not.toHaveBeenCalled()
        expect(services.listByConversationId).not.toHaveBeenCalled()
    })
})
