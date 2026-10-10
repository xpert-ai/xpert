import { INestApplication, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RoleGuard } from '@xpert-ai/server-core'
import { init } from 'i18next'
import { PluginApplicationController } from '../plugin-application.controller'
import { PluginApplicationService } from '../plugin-application.service'

describe('application initialize HTTP validation', () => {
    const service = {
        initialize: jest.fn(),
        prepare: jest.fn(),
        bindToolset: jest.fn(),
        discardConfiguration: jest.fn()
    }
    let app: INestApplication
    let origin: string
    let allowed = true
    const selection = { key: 'requirement', toolsetId: '11111111-1111-4111-8111-111111111111' }
    const input = { pluginName: '@acme/app', appName: 'example', operationId: 'operation', toolsets: [selection] }

    beforeAll(async () => {
        await init({
            lng: 'en',
            resources: {
                en: { 'server-ai': { Error: { ApplicationInitializeRequestInvalid: 'Invalid setup request' } } }
            }
        })
        const module = await Test.createTestingModule({
            controllers: [PluginApplicationController],
            providers: [{ provide: PluginApplicationService, useValue: service }]
        })
            .overrideGuard(RoleGuard)
            .useValue({ canActivate: () => allowed })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        allowed = true
        service.initialize.mockReset().mockResolvedValue({ status: 'ready' })
        service.prepare.mockReset().mockResolvedValue({ status: 'configuring', workspaceId: selection.toolsetId })
        service.bindToolset.mockReset().mockResolvedValue({ status: 'configuring' })
        service.discardConfiguration.mockReset().mockResolvedValue({ status: 'not_installed' })
    })
    afterAll(async () => app?.close())
    const request = (body: unknown) =>
        fetch(`${origin}/plugin-applications/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })

    it('accepts only source IDs and transforms whitespace through the actual route pipe', async () => {
        expect((await request({ ...input, appName: ' example ' })).status).toBe(201)
        expect(service.initialize).toHaveBeenCalledWith(input)
    })
    it.each([
        { ...input, workspaceId: 'injected' },
        { ...input, tenantId: 'injected' },
        { ...input, organizationId: 'injected' },
        { ...input, credentials: { api_key: 'secret' } },
        { ...input, toolsets: [{ ...selection, credentials: {} }] },
        { ...input, toolsets: [selection, selection] },
        { ...input, toolsets: [{ ...selection, toolsetId: '../foreign' }] },
        { ...input, toolsets: 'invalid' },
        { ...input, operationId: '' }
    ])('rejects malformed selections or injected authority fields', async (body) => {
        const response = await request(body)
        expect(response.status).toBe(400)
        expect((await response.json()).message).toBe('Invalid setup request')
        expect(service.initialize).not.toHaveBeenCalled()
    })
    it('retains compatibility for applications without toolsets', async () => {
        expect((await request({ pluginName: '@acme/app', appName: 'example', operationId: 'op' })).status).toBe(201)
    })
    it('preserves role restrictions and business authorization errors', async () => {
        allowed = false
        expect((await request(input)).status).toBe(403)
        expect(service.initialize).not.toHaveBeenCalled()
        allowed = true
        service.initialize.mockRejectedValueOnce(new ForbiddenException())
        expect((await request(input)).status).toBe(403)
    })

    it.each(['prepare', 'bind-toolset', 'discard-configuration'])(
        'validates scope-free %s requests and restricts roles',
        async (route) => {
            const body = {
                pluginName: input.pluginName,
                appName: input.appName,
                ...(route === 'bind-toolset' ? selection : {})
            }
            const post = (payload: object) =>
                fetch(`${origin}/plugin-applications/${route}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
            expect((await post(body)).status).toBe(201)
            for (const field of ['workspaceId', 'organizationId', 'tenantId', 'credentials']) {
                expect((await post({ ...body, [field]: 'injected' })).status).toBe(400)
            }
            if (route === 'bind-toolset') expect((await post({ ...body, toolsetId: 'null' })).status).toBe(400)
            allowed = false
            expect((await post(body)).status).toBe(403)
        }
    )
})
