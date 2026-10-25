import { requireControlSchema } from '@xpert-ai/server-core'
import { threadControlSchema } from '../execution-control/control-admission'
// The thread row owns pause acknowledgement and the single-writer resume claim.
// A pause is acknowledged only after graph checkpoints and message finalization.
import {
    TChatCheckpointReference,
    TChatConversationStatus,
    TChatThreadRunControl,
    TSensitiveOperation,
    XpertAgentExecutionStatusEnum
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
import { randomUUID } from 'crypto'
import { t } from 'i18next'
import { DataSource, EntityManager, Repository, In, IsNull } from 'typeorm'
import { environment } from '@xpert-ai/server-config'
import { decryptSecret, encryptSecret } from '@xpert-ai/server-core'
import z from 'zod'
import { ExecutionControlStore } from '../execution-control/execution-control.store'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { ExecutionCancelledError } from '../execution-control/execution-cancelled.error'
import { AgentInvocationWaitEntity } from '../agent-invocation/invocation.entity'
import { ExecutionCancelService } from '../execution-control/execution-cancel.service'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ChatConversation } from './conversation.entity'
import { RUN_LEASE_KEY, RUN_LEASE_MS, readRunLease, clearRunLease } from './thread-run-lease'
import { ChatConversationThread } from './conversation-thread.entity'
import { clearThreadDisplayPause, readThreadDisplayPause } from './thread-display-pause'
import { recoveryConflict } from './recovery/recovery-error'
import { threadGraphRevisionMatches } from './thread-graph-revision'

