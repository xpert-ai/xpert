import type { XpertEvent, XpertEventRecord } from './event.model'

export function isXpertEvent(value: unknown): value is XpertEvent {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	return (
		typeof readProperty(value, 'id') === 'string' &&
		typeof readProperty(value, 'type') === 'string' &&
		typeof readProperty(value, 'version') === 'number' &&
		typeof readProperty(value, 'timestamp') === 'number' &&
		isObject(readProperty(value, 'scope')) &&
		isObject(readProperty(value, 'source')) &&
		typeof readProperty(readProperty(value, 'source'), 'type') === 'string' &&
		typeof readProperty(readProperty(value, 'source'), 'id') === 'string'
	)
}

export function isXpertEventRecord(value: unknown): value is XpertEventRecord {
	return isXpertEvent(value) && typeof readProperty(value, 'streamId') === 'string'
}

function isObject(value: unknown) {
	return typeof value === 'object' && value !== null
}

function readProperty<TProperty extends string>(value: unknown, property: TProperty) {
	if (typeof value !== 'object' || value === null || !(property in value)) {
		return undefined
	}
	return (value as { [K in TProperty]?: unknown })[property]
}
