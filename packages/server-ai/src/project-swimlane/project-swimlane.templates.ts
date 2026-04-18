import {
	IProjectSprintStrategyTemplate,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSwimlaneKindEnum,
	ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'

export const PROJECT_SPRINT_STRATEGY_TEMPLATES: IProjectSprintStrategyTemplate[] = [
	{
		type: ProjectSprintStrategyEnum.SoftwareDelivery,
		name: 'Software Delivery',
		swimlanes: [
			{
				key: 'planning',
				name: 'Planning',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 4,
				weight: 4,
				concurrencyLimit: 1,
				wipLimit: 1,
				agentRole: ProjectAgentRole.Planner,
				environmentType: ProjectExecutionEnvironmentType.Browser,
				sortOrder: 1,
				sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			},
			{
				key: 'coding',
				name: 'Coding',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 3,
				weight: 3,
				concurrencyLimit: 2,
				wipLimit: 2,
				agentRole: ProjectAgentRole.Coder,
				environmentType: ProjectExecutionEnvironmentType.Container,
				sortOrder: 2,
				sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			},
			{
				key: 'review',
				name: 'Review',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 2,
				weight: 2,
				concurrencyLimit: 1,
				wipLimit: 1,
				agentRole: ProjectAgentRole.Reviewer,
				environmentType: ProjectExecutionEnvironmentType.Container,
				sortOrder: 3,
				sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			},
			{
				key: 'release',
				name: 'Release',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 1,
				weight: 1,
				concurrencyLimit: 1,
				wipLimit: 1,
				agentRole: ProjectAgentRole.Operator,
				environmentType: ProjectExecutionEnvironmentType.Terminal,
				sortOrder: 4,
				sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			}
		]
	},
	{
		type: ProjectSprintStrategyEnum.DataAnalysis,
		name: 'Data Analysis',
		swimlanes: [
			{
				key: 'research',
				name: 'Research',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 3,
				weight: 3,
				concurrencyLimit: 2,
				wipLimit: 2,
				agentRole: ProjectAgentRole.Researcher,
				environmentType: ProjectExecutionEnvironmentType.Browser,
				sortOrder: 1,
				sourceStrategyType: ProjectSprintStrategyEnum.DataAnalysis
			},
			{
				key: 'analysis',
				name: 'Analysis',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 2,
				weight: 2,
				concurrencyLimit: 1,
				wipLimit: 1,
				agentRole: ProjectAgentRole.Analyst,
				environmentType: ProjectExecutionEnvironmentType.Terminal,
				sortOrder: 2,
				sourceStrategyType: ProjectSprintStrategyEnum.DataAnalysis
			},
			{
				key: 'visualization',
				name: 'Visualization',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 1,
				weight: 1,
				concurrencyLimit: 1,
				wipLimit: 1,
				agentRole: ProjectAgentRole.Visualizer,
				environmentType: ProjectExecutionEnvironmentType.Terminal,
				sortOrder: 3,
				sourceStrategyType: ProjectSprintStrategyEnum.DataAnalysis
			}
		]
	}
]
