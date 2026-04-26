import type { XpertEvent, XpertEventFilter } from './event.model'

const FILTER_KEYS = [
	'projectId',
	'sprintId',
	'taskId',
	'taskExecutionId',
	'conversationId',
	'agentExecutionId',
	'xpertId'
] as const

type ScopeFilterKey = (typeof FILTER_KEYS)[number]

export function normalizeXpertEventFilter(filter?: XpertEventFilter | null): XpertEventFilter {
	if (!filter) {
		return {}
	}

	const normalized: XpertEventFilter = {}
	for (const key of FILTER_KEYS) {
		const value = normalizeString(filter[key])
		if (value) {
			normalized[key] = value
		}
	}

	const type = normalizeString(filter.type)
	if (type) {
		normalized.type = type
	}

	const afterId = normalizeString(filter.afterId)
	if (afterId) {
		normalized.afterId = afterId
	}

	if (typeof filter.limit === 'number' && Number.isFinite(filter.limit)) {
		normalized.limit = filter.limit
	}

	return normalized
}

export function matchesXpertEventFilter(event: XpertEvent, filter?: XpertEventFilter | null): boolean {
	const normalized = normalizeXpertEventFilter(filter)
	if (normalized.type && event.type !== normalized.type) {
		return false
	}

	for (const key of FILTER_KEYS) {
		if (!matchesScopeKey(event, normalized, key)) {
			return false
		}
	}

	return true
}

function matchesScopeKey(event: XpertEvent, filter: XpertEventFilter, key: ScopeFilterKey) {
	const expected = filter[key]
	if (!expected) {
		return true
	}
	return event.scope?.[key] === expected
}

function normalizeString(value: unknown) {
	if (typeof value !== 'string') {
		return undefined
	}
	const normalized = value.trim()
	return normalized || undefined
}
