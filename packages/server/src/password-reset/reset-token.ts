import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { createHash, randomBytes } from 'node:crypto'

export const resetTokenLifetimeMs = 10 * 60 * 1000

export function issueResetToken(): string {
	return 'pr_' + randomBytes(32).toString('base64url')
}

export function isResetToken(value: string): boolean {
	return typeof value === 'string' && value.length === 46 && /^pr_[A-Za-z0-9_-]{43}$/.test(value)
}

export function tokenDigest(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

export function invalidResetLink() {
	return new BadRequestException(
		t('server-ai:Error.PasswordResetInvalid', { defaultValue: 'Password reset link is invalid or expired.' })
	)
}
