jest.mock('./template-installation.service', () => ({ TemplateInstallationService: class {} }))
jest.mock('@xpert-ai/server-core', () => jest.requireActual('../../../../server/src/shared/pipes/zod-validation.pipe'))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { TemplateInstallationController } from './template-installation.controller'
import { TemplateInstallationService } from './template-installation.service'

describe('Template installation HTTP contract', () => {
    let app: INestApplication
    let origin: string
    const id = '10000000-0000-4000-8000-000000000001'
    const input = { templateId: 'test-template', workspaceId: id, idempotencyKey: 'request-0001' }
    const service = {
        create: jest.fn(async () => ({ id })),
        get: jest.fn(async () => ({ id })),
        list: jest.fn(async () => ({ items: [], total: 0 })),
        retry: jest.fn(async () => ({ id }))
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [TemplateInstallationController],
            providers: [{ provide: TemplateInstallationService, useValue: service }]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    const post = (path: string, body: unknown) =>
        fetch(origin + '/xpert-template-installations' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('accepts a creation intent with normalized defaults and returns 202', async () => {
        expect((await post('', input)).status).toBe(202)
        expect(service.create).toHaveBeenLastCalledWith({ ...input, publish: false, capabilities: [] })
    })
    it.each([
        { ...input, resumeXpertId: id },
        { ...input, newXpertId: id },
        { ...input, organizationId: id },
        { ...input, userId: id },
        { ...input, publish: 'true' },
        { ...input, workspaceId: 'invalid' },
        { ...input, idempotencyKey: 'bad key' },
        { ...input, basic: { copilotModel: { copilot: { apiKey: 'secret' } } } },
        { ...input, basic: { realtimeVoice: { modelId: 'voice' } } },
        { ...input, capabilities: [''] }
    ])('rejects invalid or server-owned fields at the HTTP boundary', async (body) => {
        const before = service.create.mock.calls.length
        expect((await post('', body)).status).toBe(400)
        expect(service.create).toHaveBeenCalledTimes(before)
    })
    it('binds retries to the stored intent and rejects input changes', async () => {
        expect((await post('/' + id + '/retry', {})).status).toBe(202)
        expect(service.retry).toHaveBeenLastCalledWith(id)
        expect((await post('/' + id + '/retry', { basic: { name: 'other' } })).status).toBe(400)
        expect((await post('/bad/retry', {})).status).toBe(400)
    })
    it('validates reads and paginates installation history', async () => {
        expect((await fetch(origin + '/xpert-template-installations/' + id)).status).toBe(200)
        expect((await fetch(origin + '/xpert-template-installations?workspaceId=' + id)).status).toBe(200)
        expect(service.list).toHaveBeenLastCalledWith({ workspaceId: id, take: 20, skip: 0 })
        for (const query of ['take=101', 'take=-1', 'skip=-1', 'userId=' + id])
            expect((await fetch(origin + '/xpert-template-installations?workspaceId=' + id + '&' + query)).status).toBe(
                400
            )
    })
})
