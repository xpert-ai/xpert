// Invariants: read and publish one repeatable snapshot without locking live execution rows.
// Only the projection is written; conflicting snapshots retry before publishing its clock.
// Intent revisions do not order child receipts. This projection has its own durable clock.
// Permission grants are never cached; public capabilities are hints, not command admission.
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource, In, IsNull, QueryFailedError } from 'typeorm'
import { createHash } from 'node:crypto'
import { ThreadControlActions, ThreadControlView, ExecutionControlEvidence } from '@xpert-ai/contracts'
import { ExecutionTaskControl, TaskControlStore } from '@xpert-ai/server-core'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { AssertChatConversationAccessQuery } from '../queries/conversation-assert-access.query'
import { ThreadRecoveryService } from '../recovery/thread-recovery.service'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ExecutionControlEvidenceService } from '../../execution-control/execution-control-evidence.service'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../../xpert/queries/get-xpert-workflow.query'
import { threadGraphRevision } from '../thread-graph-revision'
import { CopilotCheckpoint } from '../../copilot-checkpoint/copilot-checkpoint.entity'
import { ThreadControlProjection } from './thread-control-projection.entity'
import { publicRunControl } from './public-run-control'

const disabled: ThreadControlActions = {
    canPause: false,
    canResume: false,
    canTerminate: false,
    canSend: false,
    canQueue: false,
    canRetry: false,
    canRespond: false
}

@Injectable()
export class ThreadControlViewService {
    constructor(
        private readonly database: DataSource,
        private readonly threads: ChatConversationThreadService,
        private readonly queryBus: QueryBus,
        private readonly tasks: TaskControlStore,
        private readonly evidence: ExecutionControlEvidenceService,
        private readonly recovery: ThreadRecoveryService
    ) {}

    /** The API also applies its credential audience guard. Domain read/contribute policy is evaluated here. */
    async read(threadId: string) {
        const initial = await this.threads.requireByThreadId(threadId)
        const conversation = await this.queryBus.execute(
            new AssertChatConversationAccessQuery({ id: initial.conversationId })
        )
        if (!conversation.tenantId) throw new ForbiddenException()
        let canContribute = true
        try {
            await this.queryBus.execute(
                new AssertChatConversationAccessQuery({ id: initial.conversationId }, 'contribute')
            )
        } catch (error) {
            if (!(error instanceof ForbiddenException)) throw error
            canContribute = false
        }
        // CQRS policy reads may borrow another pool connection. Finish them before opening the transaction.
        // They are hints; each command reauthorizes, and retry below must still match this exact run/thread.
        initial.conversation = conversation
        const workflow = await this.workflow(initial)
        const retry =
            !initial.runControl && !['busy', 'paused', 'pausing'].includes(initial.status) && workflow
                ? await this.recovery.describe(threadId)
                : null
        for (let attempt = 0; ; attempt++) {
            try {
                return await this.database.transaction('REPEATABLE READ', async (manager) => {
                    const thread = await manager.findOne(ChatConversationThread, {
                        where: {
                            id: initial.id,
                            tenantId: conversation.tenantId,
                            organizationId: conversation.organizationId ?? IsNull(),
                            conversationId: conversation.id
                        }
                    })
                    if (!thread) throw new NotFoundException()
                    thread.conversation = conversation
                    const latest = await manager.findOne(XpertAgentExecution, {
                        where: {
                            threadId,
                            tenantId: thread.tenantId,
                            organizationId: thread.organizationId ?? IsNull(),
                            parentId: IsNull()
                        },
                        order: { createdAt: 'DESC', id: 'DESC' }
                    })
                    const runId = thread.runControl?.executionId ?? latest?.id ?? null
                    const task = runId ? await this.tasks.execution(runId, manager) : null
                    if (task) {
                        if (
                            task.tenantId !== thread.tenantId ||
                            task.organizationId !== (thread.organizationId ?? null) ||
                            task.threadId !== threadId
                        )
                            throw new ForbiddenException()
                        await manager.findOneOrFail(ExecutionTaskControl, {
                            where: { id: task.rootId }
                        })
                    }
                    const evidence = runId
                        ? await this.evidence.read(
                              runId,
                              { tenantId: thread.tenantId, organizationId: thread.organizationId },
                              manager
                          )
                        : null
                    const state = this.state(thread, evidence, Boolean(latest))
                    const actions = { ...disabled }
                    const desired = task ? await this.tasks.desired(task.id, manager) : null
                    const terminated = desired === 'terminated'
                    actions.canTerminate = Boolean(
                        thread.runControl && !terminated && !['stopped', 'completed', 'failed'].includes(state)
                    )
                    actions.canPause = Boolean(
                        thread.runControl && ['running', 'input_required'].includes(state) && desired === 'running'
                    )
                    // An already-admitted client input may still be live while its node drains.
                    // This capability never admits a new run or manufactures an input request.
                    actions.canRespond = Boolean(
                        task &&
                        !terminated &&
                        ['running', 'pausing'].includes(state) &&
                        !thread.runControl?.resumeClaimed
                    )
                    if (state === 'paused' || state === 'input_required') {
                        const compatible = this.compatible(thread, workflow)
                        if (compatible && task && !terminated) {
                            if (state === 'input_required')
                                actions.canRespond = Boolean(thread.operation && thread.runControl?.inputNodes)
                            else {
                                const control = thread.runControl
                                const checkpoint = control?.checkpoint
                                const ancestors = await manager.findBy(ExecutionTaskControl, {
                                    id: In(task.ancestors.filter((id) => id !== task.id))
                                })
                                actions.canResume = Boolean(
                                    control?.pauseId &&
                                    !control.resumeClaimed &&
                                    checkpoint &&
                                    ancestors.every((ancestor) => ancestor.desired === 'running') &&
                                    (await manager.findOneBy(CopilotCheckpoint, {
                                        thread_id: threadId,
                                        checkpoint_ns: checkpoint.checkpointNs,
                                        checkpoint_id: checkpoint.checkpointId,
                                        tenantId: thread.tenantId,
                                        organizationId: thread.organizationId ?? IsNull()
                                    }))
                                )
                            }
                        }
                    }
                    actions.canQueue = state === 'running' && desired === 'running' && !thread.runControl?.resumeClaimed
                    actions.canSend = !thread.runControl && ['idle', 'completed', 'stopped', 'failed'].includes(state)
                    if (actions.canSend && !terminated && latest) {
                        actions.canRetry = Boolean(
                            retry?.canRetry &&
                            retry.executionId === latest.id &&
                            thread.status === initial.status &&
                            thread.updatedAt?.getTime() === initial.updatedAt?.getTime()
                        )
                    }
                    if ((actions.canSend || actions.canQueue) && !workflow) {
                        actions.canSend = false
                        actions.canQueue = false
                        actions.canRetry = false
                    }
                    const fact = {
                        version: 1 as const,
                        threadId,
                        runId,
                        state,
                        actions,
                        ...(thread.runControl?.pauseId ? { pauseId: thread.runControl.pauseId } : {})
                    }
                    const fingerprint = createHash('sha256').update(JSON.stringify(fact)).digest('hex')
                    let projection = await manager.findOneBy(ThreadControlProjection, { threadId })
                    if (
                        projection &&
                        (projection.tenantId !== thread.tenantId ||
                            projection.organizationId !== (thread.organizationId ?? null))
                    )
                        throw new ForbiddenException()
                    if (!projection || projection.fingerprint !== fingerprint) {
                        projection = manager.create(ThreadControlProjection, {
                            // Updating the display clock must retain the inherited record identity.
                            id: projection?.id,
                            threadId,
                            tenantId: thread.tenantId,
                            organizationId: thread.organizationId ?? null,
                            revision: projection ? (BigInt(projection.revision) + BigInt(1)).toString() : '1',
                            fingerprint
                        })
                        // REPEATABLE READ rejects a stale writer if another reader has advanced this row.
                        await manager.save(projection)
                    }
                    const controlView: ThreadControlView = {
                        ...fact,
                        revision: projection.revision,
                        actions: canContribute ? actions : { ...disabled }
                    }
                    return { thread, controlView, runControl: publicRunControl(thread.runControl) }
                })
            } catch (error) {
                if (attempt >= 2 || !projectionConflict(error)) throw error
            }
        }
    }

