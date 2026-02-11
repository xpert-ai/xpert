import { Injectable } from '@nestjs/common'
import { LarkExecutionQueueService } from './lark-execution-queue.service'

export type ChannelAccountRuntime = {
	key: string
	channelType: string
	integrationId: string
	accountId: string
	running: boolean
	connected?: boolean
	lastStartAt?: number
	lastStopAt?: number
	lastError?: string | null
}

@Injectable()
export class LarkChannelRuntimeManager {
	private readonly accounts = new Map<string, ChannelAccountRuntime>()

	constructor(private readonly executionQueue: LarkExecutionQueueService) {}

	buildAccountKey(channelType: string, integrationId: string, accountId?: string): string {
		return `channel:${channelType}:integration:${integrationId}:account:${accountId || 'default'}`
	}

	isAccountRunning(channelType: string, integrationId: string, accountId?: string): boolean {
		return this.ensureAccount(channelType, integrationId, accountId).running
	}

	startAccount(channelType: string, integrationId: string, accountId?: string): ChannelAccountRuntime {
		const runtime = this.ensureAccount(channelType, integrationId, accountId)
		runtime.running = true
		runtime.lastStartAt = Date.now()
		runtime.lastError = null
		return { ...runtime }
	}

	stopAccount(
		channelType: string,
		integrationId: string,
		accountId?: string,
		reason?: string
	): { status: ChannelAccountRuntime; abortedRunIds: string[] } {
		const runtime = this.ensureAccount(channelType, integrationId, accountId)
		runtime.running = false
		runtime.lastStopAt = Date.now()

		const abortedRunIds = this.executionQueue.abortByAccount(
			runtime.key,
			reason || 'Channel account runtime stopped'
		)

		return {
			status: { ...runtime },
			abortedRunIds
		}
	}

	getAccountStatus(channelType: string, integrationId: string, accountId?: string) {
		const runtime = this.ensureAccount(channelType, integrationId, accountId)
		const runtimeInfo = this.executionQueue.getQueueInfo()
		return {
			...runtime,
			runtimeMode: runtimeInfo.mode,
			orderingScope: runtimeInfo.orderingScope,
			distributedSafe: runtimeInfo.distributedSafe,
			activeRuns: this.executionQueue.getAccountRunCount(runtime.key)
		}
	}

	listRuntimeSnapshot() {
		const runtimeInfo = this.executionQueue.getQueueInfo()
		return Array.from(this.accounts.values()).map((runtime) => ({
			...runtime,
			runtimeMode: runtimeInfo.mode,
			orderingScope: runtimeInfo.orderingScope,
			distributedSafe: runtimeInfo.distributedSafe,
			activeRuns: this.executionQueue.getAccountRunCount(runtime.key)
		}))
	}

	noteAccountError(channelType: string, integrationId: string, accountId: string | undefined, error: unknown) {
		const runtime = this.ensureAccount(channelType, integrationId, accountId)
		runtime.lastError = error instanceof Error ? error.message : `${error}`
	}

	private ensureAccount(channelType: string, integrationId: string, accountId?: string) {
		const key = this.buildAccountKey(channelType, integrationId, accountId)
		let runtime = this.accounts.get(key)
		if (!runtime) {
			runtime = {
				key,
				channelType,
				integrationId,
				accountId: accountId || 'default',
				running: true,
				lastError: null
			}
			this.accounts.set(key, runtime)
		}
		return runtime
	}
}
