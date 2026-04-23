import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { IProjectCore } from './project-core.model'
import { ProjectId, SprintId } from './project-id.type'
import type { IProjectSprint } from './project-sprint.model'
import {
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSwimlaneKindEnum,
	ProjectSprintStrategyEnum
} from './project-strategy.model'

export interface IProjectSwimlane extends IBasePerTenantAndOrganizationEntityModel {
	projectId: ProjectId
	project?: IProjectCore
	sprintId: SprintId
	sprint?: IProjectSprint
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
