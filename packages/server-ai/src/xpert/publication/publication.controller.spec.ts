jest.mock('../guards/xpert.guard', () => ({
    XpertGuard: class XpertGuard {
        canActivate() {
            return true
        }
    }
}))
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { XpertGuard } from '../guards/xpert.guard'
import { XpertPublicationController } from './publication.controller'

describe('publication recovery HTTP boundary', () => {
    let app: INestApplication, origin: string
    let allowed = true
    const commands = { execute: jest.fn().mockResolvedValue({ version: '2' }) }
    beforeAll(async () => {
        app = (
            await Test.createTestingModule({
                controllers: [XpertPublicationController],
                providers: [{ provide: CommandBus, useValue: commands }]
            })
                .overrideGuard(XpertGuard)
                .useValue({ canActivate: () => allowed })
                .compile()
        ).createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(() => app.close())
    beforeEach(() => {
        commands.execute.mockClear()
        allowed = true
    })
    const post = (body: object) =>
        fetch(`${origin}/assistant/publication/resume`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        })
    it.each([{}, { version: '' }, { version: 2 }, { version: '2', organizationId: 'other' }])(
        'rejects invalid recovery input before invoking the handler',
        async (body) => {
            expect((await post(body)).status).toBe(400)
            expect(commands.execute).not.toHaveBeenCalled()
        }
    )
    it('normalizes the version and requests activation only', async () => {
        expect((await post({ version: ' 2 ' })).status).toBe(201)
        expect(commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'assistant',
                resumePublished: true,
                expectedPublishedVersion: '2',
                newVersion: false
            })
        )
    })
    it('retains the authoring guard', async () => {
        allowed = false
        expect((await post({ version: '2' })).status).toBe(403)
        expect(commands.execute).not.toHaveBeenCalled()
    })
})
