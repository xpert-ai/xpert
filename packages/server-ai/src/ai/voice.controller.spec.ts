import { INestApplication, ForbiddenException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { init } from 'i18next'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { AssistantThreadScopeGuard } from './assistant-thread-scope.guard'
import { VoiceController, VoiceCapabilityController } from './voice.controller'
import { VoiceSessionService } from '../realtime-voice/voice-session.service'
import { VoiceTaskService } from '../realtime-voice/voice-task.service'

const id = '11111111-1111-4111-8111-111111111111'
describe('voice HTTP boundary', () => {
    const sessions = { create: jest.fn(), available: jest.fn(), authorize: jest.fn(), get: jest.fn(), end: jest.fn() }
    let app: INestApplication
    let origin: string
    beforeAll(async () => {
        await init({
            lng: 'en',
            resources: {
                en: { 'server-ai': { Error: { RealtimeConfigurationInvalid: 'Invalid voice configuration' } } }
            }
        })
        const module = await Test.createTestingModule({
            controllers: [VoiceController, VoiceCapabilityController],
            providers: [
                { provide: VoiceSessionService, useValue: sessions },
                { provide: VoiceTaskService, useValue: { list: jest.fn() } }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(AssistantThreadScopeGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        sessions.create.mockResolvedValue({ sessionId: id })
    })
    afterAll(async () => app?.close())
    const request = (body: unknown, threadId = id) =>
        fetch(`${origin}/threads/${threadId}/voice/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it('uses authentication and exact persisted thread scope guards', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, VoiceController)).toEqual([
            ApiKeyOrClientSecretAuthGuard,
            AssistantThreadScopeGuard
        ])
    })
    it('applies web origin default through the real HTTP pipe', async () => {
        expect((await request({ assistantId: id })).status).toBe(201)
        expect(sessions.create).toHaveBeenCalledWith(id, 'web', id)
    })
    it.each([
        {},
        { assistantId: id, originMode: 'native' },
        { assistantId: id, tenantId: id },
        { assistantId: '../other' }
    ])('rejects malformed or injected fields: %j', async (body) => {
        const response = await request(body)
        expect(response.status).toBe(400)
        expect((await response.json()).message).toBe('Invalid voice configuration')
        expect(sessions.create).not.toHaveBeenCalled()
    })
    it('rejects malformed thread ids before admission', async () => {
        expect((await request({ assistantId: id }, 'not-a-uuid')).status).toBe(406)
        expect(sessions.create).not.toHaveBeenCalled()
    })
    it('preserves business authorization denial', async () => {
        sessions.create.mockRejectedValueOnce(new ForbiddenException('Denied'))
        expect((await request({ assistantId: id })).status).toBe(403)
    })
})
