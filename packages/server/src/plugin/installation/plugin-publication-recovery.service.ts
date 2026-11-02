import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { PluginInstanceService } from '../plugin-instance.service'
import { RuntimeControlService } from '../../runtime-control/runtime-control.service'
import { withOrganizationPluginStoreLock } from '../organization-plugin.store'
import { replayPluginPublications } from './plugin-publication'

const MIN_POLL_DELAY_MS = 10_000
const MAX_POLL_DELAY_MS = 60_000

@Injectable()
export class PluginPublicationRecovery implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(PluginPublicationRecovery.name)
	private timer?: ReturnType<typeof setTimeout>
	private stopped = false
	private idleDelayMs = MIN_POLL_DELAY_MS

	constructor(
		private readonly instances: PluginInstanceService,
		private readonly runtime: RuntimeControlService
	) {}

	onApplicationBootstrap() {
		this.schedule(0)
	}
	onModuleDestroy() {
		this.stopped = true
		clearTimeout(this.timer)
	}

	private schedule(delay: number) {
		if (this.stopped) return
		this.timer = setTimeout(() => void this.recover(), delay)
		this.timer.unref()
	}

	private async recover() {
		let nextDelayMs = MIN_POLL_DELAY_MS
		try {
			// Avoid taking the filesystem lease on every idle poll; re-read inside it.
			if (await this.instances.hasPendingRuntimePublications()) {
				this.idleDelayMs = MIN_POLL_DELAY_MS
				await withOrganizationPluginStoreLock({}, (lease) =>
					replayPluginPublications(this.instances, this.runtime, lease)
				)
			} else {
				nextDelayMs = this.idleDelayMs
				this.idleDelayMs = Math.min(this.idleDelayMs * 2, MAX_POLL_DELAY_MS)
			}
		} catch {
			this.idleDelayMs = MIN_POLL_DELAY_MS
			this.logger.warn('Plugin publication recovery deferred; committed installation intents are retained')
		} finally {
			// Spread replicas across 80–100% of the delay, keeping the idle ceiling at 60 seconds.
			this.schedule(Math.floor(nextDelayMs * (0.8 + Math.random() * 0.2)))
		}
	}
}
