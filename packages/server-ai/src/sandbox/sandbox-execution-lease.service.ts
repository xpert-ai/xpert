// Invariants: retention spans graph preparation, model waits and stream teardown.
// Cancellation releases retention even before an execution stream is subscribed.
// Each invocation releases only its own activity; container pointers may change.
// Heartbeats are bounded leases so process loss cannot retain a container forever.
import { TSandboxConfigurable } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { RedisEphemeralService } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { finalize, Observable } from 'rxjs'

const EXECUTION_LEASE_MS = 120_000
const EXECUTION_HEARTBEAT_MS = 30_000

export type RetainExecutionSandbox = (sandbox: TSandboxConfigurable | null) => Promise<void>

@Injectable()
export class SandboxExecutionLeaseService {
    private readonly logger = new Logger(SandboxExecutionLeaseService.name)

    constructor(private readonly ephemeral: RedisEphemeralService) {}

    async run<T>(
        prepare: (retain: RetainExecutionSandbox) => Promise<Observable<T>>,
        signal?: AbortSignal
    ): Promise<Observable<T>> {
        const releases: Array<() => Promise<void>> = []
        let releasing: Promise<void> | null = null
        const release = () => {
            if (!releasing) {
                signal?.removeEventListener('abort', onAbort)
                releasing = Promise.all(releases.splice(0).map((releaseLease) => releaseLease())).then(() => undefined)
            }
            return releasing
        }
        const onAbort = () => {
            void release()
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        try {
            signal?.throwIfAborted()
            const stream = await prepare(async (sandbox) => {
                signal?.throwIfAborted()
                if (sandbox?.provider !== 'docker-sandbox') return
                const containerId = sandbox.containerId?.trim()
                if (!containerId) {
                    throw new Error(
                        t('server-ai:Error.AssistantSandboxUnavailable', {
                            defaultValue: 'No sandbox environment is available. Ask an administrator to configure one.'
                        })
                    )
                }
                const releaseLease = await this.retainContainer(containerId)
                if (releasing) {
                    await releaseLease()
                    signal?.throwIfAborted()
                } else {
                    releases.push(releaseLease)
                }
            })
            signal?.throwIfAborted()
            return stream.pipe(
                finalize(() => {
                    void release()
                })
            )
        } catch (error) {
            await release()
            throw error
        }
    }

    private async retainContainer(containerId: string): Promise<() => Promise<void>> {
        const resource = `sandbox:${containerId}`
        const owner = randomUUID()
        await this.ephemeral.touchActivity(resource, owner, EXECUTION_LEASE_MS)
        let released = false
        let renewing: Promise<void> | null = null
        const heartbeat = setInterval(() => {
            if (released || renewing) return
            renewing = this.ephemeral
                .touchActivity(resource, owner, EXECUTION_LEASE_MS)
                .catch((error) => this.logger.warn(`Unable to renew execution sandbox lease ${containerId}: ${error}`))
                .finally(() => {
                    renewing = null
                })
        }, EXECUTION_HEARTBEAT_MS)
        heartbeat.unref()

        return async () => {
            if (released) return
            released = true
            clearInterval(heartbeat)
            // A late heartbeat must finish before removing this owner's activity.
            await renewing
            try {
                await this.ephemeral.releaseActivity(resource, owner)
            } catch (error) {
                this.logger.warn(`Unable to release execution sandbox lease ${containerId}: ${error}`)
            }
        }
    }
}
