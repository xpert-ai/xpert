import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'

@Injectable()
export class RuntimeDrainMiddleware implements NestMiddleware {
	constructor(private readonly lifecycle: RuntimeLifecycleService) {}

	use(request: Request, response: Response, next: NextFunction): void {
		if (this.isHealthRequest(request)) {
			next()
			return
		}

		const release = this.lifecycle.trackRequest()
		if (!release) {
			response.setHeader('Retry-After', '5')
			response.setHeader('Connection', 'close')
			response.status(503).json({
				statusCode: 503,
				errorCode: 'RUNTIME_DRAINING',
				message: 'The API instance is draining for restart'
			})
			return
		}

		response.once('finish', release)
		response.once('close', release)
		next()
	}

	private isHealthRequest(request: Request): boolean {
		const path = (request.originalUrl || request.url).split('?')[0]
		return /\/health(?:\/|$)/.test(path)
	}
}
