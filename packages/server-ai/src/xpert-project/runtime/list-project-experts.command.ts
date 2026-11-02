import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Command, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { ProjectTaskExpert, ProjectTaskExperts } from '@xpert-ai/contracts'
import { IsNull, Repository } from 'typeorm'
import { GetAccessiblePublishedXpertQuery } from '../../xpert/published-agent/get-accessible-published-xpert.query'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectXpertBindingService } from '../services/project-xpert-binding.service'
import { ProjectTaskCaller } from './project-task-dispatch.schema'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { projectTaskRuntimeError } from './project-task-runtime.errors'

/** Discover assignable Project Assistants with live access checks and host-owned caller identity. */
export class ListProjectExpertsCommand extends Command<ProjectTaskExperts> {
    constructor(
        readonly projectId: string,
        readonly caller: ProjectTaskCaller
    ) {
        super()
    }
}

@CommandHandler(ListProjectExpertsCommand)
export class ListProjectExpertsHandler implements ICommandHandler<ListProjectExpertsCommand> {
    constructor(
        private readonly context: ProjectTaskRuntimeContextService,
        @InjectRepository(XpertProject) private readonly projects: Repository<XpertProject>,
        private readonly bindings: XpertProjectXpertBindingService,
        private readonly queries: QueryBus
    ) {}

    async execute(command: ListProjectExpertsCommand): Promise<ProjectTaskExperts> {
        const scope = await this.context.resolve(command.projectId, command.caller)
        const project = await this.projects.findOne({
            where: {
                id: scope.projectId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? IsNull()
            },
            relations: ['xperts']
        })
        if (!project) throw projectTaskRuntimeError('Scope')

        const current = scope.callerXpertId ? await this.bindings.resolveCurrentById(scope.callerXpertId, scope) : null
        const experts: ProjectTaskExpert[] = []
        for (const linked of project.xperts ?? []) {
            const candidate = await this.bindings.resolveCurrentById(linked.id, scope)
            if (!candidate || experts.some((item) => item.assigneeXpertId === candidate.id)) continue
            try {
                await this.queries.execute(new GetAccessiblePublishedXpertQuery(candidate.id))
            } catch (error) {
                if (error instanceof ForbiddenException || error instanceof NotFoundException) continue
                throw error
            }
            experts.push({
                assigneeXpertId: candidate.id,
                name: candidate.name,
                title: candidate.title,
                isCurrent: Boolean(current && this.bindings.isSameXpert(current, candidate))
            })
        }
        return {
            currentExpert: scope.callerXpertId
                ? {
                      xpertId: scope.callerXpertId,
                      agentKey: scope.callerAgentKey,
                      assigneeXpertId: experts.find((item) => item.isCurrent)?.assigneeXpertId ?? null
                  }
                : null,
            experts
        }
    }
}
