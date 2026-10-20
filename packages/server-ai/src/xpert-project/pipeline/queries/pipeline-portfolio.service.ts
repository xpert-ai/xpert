// Every selected Project must be authorized before any facts are read.
// One MVCC snapshot covers ACLs, projections, attempts and usage; totals deduplicate raw execution identities.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    aggregatePipelineAnalytics,
    pipelineAnalyticsFacts,
    type ProjectPipelinePortfolio,
    type ProjectPipelinePortfolioInput
} from '@xpert-ai/contracts'
import {
    ProjectPipelinePortfolioRuntimeCapability,
    type ProjectPipelinePortfolioApi,
    type ProjectAccessActor
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../../shared/runtime/runtime-capability-provider.decorator'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineInstanceEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineAnalyticsService } from './pipeline-analytics.service'
import { readPipelineModelUsage } from './pipeline-model-usage'

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelinePortfolioRuntimeCapability)
export class ProjectPipelinePortfolioService implements ProjectPipelinePortfolioApi {
    constructor(
        @InjectRepository(ProjectPipelineInstanceEntity)
        private readonly instances: Repository<ProjectPipelineInstanceEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly analytics: ProjectPipelineAnalyticsService
    ) {}

    async read(actor: ProjectAccessActor, input: ProjectPipelinePortfolioInput): Promise<ProjectPipelinePortfolio> {
        return this.instances.manager.transaction('REPEATABLE READ', async (manager) => {
            const clock: Array<{ snapshotAt: Date }> = await manager.query('SELECT clock_timestamp() AS "snapshotAt"')
            const snapshotAt = clock[0].snapshotAt.toISOString()
            await this.access.assertAllReadableWithinTransaction(actor, input.projectIds, manager)
            const projects: Awaited<ReturnType<ProjectPipelineAnalyticsService['readWithinTransaction']>>[] = []
            for (const projectId of input.projectIds)
                projects.push(
                    await this.analytics.readWithinTransaction({ actor, projectId }, input.window, manager, snapshotAt)
                )
            const facts = projects.flatMap((project) => project.facts),
                executions = projects.flatMap((project) => project.executions)
            const aggregate = aggregatePipelineAnalytics(
                facts,
                executions,
                input.window,
                snapshotAt,
                projects.reduce((sum, project) => sum + project.report.coverage.instancesWithoutCurrentRound, 0)
            )
            const selected = pipelineAnalyticsFacts(facts, executions, input.window).selected
            const modelUsage = await readPipelineModelUsage(
                manager,
                { actor },
                selected.flatMap((item) => (item.agentExecutionId ? [item.agentExecutionId] : []))
            )
            const { byInstance: _byInstance, queue: _queue, humanWait: _humanWait, ...totals } = aggregate
            return {
                snapshotAt,
                window: input.window,
                selectionScope: 'explicit_authorized_projects',
                totals: { ...totals, modelUsage },
                byProject: projects.map((project) => project.report),
                sharedAcrossProjects:
                    projects.reduce((sum, project) => sum + project.report.executions.attempts.total, 0) -
                    selected.length
            }
        })
    }
}
