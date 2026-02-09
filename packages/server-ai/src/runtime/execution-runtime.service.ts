import { Injectable, Logger } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { LaneQueueService } from './lane-queue.service'
import { RunRegistryService } from './run-registry.service'
import { SessionKeyResolver } from './session-key.resolver'
import { LaneName, LaneStats, RunMetadata, RunOptions, RunSource } from './types'

/**
 * Session lane state for serial execution within a session
 */
interface SessionLaneState {
	active: boolean
	queue: Array<{
		id: string
		task: () => Promise<unknown>
		resolve: (value: unknown) => void
		reject: (error: unknown) => void
	}>
}

/**
 * ExecutionRuntimeService - Two-Gate Execution Controller
 *
 * Gate 1: Session Lane - ensures sequential execution within same session
 * Gate 2: Global Lane - controls overall concurrency by lane type
 *
 * Usage:
 * ```ts
 * await executionRuntime.run({
 *   runId,
 *   sessionKey,
 *   globalLane: 'main',
 *   abortController,
 *   task: async () => doExecute()
 * })
 * ```
 */
@Injectable()
export class ExecutionRuntimeService {
	readonly #logger = new Logger(ExecutionRuntimeService.name)
	readonly #sessionLanes = new Map<string, SessionLaneState>()

	constructor(
		private readonly laneQueue: LaneQueueService,
		readonly runRegistry: RunRegistryService,
		readonly sessionKeyResolver: SessionKeyResolver
	) {}

	/**
	 * Execute a task through two-gate system
	 *
	 * 1. First gate: Session lane (serial within session)
	 * 2. Second gate: Global lane (concurrent by type)
	 */
	async run<T>(
		options: RunOptions & { task: () => Promise<T> }
	): Promise<T> {
		const { runId, sessionKey, globalLane = 'main', abortController, task } = options

		// Check if already aborted
		if (abortController.signal.aborted) {
			throw new Error('Execution aborted before start')
		}

		// Register run
		const metadata = this.runRegistry.registerRun(options)

		try {
			// Gate 1: Session lane (serial execution)
			const result = await this.enqueueSession<T>(
				sessionKey,
				async () => {
					// Gate 2: Global lane (concurrent execution)
					return this.laneQueue.enqueueInLane<T>(
						globalLane,
						task,
						abortController.signal
					)
				},
				abortController.signal
			)

			return result
		} finally {
			// Always complete run
			this.runRegistry.completeRun(runId)
		}
	}

	/**
	 * Enqueue task in session lane for serial execution
	 */
	private async enqueueSession<T>(
		sessionKey: string,
		task: () => Promise<T>,
		signal?: AbortSignal
	): Promise<T> {
		// Get or create session lane
		let lane = this.#sessionLanes.get(sessionKey)
		if (!lane) {
			lane = { active: false, queue: [] }
			this.#sessionLanes.set(sessionKey, lane)
		}

		// Check if already aborted
		if (signal?.aborted) {
			throw new Error('Task aborted before session enqueue')
		}

		return new Promise<T>((resolve, reject) => {
			const entry = {
				id: uuidv4(),
				task,
				resolve: resolve as (value: unknown) => void,
				reject
			}

			// Setup abort listener
			if (signal) {
				const abortHandler = () => {
					const index = lane!.queue.findIndex(e => e.id === entry.id)
					if (index >= 0) {
						lane!.queue.splice(index, 1)
						reject(new Error('Task aborted while in session queue'))
					}
				}
				signal.addEventListener('abort', abortHandler, { once: true })
			}

			lane.queue.push(entry)
			this.processSessionQueue(sessionKey)
		})
	}

	/**
	 * Process session queue (one at a time)
	 */
	private async processSessionQueue(sessionKey: string) {
		const lane = this.#sessionLanes.get(sessionKey)
		if (!lane || lane.active || lane.queue.length === 0) {
			return
		}

		lane.active = true
		const entry = lane.queue.shift()!

		try {
			const result = await entry.task()
			entry.resolve(result)
		} catch (error) {
			entry.reject(error)
		} finally {
			lane.active = false

			// Process next in queue
			if (lane.queue.length > 0) {
				this.processSessionQueue(sessionKey)
			} else {
				// Clean up empty session lane
				this.#sessionLanes.delete(sessionKey)
			}
		}
	}

	/**
	 * Generate a new run ID
	 */
	generateRunId(): string {
		return this.runRegistry.generateRunId()
	}

	/**
	 * Abort by run ID
	 */
	abortByRunId(runId: string, reason?: string): boolean {
		return this.runRegistry.abortByRunId(runId, reason)
	}

	/**
	 * Abort all runs for a session
	 */
	abortBySessionKey(sessionKey: string, reason?: string): string[] {
		return this.runRegistry.abortBySessionKey(sessionKey, reason)
	}

	/**
	 * Abort all runs for a conversation
	 */
	abortByConversation(conversationId: string, reason?: string): string[] {
		return this.runRegistry.abortByConversation(conversationId, reason)
	}

	/**
	 * Get run by ID
	 */
	getRun(runId: string): RunMetadata | undefined {
		return this.runRegistry.getRun(runId)
	}

	/**
	 * Get all runs for a session
	 */
	getRunsBySession(sessionKey: string): RunMetadata[] {
		return this.runRegistry.getRunsBySession(sessionKey)
	}

	/**
	 * Get all runs for a conversation
	 */
	getRunsByConversation(conversationId: string): RunMetadata[] {
		return this.runRegistry.getRunsByConversation(conversationId)
	}

	/**
	 * Get lane statistics
	 */
	getLaneStats(lane: LaneName): LaneStats | null {
		return this.laneQueue.getLaneStats(lane)
	}

	/**
	 * Get all lane statistics
	 */
	getAllLaneStats(): LaneStats[] {
		return this.laneQueue.getAllLaneStats()
	}

	/**
	 * Get session queue depth
	 */
	getSessionQueueDepth(sessionKey: string): number {
		const lane = this.#sessionLanes.get(sessionKey)
		return lane ? lane.queue.length : 0
	}

	/**
	 * Get all session keys with active queues
	 */
	getActiveSessionKeys(): string[] {
		return Array.from(this.#sessionLanes.keys())
	}

	/**
	 * Get total run count
	 */
	getRunCount(): number {
		return this.runRegistry.getRunCount()
	}

	/**
	 * Get run count by lane
	 */
	getRunCountByLane(lane: LaneName): number {
		return this.runRegistry.getRunCountByLane(lane)
	}

	/**
	 * Get run count by source
	 */
	getRunCountBySource(source: RunSource): number {
		return this.runRegistry.getRunCountBySource(source)
	}
}
