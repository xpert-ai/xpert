import { ChatThreadPurpose, TXpertGraph, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ThreadRecoveryService } from './thread-recovery.service'
import { legacyThreadGraphRevision, threadGraphRevision } from '../thread-graph-revision'
import { GetXpertWorkflowQuery } from '../../xpert/queries/get-xpert-workflow.query'

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
    return { conversation, thread, source, manager, findOne, threads, service, execute }
}

it.each(['layout', 'logic', 'legacy-same', 'legacy-layout', 'missing-revision'] as const)(
    'reports retry capability consistently for %s without executing or rewriting history',
    async (change) => {
        const f = fixture()
        const graph: TXpertGraph = {
            nodes: [
                { key: 'agent', type: 'agent', position: { x: 0, y: 0 }, entity: { key: 'agent', prompt: 'original' } }
            ],
            connections: []
        }
        const saved = change.startsWith('legacy') ? legacyThreadGraphRevision(graph) : threadGraphRevision(graph)
        const recovery = {
            version: 1,
            graphRevision: saved,
            input: { threadId: 'failed', checkpointNs: '', checkpointId: 'input' },
            latest: { threadId: 'failed', checkpointNs: '', checkpointId: 'loop' }
        }
        f.findOne.mockResolvedValue({
            id: 'execution',
            checkpointId: 'loop',
            error: 'original failure',
            metadata: change === 'missing-revision' ? {} : { recovery }
        })
        f.thread.metadata.forkGraphRevision = saved
        if (change === 'layout' || change === 'legacy-layout') graph.nodes[0].position.x = 500
        if (change === 'logic' && graph.nodes[0].type === 'agent') graph.nodes[0].entity.prompt = 'different'
        f.execute.mockImplementation(async (query: unknown) =>
            query instanceof GetXpertWorkflowQuery
                ? { graph }
                : {
                      config: { configurable: { thread_id: 'failed', checkpoint_ns: '', checkpoint_id: 'input' } },
                      metadata: { source: 'input' }
                  }
        )

        const result = await f.service.describe('failed')

        expect(result.canRetry).toBe(change === 'layout' || change === 'legacy-same')
        if (!result.canRetry)
            expect(result.reason).toBe(
                change === 'missing-revision' ? 'conversation_recovery_unavailable' : 'conversation_graph_changed'
            )
        expect(f.thread.error).toBe('original failure')
        expect(f.thread.metadata.forkGraphRevision).toBe(saved)
        expect(f.manager.save).not.toHaveBeenCalled()
    }
)

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
