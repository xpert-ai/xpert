import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    type ManagedQueueRedis,
    type ManagedQueueService,
    type SandboxRuntimeDefinition
} from '@xpert-ai/plugin-sdk'
import {
    SandboxRuntimeBindingSelector,
    type SandboxRuntimeSelectionHealth
} from './sandbox-runtime-binding-selector.service'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'

const HEARTBEAT_INTERVAL_MS = 15_000
const HEARTBEAT_TTL_MS = 45_000
const HEALTH_KEY_PREFIX = 'sandbox_runtime:{health}'
const READ_HASH_SCRIPT = `return redis.call('HGETALL', KEYS[1])`
const WRITE_HASH_SCRIPT = `redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]); redis.call('PEXPIRE', KEYS[1], ARGV[3]); return 1`
const DELETE_HASH_FIELD_SCRIPT = `redis.call('HDEL', KEYS[1], ARGV[1]); return 1`

/** One Worker-specific Runtime readiness heartbeat stored in Redis. */
export type SandboxRuntimeHealthRecord = {
    workerId: string
    runtimeProfile: string
    sandboxRuntimeVersion: string
    available: boolean
    reason?: 'RUNTIME_UNBOUND' | 'PROVIDER_UNAVAILABLE' | 'PROFILE_UNHEALTHY'
    message?: string
    provider?: string
    runtimeBindingId?: string
    artifactDigest?: string
    manifest?: Record<string, string>
    checkedAt: number
    expiresAt: number
}

/**
 * Bridges process isolation for Runtime health: Workers probe local Providers
 * and publish short-lived records, while API processes only read those records.
 */
@Injectable()
export class SandboxRuntimeHealthService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SandboxRuntimeHealthService.name)
    private readonly workerId = `${os.hostname()}:${process.pid}:${randomUUID()}`
    private readonly publishesHealth = shouldPublishRuntimeHealth()
    private heartbeatTimer?: ReturnType<typeof setInterval>

    constructor(
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly queue: ManagedQueueService,
        private readonly definitions: SandboxRuntimeDefinitionRegistry,
        private readonly selector: SandboxRuntimeBindingSelector
    ) {}

    onModuleInit(): void {
        if (!this.publishesHealth) return
        void this.refreshAll()
        this.heartbeatTimer = setInterval(() => void this.refreshAll(), HEARTBEAT_INTERVAL_MS)
        this.heartbeatTimer.unref()
    }

    async onModuleDestroy(): Promise<void> {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        if (!this.publishesHealth) return
        const redis = await this.queue.getRedis().catch(() => null)
        if (!redis) return
        await Promise.all(
            this.definitions
                .list()
                .map((definition) =>
                    redis
                        .eval(DELETE_HASH_FIELD_SCRIPT, 1, healthKey(definition.name), this.workerId)
                        .catch(() => undefined)
                )
        )
    }

    /**
     * Returns local probe health in a Worker and the freshest live heartbeat in
     * an API process. Absence is reported as PROVIDER_UNAVAILABLE, not a probe.
     */
    async getProfileHealth(definition: SandboxRuntimeDefinition): Promise<SandboxRuntimeHealthRecord> {
        if (this.publishesHealth) {
            const record = await this.probe(definition)
            await this.publish(record).catch((error) => {
                this.logger.warn(`Failed to publish Sandbox Runtime health: ${messageOf(error)}`)
            })
            return record
        }
        try {
            const redis = await this.queue.getRedis()
            const records = await readRecords(redis, definition.name)
            const live = records
                .filter((record) => record.expiresAt > Date.now())
                .sort(
                    (left, right) =>
                        Number(right.available) - Number(left.available) || right.checkedAt - left.checkedAt
                )
            return live[0] ?? unavailableWorkerRecord(definition, this.workerId)
        } catch (error) {
            return {
                ...unavailableWorkerRecord(definition, this.workerId),
                message: `Unable to read Sandbox Runtime worker health: ${messageOf(error)}`
            }
        }
    }

    private async refreshAll(): Promise<void> {
        for (const definition of this.definitions.list()) {
            try {
                await this.publish(await this.probe(definition))
            } catch (error) {
                this.logger.warn(`Sandbox Runtime health heartbeat failed for ${definition.name}: ${messageOf(error)}`)
            }
        }
    }

    private async probe(definition: SandboxRuntimeDefinition): Promise<SandboxRuntimeHealthRecord> {
        const health = await this.selector.inspect(definition)
        return recordFromSelection(this.workerId, definition, health)
    }

    private async publish(record: SandboxRuntimeHealthRecord): Promise<void> {
        const redis = await this.queue.getRedis()
        await redis.eval(
            WRITE_HASH_SCRIPT,
            1,
            healthKey(record.runtimeProfile),
            this.workerId,
            JSON.stringify(record),
            HEARTBEAT_TTL_MS * 2
        )
    }
}

