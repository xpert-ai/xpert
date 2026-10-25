import { ExecutionControlEvidenceService } from '../../execution-control/execution-control-evidence.service'
// Invariants: the Invocation is reserved first; one stable publication creates one durable group receipt.
// Only that receipt's actual execution can complete the attempt. Group text never decides task acceptance.
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource, In } from 'typeorm'
import {
    AgentRuntimeContext,
    AgentRuntimeHandle,
    AgentRuntimeObservation,
    AgentRuntimeStart,
    agentInvocationDispatchContextSchema,
    CancelConversationCommand
} from '@xpert-ai/plugin-sdk'
import { unknownExecutionControl, assistantTaskGroupContext, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { chatMessageText } from '../../shared/chat-message-text'
import { GroupAccessService } from '../group-access.service'
import { GroupMessagesService } from '../group-messages.service'
import { GroupOutboxService } from '../group-outbox.service'
import { GroupMessageRecipient, GroupParticipant, GroupInteraction } from '../group.entity'
import { groupDenied } from '../group.errors'
import { parseGroupCommunication } from '../group.schema'
import { GroupTaskTargetService } from './group-task-target.service'
import { withGroupRuntime } from '../group-runtime-context'
import { ExecuteGroupTaskCommand } from './group-task.commands'

@CommandHandler(ExecuteGroupTaskCommand)
export class ExecuteGroupTaskHandler implements ICommandHandler<ExecuteGroupTaskCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly targets: GroupTaskTargetService,
        private readonly access: GroupAccessService,
        private readonly messages: GroupMessagesService,
        private readonly outbox: GroupOutboxService,
        private readonly commands: CommandBus,
        private readonly evidence: ExecutionControlEvidenceService
    ) {}

    execute({ operation, context }: ExecuteGroupTaskCommand) {
        if (operation.type === 'start') return this.start(operation.request, context)
        return operation.type === 'cancel'
            ? this.cancel(operation.handle, context)
            : this.inspect(operation.handle, context)
    }

    async start(request: AgentRuntimeStart, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
        if (request.previous) return this.inspect(request.previous, context)
        const record = await this.record(context)
        const task = agentInvocationDispatchContextSchema.parse(record.invocation.request.dispatch).projectTask
        if (!task || task.projectId !== context.scope.projectId) throw groupDenied()
        const target = await this.targets.resolve(context.scope, request.target.bindingId)
        const member = await this.db
            .getRepository(GroupParticipant)
            .findOneByOrFail({ id: target.bindingId, active: true })
        const sourceMember = await this.db.getRepository(GroupParticipant).findOneByOrFail({
            groupId: member.groupId,
            runtimeConversationId: context.scope.conversationId,
            active: true
        })
        const sourceReceipt = await this.db.getRepository(GroupMessageRecipient).findOneBy({
            groupId: member.groupId,
            participantId: sourceMember.id,
            executionId: context.scope.parentExecutionId
        })
        if (!sourceReceipt) throw groupDenied()
        const source = await this.db
            .getRepository(ChatMessage)
            .findOneByOrFail({ id: sourceReceipt.messageId, conversationId: member.groupId })
        const group = await this.db.getRepository(ChatConversation).findOneByOrFail({ id: member.groupId })
        const root = parseGroupCommunication(source.groupCommunication)
        if (root.rootUserId !== context.scope.userId) throw groupDenied()
        const message = await this.access.withRootUser(group, context.scope.userId, () =>
            this.messages.publish(
                group,
                sourceMember,
                {
                    intent: 'request',
                    recipientIds: [member.id],
                    text: request.input.prompt,
                    clientMessageId: context.invocationId
                },
                root,
                `project-task:${context.invocationId}`,
                false,
                source.id,
                {
                    projectTask: {
                        invocationId: context.invocationId,
                        projectId: task.projectId,
                        projectTaskId: task.projectTaskId,
                        taskExecutionId: task.taskExecutionId
                    }
                }
            )
        )
        const receipt = await this.db
            .getRepository(GroupMessageRecipient)
            .findOneByOrFail({ messageId: message.id, participantId: member.id })
        const handle = { sessionId: group.id, runId: receipt.id }
        await context.checkpoint({ status: 'queued', handle })
        await this.outbox.flush(group.id)
        return this.inspect(handle, context)
    }

    private async record(context: AgentRuntimeContext) {
        const record = await this.db.getRepository(AgentInvocationEntity).findOneBy({
            id: context.invocationId,
            tenantId: context.scope.tenantId,
            organizationId: context.scope.organizationId,
            ownerId: context.scope.userId
        })
        if (!record || !assistantTaskGroupContext(record.invocation.request.target)) throw groupDenied()
        return record
    }

    async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
        const record = await this.record(context)
        await this.targets.resolve(context.scope, record.invocation.request.target.bindingId)
        const member = await this.db.getRepository(GroupParticipant).findOneByOrFail({
            id: record.invocation.request.target.bindingId,
            groupId: handle.sessionId,
            active: true
        })
        const group = await this.db.getRepository(ChatConversation).findOneByOrFail({ id: member.groupId })
        const receipt = await this.db.transaction(async (manager) => {
            await manager.findOneOrFail(ChatConversation, {
                where: { id: group.id },
                lock: { mode: 'pessimistic_write' }
            })
            await manager.findOneOrFail(ChatConversationThread, {
                where: { threadId: member.runtimeThreadId },
                lock: { mode: 'pessimistic_write' }
            })
            const receipt = await manager.findOneOrFail(GroupMessageRecipient, {
                where: { id: handle.runId, groupId: group.id, participantId: member.id },
                lock: { mode: 'pessimistic_write' }
            })
            const source = await manager.findOneByOrFail(ChatMessage, { id: receipt.messageId })
            if (parseGroupCommunication(source.groupCommunication).projectTask?.invocationId !== context.invocationId)
                throw groupDenied()
            if (!receipt.executionId && ['pending', 'blocked'].includes(receipt.status)) {
                receipt.status = 'canceled'
                await manager.save(receipt)
                await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
            }
            return receipt
        })
        const completion = receipt.executionId
            ? await this.evidence.read(receipt.executionId, context.scope)
            : undefined
        if (receipt.executionId && completion?.state !== 'settled') {
            await this.access.withRootUser(group, context.scope.userId, () =>
                withGroupRuntime(member.runtimeConversationId, () =>
                    this.commands.execute(
                        new CancelConversationCommand({
                            threadId: member.runtimeThreadId,
                            executionId:
                                completion?.source === 'platform' ? completion.executionId : receipt.executionId
                        })
                    )
                )
            )
            await this.db
                .getRepository(GroupMessageRecipient)
                .update(
                    { id: receipt.id, executionId: receipt.executionId, status: receipt.status },
                    { status: 'canceled', control: null }
                )
            await this.db.getRepository(ChatConversation).increment({ id: group.id }, 'revision', 1)
            await this.db.getRepository(GroupInteraction).update(
                {
                    groupId: group.id,
                    participantId: member.id,
                    runId: receipt.executionId,
                    status: In(['pending', 'claimed'])
                },
                { status: 'canceled' }
            )
        }
        return this.inspect(handle, context)
    }

    async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
        const record = await this.record(context)
        await this.targets.resolve(context.scope, record.invocation.request.target.bindingId)
        const receipt = await this.db.getRepository(GroupMessageRecipient).findOneBy({
            id: handle.runId,
            groupId: handle.sessionId,
            participantId: record.invocation.request.target.bindingId,
            tenantId: context.scope.tenantId,
            organizationId: context.scope.organizationId
        })
        if (!receipt) return { status: 'unknown', handle }
        const source = await this.db.getRepository(ChatMessage).findOneByOrFail({ id: receipt.messageId })
        if (parseGroupCommunication(source.groupCommunication).projectTask?.invocationId !== context.invocationId)
            throw groupDenied()
        const execution = receipt.executionId
            ? await this.db.getRepository(XpertAgentExecution).findOneBy({ id: receipt.executionId })
            : null
        const progress = receipt.startedAt
            ? {
                  source: 'host' as const,
                  observedAt: new Date().toISOString(),
                  startedAt: receipt.startedAt.toISOString()
              }
            : undefined
        const control = receipt.executionId ? await this.evidence.read(receipt.executionId, context.scope) : undefined
        const proof = (outcome: 'cancelled' | 'failed' | 'succeeded') => ({
            version: 1 as const,
            source: 'provider' as const,
            subject: { kind: 'invocation' as const, id: context.invocationId },
            scope: 'operation' as const,
            state: 'settled' as const,
            outcome,
            sessionId: handle.sessionId,
            runId: handle.runId,
            receiptKey: control?.source === 'platform' ? control.taskId : receipt.id,
            observedAt: new Date().toISOString()
        })
        if (
            receipt.status === 'canceled' &&
            !(control?.state === 'settled' && execution?.status === XpertAgentExecutionStatusEnum.SUCCESS)
        ) {
            // Withdrawal under the admission lock proves an unstarted delivery. An execution ID requires its ledger.
            if ((!receipt.executionId && receipt.phase !== 'started') || control?.state === 'settled')
                return { status: 'cancelled', handle, progress, controlEvidence: proof('cancelled') }
            return {
                status: 'cancelling',
                handle,
                progress,
                controlEvidence: unknownExecutionControl({ kind: 'invocation', id: context.invocationId })
            }
        }
        // A finalized delivery or an interrupted graph is not proof that its tools have finished.
        if (receipt.executionId && control?.state !== 'settled')
            return {
                status: control?.state === 'paused' ? 'waiting' : control?.state === 'unknown' ? 'unknown' : 'running',
                handle,
                progress,
                controlEvidence: unknownExecutionControl({ kind: 'invocation', id: context.invocationId })
            }
        if (receipt.status === 'pending') return { status: 'queued', handle }
        if (receipt.status === 'failed')
            return {
                status: 'failed',
                handle,
                progress,
                ...(control?.state === 'settled' ? { controlEvidence: proof('failed') } : {}),
                error: receipt.error ?? 'group_delivery_failed'
            }
        const member = await this.db.getRepository(GroupParticipant).findOneByOrFail({ id: receipt.participantId })
        const thread = await this.db
            .getRepository(ChatConversationThread)
            .findOneByOrFail({ threadId: member.runtimeThreadId })
        if (
            ['paused', 'pausing', 'interrupted'].includes(thread.status) &&
            execution?.status !== XpertAgentExecutionStatusEnum.ERROR
        )
            return { status: 'waiting', handle, progress }
        if (receipt.status === 'blocked')
            return {
                status: 'failed',
                handle,
                progress,
                ...(control?.state === 'settled' ? { controlEvidence: proof('failed') } : {}),
                error: receipt.error ?? 'group_execution_blocked'
            }
        if (receipt.phase !== 'finalized') return { status: 'running', handle, progress }
        if (execution?.status !== XpertAgentExecutionStatusEnum.SUCCESS)
            return {
                status: 'failed',
                handle,
                progress,
                ...(control?.state === 'settled' ? { controlEvidence: proof('failed') } : {}),
                error: 'group_execution_failed'
            }
        const outputs = await this.db.getRepository(ChatMessage).find({
            where: { conversationId: member.runtimeConversationId, executionId: receipt.executionId, role: 'ai' },
            order: { createdAt: 'ASC' }
        })
        const reply = receipt.replyMessageId
            ? await this.db
                  .getRepository(ChatMessage)
                  .findOneBy({ id: receipt.replyMessageId, conversationId: receipt.groupId })
            : null
        const text = [
            reply ? chatMessageText(reply.content) : '',
            ...outputs.map((output) => chatMessageText(output.content))
        ]
            .filter(Boolean)
            .join('\n\n')
        return {
            status: 'succeeded',
            controlEvidence: proof('succeeded'),
            handle,
            progress,
            result: {
                text,
                data: {
                    groupId: receipt.groupId,
                    participantId: member.id,
                    executionId: receipt.executionId,
                    messageId: receipt.messageId
                }
            }
        }
    }
}
