import { ConflictException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { HandoffMessage, ProcessContext } from '@xpert-ai/plugin-sdk'
import { VoiceTaskProcessor } from './voice-task.processor'
import { VoiceSessionService } from './voice-session.service'
import { RealtimeVoiceTask } from './voice.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AgentChatDispatchHandoffProcessor } from '../handoff/plugins/agent-chat/agent-chat-dispatch.processor'
import { ChatConversationThreadService } from '../chat-conversation/conversation-thread.service'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'

jest.mock('./voice-context', () => ({ withVoiceScope: (_scope: unknown, work: () => Promise<unknown>) => work() }))
const id = '11111111-1111-4111-8111-111111111111'
function fixture() {
    const row: RealtimeVoiceTask = Object.assign(new RealtimeVoiceTask(), {
        id,
        tenantId: id,
        organizationId: id,
        sessionId: id,
        callId: 'call',
        scope: { tenantId: id, organizationId: id, userId: id, assistantId: id, conversationId: id, threadId: id },
        status: 'queued' as const,
        action: 'send' as const,
        instruction: 'Do the work',
        executionId: id,
        cancelRequested: false
    })
    const tasks = {
        findOneBy: jest.fn(async () => row),
        findOneByOrFail: jest.fn(async () => row),
        update: jest.fn(async (where: Partial<RealtimeVoiceTask>, change: Partial<RealtimeVoiceTask>) => {
            if (Object.entries(where).some(([key, value]) => row[key] !== value)) return { affected: 0 }
            Object.assign(row, change)
            return { affected: 1 }
        })
    }
    const dispatch = { process: jest.fn(async () => ({ status: 'ok' })) }
    const sessions = { authorize: jest.fn(async () => ({ isDerivedThread: false })) }
    const threads = { claimForRun: jest.fn() }
    const control = { start: jest.fn(), finish: jest.fn() }
    const processor = new VoiceTaskProcessor(
        tasks as unknown as Repository<RealtimeVoiceTask>,
        { findOne: jest.fn(async () => ({ content: 'Done' })) } as unknown as Repository<ChatMessage>,
        { findOneBy: jest.fn(async () => ({ status: 'success' })) } as unknown as Repository<XpertAgentExecution>,
        dispatch as unknown as AgentChatDispatchHandoffProcessor,
        sessions as unknown as VoiceSessionService,
        threads as unknown as ChatConversationThreadService,
        control as unknown as ThreadRunControlService,
        { execute: jest.fn() } as unknown as CommandBus
    )
    const message: HandoffMessage<{ taskId: string }> = {
        id,
        type: 'voice_task_dispatch',
        version: 1,
        tenantId: id,
        sessionKey: id,
        businessKey: id,
        attempt: 1,
        maxAttempts: 1,
        enqueuedAt: Date.now(),
        traceId: id,
        payload: { taskId: id },
        headers: { userId: id, organizationId: id }
    }
    const context: ProcessContext = { runId: id, traceId: id, abortSignal: new AbortController().signal }
    return { row, tasks, dispatch, sessions, threads, control, processor, message, context }
}
describe('durable voice task dispatch', () => {
    it('claims once when duplicate queue deliveries race', async () => {
        const { processor, message, context, dispatch, row } = fixture()
        await Promise.all([processor.process(message, context), processor.process(message, context)])
        expect(dispatch.process).toHaveBeenCalledTimes(1)
        expect(row.status).toBe('completed')
        expect(row.result).toBe('Done')
        expect(dispatch.process).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    options: expect.objectContaining({
                        messageEnvelope: {
                            version: 1,
                            source: { type: 'voice', sessionId: id },
                            presentation: 'runtime',
                            target: { xpertId: id, conversationId: id, threadId: id },
                            correlation: { taskId: id, executionId: id }
                        }
                    })
                })
            }),
            context
        )
    })
    it('keeps the outbox pending while another run owns the conversation', async () => {
        const { processor, message, context, dispatch, row, threads } = fixture()
        threads.claimForRun.mockRejectedValueOnce(new ConflictException())
        await processor.process(message, context)
        expect(row.status).toBe('queued')
        expect(dispatch.process).not.toHaveBeenCalled()
    })
    it('cannot execute under a forged organization and rechecks access after queue wait', async () => {
        const fixture1 = fixture()
        await fixture1.processor.process(
            { ...fixture1.message, headers: { ...fixture1.message.headers, organizationId: 'other' } },
            fixture1.context
        )
        expect(fixture1.dispatch.process).not.toHaveBeenCalled()
        const fixture2 = fixture()
        fixture2.sessions.authorize.mockRejectedValueOnce(new Error('Revoked'))
        await fixture2.processor.process(fixture2.message, fixture2.context)
        expect(fixture2.dispatch.process).not.toHaveBeenCalled()
        expect(fixture2.row.status).toBe('failed')
    })
    it('acknowledges cancellation that races a busy conversation', async () => {
        const { processor, message, context, dispatch, row, threads } = fixture()
        threads.claimForRun.mockImplementationOnce(async () => {
            row.cancelRequested = true
            throw new ConflictException()
        })
        await processor.process(message, context)
        expect(row.status).toBe('canceled')
        expect(dispatch.process).not.toHaveBeenCalled()
    })
    it('skips a queued task whose cancellation has already committed', async () => {
        const { processor, message, context, dispatch, row } = fixture()
        row.cancelRequested = true
        row.status = 'canceled'
        await processor.process(message, context)
        expect(dispatch.process).not.toHaveBeenCalled()
    })
})