function recordFromSelection(
    workerId: string,
    definition: SandboxRuntimeDefinition,
    health: SandboxRuntimeSelectionHealth
): SandboxRuntimeHealthRecord {
    const checkedAt = Date.now()
    const resolution = health.resolution
    return {
        workerId,
        runtimeProfile: definition.name,
        sandboxRuntimeVersion: definition.sandboxRuntimeVersion,
        available: Boolean(resolution),
        ...(!resolution && health.reason ? { reason: health.reason } : {}),
        ...(health.message ? { message: health.message } : {}),
        ...(resolution
            ? {
                  provider: resolution.provider.type,
                  runtimeBindingId: resolution.binding.id,
                  ...(artifactDigest(resolution.binding.artifact.reference, resolution.binding.artifact.digest)
                      ? {
                            artifactDigest: artifactDigest(
                                resolution.binding.artifact.reference,
                                resolution.binding.artifact.digest
                            )
                        }
                      : {}),
                  ...(resolution.manifest ? { manifest: resolution.manifest } : {})
              }
            : {}),
        checkedAt,
        expiresAt: checkedAt + HEARTBEAT_TTL_MS
    }
}

async function readRecords(redis: ManagedQueueRedis, runtimeProfile: string): Promise<SandboxRuntimeHealthRecord[]> {
    const raw = await redis.eval(READ_HASH_SCRIPT, 1, healthKey(runtimeProfile))
    if (!Array.isArray(raw)) return []
    const records: SandboxRuntimeHealthRecord[] = []
    for (let index = 1; index < raw.length; index += 2) {
        if (typeof raw[index] !== 'string') continue
        const parsed = parseHealthRecord(raw[index])
        if (parsed) records.push(parsed)
    }
    return records
}

function parseHealthRecord(value: string): SandboxRuntimeHealthRecord | null {
    try {
        const parsed: unknown = JSON.parse(value)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
        const record = Object.fromEntries(Object.entries(parsed))
        if (
            typeof record.workerId !== 'string' ||
            typeof record.runtimeProfile !== 'string' ||
            typeof record.sandboxRuntimeVersion !== 'string' ||
            typeof record.available !== 'boolean' ||
            typeof record.checkedAt !== 'number' ||
            typeof record.expiresAt !== 'number'
        )
            return null
        return parsed as SandboxRuntimeHealthRecord
    } catch {
        return null
    }
}

function unavailableWorkerRecord(definition: SandboxRuntimeDefinition, workerId: string): SandboxRuntimeHealthRecord {
    const checkedAt = Date.now()
    return {
        workerId,
        runtimeProfile: definition.name,
        sandboxRuntimeVersion: definition.sandboxRuntimeVersion,
        available: false,
        reason: 'PROVIDER_UNAVAILABLE',
        message: `No active sandbox-browser worker has published health for ${definition.name}.`,
        checkedAt,
        expiresAt: checkedAt
    }
}

function shouldPublishRuntimeHealth(): boolean {
    return process.env.XPERT_PROCESS_ROLE === 'sandbox-browser-worker'
}

function healthKey(runtimeProfile: string): string {
    return `${HEALTH_KEY_PREFIX}:${runtimeProfile}`
}

function artifactDigest(reference: string, configured?: string): string | undefined {
    if (configured) return configured
    return reference.match(/@(sha256:[a-f0-9]{64})$/i)?.[1]?.toLowerCase()
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
