// Navigation uses persisted bindings and current Project access. Ambiguous Assistant bindings
// fail explicitly; role names, the current client Bot and notification payloads never select an Assistant.
import { NotFoundException } from '@nestjs/common'
import { Query, QueryHandler, IQueryHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import { projectPipelineBindingSchema, type ProjectWorkbenchEntry } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { XpertProjectXpertBindingService } from '../../services/project-xpert-binding.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { XpertProject } from '../../entities/project.entity'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineNodeEntity
} from '../persistence/pipeline.entity'
import type { PipelineWorkbenchFocus } from './pipeline-workbench-navigation.schema'

/** Resolve a Project Workbench destination under the requesting actor's current access. */
export class ProjectPipelineWorkbenchQuery extends Query<ProjectWorkbenchEntry> {
    constructor(
        readonly context: ProjectPipelineContext,
        readonly focus: PipelineWorkbenchFocus
    ) {
        super()
    }
}

@QueryHandler(ProjectPipelineWorkbenchQuery)
export class ProjectPipelineWorkbenchHandler implements IQueryHandler<ProjectPipelineWorkbenchQuery> {
    constructor(
        private readonly database: DataSource,
        private readonly access: XpertProjectAccessService,
        private readonly bindings: XpertProjectXpertBindingService
    ) {}

    async execute({ context, focus }: ProjectPipelineWorkbenchQuery): Promise<ProjectWorkbenchEntry> {
        await this.access.assertCanRead(context.projectId)
        const scope = projectionScope(context)
        const missing = () => new NotFoundException(t('server-ai:Error.ProjectApplicationEntryUnavailable'))
        let candidates: string[]
        if (focus.pipelineInstanceId) {
            const instance = await this.database.manager.findOneBy(ProjectPipelineInstanceEntity, {
                ...scope,
                id: focus.pipelineInstanceId
            })
            const round = await this.database.manager.findOneBy(ProjectPipelineRoundEntity, {
                ...scope,
                id: focus.pipelineRoundId
            })
            const run =
                round &&
                (await this.database.manager.findOneBy(ProjectPipelineRunEntity, {
                    ...scope,
                    id: round.runId,
                    instanceId: focus.pipelineInstanceId
                }))
            const node =
                round &&
                (await this.database.manager.findOneBy(ProjectPipelineNodeEntity, {
                    ...scope,
                    id: focus.pipelineNodeId,
                    roundId: round.id
                }))
            if (!instance || instance.authority !== 'platform' || !run?.bindingSnapshot || !node) throw missing()
            const binding = projectPipelineBindingSchema.parse(run.bindingSnapshot)
            candidates = [...Object.values(binding.roleBindings), ...Object.values(binding.executorBindings ?? {})]
                .filter((participant) => participant.kind === 'assistant')
                .map((participant) => participant.selectionKey)
        } else {
            const project = await this.database.getRepository(XpertProject).findOne({
                where: { id: context.projectId, tenantId: scope.tenantId, organizationId: scope.organizationId },
                relations: ['xperts']
            })
            candidates = project?.xperts?.map((assistant) => assistant.id) ?? []
        }
        const assistants = await Promise.all(
            [...new Set(candidates)].map((id) => this.bindings.resolveCurrentById(id, context.actor))
        )
        if (!assistants.length || assistants.some((assistant) => !assistant)) throw missing()
        const ids = new Set(assistants.map((assistant) => assistant?.id))
        if (ids.size !== 1) throw missing()
        const assistant = assistants[0]!
        await this.access.assertCanUseXpert(context.projectId, assistant.id)
        return {
            projectId: context.projectId,
            organizationId: context.actor.organizationId ?? null,
            assistant: { id: assistant.id, name: assistant.title || assistant.name },
            view: {
                viewKey: 'platform.project-tasks__timeline',
                parameters: { initialTab: 'pipeline', ...focus }
            }
        }
    }
}
