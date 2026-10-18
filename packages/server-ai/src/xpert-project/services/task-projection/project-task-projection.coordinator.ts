// Invariants: Managed Queue owns delivery/retry; Redis only coalesces scoped refreshes and fences writes.
// UUID revisions avoid ABA after expiry. Completed markers never suppress a newer refresh.
import { Inject, Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { z } from 'zod'
import type { ProjectTaskGraph } from '@xpert-ai/contracts'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService, type ProjectTaskContext } from '@xpert-ai/plugin-sdk'
import { MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX, RedisLockService } from '@xpert-ai/server-core'

const RETENTION_SECONDS = 7 * 24 * 60 * 60
const LEASE_MS = 120_000
const diagnosticsSchema = z.array(z.object({ providerKey: z.string(), message: z.string() }))

export class ProjectionRetryError extends Error {
    constructor() {
        super(t('server-ai:Error.ProjectTaskProjectionRetry'))
    }
}

export async function boundedProjection<T>(operation: Promise<T>, milliseconds = 30_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(t('server-ai:Error.ProjectTaskProjectionTimeout'))),
                    milliseconds
                )
            })
        ])
    } finally {
        clearTimeout(timer)
    }
}

export interface ProjectionClaim {
    context: ProjectTaskContext
    revision: string
    token: string
}

@Injectable()
export class ProjectTaskProjectionCoordinator {
    constructor(
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService,
        private readonly locks: RedisLockService
    ) {}

    private key(context: ProjectTaskContext) {
        const scope = [context.actor.tenantId, context.actor.organizationId ?? null, context.projectId]
        return `${MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX}:project-tasks:${createHash('sha256').update(JSON.stringify(scope)).digest('hex')}`
    }

    private redis() {
        return boundedProjection(this.queue.getRedis(), 2_000)
    }

    async invalidate(context: ProjectTaskContext) {
        const revision = randomUUID()
        const redis = await this.redis()
        await boundedProjection(redis.set(`${this.key(context)}:requested`, revision, 'EX', RETENTION_SECONDS), 2_000)
        return revision
    }

    async claim(context: ProjectTaskContext, requestRevision: string): Promise<ProjectionClaim | null> {
        const key = this.key(context)
        const redis = await this.redis()
        // A retained job can outlive the coalescing cache. Rebuild from current domain state.
        await boundedProjection(redis.set(`${key}:requested`, requestRevision, 'EX', RETENTION_SECONDS, 'NX'), 2_000)
        const token = await boundedProjection(this.locks.acquireLock(`${key}:lock`, LEASE_MS), 2_000)
        if (!token) throw new ProjectionRetryError()
        try {
            const revision = await boundedProjection(redis.get(`${key}:requested`), 2_000)
            if (!revision) throw new ProjectionRetryError()
            if ((await boundedProjection(redis.get(`${key}:completed`), 2_000)) === revision) {
                await boundedProjection(this.locks.releaseLock(`${key}:lock`, token), 2_000)
                return null
            }
            return { context, revision, token }
        } catch (error) {
            await boundedProjection(this.locks.releaseLock(`${key}:lock`, token), 2_000).catch(() => undefined)
            throw error
        }
    }

    async assertCurrent(claim: ProjectionClaim) {
        const key = this.key(claim.context)
        const redis = await this.redis()
        const owned = await boundedProjection(this.locks.refreshLock(`${key}:lock`, claim.token, LEASE_MS), 2_000)
        if (!owned || (await boundedProjection(redis.get(`${key}:requested`), 2_000)) !== claim.revision) {
            throw new ProjectionRetryError()
        }
    }

    async finish(claim: ProjectionClaim, diagnostics: ProjectTaskGraph['diagnostics']) {
        const key = this.key(claim.context)
        const redis = await this.redis()
        // Check ownership and revision atomically: an old worker cannot clear a successor's error or completion.
        const finished = await boundedProjection(
            redis.eval(
                `
            if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
            redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[4])
            if ARGV[3] == '[]' then redis.call('SET', KEYS[4], ARGV[2], 'EX', ARGV[4]) end
            return 1
        `,
                4,
                `${key}:lock`,
                `${key}:requested`,
                `${key}:diagnostics`,
                `${key}:completed`,
                claim.token,
                claim.revision,
                JSON.stringify(diagnostics),
                RETENTION_SECONDS
            ),
            2_000
        )
        if (finished !== 1) throw new ProjectionRetryError()
    }

    async release(claim: ProjectionClaim) {
        await boundedProjection(this.locks.releaseLock(`${this.key(claim.context)}:lock`, claim.token), 2_000)
    }

    async diagnostics(context: ProjectTaskContext): Promise<ProjectTaskGraph['diagnostics']> {
        try {
            const redis = await this.redis()
            const value = await boundedProjection(redis.get(`${this.key(context)}:diagnostics`), 2_000)
            return value
                ? diagnosticsSchema
                      .parse(JSON.parse(value))
                      .map(({ providerKey, message }) => ({ providerKey, message }))
                : []
        } catch {
            // A queue outage must not hide the saved graph or trigger synchronization on read.
            return [
                {
                    providerKey: 'platform.project.tasks',
                    message: t('server-ai:Error.ProjectTaskProjectionUnavailable')
                }
            ]
        }
    }
}
