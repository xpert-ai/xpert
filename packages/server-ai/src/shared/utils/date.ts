import { format } from 'date-fns/format'

export function formatInUTC0(date: Date, pattern: string): string {
	const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60_000)
	return format(utcDate, pattern)
}
