import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import type { AgentChatDispatchPayload } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { GroupMessageRecipient, GroupParticipant } from '../group.entity'
import { GroupMessagesService } from '../group-messages.service'
import { GroupRuntimeService } from '../group-runtime.service'
import { GroupToolsService } from '../group-tools.service'

type Fixture = {
    db: DataSource
    messages: GroupMessagesService
    runtime: GroupRuntimeService
    tools: GroupToolsService
    group: ChatConversation
    a: GroupParticipant
    c: GroupParticipant
    e: GroupParticipant
    prepare: (receipt: GroupMessageRecipient) => Promise<AgentChatDispatchPayload | null>
}

/** Real transactions exercise publication, completion claims, tool replay and end-of-run projection together. */
export function groupReplyStageCases(fixture: () => Fixture) {
    const request = (recipientIds: string[]) => ({
        intent: 'request' as const,
        recipientIds,
        text: 'Analyze inventory',
        clientMessageId: randomUUID()
    })

    async function start(multipleRecipients = false) {
        const f = fixture()
        const question = await f.messages.send(f.group.id, request(multipleRecipients ? [f.c.id, f.e.id] : [f.c.id]))
        const repo = f.db.getRepository(GroupMessageRecipient)
        const delivery = await repo.findOneByOrFail({ messageId: question.id, participantId: f.c.id })
        await f.prepare(delivery)
        const receipt = await repo.findOneByOrFail({ id: delivery.id })
        const tool = f.tools.create(receipt, f.c)
        const call = (args: object, id: string = randomUUID()) =>
            tool.invoke({ type: 'tool_call', name: tool.name, id, args })
        const reply = (
            replyStage: 'progress' | 'final',
            text = 'Inventory is concentrated',
            id: string = randomUUID()
        ) => call({ intent: 'reply', replyStage, replyToMessageId: question.id, text }, id)
        const scope = { tenantId: f.group.tenantId, organizationId: f.group.organizationId }
        const completion = () => repo.findOneByOrFail({ id: receipt.id })
        const publicMessages = () =>
            f.db.getRepository(ChatMessage).find({
                where: { conversationId: f.group.id },
                order: { sequence: 'ASC' }
            })
        const finish = async (...texts: string[]) => {
            for (const [index, content] of texts.entries()) {
                await f.db.getRepository(ChatMessage).save({
                    ...scope,
                    conversationId: f.c.runtimeConversationId,
                    executionId: receipt.executionId,
                    role: 'ai',
                    content,
                    createdAt: new Date(Date.now() + index * 1000)
                })
            }
            await f.db
                .getRepository(XpertAgentExecution)
                .update({ id: receipt.executionId }, { status: XpertAgentExecutionStatusEnum.SUCCESS })
            await f.db
                .getRepository(ChatConversationThread)
                .update({ threadId: f.c.runtimeThreadId }, { status: 'idle', runControl: null })
            await f.runtime.finish(receipt.id)
        }
        return { ...f, question, receipt, call, reply, completion, publicMessages, finish }
    }

    it('keeps multiple partial answers open, then publishes one automatic final answer', async () => {
        const f = await start()
        await f.reply('progress', 'Preliminary concentration', 'partial-1')
        await f.reply('progress', 'Checking factories', 'partial-2')
        expect((await f.completion()).replyMessageId).toBeNull()
        await f.finish('Final inventory analysis')
        const messages = await f.publicMessages()
        expect(messages.map((m) => m.content)).toEqual([
            'Analyze inventory',
            'Preliminary concentration',
            'Checking factories',
            'Final inventory analysis'
        ])
        expect(messages.slice(1).map((m) => m.groupCommunication.replyStage)).toEqual(['progress', 'progress', 'final'])
        expect((await f.completion()).replyMessageId).toBe(messages[3].id)
    })

    it.each([false, true])(
        'suppresses the final projection after a committed tool final (legacy=%s)',
        async (legacy) => {
            const f = await start()
            await f.reply('progress', 'Preliminary concentration')
            await f.reply('final', 'Final inventory analysis')
            const completion = await f.completion()
            expect(completion.replyMessageId).toBeTruthy()
            if (legacy) {
                const message = await f.db.getRepository(ChatMessage).findOneByOrFail({ id: completion.replyMessageId })
                delete message.groupCommunication.replyStage
                await f.db.getRepository(ChatMessage).save(message)
            }
            // Different wording must still be suppressed; this is protocol completion, not text deduplication.
            await f.finish('Earlier visible progress', 'Restated final inventory analysis')
            await f.runtime.finish(f.receipt.id)
            const messages = await f.publicMessages()
            expect(messages.map((m) => m.content)).toEqual([
                'Analyze inventory',
                'Preliminary concentration',
                'Final inventory analysis',
                'Earlier visible progress'
            ])
            expect((await f.completion()).replyMessageId).toBe(completion.replyMessageId)
            expect((await f.completion()).status).toBe('consumed')
        }
    )

    it('does not suppress automatic completion after an ordinary tool message', async () => {
        const f = await start()
        await f.call({ intent: 'message', text: 'Reading inventory' })
        await f.finish('Final inventory analysis')
        const messages = await f.publicMessages()
        expect(messages).toHaveLength(3)
        expect(messages[1].groupCommunication.intent).toBe('message')
        expect(messages[2].groupCommunication).toMatchObject({ intent: 'reply', replyStage: 'final' })
        expect((await f.completion()).replyMessageId).toBe(messages[2].id)
    })

    it('leaves help requests and their partial replies open without prematurely waking the caller', async () => {
        const f = await start()
        await f.call({ intent: 'request', recipientIds: [f.e.id], text: 'Investigate the factories' })
        const question = (await f.publicMessages())[1]
        const partial = await f.messages.publish(f.group, f.e, {
            intent: 'reply',
            replyStage: 'progress',
            replyToMessageId: question.id,
            text: 'One factory checked',
            clientMessageId: randomUUID()
        })
        const partialDelivery = await f.db
            .getRepository(GroupMessageRecipient)
            .findOneByOrFail({ messageId: partial.id })
        expect(partialDelivery).toMatchObject({ participantId: f.c.id, wake: false, status: 'consumed' })
        await f.finish('Waiting for factory analysis')
        expect((await f.completion()).replyMessageId).toBeNull()
        expect((await f.publicMessages()).at(-1).groupCommunication.intent).toBe('message')
        const final = await f.messages.publish(f.group, f.e, {
            intent: 'reply',
            replyStage: 'final',
            replyToMessageId: question.id,
            text: 'Factories checked',
            clientMessageId: randomUUID()
        })
        const continuationReceipt = await f.db
            .getRepository(GroupMessageRecipient)
            .findOneByOrFail({ messageId: final.id })
        expect(continuationReceipt).toMatchObject({
            participantId: f.c.id,
            wake: true,
            status: 'pending'
        })
        const continuation = await f.prepare(continuationReceipt)
        expect(JSON.stringify(continuation.request)).toContain('One factory checked')
    })

    it('does not suppress the current answer after a final tool reply to a different request', async () => {
        const f = await start()
        const other = await f.messages.send(f.group.id, request([f.c.id]))
        await f.call({ intent: 'reply', replyStage: 'final', replyToMessageId: other.id, text: 'Other answer' })
        await f.finish('Current answer')
        const messages = await f.publicMessages()
        expect(messages.at(-1).groupCommunication.replyToMessageId).toBe(f.question.id)
        expect((await f.completion()).replyMessageId).toBe(messages.at(-1).id)
    })

    it.each(['pending', 'unconsumed-steer', 'consumed-steer'] as const)(
        'waits for the caller to consume both child answers before automatic completion (%s)',
        async (secondState) => {
            const f = await start()
            const repo = f.db.getRepository(GroupMessageRecipient)
            for (const text of ['Check inventory', 'Check receivables'])
                await f.call({ intent: 'request', recipientIds: [f.e.id], text })
            const questions = (await f.publicMessages()).slice(1)
            await f.finish('Waiting for both analyses')
            const answers = []
            for (const question of questions)
                answers.push(
                    await f.messages.publish(f.group, f.e, {
                        intent: 'reply',
                        replyStage: 'final',
                        replyToMessageId: question.id,
                        text: `Completed: ${question.content}`,
                        clientMessageId: randomUUID()
                    })
                )
            // Both replies exist, but only the first has entered the caller's next run.
            const first = await repo.findOneByOrFail({ messageId: answers[0].id })
            const second = await repo.findOneByOrFail({ messageId: answers[1].id })
            const run = await f.prepare(first)
            const executionId = run.options.execution.id
            if (secondState !== 'pending') {
                await repo.update(second.id, { status: 'steering', executionId })
                await f.db.getRepository(ChatMessage).save({
                    tenantId: f.group.tenantId,
                    organizationId: f.group.organizationId,
                    conversationId: f.c.runtimeConversationId,
                    role: 'human',
                    content: 'Second answer delivered as a steer',
                    followUpStatus: secondState === 'consumed-steer' ? 'consumed' : 'pending',
                    messageEnvelope: {
                        version: 1,
                        source: { type: 'user', userId: f.a.subjectId },
                        presentation: 'runtime',
                        correlation: { messageId: second.id }
                    }
                })
            }
            const finishContinuation = async (id: string, receiptId: string, content: string) => {
                await f.db.getRepository(ChatMessage).save({
                    tenantId: f.group.tenantId,
                    organizationId: f.group.organizationId,
                    conversationId: f.c.runtimeConversationId,
                    executionId: id,
                    role: 'ai',
                    content
                })
                await f.db.getRepository(XpertAgentExecution).update(id, {
                    status: XpertAgentExecutionStatusEnum.SUCCESS
                })
                await f.db.getRepository(ChatConversationThread).update(
                    { threadId: f.c.runtimeThreadId },
                    {
                        status: 'idle',
                        runControl: null
                    }
                )
                await f.runtime.finish(receiptId)
            }
            await finishContinuation(
                executionId,
                first.id,
                secondState === 'consumed-steer' ? 'Both results analyzed' : 'Waiting for the second result'
            )
            if (secondState === 'consumed-steer') {
                expect((await f.completion()).replyMessageId).toBeTruthy()
                expect((await f.publicMessages()).at(-1).groupCommunication).toMatchObject({
                    intent: 'reply',
                    replyStage: 'final',
                    replyToMessageId: f.question.id
                })
                return
            }
            expect((await f.completion()).replyMessageId).toBeNull()
            expect((await f.publicMessages()).at(-1).groupCommunication.intent).toBe('message')
            if (secondState === 'unconsumed-steer') await f.runtime.finish(second.id)
            const continuation = await f.prepare(await repo.findOneByOrFail({ id: second.id }))
            const tool = f.tools.create(await repo.findOneByOrFail({ id: second.id }), f.c)
            await tool.invoke({
                type: 'tool_call',
                name: tool.name,
                id: randomUUID(),
                args: {
                    intent: 'reply',
                    replyStage: 'final',
                    replyToMessageId: f.question.id,
                    text: 'Both results analyzed'
                }
            })
            await finishContinuation(continuation.options.execution.id, second.id, 'Restated summary')
            const finals = (await f.publicMessages()).filter(
                (message) =>
                    message.groupCommunication.intent === 'reply' &&
                    message.groupCommunication.replyStage === 'final' &&
                    message.groupCommunication.replyToMessageId === f.question.id
            )
            expect(finals).toHaveLength(1)
            expect(finals[0].content).toBe('Both results analyzed')
            expect((await f.publicMessages()).some((message) => message.content === 'Restated summary')).toBe(false)
        }
    )

    it('does not suppress another recipient’s answer to the same request', async () => {
        const f = await start(true)
        const repo = f.db.getRepository(GroupMessageRecipient)
        let receipt = await repo.findOneByOrFail({ messageId: f.question.id, participantId: f.e.id })
        await f.prepare(receipt)
        receipt = await repo.findOneByOrFail({ id: receipt.id })
        const tool = f.tools.create(receipt, f.e)
        await tool.invoke({
            type: 'tool_call',
            name: tool.name,
            id: 'other-final',
            args: {
                intent: 'reply',
                replyStage: 'final',
                replyToMessageId: f.question.id,
                text: 'E answer'
            }
        })
        await f.finish('C answer')
        expect((await f.publicMessages()).slice(1).map((m) => m.content)).toEqual(['E answer', 'C answer'])
    })

    it('does not treat a rejected final tool call as successful completion', async () => {
        const f = await start()
        await expect(
            f.call({ intent: 'reply', replyStage: 'final', replyToMessageId: randomUUID(), text: 'Rejected' })
        ).rejects.toThrow()
        expect((await f.completion()).replyMessageId).toBeNull()
        await f.finish('Actual answer')
        expect((await f.publicMessages()).map((m) => m.content)).toEqual(['Analyze inventory', 'Actual answer'])
    })

    it('replays stages idempotently, forbids changing a replayed stage and serializes competing finals', async () => {
        const f = await start()
        await f.reply('progress', 'Partial', 'same-call')
        await f.reply('progress', 'Partial', 'same-call')
        await expect(f.reply('final', 'Partial', 'same-call')).rejects.toMatchObject({ status: 409 })
        expect((await f.completion()).replyMessageId).toBeNull()
        const results = await Promise.allSettled([
            f.reply('final', 'Final', 'final-1'),
            f.reply('final', 'Final', 'final-2')
        ])
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
        const winner = results[0].status === 'fulfilled' ? 'final-1' : 'final-2'
        await f.reply('final', 'Final', winner)
        await expect(f.reply('progress', 'Too late')).rejects.toMatchObject({ status: 409 })
        await f.finish('Final')
        expect((await f.publicMessages()).map((m) => m.content)).toEqual(['Analyze inventory', 'Partial', 'Final'])
    })
}
