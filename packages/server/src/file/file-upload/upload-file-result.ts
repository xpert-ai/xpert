import { IFileAsset, IFileAssetDestination, IFileUploadFailure } from '@xpert-ai/contracts'
import { HttpException } from '@nestjs/common'
import { t } from 'i18next'
import { getFileAssetDestination } from './types'

const defaultFailure = (): IFileUploadFailure => ({
	statusCode: 500,
	message: t('server-ai:Error.FileUploadFailed', { defaultValue: 'Failed to upload file.' })
})

function isMessage(value: unknown): value is string | string[] {
	return typeof value === 'string'
		? Boolean(value.trim())
		: Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')
}

/** Preserve public HTTP error fields, never serialize exception internals or arbitrary response data. */
export function fileUploadFailure(error: unknown): IFileUploadFailure {
	if (!(error instanceof HttpException)) return defaultFailure()
	const statusCode = error.getStatus()
	if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) return defaultFailure()
	const response = error.getResponse()
	const message =
		typeof response === 'string' ? response : response && 'message' in response ? response.message : undefined
	const code =
		response && typeof response === 'object' && 'code' in response && typeof response.code === 'string'
			? response.code
			: undefined
	return {
		statusCode,
		...(code ? { code } : {}),
		message: isMessage(message) ? (Array.isArray(message) ? [...message] : message) : defaultFailure().message
	}
}

/** Single-destination consumers use the same failure mapping; batch consumers retain every result. */
export function requireFileAssetDestination<K extends IFileAssetDestination['kind']>(asset: IFileAsset, kind: K) {
	const destination = getFileAssetDestination(asset, kind)
	if (destination?.status === 'success') return destination
	const failure = destination?.failure ?? defaultFailure()
	const exception = new HttpException(
		{
			statusCode: failure.statusCode,
			...(failure.code ? { code: failure.code } : {}),
			message: failure.message
		},
		failure.statusCode
	)
	// Execution records use Error.message; the HTTP response uses only the public failure above.
	if (destination?.error) exception.message = destination.error
	throw exception
}
