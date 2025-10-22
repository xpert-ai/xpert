import { randomBytes } from 'node:crypto'

export function generateRandomPassword(length = 12): string {
	return randomBytes(length)
            .toString('base64')
            .slice(0, length)
            .replace(/\+/g, 'A')
            .replace(/\//g, 'B')
}
