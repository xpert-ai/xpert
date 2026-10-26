// Capacity is an execution ledger, not an expiring lease. Only verified settlement releases it.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SandboxJobRuntimeError } from '@xpert-ai/plugin-sdk'
import { getConfig } from '@xpert-ai/server-config'
import { t } from 'i18next'
import { SandboxJobEntity } from './sandbox-job.entity'
import { readControlledSandboxJob } from './sandbox-job-control-record'

@Injectable()
export class SandboxJobCapacityService {
    constructor(@InjectRepository(SandboxJobEntity) private readonly jobs: Repository<SandboxJobEntity>) {}

    async acquire(job: SandboxJobEntity): Promise<void> {
        const limits = getConfig().sandboxJobOptions ?? { globalLimit: 20, tenantLimit: 4, userLimit: 2 }
        await this.jobs.manager.transaction(async (tx) => {
            await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('sandbox-job-capacity-v1', 0))")
            const current = readControlledSandboxJob(
                await tx.findOneOrFail(SandboxJobEntity, {
                    where: { id: job.id, generation: job.generation },
                    lock: { mode: 'pessimistic_write' }
                })
            )
            if (current.control.phase !== 'reserved') throw new Error('Sandbox capacity admission closed')
            if (current.capacityHeld) return
            const global = await tx.countBy(SandboxJobEntity, { capacityHeld: true })
            const tenant = await tx.countBy(SandboxJobEntity, { capacityHeld: true, tenantId: job.tenantId })
            const user = job.userId
                ? await tx.countBy(SandboxJobEntity, { capacityHeld: true, tenantId: job.tenantId, userId: job.userId })
                : 0
            if (
                global >= limits.globalLimit ||
                tenant >= limits.tenantLimit ||
                (job.userId && user >= limits.userLimit)
            ) {
                throw new SandboxJobRuntimeError(
                    'SANDBOX_CAPACITY_UNAVAILABLE',
                    t('server-ai:Error.SandboxCapacityUnavailable'),
                    true,
                    job.id
                )
            }
            current.capacityHeld = true
            await tx.save(current)
        })
    }
}
