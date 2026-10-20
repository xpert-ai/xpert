import { Inject, Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { z } from 'zod/v3'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    PluginJobProcessor,
    type ManagedQueueJob,
    type ManagedQueueJobContext,
    type ManagedQueueService,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { ProjectPipelineOperationStore } from './pipeline-operation.store'
import { ProjectPipelineOperationRunnerService } from './pipeline-operation-runner.service'

export const PIPELINE_OPERATION_JOB = {
    pluginName: '@xpert-ai/platform',
    queueName: 'project-pipeline-operation',
    jobName: 'observe'
}
const payloadSchema = z.object({ projectId: z.string().uuid(), operationId: z.string().uuid() }).strict()

/** SQL is the durable outbox; Redis delivery can be reconstructed after an enqueue failure or restart. */
@Injectable()
@PluginJobProcessor({ ...PIPELINE_OPERATION_JOB, concurrency: 4 })
export class ProjectPipelineOperationWorkerService {
    private scanning = false
    private afterId?: string
    private readonly logger = new Logger(ProjectPipelineOperationWorkerService.name)
    constructor(
        private readonly store: ProjectPipelineOperationStore,
        private readonly runner: ProjectPipelineOperationRunnerService,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService
    ) {}

    @Interval(5000)
    async recover() {
        if (this.scanning) return
        this.scanning = true
        try {
            const operations = await this.store.due(40, this.afterId)
            // Failed authorization or preparation must not pin recovery to the first page.
            // Failed deliveries remain in SQL and are retried on the next sweep.
            this.afterId = operations.length === 40 ? operations[operations.length - 1].id : undefined
            const results = await Promise.allSettled(
                operations.map((operation) =>
                    this.queue.enqueue({
                        ...PIPELINE_OPERATION_JOB,
                        ...operation.context.actor,
                        payload: { projectId: operation.projectId, operationId: operation.id },
                        jobId: `pipeline-operation-${operation.id}-${operation.leaseFence}`,
                        attempts: 3,
                        backoffMs: { type: 'fixed', delay: 5000 },
                        removeOnComplete: true,
                        removeOnFail: true
                    })
                )
            )
            if (results.some((result) => result.status === 'rejected'))
                this.logger.warn('Pipeline outbox delivery deferred')
        } catch {
            this.logger.warn('Pipeline outbox scan deferred')
        } finally {
            this.scanning = false
        }
    }

    async handle(job: ManagedQueueJob<unknown>, scope: ManagedQueueJobContext) {
        const input = payloadSchema.parse(job.data)
        if (!scope.tenantId || !scope.userId) throw new Error('PIPELINE_JOB_SCOPE_REQUIRED')
        const context: ProjectPipelineContext = {
            projectId: input.projectId,
            actor: { tenantId: scope.tenantId, organizationId: scope.organizationId ?? null, userId: scope.userId }
        }
        await this.runner.run(context, input.operationId)
    }
}
