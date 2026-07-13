import { Inject, Injectable } from '@nestjs/common'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    type ManagedQueueRedis,
    type ManagedQueueService,
    SandboxJobRuntimeError
} from '@xpert-ai/plugin-sdk'

const ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local lease = ARGV[3]
local globalLimit = tonumber(ARGV[4])
local tenantLimit = tonumber(ARGV[5])
local userLimit = tonumber(ARGV[6])
for i = 1, #KEYS do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now) end
if redis.call('ZCARD', KEYS[1]) >= globalLimit then return 0 end
if redis.call('ZCARD', KEYS[2]) >= tenantLimit then return 0 end
if #KEYS > 2 and redis.call('ZCARD', KEYS[3]) >= userLimit then return 0 end
for i = 1, #KEYS do
  redis.call('ZADD', KEYS[i], expires, lease)
  redis.call('PEXPIRE', KEYS[i], expires - now + 60000)
end
return 1
`

const RELEASE_SCRIPT = `for i = 1, #KEYS do redis.call('ZREM', KEYS[i], ARGV[1]) end return 1`

/** Redis lease held simultaneously in global, tenant, and optional user quotas. */
export type SandboxJobCapacityLease = {
    id: string
    keys: string[]
}

/** Coordinates expiring cross-Worker capacity limits without creating partial Runtime instances. */
@Injectable()
export class SandboxJobCapacityService {
    constructor(
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly queue: ManagedQueueService
    ) {}

    /** Atomically acquires every applicable quota slot for one Job attempt. */
    async acquire(input: {
        jobId: string
        tenantId: string
        userId?: string | null
        durationMs: number
    }): Promise<SandboxJobCapacityLease> {
        const redis = await this.queue.getRedis()
        const leaseId = `${input.jobId}:${Date.now()}`
        const keys = this.keys(input.tenantId, input.userId)
        const now = Date.now()
        const result = await redis.eval(
            ACQUIRE_SCRIPT,
            keys.length,
            ...keys,
            now,
            now + input.durationMs,
            leaseId,
            positiveInteger(process.env.SANDBOX_JOB_GLOBAL_LIMIT, 20),
            positiveInteger(process.env.SANDBOX_JOB_TENANT_LIMIT, 4),
            positiveInteger(process.env.SANDBOX_JOB_USER_LIMIT, 2)
        )
        if (Number(result) !== 1) {
            throw new SandboxJobRuntimeError(
                'SANDBOX_CAPACITY_UNAVAILABLE',
                'Sandbox browser capacity is currently unavailable.',
                true,
                input.jobId
            )
        }
        return { id: leaseId, keys }
    }

    /** Idempotently removes the lease from each quota bucket. */
    async release(lease: SandboxJobCapacityLease): Promise<void> {
        const redis: ManagedQueueRedis = await this.queue.getRedis()
        await redis.eval(RELEASE_SCRIPT, lease.keys.length, ...lease.keys, lease.id)
    }

    private keys(tenantId: string, userId?: string | null): string[] {
        const prefix = 'sandbox_jobs:{capacity}'
        return [
            `${prefix}:global`,
            `${prefix}:tenant:${tenantId}`,
            ...(userId ? [`${prefix}:user:${tenantId}:${userId}`] : [])
        ]
    }
}

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}
