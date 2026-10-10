// Invariants: reserve exactly one writer per Assistant runtime; never re-execute an ambiguous started run.
// Busy inputs use the existing persisted steer path, while public messages remain in the group timeline.
import { GroupComposerService } from './group-composer.service'
import { readRunLease } from '../chat-conversation/thread-run-lease'
import { GroupInteractionsService } from './group-interactions.service'
import { GroupOutboxService } from './group-outbox.service'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import { Injectable } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { DataSource, MoreThan, In, Not, IsNull } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { AgentChatDispatchPayload, HandoffMessage } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum, TChatCheckpointReference } from '@xpert-ai/contracts'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ThreadRunControlService, threadGraphRevision } from '../chat-conversation/thread-run-control.service'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE } from '../handoff/plugins/agent-chat/agent-chat-callback-noop.processor'
import { voiceTaskAnswer } from '../realtime-voice/voice-task-result'
import { GroupParticipant, GroupMessageRecipient } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { GroupMessagesService } from './group-messages.service'
import { GroupToolsService } from './group-tools.service'
import { parseGroupCommunication } from './group.schema'
import { publicMember } from './group-members.service'
import { groupModelInput } from './group-context'
import { groupDeliveryUserId } from './group-delivery-actor'
import { PrepareGroupChatCommand, FinishGroupChatCommand } from './group-dispatch.commands'

