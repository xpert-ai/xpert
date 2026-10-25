// Control is durable and repeatable; business input is never replayed by this reconciler.
// Runtime exit and actual host/callback completion must both precede capacity release.
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { sandboxRuntimeEvidenceSchema, sandboxRuntimeTargetSchema, sandboxTargetsEqual } from '@xpert-ai/contracts'
import {
    SandboxRuntimeProviderRegistry,
    type SandboxRuntimeDestroyOptions,
    type SandboxJobOutput,
    type SandboxJobErrorCode,
    SandboxJobRuntimeError
} from '@xpert-ai/plugin-sdk'
import { TaskControlRunner, TaskControlStore, withTaskControl } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { SandboxJobControlStore } from './sandbox-job-control.store'
import { readControlledSandboxJob } from './sandbox-job-control-record'
import { SandboxJobEntity } from './sandbox-job.entity'
import type { SandboxRuntimeResolution } from './sandbox-runtime-binding-selector.service'

@Injectable()
export class SandboxJobControlService {
    private readonly active = new Map<string, { generation: string; stop: () => void }>()
    private readonly exitedHosts = new Map<string, SandboxJobEntity>()
    private readonly reports = new Map<
        string,
        {
            job: SandboxJobEntity
            outcome: 'succeeded' | 'failed' | 'cancelled'
            data: { outputs?: SandboxJobOutput[]; errorCode?: SandboxJobErrorCode; errorMessage?: string }
        }
    >()
    private readonly stops = new Map<string, { job: SandboxJobEntity; deadline: boolean }>()
    private polling = false
    private readonly logger = new Logger(SandboxJobControlService.name)
    constructor(
        private readonly store: SandboxJobControlStore,
        private readonly providers: SandboxRuntimeProviderRegistry,
        private readonly runner: TaskControlRunner,
        @Inject(VOLUME_CLIENT) private readonly volumes: VolumeClient,
        private readonly tasks: TaskControlStore
    ) {}

    async prepare(job: SandboxJobEntity, resolution: SandboxRuntimeResolution) {
        const provider = resolution.provider
        if (provider.capabilities.executionControl !== 1 || !provider.prepareControl || !provider.control)
            throw new SandboxJobRuntimeError(
                'SANDBOX_START_FAILED',
                t('server-ai:Error.SandboxControlUnconfirmed'),
                false,
                job.id
            )
        const target = sandboxRuntimeTargetSchema.parse(
            await provider.prepareControl({ ...this.destroyOptions(job), generation: job.generation })
        )
        if (
            target.provider !== job.provider ||
            target.generation !== job.generation ||
            target.runtimeProfile !== job.runtimeProfile
        )
            throw new Error('Sandbox target mismatch')
        return this.store.admitCreate(job, target)
    }

    desired(job: SandboxJobEntity) {
        return this.tasks.desired(job.control.taskId)
    }

    own(job: SandboxJobEntity, stop: () => void) {
        this.active.set(job.id, { generation: job.generation, stop })
    }

    async requestStop(job: SandboxJobEntity, deadline = false) {
        if (!job.control) {
            // Old rows have no trustworthy admission/exit record; do not manufacture a terminal receipt.
            if (['succeeded', 'failed', 'cancelled'].includes(job.status) && !job.cleanupPending) return
            await this.store.jobs.update({ id: job.id }, { status: 'unknown', finishedAt: null, capacityHeld: true })
            return
        }
        if (job.control.phase === 'settled') return
        this.stops.set(job.id, { job, deadline })
        await this.tasks.change(job.control.taskId, 'terminated')
        await this.store.update(job.id, job.generation, (current) => {
            if (current.control.phase === 'settled') return
            current.status = 'cancelling'
            current.errorCode = deadline ? 'EXPORT_TIMEOUT' : 'SANDBOX_CANCELLED'
            current.errorMessage = deadline
                ? t('server-ai:Error.SandboxInvocationTimeout')
                : t('server-ai:Error.SandboxJobCancelled')
            current.nextControlAt = new Date()
        })
        this.stops.delete(job.id)
        const owned = this.active.get(job.id)
        if (owned?.generation === job.generation) owned.stop()
    }

