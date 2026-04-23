import { EntityId, ID } from '../types'

export type XpertId = EntityId<'XpertId'>

export function createXpertId(id: ID): XpertId {
	return id as XpertId
}

export function createOptionalXpertId(id?: ID | null): XpertId | null | undefined {
	if (id === null) {
		return null
	}

	if (id === undefined) {
		return undefined
	}

	return createXpertId(id)
}
