import { ChatThreadPurpose, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ThreadRecoveryService } from './thread-recovery.service'

function fixture() {
    const conversation = Object.assign(new ChatConversation(), {
        id: 'conversation',
        threadId: 'failed',
        workingThreadRevision: 2,
        tenantId: 'tenant',
        organizationId: 'org',
        xpertId: 'assistant',
        projectId: 'project'
    })
    const source = Object.assign(new ChatConversationThread(), {
        threadId: 'source',
        conversationId: 'conversation',
        tenantId: 'tenant',
        organizationId: 'org',
        status: 'idle',
        conversation
    })
    const thread = Object.assign(new ChatConversationThread(), {
        ...source,
        id: 'failed-row',
        threadId: 'failed',
        parentThreadId: 'source',
        status: 'error',
        error: 'original failure',
        metadata: { purpose: ChatThreadPurpose.MessageEdit }
    })
    const manager = {
        findOne: jest.fn(async (entity: unknown, options: { where: { threadId?: string } }) =>
            entity === ChatConversation ? conversation : options.where.threadId === 'source' ? source : thread
        ),
        save: jest.fn(async (value: object) => value)
    }
    const findOne = jest
        .fn()
        .mockResolvedValue({ id: 'execution', status: XpertAgentExecutionStatusEnum.ERROR, error: 'original failure' })
    const execute = jest.fn().mockResolvedValue({ graph: { nodes: [], connections: [] } })
    const threads = {
        requireByThreadId: jest.fn().mockResolvedValue(thread),
        findByThreadId: jest.fn().mockResolvedValue(source)
    }
    const service = new ThreadRecoveryService(
        threads as unknown as ChatConversationThreadService,
        { execute } as unknown as QueryBus,
        {
            manager: { findOne },
            transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager)
        } as unknown as DataSource
    )
    return { conversation, thread, source, manager, findOne, threads, service }
}

it('explains a legacy failure without a checkpoint and offers only its authorized source', async () => {
    const f = fixture()
    await expect(f.service.describe('failed')).resolves.toMatchObject({
        canRetry: false,
        reason: 'conversation_recovery_unavailable',
        originalError: 'original failure',
        sourceThreadId: 'source'
    })
})

it('returns to source without deleting history or changing the project, and is idempotent', async () => {
    const f = fixture()
    await expect(f.service.returnToSource('failed')).resolves.toBe(f.source)
    expect(f.conversation).toMatchObject({ threadId: 'source', workingThreadRevision: 3, projectId: 'project' })
    await f.service.returnToSource('failed')
    expect(f.manager.save).toHaveBeenCalledTimes(1)
    expect(f.thread.error).toBe('original failure')
})

it('does not replace a branch selected by another page', async () => {
    const f = fixture()
    f.conversation.threadId = 'other'
    await expect(f.service.returnToSource('failed')).rejects.toMatchObject({
        response: { code: 'conversation_branch_selection_changed' }
    })
    expect(f.manager.save).not.toHaveBeenCalled()
})

it.each(['busy', 'pausing', 'paused'] as const)('does not return away from a %s execution', async (status) => {
    const f = fixture()
    f.thread.status = status
    await expect(f.service.returnToSource('failed')).rejects.toThrow()
    expect(f.manager.save).not.toHaveBeenCalled()
})

it('rejects a source outside the conversation scope', async () => {
    const f = fixture()
    f.source.organizationId = 'another-org'
    await expect(f.service.describe('failed')).resolves.not.toHaveProperty('sourceThreadId')
    await expect(f.service.returnToSource('failed')).rejects.toThrow()
    expect(f.manager.save).not.toHaveBeenCalled()
})

it('keeps an empty new thread free of recovery warnings', async () => {
    const f = fixture()
    f.thread.error = null
    f.findOne.mockResolvedValue(null)
    await expect(f.service.describe('failed')).resolves.not.toHaveProperty('reason')
})

it('allows source navigation when that source also has an old graph, without authorizing execution', async () => {
    const f = fixture()
    f.source.metadata = { forkGraphRevision: 'old-graph' }
    await expect(f.service.returnToSource('failed')).resolves.toBe(f.source)
})
