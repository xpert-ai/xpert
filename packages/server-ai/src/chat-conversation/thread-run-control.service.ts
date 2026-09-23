// The thread row owns pause acknowledgement and the single-writer resume claim.
// A pause is acknowledged only after graph checkpoints and message finalization.
import {
    TChatCheckpointReference,
    TChatConversationStatus,
    TChatThreadRunControl,
    TChatThreadDisplayPause,
    TSensitiveOperation,
    TXpertGraph
} from '@xpert-ai/contracts'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'crypto'
import { t } from 'i18next'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { environment } from '@xpert-ai/server-config'
import { decryptSecret, encryptSecret } from '@xpert-ai/server-core'
import z from 'zod'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import {
    DISPLAY_PAUSE_KEY,
    clearThreadDisplayPause,
    readThreadDisplayPause,
    readStoredDisplayPause,
    validateDisplaySnapshot
} from './thread-display-pause'

export function threadGraphRevision(graph: TXpertGraph): string {
    return createHash('sha256').update(JSON.stringify(graph)).digest('hex')
}

export function threadControlConflict(key: string, defaultValue: string): ConflictException {
    return new ConflictException(t(`server-ai:Error.${key}`, { defaultValue }))
}

@Injectable()
export class ThreadRunControlService {
    constructor(
        @InjectRepository(ChatConversationThread) private readonly threads: Repository<ChatConversationThread>,
        private readonly dataSource: DataSource
    ) {}

