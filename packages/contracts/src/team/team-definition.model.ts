import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { XpertId } from '../ai/xpert-id.type'
import { TAvatar } from '../types'
import { TeamId } from './team-id.type'

export type TeamDefinitionSource = 'xpert'

export interface ITeamDefinition extends IBasePerTenantAndOrganizationEntityModel {
	/**
	 * Stable Team identifier in Project OS.
	 * In this phase it is projected from the backing published Xpert id.
	 */
	id: TeamId
	name: string
	description?: string
	avatar?: TAvatar
	source: TeamDefinitionSource
	memberCount: number
	/**
	 * Lead assistant for the projected Team.
	 * In this phase it is the same published Xpert id as `id`.
	 */
	leadAssistantId: XpertId
}