    private state(
        thread: ChatConversationThread,
        evidence: ExecutionControlEvidence | null,
        hasRun: boolean
    ): ThreadControlView['state'] {
        const control = thread.runControl
        if (
            control?.state === 'terminating' ||
            (evidence?.source === 'platform' && evidence.desired === 'terminated' && evidence.state !== 'settled')
        )
            return 'stopping'
        if (control?.state === 'input_wait' && evidence?.source === 'platform' && evidence.desired !== 'terminated')
            return 'input_required'
        if (control?.state === 'settling') return 'settling'
        if (control?.state === 'paused') return evidence?.state === 'paused' ? 'paused' : 'confirming'
        if (control?.state === 'pausing') return 'pausing'
        if (control) return evidence?.source === 'platform' ? 'running' : 'confirming'
        if (evidence?.source === 'platform' && evidence.state !== 'settled') return 'confirming'
        if (['busy', 'pausing', 'paused'].includes(thread.status)) return 'confirming'
        if (evidence?.source === 'platform' && evidence.desired === 'terminated') return 'stopped'
        if (thread.status === 'error') return 'failed'
        if (thread.status === 'interrupted') return 'stopped'
        return hasRun ? 'completed' : 'idle'
    }

    private compatible(thread: ChatConversationThread, workflow: TXpertWorkflowQueryOutput | null): boolean {
        const saved = thread.runControl?.graphRevision
        if (!saved || !thread.conversation?.xpertId) return false
        return Boolean(workflow && saved === threadGraphRevision(workflow.graph, saved, workflow.agent?.team))
    }

    private async workflow(thread: ChatConversationThread): Promise<TXpertWorkflowQueryOutput | null> {
        if (!thread.conversation?.xpertId) return null
        try {
            return await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                new GetXpertWorkflowQuery(thread.conversation.xpertId)
            )
        } catch (error) {
            if (
                error instanceof ForbiddenException ||
                error instanceof NotFoundException ||
                error instanceof ConflictException
            )
                return null
            throw error
        }
    }
}

function projectionConflict(error: unknown): boolean {
    return (
        error instanceof QueryFailedError &&
        typeof error.driverError === 'object' &&
        error.driverError !== null &&
        'code' in error.driverError &&
        (error.driverError.code === '40001' ||
            // A cold reader can have taken its snapshot before another reader inserts the clock.
            (error.driverError.code === '23505' &&
                'table' in error.driverError &&
                error.driverError.table === 'chat_thread_control_projection'))
    )
}
