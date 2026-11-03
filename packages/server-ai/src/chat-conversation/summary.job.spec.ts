import { executionIdentityFixture } from '../shared/testing/execution-identity.fixture'
import { ResolveExecutionIdentityCommand } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import type { Job } from 'bull'
import { XpertSummarizeMemoryCommand } from '../xpert'
import { ConversationSummaryProcessor, ConversationSummaryReqType } from './summary.job'

describe('ordinary conversation summary boundary', () => {
    const conversations = { findOne: jest.fn(), assertAccess: jest.fn() }
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
        jest.resetAllMocks()
        conversations.findOne.mockResolvedValue({
            id: 'conversation',
            createdById: 'human',
            tenantId: 'tenant',
            organizationId: 'org',
            xpertId: 'assistant',
            threadId: 'thread',
            messages: [{ id: 'message' }]
        })
        messages.findOne.mockResolvedValue({ id: 'message', conversationId: 'conversation', executionId: 'execution' })
        conversations.assertAccess.mockImplementation(async () => {
            expect(RequestContext.currentUserId()).toBe('human')
            expect(RequestContext.getOrganizationId()).toBe('org')
        })
        commands.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof ResolveExecutionIdentityCommand) return executionIdentityFixture(command.actor)
            expect(RequestContext.currentUserId()).toBe('human')
            expect(RequestContext.getOrganizationId()).toBe('org')
            return undefined
        })
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
    it('restores fresh permissions before checking conversation contribution access', async () => {
        await processor.process(job)
        expect(commands.execute).toHaveBeenCalledWith(
            new ResolveExecutionIdentityCommand({
                userId: 'human',
                tenantId: 'tenant',
                organizationId: 'org',
                kind: 'user'
            })
        )
        expect(conversations.assertAccess).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'conversation' }),
            'contribute'
        )
    })
    it('summarizes feedback from an authorized Project contributor who did not create the conversation', async () => {
        const conversation = await conversations.findOne()
        conversations.findOne.mockResolvedValue({
            ...conversation,
            createdById: 'another-member',
            projectId: 'project'
        })
        await processor.process(job)
        expect(conversations.assertAccess).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'project', createdById: 'another-member' }),
            'contribute'
        )
        expect(commands.execute).toHaveBeenCalledWith(
            new XpertSummarizeMemoryCommand('assistant', 'thread', 'execution', {
                types: [],
                isDraft: true,
                userId: 'human'
            })
        )
    })
    it('rejects revoked contribution access before summarizing or recording success', async () => {
        conversations.assertAccess.mockRejectedValueOnce(new ForbiddenException())
        await expect(processor.process(job)).rejects.toBeInstanceOf(ForbiddenException)
        expect(commands.execute).toHaveBeenCalledTimes(1)
        expect(commands.execute).toHaveBeenCalledWith(expect.any(ResolveExecutionIdentityCommand))
    })
    it.each([{ tenantId: 'other-tenant' }, { organizationId: 'other-org' }])(
        'rejects queue scope mismatches before restoring an actor: %s',
        async (scope) => {
            await expect(
                processor.process({ ...job, data: { ...job.data, ...scope } } as Job<ConversationSummaryReqType>)
            ).rejects.toBeInstanceOf(ForbiddenException)
            expect(commands.execute).not.toHaveBeenCalled()
        }
    )
    it('rejects a summary message from another conversation', async () => {
        messages.findOne.mockResolvedValue({ conversationId: 'other-conversation', executionId: 'execution' })
        await expect(processor.process(job)).rejects.toBeInstanceOf(ForbiddenException)
        expect(commands.execute).not.toHaveBeenCalled()
    })
})
