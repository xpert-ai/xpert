import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
    DispatchProjectTaskCommand,
    GetProjectRuntimeTaskCommand,
    ListProjectRuntimeBindingsCommand
} from './project-task-dispatch.command'
import { ProjectTaskDispatchService } from './project-task-dispatch.service'
import { ProjectTaskRuntimeReadService } from './project-task-runtime-read.service'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'

@CommandHandler(DispatchProjectTaskCommand)
export class DispatchProjectTaskHandler implements ICommandHandler<DispatchProjectTaskCommand> {
    constructor(private readonly dispatch: ProjectTaskDispatchService) {}
    execute(command: DispatchProjectTaskCommand) {
        return this.dispatch.dispatch(command.projectId, command.input, command.caller)
    }
}
@CommandHandler(GetProjectRuntimeTaskCommand)
export class GetProjectRuntimeTaskHandler implements ICommandHandler<GetProjectRuntimeTaskCommand> {
    constructor(private readonly read: ProjectTaskRuntimeReadService) {}
    execute(command: GetProjectRuntimeTaskCommand) {
        return this.read.get(command.projectId, command.taskId)
    }
}
@CommandHandler(ListProjectRuntimeBindingsCommand)
export class ListProjectRuntimeBindingsHandler implements ICommandHandler<ListProjectRuntimeBindingsCommand> {
    constructor(
        private readonly context: ProjectTaskRuntimeContextService,
        private readonly factory: AgentInvocationFactoryService
    ) {}
    async execute(command: ListProjectRuntimeBindingsCommand) {
        return this.factory.listProjectBindings(await this.context.resolve(command.projectId, command.caller))
    }
}
export const ProjectTaskRuntimeHandlers = [
    DispatchProjectTaskHandler,
    GetProjectRuntimeTaskHandler,
    ListProjectRuntimeBindingsHandler
]
