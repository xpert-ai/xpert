import { ExecutionControlStore } from '../execution-control/execution-control.store'
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
import { ThreadDTO } from '../ai/dto/thread.dto'
import { ChatConversation } from './conversation.entity'
import { RUN_LEASE_KEY } from './thread-run-lease'
import { ExecutionCancelService } from '../execution-control/execution-cancel.service'
import { readThreadDisplayPause } from './thread-display-pause'
import { ConflictException } from '@nestjs/common'
import { instanceToPlain } from 'class-transformer'
import { DataSource, EntityManager, FindOneOptions, In, Repository } from 'typeorm'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ThreadRunControlService, threadGraphRevision } from './thread-run-control.service'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { TXpertGraph, XpertAgentExecutionStatusEnum as ExecutionStatus } from '@xpert-ai/contracts'

describe('ThreadRunControlService', () => {
    function setup() {
        const thread = {
            threadId: 'thread',
            tenantId: 'tenant',
            organizationId: 'organization',
            status: 'busy',
            runControl: {
                state: 'running',
                executionId: 'run',
                graphRevision: 'revision'
            }
        } as ChatConversationThread
        const checkpointRepository = {
            findOne: jest
                .fn<Promise<Pick<CopilotCheckpoint, 'checkpoint_id'> | null>, [FindOneOptions<CopilotCheckpoint>]>()
                .mockResolvedValue({ checkpoint_id: 'saved' })
        }
        const threadRepository = { findOne: jest.fn(async () => thread) }
        const manager = {
            getRepository: jest.fn((entity: unknown) =>
                entity === ChatConversationThread ? threadRepository : checkpointRepository
            ),
            update: jest.fn(),
            save: jest.fn(async () => thread)
        } as unknown as EntityManager
        const cancellations = { cancelExecutions: jest.fn() }
        const service = new ThreadRunControlService(
            { findOne: jest.fn(async () => thread) } as unknown as Repository<ChatConversationThread>,
            { transaction: async (work: (m: EntityManager) => Promise<unknown>) => work(manager) } as DataSource,
            {
                has: jest.fn(),
                root: jest.fn().mockResolvedValue({ desired: 'running' }),
                intent: jest.fn(),
                end: jest.fn().mockResolvedValue(true),
                drainedExecution: jest.fn().mockResolvedValue(true)
            } as unknown as ExecutionControlStore,
            cancellations as unknown as ExecutionCancelService
        )
        return { thread, service, manager, cancellations, checkpointRepository, threadRepository }
    }

    const snapshot = JSON.stringify({ version: 1, messages: [{ type: 'ai', content: 'Visible prefix' }] })

    it.each(['position', 'size', 'hash'] as const)(
        'resumes the saved checkpoint after a %s-only publication',
        async (field) => {
            const { thread, service } = setup()
            const graph: TXpertGraph = {
                nodes: [
                    {
                        key: 'agent',
                        type: 'agent',
                        position: { x: 0, y: 0 },
                        entity: { key: 'agent', prompt: 'same task' }
                    }
                ],
                connections: []
            }
            thread.runControl.graphRevision = threadGraphRevision(graph)
            const pause = await service.requestPause('thread', 'run')
            const reference = { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' }
            await service.stageCheckpoint('thread', 'run', reference)
            await service.finish('thread', 'run', 'interrupted')
            if (field === 'position') graph.nodes[0].position = { x: 300, y: 200 }
            if (field === 'size') graph.nodes[0].size = { width: 320, height: 180 }
            if (field === 'hash') graph.nodes[0].hash = 'new-layout-cache'

            await expect(
                service.claimResume('thread', 'run', pause.pauseId, threadGraphRevision(graph))
            ).resolves.toEqual(reference)
        }
    )

    it.each(['', 'agent:child'])('resumes using only the checkpoint ID in namespace "%s"', async (checkpointNs) => {
        const { thread, service, checkpointRepository, threadRepository } = setup()
        const pause = await service.requestPause('thread', 'run')
        const reference = { threadId: 'thread', checkpointNs, checkpointId: 'saved' }
        await service.stageCheckpoint('thread', 'run', reference)
        await service.finish('thread', 'run', 'interrupted')

        await expect(service.claimResume('thread', 'run', pause.pauseId, 'revision')).resolves.toEqual(reference)

        expect(checkpointRepository.findOne).toHaveBeenCalledWith({
            select: { checkpoint_id: true },
            where: {
                thread_id: 'thread',
                checkpoint_ns: checkpointNs,
                checkpoint_id: 'saved',
                tenantId: 'tenant',
                organizationId: 'organization'
            }
        })
        expect(threadRepository.findOne).toHaveBeenLastCalledWith({
            where: { threadId: 'thread' },
            lock: { mode: 'pessimistic_write' }
        })
        expect(thread.status).toBe('busy')
        expect(thread.runControl.state).toBe('running')
    })

    it('leaves the thread paused when the saved checkpoint no longer exists', async () => {
        const { thread, service, manager, checkpointRepository } = setup()
        const pause = await service.requestPause('thread', 'run')
        await service.stageCheckpoint('thread', 'run', { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' })
        await service.finish('thread', 'run', 'interrupted')
        checkpointRepository.findOne.mockResolvedValue(null)
        jest.mocked(manager.save).mockClear()

        await expect(service.claimResume('thread', 'run', pause.pauseId, 'revision')).rejects.toThrow(
            'The saved checkpoint is unavailable.'
        )

        expect(thread.status).toBe('paused')
        expect(thread.runControl.state).toBe('paused')
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('propagates checkpoint lookup failures without claiming the paused thread', async () => {
        const { thread, service, manager, checkpointRepository } = setup()
        const pause = await service.requestPause('thread', 'run')
        await service.stageCheckpoint('thread', 'run', { threadId: 'thread', checkpointNs: '', checkpointId: 'saved' })
        await service.finish('thread', 'run', 'interrupted')
        const error = new Error('Checkpoint database unavailable')
        checkpointRepository.findOne.mockRejectedValue(error)
        jest.mocked(manager.save).mockClear()

        await expect(service.claimResume('thread', 'run', pause.pauseId, 'revision')).rejects.toBe(error)

        expect(thread.status).toBe('paused')
        expect(thread.runControl.state).toBe('paused')
        expect(manager.save).not.toHaveBeenCalled()
    })

    it.each(['execution', 'pause', 'revision'] as const)(
        'rejects a stale %s before reading the checkpoint',
        async (mismatch) => {
            const { thread, service, checkpointRepository } = setup()
            const pause = await service.requestPause('thread', 'run')
            await service.stageCheckpoint('thread', 'run', {
                threadId: 'thread',
                checkpointNs: '',
                checkpointId: 'saved'
            })
            await service.finish('thread', 'run', 'interrupted')

            await expect(
                service.claimResume(
                    'thread',
                    mismatch === 'execution' ? 'other-run' : 'run',
                    mismatch === 'pause' ? 'other-pause' : pause.pauseId,
                    mismatch === 'revision' ? 'other-revision' : 'revision'
                )
            ).rejects.toBeInstanceOf(ConflictException)

            expect(checkpointRepository.findOne).not.toHaveBeenCalled()
            expect(thread.status).toBe('paused')
        }
    )

    it('releases a rejected run and preserves its error through repeated cleanup', async () => {
        const { thread, service } = setup()
        await service.finish('thread', 'run', 'error', 'Model unavailable')
        expect(thread.runControl).toBeNull()
        expect(thread.encryptedRunContext).toBeNull()
        expect(await service.finish('thread', 'run', 'idle')).toBe('error')
        expect(thread.error).toBe('Model unavailable')
        await service.start('thread', 'retry')
        expect(thread.runControl?.executionId).toBe('retry')
        expect(thread.runControl?.state).toBe('running')
    })

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

    it('keeps cancellation barriers while admitting a fresh run after cancellation', async () => {
        const { thread, service } = setup()
        await service.requestPause('thread', 'run')
        expect(await service.cancel('thread', ['old-run'])).toBe(false)
        expect(thread.runControl.executionId).toBe('run')
        expect(await service.cancel('thread', ['run'])).toBe(true)
        expect(thread.runControl.state).toBe('terminating')
        await expect(service.start('thread', 'next')).rejects.toThrow()
        await service.finish('thread', 'run', 'interrupted')
        expect(thread.runtimeContinuationBlockedAt).toBeInstanceOf(Date)
        thread.status = 'busy'
        await service.start('thread', 'next')
        await service.requestPause('thread', 'next')
        await expect(service.start('thread', 'new')).rejects.toBeInstanceOf(ConflictException)
        await service.cancel('thread', ['next'])
        await service.finish('thread', 'next', 'interrupted')
        await service.start('thread', 'new')
        expect(thread.runControl.executionId).toBe('new')
        expect(thread.runControl.state).toBe('running')
    })

    it('recovers an expired process without falsely confirming a staged pause or replaying work', async () => {
        const { thread, service, cancellations, manager } = setup()
        await service.start('thread', 'run')
        expect(service.displaySnapshotOwner('thread', 'run')).toEqual(expect.any(String))
        expect(service.displaySnapshotOwner('thread', 'other-run')).toBeUndefined()
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
        expect(service.displaySnapshotOwner('thread', 'run')).toBeUndefined()
        expect(manager.update).toHaveBeenCalledWith(
            XpertAgentExecution,
            expect.objectContaining({ id: 'run', status: In([ExecutionStatus.RUNNING, ExecutionStatus.PENDING]) }),
            expect.objectContaining({ status: ExecutionStatus.INTERRUPTED, completedAt: expect.any(Date) })
        )
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

    it('keeps unleased roots compatible but fences foreign execution identities and expired owners', async () => {
        const { thread, service } = setup()
        expect(await service.recoverExpiredRun('thread')).toBe(false)
        await expect(service.start('thread', 'replacement')).rejects.toBeInstanceOf(ConflictException)
        await service.finish('thread', 'run', 'idle')
        await service.start('thread', 'replacement')
        await expect(service.shouldPause('thread', 'child-execution')).rejects.toThrow('Execution ownership ended')
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
        expect(thread.status).toBe('busy')
        await service.finish('thread', 'run', 'interrupted')
        expect(thread.status).toBe('interrupted')
        expect(thread.runControl).toBeNull()
    })
})
