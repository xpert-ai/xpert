import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ExecutionControlEvidenceService } from '../../execution-control/execution-control-evidence.service'
import { ExecutionControlEvidence } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { AgentRuntimeContext, DefaultRuntimeCapabilityRegistry, CancelConversationCommand } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum, agentRuntimeProgressSchema } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { GroupInteraction, GroupMessageRecipient, GroupParticipant } from '../group.entity'
import { GroupMessagesService } from '../group-messages.service'
import { GroupOutboxService } from '../group-outbox.service'
import { GroupAccessService } from '../group-access.service'
import { GroupTaskTargetService } from './group-task-target.service'
import { ExecuteGroupTaskHandler } from './group-task-execution.handler'

function fixture() {
    const db = new DataSource({ type: 'postgres' })
    const context: AgentRuntimeContext = {
        invocationId: randomUUID(),
        scope: {
            tenantId: randomUUID(),
            organizationId: randomUUID(),
            userId: randomUUID(),
            projectId: randomUUID(),
            parentExecutionId: randomUUID(),
            callerAgentKey: 'general_agent'
        },
        capabilities: new DefaultRuntimeCapabilityRegistry(),
        checkpoint: jest.fn()
    }
    const member = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        runtimeConversationId: randomUUID(),
        runtimeThreadId: randomUUID()
    })
    const receipt = Object.assign(new GroupMessageRecipient(), {
        id: randomUUID(),
        groupId: randomUUID(),
        messageId: randomUUID(),
        participantId: member.id,
        status: 'pending'
    })
    const execution = Object.assign(new XpertAgentExecution(), {
        id: randomUUID(),
        status: XpertAgentExecutionStatusEnum.RUNNING
    })
    const thread = Object.assign(new ChatConversationThread(), { status: 'busy' })
    const source = Object.assign(new ChatMessage(), {
        groupCommunication: {
            intent: 'request',
            senderId: randomUUID(),
            recipientIds: [member.id],
            rootMessageId: randomUUID(),
            rootUserId: context.scope.userId,
            hop: 1,
            projectTask: {
                invocationId: context.invocationId,
                projectId: context.scope.projectId,
                projectTaskId: randomUUID(),
                taskExecutionId: randomUUID()
            }
        }
    })
    jest.spyOn(db.getRepository(AgentInvocationEntity), 'findOneBy').mockResolvedValue(
        Object.assign(new AgentInvocationEntity(), {
            invocation: {
                request: {
                    target: {
                        provider: 'xpert-task',
                        bindingId: member.id,
                        configuration: {
                            executionContext: {
                                type: 'group_member',
                                groupId: receipt.groupId,
                                participantId: member.id,
                                sourceParticipantId: randomUUID(),
                                projectId: context.scope.projectId
                            }
                        }
                    }
                }
            }
        })
    )
    jest.spyOn(db.getRepository(GroupMessageRecipient), 'findOneBy').mockResolvedValue(receipt)
    jest.spyOn(db.getRepository(GroupParticipant), 'findOneByOrFail').mockResolvedValue(member)
    jest.spyOn(db.getRepository(ChatMessage), 'findOneByOrFail').mockResolvedValue(source)
    const outputs = jest
        .spyOn(db.getRepository(ChatMessage), 'find')
        .mockResolvedValue([Object.assign(new ChatMessage(), { content: '42' })])
    jest.spyOn(db.getRepository(XpertAgentExecution), 'findOneBy').mockResolvedValue(execution)
    jest.spyOn(db.getRepository(ChatConversationThread), 'findOneByOrFail').mockResolvedValue(thread)
    const targets = { resolve: jest.fn() }
    const evidence = {
        read: jest.fn<Promise<ExecutionControlEvidence>, [string, unknown]>(async (id) => ({
            version: 1,
            source: 'platform',
            subject: { kind: 'execution', id },
            scope: 'owned_subtree',
            state: 'running',
            desired: 'running',
            taskId: id,
            rootId: id,
            revision: 1,
            executionId: id,
            threadId: 'thread',
            observedAt: new Date().toISOString()
        }))
    }
    const commands = { execute: jest.fn() }
    const strategy = new ExecuteGroupTaskHandler(
        db,
        targets as unknown as GroupTaskTargetService,
        { withRootUser: async (_group, _user, work: () => Promise<unknown>) => work() } as GroupAccessService,
        {} as GroupMessagesService,
        {} as GroupOutboxService,
        commands as unknown as CommandBus,
        evidence as unknown as ExecutionControlEvidenceService
    )
    return {
        strategy,
        commands,
        db,
        evidence,
        context,
        handle: { sessionId: receipt.groupId, runId: receipt.id },
        receipt,
        member,
        execution,
        thread,
        source,
        outputs,
        targets
    }
}
describe('group task runtime observations', () => {
    afterEach(() => jest.restoreAllMocks())
    it('distinguishes queued, running and a finalized real result without fabricating acceptance', async () => {
        const f = fixture()
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({ status: 'queued' })
        f.receipt.status = 'starting'
        f.receipt.executionId = f.execution.id
        f.receipt.startedAt = new Date()
        const running = await f.strategy.inspect(f.handle, f.context)
        expect(running).toMatchObject({ status: 'running' })
        expect(agentRuntimeProgressSchema.safeParse(running.progress).success).toBe(true)
        f.execution.status = XpertAgentExecutionStatusEnum.SUCCESS
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({ status: 'running' })
        const proof = await f.evidence.read(f.execution.id, f.context.scope)
        if (proof.source !== 'platform') throw Error('fixture')
        f.evidence.read.mockResolvedValue({ ...proof, state: 'settled' })
        f.receipt.phase = 'finalized'
        f.receipt.status = 'consumed'
        f.thread.status = 'idle'
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({
            status: 'succeeded',
            result: { text: '42', data: { executionId: f.execution.id } }
        })
        expect(f.outputs).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { conversationId: f.member.runtimeConversationId, executionId: f.execution.id, role: 'ai' }
            })
        )
    })
    it('never accepts a canceled, failed or paused execution as success', async () => {
        const f = fixture()
        f.receipt.executionId = f.execution.id
        f.receipt.status = 'canceled'
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({ status: 'cancelling' })
        f.execution.status = XpertAgentExecutionStatusEnum.INTERRUPTED
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({ status: 'cancelling' })
        const proof = await f.evidence.read(f.execution.id, f.context.scope)
        if (proof.source !== 'platform') throw Error('fixture')
        f.evidence.read.mockResolvedValue({ ...proof, state: 'settled', desired: 'terminated' })
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({
            status: 'cancelled',
            controlEvidence: { state: 'settled', subject: { id: f.context.invocationId } }
        })
        f.receipt.status = 'blocked'
        f.evidence.read.mockResolvedValue({ ...proof, state: 'paused', desired: 'paused' })
        f.thread.status = 'paused'
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({ status: 'waiting' })
        f.evidence.read.mockResolvedValue({ ...proof, state: 'settled' })
        f.thread.status = 'error'
        f.execution.status = XpertAgentExecutionStatusEnum.ERROR
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({ status: 'failed' })
    })
    it('still delivers cancellation after the message finalized but its actual tools have not ended', async () => {
        const f = fixture()
        f.receipt.executionId = f.execution.id
        f.receipt.phase = 'finalized'
        f.receipt.status = 'consumed'
        f.member.groupId = f.receipt.groupId
        const group = Object.assign(new ChatConversation(), { id: f.receipt.groupId })
        jest.spyOn(f.db.getRepository(ChatConversation), 'findOneByOrFail').mockResolvedValue(group)
        jest.spyOn(f.db.getRepository(ChatConversation), 'increment').mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: []
        })
        jest.spyOn(f.db.getRepository(GroupInteraction), 'update').mockResolvedValue({
            affected: 1,
            raw: [],
            generatedMaps: []
        })
        jest.spyOn(f.db.getRepository(GroupMessageRecipient), 'update').mockImplementation(async () => {
            f.receipt.status = 'canceled'
            return { affected: 1, raw: [], generatedMaps: [] }
        })
        jest.spyOn(f.db, 'transaction').mockImplementation(async (work: unknown) => {
            if (typeof work !== 'function') throw Error('Unexpected isolation level')
            return work({
                findOneOrFail: async (type: unknown) =>
                    type === ChatConversation ? group : type === ChatConversationThread ? f.thread : f.receipt,
                findOneByOrFail: async () => f.source
            } as never)
        })
        const proof = await f.evidence.read(f.execution.id, f.context.scope)
        if (proof.source !== 'platform') throw Error('fixture')
        const current = randomUUID()
        f.evidence.read.mockResolvedValue({
            ...proof,
            executionId: current,
            state: 'terminating',
            desired: 'terminated'
        })
        expect(await f.strategy.cancel(f.handle, f.context)).toMatchObject({ status: 'cancelling' })
        expect(f.commands.execute).toHaveBeenCalledWith(
            new CancelConversationCommand({ threadId: f.member.runtimeThreadId, executionId: current })
        )
        f.evidence.read.mockResolvedValue({ ...proof, executionId: current, state: 'settled', desired: 'terminated' })
        expect(await f.strategy.cancel(f.handle, f.context)).toMatchObject({ status: 'cancelled' })
        expect(f.commands.execute).toHaveBeenCalledTimes(1)
    })

    it('preserves a successful result when cancellation arrives after actual completion', async () => {
        const f = fixture()
        f.receipt.executionId = f.execution.id
        f.receipt.status = 'canceled'
        f.receipt.phase = 'finalized'
        f.execution.status = XpertAgentExecutionStatusEnum.SUCCESS
        const proof = await f.evidence.read(f.execution.id, f.context.scope)
        if (proof.source !== 'platform') throw Error('fixture')
        f.evidence.read.mockResolvedValue({ ...proof, state: 'settled', desired: 'terminated' })
        expect(await f.strategy.inspect(f.handle, f.context)).toMatchObject({
            status: 'succeeded',
            result: { text: '42' }
        })
    })
    it('rejects receipts belonging to another invocation and rechecks access on inspection', async () => {
        const f = fixture()
        f.source.groupCommunication.projectTask.invocationId = randomUUID()
        await expect(f.strategy.inspect(f.handle, f.context)).rejects.toThrow()
        expect(f.targets.resolve).toHaveBeenCalledWith(f.context.scope, f.member.id)
    })
})
