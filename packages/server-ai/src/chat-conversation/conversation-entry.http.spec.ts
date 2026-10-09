import { ForbiddenException, INestApplication } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { GroupAccessService } from '../chat-group/group-access.service'
import { GetGroupConversationEntryHandler } from '../chat-group/group-conversation-entry.handler'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { ChatConversationController } from './conversation.controller'
import { ChatConversationService } from './conversation.service'
import { ChatConversationGoalService } from './goal'
import { WorkbenchAssistantConversationNavigationService } from './workbench-assistant-conversation-navigation.service'

describe('Conversation entry HTTP boundary', () => {
    let app: INestApplication
    let origin: string
    const conversation = {
        id: 'conversation',
        threadId: 'thread',
        xpertId: 'assistant',
        title: 'Chat',
        purpose: null,
        options: { privateConfiguration: true },
        messages: [{ content: 'private content' }]
    }
    const service = { findOneByThreadId: jest.fn(), assertAccess: jest.fn() }
    const access = { authorize: jest.fn() }
    const run = jest.fn((_org: string, work: () => Promise<unknown>) => work())
    const get = (query = 'threadId=thread') => fetch(`${origin}/entry-by-thread?${query}`)

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [CqrsModule],
            controllers: [ChatConversationController],
            providers: [
                GetGroupConversationEntryHandler,
                { provide: GroupAccessService, useValue: access },
                { provide: ChatConversationService, useValue: service },
                { provide: ChatConversationGoalService, useValue: {} },
                { provide: SuperAdminOrganizationScopeService, useValue: { run } },
                { provide: WorkbenchAssistantConversationNavigationService, useValue: {} }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(async () => app?.close())
    beforeEach(() => {
        jest.clearAllMocks()
        service.findOneByThreadId.mockResolvedValue(conversation)
        service.assertAccess.mockResolvedValue(conversation)
        access.authorize.mockResolvedValue({ group: { ...conversation, purpose: 'group' } })
    })

    it('authorizes private chats and preserves a branch thread without exposing private fields', async () => {
        const response = await get('threadId=%20branch-thread%20&organizationId=org')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            id: 'conversation',
            threadId: 'branch-thread',
            xpertId: 'assistant',
            title: 'Chat',
            purpose: 'private'
        })
        expect(service.findOneByThreadId).toHaveBeenCalledWith('branch-thread')
        expect(run).toHaveBeenCalledWith('org', expect.any(Function))
        expect(service.assertAccess).toHaveBeenCalledWith(conversation)
        expect(access.authorize).not.toHaveBeenCalled()
    })

    it('resolves group metadata through membership authorization instead of private conversation access', async () => {
        service.findOneByThreadId.mockResolvedValue({ ...conversation, purpose: 'group' })
        const response = await get()
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            id: 'conversation',
            threadId: 'thread',
            xpertId: 'assistant',
            title: 'Chat',
            purpose: 'group'
        })
        expect(access.authorize).toHaveBeenCalledWith('conversation')
        expect(service.assertAccess).not.toHaveBeenCalled()
    })

    it('preserves group membership denial', async () => {
        service.findOneByThreadId.mockResolvedValue({ ...conversation, purpose: 'group' })
        access.authorize.mockRejectedValueOnce(new ForbiddenException('Membership required'))
        const response = await get()
        expect(response.status).toBe(403)
        expect(await response.json()).toMatchObject({ message: 'Membership required' })
    })

    it.each([null, 'group_assistant_runtime'])(
        'keeps existing private/runtime access checks for %s',
        async (purpose) => {
            service.findOneByThreadId.mockResolvedValue({ ...conversation, purpose })
            service.assertAccess.mockRejectedValueOnce(new ForbiddenException('Conversation denied'))
            const response = await get()
            expect(response.status).toBe(403)
            expect(await response.json()).toMatchObject({ message: 'Conversation denied' })
            expect(access.authorize).not.toHaveBeenCalled()
        }
    )

    it.each(['', 'threadId=', 'threadId=%20%20', `threadId=${'x'.repeat(101)}`, 'threadId=a&threadId=b'])(
        'validates the required thread before lookup: %s',
        async (query) => {
            expect((await get(query)).status).toBe(400)
            expect(service.findOneByThreadId).not.toHaveBeenCalled()
            expect(access.authorize).not.toHaveBeenCalled()
        }
    )
})