    private async locked<T>(
        threadId: string,
        work: (thread: ChatConversationThread, manager: EntityManager) => Promise<T>
    ) {
        return this.dataSource.transaction(async (manager) => {
            const thread = await manager.getRepository(ChatConversationThread).findOne({
                where: { threadId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!thread)
                throw new NotFoundException(t('server-ai:Error.ThreadNotFound', { defaultValue: 'Thread not found' }))
            return work(thread, manager)
        })
    }

    async get(threadId: string): Promise<TChatThreadRunControl | null> {
        return (await this.threads.findOne({ where: { threadId }, select: { runControl: true } }))?.runControl ?? null
    }

    async start(threadId: string, executionId: string, context?: Record<string, unknown>): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            clearThreadDisplayPause(thread)
            thread.runControl = { executionId, state: 'running' }
            thread.encryptedRunContext = encryptSecret(JSON.stringify(context ?? {}), environment.secretsEncryptionKey)
            await manager.save(thread)
        })
    }

    async getResumeContext(
        threadId: string,
        executionId: string,
        pauseId: string
    ): Promise<Record<string, unknown> | undefined> {
        const thread = await this.threads.findOne({
            where: { threadId },
            select: { status: true, runControl: true, encryptedRunContext: true }
        })
        if (
            thread?.status !== 'paused' ||
            thread.runControl?.state !== 'paused' ||
            thread.runControl.executionId !== executionId ||
            thread.runControl.pauseId !== pauseId
        ) {
            throw threadControlConflict('ThreadNotPaused', 'This pause is no longer available to resume.')
        }
        try {
            const context = z
                .record(z.unknown())
                .parse(JSON.parse(decryptSecret(thread.encryptedRunContext, environment.secretsEncryptionKey)))
            return Object.keys(context).length ? context : undefined
        } catch {
            throw threadControlConflict('PausedContextUnavailable', 'The saved runtime context is unavailable.')
        }
    }

    async recordGraph(threadId: string, executionId: string, graphRevision: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (thread.runControl?.executionId !== executionId) return
            if (thread.metadata?.forkGraphRevision && thread.metadata.forkGraphRevision !== graphRevision) {
                throw threadControlConflict('PausedGraphChanged', 'The workflow has changed since this run started.')
            }
            if (thread.runControl.graphRevision && thread.runControl.graphRevision !== graphRevision) {
                throw threadControlConflict('PausedGraphChanged', 'The workflow has changed since this run started.')
            }
            thread.runControl.graphRevision = graphRevision
            await manager.save(thread)
        })
    }

    async shouldPause(threadId: string, executionId: string): Promise<boolean> {
        const control = await this.get(threadId)
        return control?.executionId === executionId && control.state === 'pausing'
    }

    async requestPause(
        threadId: string,
        executionId: string,
        displaySnapshot?: string
    ): Promise<TChatThreadRunControl & { displayPause?: TChatThreadDisplayPause }> {
        if (displaySnapshot !== undefined) validateDisplaySnapshot(displaySnapshot)
        return this.locked(threadId, async (thread, manager) => {
            const control = thread.runControl
            if (!control || control.executionId !== executionId) {
                throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            }
            if (control.state === 'paused' || control.state === 'pausing') {
                const displayPause = readThreadDisplayPause(thread)
                return { ...control, ...(displayPause ? { displayPause } : {}) }
            }
            if (thread.status !== 'busy') throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            control.state = 'pausing'
            control.pauseId = randomUUID()
            delete control.checkpoint
            thread.status = 'pausing'
            if (displaySnapshot !== undefined) {
                thread.metadata = {
                    ...thread.metadata,
                    [DISPLAY_PAUSE_KEY]: {
                        executionId,
                        pauseId: control.pauseId,
                        createdAt: new Date().toISOString(),
                        snapshot: displaySnapshot
                    }
                }
            }
            await manager.save(thread)
            const displayPause = readThreadDisplayPause(thread)
            return { ...control, ...(displayPause ? { displayPause } : {}) }
        })
    }

    async stageCheckpoint(threadId: string, executionId: string, checkpoint: TChatCheckpointReference): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (thread.runControl?.executionId !== executionId || thread.runControl.state !== 'pausing') return
            thread.runControl.checkpoint = checkpoint
            await manager.save(thread)
        })
    }

    async claimResume(
        threadId: string,
        executionId: string,
        pauseId: string,
        graphRevision: string
    ): Promise<TChatCheckpointReference> {
        return this.locked(threadId, async (thread, manager) => {
            const control = thread.runControl
            if (
                thread.status !== 'paused' ||
                control?.state !== 'paused' ||
                control.executionId !== executionId ||
                control.pauseId !== pauseId ||
                !control.checkpoint
            ) {
                throw threadControlConflict('ThreadNotPaused', 'This pause is no longer available to resume.')
            }
            if (control.graphRevision !== graphRevision) {
                throw threadControlConflict('PausedGraphChanged', 'The workflow has changed since this run started.')
            }
            const checkpoint = await manager.getRepository(CopilotCheckpoint).findOne({
                where: {
                    thread_id: threadId,
                    checkpoint_ns: control.checkpoint.checkpointNs,
                    checkpoint_id: control.checkpoint.checkpointId,
                    tenantId: thread.tenantId,
                    organizationId: thread.organizationId
                }
            })
            if (!checkpoint)
                throw threadControlConflict('CheckpointUnavailable', 'The saved checkpoint is unavailable.')
            thread.status = 'busy'
            control.state = 'running'
            await manager.save(thread)
            return control.checkpoint
        })
    }

    async releaseResume(threadId: string, executionId: string, pauseId: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (!thread.runControl || thread.runControl.pauseId !== pauseId) return
            thread.runControl.executionId = executionId
            thread.runControl.state = 'paused'
            thread.status = 'paused'
            await manager.save(thread)
        })
    }

    async bindResumedExecution(threadId: string, pauseId: string, executionId: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (thread.runControl?.pauseId !== pauseId || thread.runControl.state !== 'running') {
                throw threadControlConflict('ThreadNotPaused', 'This pause is no longer available to resume.')
            }
            thread.runControl.executionId = executionId
            await manager.save(thread)
        })
    }

    async releaseDisplayPause(threadId: string, pauseId: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            const displayPause = readThreadDisplayPause(thread)
            const hasActiveRun = ['busy', 'pausing', 'paused'].includes(thread.status)
            if (!displayPause || displayPause.pauseId !== pauseId || hasActiveRun) {
                throw threadControlConflict('DisplayPauseNotReleasable', 'This display pause cannot be released yet.')
            }
            clearThreadDisplayPause(thread)
            await manager.save(thread)
        })
    }

    async cancel(threadId: string, executionIds: string[]): Promise<boolean> {
        return this.locked(threadId, async (thread, manager) => {
            if (thread.runControl && !executionIds.includes(thread.runControl.executionId)) return false
            clearThreadDisplayPause(thread)
            thread.runControl = null
            thread.encryptedRunContext = null
            thread.status = 'interrupted'
            thread.error = 'Canceled by user'
            thread.operation = null
            await manager.save(thread)
            return true
        })
    }

    async finish(
        threadId: string,
        executionId: string,
        status: TChatConversationStatus,
        error?: string | null,
        operation?: TSensitiveOperation | null
    ): Promise<TChatConversationStatus> {
        return this.locked(threadId, async (thread, manager) => {
            const control = thread.runControl
            const savedPause = readStoredDisplayPause(thread)
            if (control && control.executionId !== executionId) return thread.status
            if (!control && thread.status === 'interrupted' && thread.error) return thread.status
            if (control?.state === 'pausing' && control.checkpoint && status === 'interrupted') {
                control.state = 'paused'
                status = 'paused'
            } else {
                thread.runControl = null
                thread.encryptedRunContext = null
            }
            if (savedPause && savedPause.executionId !== executionId) clearThreadDisplayPause(thread)
            thread.status = status
            thread.error = error ?? null
            thread.operation = operation ?? null
            // Preserve fork compatibility across failed attempts; release it only after a successful continuation.
            if (status === 'idle' && thread.metadata?.forkGraphRevision) {
                const { forkGraphRevision: _revision, ...metadata } = thread.metadata
                thread.metadata = metadata
            }
            await manager.save(thread)
            return status
        })
    }
}
