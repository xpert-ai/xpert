import {
	IRuntimeRestartCapability,
	IRuntimeRestartResponse,
	RUNTIME_RESTART_CONFIRMATION,
	RolesEnum,
	RuntimeRestartMode
} from '@xpert-ai/contracts'
import { getDefaultTenantId } from '@xpert-ai/plugin-sdk'
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	Logger,
	ServiceUnavailableException
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '../core/context'
import { REDIS_CLIENT } from '../core/redis/types'
import { RuntimeRestartRequestDto } from './runtime-control.dto'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'

const RESTART_LOCK_KEY = 'xpert:system:runtime:restart'
const DEFAULT_SIGNAL_DELAY_MS = 750
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000
const MINIMUM_LOCK_TTL_MS = 60_000
const RELEASE_RESTART_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`

type RuntimeRestartRedisClient = {
	set: (key: string, value: string, options: { NX: true; PX: number }) => Promise<string | null>
	eval?: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<number | string | null>
}

export interface RuntimeProcessSignaler {
	signal(signal: 'SIGTERM'): void
}

export const RUNTIME_PROCESS_SIGNALER = Symbol('RUNTIME_PROCESS_SIGNALER')

export interface RuntimeRestartAuditContext {
	sourceIp?: string
}

@Injectable()
export class RuntimeControlService {
	private readonly logger = new Logger(RuntimeControlService.name)
	private readonly mode: RuntimeRestartMode = 'self-signal'
	private readonly signalDelayMs = DEFAULT_SIGNAL_DELAY_MS
	private readonly drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS

	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redis: RuntimeRestartRedisClient,
		@Inject(RUNTIME_PROCESS_SIGNALER)
		private readonly processSignaler: RuntimeProcessSignaler,
		private readonly lifecycle: RuntimeLifecycleService
	) {}

	restartCapability(): IRuntimeRestartCapability {
		if (RequestContext.currentApiKey()) {
			return { allowed: false, mode: this.mode, reason: 'interactive-auth-required' }
		}
		if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
			return { allowed: false, mode: this.mode, reason: 'super-admin-required' }
		}

		const defaultTenantId = getDefaultTenantId()
		if (!defaultTenantId || RequestContext.currentTenantId() !== defaultTenantId) {
			return { allowed: false, mode: this.mode, reason: 'default-tenant-required' }
		}
		return { allowed: true, mode: this.mode, reason: 'allowed' }
	}

	async requestRestart(
		input: RuntimeRestartRequestDto,
		audit: RuntimeRestartAuditContext = {}
	): Promise<IRuntimeRestartResponse> {
		this.assertAuthorizedActor()
		if (input.confirmation !== RUNTIME_RESTART_CONFIRMATION) {
			throw new BadRequestException({
				statusCode: 400,
				errorCode: 'RUNTIME_RESTART_CONFIRMATION_REQUIRED',
				message: `confirmation must equal ${RUNTIME_RESTART_CONFIRMATION}`
			})
		}
		const currentDrain = this.lifecycle.getDrainState()
		if (currentDrain) {
			throw this.restartInProgress(currentDrain.restartId)
		}

		const restartId = randomUUID()
		const requestedAt = new Date().toISOString()
		const lockTtlMs = Math.max(MINIMUM_LOCK_TTL_MS, this.signalDelayMs + this.drainTimeoutMs + 30_000)
		const lockId = `${this.lifecycle.instanceId}:${restartId}`
		let lockResult: string | null
		try {
			lockResult = await this.redis.set(RESTART_LOCK_KEY, lockId, {
				NX: true,
				PX: lockTtlMs
			})
		} catch (error) {
			this.logger.error(`Runtime restart lock failed: ${describeError(error)}`)
			throw new ServiceUnavailableException({
				statusCode: 503,
				errorCode: 'RUNTIME_RESTART_COORDINATION_UNAVAILABLE',
				message: 'Runtime restart coordination is unavailable'
			})
		}

		if (lockResult !== 'OK') {
			throw this.restartInProgress()
		}

		if (!this.lifecycle.beginDrain({ restartId, requestedAt })) {
			await this.releaseLock(lockId)
			throw this.restartInProgress(this.lifecycle.getDrainState()?.restartId)
		}

		this.writeAuditLog('runtime.restart.requested', {
			restartId,
			requestedAt,
			actorUserId: RequestContext.currentUserId(),
			tenantId: RequestContext.currentTenantId(),
			instanceId: this.lifecycle.instanceId,
			sourceIp: audit.sourceIp,
			reason: input.reason?.trim() || undefined
		})

		const timer = setTimeout(() => {
			void this.terminateAfterDrain(restartId, lockId)
		}, this.signalDelayMs)
		timer.unref?.()

		return {
			accepted: true,
			restartId,
			mode: this.mode,
			instanceId: this.lifecycle.instanceId,
			requestedAt,
			signalAfterMs: this.signalDelayMs,
			drainTimeoutMs: this.drainTimeoutMs
		}
	}

	private assertAuthorizedActor(): void {
		const capability = this.restartCapability()
		if (capability.reason === 'interactive-auth-required') {
			throw new ForbiddenException({
				statusCode: 403,
				errorCode: 'RUNTIME_RESTART_INTERACTIVE_AUTH_REQUIRED',
				message: 'API runtime restart requires an interactive SuperAdmin session'
			})
		}
		if (capability.reason === 'super-admin-required') {
			throw new ForbiddenException({
				statusCode: 403,
				errorCode: 'RUNTIME_RESTART_SUPER_ADMIN_REQUIRED',
				message: 'Only SuperAdmin users can restart the API runtime'
			})
		}
		if (capability.reason === 'default-tenant-required') {
			throw new ForbiddenException({
				statusCode: 403,
				errorCode: 'RUNTIME_RESTART_DEFAULT_TENANT_REQUIRED',
				message: 'API runtime restart is restricted to the default tenant'
			})
		}
	}

	private async terminateAfterDrain(restartId: string, lockId: string): Promise<void> {
		const drained = await this.lifecycle.waitForIdle(this.drainTimeoutMs)
		this.writeAuditLog('runtime.restart.signaling', {
			restartId,
			instanceId: this.lifecycle.instanceId,
			drained,
			activeRequests: this.lifecycle.readiness().activeRequests,
			signal: 'SIGTERM'
		})

		try {
			this.processSignaler.signal('SIGTERM')
		} catch (error) {
			this.logger.error(`Failed to signal API restart ${restartId}: ${describeError(error)}`)
			this.lifecycle.cancelDrain(restartId)
			await this.releaseLock(lockId)
		}
	}

	private async releaseLock(lockId: string): Promise<void> {
		try {
			await this.redis.eval?.(RELEASE_RESTART_LOCK_SCRIPT, {
				keys: [RESTART_LOCK_KEY],
				arguments: [lockId]
			})
		} catch (error) {
			this.logger.warn(`Failed to release runtime restart lock: ${describeError(error)}`)
		}
	}

	private restartInProgress(restartId?: string): ConflictException {
		return new ConflictException({
			statusCode: 409,
			errorCode: 'RUNTIME_RESTART_IN_PROGRESS',
			message: 'An API runtime restart is already in progress',
			...(restartId ? { restartId } : {})
		})
	}

	private writeAuditLog(event: string, details: Record<string, unknown>): void {
		this.logger.warn(JSON.stringify({ event, ...details }))
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
