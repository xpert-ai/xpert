import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import {
	DEFAULT_RUNTIME_CONFIG,
	LaneName,
	LaneState,
	LaneStats,
	QueueEntry,
	RuntimeConfig
} from './types'

/**
 * LaneQueueService - Core queue management for Two-Gate Architecture
 *
 * Manages concurrent execution across different lanes (main, subagent, cron, nested).
 * Each lane has configurable max concurrency.
 */
@Injectable()
export class LaneQueueService implements OnModuleDestroy {
	readonly #logger = new Logger(LaneQueueService.name)
	readonly #lanes = new Map<string, LaneState>()
	readonly #config: RuntimeConfig

	constructor() {
		this.#config = this.loadConfig()
		this.initializeLanes()
	}

	private loadConfig(): RuntimeConfig {
		return {
			lanes: {
				main: parseInt(process.env.XPERT_LANE_MAIN_CONCURRENCY || '') || DEFAULT_RUNTIME_CONFIG.lanes.main,
				subagent: parseInt(process.env.XPERT_LANE_SUBAGENT_CONCURRENCY || '') || DEFAULT_RUNTIME_CONFIG.lanes.subagent,
				cron: parseInt(process.env.XPERT_LANE_CRON_CONCURRENCY || '') || DEFAULT_RUNTIME_CONFIG.lanes.cron,
				nested: parseInt(process.env.XPERT_LANE_NESTED_CONCURRENCY || '') || DEFAULT_RUNTIME_CONFIG.lanes.nested
			},
			runTtlMs: parseInt(process.env.XPERT_RUN_TTL_MS || '') || DEFAULT_RUNTIME_CONFIG.runTtlMs,
			queueWaitWarnMs: parseInt(process.env.XPERT_QUEUE_WAIT_WARN_MS || '') || DEFAULT_RUNTIME_CONFIG.queueWaitWarnMs
		}
	}

	private initializeLanes() {
		for (const [lane, maxConcurrent] of Object.entries(this.#config.lanes)) {
			this.#lanes.set(lane, {
				lane,
				active: 0,
				maxConcurrent,
				queue: [],
				draining: false
			})
		}
		this.#logger.log(`Initialized lanes: ${JSON.stringify(this.#config.lanes)}`)
	}

	onModuleDestroy() {
		// Drain all lanes on shutdown
		for (const [lane] of this.#lanes) {
			this.clearLane(lane)
		}
	}

	/**
	 * Enqueue a task in a specific lane
	 */
	async enqueueInLane<T>(
		lane: LaneName,
		task: () => Promise<T>,
		signal?: AbortSignal
	): Promise<T> {
		const state = this.#lanes.get(lane)
		if (!state) {
			throw new Error(`Unknown lane: ${lane}`)
		}

		if (state.draining) {
			throw new Error(`Lane ${lane} is draining, not accepting new tasks`)
		}

		// Check if already aborted
		if (signal?.aborted) {
			throw new Error('Task aborted before enqueue')
		}

		return new Promise<T>((resolve, reject) => {
			const entry: QueueEntry<T> = {
				id: uuidv4(),
				task,
				enqueuedAt: Date.now(),
				resolve: resolve as (value: unknown) => void,
				reject,
				signal
			}

			// Setup abort listener
			if (signal) {
				const abortHandler = () => {
					// Remove from queue if still queued
					const index = state.queue.findIndex(e => e.id === entry.id)
					if (index >= 0) {
						state.queue.splice(index, 1)
						reject(new Error('Task aborted while queued'))
					}
				}
				signal.addEventListener('abort', abortHandler, { once: true })
			}

			state.queue.push(entry as QueueEntry)
			this.processQueue(lane)
		})
	}

	/**
	 * Process queued tasks for a lane
	 */
	private processQueue(lane: string) {
		const state = this.#lanes.get(lane)
		if (!state) return

		while (state.active < state.maxConcurrent && state.queue.length > 0) {
			const entry = state.queue.shift()
			if (!entry) break

			// Skip if already aborted
			if (entry.signal?.aborted) {
				entry.reject(new Error('Task aborted'))
				continue
			}

			// Check wait time warning
			const waitTime = Date.now() - entry.enqueuedAt
			if (waitTime > this.#config.queueWaitWarnMs) {
				this.#logger.warn(`Task in lane ${lane} waited ${waitTime}ms in queue`)
			}

			state.active++

			entry
				.task()
				.then((result) => {
					entry.resolve(result)
				})
				.catch((error) => {
					entry.reject(error)
				})
				.finally(() => {
					state.active--
					this.processQueue(lane)
				})
		}
	}

	/**
	 * Set concurrency for a lane (dynamic adjustment)
	 */
	setLaneConcurrency(lane: LaneName, maxConcurrent: number) {
		const state = this.#lanes.get(lane)
		if (!state) {
			throw new Error(`Unknown lane: ${lane}`)
		}
		state.maxConcurrent = maxConcurrent
		this.#logger.log(`Lane ${lane} concurrency set to ${maxConcurrent}`)
		// Trigger processing in case we increased concurrency
		this.processQueue(lane)
	}

	/**
	 * Clear all queued tasks in a lane
	 */
	clearLane(lane: string) {
		const state = this.#lanes.get(lane)
		if (!state) return

		state.draining = true
		const rejected = state.queue.length
		for (const entry of state.queue) {
			entry.reject(new Error(`Lane ${lane} cleared`))
		}
		state.queue = []
		this.#logger.log(`Cleared ${rejected} tasks from lane ${lane}`)
	}

	/**
	 * Get statistics for a lane
	 */
	getLaneStats(lane: string): LaneStats | null {
		const state = this.#lanes.get(lane)
		if (!state) return null

		return {
			lane: state.lane,
			active: state.active,
			queued: state.queue.length,
			maxConcurrent: state.maxConcurrent,
			draining: state.draining
		}
	}

	/**
	 * Get statistics for all lanes
	 */
	getAllLaneStats(): LaneStats[] {
		return Array.from(this.#lanes.values()).map(state => ({
			lane: state.lane,
			active: state.active,
			queued: state.queue.length,
			maxConcurrent: state.maxConcurrent,
			draining: state.draining
		}))
	}

	/**
	 * Get config
	 */
	getConfig(): RuntimeConfig {
		return { ...this.#config }
	}
}
