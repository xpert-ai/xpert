import type { TaskResultRead } from './project-task-result-page'
import { ICommand } from '@nestjs/cqrs'
import {
    ProjectTaskDispatchInput,
    ProjectTaskDecisionInput,
    ProjectTaskDecisionToolInput,
    ProjectTaskGraphChange,
    AgentDeliveryRecovery
} from '@xpert-ai/contracts'
import { ProjectTaskCaller } from './project-task-dispatch.schema'

/** Change a task plan using the same revision and graph validation as the Project Tasks view. */
export class UpdateProjectTaskPlanCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly input: ProjectTaskGraphChange
    ) {}
}

/** Record a version-bound business acceptance/rework decision after inspecting the implementation evidence. */
export class DecideProjectTaskCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly input: ProjectTaskDecisionInput,
        readonly caller?: ProjectTaskCaller
    ) {}
}

/** Agent decision over an observed candidate; technical bindings are resolved by the host. */
export class DecideProjectTaskReferenceCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly input: ProjectTaskDecisionToolInput & { requestId: string },
        readonly caller: ProjectTaskCaller
    ) {}
}

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

/** Recover report/artifact delivery without launching another execution. */
export class RecoverProjectTaskDeliveryCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly taskId: string,
        readonly executionId: string,
        readonly input: AgentDeliveryRecovery
    ) {}
}

/** Read an authorized result page pinned to the observed Invocation revision. */
export class ReadProjectTaskResultCommand implements ICommand {
    constructor(
        readonly projectId: string,
        readonly input: TaskResultRead
    ) {}
}
