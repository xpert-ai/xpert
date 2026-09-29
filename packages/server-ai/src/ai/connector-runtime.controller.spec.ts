import 'reflect-metadata'
import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
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
import { ConnectorController } from '../connector/connector.controller'
import { ConnectorService } from '../connector/connector.service'
import { ConnectorRuntimeController } from './connector-runtime.controller'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'

jest.mock('../../../server/src/secret-token/secret-token.service', () => ({ SecretTokenService: class {} }))
jest.mock('../../../server/src/api-key/api-key.service', () => ({ ApiKeyService: class {} }))

// Exercise production guards and token strategy over HTTP; only persistence and business services are fixtures.
describe('Connector runtime HTTP authentication', () => {
    let app: INestApplication
    let origin: string
    const assistantId = 'assistant-1'
    const tokens = new Map<string, ISecretToken>()
    const connectors = {
        runtimeOptions: jest.fn(),
        authorizationStatusBinding: jest.fn(),
        connectBinding: jest.fn()
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

    beforeAll(async () => {
        const secretTokens = {
            findOneByOptions: jest.fn(async (options: { where: { token: string } }) => tokens.get(options.where.token))
        }
        const users = {
            findOneByIdWithinTenant: jest.fn(async () => ({ id: 'user-1', tenantId: 'tenant-1' }))
        }
        const module = await Test.createTestingModule({
            controllers: [ConnectorRuntimeController, ConnectorController],
            providers: [
                { provide: ConnectorService, useValue: connectors },
                { provide: XpertWorkspaceAccessService, useValue: {} },
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
        app.setGlobalPrefix('api/ai')
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
            entityId: assistantId,
            createdById: 'user-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            validUntil: new Date(Date.now() + 60_000),
            expired: false
        } as ISecretToken)
        tokens.set('cs-x-expired', { ...tokens.get('cs-x-valid')!, validUntil: new Date(0) })
        connectors.runtimeOptions.mockImplementation(async () => ({
            scope: { type: 'workspace', workspaceId: 'workspace-1' },
            items: [],
            actor: RequestContext.currentUserId(),
            organization: RequestContext.getOrganizationId()
        }))
        connectors.authorizationStatusBinding.mockResolvedValue({
            connector: { id: 'binding-1', status: 'active', profile: { name: 'Private account' } },
            granted: true,
            authorizationUrl: 'https://oauth.example/authorize',
            stateExpiresAt: 'private'
        })
    })

    function request(path: string, token = 'cs-x-valid', method = 'GET') {
        return fetch(`${origin}/api/ai/${path}`, {
            method,
            headers: token ? { Authorization: `Bearer ${token}`, 'organization-id': 'forged-org' } : {}
        })
    }

    it('accepts ChatKit credentials and restores the issuing actor and organization', async () => {
        const response = await request(`assistants/${assistantId}/connectors?projectId=project-1&includeWorkspace=true`)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ actor: 'user-1', organization: 'org-1' })
        expect(connectors.runtimeOptions).toHaveBeenCalledWith(assistantId, 'project-1', true)
    })

    it.each(['', 'cs-x-invalid', 'cs-x-expired'])(
        'rejects missing, invalid or expired credentials: %s',
        async (token) => {
            const response = await request(`assistants/${assistantId}/connectors`, token)
            expect(response.status).toBe(401)
            expect(connectors.runtimeOptions).not.toHaveBeenCalled()
        }
    )

    it.each(['connectors', 'connectors/binding-1/status'])(
        'rejects replay against another Assistant: %s',
        async (path) => {
            const response = await request(`assistants/another-assistant/${path}`)
            expect(response.status).toBe(403)
            expect(connectors.runtimeOptions).not.toHaveBeenCalled()
            expect(connectors.authorizationStatusBinding).not.toHaveBeenCalled()
        }
    )

    it('returns only connection readiness and delegates binding access checks', async () => {
        const response = await request(`assistants/${assistantId}/connectors/binding-1/status`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ bindingId: 'binding-1', status: 'active', granted: true })
        expect(connectors.authorizationStatusBinding).toHaveBeenCalledWith('binding-1', assistantId)
        connectors.authorizationStatusBinding.mockRejectedValueOnce(new ForbiddenException())
        expect((await request(`assistants/${assistantId}/connectors/foreign-binding/status`)).status).toBe(403)
    })

    it('keeps administrator routes behind ordinary login authentication', async () => {
        // The fixture mounts both controllers under one prefix; production mounts management under /api/connector.
        const response = await request('bindings/binding-1/connect', 'cs-x-valid', 'POST')
        expect(response.status).toBe(401)
        expect(connectors.connectBinding).not.toHaveBeenCalled()
    })

    it('validates catalog flags and preserves business permission failures', async () => {
        expect((await request(`assistants/${assistantId}/connectors?includeWorkspace=invalid`)).status).toBe(400)
        connectors.runtimeOptions.mockRejectedValueOnce(new ForbiddenException())
        expect((await request(`assistants/${assistantId}/connectors?projectId=denied`)).status).toBe(403)
    })
})
