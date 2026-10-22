import { IRuntimeAdmissionDiagnostics, IRuntimeReadiness } from '@xpert-ai/contracts'
import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

export interface RuntimeDrainState {
	restartId: string
	requestedAt: string
}

@Injectable()
export class RuntimeLifecycleService implements BeforeApplicationShutdown {
	readonly instanceId = `${hostname()}-${process.pid}-${randomUUID()}`

	private readonly logger = new Logger(RuntimeLifecycleService.name)
	private activeRequests = 0
	private readinessGuard: () => boolean = () => true

	setReadinessGuard(guard: () => boolean): void {
		this.readinessGuard = guard
	}
	private drainState: RuntimeDrainState | null = null
	private withdrawal: RuntimeDrainState | null = null
	private diagnostics?: () => IRuntimeAdmissionDiagnostics
	private lastDiagnostic = ''

	setAdmissionDiagnostics(read: () => IRuntimeAdmissionDiagnostics): void {
		this.diagnostics = read
	}

	beginWithdrawal(state: RuntimeDrainState): boolean {
		if (this.withdrawal || this.drainState) return false
		this.withdrawal = state
		this.logger.log(JSON.stringify({ event: 'runtime.traffic.withdrawal-started', ...state }))
		return true
	}
	private readonly idleWaiters = new Set<() => void>()

	async beforeApplicationShutdown(): Promise<void> {
		// Nest serializes final SSE writes asynchronously after onModuleDestroy completes its observables.
		// Give responses time to emit finish before forceCloseConnections destroys their sockets.
		const startedAt = Date.now()
		this.logger.debug(
			JSON.stringify({
				event: 'runtime.shutdown.response-flush-started',
				pid: process.pid,
				activeRequests: this.activeRequests,
				timeoutMs: 1_000
			})
		)
		const drained = await this.waitForIdle(1_000)
		this.logger.debug(
			JSON.stringify({
				event: 'runtime.shutdown.response-flush-finished',
				pid: process.pid,
				drained,
				activeRequests: this.activeRequests,
				durationMs: Date.now() - startedAt
			})
		)
	}

	completeWithdrawal(state: RuntimeDrainState): boolean {
		if (this.withdrawal?.restartId !== state.restartId) return false
		return this.beginDrain(state)
	}

	beginDrain(state: RuntimeDrainState): boolean {
		if (this.drainState) {
			return false
		}
		this.withdrawal = null
		this.drainState = state
		this.logger.debug(
			JSON.stringify({
				event: 'runtime.shutdown.drain-entered',
				pid: process.pid,
				restartId: state.restartId,
				activeRequests: this.activeRequests
			})
		)
		return true
	}

	cancelDrain(restartId: string): void {
		if (this.withdrawal?.restartId === restartId) this.withdrawal = null
		if (this.drainState?.restartId === restartId) {
			this.drainState = null
			this.logger.debug(
				JSON.stringify({ event: 'runtime.shutdown.drain-cancelled', pid: process.pid, restartId })
			)
		}
	}

	getDrainState(): RuntimeDrainState | null {
		return this.drainState ? { ...this.drainState } : null
	}

	trackRequest(options?: { allowUnready?: boolean }): (() => void) | null {
		if (this.drainState || (!options?.allowUnready && !this.readinessGuard())) {
			this.readiness()
			return null
		}

		this.activeRequests += 1
		let released = false
		return () => {
			// Both HTTP finish and close can fire for one response; release its slot exactly once.
			if (released) {
				return
			}
			released = true
			this.activeRequests = Math.max(0, this.activeRequests - 1)
			if (this.activeRequests === 0) {
				for (const resolve of this.idleWaiters) {
					resolve()
				}
				this.idleWaiters.clear()
			}
		}
	}

	async waitForIdle(timeoutMs: number): Promise<boolean> {
		const startedAt = Date.now()
		this.logger.debug(
			JSON.stringify({
				event: 'runtime.shutdown.idle-wait-started',
				pid: process.pid,
				restartId: this.drainState?.restartId,
				timeoutMs,
				activeRequests: this.activeRequests
			})
		)
		const reportResult = (drained: boolean): boolean => {
			this.logger.debug(
				JSON.stringify({
					event: 'runtime.shutdown.idle-wait-finished',
					pid: process.pid,
					restartId: this.drainState?.restartId,
					drained,
					timeoutMs,
					activeRequests: this.activeRequests,
					durationMs: Date.now() - startedAt
				})
			)
			return drained
		}
		if (this.activeRequests === 0) {
			return reportResult(true)
		}

		return await new Promise<boolean>((resolve) => {
			let settled = false
			const settle = (drained: boolean) => {
				if (settled) {
					return
				}
				settled = true
				clearTimeout(timer)
				this.idleWaiters.delete(onIdle)
				resolve(reportResult(drained))
			}
			const onIdle = () => settle(true)
			const timer = setTimeout(() => settle(false), timeoutMs)
			this.idleWaiters.add(onIdle)
		})
	}

	readiness(): IRuntimeReadiness {
		const admission = this.diagnostics?.()
		const admitted = admission ? admission.reason === 'ready' : this.readinessGuard()
		const status = this.drainState ? 'draining' : !admitted ? 'unready' : this.withdrawal ? 'withdrawing' : 'ready'
		const diagnostic = `${status}:${admission?.reason}`
		if (diagnostic !== this.lastDiagnostic) {
			this.lastDiagnostic = diagnostic
			this.logger.log(JSON.stringify({ event: 'runtime.readiness.changed', status, admission }))
		}
		return {
			status,
			...(admission ? { admission } : {}),
			instanceId: this.instanceId,
			activeRequests: this.activeRequests,
			...(this.drainState ?? this.withdrawal ?? {})
		}
	}
}
