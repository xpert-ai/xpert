// Managed Queue provides durable delivery; source epoch/sequence and the database transaction fence commits.
// Callbacks execute outside transactions. A retried linked receipt must not dispatch business work.
import { ForbiddenException, HttpException, Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { projectPipelineProjectionSchema } from '@xpert-ai/contracts'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    PluginJobProcessor,
    ProjectPipelineProjectionProviderRegistry,
    ProjectTaskProviderRegistry,
    type ManagedQueueJob,
    type ManagedQueueJobContext,
    type ManagedQueueService,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { boundedProjection } from '../../services/task-projection/project-task-projection.coordinator'
import { ProjectPipelineProjectionStore } from './pipeline-projection.store'
import { pipelineProjectionConflict } from './pipeline-projection.errors'
import { ProjectPipelineRefreshStore } from './pipeline-refresh.store'
import { pipelineRefreshSchema } from './pipeline-refresh.schema'
import { pipelineHostCapabilities } from '../configuration/pipeline-host-capabilities'
export { pipelineRefreshSchema } from './pipeline-refresh.schema'

export const PIPELINE_PROJECTION_JOB = {
    pluginName: '@xpert-ai/platform',
    queueName: 'project-pipeline-projection',
    jobName: 'refresh'
}
const jobSchema = pipelineRefreshSchema.extend({ projectId: z.string().uuid(), requestId: z.string().uuid() }).strict()

@Injectable()
@PluginJobProcessor({ ...PIPELINE_PROJECTION_JOB, concurrency: 2 })
export class ProjectPipelineProjectionService {
    constructor(
        private readonly store: ProjectPipelineProjectionStore,
        private readonly access: ProjectAccessRuntimeService,
        private readonly providers: ProjectPipelineProjectionProviderRegistry,
        private readonly legacyProviders: ProjectTaskProviderRegistry,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService,
        private readonly refresh: ProjectPipelineRefreshStore
    ) {}

    private async assertRead(context: ProjectPipelineContext) {
        if (!(await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })).length)
            throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
    }

    async request(
        context: ProjectPipelineContext,
        input: z.output<typeof pipelineRefreshSchema>
    ): Promise<{ status: 'queued' }> {
        await this.assertRead(context)
        const requestId = randomUUID()
        await this.refresh.begin(context, input, requestId, 'queued')
        try {
            await boundedProjection(
                this.queue.enqueue({
                    ...PIPELINE_PROJECTION_JOB,
                    ...context.actor,
                    payload: {
                        projectId: context.projectId,
                        providerRef: input.providerRef,
                        sourceKey: input.sourceKey,
                        requestId
                    },
                    jobId: `pipeline-refresh-${requestId}`,
                    attempts: 10,
                    backoffMs: { type: 'fixed', delay: 5_000 },
                    removeOnComplete: true,
                    removeOnFail: { age: 7 * 24 * 3600, count: 5000 }
                }),
                2_000
            )
        } catch (error) {
            await this.refresh.update(context, input, requestId, 'failed', 'REFRESH_ENQUEUE_UNCONFIRMED')
            throw error
        }
        return { status: 'queued' }
    }

    async handle(job: ManagedQueueJob<unknown>, scope: ManagedQueueJobContext) {
        const input = jobSchema.parse(job.data)
        if (!scope.tenantId || !scope.userId) throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        const context: ProjectPipelineContext = {
            projectId: input.projectId,
            actor: { tenantId: scope.tenantId, organizationId: scope.organizationId ?? null, userId: scope.userId }
        }
        await this.assertRead(context)
        await this.observe(context, input, input.requestId)
    }

    async synchronize(context: ProjectPipelineContext, input: z.output<typeof pipelineRefreshSchema>) {
        await this.assertRead(context)
        const requestId = randomUUID()
        await this.refresh.begin(context, input, requestId, 'running')
        return this.observe(context, input, requestId)
    }

    private async observe(
        context: ProjectPipelineContext,
        input: z.output<typeof pipelineRefreshSchema>,
        requestId: string
    ) {
        await this.refresh.update(context, input, requestId, 'running')
        let phase: 'snapshot' | 'receipt' = 'snapshot'
        try {
            const provider = this.providers.getForActor(input.providerRef, context.actor)
            if (
                this.legacyProviders
                    .list(context.actor.organizationId ?? undefined)
                    .some((item) => item.key === provider.key)
            )
                throw pipelineProjectionConflict('DUPLICATE_TASK_PROVIDER_AUTHORITY')
            const checkpoint = await this.store.checkpoint(context, provider.key, input.sourceKey)
            const response = await boundedProjection(
                provider.snapshot(
                    {
                        ...context,
                        checkpoint,
                        hostFeatures: { nodeApplicationEntry: 1, nodePresentation: 1 },
                        hostCapabilities: pipelineHostCapabilities()
                    },
                    input.sourceKey
                )
            )
            if (!response) {
                await this.refresh.update(context, input, requestId, 'not_found')
                return null
            }
            const snapshot = projectPipelineProjectionSchema.parse(response)
            if (snapshot.sourceKey !== input.sourceKey) throw pipelineProjectionConflict('SNAPSHOT_INSTANCE_MISMATCH')
            const result = await this.store.apply(context, provider, snapshot)
            // A stale producer cannot receive a receipt for identities it did not project.
            if (result.status === 'stale') throw pipelineProjectionConflict('SOURCE_SNAPSHOT_STALE')
            const links = { instanceId: result.instanceId, revision: result.revision, tasks: result.tasks }
            phase = 'receipt'
            if (provider.linked) await boundedProjection(provider.linked(context, input.sourceKey, links))
            await this.refresh.update(context, input, requestId, 'ready')
            return links
        } catch (error) {
            const response = error instanceof HttpException ? error.getResponse() : null
            const parsed = z.object({ code: z.string().regex(/^[A-Z_]{1,100}$/) }).safeParse(response)
            const code = parsed.success
                ? parsed.data.code
                : phase === 'receipt'
                  ? 'LINK_RECEIPT_FAILED'
                  : 'PROVIDER_REFRESH_FAILED'
            await this.refresh.update(context, input, requestId, 'failed', code)
            throw error
        }
    }
}
