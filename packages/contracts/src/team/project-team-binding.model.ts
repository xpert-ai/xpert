import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IProjectCore } from '../project'
import { TeamId } from './team-id.type'

export interface IProjectTeamBinding extends IBasePerTenantAndOrganizationEntityModel {
	projectId: IProjectCore['id']
	/**
	 * Project-facing Team id.
	 * In this phase it resolves to `ITeamDefinition.id`, which is projected from a published Xpert id.
	 */
	teamId: TeamId
	role?: string
	sortOrder: number
}
