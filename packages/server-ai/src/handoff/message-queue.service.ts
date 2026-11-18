// Invariants: controlled callbacks publish and consume the same admitted contract.
// Callback returns are durable receipts; transport redelivery never authorizes business replay.
import { runWithHandoffMessageContext } from './message-context'
import {
    TaskControlStore,
    readHandoffReceipt,
    TaskControlRejected,
    publicationDiagnostic,
    withTaskControl,
    taskControlId,
    ManagedQueueService,
    ManagedQueueHandlerRegistryService
} from '@xpert-ai/server-core'
import { Interval } from '@nestjs/schedule'
import { MessageDispatcherService } from './message-dispatcher.service'
import { z } from 'zod'
import { Injectable, Logger } from '@nestjs/common'
import type { HandoffTaskReceipt } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { parseControlledMessage, parseProcessResult } from './controlled-message.schema'
import { HANDOFF_CONTROL_HANDLER } from './handoff-publication'
import {
    HandoffEnqueueAndWaitOptions,
    HandoffEnqueueOptions,
    HandoffMessage,
    HandoffPermissionService,
    ProcessResult,
    RequirePermissionOperation
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { isDeepStrictEqual } from 'node:util'
import { HandoffPendingResultService } from './pending-result.service'
import { DEFAULT_HANDOFF_MAX_ATTEMPTS } from './constants'
import { HandoffRouteResolution, HandoffRouteResolver } from './dispatcher/handoff-route-resolver.service'
import { HandoffQueueEnqueueItem, HandoffQueueGatewayService } from './dispatcher/handoff-queue-gateway.service'

@Injectable()
export class HandoffQueueService implements HandoffPermissionService {
    private readonly logger = new Logger(HandoffQueueService.name)
    private readonly receipts = new Map<string, HandoffTaskReceipt>()
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
     * Progress events and messages without a controlled parent retain process-local callbacks.
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
                        .then(async (row) => {
                            const receipt = readHandoffReceipt(row?.result)
                            if (receipt) this.pendingResults.resolve(normalized.id, parseProcessResult(receipt.result))
                            // Deprecated raw-result format (#1413): remove after all writers, including settleUnstarted(),
                            // migrate and no retained raw results remain readable. Repair preserves the original format.
                            else if (row?.result && (await this.tasks.read(targetId))?.state === 'completed')
                                this.pendingResults.resolve(normalized.id, parseProcessResult(row.result))
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
            ...HANDOFF_CONTROL_HANDLER,
            handler: async (job, context) => {
                const message = parseControlledMessage(job.data)
                if (!context.control) throw new Error('Handoff requires controlled worker')
                const publication = await this.tasks.publication(message.control.targetId)
                const saved = parseControlledMessage(
                    z.object({ message: z.unknown() }).parse(publication?.payload).message
                )
                if (!isDeepStrictEqual(message, saved)) throw new TaskControlRejected('scope')
                const task = await this.tasks.read(message.control.targetId)
                if (
                    !task ||
                    task.tenantId !== message.tenantId ||
                    task.organizationId !== (message.headers?.organizationId ?? null) ||
                    task.resourceId !== message.id
                )
                    throw new Error('Handoff control scope mismatch')
                const claim = await this.tasks.startHandoff(task.id, context.control.reference.targetId)
                if (!claim) return
                let result: ProcessResult
                let outcome: HandoffTaskReceipt['outcome']
                try {
                    result = await this.dispatcher.dispatch(message, context.control)
                    if (result.status === 'ok' && result.outbound?.length) await this.enqueueMany(result.outbound)
                    outcome = result.status === 'ok' ? 'succeeded' : result.status === 'dead' ? 'failed' : 'uncertain'
                } catch {
                    result = {
                        status: 'dead',
                        reason: t('server-ai:Error.HandoffDispatchUncertain', {
                            defaultValue: 'Callback execution is uncertain; automatic replay is withheld.'
                        })
                    }
                    outcome = 'uncertain'
                }
                this.receipts.set(task.id, {
                    version: 1,
                    kind: 'handoff-receipt',
                    workerId: context.control.reference.targetId,
                    workerClaim: claim,
                    outcome,
                    result
                })
                await this.flushReceipt(task.id)
                // Another replica's waiter reads the same receipt from persistence.
                if (!this.receipts.has(task.id)) this.pendingResults.resolve(message.id, result)
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
                    ...HANDOFF_CONTROL_HANDLER,
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

    private async flushReceipt(id: string) {
        const receipt = this.receipts.get(id)
        if (!receipt) return
        try {
            await this.tasks.recordHandoffReceipt(id, receipt)
            this.receipts.delete(id)
        } catch {
            this.logger.warn({ message: 'Handoff receipt persistence pending', targetId: id })
        }
    }

    @Interval(2000)
    async reconcileControlledPublications() {
        if (this.publishing) return
        this.publishing = true
        try {
            for (const id of this.receipts.keys()) await this.flushReceipt(id)
            for (const row of await this.tasks.publications('handoff')) {
                try {
                    const parsed = z
                        .object({
                            message: z.unknown(),
                            delayMs: z.number(),
                            drainOnPause: z.boolean(),
                            controlContract: z.string().optional()
                        })
                        .parse(row.payload)
                    // Keep this isolation after legacy readers/repair retire: unsupported outboxes must never dispatch.
                    // Missing protocol metadata cannot prove that an older worker never executed the callback.
                    if (parsed.controlContract !== HANDOFF_CONTROL_HANDLER.controlContract) {
                        await this.tasks.published(row.targetId, false, {
                            code: 'legacy_review',
                            retryable: false,
                            recordedAt: new Date().toISOString()
                        })
                        continue
                    }
                    const message = parseControlledMessage(parsed.message)
                    if (
                        message.control.targetId !== row.targetId ||
                        message.tenantId !== row.tenantId ||
                        (message.headers?.organizationId ?? null) !== row.organizationId
                    )
                        throw new TaskControlRejected('scope')
                    const task = await this.tasks.read(row.targetId)
                    if (!task) throw new TaskControlRejected('missing')
                    if (await this.tasks.settleUnstarted(task.id)) continue
                    if (task.state === 'completed' || row.result) {
                        await this.tasks.settleHandoffReceipt(task.id)
                        await this.tasks.published(row.targetId, true)
                    } else if (task.state === 'queued' && !task.claim) {
                        await this.publishControlled(message, parsed.delayMs, parsed.drainOnPause)
                        await this.tasks.published(row.targetId, true)
                    }
                } catch (error) {
                    await this.recordPublicationFailure(row.targetId, error)
                }
            }
        } finally {
            this.publishing = false
        }
    }

    private async recordPublicationFailure(id: string, error: unknown) {
        const diagnostic = publicationDiagnostic(error)
        await this.tasks.published(id, false, diagnostic)
        this.logger.warn({ message: 'Handoff publication deferred', targetId: id, ...diagnostic })
        return diagnostic
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
                receiptProtocol: 1,
                controlContract: HANDOFF_CONTROL_HANDLER.controlContract,
                delayMs: options?.delayMs ?? 0,
                drainOnPause
            })
            try {
                await this.publishControlled(controlled, options?.delayMs ?? 0, drainOnPause)
                await this.tasks.published(targetId, true)
            } catch (error) {
                const diagnostic = await this.recordPublicationFailure(targetId, error)
                if (!diagnostic.retryable) throw error
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
