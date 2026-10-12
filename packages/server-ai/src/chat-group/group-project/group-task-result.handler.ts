// Invariants: the common runtime inbox claims consumption before group delivery.
// Reuse a member's reply; retries retain one publication and one consumer execution.
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import {
    agentInvocationDispatchContextSchema,
    agentRuntimeResultClaimSchema,
    isAgentInvocationTerminal
} from '@xpert-ai/plugin-sdk'
import { assistantTaskGroupContext, ChatGroupCommunication } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { AgentRuntimeInbox } from '../../handoff/runtime-messaging/runtime-message.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { GroupAccessService } from '../group-access.service'
import { GroupMessagesService } from '../group-messages.service'
import { GroupOutboxService } from '../group-outbox.service'
import { GroupMessageRecipient, GroupParticipant } from '../group.entity'
import { parseGroupCommunication } from '../group.schema'
import { groupDenied, groupConflict } from '../group.errors'
import { DeliverGroupTaskResultCommand } from './group-task.commands'
import { GroupTaskTargetService } from './group-task-target.service'
import { ProjectRuntimeObservationCommand } from '../../handoff/runtime-messaging/runtime-message.commands'

@CommandHandler(DeliverGroupTaskResultCommand)
export class DeliverGroupTaskResultHandler implements ICommandHandler<DeliverGroupTaskResultCommand> {
    constructor(
        private readonly db: DataSource,
        private readonly targets: GroupTaskTargetService,
        private readonly access: GroupAccessService,
        private readonly messages: GroupMessagesService,
        private readonly outbox: GroupOutboxService,
        private readonly commands: CommandBus
    ) {}
    async execute(
        command: DeliverGroupTaskResultCommand
    ): Promise<{ state: 'pending' | 'processed' | 'blocked'; error?: string }> {
        const record = await this.db.getRepository(AgentInvocationEntity).findOneByOrFail({ id: command.invocationId })
        const invocation = record.invocation
        const context = assistantTaskGroupContext(invocation.request.target)
        if (!context || !isAgentInvocationTerminal(invocation.status)) throw groupDenied()
        const inbox = await this.db.getRepository(AgentRuntimeInbox).findOneBy({
            invocationId: invocation.id,
            tenantId: invocation.scope.tenantId,
            organizationId: invocation.scope.organizationId,
            ownerId: invocation.scope.userId,
            state: 'processing'
        })
        const claim = agentRuntimeResultClaimSchema.safeParse(inbox?.claim)
        if (
            !claim.success ||
            claim.data.invocationId !== invocation.id ||
            claim.data.consumer.type !== 'follow_up' ||
            claim.data.consumer.executionId !== command.executionId
        )
            throw groupDenied()
        await this.targets.resolve(invocation.scope, context.participantId)
        const member = await this.db
            .getRepository(GroupParticipant)
            .findOneByOrFail({ id: context.participantId, active: true })
        const source = await this.db.getRepository(ChatMessage).findOneByOrFail({
            conversationId: member.groupId,
            groupPublicationId: `project-task:${invocation.id}`
        })
        const root = parseGroupCommunication(source.groupCommunication)
        const group = await this.db.getRepository(ChatConversation).findOneByOrFail({ id: member.groupId })
        const task = agentInvocationDispatchContextSchema.parse(invocation.request.dispatch).projectTask
        if (!task) throw groupDenied()
        const result: NonNullable<ChatGroupCommunication['runtimeResult']> = {
            invocationId: invocation.id,
            consumerExecutionId: command.executionId,
            revision: invocation.revision,
            projectId: task.projectId,
            projectTaskId: task.projectTaskId,
            taskExecutionId: task.taskExecutionId,
            specificationDigest: task.specification.digest
        }
        return this.access.withRootUser(group, invocation.scope.userId, async () => {
            await this.commands.execute(new ProjectRuntimeObservationCommand(invocation.id))
            const request = await this.db.getRepository(GroupMessageRecipient).findOneByOrFail({
                messageId: source.id,
                participantId: member.id
            })
            const fallback = request.replyMessageId
                ? null
                : await this.db.getRepository(ChatMessage).findOneBy({
                      conversationId: group.id,
                      groupPublicationId: `project-task-result:${invocation.id}`
                  })
            // Successful runs normally have a public reply already. Failure/empty output gets one bounded notice.
            const messageId =
                request.replyMessageId ??
                fallback?.id ??
                (
                    await this.messages.publish(
                        group,
                        member,
                        {
                            intent: 'message',
                            recipientIds: [root.senderId],
                            clientMessageId: invocation.id,
                            text: t(`server-ai:GroupTaskResult.${invocation.status}`, {
                                title: task.specification.specification.title
                            })
                        },
                        root,
                        `project-task-result:${invocation.id}`,
                        false,
                        source.id,
                        { runtimeResult: result }
                    )
                ).id
            const receipt = await this.db.transaction(async (manager) => {
                await manager.findOneOrFail(ChatConversation, {
                    where: { id: group.id },
                    lock: { mode: 'pessimistic_write' }
                })
                const message = await manager.findOneByOrFail(ChatMessage, { id: messageId, conversationId: group.id })
                const communication = parseGroupCommunication(message.groupCommunication)
                if (
                    communication.runtimeResult &&
                    (communication.runtimeResult.invocationId !== invocation.id ||
                        communication.runtimeResult.consumerExecutionId !== command.executionId)
                )
                    throw groupConflict()
                const recipient = await manager.findOneByOrFail(GroupMessageRecipient, {
                    messageId,
                    participantId: root.senderId
                })
                if (!communication.runtimeResult) {
                    if (recipient.wake || recipient.executionId) throw groupConflict()
                    message.groupCommunication = { ...communication, runtimeResult: result }
                    await manager.save(message)
                    recipient.wake = true
                    recipient.status = 'pending'
                    recipient.nextAttemptAt = new Date()
                    await manager.save(recipient)
                    await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
                }
                return recipient
            })
            await this.outbox.flush(group.id)
            if (['canceled', 'failed', 'blocked'].includes(receipt.status))
                return { state: 'blocked', error: receipt.error ?? 'group_result_blocked' }
            return { state: receipt.phase === 'finalized' && receipt.status === 'consumed' ? 'processed' : 'pending' }
        })
    }
}
