import 'reflect-metadata'
import { ForbiddenException, INestApplication, Module, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Reflector, RouterModule } from '@nestjs/core'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import type { DataSource } from 'typeorm'
import { ISecretToken, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext, RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { AuthGuard } from '../../../server/src/shared/guards/auth.guard'
import { SecretTokenStrategy } from '../../../server/src/secret-token/secret-token.strategy'
import type { SecretTokenService } from '../../../server/src/secret-token/secret-token.service'
import type { ApiKeyService } from '../../../server/src/api-key/api-key.service'
import type { UserService } from '../../../server/src/user'
import { McpAppsController } from '../xpert-toolset/mcp-apps.controller'
import { McpAppsService } from '../xpert-toolset/mcp-apps.service'
import { McpAppsRuntimeController } from './mcp-apps-runtime.controller'

jest.mock('../../../server/src/secret-token/secret-token.service', () => ({ SecretTokenService: class {} }))
jest.mock('../../../server/src/api-key/api-key.service', () => ({ ApiKeyService: class {} }))

// Exercise production guards and token authentication over both route families.
describe('MCP Apps runtime HTTP authentication', () => {
    let app: INestApplication
    let origin: string
    const tokens = new Map<string, ISecretToken>()
    const service = {
        getResource: jest.fn(),
        handleRpc: jest.fn(),
        approve: jest.fn(),
        reject: jest.fn(),
        teardown: jest.fn()
    }

    class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
        constructor() {
            super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: 'test-only-signing-secret' })
        }
        validate() {
            throw new UnauthorizedException()
        }
    }
    class TestBasicStrategy extends PassportStrategy(Strategy, 'basic') {
        constructor() {
            super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: 'test-only-signing-secret' })
        }
        validate() {
            throw new UnauthorizedException()
        }
    }
    @Module({ controllers: [McpAppsRuntimeController], providers: [{ provide: McpAppsService, useValue: service }] })
    class RuntimeModule {}
    @Module({ controllers: [McpAppsController], providers: [{ provide: McpAppsService, useValue: service }] })
    class ManagementModule {}

    beforeAll(async () => {
        const secretTokens = {
            findOneByOptions: jest.fn(async (options: { where: { token: string } }) => tokens.get(options.where.token))
        }
        const users = { findOneByIdWithinTenant: jest.fn(async () => ({ id: 'user-1', tenantId: 'tenant-1' })) }
        const module = await Test.createTestingModule({
            imports: [
                RuntimeModule,
                ManagementModule,
                RouterModule.register([
                    { path: '/ai', module: RuntimeModule },
                    { path: '/xpert-toolset', module: ManagementModule }
                ])
            ],
            providers: [
                TestJwtStrategy,
                TestBasicStrategy,
                {
                    provide: SecretTokenStrategy,
                    useFactory: () =>
                        new SecretTokenStrategy(
                            secretTokens as unknown as SecretTokenService,
                            {} as ApiKeyService,
                            users as unknown as UserService,
                            {} as DataSource
                        )
                }
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
        tokens.set('cs-x-valid', {
            id: 'session-1',
            type: SecretTokenBindingType.USER_XPERT,
            entityId: 'assistant-1',
            createdById: 'user-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            validUntil: new Date(Date.now() + 60_000),
            expired: false
        } as ISecretToken)
        tokens.set('cs-x-expired', { ...tokens.get('cs-x-valid')!, validUntil: new Date(0) })
        service.getResource.mockImplementation(async () => ({
            actor: RequestContext.currentUserId(),
            organization: RequestContext.getOrganizationId()
        }))
        service.handleRpc.mockResolvedValue({ result: {} })
        service.approve.mockResolvedValue({ approved: true })
        service.reject.mockResolvedValue({ approved: false })
        service.teardown.mockResolvedValue({ removed: true })
    })

    function request(path: string, token = 'cs-x-valid', method = 'GET', body?: object) {
        return fetch(`${origin}/api/${path}`, {
            method,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'organization-id': 'forged-org',
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        })
    }

    it('accepts ChatKit credentials on the AI route with the issuing actor and organization', async () => {
        const response = await request('ai/mcp-apps/app-1/resource?token=app-token')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ actor: 'user-1', organization: 'org-1' })
        expect(service.getResource).toHaveBeenCalledWith('app-1', { token: 'app-token' })
    })
    it.each(['', 'cs-x-invalid', 'cs-x-expired'])(
        'rejects missing, invalid or expired credentials: %s',
        async (token) => {
            expect((await request('ai/mcp-apps/app-1/resource', token)).status).toBe(401)
            expect(service.getResource).not.toHaveBeenCalled()
        }
    )
    it.each([
        ['GET', '/resource'],
        ['POST', '/rpc'],
        ['POST', '/approvals/approval-1/approve'],
        ['POST', '/approvals/approval-1/reject'],
        ['DELETE', '']
    ])('keeps management %s %s behind ordinary authentication', async (method, suffix) => {
        expect((await request(`xpert-toolset/mcp-apps/app-1${suffix}`, 'cs-x-valid', method)).status).toBe(401)
        for (const handler of Object.values(service)) expect(handler).not.toHaveBeenCalled()
    })
    it('forwards RPC, approval, rejection and teardown to the existing access-controlled service', async () => {
        const body = { jsonrpc: '2.0', id: 1, method: 'tools/call' }
        const base = 'ai/mcp-apps/app-1'
        expect((await request(`${base}/rpc?token=app-token`, 'cs-x-valid', 'POST', body)).status).toBe(201)
        expect(service.handleRpc).toHaveBeenCalledWith('app-1', body, { token: 'app-token' })
        expect((await request(`${base}/approvals/approval-1/approve`, 'cs-x-valid', 'POST')).status).toBe(201)
        expect(service.approve).toHaveBeenCalledWith('app-1', 'approval-1', {})
        expect((await request(`${base}/approvals/approval-1/reject`, 'cs-x-valid', 'POST')).status).toBe(201)
        expect(service.reject).toHaveBeenCalledWith('app-1', 'approval-1', {})
        expect((await request(base, 'cs-x-valid', 'DELETE')).status).toBe(200)
        expect(service.teardown).toHaveBeenCalledWith('app-1', {})
    })
    it('preserves service-level permission failures', async () => {
        service.getResource.mockRejectedValueOnce(new ForbiddenException())
        expect((await request('ai/mcp-apps/app-1/resource')).status).toBe(403)
    })
})
