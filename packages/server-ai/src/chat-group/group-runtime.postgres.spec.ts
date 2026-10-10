import { GroupComposerService } from './group-composer.service'
import { GroupInteractionsService } from './group-interactions.service'
import { UserType, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { DataSource, EntitySchema } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { User } from '@xpert-ai/server-core'
import { Test } from '@nestjs/testing'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupMessageRecipient, GroupParticipant, GroupInteraction } from './group.entity'
import { GroupMessagesService } from './group-messages.service'
import { GroupAccessService } from './group-access.service'
import { GroupRuntimeService } from './group-runtime.service'
import { GroupOutboxService } from './group-outbox.service'
import { GroupToolsService } from './group-tools.service'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { QueryBus } from '@nestjs/cqrs'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import type { AgentChatDispatchPayload, HandoffMessage } from '@xpert-ai/plugin-sdk'

// A fresh, disposable PostgreSQL database is required; never point this test at a platform database.
const databaseUrl = process.env.GROUP_TEST_DATABASE_URL
const postgres = databaseUrl ? describe : describe.skip
const testSchema = `group_runtime_${randomUUID().replace(/-/g, '')}`
const base = {
    id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
    tenantId: { type: 'uuid' as const },
    organizationId: { type: 'uuid' as const },
    createdById: { type: 'uuid' as const, nullable: true },
    createdAt: { type: 'timestamptz' as const, createDate: true },
    updatedAt: { type: 'timestamptz' as const, updateDate: true }
}
const uuid = { type: 'uuid' as const, nullable: true }
const text = { type: 'varchar' as const, nullable: true }
const json = { type: 'jsonb' as const, nullable: true }
const schemas = [
    new EntitySchema({
        name: 'User',
        target: User,
        tableName: 'user',
        columns: {
            id: base.id,
            tenantId: base.tenantId,
            type: text
        }
    }),
    new EntitySchema({
        name: 'ChatConversation',
        target: ChatConversation,
        tableName: 'chat_conversation',
        columns: {
            ...base,
            threadId: text,
            title: text,
            purpose: text,
            status: text,
            xpertId: uuid,
            projectId: uuid,
            lastMessageSequence: { type: 'int', default: 0 },
            revision: { type: 'int', default: 0 }
        }
    }),
    new EntitySchema({
        name: 'ChatMessage',
        target: ChatMessage,
        tableName: 'chat_message',
        columns: {
            ...base,
            conversationId: uuid,
            createdInThreadId: uuid,
            executionId: uuid,
            role: text,
            content: json,
            sequence: { type: 'int', nullable: true },
            groupCommunication: json,
            groupPublicationId: text,
            messageEnvelope: json,
            followUpStatus: text,
            followUpMode: text
        },
        indices: [
            { columns: ['conversationId', 'sequence'], unique: true },
            { columns: ['conversationId', 'groupPublicationId'], unique: true }
        ]
    }),
    new EntitySchema({
        name: 'GroupParticipant',
        target: GroupParticipant,
        tableName: 'chat_group_participant',
        columns: {
            ...base,
            groupId: uuid,
            kind: text,
            subjectId: uuid,
            name: text,
            role: { type: 'varchar', default: 'member' },
            active: { type: 'boolean', default: true },
            runtimeConversationId: uuid,
            runtimeThreadId: uuid,
            principalUserId: uuid,
            contextSequence: { type: 'int', default: 0 }
        }
    }),
    new EntitySchema({
        name: 'GroupMessageRecipient',
        target: GroupMessageRecipient,
        tableName: 'chat_message_recipient',
        columns: {
            ...base,
            groupId: uuid,
            messageId: uuid,
            participantId: uuid,
            status: { type: 'varchar', default: 'pending' },
            wake: { type: 'boolean', default: false },
            replyMessageId: uuid,
            executionId: uuid,
            inputMessageId: uuid,
            phase: text,
            control: json,
            error: text,
            attempts: { type: 'int', default: 0 },
            contextSequence: { type: 'int', default: 0 },
            nextAttemptAt: { type: 'timestamptz', default: () => 'now()' },
            startedAt: { type: 'timestamptz', nullable: true },
            leaseToken: uuid,
            leaseUntil: { type: 'timestamptz', nullable: true }
        },
        indices: [{ columns: ['messageId', 'participantId'], unique: true }]
    }),
    new EntitySchema({
        name: 'ChatConversationThread',
        target: ChatConversationThread,
        tableName: 'chat_conversation_thread',
        columns: {
            ...base,
            threadId: text,
            conversationId: uuid,
            status: text,
            runControl: json,
            operation: json,
            metadata: json,
            runtimeContinuationBlockedAt: { type: 'timestamptz', nullable: true }
        }
    }),
    new EntitySchema({
        name: 'GroupInteraction',
        target: GroupInteraction,
        tableName: 'chat_group_interaction',
        columns: {
            ...base,
            groupId: uuid,
            interactionId: text,
            participantId: uuid,
            assignedUserId: uuid,
            claimedBy: uuid,
            status: { type: 'varchar', default: 'pending' },
            recipientId: uuid,
            runId: uuid,
            claimId: uuid,
            payload: json
        },
        indices: [{ columns: ['groupId', 'interactionId'], unique: true }]
    }),
    new EntitySchema({
        name: 'XpertAgentExecution',
        target: XpertAgentExecution,
        tableName: 'xpert_agent_execution',
        columns: { ...base, parentId: uuid, threadId: text, xpertId: uuid, agentKey: text, type: text, status: text }
    })
]

