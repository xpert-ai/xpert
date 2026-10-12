import { randomUUID } from 'node:crypto'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, EntitySchema } from 'typeorm'
import {
    AgentInvocation,
    AgentRuntimeResultClaim,
    AgentChatDispatchPayload,
    HandoffMessage
} from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { AgentRuntimeInbox } from '../../../handoff/runtime-messaging/runtime-message.entity'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { GroupMessageRecipient, GroupParticipant } from '../../group.entity'
import { GroupMessagesService } from '../../group-messages.service'
import { GroupRuntimeService } from '../../group-runtime.service'
import { GroupAccessService } from '../../group-access.service'
import { GroupOutboxService } from '../../group-outbox.service'
import { GroupTaskTargetService } from '../group-task-target.service'
import { DeliverGroupTaskResultHandler } from '../group-task-result.handler'
import { DeliverGroupTaskResultCommand } from '../group-task.commands'

const uuid = { type: 'uuid' as const }
export const groupResultSchemas = [
    new EntitySchema({
        name: 'AgentInvocationEntity',
        target: AgentInvocationEntity,
        tableName: 'agent_invocation',
        columns: {
            id: { ...uuid, primary: true },
            tenantId: uuid,
            organizationId: uuid,
            ownerId: uuid,
            invocation: { type: 'jsonb' }
        }
    }),
    new EntitySchema({
        name: 'AgentRuntimeInbox',
        target: AgentRuntimeInbox,
        tableName: 'agent_runtime_inbox',
        columns: {
            id: { ...uuid, primary: true },
            tenantId: uuid,
            organizationId: uuid,
            ownerId: uuid,
            invocationId: uuid,
            state: { type: 'varchar' },
            claim: { type: 'jsonb' }
        }
    })
]

type Fixture = {
    db: DataSource
    messages: GroupMessagesService
    runtime: GroupRuntimeService
    group: ChatConversation
    c: GroupParticipant
    e: GroupParticipant
    a: GroupParticipant
    access: GroupAccessService
}

