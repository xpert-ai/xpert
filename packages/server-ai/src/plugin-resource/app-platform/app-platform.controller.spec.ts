import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { AuthService } from '@xpert-ai/server-core'
import { sign } from 'jsonwebtoken'
import { JwtStrategy } from '../../../../server/src/auth/strategies/jwt.strategy'
import { BasicStrategy } from '../../../../server/src/auth/strategies/basic.strategy'
import { AuthGuard } from '../../../../server/src/shared/guards/auth.guard'
import { EndpointPermissionInterceptor } from '../../../../server/src/shared/guards/endpoint-permission.interceptor'
import { AppPlatformController } from './app-platform.controller'
import { AppPlatformService } from './app-platform.service'
import { PlatformUpdateService } from './platform-update.service'

const secret = 'app-platform-controller-test-secret'
const deliveryId = '00000000-0000-4000-8000-000000000001'
const expectedDigest = 'a'.repeat(64)
const userId = '00000000-0000-4000-8000-000000000002'
const use = AIPermissionsEnum.APPLICATION_USE
const install = AIPermissionsEnum.APPLICATION_INSTALL

describe('App platform HTTP boundary', () => {
    let app: INestApplication
    let origin: string
    let grants: AIPermissionsEnum[]
    const platform = { presentation: jest.fn(), ensureForCurrentUser: jest.fn() }
    const updates = { list: jest.fn(), adopt: jest.fn() }
    const getAuthenticatedUser = jest.fn()
    const token = sign({ id: userId }, secret, { expiresIn: '1h' })

    const request = (path: string, options: { body?: object; anonymous?: boolean } = {}) =>
        fetch(`${origin}/app-platform/${path}`, {
            method: options.body === undefined ? 'GET' : 'POST',
            headers: {
                ...(options.anonymous ? {} : { authorization: `Bearer ${token}` }),
                ...(options.body === undefined ? {} : { 'content-type': 'application/json' })
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body)
        })

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AppPlatformController],
            providers: [
                JwtStrategy,
                BasicStrategy,
                { provide: AuthService, useValue: { getAuthenticatedUser, validateUser: jest.fn() } },
                { provide: ConfigService, useValue: { get: () => secret } },
                { provide: AppPlatformService, useValue: platform },
                { provide: PlatformUpdateService, useValue: updates }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        const reflector = module.get(Reflector)
        app.useGlobalGuards(new AuthGuard(reflector))
        app.useGlobalInterceptors(new EndpointPermissionInterceptor(reflector))
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })

    afterAll(() => app?.close())

    beforeEach(() => {
        jest.clearAllMocks()
        grants = [use]
        getAuthenticatedUser.mockImplementation(async () => ({
            id: userId,
            tenantId: 'tenant',
            roleId: 'role',
            role: {
                id: 'role',
                rolePermissions: grants.map((permission) => ({
                    permission,
                    enabled: true,
                    roleId: 'role',
                    tenantId: 'tenant'
                }))
            }
        }))
        platform.presentation.mockReturnValue({ mode: 'managed-apps', branding: { name: 'Test' } })
        platform.ensureForCurrentUser.mockResolvedValue({ ready: false, apps: [] })
        updates.list.mockResolvedValue({ items: [], total: 0 })
        updates.adopt.mockResolvedValue({ ready: true })
    })

    it('exposes presentation without authentication or account initialization', async () => {
        const response = await request('presentation', { anonymous: true })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ mode: 'managed-apps', branding: { name: 'Test' } })
        expect(getAuthenticatedUser).not.toHaveBeenCalled()
        expect(platform.ensureForCurrentUser).not.toHaveBeenCalled()
    })

    it.each([
        { path: 'me' },
        { path: 'retry', body: {} },
        { path: 'deliveries' },
        { path: 'adopt-definition', body: { deliveryId, expectedDigest } }
    ])('requires global authentication for $path', async ({ path, body }) => {
        expect((await request(path, { body, anonymous: true })).status).toBe(401)
        expect(platform.ensureForCurrentUser).not.toHaveBeenCalled()
        expect(updates.list).not.toHaveBeenCalled()
        expect(updates.adopt).not.toHaveBeenCalled()
    })

    it('lets application users inspect and retry only their current account', async () => {
        expect((await request('me')).status).toBe(200)
        expect(platform.ensureForCurrentUser).toHaveBeenNthCalledWith(1)
        expect((await request('retry', { body: {} })).status).toBe(201)
        expect(platform.ensureForCurrentUser).toHaveBeenNthCalledWith(2, true)
    })

    it.each(['me', 'retry'])('requires APPLICATION_USE for %s', async (path) => {
        grants = [install]
        expect((await request(path, { body: path === 'retry' ? {} : undefined })).status).toBe(403)
        expect(platform.ensureForCurrentUser).not.toHaveBeenCalled()
    })

    it('denies management endpoints to application-only grants', async () => {
        expect((await request('deliveries')).status).toBe(403)
        expect((await request('adopt-definition', { body: { deliveryId, expectedDigest } })).status).toBe(403)
        expect(updates.list).not.toHaveBeenCalled()
        expect(updates.adopt).not.toHaveBeenCalled()
    })

    it('uses management permission independently of APPLICATION_USE', async () => {
        grants = [install]
        expect((await request('deliveries')).status).toBe(200)
        expect(updates.list).toHaveBeenLastCalledWith({ skip: 0, take: 50 })
        expect((await request(`deliveries?skip=25&take=10&userId=${userId}`)).status).toBe(200)
        expect(updates.list).toHaveBeenLastCalledWith({ skip: 25, take: 10, userId })
        expect((await request('adopt-definition', { body: { deliveryId, expectedDigest } })).status).toBe(201)
        expect(updates.adopt).toHaveBeenCalledWith(deliveryId, expectedDigest)
    })

    it.each(['take=101', 'skip=-1', 'take=1.5', 'userId=invalid', 'tenantId=other'])(
        'rejects invalid list parameters: %s',
        async (query) => {
            grants = [install]
            const response = await request(`deliveries?${query}`)
            expect(response.status).toBe(400)
            expect(await response.json()).toMatchObject({ code: 'invalid_application_retry' })
            expect(updates.list).not.toHaveBeenCalled()
        }
    )

    it.each([
        { deliveryId: 'invalid', expectedDigest },
        { deliveryId, expectedDigest: 'invalid' },
        { deliveryId },
        { deliveryId, expectedDigest, definition: {} },
        { deliveryId, expectedDigest, filePath: '/tmp/definition.json' }
    ])('rejects invalid or client-supplied upgrade configuration (%j)', async (body) => {
        grants = [install]
        const response = await request('adopt-definition', { body })
        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({ code: 'application_update_conflict' })
        expect(updates.adopt).not.toHaveBeenCalled()
    })

    it.each([{ userId }, { deliveryId }, { organizationId: 'other' }, { configuration: {} }])(
        'rejects retry scope overrides (%j)',
        async (body) => {
            const response = await request('retry', { body })
            expect(response.status).toBe(400)
            expect(await response.json()).toMatchObject({ code: 'invalid_application_retry' })
            expect(platform.ensureForCurrentUser).not.toHaveBeenCalled()
        }
    )
})