    async report(
        job: SandboxJobEntity,
        outcome: 'succeeded' | 'failed' | 'cancelled',
        data: { outputs?: SandboxJobOutput[]; errorCode?: SandboxJobErrorCode; errorMessage?: string } = {}
    ) {
        if (!this.reports.has(job.id)) this.reports.set(job.id, { job, outcome, data })
        return this.flushReport(job.id)
    }

    private async flushReport(id: string) {
        const pending = this.reports.get(id)
        if (!pending) return
        const { job, outcome, data } = pending
        const result = await this.store.update(job.id, job.generation, (current) => {
            if (current.control.reportedOutcome || current.control.phase === 'settled') return
            current.control.reportedOutcome = outcome
            current.status = outcome === 'cancelled' ? 'cancelling' : 'settling'
            current.outputs = data.outputs ?? []
            if (!current.errorCode || current.errorCode === 'SANDBOX_CAPACITY_UNAVAILABLE') {
                current.errorCode = data.errorCode ?? null
                current.errorMessage = data.errorMessage ?? null
            }
            current.nextControlAt = new Date()
        })
        this.reports.delete(id)
        return result
    }

    async hostExited(job: SandboxJobEntity) {
        // Retain the receipt on this original host across transient database failures.
        this.exitedHosts.set(job.id, job)
        await this.flushHostExit(job)
        await this.reconcileOne(job.id)
    }

    private async flushHostExit(job: SandboxJobEntity) {
        await this.flushReport(job.id)
        await this.store.update(job.id, job.generation, (current) => {
            if (current.control.hostId !== this.store.hostId) throw new Error('Sandbox host changed')
            current.control.hostExited = true
            current.nextControlAt = new Date()
        })
        this.exitedHosts.delete(job.id)
    }

    async callback<T>(job: SandboxJobEntity, requestId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
        const task = await this.tasks.register({
            tenantId: job.tenantId,
            organizationId: job.organizationId,
            kind: 'sandbox-callback',
            resourceId: `${job.generation}:${requestId}`,
            parent: { version: 2, targetId: job.control.taskId },
            policy: 'attached',
            drainOnPause: true
        })
        return this.runner.run({ version: 2, targetId: task.id }, (control) => work(control.signal))
    }

    inContext<T>(job: SandboxJobEntity, work: () => T): T {
        return withTaskControl({ version: 2, targetId: job.control.taskId }, work)
    }

    @Interval(1000)
    async reconcile() {
        if (this.polling) return
        this.polling = true
        try {
            for (const { job, deadline } of this.stops.values()) {
                try {
                    await this.requestStop(job, deadline)
                } catch {
                    this.logger.warn('Sandbox stop persistence pending')
                }
            }
            for (const id of this.reports.keys()) {
                try {
                    await this.flushReport(id)
                } catch {
                    this.logger.warn('Sandbox result persistence pending')
                }
            }
            for (const job of this.exitedHosts.values()) {
                try {
                    await this.flushHostExit(job)
                } catch {
                    this.logger.warn('Sandbox host receipt persistence pending')
                }
            }
            // An unavailable replica cannot starve delivery to the original callback/process host.
            for (const [id, owned] of this.active) {
                try {
                    const job = await this.store.read(id)
                    if (job?.generation === owned.generation) {
                        if ((await this.tasks.desired(job.control.taskId)) === 'terminated') owned.stop()
                        if (!job.nextControlAt || job.nextControlAt.getTime() <= Date.now()) await this.reconcileOne(id)
                    }
                } catch {
                    this.logger.warn('Sandbox host control remains pending')
                }
            }
            for (const row of await this.store.due()) {
                try {
                    const job = readControlledSandboxJob(row)
                    if (!job.control) continue
                    const token = await this.tasks.delivery(job.control.taskId)
                    if (!token) continue
                    try {
                        await this.reconcileOne(job.id)
                    } finally {
                        await this.tasks.delivered(job.control.taskId, token, null, 1000)
                    }
                } catch {
                    // A malformed old record must not prevent delivery to unrelated executions.
                    this.logger.warn('Sandbox execution remains unconfirmed')
                }
            }
        } finally {
            this.polling = false
        }
    }

