import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { messageBranching } from '../chat-message/message-branching'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { ConversationAgentRunsService } from '../ai/conversation-agent-runs.service'
import { ChatConversationThread } from './conversation-thread.entity'
import { MessageCheckpointService } from './message-checkpoint.service'

function fixture() {
    const head = Object.assign(new ChatMessage(), {
        id: 'last-ai',
        conversationId: 'conversation',
        createdInThreadId: 'thread',
        role: 'ai',
        executionId: 'run',
        content: 'Final answer',
        status: XpertAgentExecutionStatusEnum.SUCCESS,
        tenantId: 'tenant',
        organizationId: 'org'
    })
    const thread = Object.assign(new ChatConversationThread(), {
        threadId: 'thread',
        conversationId: 'conversation',
        headMessageId: head.id,
        runControl: { executionId: 'run', state: 'running' },
        tenantId: 'tenant',
        organizationId: 'org'
    })
    const update = jest.fn(async (_id: unknown, value: Partial<ChatMessage>) => Object.assign(head, value))
    const findMessage = jest.fn(async () => head)
    const findMessages = jest.fn(async () => [head])
    const ancestors = jest.fn(async () => [head])
    const files = jest.fn(async () => [{ fileAssetId: 'file-at-completion' }])
    const runs = jest.fn(async () => new Map([[head.id, [{ id: 'child-run', status: 'success' }]]]))
    const rows = [
        { checkpoint_ns: '', checkpoint_id: 'root-later' },
        { checkpoint_ns: 'child', checkpoint_id: 'child-final' },
        { checkpoint_ns: '', checkpoint_id: 'root-exact' },
        { checkpoint_ns: 'child', checkpoint_id: 'child-earlier' }
    ]
    const service = new MessageCheckpointService(
        {
            findOne: findMessage,
            find: findMessages,
            update,
            manager: {
                getRepository: () => ({ find: files }),
                getTreeRepository: () => ({ findAncestors: ancestors })
            }
        } as unknown as Repository<ChatMessage>,
        { findOne: async () => thread } as unknown as Repository<ChatConversationThread>,
        { find: async () => rows } as unknown as Repository<CopilotCheckpoint>,
        { forMessages: runs } as unknown as ConversationAgentRunsService
    )
    return {
        service,
        head,
        thread,
        update,
        findMessage,
        findMessages,
        ancestors,
        rows,
        files,
        runs,
        root: { threadId: 'thread', checkpointNs: '', checkpointId: 'root-exact' }
    }
}

describe('MessageCheckpointService', () => {
    it('binds a terminal snapshot after delayed steer processing creates the final bubble', async () => {
        const test = fixture()
        await test.service.capture('run', test.root, 'revision')
        const final = Object.assign(new ChatMessage(), test.head, {
            id: 'final-after-steer',
            parentId: test.head.id,
            content: 'Final steer response',
            outputCheckpoint: null
        })
        test.thread.headMessageId = final.id
        test.findMessage.mockResolvedValue(final)
        test.ancestors.mockResolvedValue([test.head, final])
        const result = await test.service.finalize(final)
        expect(result.id).toBe(final.id)
        expect(result.branching).toEqual({ available: true })
        expect(final.outputCheckpoint.checkpoint).toEqual(test.root)
        expect(test.update).toHaveBeenCalledWith(
            { id: 'last-ai', conversationId: 'conversation' },
            { outputCheckpoint: null }
        )
        expect(messageBranching(test.head).available).toBe(false)
    })

    it('seals only the current bubble at the exact root boundary, with child namespace state', async () => {
        const test = fixture()
        await test.service.capture('run', test.root, 'revision')
        expect(test.findMessage).toHaveBeenCalledWith({
            where: expect.objectContaining({ id: 'last-ai', executionId: 'run' })
        })
        expect(test.head.outputCheckpoint.checkpoints).toEqual([
            test.root,
            { threadId: 'thread', checkpointNs: 'child', checkpointId: 'child-final' }
        ])
        expect(messageBranching(test.head).available).toBe(false)
        const result = await test.service.finalize(test.head, { knowledgebases: ['kb'] })
        expect(result.branching).toEqual({ available: true })
        expect(result).not.toHaveProperty('outputCheckpoint')
        expect(test.head.outputCheckpoint).toMatchObject({
            options: { knowledgebases: ['kb'] },
            fileAssetIds: ['file-at-completion'],
            agentRuns: [{ id: 'child-run', status: 'success' }]
        })
    })

    it('ignores a stale run instead of assigning its checkpoint to a newer message', async () => {
        const test = fixture()
        await test.service.capture('older-run', test.root, 'revision')
        expect(test.update).not.toHaveBeenCalled()
    })

    it('does not fabricate a missing exact checkpoint from the latest one', async () => {
        const test = fixture()
        await test.service.capture('run', { ...test.root, checkpointId: 'missing' }, 'revision')
        expect(test.update).not.toHaveBeenCalled()
    })

    it('keeps failed messages unavailable even when a graph reached a checkpoint', async () => {
        const test = fixture()
        await test.service.capture('run', test.root, 'revision')
        test.head.status = XpertAgentExecutionStatusEnum.ERROR
        const result = await test.service.finalize(test.head)
        expect(result.branching).toEqual({ available: false, reason: 'message_not_complete' })
        expect(test.runs).not.toHaveBeenCalled()
    })

    it('invalidates incomplete snapshots while preserving the successful reply', async () => {
        const test = fixture()
        await test.service.capture('run', test.root, 'revision')
        test.runs.mockRejectedValueOnce(new Error('snapshot failed'))
        const result = await test.service.finalize(test.head)
        expect(test.head.outputCheckpoint).toBeNull()
        expect(result.status).toBe('success')
        expect(result.branching.available).toBe(false)
    })
})
