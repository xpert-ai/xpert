import { OutputStore } from '../user-notification/output/output-store'
import { ForbiddenException, HttpException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { AgentEventSources, sourceContext } from './agent-event-sources'
export { AgentEventSources, sourceContext } from './agent-event-sources'
import { PrivateDecisionRouter } from '../user-notification/output/private-decision-router'
import { CommandBus } from '@nestjs/cqrs'
import { ManagedQueueHandlerRegistryService, ManagedQueueService } from '@xpert-ai/server-core'
import { type AgentEventContext, type AgentEventFollowUp, type PluginAgentEventSource } from '@xpert-ai/plugin-sdk'
import { HandoffOutboxAdapters } from '../handoff/outbox-adapters.service'
import { RuntimeMessageAccessService } from '../handoff/runtime-messaging/runtime-message-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { AssertProjectAssistantAccessCommand } from '../xpert-project/commands/assert-project-assistant-access.command'
import type { AgentEventBinding } from './agent-event.entity'
import { AgentEventBindingService } from './agent-event-binding.service'
import { FollowUpThreadBusy } from './follow-up-timer.constants'
import { AgentEventWakeService } from './agent-event-wake.service'
import { AgentEventStore } from './agent-event.store'

const queue = { pluginName: '@xpert-ai/platform', queueName: 'agent-event', jobName: 'consume' }

@Injectable()
export class AgentEventRuntime implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AgentEventRuntime.name)
    private scan?: Promise<void>
    private unregister?: () => void
    private unregisterJob?: () => void
    constructor(
        private readonly bindings: AgentEventBindingService,
        private readonly store: AgentEventStore,
        private readonly sources: AgentEventSources,
        private readonly recovery: HandoffOutboxAdapters,
        private readonly jobs: ManagedQueueService,
        private readonly handlers: ManagedQueueHandlerRegistryService,
        private readonly access: RuntimeMessageAccessService,
        private readonly published: PublishedXpertAccessService,
        private readonly commands: CommandBus,
        private readonly wakeService?: AgentEventWakeService,
        private readonly outputs?: OutputStore,
        private readonly decisionRouter?: PrivateDecisionRouter
    ) {}

    onModuleInit() {
        this.unregisterJob = this.handlers.register<{ binding: string }>({
            ...queue,
            concurrency: 4,
            handler: async (job, scope) => {
                if (!scope.tenantId || !scope.organizationId) return
                const binding = await this.bindings.findEnabled(job.data.binding, scope.tenantId, scope.organizationId)
                if (binding) await this.process(binding)
            }
        })
        this.unregister = this.recovery.register({
            // The shared sweep also drives Handoff and group delivery. Only one Inbox scan can be outstanding.
            reconcile: async () => {
                this.scan ??= this.reconcile()
                    .catch(() => {
                        this.logger.warn('event_scan_unavailable')
                    })
                    .finally(() => {
                        this.scan = undefined
                    })
            }
        })
    }
    onModuleDestroy() {
        this.unregister?.()
        this.unregisterJob?.()
    }

    async reconcile() {
        const bindings = await this.bindings.reserveDue()
        await Promise.all(
            bindings.map((binding) =>
                this.jobs.enqueue({
                    ...queue,
                    tenantId: binding.tenantId,
                    organizationId: binding.organizationId,
                    // The wakeup must reach the handler even if the persisted user has since lost membership.
                    jobId: `inbox-${binding.id}-${Math.floor(Date.now() / 5000)}`,
                    payload: { binding: binding.id },
                    removeOnComplete: true,
                    removeOnFail: true
                })
            )
        )
    }

    private async authorize(binding: AgentEventBinding) {
        const target = await this.published.getAccessiblePublishedXpert(binding.xpertId)
        if (target.workspaceId !== binding.workspaceId || target.publishAt?.getTime() !== binding.publishedAt.getTime())
            throw new ForbiddenException('event_target_changed')
        if (binding.projectId)
            await this.commands.execute(new AssertProjectAssistantAccessCommand(binding.projectId, binding.xpertId))
    }

    private async withAuthority(binding: AgentEventBinding, signal: AbortSignal, work: () => Promise<void>) {
        let admitted = false
        try {
            await this.access.withControlActor(binding, async () => {
                await this.authorize(binding)
                admitted = true
                const current = await this.bindings.findEnabled(binding.id, binding.tenantId, binding.organizationId)
                signal.throwIfAborted()
                if (current?.revision === binding.revision) await work()
            })
        } catch (error) {
            // Only the host's identity and target checks can revoke an entire binding.
            if (
                admitted ||
                signal.aborted ||
                !(error instanceof HttpException) ||
                ![401, 403, 404].includes(error.getStatus())
            )
                throw error
            await this.bindings.revoke(binding)
        }
    }

    private async drain(binding: AgentEventBinding, source: PluginAgentEventSource, context: AgentEventContext) {
        let open = true
        let received = false
        try {
            const batch = await source.drain(
                context,
                {
                    publish: async (event) => {
                        if (!open || context.signal.aborted) throw new Error('event_publisher_closed')
                        const result = await this.store.publish(binding, source, event)
                        // Older installed SDKs persist every rejection. A stale publisher must leave newer facts retryable.
                        if (
                            result.status === 'rejected' &&
                            result.code === 'binding_changed' &&
                            event.bindingRevision >= binding.revision
                        )
                            throw new Error('event_binding_changed')
                        if (result.status !== 'rejected') received = true
                        return result
                    }
                },
                32
            )
            if (batch.more && !context.signal.aborted) await this.bindings.scheduleNext(binding)
            return received
        } finally {
            open = false
        }
    }

    private async consume(
        binding: AgentEventBinding,
        source: PluginAgentEventSource,
        context: AgentEventContext,
        budget: number
    ) {
        while (budget > 0 && !context.signal.aborted) {
            const claim = await this.store.claim(binding)
            if (!claim) break
            budget--
            if (claim.event.bindingRevision !== binding.revision) {
                await this.store.complete(claim, { status: 'blocked', reasonCode: 'binding_changed' })
                continue
            }
            await this.withAuthority(binding, context.signal, async () => {
                try {
                    const delivery = new AbortController()
                    const signal = AbortSignal.any([context.signal, delivery.signal])
                    const wake: AgentEventFollowUp | undefined = this.wakeService && {
                        ...(this.decisionRouter &&
                        binding.plugin === '@xpert-ai/plugin-lark' &&
                        binding.adapter === 'lark.inbound'
                            ? {
                                  submitPrivateDecision: (reply) => {
                                      signal.throwIfAborted()
                                      return this.decisionRouter.submit(binding, claim, reply, signal)
                                  }
                              }
                            : {}),
                        wake: async (input) => {
                            if (signal.aborted) throw new Error('event_delivery_closed')
                            await this.wakeService.start(binding, claim, input, signal)
                        }
                    }
                    const decision = await source
                        .handle(
                            context,
                            {
                                receiptId: claim.receiptId,
                                fence: claim.fence,
                                event: claim.event
                            },
                            wake
                        )
                        .finally(() => {
                            delivery.abort()
                        })
                    if (!context.signal.aborted) await this.store.complete(claim, decision)
                } catch (error) {
                    if (context.signal.aborted) return
                    if (error instanceof FollowUpThreadBusy) {
                        await this.store.complete(claim, undefined, true)
                    } else {
                        await this.store.complete(
                            claim,
                            error instanceof HttpException && [401, 403, 404].includes(error.getStatus())
                                ? { status: 'blocked', reasonCode: 'event_access_changed' }
                                : undefined
                        )
                    }
                }
            })
        }
        return budget
    }

    async process(binding: AgentEventBinding) {
        const controller = new AbortController()
        const context = sourceContext(binding, controller.signal)
        const deadline = new Promise<never>((_, reject) =>
            controller.signal.addEventListener('abort', () => reject(new Error('event_deadline')), { once: true })
        )
        const timeout = setTimeout(() => controller.abort(), 45_000)
        try {
            await Promise.race([
                deadline,
                this.withAuthority(binding, context.signal, async () => {
                    const source = this.sources.resolve(binding)
                    const [drained, consumed] = await Promise.allSettled([
                        this.drain(binding, source, context),
                        this.consume(binding, source, context, 16)
                    ])
                    if (consumed.status === 'rejected') throw consumed.reason
                    // Intake can fail after a successful publish. Give those receipts the remaining budget too.
                    if (consumed.value > 0 && (drained.status === 'rejected' || drained.value))
                        await this.consume(binding, source, context, consumed.value)
                    if (drained.status === 'rejected') throw drained.reason
                    if (source.outputs) await this.outputs?.collect(binding, context, source.outputs)
                })
            ])
            await this.bindings.recordScan(binding, null)
        } catch (error) {
            await this.bindings.recordScan(
                binding,
                controller.signal.aborted
                    ? 'event_deadline'
                    : error instanceof ForbiddenException
                      ? 'event_access_changed'
                      : 'event_source_unavailable'
            )
            throw error
        } finally {
            clearTimeout(timeout)
            controller.abort()
        }
    }
}
