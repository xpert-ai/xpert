import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ProjectTasksRuntimeCapability, type ProjectTasksApi, type ProjectTaskContext } from '@xpert-ai/plugin-sdk'
import type { ProjectTaskGraphChange } from '@xpert-ai/contracts'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'
import { ReadProjectTaskAcceptanceCommand } from '../commands/read-project-task-acceptance.command'
import { ProjectTaskGraphService } from '../services/project-task-graph.service'

@Injectable()
@RuntimeCapabilityProvider(ProjectTasksRuntimeCapability)
export class ProjectTasksRuntimeService implements ProjectTasksApi {
    constructor(private readonly tasks: ProjectTaskGraphService, private readonly commands: CommandBus) {}

    readAcceptance(context: ProjectTaskContext, taskId: string) {
        return this.commands.execute(new ReadProjectTaskAcceptanceCommand(context, taskId))
    }
    graph(context: ProjectTaskContext) { return this.tasks.graph(context) }
    refresh(context: ProjectTaskContext) { return this.tasks.refresh(context) }
    change(context: ProjectTaskContext, input: ProjectTaskGraphChange) { return this.tasks.change(context, input) }
    resolveExecution(context: ProjectTaskContext, taskExecutionId: string) {
        return this.tasks.resolveExecution(context, taskExecutionId)
    }
}
