import { type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { SandboxJobCapacityService } from './sandbox-job-capacity.service'

describe('SandboxJobCapacityService', () => {
    it('acquires and releases global, tenant, and user leases atomically', async () => {
        const redis = { eval: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1) }
        const queue = { getRedis: jest.fn().mockResolvedValue(redis) } as unknown as ManagedQueueService
        const service = new SandboxJobCapacityService(queue)

        const lease = await service.acquire({
            jobId: 'job-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            durationMs: 360_000
        })
        await service.release(lease)

        expect(lease.keys).toEqual([
            'sandbox_jobs:{capacity}:global',
            'sandbox_jobs:{capacity}:tenant:tenant-1',
            'sandbox_jobs:{capacity}:user:tenant-1:user-1'
        ])
        expect(redis.eval).toHaveBeenCalledTimes(2)
    })

    it('reports exhausted capacity as a retryable runtime condition', async () => {
        const redis = { eval: jest.fn().mockResolvedValue(0) }
        const queue = { getRedis: jest.fn().mockResolvedValue(redis) } as unknown as ManagedQueueService
        const service = new SandboxJobCapacityService(queue)

        await expect(
            service.acquire({
                jobId: 'job-2',
                tenantId: 'tenant-1',
                durationMs: 360_000
            })
        ).rejects.toMatchObject({
            code: 'SANDBOX_CAPACITY_UNAVAILABLE',
            retryable: true,
            jobId: 'job-2'
        })
    })
})
