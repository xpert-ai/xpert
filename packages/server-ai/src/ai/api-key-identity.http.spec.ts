jest.mock('../../../server/src/user/user.service', () => ({ UserService: class UserService {} }))
jest.mock('../../../server/src/integration', () => ({ IntegrationService: class IntegrationService {} }))
jest.mock('../../../server/src/secret-token/secret-token.service', () => ({
    SecretTokenService: class SecretTokenService {}
}))

import { Controller, Get, INestApplication, Query, UseGuards } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AuthGuard } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import {
    ApiKeyBindingType,
    AIPermissionsEnum,
    PermissionsEnum,
    SecretTokenBindingType,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext, RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { assertWorkbenchPrincipal } from './workbench-principal'
import { RequestContextMiddleware as LegacyContext } from '../../../server/src/core/context/request-context.middleware'
import { IntegrationService } from '../../../server/src/integration'
import { Organization } from '../../../server/src/organization/organization.entity'
import { RolePermission } from '../../../server/src/role-permission/role-permission.entity'
import { SecretTokenService } from '../../../server/src/secret-token/secret-token.service'
import { SecretTokenStrategy } from '../../../server/src/secret-token/secret-token.strategy'
import { Permissions } from '../../../server/src/shared/decorators/permissions'
import { EndpointPermissionInterceptor } from '../../../server/src/shared/guards/endpoint-permission.interceptor'
import { TenantScopeGuard } from '../../../server/src/shared/guards/tenant-scope.guard'
import {
    createAuthorizationDatabase,
    seedAuthorizationDatabase
} from '../../../server/src/shared/testing/authorization-db.test-fixture'
import { ResolveUserOrganizationAccessHandler } from '../../../server/src/user-organization/commands/handlers/resolve-user-organization-access.handler'
import { ResolveUserOrganizationAccessCommand } from '../../../server/src/user-organization/commands/resolve-user-organization-access.command'
import { UserOrganization } from '../../../server/src/user-organization/user-organization.entity'
import { ExecutionUserLoader } from '../../../server/src/user/execution-identity/execution-user-loader'
import { User } from '../../../server/src/user/user.entity'
import { UserService } from '../../../server/src/user/user.service'
import { ApiKey } from '../../../server/src/api-key/api-key.entity'
import { ApiKeyService } from '../../../server/src/api-key/api-key.service'
import { ApiKeyStrategy } from '../../../server/src/api-key/api-key.strategy'
import { hashPersonalApiKey } from '../../../server/src/api-key/personal-api-key/personal-api-key-token'
import { UseApiKeyQuery } from '../../../server/src/api-key/queries/api-key.use.query'
import { UseApiKeyHandler } from '../../../server/src/api-key/queries/handlers/api-key.use.handler'

@Controller('runtime')
@Permissions(AIPermissionsEnum.CHAT_VIEW)
class RuntimeController {
    @Get('key')
    @UseGuards(AuthGuard('api-key'), TenantScopeGuard)
    key() {
        return { user: RequestContext.currentUser(), principal: RequestContext.currentApiPrincipal() }
    }

    @Get('secret')
    @UseGuards(AuthGuard('client-secret'), TenantScopeGuard)
    secret() {
        return this.key()
    }

    @Get('assistant')
    @UseGuards(AuthGuard('api-key'), TenantScopeGuard)
    assistant(@Query('xpertId') xpertId?: string, @Query('tenantId') tenantId?: string) {
        assertWorkbenchPrincipal(RequestContext.currentApiPrincipal(), {
            threadId: 'thread',
            from: 'api',
            xpertId: xpertId ?? 'assistant-a',
            tenantId: tenantId ?? 'tenant-a',
            organizationId: 'org-a'
        })
        return { allowed: true }
    }

    @Get('manage')
    @UseGuards(AuthGuard('api-key'), TenantScopeGuard)
    @Permissions(PermissionsEnum.ORG_TAGS_EDIT)
    manage() {
        return { managed: true }
    }
}

describe('Resource-key identity loading through HTTP authorization', () => {
    let db: DataSource, app: INestApplication, origin: string, handler: UseApiKeyHandler
    let service: ApiKeyService
    const personalToken = `sk-user-${'a'.repeat(43)}`
    const secretTokens = { findBySecret: jest.fn() }

    beforeAll(async () => {
        db = await createAuthorizationDatabase()
        const access = new ResolveUserOrganizationAccessHandler(
            db.getRepository(User),
            db.getRepository(UserOrganization),
            db.getRepository(Organization)
        )
        const module = await Test.createTestingModule({
            controllers: [RuntimeController],
            providers: [
                ApiKeyService,
                ApiKeyStrategy,
                SecretTokenStrategy,
                UseApiKeyHandler,
                ExecutionUserLoader,
                { provide: getRepositoryToken(ApiKey), useValue: db.getRepository(ApiKey) },
                { provide: getRepositoryToken(User), useValue: db.getRepository(User) },
                { provide: UserService, useValue: { ensureCommunicationUser: async () => ({ id: 'technical' }) } },
                {
                    provide: IntegrationService,
                    useValue: {
                        findOneByIdWithinTenant: async () => ({ id: 'integration', tenantId: 'tenant-a' }),
                        ensurePrincipalUser: async () => ({ id: 'technical' })
                    }
                },
                { provide: SecretTokenService, useValue: secretTokens },
                { provide: DataSource, useValue: db },
                { provide: QueryBus, useValue: { execute: (query: UseApiKeyQuery) => handler.execute(query) } },
                {
                    provide: CommandBus,
                    useValue: { execute: (command: ResolveUserOrganizationAccessCommand) => access.execute(command) }
                }
            ]
        }).compile()
        handler = module.get(UseApiKeyHandler)
        service = module.get(ApiKeyService)
        app = module.createNestApplication({ logger: false })
        for (const middleware of [new LegacyContext(), new RequestContextMiddleware()])
            app.use(middleware.use.bind(middleware))
        app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => {
        await app?.close()
        await db?.destroy()
    })
    beforeEach(async () => {
        await db.synchronize(true)
        await seedAuthorizationDatabase(db)
        secretTokens.findBySecret.mockReset()
    })

    async function key(change: Partial<ApiKey> = {}) {
        return db.getRepository(ApiKey).save({
            id: 'key',
            token: 'fixture-resource-token',
            tenantId: 'tenant-a',
            organizationId: 'org-a',
            createdById: 'reader',
            type: ApiKeyBindingType.ASSISTANT,
            entityId: 'assistant-a',
            ...change
        })
    }
    function request(extra: Record<string, string> = {}, path = 'key') {
        return fetch(`${origin}/runtime/${path}`, { headers: { 'x-api-key': 'fixture-resource-token', ...extra } })
    }

    it.each([ApiKeyBindingType.ASSISTANT, ApiKeyBindingType.WORKSPACE, null])(
        'loads creator grants for %s keys from actual relations',
        async (type) => {
            await key({ type })
            const shallow = await db
                .getRepository(ApiKey)
                .findOne({ where: { id: 'key' }, relations: ['createdBy', 'user'] })
            expect(shallow.createdBy.role).toBeUndefined()
            const response = await request()
            expect(response.status).toBe(200)
            const result = await response.json()
            expect(result.user).toMatchObject({
                id: 'reader',
                type: UserType.USER,
                role: { rolePermissions: [{ permission: AIPermissionsEnum.CHAT_VIEW }] }
            })
            expect(result.principal.resourceScope).toEqual(
                type === ApiKeyBindingType.ASSISTANT
                    ? { kind: 'assistant', xpertId: 'assistant-a' }
                    : type === ApiKeyBindingType.WORKSPACE
                      ? { kind: 'workspace', workspaceId: 'assistant-a' }
                      : undefined
            )
            expect(JSON.stringify(result)).not.toContain('fixture-password-hash')
            expect(JSON.stringify(result)).not.toContain('fixture-refresh-token')
            expect((await db.getRepository(ApiKey).findOneBy({ id: 'key' })).userId).toBeNull()
        }
    )

    it.each([null, 'reader'])('hydrates bound/same-user shortcuts with userId=%s', async (userId) => {
        await key({ userId })
        expect((await request({ 'x-principal-user-id': 'reader' })).status).toBe(200)
        expect((await request({}, 'manage')).status).toBe(403)
    })

    it('keeps explicit-user permissions separate from the key owner and preserves resource audiences', async () => {
        await key()
        await db
            .getRepository(User)
            .save({ id: 'delegate', tenantId: 'tenant-a', type: UserType.USER, roleId: 'reader-role' })
        await db
            .getRepository(UserOrganization)
            .save({ id: 'delegate', tenantId: 'tenant-a', organizationId: 'org-a', userId: 'delegate' })
        const response = await request({ 'x-principal-user-id': 'delegate' })
        expect(response.status).toBe(200)
        expect((await response.json()).principal).toMatchObject({
            id: 'delegate',
            apiKeyUserId: 'reader',
            ownerUserId: 'reader',
            resourceScope: { kind: 'assistant', xpertId: 'assistant-a' }
        })
        expect((await request({ 'x-principal-user-id': 'manager' })).status).toBe(403)
        expect((await request({}, 'assistant')).status).toBe(200)
        expect((await request({}, 'assistant?xpertId=another-assistant')).status).toBe(403)
        expect((await request({}, 'assistant?tenantId=tenant-b')).status).toBe(403)
        await db
            .getRepository(UserOrganization)
            .save({ id: 'second-org', tenantId: 'tenant-a', organizationId: 'org-other', userId: 'reader' })
        expect((await request({ 'organization-id': 'org-other' }, 'assistant')).status).toBe(403)
    })

    it('observes current grant revocation, empty grants and restoration on the same key', async () => {
        await key()
        const grants = db.getRepository(RolePermission)
        for (const enabled of [true, false, true]) {
            await grants.update('chat-grant', { enabled })
            expect((await request()).status).toBe(enabled ? 200 : 403)
        }
        await grants.delete('chat-grant')
        expect((await request()).status).toBe(403)
    })

    it.each([false, true])(
        'rejects disabled/deleted actors without falling back to the creator (deleted=%s)',
        async (deleted) => {
            await key({ createdById: 'manager', userId: 'reader' })
            await db.getRepository(User).update('reader', deleted ? { deletedAt: new Date() } : { isActive: false })
            expect((await request()).status).toBe(401)
        }
    )

    it('rejects cross-tenant bound/requested users and tenant/organization overrides', async () => {
        await key()
        expect((await request({ 'tenant-id': 'tenant-b' })).status).toBe(403)
        for (const organizationId of ['org-other', 'org-foreign'])
            expect((await request({ 'organization-id': organizationId })).status).toBe(403)
        expect((await request({ 'x-principal-user-id': 'foreign' })).status).toBe(401)
        await db.getRepository(ApiKey).update('key', { userId: 'foreign' })
        expect((await request()).status).toBe(401)
    })

    it('rechecks organization membership and ignores grants from another tenant or role', async () => {
        await key()
        await db.getRepository(UserOrganization).update('reader', { isActive: false })
        expect((await request()).status).toBe(403)
        await db.getRepository(UserOrganization).update('reader', { isActive: true })
        await db.getRepository(RolePermission).update('chat-grant', { tenantId: 'tenant-b' })
        expect((await request()).status).toBe(403)
        await db.getRepository(RolePermission).update('chat-grant', { tenantId: 'tenant-a', roleId: 'manager-role' })
        expect((await request()).status).toBe(403)
    })

    it.each(['expired', 'revoked'])('rejects %s credentials before endpoint execution', async (state) => {
        await key(state === 'expired' ? { validUntil: new Date(0) } : { revokedAt: new Date() })
        expect((await request()).status).toBe(401)
    })

    it('preserves fixed personal identities with current permission and credential checks', async () => {
        await key({
            type: ApiKeyBindingType.USER,
            token: hashPersonalApiKey(personalToken),
            entityId: 'reader',
            userId: 'reader',
            organizationId: null
        })
        const headers = { 'x-api-key': personalToken, 'organization-id': 'org-a' }
        expect((await request(headers)).status).toBe(200)
        expect((await request({ ...headers, 'x-principal-user-id': 'reader' })).status).toBe(200)
        expect((await request({ ...headers, 'x-principal-user-id': 'manager' })).status).toBe(401)
        await db.getRepository(RolePermission).update('chat-grant', { enabled: false })
        expect((await request(headers)).status).toBe(403)
        await db.getRepository(User).update('reader', { isActive: false })
        expect((await request(headers)).status).toBe(401)
    })

    it('preserves technical Assistant compatibility without granting management or workspace access', async () => {
        await key({ userId: 'technical' })
        const response = await request()
        expect(response.status).toBe(200)
        expect((await response.json()).principal).toMatchObject({
            id: 'technical',
            type: UserType.COMMUNICATION,
            resourceScope: { kind: 'assistant', xpertId: 'assistant-a' }
        })
        expect((await request({}, 'manage')).status).toBe(403)
        await db.getRepository(ApiKey).update('key', { type: ApiKeyBindingType.WORKSPACE })
        expect((await request()).status).toBe(403)
    })

    it.each([ApiKeyBindingType.INTEGRATION, ApiKeyBindingType.CLIENT])(
        'keeps %s service identities instead of falling back to a human',
        async (type) => {
            await key({ type })
            const record = await handler.execute(new UseApiKeyQuery('fixture-resource-token'))
            const principal = await service.resolvePrincipal(record)
            expect(principal).toMatchObject({ id: 'technical', type: UserType.COMMUNICATION })
            expect(principal.resourceScope).toBeUndefined()
            expect((await request()).status).toBe(403)
        }
    )

    it('hydrates the API-key-backed client-secret same-user path and observes revocation', async () => {
        await key()
        secretTokens.findBySecret.mockResolvedValue({
            id: 'secret',
            entityId: 'key',
            createdById: 'reader',
            type: SecretTokenBindingType.API_KEY,
            validUntil: new Date(Date.now() + 60_000)
        })
        const headers = { 'x-client-secret': 'cs-x-fixture', 'organization-id': 'org-a' }
        const response = await request(headers, 'secret')
        expect(response.status).toBe(200)
        expect((await response.json()).principal).toMatchObject({
            id: 'reader',
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.API_KEY
        })
        await db.getRepository(RolePermission).update('chat-grant', { enabled: false })
        expect((await request(headers, 'secret')).status).toBe(403)
        await db.getRepository(ApiKey).update('key', { revokedAt: new Date() })
        expect((await request(headers, 'secret')).status).toBe(401)
    })
})
