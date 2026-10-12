import type { redactOptions } from 'pino'

const CENSOR = '[Redacted]'
const TOKEN_QUERY_KEYS = new Set(['token', 'accessToken', 'refreshToken'])

/** Preserve URL spelling and non-secret parameters; only replace credential values. */
function redactUrl(value: unknown): unknown {
	if (typeof value !== 'string') return CENSOR
	const queryStart = value.indexOf('?')
	if (queryStart < 0) return value
	const fragmentStart = value.indexOf('#', queryStart)
	const queryEnd = fragmentStart < 0 ? value.length : fragmentStart
	const query = value
		.slice(queryStart + 1, queryEnd)
		.split('&')
		.map((field) => {
			const key = field.split('=', 1)[0]
			let decodedKey: string
			try {
				decodedKey = decodeURIComponent(key.replace(/\+/g, ' '))
			} catch {
				return field
			}
			return TOKEN_QUERY_KEYS.has(decodedKey) ? `${key}=${CENSOR}` : field
		})
		.join('&')
	return `${value.slice(0, queryStart + 1)}${query}${value.slice(queryEnd)}`
}

export const HTTP_LOG_REDACTION: redactOptions = {
	paths: [
		'req.headers.authorization',
		'req.headers.cookie',
		'req.headers["x-api-key"]',
		'req.body.password',
		'req.body.token',
		'req.body.accessToken',
		'req.body.refreshToken',
		'req.query.token',
		'req.query.accessToken',
		'req.query.refreshToken',
		'req.url',
		'req.originalUrl'
	],
	censor: (value, path) =>
		path.length === 2 && (path[1] === 'url' || path[1] === 'originalUrl') ? redactUrl(value) : CENSOR
}
