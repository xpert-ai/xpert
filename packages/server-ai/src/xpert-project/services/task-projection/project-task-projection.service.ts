// Invariants: each acknowledged refresh has a durable wake-up job, including requests during active work.
// Jobs coalesce the expensive snapshot via scoped Redis revisions, not a fixed BullMQ job ID.
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    PluginJobProcessor,
    ProjectTaskProviderRegistry,
    type ManagedQueueJob,
    type ManagedQueueJobContext,
    type ManagedQueueService,
    type ProjectTaskContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { t } from 'i18next'
import type { ProjectTaskGraph } from '@xpert-ai/contracts'
import { ProjectAccessRuntimeService } from '../project-access-runtime.service'
import { ProjectTaskProjectionStore } from './project-task-projection.store'
import {
    boundedProjection,
    ProjectTaskProjectionCoordinator,
    ProjectionRetryError
} from './project-task-projection.coordinator'

export const PROJECT_TASK_PROJECTION_JOB = {
    pluginName: '@xpert-ai/platform',
    queueName: 'project-task-projection',
    jobName: 'refresh'
}
const payloadSchema = z.object({ projectId: z.string().uuid(), requestRevision: z.string().uuid() }).strict()

@Injectable()
@PluginJobProcessor({ ...PROJECT_TASK_PROJECTION_JOB, concurrency: 1 })
export class ProjectTaskProjectionService {
    private readonly logger = new Logger(ProjectTaskProjectionService.name)

    constructor(
        private readonly store: ProjectTaskProjectionStore,
        private readonly access: ProjectAccessRuntimeService,
        private readonly providers: ProjectTaskProviderRegistry,
        private readonly coordinator: ProjectTaskProjectionCoordinator,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService
    ) {}

    private async assertRead(context: ProjectTaskContext) {
        if (!(await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })).length)
            throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
    }

    async request(context: ProjectTaskContext): Promise<{ status: 'queued' }> {
        await this.assertRead(context)
        const requestRevision = await this.coordinator.invalidate(context)
        await boundedProjection(
            this.queue.enqueue({
                ...PROJECT_TASK_PROJECTION_JOB,
                payload: { projectId: context.projectId, requestRevision },
                ...context.actor,
                jobId: `project-task-refresh-${requestRevision}`,
                delayMs: 250,
                attempts: 60,
                backoffMs: { type: 'fixed', delay: 5_000 },
                removeOnComplete: true,
                removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
            }),
            2_000
        )
        return { status: 'queued' }
    }

    diagnostics(context: ProjectTaskContext) {
        return this.coordinator.diagnostics(context)
    }

    async handle(job: ManagedQueueJob<unknown>, scope: ManagedQueueJobContext): Promise<void> {
        const { projectId, requestRevision } = payloadSchema.parse(job.data)
        if (!scope.tenantId || !scope.userId) throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        const context: ProjectTaskContext = {
            projectId,
            actor: { tenantId: scope.tenantId, organizationId: scope.organizationId ?? null, userId: scope.userId }
        }
        // Managed Queue restores identity and RequestContext. Revalidate current project access as well.
        await this.assertRead(context)
        const claim = await this.coordinator.claim(context, requestRevision)
        if (!claim) return
        const diagnostics: ProjectTaskGraph['diagnostics'] = []
        let failure: unknown
        try {
            for (const provider of this.providers.list(context.actor.organizationId ?? undefined)) {
                try {
                    await this.coordinator.assertCurrent(claim)
                    const snapshot = await boundedProjection(provider.snapshot(context))
                    if (!snapshot) continue
                    const links = await this.store.apply(claim, provider, snapshot)
                    if (provider.linked) await boundedProjection(provider.linked(context, links))
                } catch (error) {
                    if (error instanceof ProjectionRetryError) throw error
                    diagnostics.push({
                        providerKey: provider.key,
                        message: error instanceof Error ? error.message : String(error)
                    })
                    failure ??= error
                }
            }
            await this.coordinator.finish(claim, diagnostics)
            // Preserve independent provider projections while the platform retries failed ones.
            if (diagnostics.length) throw failure
        } finally {
            await this.coordinator.release(claim).catch((error: unknown) => {
                this.logger.warn(error instanceof Error ? error.message : String(error))
            })
        }
    }
}
