// The thread row owns pause acknowledgement and the single-writer resume claim.
// A pause is acknowledged only after graph checkpoints and message finalization.
import {
    TChatCheckpointReference,
    TChatConversationStatus,
    TChatThreadRunControl,
    TSensitiveOperation,
    XpertAgentExecutionStatusEnum,
    TXpertGraph
} from '@xpert-ai/contracts'
import {
    ConflictException,
    Injectable,
    NotFoundException,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
    Optional
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'crypto'
import { t } from 'i18next'
import { DataSource, EntityManager, Repository, In } from 'typeorm'
import { environment } from '@xpert-ai/server-config'
import { decryptSecret, encryptSecret } from '@xpert-ai/server-core'
import z from 'zod'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { ExecutionCancelledError } from '../shared/execution/execution-cancelled.error'
import { AgentInvocationWaitEntity } from '../agent-invocation/invocation.entity'
import { ExecutionCancelService } from '../shared/execution/execution-cancel.service'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ChatConversation } from './conversation.entity'
import { RUN_LEASE_KEY, RUN_LEASE_MS, readRunLease, clearRunLease } from './thread-run-lease'
import { ChatConversationThread } from './conversation-thread.entity'
import { clearThreadDisplayPause, readThreadDisplayPause } from './thread-display-pause'

export function threadGraphRevision(graph: TXpertGraph): string {
    return createHash('sha256').update(JSON.stringify(graph)).digest('hex')
}

export function threadControlConflict(key: string, defaultValue: string): ConflictException {
    return new ConflictException(t(`server-ai:Error.${key}`, { defaultValue }))
}

@Injectable()
export class ThreadRunControlService implements OnModuleInit, OnModuleDestroy {
    private readonly owner = randomUUID()
    private readonly owned = new Map<string, string>()
    private readonly logger = new Logger(ThreadRunControlService.name)
    private timer?: ReturnType<typeof setInterval>
    private maintaining = false
    private stopping = false

    onModuleInit() {
        this.timer = setInterval(() => void this.maintainLeases(), 15_000)
        this.timer.unref()
    }

    onModuleDestroy() {
        this.stopping = true
        clearInterval(this.timer)
        this.owned.clear()
    }

    private assignLease(thread: ChatConversationThread, executionId: string) {
        thread.metadata = {
            ...thread.metadata,
            [RUN_LEASE_KEY]: {
                owner: this.owner,
                executionId,
                expiresAt: new Date(Date.now() + RUN_LEASE_MS).toISOString()
            }
        }
    }

    /** Reconcile expired owners without replaying tools or trusting UI/SSE data. */
    async maintainLeases() {
        if (this.maintaining || this.stopping) return
        this.maintaining = true
        try {
            for (const [threadId, executionId] of this.owned) {
                if (this.stopping) break
                try {
                    await this.locked(threadId, async (thread, manager) => {
                        const lease = readRunLease(thread.metadata)
                        if (
                            lease?.owner !== this.owner ||
                            lease.executionId !== executionId ||
                            thread.runControl?.executionId !== executionId ||
                            !['busy', 'pausing'].includes(thread.status)
                        ) {
                            this.owned.delete(threadId)
                            return
                        }
                        // An expired owner cannot reclaim work another process may be reconciling.
                        if (Date.parse(lease.expiresAt) <= Date.now()) return
                        this.assignLease(thread, executionId)
                        await manager.save(thread)
                    })
                } catch (error) {
                    if (error instanceof NotFoundException) this.owned.delete(threadId)
                    else this.logger.warn('Run ownership renewal failed; will retry')
                }
            }
            const expired = await this.threads
                .createQueryBuilder('thread')
                .where('thread.status IN (:...statuses)', { statuses: ['busy', 'pausing'] })
                .andWhere(`thread.metadata -> :leaseKey ->> 'expiresAt' <= :now`, {
                    leaseKey: RUN_LEASE_KEY,
                    now: new Date().toISOString()
                })
                .take(50)
                .getMany()
            for (const thread of expired) {
                if (this.stopping) break
                await this.recoverExpiredRun(thread.threadId)
            }
        } catch {
            this.logger.warn('Run ownership reconciliation failed; will retry without replaying execution')
        } finally {
            this.maintaining = false
        }
    }

