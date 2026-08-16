import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { instanceToPlain } from 'class-transformer'
import { normalizeHttpException } from '../../shared/http'

@Injectable()
export class TransformInterceptor implements NestInterceptor {
	/**
	 * Intercepts the execution context and the call handler.
	 * Transforms the data using class-transformer's instanceToPlain.
	 * Catches and handles errors, returning appropriate exceptions.
	 * @param ctx - The execution context.
	 * @param next - The call handler.
	 * @returns An observable that represents the intercepted response.
	 */
	intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
		return next.handle().pipe(
			// Transform the data using class-transformer's instanceToPlain
			map((data) => instanceToPlain(data)),
			// Catch and handle errors
			catchError((error: unknown) => {
				throw normalizeHttpException(error) ?? error
			})
		)
	}
}
