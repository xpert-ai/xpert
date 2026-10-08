// A persisted task is the outbox. Claiming queued -> running precedes every dispatch,
// so retries never replay business side effects. Socket lifetime does not own tasks.
import { randomUUID } from 'node:crypto'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { HandoffMessage, RealtimeSessionOptions } from '@xpert-ai/plugin-sdk'
import { RealtimeToolCall, VoiceServerControl, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { In, Repository } from 'typeorm'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { StopHandoffMessageCommand } from '../handoff/commands'
import { RealtimeVoiceSession, RealtimeVoiceTask } from './voice.entity'
import { VoiceScope, voiceToolSchema } from './voice.schema'
import { VoiceSessionService } from './voice-session.service'
import { withVoiceScope } from './voice-context'
import { voiceDelegationInput } from './voice-assistant-context'
import { boundedVoiceResult, voiceTaskAnswer } from './voice-task-result'

export const VOICE_TASK_DISPATCH = 'voice_task_dispatch'
const taskHandle = { type: 'string' as const, description: 'The opaque taskHandle returned by delegate_task.' }
export const voiceTools: RealtimeSessionOptions['tools'] = [
    {
        name: 'delegate_task',
        description:
            'Execute the user’s request with this Assistant’s published tools and workflow, including configured search/browsing capabilities. The host attaches conversation context. Returns an accepted handle; completion is announced automatically. Keep listening while it runs.',
        parameters: {
            type: 'object',
            properties: { goal: { type: 'string' } },
            required: ['goal'],
            additionalProperties: false
        }
    },
    {
        name: 'get_task_status',
        description:
            'Read an accepted task when the user asks about its progress. Do not repeatedly poll; completion is announced automatically.',
        parameters: {
            type: 'object',
            properties: { taskHandle },
            required: ['taskHandle'],
            additionalProperties: false
        }
    },
    {
        name: 'steer_task',
        description: 'Send a user-requested correction to a running task. Does not cancel it.',
        parameters: {
            type: 'object',
            properties: { taskHandle, instruction: { type: 'string' } },
            required: ['taskHandle', 'instruction'],
            additionalProperties: false
        }
    },
    {
        name: 'cancel_task',
        description:
            'Request cancellation only when the user explicitly asks to stop a task. Hanging up is not cancellation.',
        parameters: {
            type: 'object',
            properties: { taskHandle },
            required: ['taskHandle'],
            additionalProperties: false
        }
    }
]

@Injectable()
export class VoiceTaskService implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>
    private reconciling = false
    constructor(
        @InjectRepository(RealtimeVoiceTask) readonly tasks: Repository<RealtimeVoiceTask>,
        private readonly queue: HandoffQueueService,
        private readonly commands: CommandBus,
        private readonly sessions: VoiceSessionService,
        @InjectRepository(XpertAgentExecution) private readonly executions: Repository<XpertAgentExecution>,
        @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>
    ) {}

    onModuleInit() {
        this.timer = setInterval(() => void this.reconcile(), 15000)
        this.timer.unref()
    }
    onModuleDestroy() {
        clearInterval(this.timer)
    }

    async list(scope: VoiceScope): Promise<Extract<VoiceServerControl, { type: 'task' }>[]> {
        const rows = await this.tasks
            .createQueryBuilder('task')
            .where('task."tenantId" = :tenantId AND task."organizationId" = :organizationId', scope)
            .andWhere("task.scope->>'userId' = :userId AND task.scope->>'threadId' = :threadId", scope)
            .orderBy('task.createdAt', 'DESC')
            .take(30)
            .getMany()
        for (const row of rows) await this.refresh(row)
        return rows.map((row) => ({
            type: 'task',
            action: row.action,
            taskId: row.id,
            status: row.status,
            text: boundedVoiceResult(row.result)
        }))
    }

    async execute(session: RealtimeVoiceSession, call: RealtimeToolCall) {
        return withVoiceScope(session.scope, async () => {
            await this.sessions.current(session)
            const input = voiceToolSchema.parse({ name: call.name, arguments: JSON.parse(call.arguments) })
            if (input.name === 'delegate_task') return this.accept(session, call.id, input.arguments.goal)
            const task = await this.tasks.findOneBy({
                id: input.arguments.taskHandle,
                tenantId: session.tenantId,
                organizationId: session.organizationId
            })
            if (!task || task.scope.userId !== session.userId || task.scope.threadId !== session.threadId)
                return { error: 'task_not_found' }
            await this.refresh(task)
            if (input.name === 'get_task_status')
                return {
                    taskHandle: task.id,
                    status: task.status,
                    action: task.action,
                    result: boundedVoiceResult(task.result),
                    cancelRequested: task.cancelRequested
                }
            if (input.name === 'steer_task') {
                if (task.status !== 'running' || !task.executionId) return { error: 'task_not_running' }
                return this.accept(session, call.id, input.arguments.instruction, task.executionId)
            }
            if (!['queued', 'running'].includes(task.status)) return { taskHandle: task.id, status: task.status }
            // A queue removal is conclusive only if the worker has not claimed this row.
            await this.tasks.update({ id: task.id }, { cancelRequested: true })
            await this.tasks.update({ id: task.id, status: 'queued' }, { status: 'canceled' })
            await this.commands.execute(
                new StopHandoffMessageCommand({ messageIds: [task.id], reason: 'voice_user_cancel' })
            )
            const current = await this.tasks.findOneByOrFail({ id: task.id })
            return { taskHandle: task.id, status: current.status, cancelRequested: true }
        })
    }

    private async refresh(task: RealtimeVoiceTask) {
        if (task.action !== 'send' || !task.executionId || !['running', 'waiting', 'unknown'].includes(task.status))
            return
        const execution = await this.executions.findOneBy({
            id: task.executionId,
            tenantId: task.tenantId,
            organizationId: task.organizationId
        })
        if (!execution) return
        const status =
            execution.status === XpertAgentExecutionStatusEnum.SUCCESS
                ? 'completed'
                : execution.status === XpertAgentExecutionStatusEnum.ERROR ||
                    execution.status === XpertAgentExecutionStatusEnum.TIMEOUT
                  ? 'failed'
                  : execution.status === XpertAgentExecutionStatusEnum.RUNNING && task.status === 'waiting'
                    ? 'running'
                    : task.status
        if (status === task.status) return
        const answer = await this.messages.findOne({
            where: {
                executionId: task.executionId,
                role: 'ai',
                tenantId: task.tenantId,
                organizationId: task.organizationId
            },
            order: { createdAt: 'DESC' }
        })
        const result = voiceTaskAnswer(answer?.content) ?? task.result
        const updated = await this.tasks.update({ id: task.id, status: task.status }, { status, result })
        if (updated.affected === 1) {
            task.status = status
            task.result = result
        }
    }

    private async accept(
        session: RealtimeVoiceSession,
        callId: string,
        instruction: string,
        targetExecutionId?: string
    ) {
        const existing = await this.tasks.findOneBy({ sessionId: session.id, callId })
        if (existing) return { taskHandle: existing.id, status: existing.status }
        // Admission is bounded independently of how many function calls a model emits.
        if ((await this.tasks.countBy({ sessionId: session.id, status: In(['queued', 'running']) })) >= 4)
            return { error: 'task_limit', message: 'Wait for an existing task or steer it.' }
        const id = randomUUID()
        const context = await this.sessions.conversationContext(session.scope)
        await this.tasks
            .createQueryBuilder()
            .insert()
            .values({
                id,
                tenantId: session.tenantId,
                organizationId: session.organizationId,
                sessionId: session.id,
                callId,
                scope: session.scope,
                instruction: voiceDelegationInput(instruction, context),
                action: targetExecutionId ? 'steer' : 'send',
                targetExecutionId,
                executionId: randomUUID(),
                status: 'queued'
            })
            .orIgnore()
            .execute()
        const task = await this.tasks.findOneByOrFail({ sessionId: session.id, callId })
        // Enqueue failure leaves a durable outbox entry for the reconciler.
        await this.enqueue(task).catch(() => undefined)
        return { taskHandle: task.id, status: task.status }
    }

    private enqueue(task: RealtimeVoiceTask) {
        const scope = task.scope
        const message: HandoffMessage<{ taskId: string }> = {
            id: task.id,
            type: VOICE_TASK_DISPATCH,
            version: 1,
            tenantId: scope.tenantId,
            sessionKey: scope.threadId,
            businessKey: task.id,
            attempt: 1,
            maxAttempts: 1,
            enqueuedAt: Date.now(),
            traceId: task.id,
            payload: { taskId: task.id },
            headers: {
                organizationId: scope.organizationId,
                userId: scope.userId,
                threadId: scope.threadId,
                conversationId: scope.conversationId
            }
        }
        return this.queue.enqueue(message)
    }

    private async reconcile() {
        if (this.reconciling) return
        this.reconciling = true
        try {
            // A worker crash has an uncertain outcome. Never replay a running mutation.
            await this.tasks
                .createQueryBuilder()
                .update()
                .set({ status: 'unknown' })
                .where('status = :status AND "updatedAt" < :before', {
                    status: 'running',
                    before: new Date(Date.now() - 3700000)
                })
                .execute()
            await this.tasks
                .createQueryBuilder()
                .update()
                .set({ status: 'failed' })
                .where('status = :status AND "createdAt" < :before', {
                    status: 'queued',
                    before: new Date(Date.now() - 1800000)
                })
                .execute()
            for (const task of await this.tasks.find({
                where: { status: 'queued' },
                order: { createdAt: 'ASC' },
                take: 20
            }))
                await this.enqueue(task)
        } catch {
            /* Persistent outbox entries remain pending during infrastructure outages. */
        } finally {
            this.reconciling = false
        }
    }
}
