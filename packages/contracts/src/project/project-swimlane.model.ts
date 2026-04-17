import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { IProjectCore } from './project-core.model'
import type { IProjectSprint } from './project-sprint.model'
import {
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSprintStrategyEnum
} from './project-strategy.model'

export interface IProjectSwimlane extends IBasePerTenantAndOrganizationEntityModel {
	projectId: string
	project?: IProjectCore
	sprintId: string
	sprint?: IProjectSprint
	key: string
	name: string
	priority: number
	weight: number
	concurrencyLimit: number
	wipLimit: number
	agentRole: ProjectAgentRole
	environmentType: ProjectExecutionEnvironmentType
	sortOrder: number
	sourceStrategyType: ProjectSprintStrategyEnum
}
