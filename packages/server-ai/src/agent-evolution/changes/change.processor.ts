import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { EvolutionChangeService, CHANGE_QUEUE } from './change.service'
import { changeError } from './change.errors'

@Injectable()
@PluginJobProcessor({ ...CHANGE_QUEUE, concurrency: 2 })
export class EvolutionChangeProcessor {
    constructor(private readonly changes: EvolutionChangeService) {}
    async handle(job: ManagedQueueJob<{ changeId: string }>, context: ManagedQueueJobContext) {
        if (!context.tenantId || !context.organizationId || typeof job.data?.changeId !== 'string')
            changeError('invalid_job_identity')
        await this.changes.process({
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            changeId: job.data.changeId
        })
    }
}
