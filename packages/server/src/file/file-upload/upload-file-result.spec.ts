import { IFileAsset } from '@xpert-ai/contracts'
import { HttpException } from '@nestjs/common'
import { fileUploadFailure, requireFileAssetDestination } from './upload-file-result'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

describe('upload failure conversion', () => {
	it.each([400, 401, 403, 413, 429, 503])(
		'preserves status %s and public fields across JSON serialization',
		(statusCode) => {
			const error = new HttpException(
				{ code: 'upload_denied', message: '不能上传。', privateData: 'do not expose' },
				statusCode
			)
			error.message = 'diagnostic-discriminator'
			const failure = fileUploadFailure(error)
			expect(failure).toEqual({ statusCode, code: 'upload_denied', message: '不能上传。' })
			const asset: IFileAsset = {
				status: 'failed',
				destinations: [
					{
						kind: 'storage',
						status: 'failed',
						error: error.message,
						failure: JSON.parse(JSON.stringify(failure))
					}
				]
			}
			try {
				requireFileAssetDestination(asset, 'storage')
				throw Error('expected upload failure')
			} catch (mapped) {
				expect(mapped).toBeInstanceOf(HttpException)
				if (!(mapped instanceof HttpException)) throw mapped
				expect(mapped.getStatus()).toBe(statusCode)
				expect(mapped.getResponse()).toEqual(failure)
				expect(mapped.message).toBe('diagnostic-discriminator')
			}
		}
	)

	it('keeps validation message arrays and string exception responses', () => {
		expect(fileUploadFailure(new HttpException({ message: ['name required', 'invalid size'] }, 400))).toEqual({
			statusCode: 400,
			message: ['name required', 'invalid size']
		})
		expect(fileUploadFailure(new HttpException('Access denied', 403))).toEqual({
			statusCode: 403,
			message: 'Access denied'
		})
	})

	it.each([new Error('secret file /private/credentials'), { token: 'secret' }, null])(
		'uses a public fallback for unexpected errors: %s',
		(error) => {
			expect(fileUploadFailure(error)).toEqual({ statusCode: 500, message: 'Failed to upload file.' })
		}
	)

	it('does not stringify arbitrary response objects', () => {
		expect(
			fileUploadFailure(new HttpException({ message: { password: 'secret' }, code: { private: true } }, 400))
		).toEqual({ statusCode: 400, message: 'Failed to upload file.' })
	})

	it('returns a successful target unchanged even in a partial result', () => {
		const destination = { kind: 'volume' as const, status: 'success' as const, path: 'file.txt' }
		expect(
			requireFileAssetDestination(
				{ status: 'partial_success', destinations: [{ kind: 'storage', status: 'failed' }, destination] },
				'volume'
			)
		).toBe(destination)
	})

	it.each<IFileAsset>([
		{ status: 'failed', destinations: [] },
		{ status: 'failed', destinations: [{ kind: 'storage', status: 'failed', error: 'legacy internal detail' }] }
	])('handles missing or legacy failure details', (asset) => {
		try {
			requireFileAssetDestination(asset, 'storage')
			throw Error('expected upload failure')
		} catch (error) {
			if (!(error instanceof HttpException)) throw error
			expect(error.getStatus()).toBe(500)
			expect(error.getResponse()).toEqual({ statusCode: 500, message: 'Failed to upload file.' })
		}
	})
})
