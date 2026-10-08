import { HttpException, Injectable, PipeTransform } from '@nestjs/common'
import { z } from 'zod/v3'

/** Parse HTTP inputs once; callers own error codes, localization and validation metrics. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, Promise<T>> {
	constructor(
		private readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>,
		private readonly exceptionFactory: (error: z.ZodError<unknown>) => HttpException
	) {}

	async transform(value: unknown): Promise<T> {
		const parsed = await this.schema.safeParseAsync(value)
		if (!parsed.success) throw this.exceptionFactory(parsed.error)
		return parsed.data
	}
}
