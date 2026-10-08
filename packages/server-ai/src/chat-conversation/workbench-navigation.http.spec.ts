import { ForbiddenException, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ChatConversationController } from './conversation.controller'
import { ChatConversationService } from './conversation.service'
import { ChatConversationGoalService } from './goal'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { WorkbenchAssistantConversationNavigationService } from './workbench-assistant-conversation-navigation.service'

describe('Workbench navigation HTTP validation', () => {
    let app: INestApplication
    let origin: string
    const get = (query: object) =>
        fetch(
            `${origin}/${id}/workbench-navigation?${new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (Array.isArray(value) ? value.map((item) => [key, item]) : [[key, String(value)]])))}`
        )
    const resolve = jest.fn().mockResolvedValue({ threadId: 'side' })
    const id = 'ed3b1d1a-caa7-42e9-b8b4-cc4873bb194e'
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ChatConversationController],
            providers: [
                { provide: ChatConversationService, useValue: {} },
                { provide: ChatConversationGoalService, useValue: {} },
                { provide: CommandBus, useValue: {} },
                { provide: QueryBus, useValue: {} },
                {
                    provide: SuperAdminOrganizationScopeService,
                    useValue: { run: (_org: string, work: () => Promise<unknown>) => work() }
                },
                { provide: WorkbenchAssistantConversationNavigationService, useValue: { resolve } }
            ]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    beforeEach(() => resolve.mockClear())
    it('keeps old requests working and normalizes an optional precise anchor', async () => {
        expect((await get({ requesterXpertId: id })).status).toBe(200)
        expect(resolve).toHaveBeenLastCalledWith(id, id, { threadId: undefined, messageId: undefined })
        expect((await get({ requesterXpertId: id, threadId: ' side ', messageId: id })).status).toBe(200)
        expect(resolve).toHaveBeenLastCalledWith(id, id, { threadId: 'side', messageId: id })
    })
    it('preserves authorization errors from the navigation resolver', async () => {
        resolve.mockRejectedValueOnce(new ForbiddenException('Navigation denied'))
        const response = await get({ requesterXpertId: id, threadId: 'side', messageId: id })
        expect(response.status).toBe(403)
        expect(await response.json()).toMatchObject({ message: 'Navigation denied' })
    })

    it.each([
        { messageId: 'not-a-uuid' },
        { threadId: '' },
        { threadId: '   ' },
        { threadId: 'x'.repeat(101) },
        { threadId: ['side', 'other'] },
        { messageId: [id, id] }
    ])('rejects invalid anchors before authorization: %j', async (query) => {
        expect((await get(query)).status).toBe(400)
        expect(resolve).not.toHaveBeenCalled()
    })
})