@Injectable()
export class GroupRuntimeService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly messages: GroupMessagesService,
        private readonly tools: GroupToolsService,
        private readonly control: ThreadRunControlService,
        private readonly queries: QueryBus,
        private readonly interactions: GroupInteractionsService,
        private readonly outbox: GroupOutboxService,
        private readonly composer: GroupComposerService
    ) {}

    /**
     * Reauthorize a durable receipt, reserve its runtime under locks, and build a common chat dispatch.
     * Busy inputs become persisted steer messages; queued jobs never supply model input or actor identity.
     */
    async prepare(job: HandoffMessage<AgentChatDispatchPayload>): Promise<AgentChatDispatchPayload | null> {
        // TypeORM skips undefined criteria; incomplete queue scope must never broaden the receipt lookup.
        if (!job.payload.options.groupDeliveryId || !job.tenantId || !job.headers?.organizationId) return null
        const receipt = await this.db.getRepository(GroupMessageRecipient).findOneBy({
            id: job.payload.options.groupDeliveryId,
            tenantId: job.tenantId,
            organizationId: job.headers?.organizationId,
            status: 'pending',
            wake: true
        })
        if (!receipt) return null
        const [member, source, group] = await Promise.all([
            this.db
                .getRepository(GroupParticipant)
                .findOneBy({ id: receipt.participantId, groupId: receipt.groupId, active: true, kind: 'assistant' }),
            this.db.getRepository(ChatMessage).findOneBy({ id: receipt.messageId, conversationId: receipt.groupId }),
            this.db.getRepository(ChatConversation).findOneBy({ id: receipt.groupId, purpose: 'group' })
        ])
        const communication = parseGroupCommunication(source?.groupCommunication)
        const initiatorUserId = groupDeliveryUserId(source)
        try {
            if (!member || !group) throw new Error('group_binding_revoked')
            await this.access.withRootUser(group, communication.rootUserId, async () => {
                await this.access.assistant(member.subjectId)
                const sender = await this.db
                    .getRepository(GroupParticipant)
                    .findOneBy({ id: communication.senderId, groupId: group.id, active: true })
                if (!sender) throw new Error('group_sender_revoked')
                if (sender.kind === 'assistant') await this.access.assistant(sender.subjectId)
            })
            await this.access.withRootUser(group, initiatorUserId, async () => {
                await this.access.assistant(member.subjectId)
                if (communication.composer) await this.composer.validate(member, communication.composer)
            })
            if (receipt.control)
                await this.access.withRootUser(group, receipt.control.actorId, () =>
                    this.access.assistant(member.subjectId)
                )
        } catch {
            await this.db
                .getRepository(GroupMessageRecipient)
                .update({ id: receipt.id, status: 'pending' }, { status: 'blocked', error: 'authorization_revoked' })
            await this.db.getRepository(ChatConversation).increment({ id: receipt.groupId }, 'revision', 1)
            return null
        }
        const rootMessage = await this.db
            .getRepository(ChatMessage)
            .findOneByOrFail({ id: communication.rootMessageId, conversationId: group.id })
        const action = await this.db.transaction(async (manager) => {
            await manager.findOne(ChatConversation, { where: { id: group.id }, lock: { mode: 'pessimistic_write' } })
            const active = await manager.findBy(GroupParticipant, { groupId: group.id, active: true })
            if (
                !active.some((p) => p.id === member.id) ||
                !active.some((p) => p.id === communication.senderId) ||
                !active.some((p) => p.kind === 'user' && p.subjectId === communication.rootUserId) ||
                !active.some((p) => p.kind === 'user' && p.subjectId === initiatorUserId) ||
                (receipt.control && !active.some((p) => p.kind === 'user' && p.subjectId === receipt.control.actorId))
            ) {
                await manager.update(
                    GroupMessageRecipient,
                    { id: receipt.id, status: 'pending' },
                    { status: 'blocked', error: 'authorization_revoked' }
                )
                await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
                return null
            }
            const thread = await manager.findOne(ChatConversationThread, {
                where: { threadId: member.runtimeThreadId },
                lock: { mode: 'pessimistic_write' }
            })
            const row = await manager.findOne(GroupMessageRecipient, {
                where: { id: receipt.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (row.status !== 'pending') return null
            if (row.control) {
                if (
                    row.control.pauseId
                        ? thread.status !== 'paused' ||
                          thread.runControl?.pauseId !== row.control.pauseId ||
                          thread.runControl.executionId !== row.executionId
                        : thread.status !== 'interrupted' ||
                          !thread.operation ||
                          (!!thread.runtimeContinuationBlockedAt &&
                              source.createdAt <= thread.runtimeContinuationBlockedAt)
                ) {
                    row.status = 'blocked'
                    await manager.save(row)
                    await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
                    return null
                }
                receipt.control = row.control
                receipt.executionId = row.executionId
                receipt.status = 'starting'
                row.status = 'starting'
                row.phase = 'started'
                row.startedAt = new Date()
                await manager.save(row)
                if (!row.control.pauseId) {
                    thread.status = 'busy'
                    thread.runControl = { executionId: receipt.executionId, state: 'running' }
                    await manager.save(thread)
                }
                await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
                return 'resume'
            }
            if (
                ['pausing', 'paused'].includes(thread.status) ||
                thread.operation ||
                (thread.runtimeContinuationBlockedAt && rootMessage.createdAt <= thread.runtimeContinuationBlockedAt) ||
                (thread.status === 'interrupted' && !(communication.hop === 0 && communication.intent === 'request'))
            ) {
                row.status = 'blocked'
                row.error = 'runtime_blocked'
                await manager.save(row)
                await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
                return null
            }
            if (communication.composer) {
                const runtime = await manager.findOneByOrFail(ChatConversation, { id: member.runtimeConversationId })
                const projectId = communication.composer.projectId ?? null
                const locked =
                    thread.status !== 'idle' || (await manager.existsBy(ChatMessage, { conversationId: runtime.id }))
                if (locked && (runtime.projectId ?? null) !== projectId) {
                    row.status = 'blocked'
                    row.error = 'composer_project_changed'
                    await manager.save(row)
                    await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
                    return null
                }
                runtime.projectId = projectId
                await manager.save(runtime)
            }
            const busy = thread.status === 'busy'
            const realtime =
                job.headers?.handoffQueue === 'realtime' || job.headers?.handoffQueue === 'handoff:realtime'
            if (busy !== realtime || (busy && !thread.runControl)) return null
            receipt.executionId = busy ? thread.runControl.executionId : randomUUID()
            receipt.status = busy ? 'steering' : 'starting'
            row.executionId = receipt.executionId
            row.status = receipt.status
            row.phase = 'started'
            row.startedAt = new Date()
            row.nextAttemptAt = new Date(Date.now() + 30_000)
            if (!busy) {
                // The preallocated runtime is first used by a question, not necessarily by its inviter.
                // Keep that conversation creator stable; each subsequent run has its own human creator.
                if (!(await manager.existsBy(XpertAgentExecution, { threadId: member.runtimeThreadId }))) {
                    await manager.update(
                        ChatConversation,
                        { id: member.runtimeConversationId },
                        { createdById: initiatorUserId }
                    )
                    thread.createdById = initiatorUserId
                }
                thread.status = 'busy'
                thread.runControl = { executionId: receipt.executionId, state: 'running' }
                await manager.save(thread)
                await manager.save(
                    XpertAgentExecution,
                    manager.create(XpertAgentExecution, {
                        id: receipt.executionId,
                        tenantId: group.tenantId,
                        organizationId: group.organizationId,
                        createdById: initiatorUserId,
                        threadId: member.runtimeThreadId,
                        xpertId: member.subjectId,
                        agentKey: 'general_agent',
                        type: 'agent',
                        status: XpertAgentExecutionStatusEnum.RUNNING
                    })
                )
            }
            await manager.save(row)
            await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
            return busy ? 'steer' : 'send'
        })
        if (!action) return null
        const members = await this.db.getRepository(GroupParticipant).findBy({ groupId: group.id })
        const background = await this.db.getRepository(ChatMessage).find({
            where: { conversationId: group.id, sequence: MoreThan(member.contextSequence) },
            order: { sequence: 'DESC' },
            take: 40
        })
        // Addressed inputs retain their own receipt: background visibility never consumes another request.
        const text = groupModelInput({
            self: publicMember(member),
            members: members.map(publicMember),
            background: background
                .reverse()
                .filter(
                    (row) =>
                        row.id !== source.id &&
                        row.groupCommunication?.senderId !== member.id &&
                        !row.groupCommunication?.recipientIds.includes(member.id)
                )
                .map((row) => ({
                    id: row.id,
                    text: voiceTaskAnswer(row.content)?.slice(0, 4000) ?? '',
                    communication: parseGroupCommunication(row.groupCommunication)
                })),
            addressed: { id: source.id, text: voiceTaskAnswer(source.content) ?? '', communication }
        })
        // Advance only over history actually projected into this input, never over messages posted during the run.
        receipt.contextSequence = Math.max(
            member.contextSequence,
            source.sequence,
            ...background.map((row) => row.sequence)
        )
        await this.db
            .getRepository(GroupMessageRecipient)
            .update({ id: receipt.id }, { contextSequence: receipt.contextSequence })
        let resumeCheckpoint: TChatCheckpointReference | undefined
        if (action === 'resume' && receipt.control.pauseId) {
            const graph = await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                new GetXpertWorkflowQuery(member.subjectId, undefined, false)
            )
            resumeCheckpoint = await this.control.claimResume(
                member.runtimeThreadId,
                receipt.executionId,
                receipt.control.pauseId,
                threadGraphRevision(graph.graph)
            )
            await this.db
                .getRepository(XpertAgentExecution)
                .update({ id: receipt.executionId }, { status: XpertAgentExecutionStatusEnum.RUNNING })
        }
        if (action === 'resume' && !receipt.control.pauseId)
            await this.db
                .getRepository(XpertAgentExecution)
                .update({ id: receipt.executionId }, { status: XpertAgentExecutionStatusEnum.RUNNING })
        if (action === 'send' || (action === 'resume' && !receipt.control.pauseId))
            await this.control.start(member.runtimeThreadId, receipt.executionId)
        const selection = communication.composer
        const input = {
            clientMessageId: receipt.id,
            input: {
                input: text,
                ...(selection
                    ? {
                          files: selection.files,
                          runtimeResources: selection.runtimeResources,
                          runtimeCapabilities: selection.runtimeCapabilities
                      }
                    : {})
            }
        }
        return {
            request:
                action === 'resume'
                    ? {
                          action: 'resume',
                          conversationId: member.runtimeConversationId,
                          target: { executionId: receipt.executionId },
                          decision: receipt.control.decision
                      }
                    : action === 'steer'
                      ? {
                            action: 'follow_up',
                            conversationId: member.runtimeConversationId,
                            mode: 'steer',
                            target: { executionId: receipt.executionId },
                            message: input
                        }
                      : {
                            action: 'send',
                            conversationId: member.runtimeConversationId,
                            projectId: selection?.projectId,
                            message: input
                        },
            options: {
                resumeCheckpoint,
                groupDeliveryId: receipt.id,
                xpertId: member.subjectId,
                threadId: member.runtimeThreadId,
                isDraft: false,
                runtimePrincipal: { type: 'assistant', xpertId: member.subjectId },
                execution: { id: receipt.executionId },
                tools: [this.tools.create(receipt, member)],
                context: { groupId: group.id, groupParticipantId: member.id },
                streamPersistence:
                    action !== 'steer'
                        ? { transport: 'redis-stream', threadId: member.runtimeThreadId, runId: receipt.executionId }
                        : undefined,
                messageEnvelope: {
                    version: 1,
                    source: source.messageEnvelope.source,
                    presentation: 'runtime',
                    correlation: { messageId: receipt.id, replyToMessageId: source.id },
                    target: {
                        xpertId: member.subjectId,
                        conversationId: member.runtimeConversationId,
                        threadId: member.runtimeThreadId
                    }
                }
            },
            callback: { messageType: AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE, events: 'lifecycle' }
        }
    }

    /**
     * Reconcile execution/steer state, publish only public answer text, and advance the observed context.
     * Recovery may repeat this method; publication keys and receipt states prevent duplicate replies.
     * A run with an ambiguous worker loss is blocked instead of replaying model/tool side effects.
     */
    async finish(recipientId: string, dispatchFailed = false, dispatchFinished = false) {
        const repo = this.db.getRepository(GroupMessageRecipient)
        const receipt = await repo.findOneBy({ id: recipientId })
        if (
            !receipt ||
            !receipt.executionId ||
            (!dispatchFinished && receipt.phase === 'finalized') ||
            !['starting', 'steering', 'canceled', ...(dispatchFinished ? ['blocked', 'consumed'] : [])].includes(
                receipt.status
            )
        )
            return
        const member = await this.db.getRepository(GroupParticipant).findOneBy({ id: receipt.participantId })
        if (dispatchFailed && receipt.status === 'starting') {
            const current = await this.db.getRepository(XpertAgentExecution).findOneBy({ id: receipt.executionId })
            if (current?.status === XpertAgentExecutionStatusEnum.RUNNING) {
                await this.control.finish(member.runtimeThreadId, receipt.executionId, 'error', 'group_dispatch_failed')
                await this.db
                    .getRepository(XpertAgentExecution)
                    .update({ id: receipt.executionId }, { status: XpertAgentExecutionStatusEnum.ERROR })
            }
        }
        const input = await this.db
            .getRepository(ChatMessage)
            .createQueryBuilder('message')
            .where('message.conversationId = :id', { id: member.runtimeConversationId })
            .andWhere("message.messageEnvelope -> 'correlation' ->> 'messageId' = :receipt", { receipt: receipt.id })
            .getOne()
        if (receipt.status === 'steering') {
            if (dispatchFailed && !input) {
                const thread = await this.db
                    .getRepository(ChatConversationThread)
                    .findOneBy({ threadId: member.runtimeThreadId })
                const retry = ['idle', 'busy'].includes(thread.status) && !thread.operation
                await repo.update(
                    { id: receipt.id, status: 'steering' },
                    {
                        status: retry ? 'pending' : 'blocked',
                        error: 'steer_not_accepted',
                        phase: retry ? null : 'finalized',
                        nextAttemptAt: new Date()
                    }
                )
                await this.db.getRepository(ChatConversation).increment({ id: receipt.groupId }, 'revision', 1)
                return
            }
            if (input?.followUpStatus === 'consumed') {
                await repo.update(
                    { id: recipientId, status: 'steering' },
                    { status: 'consumed', inputMessageId: input.id }
                )
                await this.db.getRepository(ChatConversation).increment({ id: receipt.groupId }, 'revision', 1)
                return
            }
            const thread = await this.db
                .getRepository(ChatConversationThread)
                .findOneBy({ threadId: member.runtimeThreadId })
            if (thread.status === 'busy' && thread.runControl?.executionId === receipt.executionId) return
            // Natural completion may leave an unconsumed steer. The same receipt/client ID becomes a send.
            await repo.update(
                { id: recipientId, status: 'steering' },
                {
                    status: thread.status === 'idle' ? 'pending' : 'blocked',
                    phase: null,
                    nextAttemptAt: new Date(),
                    inputMessageId: input?.id
                }
            )
            return
        }
        // Reservation and lease creation are separate commits. A lost worker in that gap is ambiguous,
        // so fail closed instead of replaying the model or its tools.
        await this.db.transaction(async (manager) => {
            const thread = await manager.findOne(ChatConversationThread, {
                where: { threadId: member.runtimeThreadId },
                lock: { mode: 'pessimistic_write' }
            })
            if (
                thread?.runControl?.executionId === receipt.executionId &&
                thread.status === 'busy' &&
                !readRunLease(thread.metadata) &&
                (receipt.startedAt ?? receipt.updatedAt).getTime() < Date.now() - 120_000
            ) {
                thread.status = 'error'
                thread.runControl = null
                thread.runtimeContinuationBlockedAt = new Date()
                await manager.save(thread)
                await manager.update(
                    XpertAgentExecution,
                    { id: receipt.executionId },
                    { status: XpertAgentExecutionStatusEnum.INTERRUPTED }
                )
            }
        })
        await this.control.recoverExpiredRun(member.runtimeThreadId)
        const execution = await this.db.getRepository(XpertAgentExecution).findOneBy({ id: receipt.executionId })
        if (
            !execution ||
            [XpertAgentExecutionStatusEnum.RUNNING, XpertAgentExecutionStatusEnum.PENDING].includes(execution.status)
        )
            return
        const completed = execution.status === XpertAgentExecutionStatusEnum.SUCCESS && receipt.status !== 'canceled'
        if (!completed && member.active && receipt.status !== 'canceled') {
            const thread = await this.db
                .getRepository(ChatConversationThread)
                .findOneBy({ threadId: member.runtimeThreadId })
            const source = await this.db.getRepository(ChatMessage).findOneByOrFail({ id: receipt.messageId })
            if (thread.status === 'interrupted' && thread.operation)
                await this.interactions.register(
                    receipt,
                    member,
                    parseGroupCommunication(source.groupCommunication).rootUserId,
                    thread.operation
                )
        }
        const group = await this.db.getRepository(ChatConversation).findOneByOrFail({ id: receipt.groupId })
        const source = await this.db.getRepository(ChatMessage).findOneByOrFail({ id: receipt.messageId })
        const root = parseGroupCommunication(source.groupCommunication)
        const outputs = await this.db.getRepository(ChatMessage).find({
            where: { conversationId: member.runtimeConversationId, executionId: execution.id, role: 'ai' },
            order: { createdAt: 'ASC' }
        })
        const visible = outputs.filter((output) => voiceTaskAnswer(output.content))
        const replyTarget = completed ? await this.automaticReplyTarget(member, source) : undefined
        let publicationBlocked = false
        for (const [index, output] of visible.entries()) {
            if (!member.active) break
            const text = voiceTaskAnswer(output.content)
            const publicationId = `output:${output.id}`
            const isAnswer = completed && index === visible.length - 1 && !!replyTarget
            try {
                await this.messages.publish(
                    group,
                    member,
                    isAnswer
                        ? { intent: 'reply', replyToMessageId: replyTarget, text, clientMessageId: output.id }
                        : { intent: 'message', recipientIds: [], text, clientMessageId: output.id },
                    root,
                    publicationId,
                    true,
                    source.id
                )
            } catch (error) {
                // Revocation or the chain budget can close publication, but must not re-execute this run.
                if (
                    !(
                        error instanceof Error &&
                        'getStatus' in error &&
                        typeof error.getStatus === 'function' &&
                        [403, 409].includes(error.getStatus())
                    )
                )
                    throw error
                publicationBlocked = true
            }
        }
        await repo.update(
            { id: recipientId, status: receipt.status },
            {
                status:
                    receipt.status === 'canceled'
                        ? 'canceled'
                        : completed && !publicationBlocked
                          ? 'consumed'
                          : 'blocked',
                phase: 'finalized',
                inputMessageId: input?.id,
                control: null,
                error: publicationBlocked ? 'publication_blocked' : completed ? null : 'execution_not_completed'
            }
        )
        await this.db
            .getRepository(GroupParticipant)
            .createQueryBuilder()
            .update()
            .set({ contextSequence: () => 'GREATEST("contextSequence", :sequence)' })
            .where({ id: member.id })
            .setParameter('sequence', receipt.contextSequence)
            .execute()
        await this.db.getRepository(ChatConversation).increment({ id: receipt.groupId }, 'revision', 1)
        await this.outbox.flush(receipt.groupId)
    }
    /** A turn that asks E/B for help posts progress. Their correlated reply returns to the still-open parent request. */
    private async automaticReplyTarget(member: GroupParticipant, source: ChatMessage): Promise<string | undefined> {
        const messages = this.db.getRepository(ChatMessage)
        const receipts = this.db.getRepository(GroupMessageRecipient)
        const root = parseGroupCommunication(source.groupCommunication)
        let current = source
        const visited = new Set<string>()
        let target: string | undefined
        for (let hop = 0; current && hop < 8 && !visited.has(current.id); hop++) {
            visited.add(current.id)
            const communication = parseGroupCommunication(current.groupCommunication)
            if (communication.intent === 'request' && communication.recipientIds.includes(member.id)) {
                target = current.id
                break
            }
            if (communication.intent === 'reply') {
                const question = await messages.findOneBy({
                    id: communication.replyToMessageId,
                    conversationId: member.groupId
                })
                const parentId = question?.groupCommunication?.causedByMessageId ?? root.rootMessageId
                current = await messages.findOneBy({ id: parentId, conversationId: member.groupId })
            } else if (communication.causedByMessageId)
                current = await messages.findOneBy({
                    id: communication.causedByMessageId,
                    conversationId: member.groupId
                })
            else break
        }
        if (!target) return undefined
        const receipt = await receipts.findOneBy({ messageId: target, participantId: member.id })
        if (!receipt || receipt.replyMessageId || ['blocked', 'canceled', 'failed'].includes(receipt.status))
            return undefined
        const outgoing = await messages
            .createQueryBuilder('message')
            .where('message.conversationId = :groupId', { groupId: member.groupId })
            .andWhere("message.groupCommunication ->> 'rootMessageId' = :root", { root: root.rootMessageId })
            .andWhere("message.groupCommunication ->> 'senderId' = :sender", { sender: member.id })
            .andWhere("message.groupCommunication ->> 'intent' = 'request'")
            .getMany()
        if (
            outgoing.length &&
            (await receipts.countBy({
                messageId: In(outgoing.map((message) => message.id)),
                replyMessageId: IsNull(),
                status: Not(In(['blocked', 'canceled', 'failed']))
            }))
        )
            return undefined
        return target
    }
}

@CommandHandler(PrepareGroupChatCommand)
export class PrepareGroupChatHandler implements ICommandHandler<PrepareGroupChatCommand> {
    constructor(private readonly runtime: GroupRuntimeService) {}
    execute(command: PrepareGroupChatCommand) {
        return this.runtime.prepare(command.message)
    }
}
@CommandHandler(FinishGroupChatCommand)
export class FinishGroupChatHandler implements ICommandHandler<FinishGroupChatCommand> {
    constructor(private readonly runtime: GroupRuntimeService) {}
    execute(command: FinishGroupChatCommand) {
        return this.runtime.finish(command.recipientId, command.dispatchFailed, command.dispatchFinished)
    }
}
