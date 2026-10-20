import { Inject, Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { z } from 'zod/v3'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    PluginJobProcessor,
    type ManagedQueueService,
    type ManagedQueueJob,
    type ManagedQueueJobContext
} from '@xpert-ai/plugin-sdk'
import { ProjectPipelineProviderActionStore } from './provider-action.store'
import { ProjectPipelineProviderActionsService } from './provider-actions.service'

export const PIPELINE_PROVIDER_ACTION_JOB = {
    pluginName: '@xpert-ai/platform',
    queueName: 'project-pipeline-provider-action',
    jobName: 'observe'
}
const payload = z.object({ projectId: z.string().uuid(), operationId: z.string().uuid() }).strict()

@Injectable()
@PluginJobProcessor({ ...PIPELINE_PROVIDER_ACTION_JOB, concurrency: 4 })
export class ProjectPipelineProviderActionWorkerService {
    private scanning = false
    private afterId?: string
    private readonly logger = new Logger(ProjectPipelineProviderActionWorkerService.name)
    constructor(
        private readonly store: ProjectPipelineProviderActionStore,
        private readonly actions: ProjectPipelineProviderActionsService,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService
    ) {}

    @Interval(5000)
    async recover() {
        if (this.scanning) return
        this.scanning = true
        try {
            const rows = await this.store.due(this.afterId)
            // A page containing revoked actors must not starve other pending operations.
            this.afterId = rows.length === 40 ? rows[rows.length - 1].id : undefined
            const results = await Promise.allSettled(
                rows.map((row) =>
                    this.queue.enqueue({
                        ...PIPELINE_PROVIDER_ACTION_JOB,
                        tenantId: row.tenantId,
                        organizationId: row.organizationId,
                        userId: row.createdById,
                        payload: { projectId: row.projectId, operationId: row.id },
                        jobId: `pipeline-provider-action-${row.id}-${row.leaseFence}`,
                        attempts: 3,
                        backoffMs: { type: 'fixed', delay: 5000 },
                        removeOnComplete: true,
                        removeOnFail: true
                    })
                )
            )
            if (results.some((result) => result.status === 'rejected'))
                this.logger.warn('Pipeline provider action delivery deferred')
        } catch {
            this.logger.warn('Pipeline provider action recovery deferred')
        } finally {
            this.scanning = false
        }
    }
    async handle(job: ManagedQueueJob<unknown>, context: ManagedQueueJobContext) {
        const input = payload.parse(job.data)
        if (!context.tenantId || !context.userId) throw new Error('PIPELINE_JOB_SCOPE_REQUIRED')
        await this.actions.run(
            {
                projectId: input.projectId,
                actor: {
                    tenantId: context.tenantId,
                    organizationId: context.organizationId ?? null,
                    userId: context.userId
                }
            },
            input.operationId
        )
    }
}
