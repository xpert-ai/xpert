jest.mock('./collaboration.service', () => ({ CollaborationService: class {} }))
import { CollaborationMaintenance } from './collaboration-maintenance.service'

describe('CollaborationMaintenance', () => {
    it('scans bounded stale active checkpoints and continues after a provider failure', async () => {
        const documents = { find: jest.fn().mockResolvedValue([{ id: 'unavailable' }, { id: 'recoverable' }]) }
        const collaboration = {
            retryMaterialization: jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined)
        }
        const service = new CollaborationMaintenance(documents as never, collaboration as never)
        await service.repair()
        const query = documents.find.mock.calls[0][0]
        expect(query).toMatchObject({
            where: { status: 'active' },
            take: 20,
            select: { id: true },
            order: { updatedAt: 'ASC', id: 'ASC' }
        })
        expect(query.where.materializationStatus.value).toEqual(['pending', 'failed'])
        expect(query.where.updatedAt.value.getTime()).toBeLessThanOrEqual(Date.now() - 30_000)
        expect(collaboration.retryMaterialization.mock.calls).toEqual([['unavailable'], ['recoverable']])
    })

    it('does not overlap scans and resumes after a failed scan', async () => {
        let release: () => void = () => undefined
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const documents = {
            find: jest
                .fn()
                .mockImplementationOnce(async () => {
                    await pending
                    throw new Error('offline')
                })
                .mockResolvedValue([])
        }
        const service = new CollaborationMaintenance(documents as never, {} as never)
        const first = service.repair()
        await service.repair()
        expect(documents.find).toHaveBeenCalledTimes(1)
        release()
        await first
        await service.repair()
        expect(documents.find).toHaveBeenCalledTimes(2)
    })

    it('starts and stops the recovery timer with the module', async () => {
        jest.useFakeTimers()
        try {
            const documents = { find: jest.fn().mockResolvedValue([]) }
            const service = new CollaborationMaintenance(documents as never, {} as never)
            service.onModuleInit()
            await jest.advanceTimersByTimeAsync(30_000)
            expect(documents.find).toHaveBeenCalledTimes(1)
            service.onModuleDestroy()
            await jest.advanceTimersByTimeAsync(60_000)
            expect(documents.find).toHaveBeenCalledTimes(1)
        } finally {
            jest.useRealTimers()
        }
    })
})
