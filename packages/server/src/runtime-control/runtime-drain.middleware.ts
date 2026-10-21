import { t } from 'i18next'
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

		// Recovery must still reach the normal authentication and scope guards when a
		// stale plugin manifest closes business traffic. Draining rejects it as usual.
		const release = this.lifecycle.trackRequest({ allowUnready: this.isRecoveryRequest(request) })
		if (!release) {
			response.setHeader('Retry-After', '5')
			response.setHeader('Connection', 'close')
			response.status(503).json({
				statusCode: 503,
				errorCode: this.lifecycle.readiness().status === 'draining' ? 'RUNTIME_DRAINING' : 'RUNTIME_NOT_READY',
				message:
					this.lifecycle.readiness().status === 'draining'
						? 'The API instance is draining for restart'
						: t('server-ai:Error.RuntimeNotReady', { defaultValue: 'The API instance is not ready' })
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

	private isRecoveryRequest(request: Request): boolean {
		const path = (request.originalUrl || request.url).split('?')[0].replace(/^\/api(?=\/)/, '')
		if (request.method === 'POST') {
			return [
				'/auth/login',
				'/plugin',
				'/plugin/by-names',
				'/plugin/configuration',
				'/plugin/refresh',
				'/system/runtime/restart'
			].includes(path)
		}
		if (request.method === 'PUT') return path === '/plugin/configuration'
		if (request.method !== 'GET') return false
		return (
			path === '/plugin' ||
			path === '/system/runtime/restart-capability' ||
			/^\/system\/runtime\/(restart\/[\w-]+|plugin-convergence\/\d+)$/.test(path)
		)
	}
}
