import { INestApplication, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PluginApplicationController } from '../plugin-application.controller'
import { PluginApplicationService } from '../plugin-application.service'

// Exercise the actual Nest boundary: method calls alone cannot test Zod wiring.
describe('application update HTTP boundary', () => {
    const service = { updateApplication: jest.fn(), updateProgress: jest.fn() }
    let app: INestApplication, origin: string
    const input = { pluginName: 'plugin', appName: 'app', operationId: '5ba81aa5-978e-4664-9f81-f66dcd3e5ddb' }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [PluginApplicationController],
            providers: [{ provide: PluginApplicationService, useValue: service }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        service.updateApplication.mockReset().mockResolvedValue({ status: 'completed' })
        service.updateProgress.mockReset().mockResolvedValue(null)
    })
    afterAll(async () => app?.close())
    const request = (body: object) =>
        fetch(`${origin}/plugin-applications/update`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('normalizes selectors and defaults resume without accepting authority from the browser', async () => {
        expect((await request({ ...input, appName: ' app ' })).status).toBe(201)
        expect(service.updateApplication).toHaveBeenCalledWith({ ...input, resume: false })
    })
    it.each([
        { workspaceId: 'foreign' },
        { tenantId: 'foreign' },
        { organizationId: 'foreign' },
        { ownerUserId: 'foreign' },
        { installationScope: ['personal'] },
        { resume: 'false' },
        { operationId: 'bad' },
        { templates: [] }
    ])('rejects malformed input or injected scope', async (extra) => {
        expect((await request({ ...input, ...extra })).status).toBe(400)
        expect(service.updateApplication).not.toHaveBeenCalled()
    })
    it('validates progress queries and preserves authorization errors', async () => {
        expect(
            (
                await fetch(
                    `${origin}/plugin-applications/update?pluginName=plugin&appName=app&installationScope=personal`
                )
            ).status
        ).toBe(200)
        expect(service.updateProgress).toHaveBeenCalledWith({
            pluginName: 'plugin',
            appName: 'app',
            installationScope: 'personal'
        })
        expect(
            (await fetch(`${origin}/plugin-applications/update?pluginName=plugin&appName=app&workspaceId=foreign`))
                .status
        ).toBe(400)
        service.updateApplication.mockRejectedValue(new ForbiddenException('denied'))
        expect((await request(input)).status).toBe(403)
    })
})
