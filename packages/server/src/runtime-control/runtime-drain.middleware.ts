import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { isExecutionControlRecovery } from './runtime-execution-recovery'

@Injectable()
export class RuntimeDrainMiddleware implements NestMiddleware {
	private readonly logger = new Logger(RuntimeDrainMiddleware.name)
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
			const readiness = this.lifecycle.readiness()
			const requestId = randomUUID()
			response.setHeader('X-Request-ID', requestId)
			this.logger.warn(
				JSON.stringify({
					event: 'runtime.request.rejected',
					requestId,
					instance: readiness.instanceId,
					status: 503,
					method: request.method,
					readiness: readiness.status,
					reason: readiness.status === 'draining' ? 'draining' : readiness.admission?.reason
				})
			)
			response.setHeader('Cache-Control', 'no-store')
			response.setHeader('Retry-After', '5')
			response.setHeader('Connection', 'close')
			response.status(503).json({
				statusCode: 503,
				retryAfter: 5,
				reason: readiness.status === 'draining' ? 'draining' : readiness.admission?.reason,
				errorCode: readiness.status === 'draining' ? 'RUNTIME_DRAINING' : 'RUNTIME_NOT_READY',
				message:
					readiness.status === 'draining'
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
		if (isExecutionControlRecovery(request.method, path, request.body)) return true
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
