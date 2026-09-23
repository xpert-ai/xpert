import type { IChatMessage } from '@xpert-ai/contracts'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { branchMessageHash, branchMessagePathHash, messageBranching, publicChatMessage } from './message-branching'

describe('message branching capability', () => {
    const reference = { threadId: 'thread', checkpointNs: '', checkpointId: 'checkpoint' }
    function sealed(): Partial<IChatMessage> {
        const message: Partial<IChatMessage> = {
            role: 'ai',
            status: XpertAgentExecutionStatusEnum.SUCCESS,
            content: 'Answer'
        }
        message.outputCheckpoint = {
            version: 1,
            checkpoint: reference,
            checkpoints: [reference],
            graphRevision: 'revision',
            messageHash: branchMessageHash(message),
            messagePathHash: branchMessagePathHash([message])
        }
        return message
    }
    it('advertises only finalized, unchanged messages', () => {
        expect(messageBranching(sealed())).toEqual({ available: true })
        expect(messageBranching({ ...sealed(), content: 'Edited outside the graph' })).toEqual({
            available: false,
            reason: 'checkpoint_unavailable'
        })
        expect(messageBranching({ ...sealed(), status: 'thinking' })).toEqual({
            available: false,
            reason: 'message_not_complete'
        })
        expect(messageBranching({ role: 'human' })).toBeUndefined()
    })
    it('does not infer legacy or steer boundaries from a successful run', () => {
        expect(
            messageBranching({
                role: 'ai',
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                executionId: 'successful-run'
            })
        ).toEqual({ available: false, reason: 'checkpoint_unavailable' })
    })
    it('never exposes internal checkpoints on the stream', () => {
        const visible = publicChatMessage({ ...sealed(), historicalAgentRuns: [] })
        expect(visible).not.toHaveProperty('outputCheckpoint')
        expect(visible).not.toHaveProperty('historicalAgentRuns')
        expect(visible.branching).toEqual({ available: true })
        expect(visible.agentRuns).toEqual([])
    })

    it('exposes sealed execution timing without exposing checkpoint state', () => {
        const message = sealed()
        message.outputCheckpoint.agentRuns = [{ id: 'root', isRoot: true, elapsedTime: 479000 }]
        const visible = publicChatMessage(message)
        expect(visible.agentRuns).toEqual(message.outputCheckpoint.agentRuns)
        expect(visible).not.toHaveProperty('outputCheckpoint')
        expect(visible.historical).not.toBe(true)
    })
})
