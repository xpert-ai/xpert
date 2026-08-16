import { CallHandler, ExecutionContext, NotFoundException } from '@nestjs/common'
import { firstValueFrom, throwError } from 'rxjs'
import { TransformInterceptor } from './transform.interceptor'

describe('TransformInterceptor', () => {
	it('preserves structured Nest exception responses', async () => {
		const exception = new NotFoundException({
			statusCode: 404,
			errorCode: 'PLUGIN_RESOURCE_NO_MATCHING_COMPONENTS',
			message: 'No matching plugin components were found.'
		})
		const next: CallHandler = {
			handle: () => throwError(() => exception)
		}

		await expect(firstValueFrom(new TransformInterceptor().intercept({} as ExecutionContext, next))).rejects.toBe(
			exception
		)
	})
})
