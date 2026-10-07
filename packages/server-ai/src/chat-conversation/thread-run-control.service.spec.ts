jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
import { ThreadDTO } from '../ai/dto/thread.dto'
import { ChatConversation } from './conversation.entity'
import { RUN_LEASE_KEY } from './thread-run-lease'
import { ExecutionCancelService } from '../shared/execution/execution-cancel.service'
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
            update: jest.fn(),
            save: jest.fn(async () => thread)
        } as unknown as EntityManager
        const cancellations = { cancelExecutions: jest.fn() }
        const service = new ThreadRunControlService(
            { findOne: jest.fn(async () => thread) } as unknown as Repository<ChatConversationThread>,
            { transaction: async (work: (m: EntityManager) => Promise<unknown>) => work(manager) } as DataSource,
            cancellations as unknown as ExecutionCancelService
        )
        return { thread, service, manager, cancellations }
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

    it('never exposes legacy snapshots in detail or lists', async () => {
        const { thread } = setup()
        thread.metadata = { chatkitDisplayPause: { executionId: 'run', pauseId: 'old', createdAt: 'date', snapshot } }
        const conversation = { id: 'conversation' } as ChatConversation
        for (const includeSnapshot of [true, false]) {
            const dto = instanceToPlain(new ThreadDTO(conversation, undefined, thread, includeSnapshot))
            expect(dto.displayPause).toBeUndefined()
            expect(dto.metadata.chatkitDisplayPause).toBeUndefined()
            expect(JSON.stringify(dto)).not.toContain('Visible prefix')
        }
    })

    it('persists only a small idempotent control command and discards legacy UI state', async () => {
        const { thread, service } = setup()
        thread.metadata = { chatkitDisplayPause: { snapshot: 'x'.repeat(3 * 1024 * 1024) }, keep: 'metadata' }
        const request = await service.requestPause('thread', 'run')
        const duplicate = await service.requestPause('thread', 'run')
        expect(duplicate).toEqual(request)
        expect(request.pauseId).toBeTruthy()
        expect(JSON.stringify(request).length).toBeLessThan(512)
        expect(thread.metadata).toEqual({ keep: 'metadata' })
        await service.finish('thread', 'run', 'idle')
        expect(thread.runControl).toBeNull()
        expect(readThreadDisplayPause(thread)).toBeNull()
    })

    it('resumes legacy paused checkpoints independently of malformed UI snapshots', async () => {
        const { thread, service } = setup()
        const pause = await service.requestPause('thread', 'run')
        await service.stageCheckpoint('thread', 'run', { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' })
        await service.finish('thread', 'run', 'interrupted')
        thread.metadata = { chatkitDisplayPause: { snapshot: '{broken' } }
        await service.claimResume('thread', 'run', pause.pauseId, 'revision')
        await service.bindResumedExecution('thread', pause.pauseId, 'resumed')
        await service.releaseResume('thread', 'run', pause.pauseId)
        expect(thread.status).toBe('paused')
        await service.claimResume('thread', 'run', pause.pauseId, 'revision')
        await service.bindResumedExecution('thread', pause.pauseId, 'resumed')
        await service.finish('thread', 'resumed', 'idle')
        expect(thread.metadata.chatkitDisplayPause).toBeUndefined()
    })

    it('recovers an expired process without falsely confirming a staged pause or replaying work', async () => {
        const { thread, service, cancellations } = setup()
        await service.start('thread', 'run')
        await service.requestPause('thread', 'run')
        await service.stageCheckpoint('thread', 'run', { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' })
        thread.metadata = {
            ...thread.metadata,
            [RUN_LEASE_KEY]: {
                owner: 'dead-process',
                executionId: 'run',
                expiresAt: new Date(0).toISOString()
            }
        }
        expect(await service.recoverExpiredRun('thread')).toBe(true)
        expect(thread.status).toBe('error')
        expect(thread.runControl).toBeNull()
        expect(thread.encryptedRunContext).toBeNull()
        expect(cancellations.cancelExecutions).toHaveBeenCalledWith(['run'], 'Run owner lost')
        expect(await service.finish('thread', 'run', 'idle')).toBe('error')
        await expect(service.shouldPause('thread', 'run')).rejects.toThrow('Execution ownership ended')
        expect(await service.recoverExpiredRun('thread')).toBe(false)
    })

    it.each(['busy', 'pausing', 'paused'] as const)(
        'does not interrupt a healthy or finalized %s run',
        async (status) => {
            const { thread, service, cancellations } = setup()
            await service.start('thread', 'run')
            thread.status = status
            expect(await service.recoverExpiredRun('thread')).toBe(false)
            expect(cancellations.cancelExecutions).not.toHaveBeenCalled()
        }
    )

    it('leaves old unleased runs and child execution identities alone, but fences an expired owner', async () => {
        const { thread, service } = setup()
        expect(await service.recoverExpiredRun('thread')).toBe(false)
        await service.start('thread', 'replacement')
        expect(await service.shouldPause('thread', 'child-execution')).toBe(false)
        thread.metadata = {
            ...thread.metadata,
            [RUN_LEASE_KEY]: {
                owner: 'expired',
                executionId: 'replacement',
                expiresAt: new Date(0).toISOString()
            }
        }
        await expect(service.shouldPause('thread', 'replacement')).rejects.toThrow('Execution ownership ended')
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
