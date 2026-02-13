import { BadRequestException } from '@nestjs/common'
import { format } from 'date-fns/format'

/**
 * Format a local `Date` with a UTC+00:00 view, without changing runtime timezone settings.
 * This is useful for display or key generation where different server timezones must produce the same string.
 * The function shifts the timestamp by local offset before calling `date-fns/format`.
 * Example: `formatInUTC0(new Date('2026-02-13T08:00:00+08:00'), 'yyyy-MM-dd HH:mm')` => `2026-02-13 00:00`.
 */
export function formatInUTC0(date: Date, pattern: string): string {
	const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60_000)
	return format(utcDate, pattern)
}

/**
 * Parse a single date query parameter (`start` or `end`) into a `Date`.
 * Returns `undefined` when the input is empty, so callers can keep optional filters.
 * Throws `BadRequestException` when the value cannot be parsed as a valid date.
 * Recommended input format is ISO-8601, e.g. `2026-02-13T00:00:00.000Z`.
 * Example:
 * 	`parseDateQuery('2026-02-13T00:00:00.000Z', 'start')`.
 */
export function parseDateQuery(value: string | undefined, key: 'start' | 'end'): Date | undefined {
	if (!value) {
		return undefined
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`Invalid date query parameter "${key}": ${value}`)
	}
	return date
}

/**
 * Parse and validate a date range from `start` and `end` query parameters.
 * Internally uses `parseDateQuery` for each boundary and keeps missing boundaries optional.
 * Throws `BadRequestException` when `start > end` to prevent invalid time windows.
 * Returns only existing keys, e.g. `{ start }`, `{ end }`, `{ start, end }`, or `{}`.
 * Example:
 * 	`parseDateRangeQuery('2026-02-01T00:00:00.000Z', '2026-02-29T23:59:59.999Z')`.
 */
export function parseDateRangeQuery(start?: string, end?: string): { start?: Date; end?: Date } {
	const parsedStart = parseDateQuery(start, 'start')
	const parsedEnd = parseDateQuery(end, 'end')
	if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
		throw new BadRequestException('Query "start" must be earlier than or equal to "end"')
	}
	return {
		...(parsedStart ? { start: parsedStart } : {}),
		...(parsedEnd ? { end: parsedEnd } : {})
	}
}

/**
 * Parse enum-like query values (case-insensitive) such as `hour/day` granularity.
 * Returns `defaultValue` when the query is empty.
 * Validates the normalized input against `allowed` and returns a strongly typed value.
 * Throws `BadRequestException` with a clear message when the value is not allowed.
 * Example:
 * 	`parseGranularityQuery('Hour', { allowed: ['hour', 'day'] as const, defaultValue: 'day' })`.
 */
export function parseGranularityQuery<T extends string>(
	value: string | undefined,
	options: { allowed: readonly T[]; defaultValue: T; key?: string }
): T {
	const { allowed, defaultValue, key = 'granularity' } = options
	if (!value) {
		return defaultValue
	}
	const normalized = value.trim().toLowerCase()
	if (allowed.includes(normalized as T)) {
		return normalized as T
	}
	if (allowed.length === 2) {
		throw new BadRequestException(
			`Query "${key}" must be either "${allowed[0]}" or "${allowed[1]}"`
		)
	}
	throw new BadRequestException(
		`Query "${key}" must be one of: ${allowed.map((item) => `"${item}"`).join(', ')}`
	)
}
