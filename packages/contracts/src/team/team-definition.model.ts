import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { TAvatar } from '../types'

export type TeamDefinitionSource = 'xpert'

export interface ITeamDefinition extends IBasePerTenantAndOrganizationEntityModel {
	/**
	 * Stable Team identifier in Project OS.
	 * In this phase it is projected from the backing published Xpert id.
	 */
	id: string
	name: string
	description?: string
	avatar?: TAvatar
	source: TeamDefinitionSource
	memberCount: number
	/**
	 * Lead assistant for the projected Team.
	 * In this phase it is the same published Xpert id as `id`.
	 */
	leadAssistantId: string
}
