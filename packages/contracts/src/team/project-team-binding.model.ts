import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IProjectCore } from '../project'
import { ITeamDefinition } from './team-definition.model'

export interface IProjectTeamBinding extends IBasePerTenantAndOrganizationEntityModel {
	projectId: IProjectCore['id']
	/**
	 * Project-facing Team id.
	 * In this phase it resolves to `ITeamDefinition.id`, which is projected from a published Xpert id.
	 */
	teamId: ITeamDefinition['id']
	role?: string
	sortOrder: number
}
