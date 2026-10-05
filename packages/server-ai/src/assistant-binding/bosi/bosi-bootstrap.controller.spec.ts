jest.mock('./bosi-bootstrap.service', () => ({ BosiBootstrapService: class {} }))
jest.mock('@xpert-ai/server-core', () => jest.requireActual('../../../../server/src/shared/pipes/zod-validation.pipe'))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { BosiBootstrapController } from './bosi-bootstrap.controller'
import { BosiBootstrapService } from './bosi-bootstrap.service'

describe('Bosi HTTP validation', () => {
    let app: INestApplication
    let origin: string
    const service = {
        setup: jest.fn(async () => ({})),
        create: jest.fn(async () => ({})),
        chooseOnboarding: jest.fn(async () => ({})),
        onboardingConnection: jest.fn(async () => ({})),
        resolveOnboardingConnection: jest.fn(async () => ({}))
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [BosiBootstrapController],
            providers: [{ provide: BosiBootstrapService, useValue: service }]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    const post = (path: string, body: unknown) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('converts query choices and applies an empty capability default', async () => {
        expect((await fetch(origin + '/bosi/setup?capabilities=desktop-shell,cloud-computer')).status).toBe(200)
        expect(service.setup).toHaveBeenLastCalledWith(['desktop-shell', 'cloud-computer'])
        expect((await post('/bosi/bootstrap', { modelId: 'model' })).status).toBe(201)
        expect(service.create).toHaveBeenLastCalledWith({ modelId: 'model', capabilities: [] })
    })
    it('rejects unknown capabilities, extra fields and invalid input at HTTP boundary', async () => {
        for (const body of [
            { modelId: 'm', organizationId: 'other' },
            { modelId: 'm', capabilities: ['unknown'] },
            { modelId: '' }
        ]) {
            const result = await post('/bosi/bootstrap', body)
            expect(result.status).toBe(400)
            expect((await result.json()).message).toBe('server-ai:Error.BosiInvalidInput')
        }
        expect((await fetch(origin + '/bosi/setup?unexpected=1')).status).toBe(400)
    })
    it('validates onboarding mutations and excludes caller-supplied scope', async () => {
        const choice = { kind: 'plugin', id: 'plugin', revision: 0, selected: true }
        expect((await post('/bosi/onboarding/choice', choice)).status).toBe(201)
        expect(service.chooseOnboarding).toHaveBeenLastCalledWith(choice)
        for (const body of [
            { ...choice, organizationId: 'other' },
            { ...choice, revision: -1 },
            { ...choice, selected: 'true' },
            { ...choice, kind: 'native-plugin' }
        ])
            expect((await post('/bosi/onboarding/choice', body)).status).toBe(400)
        expect((await post('/bosi/onboarding/connection', { provider: 'mail' })).status).toBe(201)
        expect(service.onboardingConnection).toHaveBeenLastCalledWith('mail')
        expect((await post('/bosi/onboarding/connection', { provider: 'mail', workspaceId: 'other' })).status).toBe(400)
        expect(
            (await post('/bosi/onboarding/connection/resolve', { workspaceId: 'bad', bindingId: 'bad' })).status
        ).toBe(400)
    })
})
