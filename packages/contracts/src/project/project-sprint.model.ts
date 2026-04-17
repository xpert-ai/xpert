import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { IProjectCore } from './project-core.model'
import { ProjectSprintStrategyEnum } from './project-strategy.model'

export enum ProjectSprintStatusEnum {
	Planned = 'planned',
	Running = 'running',
	Review = 'review',
	Done = 'done'
}

export interface IProjectSprint extends IBasePerTenantAndOrganizationEntityModel {
	projectId: string
	project?: IProjectCore
	goal: string
	status: ProjectSprintStatusEnum
	strategyType: ProjectSprintStrategyEnum
	startAt?: Date
	endAt?: Date
	retrospective?: string
}
