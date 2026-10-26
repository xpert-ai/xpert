import { runWithHandoffMessageContext } from './message-context'
import {
    TaskControlStore,
    withTaskControl,
    taskControlId,
    ManagedQueueService,
    ManagedQueueHandlerRegistryService
} from '@xpert-ai/server-core'
import { Interval } from '@nestjs/schedule'
import { MessageDispatcherService } from './message-dispatcher.service'
import { z } from 'zod'
import { Injectable } from '@nestjs/common'
import {
    HandoffEnqueueAndWaitOptions,
    HandoffEnqueueOptions,
    HandoffMessage,
    HandoffPermissionService,
    ProcessResult,
    RequirePermissionOperation
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { HandoffPendingResultService } from './pending-result.service'
import { DEFAULT_HANDOFF_MAX_ATTEMPTS } from './constants'
import { HandoffRouteResolution, HandoffRouteResolver } from './dispatcher/handoff-route-resolver.service'
import { HandoffQueueEnqueueItem, HandoffQueueGatewayService } from './dispatcher/handoff-queue-gateway.service'

@Injectable()
export class HandoffQueueService implements HandoffPermissionService {
    constructor(
        private readonly queueGateway: HandoffQueueGatewayService,
        private readonly routeResolver: HandoffRouteResolver,
        private readonly pendingResults: HandoffPendingResultService,
        private readonly tasks: TaskControlStore,
        private readonly managed: ManagedQueueService,
        private readonly handlers: ManagedQueueHandlerRegistryService,
        private readonly dispatcher: MessageDispatcherService
    ) {}

    @RequirePermissionOperation('handoff', 'enqueue')
    async enqueue(message: HandoffMessage, options?: HandoffEnqueueOptions): Promise<{ id: string }> {
        const route = this.routeResolver.resolve(message)
        const normalized = this.normalize(message, route)
        await this.addJob(normalized, route, options)
        return { id: normalized.id }
    }

    async enqueueMany(messages: HandoffMessage[], options?: { delayMs?: number }): Promise<Array<{ id: string }>> {
        const results: Array<{ id: string }> = []
        for (const message of messages) results.push(await this.enqueue(message, options))
        return results
    }

    /**
     * Controlled messages also read their durable result, so another replica can settle the waiter.
     * Progress events and legacy messages retain the process-local callback behavior.
     */
    @RequirePermissionOperation('handoff', 'wait')
    async enqueueAndWait(message: HandoffMessage, options?: HandoffEnqueueAndWaitOptions): Promise<ProcessResult> {
        const route = this.routeResolver.resolve(message)
        const normalized = this.normalize(message, route)
        const waitPromise = this.pendingResults.waitFor<ProcessResult>(normalized.id, {
            timeoutMs: options?.timeoutMs,
            onEvent: options?.onEvent
        })
        let poll: ReturnType<typeof setInterval> | undefined
        let reading = false
        try {
            const targetId = await this.addJob(normalized, route, options, true)
            if (targetId)
                poll = setInterval(() => {
                    if (reading) return
                    reading = true
                    void this.tasks
                        .publication(targetId)
                        .then((row) => {
                            if (row?.result) this.pendingResults.resolve(normalized.id, parseProcessResult(row.result))
                        })
                        .catch(() => undefined)
                        .finally(() => {
                            reading = false
                        })
                }, 250)
            return await waitPromise
        } catch (error) {
            this.pendingResults.reject(normalized.id, error)
            await waitPromise.catch(() => undefined)
            throw error
        } finally {
            clearInterval(poll)
        }
    }

    private unregisterControlled?: () => void
    private publishing = false
    onModuleInit() {
        this.unregisterControlled = this.handlers.register({
            pluginName: '@xpert-ai/handoff',
            queueName: 'handoff-control-v2',
            jobName: 'dispatch',
            handler: async (job, context) => {
                const message = parseControlledMessage(job.data)
                if (!context.control) throw new Error('Handoff requires controlled worker')
                const task = await this.tasks.read(message.control.targetId)
                const worker = await this.tasks.read(context.control.reference.targetId)
                if (
                    !task ||
                    worker?.parentId !== task.id ||
                    task.tenantId !== message.tenantId ||
                    task.organizationId !== (message.headers?.organizationId ?? null)
                )
                    throw new Error('Handoff control scope mismatch')
                await this.tasks.receipt(task.id, 'running')
                try {
                    const result = await this.dispatcher.dispatch(message, context.control)
                    await this.tasks.publicationResult(task.id, result)
                    if (result.status === 'ok' && result.outbound?.length) await this.enqueueMany(result.outbound)
                    if (result.status === 'retry') {
                        // A handler has already run. Do not turn a transport retry into an unproven business replay.
                        await this.tasks.receipt(task.id, 'unknown')
                    } else await this.tasks.receipt(task.id, 'completed')
                    this.pendingResults.resolve(message.id, result)
                } catch (error) {
                    await this.tasks.publicationResult(task.id, {
                        status: 'dead',
                        reason: 'Handler failed; automatic replay withheld'
                    })
                    await this.tasks.receipt(task.id, 'unknown')
                    throw error
                }
            }
        })
    }
    onModuleDestroy() {
        this.unregisterControlled?.()
    }

    private async publishControlled(
        message: HandoffMessage & { control: { version: 2; targetId: string } },
        delayMs: number,
        drainOnPause: boolean
    ) {
        return runWithHandoffMessageContext(message, () =>
            withTaskControl(message.control, () =>
                this.managed.enqueue({
                    pluginName: '@xpert-ai/handoff',
                    queueName: 'handoff-control-v2',
                    jobName: 'dispatch',
                    jobId: `handoff-v2-${message.id}`,
                    payload: message,
                    tenantId: message.tenantId,
                    organizationId: message.headers?.organizationId,
                    userId: message.headers?.userId,
                    delayMs,
                    drainOnPause,
                    controlPolicy: 'attached'
                })
            )
        )
    }

    @Interval(2000)
    async reconcileControlledPublications() {
        if (this.publishing) return
        this.publishing = true
        try {
            for (const row of await this.tasks.publications('handoff')) {
                try {
                    const parsed = z
                        .object({ message: z.unknown(), delayMs: z.number(), drainOnPause: z.boolean() })
                        .parse(row.payload)
                    const message = parseControlledMessage(parsed.message)
                    const { delayMs, drainOnPause } = parsed
                    if (message.control.targetId !== row.targetId)
                        throw new Error('Handoff publication identity mismatch')
                    const task = await this.tasks.read(row.targetId)
                    if (task.state !== 'completed') await this.publishControlled(message, delayMs, drainOnPause)
                    await this.tasks.published(row.targetId, true)
                } catch {
                    await this.tasks.published(row.targetId, false)
                }
            }
        } finally {
            this.publishing = false
        }
    }

    private normalize(message: HandoffMessage, route: HandoffRouteResolution): HandoffMessage {
        const maxAttemptsFromTypePolicy = route.typePolicy?.retry?.maxAttempts
        return {
            ...message,
            id: message.id || randomUUID(),
            version: message.version ?? 1,
            attempt: Math.max(1, message.attempt ?? 1),
            maxAttempts: Math.max(1, message.maxAttempts ?? maxAttemptsFromTypePolicy ?? DEFAULT_HANDOFF_MAX_ATTEMPTS),
            enqueuedAt: message.enqueuedAt ?? Date.now()
        }
    }

    private async addJob(
        message: HandoffMessage,
        route: HandoffRouteResolution,
        options?: { delayMs?: number },
        drainOnPause = false
    ) {
        const queueItem = this.toQueueEnqueueItem(message, route, options)
        const parent = await this.tasks.producer()
        if (parent) {
            const registration = {
                tenantId: message.tenantId,
                organizationId: message.headers?.organizationId,
                kind: 'handoff' as const,
                resourceId: message.id,
                parent,
                policy: message.controlPolicy,
                drainOnPause
            }
            const targetId = taskControlId(registration)
            const controlled = { ...queueItem.message, control: { version: 2 as const, targetId } }
            await this.tasks.publish(registration, {
                message: controlled,
                delayMs: options?.delayMs ?? 0,
                drainOnPause
            })
            try {
                await this.publishControlled(controlled, options?.delayMs ?? 0, drainOnPause)
                await this.tasks.published(targetId, true)
            } catch {
                await this.tasks.published(targetId, false)
            }
            return targetId
        } else await this.queueGateway.enqueue(queueItem.queueName, queueItem.message, queueItem.options)
    }

    private toQueueEnqueueItem(
        message: HandoffMessage,
        route: HandoffRouteResolution,
        options?: { delayMs?: number }
    ): HandoffQueueEnqueueItem {
        return {
            queueName: route.queue,
            message: this.withRouteHeaders(message, route),
            options
        }
    }

    private withRouteHeaders(message: HandoffMessage, route: HandoffRouteResolution): HandoffMessage {
        const headers: Record<string, string> = {
            ...(message.headers ?? {}),
            requestedLane: message.headers?.requestedLane ?? route.lane,
            handoffQueue: route.queue
        }
        if (route.policy.timeoutMs && !headers['policyTimeoutMs']) {
            headers['policyTimeoutMs'] = String(route.policy.timeoutMs)
        }
        if (route.policy.idleTimeoutMs && !headers['policyIdleTimeoutMs']) {
            headers['policyIdleTimeoutMs'] = String(route.policy.idleTimeoutMs)
        }

        return {
            ...message,
            headers: headers as HandoffMessage['headers']
        }
    }
}

const controlledMessageSchema = z.object({
    id: z.string(),
    type: z.string(),
    version: z.number().int(),
    tenantId: z.string().uuid(),
    sessionKey: z.string(),
    businessKey: z.string(),
    attempt: z.number().int(),
    maxAttempts: z.number().int(),
    enqueuedAt: z.number(),
    traceId: z.string(),
    parentMessageId: z.string().optional(),
    payload: z.record(z.string(), z.unknown()),
    headers: z.record(z.string(), z.string()).optional(),
    control: z.object({ version: z.literal(2), targetId: z.string().uuid() }),
    controlPolicy: z.enum(['attached', 'detached', 'shared']).optional()
})

function parseControlledMessage(value: unknown): HandoffMessage & { control: { version: 2; targetId: string } } {
    return controlledMessageSchema.parse(value) as HandoffMessage & { control: { version: 2; targetId: string } }
}

function parseProcessResult(value: unknown): ProcessResult {
    return z
        .discriminatedUnion('status', [
            z.object({
                status: z.literal('ok'),
                outbound: z
                    .array(
                        controlledMessageSchema
                            .omit({ control: true })
                            .extend({ control: controlledMessageSchema.shape.control.optional() })
                    )
                    .optional()
            }),
            z.object({ status: z.literal('retry'), delayMs: z.number(), reason: z.string().optional() }),
            z.object({ status: z.literal('dead'), reason: z.string() })
        ])
        .parse(value) as ProcessResult
}
