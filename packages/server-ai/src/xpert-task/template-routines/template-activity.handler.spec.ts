import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TemplateActivityHandler } from './template-activity.handler'
import { TemplateActivityCommand } from './template-activity.command'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { AssistantUserPreferenceService } from '../../xpert/assistant-user-preference.service'
import { XpertTask } from '../xpert-task.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'

describe('routine activity ownership and acknowledgement', () => {
    const runs = { find: jest.fn() },
        tasks = { find: jest.fn() },
        conversations = { find: jest.fn() }
    const preferences = { getDomain: jest.fn(), compareAndSetDomain: jest.fn() }
    const published = { getAccessiblePublishedXpertForCurrentUser: jest.fn() }
    let handler: TemplateActivityHandler
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                TemplateActivityHandler,
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity) =>
                            entity === XpertTask ? tasks : entity === ChatConversation ? conversations : runs
                    }
                },
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: AssistantUserPreferenceService, useValue: preferences }
            ]
        }).compile()
        handler = module.get(TemplateActivityHandler)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        published.getAccessiblePublishedXpertForCurrentUser.mockResolvedValue({
            id: 'assistant',
            tenantId: 'tenant',
            organizationId: 'org'
        })
        tasks.find.mockResolvedValue([{ id: 'task', name: 'review' }])
        runs.find.mockResolvedValue([
            { id: 'run', taskId: 'task', status: 'succeeded', scheduledAt: new Date(), conversationId: 'conversation' }
        ])
        conversations.find.mockResolvedValue([{ id: 'conversation', status: 'interrupted', threadId: 'thread' }])
        preferences.getDomain.mockResolvedValue(null)
    })
    afterEach(() => jest.restoreAllMocks())
    it('scopes task ownership and shows durable approval instead of stream completion', async () => {
        const result = await handler.execute(new TemplateActivityCommand('assistant'))
        expect(tasks.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant',
                    organizationId: 'org',
                    xpertId: 'assistant',
                    runAsUserId: 'user'
                })
            })
        )
        expect(result.items[0]).toMatchObject({
            status: 'awaiting_approval',
            unread: true,
            key: 'run:awaiting_approval'
        })
    })
    it('acknowledges only visible states and avoids notifying again after reload', async () => {
        await handler.execute(new TemplateActivityCommand('assistant', { keys: ['run:awaiting_approval'] }))
        preferences.getDomain.mockResolvedValue({ read: ['run:awaiting_approval'] })
        expect((await handler.execute(new TemplateActivityCommand('assistant'))).unread).toBe(0)
        conversations.find.mockResolvedValue([{ id: 'conversation', status: 'idle', threadId: 'thread' }])
        expect((await handler.execute(new TemplateActivityCommand('assistant'))).items[0]).toMatchObject({
            status: 'succeeded',
            unread: true
        })
    })
    it('distinguishes a manually paused run from approval', async () => {
        conversations.find.mockResolvedValue([{ id: 'conversation', status: 'paused', threadId: 'thread' }])
        expect((await handler.execute(new TemplateActivityCommand('assistant'))).items[0].status).toBe('paused')
    })
    it('does not acknowledge a state that changed during review', async () => {
        await expect(
            handler.execute(new TemplateActivityCommand('assistant', { keys: ['other:succeeded'] }))
        ).rejects.toMatchObject({ status: 400 })
        expect(preferences.compareAndSetDomain).not.toHaveBeenCalled()
    })
    it('rechecks Assistant access before reading executions', async () => {
        published.getAccessiblePublishedXpertForCurrentUser.mockRejectedValue(new Error('revoked'))
        await expect(handler.execute(new TemplateActivityCommand('assistant'))).rejects.toThrow('revoked')
        expect(runs.find).not.toHaveBeenCalled()
    })
})
