import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
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
const WRITE_HASH_SCRIPT = `redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]); redis.call('PEXPIRE', KEYS[1], ARGV[3]); return 1`
const DELETE_HASH_FIELD_SCRIPT = `redis.call('HDEL', KEYS[1], ARGV[1]); return 1`

/** One API Runtime executor readiness heartbeat stored in Redis. */
export type SandboxRuntimeHealthRecord = {
    executorId: string
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
 * Probes Providers registered in the API process and publishes short-lived
 * readiness evidence for observability. Job execution always reselects a Binding.
 */
@Injectable()
export class SandboxRuntimeHealthService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SandboxRuntimeHealthService.name)
    private readonly executorId = `${os.hostname()}:${process.pid}:${randomUUID()}`
    private readonly latest = new Map<string, SandboxRuntimeHealthRecord>()
    private heartbeatTimer?: ReturnType<typeof setInterval>

    constructor(
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly queue: ManagedQueueService,
        private readonly definitions: SandboxRuntimeDefinitionRegistry,
        private readonly selector: SandboxRuntimeBindingSelector
    ) {}

    onModuleInit(): void {
        void this.refreshAll()
        this.heartbeatTimer = setInterval(() => void this.refreshAll(), HEARTBEAT_INTERVAL_MS)
        this.heartbeatTimer.unref()
    }

    async onModuleDestroy(): Promise<void> {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        const redis = await this.queue.getRedis().catch(() => null)
        if (!redis) return
        await Promise.all(
            this.definitions
                .list()
                .map((definition) =>
                    redis
                        .eval(DELETE_HASH_FIELD_SCRIPT, 1, healthKey(definition.name), this.executorId)
                        .catch(() => undefined)
                )
        )
    }

    /**
     * Returns a fresh API-local Provider probe, using a short-lived cache to
     * avoid repeatedly inspecting Runtime artifacts from UI health requests.
     */
    async getProfileHealth(definition: SandboxRuntimeDefinition): Promise<SandboxRuntimeHealthRecord> {
        const cached = this.latest.get(definition.name)
        if (cached?.expiresAt > Date.now()) return cached
        const record = await this.probe(definition)
        await this.publish(record).catch((error) => {
            this.logger.warn(`Failed to publish Sandbox Runtime health: ${messageOf(error)}`)
        })
        return record
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
        const record = recordFromSelection(this.executorId, definition, health)
        this.latest.set(definition.name, record)
        return record
    }

    private async publish(record: SandboxRuntimeHealthRecord): Promise<void> {
        const redis = await this.queue.getRedis()
        await redis.eval(
            WRITE_HASH_SCRIPT,
            1,
            healthKey(record.runtimeProfile),
            this.executorId,
            JSON.stringify(record),
            HEARTBEAT_TTL_MS * 2
        )
    }
}

function recordFromSelection(
    executorId: string,
    definition: SandboxRuntimeDefinition,
    health: SandboxRuntimeSelectionHealth
): SandboxRuntimeHealthRecord {
    const checkedAt = Date.now()
    const resolution = health.resolution
    return {
        executorId,
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
