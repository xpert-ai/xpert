import { ConflictException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AgentChatDispatchPayload,
    HandoffMessage,
    HandoffProcessorStrategy,
    IHandoffProcessor,
    ProcessContext,
    ProcessResult
} from '@xpert-ai/plugin-sdk'
import { TChatRequest, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { z } from 'zod'
import { AgentChatDispatchHandoffProcessor } from '../handoff/plugins/agent-chat/agent-chat-dispatch.processor'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatConversationThreadService } from '../chat-conversation/conversation-thread.service'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { VoiceSessionService } from './voice-session.service'
import { RealtimeVoiceTask } from './voice.entity'
import { VOICE_TASK_DISPATCH } from './voice-task.service'
import { voiceScopeSchema, VoiceScope } from './voice.schema'
import { withVoiceScope } from './voice-context'
import { voiceTaskAnswer } from './voice-task-result'

@Injectable()
@HandoffProcessorStrategy(VOICE_TASK_DISPATCH, {
    types: [VOICE_TASK_DISPATCH],
    policy: { lane: 'main', timeoutMs: 3600000 }
})
export class VoiceTaskProcessor implements IHandoffProcessor<{ taskId: string }> {
    constructor(
        @InjectRepository(RealtimeVoiceTask) private readonly tasks: Repository<RealtimeVoiceTask>,
        @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
        @InjectRepository(XpertAgentExecution) private readonly executions: Repository<XpertAgentExecution>,
        private readonly dispatch: AgentChatDispatchHandoffProcessor,
        private readonly sessions: VoiceSessionService,
        private readonly threads: ChatConversationThreadService,
        private readonly control: ThreadRunControlService,
        private readonly commands: CommandBus
    ) {}

    async process(message: HandoffMessage<{ taskId: string }>, ctx: ProcessContext): Promise<ProcessResult> {
        const { taskId } = z.object({ taskId: z.string().uuid() }).strict().parse(message.payload)
        const task = await this.tasks.findOneBy({ id: taskId, tenantId: message.tenantId })
        if (!task) return { status: 'dead', reason: 'voice_task_missing' }
        const scope = voiceScopeSchema.parse(task.scope) as VoiceScope
        if (scope.userId !== message.headers?.userId || scope.organizationId !== message.headers?.organizationId)
            return { status: 'dead', reason: 'voice_task_scope' }
        const claimed = await this.tasks.update(
            { id: task.id, status: 'queued', cancelRequested: false },
            { status: 'running' }
        )
        if (claimed.affected !== 1) return { status: 'ok' }
        let ownsThread = false
        try {
            await withVoiceScope(scope, async () => {
                // A finished call does not revoke an accepted task; current Assistant/thread access still applies.
                const authorized = await this.sessions.authorize(scope.threadId)
                if (task.action === 'send') {
                    try {
                        await this.threads.claimForRun(scope.threadId)
                    } catch (error) {
                        if (error instanceof ConflictException) {
                            await this.tasks.update(
                                { id: task.id, status: 'running', cancelRequested: false },
                                { status: 'queued' }
                            )
                            // Cancellation may race the thread claim. No worker owns this task now.
                            await this.tasks.update(
                                { id: task.id, status: 'running', cancelRequested: true },
                                { status: 'canceled' }
                            )
                            return
                        }
                        throw error
                    }
                    ownsThread = true
                    await this.commands.execute(
                        new XpertAgentExecutionUpsertCommand({
                            id: task.executionId,
                            threadId: scope.threadId,
                            status: XpertAgentExecutionStatusEnum.RUNNING
                        })
                    )
                    await this.control.start(scope.threadId, task.executionId)
                }
                const current = await this.tasks.findOneByOrFail({ id: task.id })
                if (ctx.abortSignal.aborted || current.cancelRequested) {
                    await this.tasks.update(
                        { id: task.id },
                        { status: current.cancelRequested ? 'canceled' : 'failed' }
                    )
                    return
                }
                const input = { clientMessageId: task.id, input: { input: task.instruction } }
                const request: TChatRequest =
                    task.action === 'steer'
                        ? {
                              action: 'follow_up',
                              conversationId: scope.conversationId,
                              mode: 'steer',
                              target: { executionId: task.targetExecutionId },
                              message: input
                          }
                        : { action: 'send', conversationId: scope.conversationId, message: input }
                const payload: AgentChatDispatchPayload = {
                    request,
                    options: {
                        xpertId: scope.assistantId,
                        threadId: scope.threadId,
                        isDerivedThread: authorized.isDerivedThread,
                        isDraft: false,
                        messageEnvelope: {
                            version: 1,
                            source: { type: 'voice', sessionId: task.sessionId },
                            presentation: 'runtime',
                            target: {
                                xpertId: scope.assistantId,
                                conversationId: scope.conversationId,
                                threadId: scope.threadId
                            },
                            correlation: { taskId: task.id, executionId: task.executionId }
                        },
                        execution: { id: task.executionId },
                        streamPersistence: {
                            transport: 'redis-stream',
                            threadId: scope.threadId,
                            runId: task.executionId
                        }
                    },
                    callback: { transport: 'redis-pubsub' }
                }
                const result = await this.dispatch.process({ ...message, payload }, ctx)
                const execution = await this.executions.findOneBy({ id: task.executionId, tenantId: scope.tenantId })
                const answer = await this.messages.findOne({
                    where: {
                        executionId: task.executionId,
                        role: 'ai',
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId
                    },
                    order: { createdAt: 'DESC' }
                })
                const completed =
                    result.status === 'ok' &&
                    (task.action === 'steer' || execution?.status === XpertAgentExecutionStatusEnum.SUCCESS)
                await this.tasks.update(
                    { id: task.id, status: 'running' },
                    {
                        status: ctx.abortSignal.aborted
                            ? (await this.tasks.findOneByOrFail({ id: task.id })).cancelRequested
                                ? 'canceled'
                                : 'unknown'
                            : completed
                              ? 'completed'
                              : execution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED
                                ? 'waiting'
                                : 'failed',
                        result: voiceTaskAnswer(answer?.content)
                    }
                )
            })
        } catch {
            await this.tasks.update(
                { id: task.id, status: 'running' },
                {
                    status: ctx.abortSignal.aborted
                        ? (await this.tasks.findOneByOrFail({ id: task.id })).cancelRequested
                            ? 'canceled'
                            : 'unknown'
                        : 'failed'
                }
            )
        } finally {
            if (ownsThread) {
                const execution = await this.executions.findOneBy({ id: task.executionId, tenantId: scope.tenantId })
                await this.control.finish(
                    scope.threadId,
                    task.executionId,
                    execution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED ? 'interrupted' : 'idle'
                )
            }
        }
        return { status: 'ok' }
    }
}
