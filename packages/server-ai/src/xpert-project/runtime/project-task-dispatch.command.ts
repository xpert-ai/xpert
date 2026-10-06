import { ICommand } from '@nestjs/cqrs'
import { ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { ProjectTaskCaller } from './project-task-dispatch.schema'

/** Explicitly delegate one Project task. Caller identity is host-owned; the handler authorizes and reserves the attempt. */
export class DispatchProjectTaskCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly input: ProjectTaskDispatchInput,
        readonly caller: ProjectTaskCaller
    ) {}
}

/** Read a task with owner-authorized Runtime observations; this never starts a new attempt. */
export class GetProjectRuntimeTaskCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly taskId: string
    ) {}
}

/** Discover workspace-authorized Runtime bindings without exposing their configuration. */
export class ListProjectRuntimeBindingsCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly caller: ProjectTaskCaller
    ) {}
}
