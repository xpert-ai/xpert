// Invariants: only a unique reservation may launch. Old calls and generations never reopen work.
// Root control locks precede job locks whenever both participate in a transaction.
import { sandboxJobRetryReferenceSchema } from '@xpert-ai/contracts'
import { SandboxJobRuntimeError } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, EntityManager, LessThanOrEqual } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { TaskControlStore, ExecutionTaskControl, TaskControlRejected } from '@xpert-ai/server-core'
import type { SandboxJobRunInput, TaskControlPolicy, SandboxRuntimeTarget } from '@xpert-ai/plugin-sdk'
import { SandboxJobEntity } from './sandbox-job.entity'
import { readControlledSandboxJob } from './sandbox-job-control-record'

@Injectable()
export class SandboxJobControlStore {
    readonly hostId = randomUUID()
    constructor(
        @InjectRepository(SandboxJobEntity) readonly jobs: Repository<SandboxJobEntity>,
        private readonly tasks: TaskControlStore
    ) {}

    async reserve(
        seed: SandboxJobEntity,
        input: SandboxJobRunInput,
        providerVersion: string,
        policy: TaskControlPolicy
    ) {
        const parent = await this.tasks.producer()
        const inputHash = inputDigest(input)
        return this.jobs.manager.transaction(async (tx) => {
            // Advisory key serializes initial insert and idempotent lookups without locking another root.
            await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                JSON.stringify([input.scope.tenantId, input.idempotencyKey])
            ])
            const previous = await tx.findOneBy(SandboxJobEntity, {
                tenantId: input.scope.tenantId,
                idempotencyKey: input.idempotencyKey
            })
            if (previous) {
                this.assertInput(previous, input)
                return { job: readControlledSandboxJob(previous), owner: false }
            }
            if (input.retryOf) {
                const retry = sandboxJobRetryReferenceSchema.parse(input.retryOf)
                const previous = await tx.findOneBy(SandboxJobEntity, {
                    id: retry.jobId,
                    tenantId: input.scope.tenantId
                })
                if (
                    !previous ||
                    previous.generation !== retry.generation ||
                    (previous.organizationId ?? null) !== (seed.organizationId ?? null) ||
                    previous.pluginName !== seed.pluginName ||
                    previous.action !== seed.action ||
                    previous.businessResourceType !== seed.businessResourceType ||
                    previous.businessResourceId !== seed.businessResourceId
                )
                    throw new SandboxJobRuntimeError(
                        'EXPORT_INPUT_INVALID',
                        t('server-ai:Error.SandboxControlUnconfirmed'),
                        false
                    )
                readControlledSandboxJob(previous)
                if (previous.control?.phase !== 'settled' || previous.capacityHeld)
                    throw new SandboxJobRuntimeError(
                        'SANDBOX_CONTROL_UNCONFIRMED',
                        t('server-ai:Error.SandboxControlUnconfirmed'),
                        false,
                        previous.id
                    )
            }
            seed.id ??= randomUUID()
            seed.generation = randomUUID()
            seed.inputHash = inputHash
            const parentTask = parent ? await this.tasks.read(parent.targetId, tx) : null
            const task = await this.tasks.register(
                {
                    tenantId: seed.tenantId,
                    organizationId: seed.organizationId,
                    kind: 'sandbox-job',
                    resourceId: seed.id,
                    parent,
                    policy,
                    drainOnPause: policy === 'attached' && parentTask?.state === 'running'
                },
                tx
            )
            const claim = await this.tasks.claim(task.id, tx)
            seed.control = {
                version: 1,
                hostId: this.hostId,
                taskId: task.id,
                claim,
                providerVersion,
                phase: 'reserved',
                hostExited: false
            }
            seed.capacityHeld = false
            seed.nextControlAt = new Date()
            return { job: await tx.save(seed), owner: true }
        })
    }

    assertInput(job: SandboxJobEntity, input: SandboxJobRunInput) {
        if (job.inputHash && job.inputHash !== inputDigest(input)) throw new Error('Sandbox idempotency input changed')
    }

    async read(id: string) {
        const job = await this.jobs.findOneBy({ id })
        return job ? readControlledSandboxJob(job) : null
    }

    async update(id: string, generation: string, change: (job: SandboxJobEntity) => void) {
        return this.jobs.manager.transaction(async (tx) => {
            const job = await tx.findOne(SandboxJobEntity, {
                where: { id, generation },
                lock: { mode: 'pessimistic_write' }
            })
            if (!job) throw new Error('Sandbox execution generation changed')
            readControlledSandboxJob(job)
            change(job)
            return tx.save(job)
        })
    }

    async admitCreate(job: SandboxJobEntity, target?: SandboxRuntimeTarget) {
        return this.jobs.manager.transaction(async (tx) => {
            await this.lockRoot(tx, job.control.taskId)
            if ((await this.tasks.desired(job.control.taskId, tx)) === 'terminated')
                throw new TaskControlRejected('terminated')
            const current = await tx.findOneOrFail(SandboxJobEntity, {
                where: { id: job.id, generation: job.generation },
                lock: { mode: 'pessimistic_write' }
            })
            readControlledSandboxJob(current)
            if (current.control.phase !== 'reserved' || current.control.hostId !== this.hostId)
                throw new TaskControlRejected('claimed')
            current.control.phase = 'creating'
            current.control.target = target
            current.status = 'starting'
            current.startedAt = new Date()
            return tx.save(current)
        })
    }

    async finalize(job: SandboxJobEntity) {
        return this.jobs.manager.transaction(async (tx) => {
            await this.lockRoot(tx, job.control.taskId)
            const current = await tx.findOneOrFail(SandboxJobEntity, {
                where: { id: job.id, generation: job.generation },
                lock: { mode: 'pessimistic_write' }
            })
            readControlledSandboxJob(current)
            const control = current.control
            if (control.phase === 'settled') return current
            const exited =
                control.phase === 'reserved' ||
                control.evidence?.state === 'exited' ||
                control.evidence?.state === 'not_started'
            if (!control.hostExited || !exited || !(await this.tasks.settled(control.taskId, false, tx))) return current
            control.phase = 'settled'
            current.status =
                (await this.tasks.desired(control.taskId, tx)) === 'terminated'
                    ? 'cancelled'
                    : (control.reportedOutcome ?? 'failed')
            if (current.status === 'cancelled') current.errorCode ??= 'SANDBOX_CANCELLED'
            current.finishedAt = new Date()
            current.capacityHeld = false
            await this.tasks.receipt(control.taskId, 'completed', control.claim, tx)
            return tx.save(current)
        })
    }

    due() {
        return this.jobs.find({
            where: { nextControlAt: LessThanOrEqual(new Date()) },
            order: { nextControlAt: 'ASC', id: 'ASC' },
            take: 50
        })
    }

    private async lockRoot(tx: EntityManager, id: string) {
        const task = await this.tasks.read(id, tx)
        if (!task) throw new TaskControlRejected('missing')
        await tx.findOneOrFail(ExecutionTaskControl, {
            where: { id: task.rootId },
            lock: { mode: 'pessimistic_write' }
        })
    }
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object')
        return `{${Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(',')}}`
    return JSON.stringify(value)
}

function inputDigest(input: SandboxJobRunInput): string {
    // Hash the same JSON representation delivered to the runner, with locale-independent key order.
    return createHash('sha256')
        .update(canonical(JSON.parse(JSON.stringify(input))))
        .digest('hex')
}
