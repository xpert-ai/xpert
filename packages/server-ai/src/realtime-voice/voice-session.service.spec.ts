import { VoiceSessionService } from './voice-session.service'
import { Repository } from 'typeorm'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { RedisClientType } from 'redis'
import { RealtimeVoiceSession, RealtimeVoiceTurn } from './voice.entity'
import { PublishedXpertAccessService } from '../xpert'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversationThreadService } from '../chat-conversation/conversation-thread.service'
import { voiceOriginAllowed } from './voice.gateway'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const scope = { tenantId: id, organizationId: id, userId: id, assistantId: id, conversationId: id, threadId: id }
function fixture() {
    const rows = { findOneBy: jest.fn(), update: jest.fn(), save: jest.fn(), create: jest.fn((row) => row) }
    const redis = { getDel: jest.fn(), set: jest.fn(), eval: jest.fn() }
    const queries = { execute: jest.fn().mockResolvedValue({ ...scope, xpertId: id, id }) }
    const assistants = {
        getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
            features: {
                realtimeVoice: {
                    enabled: true,
                    voice: 'test',
                    copilotModel: { copilotId: id, model: 'realtime', modelType: 'realtime' }
                }
            }
        })
    }
    const service = new VoiceSessionService(
        rows as unknown as Repository<RealtimeVoiceSession>,
        {} as Repository<RealtimeVoiceTurn>,
        redis as unknown as RedisClientType,
        queries as unknown as QueryBus,
        {} as CommandBus,
        assistants as unknown as PublishedXpertAccessService,
        {} as AgentMiddlewareRegistry,
        {} as ChatConversationThreadService
    )
    return { service, rows, redis, queries, assistants }
}
describe('voice session authorization and one-time admission', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(id)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(id)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(id)
    })
    afterEach(() => jest.restoreAllMocks())
    it('does not confuse a readable conversation in another organization with admission', async () => {
        const { service, queries, assistants } = fixture()
        queries.execute.mockResolvedValue({ ...scope, organizationId: other, xpertId: id, id })
        await expect(service.authorize(id)).rejects.toThrow()
        expect(assistants.getAccessiblePublishedXpert).not.toHaveBeenCalled()
    })
    it('rejects disabled published voice capability', async () => {
        const { service, assistants } = fixture()
        assistants.getAccessiblePublishedXpert.mockResolvedValue({ features: {} })
        await expect(service.authorize(id)).rejects.toThrow()
    })
    it('consumes admission only once and checks persisted status', async () => {
        const { service, redis, rows } = fixture()
        redis.getDel.mockResolvedValueOnce(id).mockResolvedValueOnce(null)
        rows.findOneBy.mockResolvedValue({ id, scope, status: 'connecting', expiresAt: new Date(Date.now() + 1000) })
        await expect(service.consume('ticket')).resolves.toMatchObject({ id })
        await expect(service.consume('ticket')).rejects.toThrow()
        rows.findOneBy.mockClear()
        redis.getDel.mockResolvedValueOnce(id)
        rows.findOneBy.mockResolvedValue({ id, scope, status: 'ended', expiresAt: new Date(Date.now() + 1000) })
        await expect(service.consume('ticket')).rejects.toThrow()
    })
    it('only accepts explicitly allowed web origins and opaque desktop origins', () => {
        expect(voiceOriginAllowed('https://bosi.example', 'web', ['https://bosi.example'])).toBe(true)
        expect(voiceOriginAllowed('https://bosi.example.evil', 'web', ['https://bosi.example'])).toBe(false)
        expect(voiceOriginAllowed('null', 'web', [])).toBe(false)
        expect(voiceOriginAllowed(undefined, 'desktop', [])).toBe(false)
        expect(voiceOriginAllowed('null', 'desktop', [])).toBe(true)
    })
})