// Database locks are real; authorization, model execution and transport are controlled test doubles.
postgres('group runtime admission and recovery with PostgreSQL', () => {
    let db: DataSource
    let messages: GroupMessagesService
    let runtime: GroupRuntimeService
    let interactions: GroupInteractionsService
    let group: ChatConversation
    let a: GroupParticipant, b: GroupParticipant, c: GroupParticipant, e: GroupParticipant
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const access = { authorize: jest.fn(), assistant: jest.fn(), withRootUser: jest.fn() }
    const control = { start: jest.fn(), recoverExpiredRun: jest.fn() }
    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: databaseUrl,
            entities: schemas,
            schema: testSchema,
            synchronize: false
        }).initialize()
        await db.query(`CREATE SCHEMA "${testSchema}"`)
        await db.synchronize()
        const module = await Test.createTestingModule({
            providers: [
                GroupMessagesService,
                {
                    provide: GroupComposerService,
                    useValue: {
                        member: (groupId, id) => db.getRepository(GroupParticipant).findOneByOrFail({ groupId, id }),
                        validate: jest.fn()
                    }
                },
                GroupRuntimeService,
                { provide: DataSource, useValue: db },
                { provide: GroupAccessService, useValue: access },
                { provide: GroupToolsService, useValue: { create: () => undefined } },
                { provide: ThreadRunControlService, useValue: control },
                { provide: QueryBus, useValue: {} },
                GroupInteractionsService,
                { provide: GroupOutboxService, useValue: { flush: jest.fn() } }
            ]
        }).compile()
        messages = module.get(GroupMessagesService)
        runtime = module.get(GroupRuntimeService)
        interactions = module.get(GroupInteractionsService)
    })
    afterAll(async () => {
        if (db) {
            await db.query(`DROP SCHEMA "${testSchema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        for (const table of [
            '"user"',
            'chat_group_interaction',
            'chat_message_recipient',
            'chat_message',
            'chat_group_participant',
            'chat_conversation_thread',
            'xpert_agent_execution',
            'chat_conversation'
        ])
            await db.query(`DELETE FROM "${testSchema}".${table}`)
        jest.clearAllMocks()
        group = await db.getRepository(ChatConversation).save({
            ...scope,
            threadId: randomUUID(),
            purpose: 'group',
            title: 'D',
            revision: 0,
            lastMessageSequence: 0
        })
        const participant = async (kind: 'user' | 'assistant', name: string) => {
            const member = await db.getRepository(GroupParticipant).save({
                ...scope,
                groupId: group.id,
                kind,
                subjectId: randomUUID(),
                name,
                runtimeThreadId: kind === 'assistant' ? randomUUID() : undefined,
                runtimeConversationId: kind === 'assistant' ? randomUUID() : undefined,
                principalUserId: kind === 'assistant' ? randomUUID() : undefined
            })
            if (kind === 'user')
                await db
                    .getRepository(User)
                    .save({ id: member.subjectId, tenantId: scope.tenantId, type: UserType.USER })
            if (kind === 'assistant') {
                await db.getRepository(ChatConversation).save({
                    ...scope,
                    id: member.runtimeConversationId,
                    threadId: member.runtimeThreadId,
                    purpose: 'group_assistant_runtime',
                    xpertId: member.subjectId,
                    status: 'idle'
                })
                await db.getRepository(ChatConversationThread).save({
                    ...scope,
                    threadId: member.runtimeThreadId,
                    conversationId: member.runtimeConversationId,
                    status: 'idle'
                })
            }
            return member
        }
        a = await participant('user', 'A')
        b = await participant('user', 'B')
        c = await participant('assistant', 'C')
        e = await participant('assistant', 'E')
        group.xpertId = c.subjectId
        await db.getRepository(ChatConversation).save(group)
        access.authorize.mockResolvedValue({ group, actor: a, scope })
        access.assistant.mockResolvedValue({})
        access.withRootUser.mockImplementation((_group, _userId, task) => task())
    })
    const request = (recipientIds: string[], text = 'hello') => ({
        intent: 'request' as const,
        recipientIds,
        text,
        clientMessageId: randomUUID()
    })
    const job = (receipt: GroupMessageRecipient, queue = 'handoff'): HandoffMessage<AgentChatDispatchPayload> => ({
        id: receipt.id,
        type: 'agent.chat_dispatch.v1',
        version: 1,
        tenantId: scope.tenantId,
        sessionKey: receipt.participantId,
        businessKey: group.id,
        attempt: 1,
        maxAttempts: 5,
        enqueuedAt: Date.now(),
        traceId: receipt.messageId,
        payload: {
            request: { action: 'send', message: { input: {} } },
            options: { groupDeliveryId: receipt.id },
            callback: { messageType: 'noop' }
        },
        headers: { organizationId: scope.organizationId, handoffQueue: queue }
    })
    it('persists Composer choices, includes them in idempotency, and forwards them into the existing runtime', async () => {
        const projectId = randomUUID()
        const composer = {
            participantId: c.id,
            projectId,
            files: [{ filePath: 'notes.md', workspacePath: 'notes.md', purpose: 'workspace' as const }],
            runtimeResources: { revision: 0, resources: [] }
        }
        const input = { ...request([c.id]), composer }
        const published = await messages.send(group.id, input)
        expect(published.communication.composer).toEqual(composer)
        expect((await messages.send(group.id, input)).id).toBe(published.id)
        await expect(
            messages.send(group.id, { ...input, composer: { ...composer, projectId: randomUUID() } })
        ).rejects.toMatchObject({ status: 409 })
        const receipt = await db
            .getRepository(GroupMessageRecipient)
            .findOneByOrFail({ messageId: published.id, participantId: c.id })
        const payload = await runtime.prepare(job(receipt))
        expect(payload.request).toMatchObject({
            action: 'send',
            projectId,
            message: { input: { files: composer.files, runtimeResources: composer.runtimeResources } }
        })
        const another = await messages.send(group.id, {
            ...request([c.id]),
            composer: { ...composer, projectId: randomUUID() }
        })
        const next = await db
            .getRepository(GroupMessageRecipient)
            .findOneByOrFail({ messageId: another.id, participantId: c.id })
        expect(await runtime.prepare(job(next, 'realtime'))).toBeNull()
        expect((await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: next.id })).error).toBe(
            'composer_project_changed'
        )
    })
    it('admits one root writer and independently admits E; additional C input becomes steer', async () => {
        const first = await messages.send(group.id, request([c.id, e.id]))
        const receipts = await db.getRepository(GroupMessageRecipient).findBy({ messageId: first.id })
        const cr = receipts.find((receipt) => receipt.participantId === c.id)
        const prepared = await Promise.all([runtime.prepare(job(cr)), runtime.prepare(job(cr))])
        expect(prepared.filter(Boolean)).toHaveLength(1)
        expect(
            (await runtime.prepare(job(receipts.find((receipt) => receipt.participantId === e.id)))).request.action
        ).toBe('send')
        const second = await messages.publish(group, b, request([c.id], 'Budget 50'))
        const steer = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: second.id })
        expect(await runtime.prepare(job(steer))).toBeNull()
        const steered = await runtime.prepare(job(steer, 'realtime'))
        expect(steered.request.action).toBe('follow_up')
        expect(steered.request).toMatchObject({
            mode: 'steer',
            message: { input: { input: expect.stringContaining(`"senderId":"${b.id}"`) } }
        })
        const execution = await db.getRepository(XpertAgentExecution).findOneByOrFail({ threadId: c.runtimeThreadId })
        expect(execution.createdById).toBe(a.subjectId)
        expect(await db.getRepository(XpertAgentExecution).countBy({ threadId: c.runtimeThreadId })).toBe(1)
    })
    it('attributes each new run to its human input while keeping the first question as conversation creator', async () => {
        // A invited the Assistant; B is the first person to ask it a question.
        await db.getRepository(ChatConversation).update({ id: c.runtimeConversationId }, { createdById: a.subjectId })
        for (const author of [b, a]) {
            const source = await messages.publish(group, author, request([c.id]))
            const receipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: source.id })
            await runtime.prepare(job(receipt))
            const claimed = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: receipt.id })
            const execution = await db.getRepository(XpertAgentExecution).findOneByOrFail({ id: claimed.executionId })
            expect(execution.createdById).toBe(author.subjectId)
            expect(
                (await db.getRepository(ChatConversation).findOneByOrFail({ id: c.runtimeConversationId })).createdById
            ).toBe(b.subjectId)
            expect(
                (await db.getRepository(ChatConversationThread).findOneByOrFail({ threadId: c.runtimeThreadId }))
                    .createdById
            ).toBe(b.subjectId)
            await db
                .getRepository(ChatConversationThread)
                .update({ threadId: c.runtimeThreadId }, { status: 'idle', runControl: null })
        }
    })
    it('does not restart an old request after a stop, but permits a fresh human request', async () => {
        const old = await messages.send(group.id, request([c.id]))
        const barrier = new Date(Date.now() + 50)
        await db
            .getRepository(ChatConversationThread)
            .update({ threadId: c.runtimeThreadId }, { status: 'interrupted', runtimeContinuationBlockedAt: barrier })
        const oldReceipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: old.id })
        expect(await runtime.prepare(job(oldReceipt))).toBeNull()
        expect((await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: oldReceipt.id })).status).toBe(
            'blocked'
        )
        const fresh = await messages.send(group.id, request([c.id]))
        await db.getRepository(ChatMessage).update({ id: fresh.id }, { createdAt: new Date(barrier.getTime() + 50) })
        expect(
            (
                await runtime.prepare(
                    job(await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: fresh.id }))
                )
            ).request.action
        ).toBe('send')
    })
    it('rechecks Assistant access on a human reply and rejects removed root authors at admission', async () => {
        const human = await messages.send(group.id, request([c.id]))
        const question = await messages.publish(group, c, request([b.id]), human.communication)
        access.assistant.mockRejectedValueOnce(new Error('access revoked'))
        await expect(
            messages.publish(group, b, {
                intent: 'reply',
                replyToMessageId: question.id,
                text: 'yes',
                clientMessageId: randomUUID()
            })
        ).rejects.toThrow('access revoked')
        await db.getRepository(GroupParticipant).update({ id: a.id }, { active: false })
        const row = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: human.id })
        expect(await runtime.prepare(job(row))).toBeNull()
        expect(control.start).not.toHaveBeenCalled()
    })
    it('fails closed after a worker disappears between reservation and lease creation', async () => {
        const human = await messages.send(group.id, request([c.id]))
        const receipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: human.id })
        await runtime.prepare(job(receipt))
        await db
            .getRepository(GroupMessageRecipient)
            .update({ id: receipt.id }, { startedAt: new Date(Date.now() - 180000) })
        await runtime.finish(receipt.id)
        const finished = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: receipt.id })
        expect(finished.status).toBe('blocked')
        expect(await runtime.prepare(job(finished))).toBeNull()
        expect(control.start).toHaveBeenCalledTimes(1)
    })
    it('keeps A request open while C waits for E, then correlates the final C answer to A', async () => {
        const human = await messages.send(group.id, request([c.id]))
        const initialReceipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: human.id })
        const initial = await runtime.prepare(job(initialReceipt))
        const question = await messages.publish(
            group,
            c,
            request([e.id], 'Please research'),
            human.communication,
            undefined,
            false,
            human.id
        )
        const finishRun = async (executionId: string, text: string, receiptId: string) => {
            await db
                .getRepository(ChatMessage)
                .save({ ...scope, conversationId: c.runtimeConversationId, executionId, role: 'ai', content: text })
            await db
                .getRepository(XpertAgentExecution)
                .update({ id: executionId }, { status: XpertAgentExecutionStatusEnum.SUCCESS })
            await db
                .getRepository(ChatConversationThread)
                .update({ threadId: c.runtimeThreadId }, { status: 'idle', runControl: null })
            await runtime.finish(receiptId)
        }
        await finishRun(initial.options.execution.id, 'Waiting for E', initialReceipt.id)
        expect(
            (await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: initialReceipt.id })).replyMessageId
        ).toBeNull()
        const answer = await messages.publish(group, e, {
            intent: 'reply',
            replyToMessageId: question.id,
            text: 'Research done',
            clientMessageId: randomUUID()
        })
        const continuationReceipt = await db
            .getRepository(GroupMessageRecipient)
            .findOneByOrFail({ messageId: answer.id })
        const continuation = await runtime.prepare(job(continuationReceipt))
        await finishRun(continuation.options.execution.id, 'Final answer for A', continuationReceipt.id)
        const original = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: initialReceipt.id })
        const final = await db.getRepository(ChatMessage).findOneByOrFail({ id: original.replyMessageId })
        expect(final.content).toBe('Final answer for A')
        expect(final.groupCommunication).toMatchObject({
            intent: 'reply',
            senderId: c.id,
            recipientIds: [a.id],
            replyToMessageId: human.id
        })
    })
    it('keeps the originating human on Assistant requests and replies, and the actual human on a human reply', async () => {
        const human = await messages.publish(group, a, request([c.id]))
        const question = await messages.publish(group, c, request([e.id, b.id]), human.communication)
        const delivery = await db
            .getRepository(GroupMessageRecipient)
            .findOneByOrFail({ messageId: question.id, participantId: e.id })
        await runtime.prepare(job(delivery))
        expect(
            (await db.getRepository(XpertAgentExecution).findOneByOrFail({ threadId: e.runtimeThreadId })).createdById
        ).toBe(a.subjectId)
        for (const [author, expectedUserId] of [
            [e, a.subjectId],
            [b, b.subjectId]
        ] as const) {
            const reply = await messages.publish(group, author, {
                intent: 'reply',
                replyToMessageId: question.id,
                text: 'yes',
                clientMessageId: randomUUID()
            })
            expect(reply.communication.rootUserId).toBe(a.subjectId)
            const receipt = await db
                .getRepository(GroupMessageRecipient)
                .findOneByOrFail({ messageId: reply.id, participantId: c.id })
            await runtime.prepare(job(receipt))
            const claimed = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: receipt.id })
            expect(
                (await db.getRepository(XpertAgentExecution).findOneByOrFail({ id: claimed.executionId })).createdById
            ).toBe(expectedUserId)
            await db
                .getRepository(ChatConversationThread)
                .update({ threadId: c.runtimeThreadId }, { status: 'idle', runControl: null })
        }
    })
    it('allows one assigned browser to claim an interaction and rejects other users and duplicate tabs', async () => {
        const human = await messages.send(group.id, request([c.id]))
        const receipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: human.id })
        const runId = randomUUID()
        await db
            .getRepository(GroupMessageRecipient)
            .update({ id: receipt.id }, { status: 'blocked', executionId: runId })
        await db
            .getRepository(ChatConversationThread)
            .update({ threadId: c.runtimeThreadId }, { status: 'interrupted', operation: { tasks: [] } })
        const interaction = await db.getRepository(GroupInteraction).save({
            ...scope,
            groupId: group.id,
            interactionId: runId,
            participantId: c.id,
            assignedUserId: a.subjectId,
            runId,
            recipientId: receipt.id,
            payload: [
                {
                    kind: 'client_tool',
                    request: { clientToolCalls: [{ id: 'tool-1', name: 'browser_test', args: {} }] }
                }
            ]
        })
        access.authorize.mockResolvedValueOnce({ group, actor: b, scope })
        await expect(interactions.claim(group.id, interaction.id, randomUUID())).rejects.toMatchObject({ status: 403 })
        const ids = [randomUUID(), randomUUID()]
        const claims = await Promise.allSettled(ids.map((id) => interactions.claim(group.id, interaction.id, id)))
        expect(claims.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        const winner = claims.findIndex((r) => r.status === 'fulfilled')
        const response = {
            claimId: ids[winner],
            toolMessages: [{ tool_call_id: 'tool-1', name: 'browser_test', content: 'ok' }]
        }
        await expect(
            interactions.respond(group.id, interaction.id, {
                ...response,
                toolMessages: [{ tool_call_id: 'spoof', content: 'ok' }]
            })
        ).rejects.toMatchObject({ status: 400 })
        await Promise.all([
            interactions.respond(group.id, interaction.id, response),
            interactions.respond(group.id, interaction.id, response)
        ])
        const accepted = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: receipt.id })
        expect(accepted.status).toBe('pending')
        expect(accepted.control.actorId).toBe(a.subjectId)
        expect(await db.getRepository(GroupMessageRecipient).countBy({ id: receipt.id })).toBe(1)
    })
    it('rejects queue jobs without complete receipt scope before admission', async () => {
        const sent = await messages.send(group.id, request([c.id]))
        const receipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: sent.id })
        for (const invalid of [
            { ...job(receipt), headers: { handoffQueue: 'handoff' } },
            { ...job(receipt), tenantId: '' },
            { ...job(receipt), payload: { ...job(receipt).payload, options: {} } }
        ])
            expect(await runtime.prepare(invalid)).toBeNull()
        expect(await db.getRepository(XpertAgentExecution).count()).toBe(0)
        expect((await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: receipt.id })).status).toBe(
            'pending'
        )
    })
    it('blocks new delivery to a paused runtime without creating an execution', async () => {
        const sent = await messages.send(group.id, request([c.id]))
        const receipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: sent.id })
        await db.getRepository(ChatConversationThread).update({ threadId: c.runtimeThreadId }, { status: 'paused' })
        expect(await runtime.prepare(job(receipt))).toBeNull()
        expect((await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: receipt.id })).error).toBe(
            'runtime_blocked'
        )
        expect(await db.getRepository(XpertAgentExecution).count()).toBe(0)
    })
    it.each(['consumed', 'unconsumed', 'failed'] as const)(
        'reconciles a %s steer without replaying the active run',
        async (state) => {
            const first = await messages.send(group.id, request([c.id]))
            const firstReceipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: first.id })
            const active = await runtime.prepare(job(firstReceipt))
            const followUp = await messages.publish(group, b, request([c.id], 'Follow-up'))
            const receipt = await db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: followUp.id })
            await runtime.prepare(job(receipt, 'realtime'))
            if (state === 'consumed') {
                await db.getRepository(ChatMessage).save({
                    ...scope,
                    conversationId: c.runtimeConversationId,
                    role: 'human',
                    content: 'Follow-up',
                    followUpStatus: 'consumed',
                    messageEnvelope: {
                        version: 1,
                        source: { type: 'user', userId: b.subjectId },
                        presentation: 'runtime',
                        correlation: { messageId: receipt.id }
                    }
                })
            } else if (state === 'unconsumed') {
                await db
                    .getRepository(ChatConversationThread)
                    .update({ threadId: c.runtimeThreadId }, { status: 'idle', runControl: null })
            }
            await runtime.finish(receipt.id, state === 'failed', true)
            expect((await db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: receipt.id })).status).toBe(
                state === 'consumed' ? 'consumed' : 'pending'
            )
            expect(await db.getRepository(XpertAgentExecution).count()).toBe(1)
            expect(
                (await db.getRepository(XpertAgentExecution).findOneByOrFail({ id: active.options.execution.id }))
                    .createdById
            ).toBe(a.subjectId)
        }
    )
})
