jest.mock('./assistant-appearance.service', () => ({ AssistantAppearanceService: class {} }))
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('../../../../server/src/shared/pipes/zod-validation.pipe'),
    ...jest.requireActual('../../../../server/src/shared/pipes/uuid-validation.pipe')
}))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ForbiddenException, ConflictException } from '@nestjs/common'
import { AssistantAppearanceController } from './assistant-appearance.controller'
import { AssistantAppearanceService } from './assistant-appearance.service'

const assistantId = '10000000-0000-4000-8000-000000000001'
const characterConfig = {
    shape: 'star',
    eyes: 'toon',
    mouth: 'smile',
    motion: 'float',
    eyeSize: 1.2,
    eyeSpacing: 0.8,
    brows: 'raised',
    ink: 'auto',
    tilt: 5,
    speed: 1.5,
    blink: true
}

describe('Public Assistant appearance HTTP contract', () => {
    let app: INestApplication
    let origin: string
    const service = { get: jest.fn(), save: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AssistantAppearanceController],
            providers: [{ provide: AssistantAppearanceService, useValue: service }]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    beforeEach(() => {
        jest.resetAllMocks()
        service.save.mockResolvedValue({ id: assistantId })
    })
    const request = (body: unknown, id = assistantId) =>
        fetch(origin + `/${id}/appearance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    const saveAvatar = (avatar: unknown) => request({ name: 'Quill', revision: 'a'.repeat(64), avatar })
    const post = (appearance: unknown) => saveAvatar({ url: '/preview.png', appearance })
    it('keeps legacy pets compatible and forwards v1/v2 metadata without changing appearance version', async () => {
        for (const spriteVersionNumber of [undefined, 1, 2]) {
            const appearance = {
                version: 1,
                kind: 'pet',
                id: 'future-pet',
                spriteVersionNumber,
                asset: { type: 'sprite-atlas', url: '/pet.webp' }
            }
            expect((await post(appearance)).status).toBe(201)
            expect(service.save).toHaveBeenLastCalledWith(
                assistantId,
                expect.objectContaining({
                    avatar: expect.objectContaining({ appearance: JSON.parse(JSON.stringify(appearance)) })
                })
            )
        }
    })
    it('rejects unsupported versions and unknown fields at the route boundary', async () => {
        for (const spriteVersionNumber of [0, 3, '2', null]) {
            const response = await post({ version: 1, kind: 'pet', id: 'pet', spriteVersionNumber })
            expect(response.status).toBe(400)
        }
        expect((await post({ version: 1, kind: 'pet', id: 'pet', spriteVersionNumber: 2, script: 'run' })).status).toBe(
            400
        )
        expect(service.save).not.toHaveBeenCalled()
    })
    it.each([
        { emoji: { id: 'robot', set: 'apple' }, useNotoColor: true },
        { url: '/avatar.png', appearance: { version: 1, kind: 'image' } },
        { appearance: { version: 1, kind: 'character', id: 'custom-future-character', color: '#ffcc66' } },
        {
            appearance: { version: 1, kind: 'character', id: 'my-character', color: '#ffcc66', config: characterConfig }
        },
        { appearance: { version: 1, kind: 'pet', id: 'unlisted-future-pet' } },
        { appearance: { version: 1, kind: 'pet', id: 'my-pet', asset: { type: 'animated-image', url: '/pet.gif' } } }
    ])('accepts legacy and extensible avatar settings: %p', async (avatar) => {
        expect((await saveAvatar(avatar)).status).toBe(201)
        expect(service.save).toHaveBeenCalledWith(assistantId, expect.objectContaining({ avatar }))
    })
    it.each([
        { appearance: { version: 1, kind: 'image' } },
        { url: 'javascript:alert(1)' },
        { url: 'data:image/svg+xml,svg' },
        { url: '//untrusted.example/avatar.png' },
        { appearance: { version: 1, kind: 'pet', id: 'pet', asset: { type: 'script', url: '/pet.js' } } },
        { appearance: { version: 1, kind: 'pet', id: '../pet' } },
        { appearance: { version: 1, kind: 'character', id: 'custom', color: 'red' } }
    ])('rejects invalid images and resource descriptors before saving: %p', async (avatar) => {
        expect((await saveAvatar(avatar)).status).toBe(400)
        expect(service.save).not.toHaveBeenCalled()
    })
    it.each([
        { eyeSize: 2 },
        { eyeSpacing: 0 },
        { tilt: 16 },
        { speed: 0 },
        { blink: 'yes' },
        { shape: 'script' },
        { unknown: true }
    ])('validates character controls: %p', async (override) => {
        const response = await post({
            version: 1,
            kind: 'character',
            id: 'custom',
            color: '#ffcc66',
            config: { ...characterConfig, ...override }
        })
        expect(response.status).toBe(400)
        expect(service.save).not.toHaveBeenCalled()
    })
    it('trims the name and rejects unknown identity fields, blank names and invalid revisions', async () => {
        const body = { name: '  Quill  ', revision: 'a'.repeat(64), avatar: {} }
        expect((await request(body)).status).toBe(201)
        expect(service.save).toHaveBeenCalledWith(assistantId, { ...body, name: 'Quill' })
        service.save.mockClear()
        for (const override of [{ name: '  ' }, { revision: 'stale' }, { prompt: 'overwrite workflow' }]) {
            const response = await request({ ...body, ...override })
            expect(response.status).toBe(400)
            expect((await response.json()).message).toBe('server-ai:Error.AssistantAppearanceInvalid')
        }
        expect(service.save).not.toHaveBeenCalled()
    })
    it('validates the Assistant ID on both routes', async () => {
        expect((await fetch(origin + '/bad/appearance')).status).toBe(406)
        expect((await request({ name: 'Quill', revision: 'a'.repeat(64), avatar: {} }, 'bad')).status).toBe(406)
        expect(service.get).not.toHaveBeenCalled()
        expect(service.save).not.toHaveBeenCalled()
    })
    it('returns read-only identity data and preserves edit permission and conflict errors', async () => {
        const identity = { canEdit: false, name: 'Quill', avatar: {}, revision: 'a'.repeat(64) }
        service.get.mockResolvedValue(identity)
        const result = await fetch(origin + `/${assistantId}/appearance`)
        expect(result.status).toBe(200)
        expect(await result.json()).toEqual(identity)
        for (const error of [new ForbiddenException(), new ConflictException()]) {
            service.save.mockRejectedValueOnce(error)
            expect((await saveAvatar({})).status).toBe(error.getStatus())
        }
    })
})
