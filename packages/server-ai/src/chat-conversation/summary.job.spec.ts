import { executionIdentityFixture } from '../shared/testing/execution-identity.fixture'
import { ResolveExecutionIdentityCommand } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { Job } from 'bull'
import { ConversationSummaryProcessor, ConversationSummaryReqType } from './summary.job'

describe('ordinary conversation summary boundary', () => {
    const conversations = { findOne: jest.fn() }
    const messages = { findOne: jest.fn() }
    const commands = { execute: jest.fn() }
    const processor = new ConversationSummaryProcessor(
        {} as never,
        conversations as never,
        messages as never,
        commands as never,
        { waitUntilReady: async () => undefined } as never
    )
    const job = {
        data: { conversationId: 'conversation', userId: 'human', types: [] }
    } as Job<ConversationSummaryReqType>
    beforeEach(() => {
        jest.clearAllMocks()
        messages.findOne.mockResolvedValue({})
    })
    it.each(['group', 'group_assistant_runtime'])(
        'does not feed %s messages into ordinary personal-memory summarization',
        async (purpose) => {
            conversations.findOne.mockResolvedValue({ purpose, messages: [{ id: 'message' }] })
            await processor.process(job)
            expect(messages.findOne).not.toHaveBeenCalled()
            expect(commands.execute).not.toHaveBeenCalled()
        }
    )
    it.each(['private', null])('continues ordinary summary processing for %s conversations', async (purpose) => {
        conversations.findOne.mockResolvedValue({ purpose, messages: [{ id: 'message' }] })
        await processor.process(job)
        expect(messages.findOne).toHaveBeenCalledWith('message')
    })
    it('restores fresh permissions for persisted ownership and rejects a mismatched queue actor', async () => {
        conversations.findOne.mockResolvedValue({
            id: 'conversation',
            createdById: 'human',
            tenantId: 'tenant',
            organizationId: 'org',
            xpertId: 'assistant',
            messages: [{ id: 'message' }]
        })
        messages.findOne.mockResolvedValue({ id: 'message', conversationId: 'conversation', executionId: 'execution' })
        commands.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof ResolveExecutionIdentityCommand) return executionIdentityFixture(command.actor)
            expect(RequestContext.currentUserId()).toBe('human')
            expect(RequestContext.getOrganizationId()).toBe('org')
            return undefined
        })
        await processor.process(job)
        expect(commands.execute).toHaveBeenCalledWith(
            new ResolveExecutionIdentityCommand({
                userId: 'human',
                tenantId: 'tenant',
                organizationId: 'org',
                kind: 'user'
            })
        )
        commands.execute.mockClear()
        await expect(
            processor.process({ ...job, data: { ...job.data, userId: 'other' } } as Job<ConversationSummaryReqType>)
        ).rejects.toThrow()
        expect(commands.execute).not.toHaveBeenCalled()
    })
})
