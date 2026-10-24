/** Admission refresh has its own serial loop: slow rollout bookkeeping must not expire business admission. */
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { RuntimePluginAdmission } from './runtime-plugin-admission'
import type { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import type { RolloutAdmission } from './runtime-rollout-policy'

export class RuntimeAdmissionMonitor implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(RuntimeAdmissionMonitor.name)
	private readonly eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
	private timer?: ReturnType<typeof setInterval>
	private pending?: ReturnType<RuntimePluginAdmission['refresh']>
	constructor(
		private readonly admission: RuntimePluginAdmission,
		private readonly generations: PluginRuntimeGenerationStore,
		private readonly readRollout: () => Promise<RolloutAdmission | undefined>
	) {}
	onApplicationBootstrap(): void {
		this.start()
	}
	onModuleDestroy(): void {
		this.stop()
	}
	start(): void {
		if (this.timer) return
		this.eventLoopDelay.enable()
		this.timer = setInterval(() => {
			this.admission.recordEventLoopDelay(this.eventLoopDelay.max / 1e6, this.eventLoopDelay.percentile(99) / 1e6)
			this.eventLoopDelay.reset()
			void this.refresh().catch(() => undefined)
		}, 1_000)
		this.timer.unref?.()
	}
	stop(): void {
		clearInterval(this.timer)
		this.timer = undefined
		this.eventLoopDelay.disable()
	}
	refresh(): ReturnType<RuntimePluginAdmission['refresh']> {
		if (this.pending) return this.pending
		const startedAt = Date.now()
		this.pending = this.admission
			.refresh(this.generations, this.readRollout)
			.catch((error: unknown) => {
				this.logger.warn(
					JSON.stringify({
						event: 'runtime.admission.check-failed',
						durationMs: Date.now() - startedAt,
						error: error instanceof Error ? error.message : String(error)
					})
				)
				throw error
			})
			.finally(() => {
				const durationMs = Date.now() - startedAt
				if (durationMs >= 1_000)
					this.logger.warn(JSON.stringify({ event: 'runtime.admission.check-slow', durationMs }))
				this.pending = undefined
			})
		return this.pending
	}
}
