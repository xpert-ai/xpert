import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DEFAULT_MODEL_DEFINITIONS } from '@xpert-ai/contracts'
import { PermissionGuard } from '@xpert-ai/server-core'
import { CopilotRoleDefaultController } from './role-default.controller'
import { CopilotRoleDefaultService } from './role-default.service'

describe('default model HTTP validation', () => {
    let app: INestApplication
    let url: string
    const service = { save: jest.fn().mockResolvedValue([]) }
    const defaults = DEFAULT_MODEL_DEFINITIONS.map(({ role }) => ({ role, mode: 'disabled' }))
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [CopilotRoleDefaultController],
            providers: [{ provide: CopilotRoleDefaultService, useValue: service }]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    afterAll(async () => {
        await app?.close()
    })
    const put = (body: unknown) =>
        fetch(`${url}/role-defaults`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('passes all eleven typed defaults through the HTTP pipe', async () => {
        expect((await put({ defaults })).status).toBe(200)
        expect(service.save).toHaveBeenCalledWith(defaults)
    })
    it.each([
        { defaults, tenantId: 'untrusted-scope' },
        { defaults: [...defaults, defaults[0]] },
        { defaults: [{ role: 'unknown', mode: 'disabled' }] },
        {
            defaults: [
                { role: 'tts', mode: 'fixed', binding: { model: 'voice', modelType: 'tts', copilotId: 'bad-id' } }
            ]
        }
    ])('rejects invalid roles, scope overrides and malformed bindings', async (body) => {
        service.save.mockClear()
        expect((await put(body)).status).toBe(400)
        expect(service.save).not.toHaveBeenCalled()
    })
})
