import { Test } from '@nestjs/testing'
import { ManagedQueueService } from '@xpert-ai/server-core'
import { AgentEventBindingService } from './agent-event-binding.service'
import { HandoffOutboxAdapters } from '../handoff/outbox-adapters.service'
import { AgentEventRuntime } from './agent-event.runtime'

describe('Event Inbox shared recovery', () => {
    it('queues a scoped wakeup without requiring the queue processor to restore a revoked user', async () => {
        const binding = { id: 'binding', tenantId: 'tenant', organizationId: 'org', userId: 'former-member' }
        const enqueue = jest.fn()
        const module = await Test.createTestingModule({
            providers: [
                AgentEventRuntime,
                { provide: AgentEventBindingService, useValue: { reserveDue: async () => [binding] } },
                { provide: ManagedQueueService, useValue: { enqueue } }
            ]
        })
            .useMocker(() => ({}))
            .compile()
        await module.get(AgentEventRuntime).reconcile()
        expect(enqueue).toHaveBeenCalledWith({
            pluginName: '@xpert-ai/platform',
            queueName: 'agent-event',
            jobName: 'consume',
            tenantId: binding.tenantId,
            organizationId: binding.organizationId,
            payload: { binding: binding.id },
            jobId: expect.stringMatching(/^inbox-binding-/),
            removeOnComplete: true,
            removeOnFail: true
        })
    })
    it('allows unrelated outboxes to finish while an Inbox scan is stuck and coalesces repeated ticks', async () => {
        const adapters = new HandoffOutboxAdapters()
        const reconcile = jest.fn(async () => {})
        adapters.register({ reconcile })
        let release!: (rows: unknown[]) => void
        const reserveDue = jest.fn(
            () =>
                new Promise<unknown[]>((resolve) => {
                    release = resolve
                })
        )
        const dispose = jest.fn()
        const runtime = new AgentEventRuntime(
            { reserveDue } as unknown as AgentEventBindingService,
            null!,
            null!,
            adapters,
            null!,
            { register: () => dispose } as never,
            null!,
            null!,
            null!
        )
        runtime.onModuleInit()
        await adapters.reconcile()
        await adapters.reconcile()
        expect(reconcile).toHaveBeenCalledTimes(2)
        expect(reserveDue).toHaveBeenCalledTimes(1)
        release([])
        await new Promise((resolve) => setImmediate(resolve))
        await adapters.reconcile()
        expect(reserveDue).toHaveBeenCalledTimes(2)
        release([])
        runtime.onModuleDestroy()
        expect(dispose).toHaveBeenCalledTimes(1)
        await adapters.reconcile()
        expect(reserveDue).toHaveBeenCalledTimes(2)
    })
})