    async reconcileOne(id: string) {
        let job = await this.store.read(id)
        if (!job?.control) return
        try {
            let desired = await this.tasks.desired(job.control.taskId)
            if (job.control.phase !== 'settled' && job.hardDeadlineAt && job.hardDeadlineAt.getTime() < Date.now()) {
                await this.requestStop(job, true)
                desired = 'terminated'
            }
            const owned = this.active.get(id)
            if (desired === 'terminated' && owned?.generation === job.generation) owned.stop()
            const target = job.control.target
            if (
                job.control.phase !== 'settled' &&
                target &&
                !['exited', 'not_started'].includes(job.control.evidence?.state)
            ) {
                const provider = this.providers.get(job.provider)
                if (
                    provider.version !== job.control.providerVersion ||
                    provider.capabilities.executionControl !== 1 ||
                    !provider.control
                )
                    throw new Error('Sandbox control provider changed')
                const evidence = sandboxRuntimeEvidenceSchema.parse(
                    await boundedControl(
                        provider.control(
                            target,
                            desired === 'terminated' || job.control.reportedOutcome ? 'stop' : 'inspect'
                        )
                    )
                )
                if (!sandboxTargetsEqual(target, evidence.target)) throw new Error('Sandbox receipt target mismatch')
                job = await this.store.update(id, job.generation, (current) => {
                    // Absence during create is not proof: its network request might still be in flight.
                    if (
                        !['exited', 'not_started'].includes(current.control.evidence?.state) &&
                        (evidence.state !== 'not_started' || current.control.hostExited)
                    )
                        current.control.evidence = evidence
                })
            }
            job = await this.store.finalize(job)
            if (job.control.phase === 'settled') {
                await boundedControl(this.cleanup(job))
                this.active.delete(id)
            }
            await this.store.update(id, job.generation, (current) => {
                current.control.controlFailures = 0
            })
        } catch (error) {
            await this.store.update(id, job.generation, (current) => {
                current.control.controlFailures = (current.control.controlFailures ?? 0) + 1
            })
            throw error
        } finally {
            await this.store.update(id, job.generation, (current) => {
                current.nextControlAt =
                    current.control.phase === 'settled' && !current.cleanupPending
                        ? null
                        : new Date(
                              Date.now() +
                                  Math.min(30000, 1000 * 2 ** Math.min(current.control.controlFailures ?? 0, 5))
                          )
            })
        }
    }

    private async cleanup(job: SandboxJobEntity) {
        if (!job.cleanupPending) return
        const provider = this.providers.get(job.provider)
        if (provider.version !== job.control.providerVersion) throw new Error('Sandbox cleanup provider changed')
        // The exact target is supplied even after reload; never sweep a whole shared job/environment.
        if (job.control.target) await provider.destroy(this.destroyOptions(job))
        else if (job.runtimeRef) return
        await this.volumes
            .resolve({ tenantId: job.tenantId, catalog: 'runtime-jobs', jobId: job.id })
            .destroyRuntimeJob()
        await this.store.update(job.id, job.generation, (current) => {
            current.cleanupPending = false
            current.cleanedAt = new Date()
        })
    }

    destroyOptions(job: SandboxJobEntity): SandboxRuntimeDestroyOptions {
        return {
            tenantId: job.tenantId,
            workFor: { type: 'job', id: job.id },
            runtimeProfile: job.runtimeProfile,
            runtimeBindingId: job.runtimeBindingId,
            artifact: {
                kind: job.runtimeArtifactKind,
                reference: job.runtimeArtifactReference,
                ...(job.runtimeArtifactDigest ? { digest: job.runtimeArtifactDigest } : {})
            },
            runtimeRef: job.runtimeRef,
            ...(job.control?.target ? { controlTarget: job.control.target } : {})
        }
    }
}

async function boundedControl<T>(work: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout>
    try {
        return await Promise.race([
            work,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Sandbox control timeout')), 10000)
                timeout.unref()
            })
        ])
    } finally {
        clearTimeout(timeout)
    }
}
