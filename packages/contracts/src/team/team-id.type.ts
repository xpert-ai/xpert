import { EntityId, ID } from '../types'

export type TeamId = EntityId<'TeamId'>

export function createTeamId(id: ID): TeamId {
	return id as TeamId
}

export function createOptionalTeamId(id?: ID | null): TeamId | null | undefined {
	if (id === null) {
		return null
	}

	if (id === undefined) {
		return undefined
	}

	return createTeamId(id)
}
