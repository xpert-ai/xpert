import { IRuntimeReadiness } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

export interface RuntimeDrainState {
	restartId: string
	requestedAt: string
}

@Injectable()
export class RuntimeLifecycleService {
	readonly instanceId = `${hostname()}-${process.pid}-${randomUUID()}`

	private activeRequests = 0
	private drainState: RuntimeDrainState | null = null
	private readonly idleWaiters = new Set<() => void>()

	beginDrain(state: RuntimeDrainState): boolean {
		if (this.drainState) {
			return false
		}
		this.drainState = state
		return true
	}

	cancelDrain(restartId: string): void {
		if (this.drainState?.restartId === restartId) {
			this.drainState = null
		}
	}

	getDrainState(): RuntimeDrainState | null {
		return this.drainState ? { ...this.drainState } : null
	}

	trackRequest(): (() => void) | null {
		if (this.drainState) {
			return null
		}

		this.activeRequests += 1
		let released = false
		return () => {
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
		if (this.activeRequests === 0) {
			return true
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
				resolve(drained)
			}
			const onIdle = () => settle(true)
			const timer = setTimeout(() => settle(false), timeoutMs)
			this.idleWaiters.add(onIdle)
		})
	}

	readiness(): IRuntimeReadiness {
		return {
			status: this.drainState ? 'draining' : 'ready',
			instanceId: this.instanceId,
			activeRequests: this.activeRequests,
			...(this.drainState ?? {})
		}
	}
}
