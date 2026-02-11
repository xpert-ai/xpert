import { Injectable } from '@nestjs/common'
import { DEFAULT_EXECUTION_CONFIG, LaneName, LaneStats, RunMetadata, RunOptions, RunSource } from './types'
import { RunRegistryService } from './run-registry.service'
import { SessionKeyResolver } from './session-key.resolver'

const LANE_LIMITS: Record<LaneName, number> = {
	main: parseInt(process.env.XPERT_LANE_MAIN_CONCURRENCY || '', 10) || DEFAULT_EXECUTION_CONFIG.lanes.main,
	subagent:
		parseInt(process.env.XPERT_LANE_SUBAGENT_CONCURRENCY || '', 10) || DEFAULT_EXECUTION_CONFIG.lanes.subagent,
	cron: parseInt(process.env.XPERT_LANE_CRON_CONCURRENCY || '', 10) || DEFAULT_EXECUTION_CONFIG.lanes.cron,
	nested:
		parseInt(process.env.XPERT_LANE_NESTED_CONCURRENCY || '', 10) || DEFAULT_EXECUTION_CONFIG.lanes.nested
}

/**
 * Thin execution runner.
 *
 * No lane/session gate logic is applied.
 * Responsibilities:
 * - register in-flight run metadata
 * - wire timeout to AbortController
 * - provide local abort/query APIs
 */
@Injectable()
export class ExecutionQueueService {
	constructor(
		readonly runRegistry: RunRegistryService,
		readonly sessionKeyResolver: SessionKeyResolver
	) {}

	async run<T>(options: RunOptions & { task: (signal?: AbortSignal) => Promise<T> }): Promise<T> {
		const runId = options.runId
		const sessionKey = options.sessionKey ?? `run:${runId}`
		const lane = options.globalLane ?? 'main'
		const signal = options.abortController.signal

		if (signal.aborted) {
			throw new Error('Execution aborted before start')
		}

		this.runRegistry.registerRun({
			...options,
			sessionKey,
			globalLane: lane
		})

		let timeoutTimer: NodeJS.Timeout | undefined
		try {
			if (options.timeoutMs && options.timeoutMs > 0) {
				timeoutTimer = setTimeout(() => {
					if (!signal.aborted) {
						options.abortController.abort(`Run timeout after ${options.timeoutMs}ms`)
					}
				}, options.timeoutMs)
				timeoutTimer.unref?.()
			}

			return await options.task(signal)
		} finally {
			if (timeoutTimer) {
				clearTimeout(timeoutTimer)
			}
			this.runRegistry.completeRun(runId)
		}
	}

	generateRunId(): string {
		return this.runRegistry.generateRunId()
	}

	abortByRunId(runId: string, reason?: string): boolean {
		return this.runRegistry.abortByRunId(runId, reason)
	}

	abortBySessionKey(sessionKey: string, reason?: string): string[] {
		return this.runRegistry.abortBySessionKey(sessionKey, reason)
	}

	abortByConversation(conversationId: string, reason?: string): string[] {
		return this.runRegistry.abortByConversation(conversationId, reason)
	}

	abortByIntegration(integrationId: string, reason?: string): string[] {
		return this.runRegistry.abortByIntegration(integrationId, reason)
	}

	getRun(runId: string): RunMetadata | undefined {
		return this.runRegistry.getRun(runId)
	}

	getRunsBySession(sessionKey: string): RunMetadata[] {
		return this.runRegistry.getRunsBySession(sessionKey)
	}

	getRunsByConversation(conversationId: string): RunMetadata[] {
		return this.runRegistry.getRunsByConversation(conversationId)
	}

	getRunsByIntegration(integrationId: string): RunMetadata[] {
		return this.runRegistry.getRunsByIntegration(integrationId)
	}

	getRunCount(): number {
		return this.runRegistry.getRunCount()
	}

	getRunCountByLane(lane: LaneName): number {
		return this.runRegistry.getRunCountByLane(lane)
	}

	getRunCountBySource(source: RunSource): number {
		return this.runRegistry.getRunCountBySource(source)
	}

	getRunCountByIntegration(integrationId: string): number {
		return this.runRegistry.getRunCountByIntegration(integrationId)
	}

	getLaneStats(lane: LaneName): LaneStats {
		return {
			lane,
			active: this.getRunCountByLane(lane),
			queued: 0,
			maxConcurrent: Math.max(1, LANE_LIMITS[lane]),
			draining: false
		}
	}

	getAllLaneStats(): LaneStats[] {
		return (Object.keys(LANE_LIMITS) as LaneName[]).map((lane) => this.getLaneStats(lane))
	}
}
