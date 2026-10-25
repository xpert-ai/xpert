// Durable control survives missed notifications. Polling only delivers control; it never replays work.
import { z } from 'zod'
import { TExecutionOwnership } from '@xpert-ai/contracts'
import { ExecutionControlStore } from './execution-control.store'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { closeRedisSubscriber, REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { ExecutionCancelledError } from './execution-cancelled.error'

const EXECUTION_CANCEL_CHANNEL = 'ai:execution:cancel'

interface CancelPayload {
    executionIds: string[]
    reason?: string
}

@Injectable()
export class ExecutionCancelService implements OnModuleInit, OnModuleDestroy {
    readonly #logger = new Logger(ExecutionCancelService.name)
    readonly #controllers = new Map<string, AbortController>()
    private subscriber?: RedisClientType
    private timer?: ReturnType<typeof setInterval>
    private reconciling = false

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
        private readonly controls: ExecutionControlStore
    ) {}

    async onModuleInit() {
        this.timer = setInterval(() => void this.reconcile(), 1000)
        this.timer.unref()
        this.subscriber = this.redis.duplicate()
        await this.subscriber.connect()
        await this.subscriber.subscribe(EXECUTION_CANCEL_CHANNEL, (message) => {
            this.handleCancelMessage(message)
        })
    }

    async onModuleDestroy() {
        clearInterval(this.timer)
        await closeRedisSubscriber('execution-cancel.redis', this.subscriber)
    }

    register(executionId: string, controller: AbortController) {
        if (!executionId || !controller) {
            return
        }
        this.#controllers.set(executionId, controller)
    }

    unregister(executionId: string, controller?: AbortController) {
        if (!executionId) {
            return
        }
        if (!controller || this.#controllers.get(executionId) === controller) {
            this.#controllers.delete(executionId)
            void this.controls.tasks
                .execution(executionId)
                .then(async (task) => {
                    if (task?.drainOnPause && task.currentExecutionId === executionId)
                        await this.controls.tasks.receipt(task.id, 'completed')
                })
                .catch(() => this.#logger.warn('Local child completion receipt deferred'))
        }
    }

    async cancelExecutions(executionIds: string[], reason?: string) {
        const uniqueIds = Array.from(new Set(executionIds.filter(Boolean)))
        if (!uniqueIds.length) {
            return
        }
        await this.controls.terminate(uniqueIds)
        const payload: CancelPayload = { executionIds: uniqueIds, reason }
        try {
            await this.redis.publish(EXECUTION_CANCEL_CHANNEL, JSON.stringify(payload))
        } catch (error) {
            this.#logger.warn(`Failed to publish cancel event: ${error}`)
        }
        this.applyCancel(uniqueIds, reason)
    }

    async attach(executionId: string, parentExecutionId: string, policy: TExecutionOwnership['policy']) {
        await this.controls.attach(executionId, parentExecutionId, policy)
    }

    async ownedExecutionIds(execution: {
        id?: string
        tenantId?: string
        organizationId?: string | null
    }): Promise<string[] | null> {
        const task = await this.controls.tasks.execution(execution.id)
        if (!task) return null
        if (task.tenantId !== execution.tenantId || task.organizationId !== (execution.organizationId ?? null))
            throw new ExecutionCancelledError(execution.id, 'Execution scope mismatch')
        return (await this.controls.tasks.descendants(task.id))
            .filter((child) => child.kind === 'execution' && child.currentExecutionId)
            .map((child) => child.currentExecutionId)
    }

    /** Required after registration and before starting work; also repairs a notice lost before registration. */
    async check(executionId: string) {
        if (await this.controls.shouldAbort(executionId)) this.applyCancel([executionId])
    }

    async reconcile() {
        if (this.reconciling) return
        this.reconciling = true
        try {
            for (const executionId of this.#controllers.keys()) await this.check(executionId)
        } catch {
            this.#logger.warn('Execution control delivery unavailable; retaining controllers for retry')
        } finally {
            this.reconciling = false
        }
    }

    private handleCancelMessage(message: string) {
        try {
            const payload = z
                .object({ executionIds: z.array(z.string().min(1)), reason: z.string().optional() })
                .parse(JSON.parse(message))
            this.applyCancel(payload.executionIds ?? [], payload.reason)
        } catch (error) {
            this.#logger.warn(`Invalid cancel payload: ${error}`)
        }
    }

    private applyCancel(executionIds: string[], reason?: string) {
        for (const executionId of executionIds) {
            const controller = this.#controllers.get(executionId)
            if (!controller) {
                continue
            }
            if (!controller.signal.aborted) {
                this.#logger.debug(`Abort execution ${executionId}: ${reason ?? 'canceled'}`)
                controller.abort(new ExecutionCancelledError(executionId, reason ?? 'Canceled by user'))
            }
            this.#controllers.delete(executionId)
        }
    }
}
