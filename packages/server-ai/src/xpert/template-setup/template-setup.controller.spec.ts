import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { AssistantTemplateSetupController } from './template-setup.controller'
import { INestApplication } from '@nestjs/common'

describe('template setup HTTP boundaries', () => {
    let app: INestApplication
    let origin: string
    const put = (path: string, body: unknown) =>
        fetch(origin + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    const execute = jest.fn().mockResolvedValue({ state: { revision: 1 } })
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AssistantTemplateSetupController],
            providers: [{ provide: CommandBus, useValue: { execute } }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(() => app.close())
    beforeEach(() => execute.mockClear())
    it('accepts parsed preference updates', async () => {
        expect(
            (await put('/assistant/template-setup', { revision: 0, preferences: { language: ' Chinese ' } })).status
        ).toBe(200)
        expect(execute.mock.calls[0][0].update.preferences).toEqual({ language: 'Chinese' })
    })
    it.each([
        { revision: '0' },
        { revision: 0, userId: 'another-user' },
        { revision: 0, preferences: { language: 42 } },
        { revision: 0, connector: { key: 'calendar', selection: { choice: 'binding', bindingId: 'not-uuid' } } }
    ])('rejects malformed updates %j', async (body) => {
        expect((await put('/assistant/template-setup', body)).status).toBe(400)
        expect(execute).not.toHaveBeenCalled()
    })
    it('rejects task ownership overrides', async () => {
        expect(
            (
                await put('/assistant/template-setup/routines/daily', {
                    enabled: true,
                    expression: '0 9 * * *',
                    timeZone: 'Asia/Shanghai',
                    runAsUserId: 'other'
                })
            ).status
        ).toBe(400)
        expect(execute).not.toHaveBeenCalled()
    })
})
