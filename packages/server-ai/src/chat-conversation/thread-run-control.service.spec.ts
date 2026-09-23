import { ThreadDTO } from '../ai/dto/thread.dto'
import { ChatConversation } from './conversation.entity'
import { readThreadDisplayPause } from './thread-display-pause'
import { ConflictException } from '@nestjs/common'
import { instanceToPlain } from 'class-transformer'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { ChatConversationThread } from './conversation-thread.entity'
import { ThreadRunControlService } from './thread-run-control.service'

describe('ThreadRunControlService', () => {
    function setup() {
        const thread = {
            threadId: 'thread',
            status: 'busy',
            runControl: {
                state: 'running',
                executionId: 'run',
                graphRevision: 'revision'
            }
        } as ChatConversationThread
        const checkpoint = { checkpoint_id: 'saved' }
        const manager = {
            getRepository: jest.fn((entity: unknown) => ({
                findOne: jest.fn(async () => (entity === ChatConversationThread ? thread : checkpoint))
            })),
            save: jest.fn(async () => thread)
        } as unknown as EntityManager
        const service = new ThreadRunControlService(
            { findOne: jest.fn(async () => thread) } as unknown as Repository<ChatConversationThread>,
            { transaction: async (work: (m: EntityManager) => Promise<unknown>) => work(manager) } as DataSource
        )
        return { thread, service, manager }
    }

    const snapshot = JSON.stringify({ version: 1, messages: [{ type: 'ai', content: 'Visible prefix' }] })

    it('retains a copied graph revision through failed first attempts and clears it on success', async () => {
        const { thread, service } = setup()
        thread.metadata = { forkGraphRevision: 'revision' }
        await service.recordGraph('thread', 'run', 'revision')
        expect(thread.metadata.forkGraphRevision).toBe('revision')
        await service.finish('thread', 'run', 'error')
        await service.start('thread', 'retry')
        await expect(service.recordGraph('thread', 'retry', 'changed')).rejects.toBeInstanceOf(ConflictException)
        await service.recordGraph('thread', 'retry', 'revision')
        await service.finish('thread', 'retry', 'idle')
        expect(thread.metadata.forkGraphRevision).toBeUndefined()
    })

    it('exposes the snapshot only in thread detail and keeps it out of public metadata', async () => {
        const { thread, service } = setup()
        await service.requestPause('thread', 'run', snapshot)
        const conversation = { id: 'conversation' } as ChatConversation
        const detail = instanceToPlain(new ThreadDTO(conversation, undefined, thread))
        const listItem = instanceToPlain(new ThreadDTO(conversation, undefined, thread, false))
        expect(detail.displayPause.snapshot).toBe(snapshot)
        expect(detail.metadata.chatkitDisplayPause).toBeUndefined()
        expect(listItem.displayPause.pauseId).toBe(detail.displayPause.pauseId)
        expect(listItem.displayPause.snapshot).toBeUndefined()
    })

    it('saves the first display snapshot atomically and retains it after natural completion', async () => {
        const { thread, service } = setup()
        const result = await service.requestPause('thread', 'run', snapshot)
        expect(result.displayPause.snapshot).toBe(snapshot)
        const duplicate = await service.requestPause('thread', 'run', JSON.stringify({ version: 1, messages: [] }))
        expect(duplicate.displayPause.snapshot).toBe(snapshot)
        await service.finish('thread', 'run', 'idle')
        expect(thread.runControl).toBeNull()
        expect(readThreadDisplayPause(thread).snapshot).toBe(snapshot)
        await expect(service.releaseDisplayPause('thread', 'stale-token')).rejects.toBeInstanceOf(ConflictException)
        await service.releaseDisplayPause('thread', result.pauseId)
        expect(readThreadDisplayPause(thread)).toBeNull()
    })

    it('hides the snapshot during resume and restores it if resume fails', async () => {
        const { thread, service } = setup()
        const pause = await service.requestPause('thread', 'run', snapshot)
        await service.stageCheckpoint('thread', 'run', { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' })
        await service.finish('thread', 'run', 'interrupted')
        await expect(service.releaseDisplayPause('thread', pause.pauseId)).rejects.toBeInstanceOf(ConflictException)
        await service.claimResume('thread', 'run', pause.pauseId, 'revision')
        expect(readThreadDisplayPause(thread)).toBeNull()
        await service.bindResumedExecution('thread', pause.pauseId, 'resumed')
        await service.releaseResume('thread', 'run', pause.pauseId)
        expect(readThreadDisplayPause(thread).snapshot).toBe(snapshot)
        await service.claimResume('thread', 'run', pause.pauseId, 'revision')
        await service.bindResumedExecution('thread', pause.pauseId, 'resumed')
        await service.finish('thread', 'resumed', 'idle')
        expect(readThreadDisplayPause(thread)).toBeNull()
    })

    it('clears display state on cancellation or a new run, but not a stale cancellation', async () => {
        const { thread, service } = setup()
        await service.requestPause('thread', 'run', snapshot)
        await service.cancel('thread', ['old-run'])
        expect(readThreadDisplayPause(thread)).not.toBeNull()
        await service.cancel('thread', ['run'])
        expect(readThreadDisplayPause(thread)).toBeNull()
        thread.status = 'busy'
        await service.start('thread', 'next')
        await service.requestPause('thread', 'next', snapshot)
        await service.start('thread', 'new')
        expect(thread.metadata.chatkitDisplayPause).toBeUndefined()
    })

    it('rejects invalid snapshots without changing the workflow state', async () => {
        const { thread, service } = setup()
        await expect(service.requestPause('thread', 'run', '{broken')).rejects.toThrow()
        expect(thread.status).toBe('busy')
        expect(thread.runControl.state).toBe('running')
    })

    it('acknowledges pause only after checkpoint and finalization, then exclusively claims the saved checkpoint', async () => {
        const { thread, service } = setup()
        const request = await service.requestPause('thread', 'run')
        expect(thread.status).toBe('pausing')
        await expect(service.claimResume('thread', 'run', request.pauseId, 'revision')).rejects.toBeInstanceOf(
            ConflictException
        )
        const checkpoint = { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' }
        await service.stageCheckpoint('thread', 'run', checkpoint)
        expect(thread.status).toBe('pausing')
        expect(await service.finish('thread', 'run', 'interrupted')).toBe('paused')
        await expect(service.claimResume('thread', 'run', request.pauseId, 'changed')).rejects.toBeInstanceOf(
            ConflictException
        )
        await expect(service.claimResume('thread', 'run', request.pauseId, 'revision')).resolves.toEqual(checkpoint)
        await expect(service.claimResume('thread', 'run', request.pauseId, 'revision')).rejects.toBeInstanceOf(
            ConflictException
        )
        await service.bindResumedExecution('thread', request.pauseId, 'new-run')
        expect(await service.finish('thread', 'run', 'idle')).toBe('busy')
        expect(thread.runControl.executionId).toBe('new-run')
    })

    it('lets completion win when no pending graph work remains', async () => {
        const { thread, service } = setup()
        await service.requestPause('thread', 'run')
        expect(await service.finish('thread', 'run', 'idle')).toBe('idle')
        expect(thread.runControl).toBeNull()
    })

    it('restores an encrypted context after reloading the paused thread and keeps it across resume failure', async () => {
        const { thread, service } = setup()
        const context = { targetXpertId: 'target', env: { workspaceId: 'workspace', token: 'private-value' } }
        await service.start('thread', 'run', context)
        await service.recordGraph('thread', 'run', 'revision')
        expect(thread.encryptedRunContext).not.toContain('private-value')
        expect(instanceToPlain(Object.assign(new ChatConversationThread(), thread))).not.toHaveProperty(
            'encryptedRunContext'
        )
        const pause = await service.requestPause('thread', 'run')
        await service.stageCheckpoint('thread', 'run', { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' })
        await service.finish('thread', 'run', 'interrupted')
        context.env.workspaceId = 'changed-after-save'
        await expect(service.getResumeContext('thread', 'run', pause.pauseId)).resolves.toEqual({
            targetXpertId: 'target',
            env: { workspaceId: 'workspace', token: 'private-value' }
        })
        await expect(service.getResumeContext('thread', 'other-run', pause.pauseId)).rejects.toBeInstanceOf(
            ConflictException
        )
        await service.claimResume('thread', 'run', pause.pauseId, 'revision')
        await service.bindResumedExecution('thread', pause.pauseId, 'new-run')
        await service.releaseResume('thread', 'run', pause.pauseId)
        await expect(service.getResumeContext('thread', 'run', pause.pauseId)).resolves.toHaveProperty(
            'targetXpertId',
            'target'
        )
        await service.cancel('thread', ['run'])
        expect(thread.encryptedRunContext).toBeNull()
    })

    it.each([undefined, 'invalid-ciphertext'])('rejects an unavailable saved context: %s', async (ciphertext) => {
        const { thread, service } = setup()
        const pause = await service.requestPause('thread', 'run')
        await service.stageCheckpoint('thread', 'run', { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' })
        await service.finish('thread', 'run', 'interrupted')
        thread.encryptedRunContext = ciphertext
        await expect(service.getResumeContext('thread', 'run', pause.pauseId)).rejects.toBeInstanceOf(ConflictException)
        expect(thread.status).toBe('paused')
    })

    it('rejects a stale run and preserves an explicit cancellation against late finalization', async () => {
        const { thread, service } = setup()
        await expect(service.requestPause('thread', 'old-run')).rejects.toBeInstanceOf(ConflictException)
        thread.runControl = null
        thread.status = 'interrupted'
        thread.error = 'Canceled by user'
        expect(await service.finish('thread', 'run', 'idle')).toBe('interrupted')
    })
    it('does not let cancellation of an older execution clear the resumed run control', async () => {
        const { thread, service } = setup()
        expect(await service.cancel('thread', ['old-run'])).toBe(false)
        expect(thread.status).toBe('busy')
        expect(thread.runControl.executionId).toBe('run')
        expect(await service.cancel('thread', ['run'])).toBe(true)
        expect(thread.status).toBe('interrupted')
        expect(thread.runControl).toBeNull()
    })
})
