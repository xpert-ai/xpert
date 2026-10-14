import { createHash } from 'node:crypto'

export const PERSONAL_API_KEY_PREFIX = 'sk-user-'

export function hashPersonalApiKey(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}
