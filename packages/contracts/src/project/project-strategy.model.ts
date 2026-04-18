export enum ProjectSprintStrategyEnum {
	SoftwareDelivery = 'software_delivery',
	DataAnalysis = 'data_analysis'
}

export enum ProjectSwimlaneKindEnum {
	Backlog = 'backlog',
	Execution = 'execution'
}

export enum ProjectSystemSwimlaneKeyEnum {
	Backlog = 'backlog'
}

export enum ProjectExecutionEnvironmentType {
	Browser = 'browser',
	Container = 'container',
	Terminal = 'terminal'
}

export enum ProjectAgentRole {
	Planner = 'planner',
	Coder = 'coder',
	Reviewer = 'reviewer',
	Operator = 'operator',
	Researcher = 'researcher',
	Analyst = 'analyst',
	Visualizer = 'visualizer'
}

export interface IProjectSwimlaneTemplate {
	key: string
	name: string
	kind: ProjectSwimlaneKindEnum
	priority: number
	weight: number
	concurrencyLimit: number
	wipLimit: number
	agentRole: ProjectAgentRole
	environmentType: ProjectExecutionEnvironmentType
	sortOrder: number
	sourceStrategyType: ProjectSprintStrategyEnum
}

export interface IProjectSprintStrategyTemplate {
	type: ProjectSprintStrategyEnum
	name: string
	swimlanes: IProjectSwimlaneTemplate[]
}
