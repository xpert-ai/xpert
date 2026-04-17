import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export enum ProjectCoreStatusEnum {
	Active = 'active',
	Archived = 'archived'
}

export interface IProjectCore extends IBasePerTenantAndOrganizationEntityModel {
	name: string
	goal: string
	description?: string
	status: ProjectCoreStatusEnum
}
