import { ProjectSprintStrategyEnum } from './project-strategy.model'
import { IProjectTaskDispatchResult } from './project-task-execution.model'

export enum ProjectAssistantActionTypeEnum {
	ManageBacklog = 'manage_backlog',
	DispatchRunnableTasks = 'dispatch_runnable_tasks'
}

export interface IProjectAssistantBootstrapSprintInput {
	strategyType: ProjectSprintStrategyEnum
	goal: string
}

export interface IProjectAssistantActionRequest {
	actionType: ProjectAssistantActionTypeEnum
	sprintId?: string
	instruction?: string
	bootstrapSprint?: IProjectAssistantBootstrapSprintInput
}

export interface IProjectAssistantActionAccepted {
	accepted: true
	conversationId: string
	dispatchId: string
}

export type IProjectAssistantActionResponse = IProjectAssistantActionAccepted | IProjectTaskDispatchResult
