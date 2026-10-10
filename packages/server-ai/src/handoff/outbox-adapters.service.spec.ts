import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { HandoffOutboxAdapters } from './outbox-adapters.service'
import { HandoffQueueService } from './message-queue.service'
import { RuntimeMessageTransportService } from './runtime-messaging/runtime-message-transport.service'
import { RuntimeMessageAccessService } from './runtime-messaging/runtime-message-access.service'

describe('shared Handoff outbox recovery', () => {
    it('isolates synchronous and asynchronous failures and honors adapter disposal', async () => {
        const adapters = new HandoffOutboxAdapters()
        const healthy = { reconcile: jest.fn().mockResolvedValue(undefined) }
        adapters.register({
            reconcile: () => {
                throw new Error('sync failure')
            }
        })
        adapters.register({
            reconcile: async () => {
                throw new Error('async failure')
            }
        })
        const dispose = adapters.register(healthy)
        await expect(adapters.reconcile()).resolves.toBeUndefined()
        expect(healthy.reconcile).toHaveBeenCalledTimes(1)
        dispose()
        await adapters.reconcile()
        expect(healthy.reconcile).toHaveBeenCalledTimes(1)
    })

    it('uses the existing scan, prevents overlapping scans, and recovers after an adapter error', async () => {
        const adapters = new HandoffOutboxAdapters()
        const find = jest.fn().mockResolvedValue([])
        const module = await Test.createTestingModule({
            providers: [
                RuntimeMessageTransportService,
                { provide: DataSource, useValue: { getRepository: () => ({ find }) } },
                { provide: HandoffQueueService, useValue: {} },
                { provide: RuntimeMessageAccessService, useValue: {} },
                { provide: HandoffOutboxAdapters, useValue: adapters }
            ]
        }).compile()
        const service = module.get(RuntimeMessageTransportService)
        let release!: () => void
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const recover = jest.spyOn(adapters, 'reconcile').mockImplementationOnce(() => pending)
        const first = service.reconcile()
        await Promise.resolve()
        await service.reconcile()
        expect(find).toHaveBeenCalledTimes(1)
        release()
        await first
        recover.mockRejectedValueOnce(new Error('unexpected adapter failure'))
        await expect(service.reconcile()).rejects.toThrow('unexpected adapter failure')
        await expect(service.reconcile()).resolves.toBeUndefined()
        expect(find).toHaveBeenCalledTimes(3)
        expect(recover).toHaveBeenCalledTimes(3)
        await module.close()
    })
})
