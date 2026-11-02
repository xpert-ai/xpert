import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversationController } from './conversation.controller'
import { ChatConversationService } from './conversation.service'
import { ChatConversationGoalService } from './goal'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { WorkbenchAssistantConversationNavigationService } from './workbench-assistant-conversation-navigation.service'
import { unreadSnapshot } from './unread-sync'

describe('unread conditional synchronization HTTP', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const service = { getUnreadByXperts: jest.fn() }
    let app: INestApplication
    let url: string
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ChatConversationController],
            providers: [
                { provide: ChatConversationService, useValue: service },
                { provide: ChatConversationGoalService, useValue: {} },
                { provide: CommandBus, useValue: {} },
                { provide: QueryBus, useValue: {} },
                { provide: WorkbenchAssistantConversationNavigationService, useValue: {} },
                {
                    provide: SuperAdminOrganizationScopeService,
                    useValue: { run: (_id: string, fn: () => unknown) => fn() }
                }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/unread/xperts/sync`
    })
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        service.getUnreadByXperts
            .mockReset()
            .mockResolvedValue([{ xpertId: id, unreadMessages: 1, unreadConversations: 1 }])
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())
    const post = (body: unknown) =>
        fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    it('returns no body when unchanged, and sends changes including removals', async () => {
        const first = await post({ xpertIds: [id] })
        expect(first.status).toBe(200)
        const snapshot = await first.json()
        const unchanged = await post({ xpertIds: [id], version: snapshot.version })
        expect(unchanged.status).toBe(204)
        expect(await unchanged.text()).toBe('')
        service.getUnreadByXperts.mockResolvedValue([])
        const deleted = await post({ xpertIds: [id], version: snapshot.version })
        expect(deleted.status).toBe(200)
        expect(await deleted.json()).toMatchObject({ items: [] })
    })
    it('does not reuse a version across users or organizations', () => {
        const items = [{ xpertId: id, unreadMessages: 0, unreadConversations: 0 }]
        expect(unreadSnapshot(items, ['tenant', 'org', 'a']).version).not.toBe(
            unreadSnapshot(items, ['tenant', 'org', 'b']).version
        )
        expect(unreadSnapshot(items, ['tenant', 'org', 'a']).version).not.toBe(
            unreadSnapshot(items, ['tenant', 'other', 'a']).version
        )
    })
    it.each([
        { xpertIds: ['invalid'] },
        { xpertIds: [id], version: 'invalid' },
        { xpertIds: [id], userId: 'override' }
    ])('rejects invalid scope overrides and sync input', async (body) => {
        expect((await post(body)).status).toBe(400)
        expect(service.getUnreadByXperts).not.toHaveBeenCalled()
    })
})