    async recoverExpiredRun(threadId: string): Promise<boolean> {
        const executionId = await this.locked(threadId, async (thread, manager) => {
            const lease = readRunLease(thread.metadata)
            if (
                !lease ||
                Date.parse(lease.expiresAt) > Date.now() ||
                lease.executionId !== thread.runControl?.executionId ||
                !['busy', 'pausing'].includes(thread.status)
            )
                return null
            const error = t('server-ai:Error.RunOwnerLost', {
                defaultValue:
                    'Execution was interrupted before its progress could be finalized. Completed actions were not undone.'
            })
            // Even a staged checkpoint may precede message persistence. Only finish() can confirm paused.
            thread.status = 'error'
            thread.error = error
            thread.operation = null
            thread.runControl = null
            thread.encryptedRunContext = null
            clearRunLease(thread)
            clearThreadDisplayPause(thread)
            await manager.save(thread)
            const scope = { tenantId: thread.tenantId, organizationId: thread.organizationId }
            await manager.update(
                XpertAgentExecution,
                {
                    ...scope,
                    id: lease.executionId,
                    status: In([XpertAgentExecutionStatusEnum.RUNNING, XpertAgentExecutionStatusEnum.PENDING])
                },
                {
                    status: XpertAgentExecutionStatusEnum.INTERRUPTED,
                    error,
                    completedAt: new Date()
                }
            )
            await manager.update(
                ChatMessage,
                { ...scope, executionId: lease.executionId, status: In(['thinking', 'reasoning', 'answering']) },
                { status: 'aborted', error }
            )
            await manager.update(
                AgentInvocationWaitEntity,
                { ...scope, threadId, state: In(['waiting', 'ready', 'blocked']) },
                {
                    state: 'stale',
                    leaseToken: null,
                    leaseUntil: null,
                    lastError: 'parent_owner_lost'
                }
            )
            await manager.update(
                ChatConversation,
                { ...scope, id: thread.conversationId, threadId },
                {
                    status: 'error',
                    error,
                    operation: null
                }
            )
            return lease.executionId
        })
        if (!executionId) return false
        if (this.owned.get(threadId) === executionId) this.owned.delete(threadId)
        await this.cancellations?.cancelExecutions([executionId], 'Run owner lost')
        return true
    }

    constructor(
        @InjectRepository(ChatConversationThread) private readonly threads: Repository<ChatConversationThread>,
        private readonly dataSource: DataSource,
        @Optional() private readonly cancellations?: ExecutionCancelService
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
            if (thread.runControl && thread.runControl.executionId !== executionId)
                throw threadControlConflict(
                    'ThreadHasActiveOperation',
                    'Thread already has a running or paused operation.'
                )
            clearThreadDisplayPause(thread)
            thread.runControl = { executionId, state: 'running' }
            this.assignLease(thread, executionId)
            thread.encryptedRunContext = encryptSecret(JSON.stringify(context ?? {}), environment.secretsEncryptionKey)
            await manager.save(thread)
        })
        this.owned.set(threadId, executionId)
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
        const thread = await this.threads.findOne({
            where: { threadId },
            select: { runControl: true, metadata: true, status: true, error: true }
        })
        const lease = readRunLease(thread?.metadata)
        if (
            (lease?.executionId === executionId && Date.parse(lease.expiresAt) <= Date.now()) ||
            (!thread?.runControl && ['interrupted', 'error'].includes(thread?.status) && thread.error)
        ) {
            throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
        }
        return thread?.runControl?.executionId === executionId && thread.runControl.state === 'pausing'
    }

    async requestPause(threadId: string, executionId: string): Promise<TChatThreadRunControl> {
        return this.locked(threadId, async (thread, manager) => {
            const control = thread.runControl
            if (!control || control.executionId !== executionId) {
                throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            }
            if (control.state === 'paused' || control.state === 'pausing') return { ...control }
            if (thread.status !== 'busy') throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            control.state = 'pausing'
            control.pauseId = randomUUID()
            delete control.checkpoint
            thread.status = 'pausing'
            // UI metadata is unrelated to the execution checkpoint and never gates control.
            clearThreadDisplayPause(thread)
            await manager.save(thread)
            return { ...control }
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
        const resumed = await this.locked(threadId, async (thread, manager) => {
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
            this.assignLease(thread, executionId)
            await manager.save(thread)
            return control.checkpoint
        })
        this.owned.set(threadId, executionId)
        return resumed
    }

    async releaseResume(threadId: string, executionId: string, pauseId: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (!thread.runControl || thread.runControl.pauseId !== pauseId) return
            thread.runControl.executionId = executionId
            thread.runControl.state = 'paused'
            thread.status = 'paused'
            clearRunLease(thread)
            this.owned.delete(threadId)
            await manager.save(thread)
        })
    }

    async bindResumedExecution(threadId: string, pauseId: string, executionId: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (thread.runControl?.pauseId !== pauseId || thread.runControl.state !== 'running') {
                throw threadControlConflict('ThreadNotPaused', 'This pause is no longer available to resume.')
            }
            thread.runControl.executionId = executionId
            clearThreadDisplayPause(thread)
            this.assignLease(thread, executionId)
            await manager.save(thread)
        })
        this.owned.set(threadId, executionId)
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
            clearRunLease(thread)
            this.owned.delete(threadId)
            thread.runControl = null
            thread.encryptedRunContext = null
            thread.runtimeContinuationBlockedAt = new Date()
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
        await this.recoverExpiredRun(threadId)
        return this.locked(threadId, async (thread, manager) => {
            const control = thread.runControl
            if (control && control.executionId !== executionId) return thread.status
            if (!control && ['interrupted', 'error'].includes(thread.status) && thread.error) return thread.status
            if (control?.state === 'pausing' && control.checkpoint && status === 'interrupted') {
                control.state = 'paused'
                status = 'paused'
            } else {
                thread.runControl = null
                thread.encryptedRunContext = null
            }
            clearThreadDisplayPause(thread)
            clearRunLease(thread)
            if (this.owned.get(threadId) === executionId) this.owned.delete(threadId)
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
