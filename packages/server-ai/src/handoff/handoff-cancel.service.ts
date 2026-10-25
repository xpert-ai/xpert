import { closeRedisSubscriber, REDIS_CLIENT, TaskControlStore } from '@xpert-ai/server-core'
import { RequestContext, HandoffMessage } from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { RedisClientType } from 'redis'
import { buildCanceledReason } from './cancel-reason'

const HANDOFF_CANCEL_CHANNEL = 'ai:handoff:cancel'

interface HandoffCancelPayload {
    messageIds: string[]
    reason?: string
}

@Injectable()
export class HandoffCancelService implements OnModuleInit, OnModuleDestroy {
    readonly #logger = new Logger(HandoffCancelService.name)
    readonly #controllers = new Map<string, AbortController>()
    readonly #cancelReasons = new Map<string, string>()
    private subscriber?: RedisClientType
    private readonly messages = new Map<string, HandoffMessage>()
    private timer?: ReturnType<typeof setInterval>
    private scanning = false

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
        private readonly tasks: TaskControlStore
    ) {}

    async persist(messages: HandoffMessage[]) {
        for (const message of messages) {
            const task = message.control
                ? await this.tasks.read(message.control.targetId)
                : await this.tasks.register({
                      tenantId: message.tenantId,
                      organizationId: message.headers?.organizationId,
                      kind: 'handoff',
                      resourceId: message.id
                  })
            if (
                !task ||
                task.tenantId !== message.tenantId ||
                task.organizationId !== (message.headers?.organizationId ?? null) ||
                task.kind !== 'handoff' ||
                task.resourceId !== message.id
            )
                throw new Error('Handoff control scope mismatch')
            // A legacy queue scan cannot prove whether the old worker already entered its handler.
            if (!message.control) await this.tasks.receipt(task.id, 'unknown')
            await this.tasks.change(task.id, 'terminated')
        }
    }

    async check(message: HandoffMessage) {
        const task = await this.tasks.find(
            { tenantId: message.tenantId, organizationId: message.headers?.organizationId },
            'handoff',
            message.id
        )
        return task && (await this.tasks.desired(task.id)) === 'terminated'
    }

    async confirmRemoved(messages: HandoffMessage[]) {
        for (const message of messages) {
            const task = await this.tasks.find(
                { tenantId: message.tenantId, organizationId: message.headers?.organizationId },
                'handoff',
                message.id
            )
            if (task) await this.tasks.receipt(task.id, 'completed')
        }
    }

    async cancelOwnedTargets(messageIds: string[], executionIds: string[]) {
        const scope = { tenantId: RequestContext.currentTenantId(), organizationId: RequestContext.getOrganizationId() }
        if (!scope.tenantId) return { messageIds: [], executionIds: [] }
        const targets = new Map<string, string>()
        const matchedExecutions: string[] = []
        for (const id of messageIds) {
            const task = await this.tasks.find(scope, 'handoff', id)
            if (task) targets.set(task.id, task.resourceId)
        }
        for (const id of executionIds) {
            const task = await this.tasks.execution(id)
            if (!task || task.tenantId !== scope.tenantId || task.organizationId !== (scope.organizationId ?? null))
                continue
            for (const target of await this.tasks.descendants(task.id)) {
                if (target.kind === 'handoff') {
                    targets.set(target.id, target.resourceId)
                    matchedExecutions.push(id)
                }
            }
        }
        for (const id of targets.keys()) await this.tasks.change(id, 'terminated')
        return { messageIds: [...targets.values()], executionIds: [...new Set(matchedExecutions)] }
    }

    async reconcile() {
        if (this.scanning) return
        this.scanning = true
        try {
            for (const [id, message] of this.messages) {
                try {
                    if (await this.check(message)) this.applyCancel([id])
                } catch {
                    this.#logger.warn('Handoff control check deferred')
                }
            }
        } finally {
            this.scanning = false
        }
    }

    async onModuleInit() {
        this.timer = setInterval(() => void this.reconcile(), 1000)
        this.timer.unref()
        if (!this.redis) {
            return
        }
        this.subscriber = this.redis.duplicate()
        await this.subscriber.connect()
        await this.subscriber.subscribe(HANDOFF_CANCEL_CHANNEL, (message) => {
            this.handleCancelMessage(message)
        })
    }

    async onModuleDestroy() {
        clearInterval(this.timer)
        await closeRedisSubscriber('handoff-cancel.redis', this.subscriber)
    }

    register(messageId: string, controller: AbortController, message?: HandoffMessage) {
        if (!messageId || !controller) {
            return
        }
        this.#controllers.set(messageId, controller)
        if (message) this.messages.set(messageId, message)
    }

    unregister(messageId: string) {
        if (!messageId) {
            return
        }
        this.#controllers.delete(messageId)
        this.#cancelReasons.delete(messageId)
        const message = this.messages.get(messageId)
        this.messages.delete(messageId)
        if (message)
            void this.confirmRemoved([message]).catch(() => this.#logger.warn('Handoff completion receipt deferred'))
    }

    getCancelReason(messageId: string): string | undefined {
        return this.#cancelReasons.get(messageId)
    }

    async cancelMessages(messageIds: string[], reason?: string): Promise<string[]> {
        const uniqueMessageIds = Array.from(new Set((messageIds ?? []).filter(Boolean)))
        if (!uniqueMessageIds.length) {
            return []
        }

        const payload: HandoffCancelPayload = {
            messageIds: uniqueMessageIds,
            reason
        }

        if (this.redis) {
            try {
                await this.redis.publish(HANDOFF_CANCEL_CHANNEL, JSON.stringify(payload))
            } catch (error) {
                this.#logger.warn(`Failed to publish handoff cancel event: ${error}`)
            }
        }

        return this.applyCancel(uniqueMessageIds, reason)
    }

    private handleCancelMessage(message: string) {
        try {
            const payload = JSON.parse(message) as HandoffCancelPayload
            this.applyCancel(payload.messageIds ?? [], payload.reason)
        } catch (error) {
            this.#logger.warn(`Invalid handoff cancel payload: ${error}`)
        }
    }

    private applyCancel(messageIds: string[], reason?: string): string[] {
        const canceledReason = buildCanceledReason(reason)
        const abortedIds: string[] = []

        for (const messageId of messageIds) {
            const controller = this.#controllers.get(messageId)
            if (!controller) {
                continue
            }

            this.#cancelReasons.set(messageId, canceledReason)

            if (!controller.signal.aborted) {
                this.#logger.debug(`Abort handoff message ${messageId}: ${canceledReason}`)
                controller.abort()
            }
            this.#controllers.delete(messageId)
            abortedIds.push(messageId)
        }

        return abortedIds
    }
}
