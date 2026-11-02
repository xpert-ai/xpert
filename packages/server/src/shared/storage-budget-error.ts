import { HttpException } from '@nestjs/common'
import { t } from 'i18next'

export const accountStorageFailure = 'APP_PLATFORM_FAILURE:application_storage_limit'

export function accountStorageLimitMessage() {
	return t('server-ai:Error.application_storage_limit', {
		defaultValue: 'Account storage limit reached. Delete unused files or application data and try again.'
	})
}

/** Only the exact database guard discriminator may become a public storage error. */
export function normalizeAccountStorageError(error: unknown): HttpException | null {
	if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P0001' ||
		!('message' in error) || error.message !== accountStorageFailure) return null
	const failure = new HttpException({ code: 'application_storage_limit', message: accountStorageLimitMessage() }, 413)
	failure.message = accountStorageFailure
	return failure
}
