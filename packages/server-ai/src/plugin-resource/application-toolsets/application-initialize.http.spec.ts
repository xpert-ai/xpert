import { INestApplication, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { init } from 'i18next'
import { PluginApplicationController } from '../plugin-application.controller'
import { PluginApplicationService } from '../plugin-application.service'

describe('application initialize HTTP validation', () => {
    const service = {
        getDetail: jest.fn().mockResolvedValue({ status: { status: 'not_installed' } }),
        initialize: jest.fn(),
        prepare: jest.fn(),
        bindToolset: jest.fn(),
        discardConfiguration: jest.fn()
    }
    let app: INestApplication
    let origin: string
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
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
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

    it('validates the scope selector on the actual detail query boundary', async () => {
        const params = new URLSearchParams({
            pluginName: input.pluginName,
            appName: input.appName,
            installationScope: 'personal'
        })
        expect((await fetch(`${origin}/plugin-applications/detail?${params}`)).status).toBe(200)
        expect(service.getDetail).toHaveBeenCalledWith(input.pluginName, input.appName, 'personal')
        params.set('ownerUserId', 'injected')
        expect((await fetch(`${origin}/plugin-applications/detail?${params}`)).status).toBe(400)
        params.delete('ownerUserId')
        params.append('installationScope', 'organization')
        expect((await fetch(`${origin}/plugin-applications/detail?${params}`)).status).toBe(400)
    })

    it('accepts only source IDs and transforms whitespace through the actual route pipe', async () => {
        expect((await request({ ...input, appName: ' example ' })).status).toBe(201)
        expect(service.initialize).toHaveBeenCalledWith(input)
    })
    it('accepts and trims the speech model option ID through the route pipe', async () => {
        expect((await request({ ...input, speechToTextModelId: ' speech-provider/model ' })).status).toBe(201)
        expect(service.initialize).toHaveBeenCalledWith({ ...input, speechToTextModelId: 'speech-provider/model' })
    })
    it.each([
        { ...input, speechToTextModelId: '' },
        { ...input, speechToTextModelId: { copilotId: 'injected' } },
        { ...input, workspaceId: 'injected' },
        { ...input, ownerUserId: 'injected' },
        { ...input, installationScope: ['personal'] },
        { ...input, installationScope: 'user' },
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
    it('accepts an installation choice without accepting the owner', async () => {
        expect((await request({ ...input, installationScope: 'personal' })).status).toBe(201)
        expect(service.initialize).toHaveBeenCalledWith({ ...input, installationScope: 'personal' })
    })
    it('retains compatibility for applications without toolsets', async () => {
        expect((await request({ pluginName: '@acme/app', appName: 'example', operationId: 'op' })).status).toBe(201)
    })
    it('preserves scope-aware business authorization errors', async () => {
        service.initialize.mockRejectedValueOnce(new ForbiddenException())
        expect((await request(input)).status).toBe(403)
    })

    it.each(['prepare', 'bind-toolset', 'discard-configuration'])(
        'validates %s requests without accepting owner identity',
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
        }
    )
})
