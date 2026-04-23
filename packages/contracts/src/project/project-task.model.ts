import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ITeamDefinition } from '../team/team-definition.model'
import type { IProjectCore } from './project-core.model'
import type { IProjectSprint } from './project-sprint.model'
import type { IProjectSwimlane } from './project-swimlane.model'

export enum ProjectTaskStatusEnum {
	Todo = 'todo',
	Doing = 'doing',
	Done = 'done',
	Failed = 'failed'
}

export interface IProjectTask extends IBasePerTenantAndOrganizationEntityModel {
	projectId: string
	project?: IProjectCore
	sprintId: string
	sprint?: IProjectSprint
	swimlaneId: string
	swimlane?: IProjectSwimlane
	title: string
	description?: string
	sortOrder: number
	status: ProjectTaskStatusEnum
	dependencies: string[]
	assignedAgentId?: string
	/**
	 * Bound Team id for task routing.
	 * In this phase it resolves to `ITeamDefinition.id`, which is projected from a published Xpert id.
	 */
	teamId?: ITeamDefinition['id'] | null
}