export function groupTaskResultCases(fixture: () => Fixture) {
    describe('native Assistant task results through the common inbox', () => {
        async function setup(withReply = true) {
            const f = fixture(),
                { db, messages, group, c, e, a } = f
            group.projectId = randomUUID()
            await db.getRepository(ChatConversation).update({ id: group.id }, { projectId: group.projectId })
            for (const member of [c, e])
                await db
                    .getRepository(ChatConversation)
                    .update({ id: member.runtimeConversationId }, { projectId: group.projectId })
            const root = await messages.send(group.id, {
                intent: 'request',
                recipientIds: [c.id],
                text: 'Research then report',
                clientMessageId: randomUUID()
            })
            const invocationId = randomUUID(),
                taskExecutionId = randomUUID(),
                projectTaskId = randomUUID()
            const task = { invocationId, projectId: group.projectId, projectTaskId, taskExecutionId }
            const source = await messages.publish(
                group,
                c,
                {
                    intent: 'request',
                    recipientIds: [e.id],
                    text: 'Research',
                    clientMessageId: invocationId
                },
                root.communication,
                `project-task:${invocationId}`,
                false,
                root.id,
                { projectTask: task }
            )
            const reply = withReply
                ? await messages.publish(group, e, {
                      intent: 'reply',
                      replyToMessageId: source.id,
                      text: 'Research evidence: 42',
                      clientMessageId: randomUUID()
                  })
                : null
            const invocation: AgentInvocation = {
                id: invocationId,
                revision: 4,
                status: withReply ? 'succeeded' : 'failed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                scope: {
                    tenantId: group.tenantId,
                    organizationId: group.organizationId,
                    userId: a.subjectId,
                    projectId: group.projectId,
                    parentExecutionId: randomUUID(),
                    callerAgentKey: 'general_agent',
                    callerXpertId: c.subjectId,
                    conversationId: c.runtimeConversationId
                },
                request: {
                    callId: randomUUID(),
                    input: { prompt: 'Research' },
                    target: {
                        provider: 'xpert-task',
                        bindingId: e.id,
                        reference: e.subjectId,
                        revision: '1',
                        configuration: {
                            executionContext: {
                                type: 'group_member',
                                groupId: group.id,
                                participantId: e.id,
                                sourceParticipantId: c.id,
                                projectId: group.projectId
                            }
                        }
                    },
                    dispatch: {
                        version: 1,
                        requestId: randomUUID(),
                        sourceMessageId: randomUUID(),
                        replyTo: {
                            xpertId: c.subjectId,
                            agentKey: 'general_agent',
                            conversationId: c.runtimeConversationId,
                            threadId: c.runtimeThreadId
                        },
                        projectTask: {
                            projectId: group.projectId,
                            projectTaskId,
                            taskExecutionId,
                            purpose: { type: 'implementation' },
                            specification: {
                                digest: `sha256:${'a'.repeat(64)}`,
                                specification: {
                                    version: 1,
                                    title: 'Research',
                                    requirements: ['Find evidence'],
                                    steps: []
                                }
                            }
                        }
                    }
                }
            }
            await db.getRepository(AgentInvocationEntity).save({
                id: invocationId,
                tenantId: group.tenantId,
                organizationId: group.organizationId,
                ownerId: a.subjectId,
                invocation
            })
            const executionId = randomUUID()
            const claim: AgentRuntimeResultClaim = {
                invocationId,
                resultRevision: invocation.revision,
                recipient: invocation.request.dispatch.replyTo,
                consumer: { type: 'follow_up', executionId }
            }
            const inbox = await db.getRepository(AgentRuntimeInbox).save({
                id: randomUUID(),
                invocationId,
                tenantId: group.tenantId,
                organizationId: group.organizationId,
                ownerId: a.subjectId,
                state: 'processing',
                claim
            })
            const targets = { resolve: jest.fn() },
                commands = { execute: jest.fn() },
                outbox = { flush: jest.fn() }
            const handler = new DeliverGroupTaskResultHandler(
                db,
                targets as unknown as GroupTaskTargetService,
                f.access,
                messages,
                outbox as unknown as GroupOutboxService,
                commands as unknown as CommandBus
            )
            const command = new DeliverGroupTaskResultCommand(invocationId, executionId)
            return { ...f, handler, command, reply, invocation, inbox, targets }
        }
        it('reuses the original reply across retries and runs the inbox-reserved consumer once', async () => {
            const f = await setup()
            const count = await f.db.getRepository(ChatMessage).countBy({ conversationId: f.group.id })
            expect(await f.handler.execute(f.command)).toEqual({ state: 'pending' })
            expect(await f.handler.execute(f.command)).toEqual({ state: 'pending' })
            expect(await f.db.getRepository(ChatMessage).countBy({ conversationId: f.group.id })).toBe(count)
            const receipt = await f.db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: f.reply.id })
            expect(receipt).toMatchObject({ wake: true, status: 'pending' })
            const job: HandoffMessage<AgentChatDispatchPayload> = {
                id: receipt.id,
                type: 'agent_chat_dispatch',
                version: 1,
                tenantId: f.group.tenantId,
                sessionKey: f.c.runtimeThreadId,
                businessKey: receipt.id,
                traceId: receipt.id,
                enqueuedAt: Date.now(),
                attempt: 1,
                maxAttempts: 3,
                headers: { organizationId: f.group.organizationId },
                payload: {
                    request: { action: 'send', message: { input: {} } },
                    options: { groupDeliveryId: receipt.id },
                    callback: { messageType: 'noop' }
                }
            }
            const prepared = await f.runtime.prepare(job)
            expect(prepared.options.execution.id).toBe(f.command.executionId)
            expect(await f.runtime.prepare(job)).toBeNull()
            await f.db
                .getRepository(XpertAgentExecution)
                .update({ id: f.command.executionId }, { status: XpertAgentExecutionStatusEnum.SUCCESS })
            await f.runtime.finish(receipt.id)
            expect(await f.handler.execute(f.command)).toEqual({ state: 'processed' })
        })
        it('creates one fallback notice for a failed run with no reply', async () => {
            const f = await setup(false)
            const count = await f.db.getRepository(ChatMessage).countBy({ conversationId: f.group.id })
            await f.handler.execute(f.command)
            await f.handler.execute(f.command)
            expect(await f.db.getRepository(ChatMessage).countBy({ conversationId: f.group.id })).toBe(count + 1)
        })
        it('cannot publish an unclaimed, wait-consumed or revoked result', async () => {
            const f = await setup()
            await expect(
                f.handler.execute(new DeliverGroupTaskResultCommand(f.invocation.id, randomUUID()))
            ).rejects.toThrow()
            f.targets.resolve.mockRejectedValueOnce(new Error('revoked'))
            await expect(f.handler.execute(f.command)).rejects.toThrow('revoked')
            await f.db.getRepository(AgentRuntimeInbox).update({ id: f.inbox.id }, { state: 'processed' })
            await expect(f.handler.execute(f.command)).rejects.toThrow()
            expect(
                await f.db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: f.reply.id })
            ).toMatchObject({ wake: false })
        })
    })
}