export { threadGraphRevision } from './thread-graph-revision'

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

    displaySnapshotOwner(threadId: string, executionId: string): string | undefined {
        return this.owned.get(threadId) === executionId ? this.owner : undefined
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
            const stopping = await this.threads
                .createQueryBuilder('thread')
                .where("thread.runControl ->> 'state' IN (:...states)", {
                    states: ['terminating', 'pausing', 'settling']
                })
                .take(50)
                .getMany()
            for (const thread of stopping) {
                const executionId = thread.runControl.executionId
                const drained = await this.dataSource.transaction((manager) =>
                    this.controls.drainedExecution(manager, executionId)
                )
                if (drained)
                    await this.finish(
                        thread.threadId,
                        executionId,
                        'interrupted',
                        thread.runControl.state === 'terminating' ? 'Canceled by user' : null
                    )
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
            if (['terminating', 'settling', 'input_wait'].includes(thread.runControl?.state)) return null
            await this.controls.intent(manager, lease.executionId, 'terminated')
            if (!(await this.controls.drainedExecution(manager, lease.executionId))) {
                thread.runControl.state = 'terminating'
                thread.status = 'busy'
                thread.encryptedRunContext = null
                thread.runtimeContinuationBlockedAt = new Date()
                await manager.save(thread)
                return lease.executionId
            }
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
        private readonly controls: ExecutionControlStore,
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
            await requireControlSchema(manager, threadControlSchema)
            if (thread.runControl && thread.runControl.executionId !== executionId)
                throw threadControlConflict(
                    'ThreadHasActiveOperation',
                    'Thread already has a running or paused operation.'
                )
            if (thread.runControl && !['running', 'input_wait'].includes(thread.runControl.state))
                throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            const inputResume = thread.runControl?.state === 'input_wait'
            const previous = thread.runControl
            const record = await this.controls.root(manager, thread, executionId)
            if (record.desired !== 'running' && !(inputResume && record.desired === 'paused'))
                throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            const desired = inputResume && record.desired === 'paused' ? 'paused' : 'running'
            await this.controls.intent(manager, executionId, desired, true, inputResume)
            clearThreadDisplayPause(thread)
            thread.runControl = {
                ...(inputResume ? previous : {}),
                executionId,
                state: desired === 'paused' ? 'pausing' : 'running'
            }
            thread.status = 'busy'
            if (inputResume) thread.operation = null
            this.assignLease(thread, executionId)
            thread.encryptedRunContext = encryptSecret(JSON.stringify(context ?? {}), environment.secretsEncryptionKey)
            await manager.save(thread)
        })
        this.owned.set(threadId, executionId)
    }

    async ensureExecution(threadId: string, executionId: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (!thread.runControl) {
                const record = await this.controls.root(manager, thread, executionId)
                if (record.desired !== 'running')
                    throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
                await this.controls.intent(manager, executionId, 'running')
                thread.runControl = { executionId, state: 'running' }
                thread.status = 'busy'
                this.assignLease(thread, executionId)
                await manager.save(thread)
                this.owned.set(threadId, executionId)
            }
            if (
                thread.runControl.executionId !== executionId ||
                !['running', 'pausing'].includes(thread.runControl.state)
            )
                throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
            const record = await this.controls.root(manager, thread, executionId)
            if (thread.runControl.state === 'running' && record.desired !== 'running')
                throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
            await this.controls.intent(
                manager,
                executionId,
                thread.runControl.state === 'pausing' ? 'paused' : 'running'
            )
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

    async recordGraph(
        threadId: string,
        executionId: string,
        graphRevision: string,
        legacyRevision?: string
    ): Promise<string> {
        return this.locked(threadId, async (thread, manager) => {
            if (thread.runControl?.executionId !== executionId) return graphRevision
            const forkRevision = thread.metadata?.forkGraphRevision
            if (forkRevision && !threadGraphRevisionMatches(forkRevision, graphRevision, legacyRevision)) {
                throw recoveryConflict('conversation_graph_changed', thread.error, thread.parentThreadId)
            }
            if (
                thread.runControl.graphRevision &&
                !threadGraphRevisionMatches(thread.runControl.graphRevision, graphRevision, legacyRevision)
            ) {
                throw threadControlConflict('PausedGraphChanged', 'The workflow has changed since this run started.')
            }
            // A resumed execution and its recovery writer must keep the same persisted revision format.
            const selected = thread.runControl.graphRevision ?? forkRevision ?? graphRevision
            if (forkRevision && selected !== forkRevision) {
                throw recoveryConflict('conversation_graph_changed', thread.error, thread.parentThreadId)
            }
            thread.runControl.graphRevision = selected
            await manager.save(thread)
            return selected
        })
    }

    async requiresInputAdmission(threadId: string, executionId: string): Promise<boolean> {
        const thread = await this.threads.findOne({ where: { threadId }, select: { metadata: true, runControl: true } })
        return thread?.runControl?.executionId === executionId && thread.metadata?.editAdmission?.state === 'pending'
    }

    /** Node identities come from the saved graph checkpoint, never from a client or tool result. */
    async stageInput(threadId: string, executionId: string, nodes: string[]) {
        await this.locked(threadId, async (thread, manager) => {
            if (
                thread.runControl?.executionId !== executionId ||
                !['running', 'pausing'].includes(thread.runControl.state)
            )
                throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
            thread.runControl.inputNodes = [...new Set(nodes)]
            await manager.save(thread)
        })
    }

    async shouldPause(threadId: string, executionId: string, nodeKey?: string): Promise<boolean> {
        const task = await this.controls.tasks.execution(executionId)
        const desired = task ? await this.controls.tasks.desired(task.id) : 'running'
        if (desired === 'terminated' || (task && task.currentExecutionId !== executionId))
            throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
        const thread = await this.threads.findOne({
            where: { threadId },
            select: { runControl: true, metadata: true, status: true, error: true }
        })
        const lease = readRunLease(thread?.metadata)
        if (
            (lease?.executionId === executionId && Date.parse(lease.expiresAt) <= Date.now()) ||
            thread?.runControl?.executionId !== executionId ||
            !['running', 'pausing'].includes(thread.runControl.state)
        ) {
            throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
        }
        if (desired === 'paused' && !task.drainOnPause && thread.runControl.state === 'running') {
            await this.requestPause(threadId, executionId, true)
            return true
        }
        if (nodeKey && thread.runControl.state === 'pausing' && thread.runControl.inputNodes?.includes(nodeKey)) {
            return this.locked(threadId, async (current, manager) => {
                const control = current.runControl
                if (control?.executionId !== executionId || control.state !== 'pausing')
                    throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
                if (!control.inputNodes?.includes(nodeKey)) return true
                control.inputNodes = control.inputNodes.filter((key) => key !== nodeKey)
                await manager.save(current)
                return false
            })
        }
        return thread?.runControl?.executionId === executionId && thread.runControl.state === 'pausing'
    }

    async requestPause(threadId: string, executionId: string, inherited = false): Promise<TChatThreadRunControl> {
        return this.locked(threadId, async (thread, manager) => {
            const control = thread.runControl
            if (!control || control.executionId !== executionId) {
                throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            }
            if (
                control.state === 'paused' ||
                control.state === 'pausing' ||
                (control.state === 'input_wait' && control.pauseId)
            )
                return { ...control }
            const inputWaiting = control.state === 'input_wait'
            if ((!inputWaiting && thread.status !== 'busy') || ['terminating', 'settling'].includes(control.state))
                throw threadControlConflict('RunNotActive', 'This run is no longer active.')
            await this.controls.intent(manager, executionId, 'paused', !inherited)
            control.state = inputWaiting ? 'input_wait' : 'pausing'
            control.pauseId = randomUUID()
            delete control.checkpoint
            thread.status = inputWaiting ? 'interrupted' : 'pausing'
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
        graphRevision: string,
        legacyRevision?: string,
        claimId?: string
    ): Promise<TChatCheckpointReference> {
        const resumed = await this.locked(threadId, async (thread, manager) => {
            await requireControlSchema(manager, threadControlSchema)
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
            if (!threadGraphRevisionMatches(control.graphRevision, graphRevision, legacyRevision)) {
                throw threadControlConflict('PausedGraphChanged', 'The workflow has changed since this run started.')
            }
            const checkpoint = await manager.getRepository(CopilotCheckpoint).findOne({
                select: { checkpoint_id: true },
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
            const target = await this.controls.tasks.execution(executionId, manager)
            if (target) await this.controls.tasks.assertAncestorsRunning(target.id, manager)
            await this.controls.intent(manager, executionId, 'running')
            thread.status = 'busy'
            control.state = 'running'
            control.resumeClaimed = true
            control.resumeClaimId = claimId
            this.assignLease(thread, executionId)
            await manager.save(thread)
            return control.checkpoint
        })
        this.owned.set(threadId, executionId)
        return resumed
    }

    async releaseResume(threadId: string, executionId: string, pauseId: string, claimId?: string): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (
                !thread.runControl ||
                thread.runControl.pauseId !== pauseId ||
                thread.runControl.state !== 'running' ||
                thread.runControl.resumeClaimId !== claimId
            )
                return
            const resumedExecutionId = thread.runControl.executionId
            await this.controls.intent(
                manager,
                resumedExecutionId,
                resumedExecutionId === executionId ? 'paused' : 'terminated',
                resumedExecutionId === executionId
            )
            if (resumedExecutionId !== executionId)
                await this.controls.tasks.restoreAttempt(resumedExecutionId, executionId, manager)
            thread.runControl.executionId = executionId
            thread.runControl.state = 'paused'
            delete thread.runControl.resumeClaimed
            delete thread.runControl.resumeClaimId
            thread.status = 'paused'
            clearRunLease(thread)
            this.owned.delete(threadId)
            await manager.save(thread)
        })
    }

    async bindResumedExecution(
        threadId: string,
        pauseId: string,
        executionId: string,
        claimId?: string
    ): Promise<void> {
        await this.locked(threadId, async (thread, manager) => {
            if (
                thread.runControl?.pauseId !== pauseId ||
                thread.runControl.state !== 'running' ||
                !thread.runControl.resumeClaimed ||
                thread.runControl.resumeClaimId !== claimId
            ) {
                throw threadControlConflict('ThreadNotPaused', 'This pause is no longer available to resume.')
            }
            if (thread.runControl.executionId !== executionId) {
                await this.controls.intent(manager, thread.runControl.executionId, 'paused', false)
                await this.controls.tasks.bind(thread.runControl.executionId, executionId, manager)
                await this.controls.end(manager, thread.runControl.executionId)
            }
            await this.controls.root(manager, thread, executionId)
            thread.runControl.executionId = executionId
            delete thread.runControl.resumeClaimed
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
            const control = thread.runControl
            if (!control || !executionIds.includes(control.executionId)) return false
            // Persist the scheduling barrier and tombstone before any best-effort notification.
            if (control.state !== 'terminating') {
                if (!(await this.controls.tasks.execution(control.executionId, manager)))
                    await this.controls.root(manager, thread, control.executionId)
                await this.controls.intent(manager, control.executionId, 'terminated')
            }
            const wasPaused = control.state === 'paused'
            control.state = 'terminating'
            delete control.resumeClaimed
            if (wasPaused) await this.controls.end(manager, control.executionId)
            clearThreadDisplayPause(thread)
            thread.runtimeContinuationBlockedAt = new Date()
            thread.encryptedRunContext = null
            thread.status = 'busy'
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
            if (
                control &&
                (control.executionId !== executionId ||
                    ['paused', 'input_wait'].includes(control.state) ||
                    control.resumeClaimed)
            )
                return thread.status
            if (!control && (await this.controls.has(executionId))) return thread.status
            if (!control && ['interrupted', 'error'].includes(thread.status) && thread.error) return thread.status
            if (control?.state === 'settling' && control.pendingFinish) {
                status = control.pendingFinish.status
                error = control.pendingFinish.error
                operation = control.pendingFinish.operation
            }
            const drained = await this.controls.end(manager, executionId)
            const task = await this.controls.tasks.execution(executionId, manager)
            if (task && control && (await this.controls.tasks.desired(task.id, manager)) === 'terminated') {
                control.state = 'terminating'
                thread.status = 'busy'
                thread.runtimeContinuationBlockedAt = new Date()
                await manager.save(thread)
            }
            const familyDrained =
                !task || (await this.controls.tasks.settled(task.id, control?.state === 'pausing', manager))
            // An input checkpoint is resumable, but does not attest that its remote work exited.
            // Keep the same owner so resume and subsequent termination still reach the original operation.
            if (control && ['running', 'pausing'].includes(control.state) && status === 'interrupted' && operation) {
                control.state = 'input_wait'
                thread.status = 'interrupted'
                thread.operation = operation
                thread.error = error ?? null
                clearRunLease(thread)
                this.owned.delete(threadId)
                if (task) await this.controls.tasks.receipt(task.id, 'paused', undefined, manager)
                await manager.save(thread)
                await manager.update(
                    ChatConversation,
                    {
                        id: thread.conversationId,
                        threadId,
                        tenantId: thread.tenantId,
                        organizationId: thread.organizationId ?? IsNull()
                    },
                    { status: 'interrupted', operation, error: error ?? null }
                )
                return thread.status
            }
            if (control && ['running', 'settling'].includes(control.state) && (!drained || !familyDrained)) {
                control.state = 'settling'
                control.pendingFinish = { status, error, operation }
                thread.status = 'busy'
                await manager.save(thread)
                return thread.status
            }
            if (control?.state === 'terminating') {
                if (!drained || !familyDrained) return thread.status
                status = 'interrupted'
                error = 'Canceled by user'
                operation = null
            } else if (control?.state === 'pausing' && (!drained || !familyDrained)) {
                return thread.status
            }
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
            if (task)
                await this.controls.tasks.receipt(
                    task.id,
                    status === 'paused' ? 'paused' : 'completed',
                    undefined,
                    manager
                )
            // Preserve fork compatibility across failed attempts; release it only after a successful continuation.
            if (status === 'idle' && thread.metadata?.forkGraphRevision) {
                const { forkGraphRevision: _revision, ...metadata } = thread.metadata
                thread.metadata = metadata
            }
            await manager.save(thread)
            await manager.update(
                ChatConversation,
                {
                    id: thread.conversationId,
                    threadId,
                    tenantId: thread.tenantId,
                    organizationId: thread.organizationId ?? IsNull()
                },
                { status, error: error ?? null, operation: operation ?? null }
            )
            return status
        })
    }
}
