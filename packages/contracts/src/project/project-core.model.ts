import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { XpertId } from '../ai/xpert-id.type'
import { ProjectId } from './project-id.type'

export enum ProjectCoreStatusEnum {
	Active = 'active',
	Archived = 'archived'
}

export interface IProjectCore extends IBasePerTenantAndOrganizationEntityModel {
	id?: ProjectId
	name: string
	goal: string
	description?: string
	mainAssistantId: XpertId | null
	status: ProjectCoreStatusEnum
}
