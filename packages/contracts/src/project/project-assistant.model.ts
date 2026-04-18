import { ProjectSprintStrategyEnum } from './project-strategy.model'

export enum ProjectAssistantActionTypeEnum {
	ManageBacklog = 'manage_backlog'
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
