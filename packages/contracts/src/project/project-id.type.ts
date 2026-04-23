import { EntityId, ID } from '../types'

export type ProjectId = EntityId<'ProjectId'>
export type SprintId = EntityId<'SprintId'>

export function createProjectId(id: ID): ProjectId {
	return id as ProjectId
}

export function createOptionalProjectId(id?: ID | null): ProjectId | null | undefined {
	if (id === null) {
		return null
	}

	if (id === undefined) {
		return undefined
	}

	return createProjectId(id)
}

export function createSprintId(id: ID): SprintId {
	return id as SprintId
}

export function createOptionalSprintId(id?: ID | null): SprintId | null | undefined {
	if (id === null) {
		return null
	}

	if (id === undefined) {
		return undefined
	}

	return createSprintId(id)
}
