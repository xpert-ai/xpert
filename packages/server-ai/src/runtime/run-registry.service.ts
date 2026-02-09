import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_RUNTIME_CONFIG, LaneName, RunMetadata, RunOptions, RunSource } from './types'

/**
 * RunRegistryService - Tracks all active execution runs
 *
 * Maintains a registry of active runs with their metadata,
 * enabling cancellation by runId or sessionKey.
 */
@Injectable()
export class RunRegistryService implements OnModuleDestroy {
	readonly #logger = new Logger(RunRegistryService.name)
	readonly #runs = new Map<string, RunMetadata>()
	readonly #sessionToRuns = new Map<string, Set<string>>()
	private sweepTimer?: NodeJS.Timeout

	constructor() {
		// Start periodic sweep for expired runs
		const ttlMs = parseInt(process.env.XPERT_RUN_TTL_MS || '') || DEFAULT_RUNTIME_CONFIG.runTtlMs
		this.sweepTimer = setInterval(() => this.sweepExpired(), ttlMs / 2)
	}

	onModuleDestroy() {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer)
		}
		// Abort all remaining runs
		for (const [runId, meta] of this.#runs) {
			if (!meta.controller.signal.aborted) {
				meta.controller.abort('Module destroyed')
			}
		}
		this.#runs.clear()
		this.#sessionToRuns.clear()
	}

	/**
	 * Generate a new run ID
	 */
	generateRunId(): string {
		return uuidv4()
	}

	/**
	 * Register a new run
	 */
	registerRun(options: RunOptions): RunMetadata {
		const ttlMs = parseInt(process.env.XPERT_RUN_TTL_MS || '') || DEFAULT_RUNTIME_CONFIG.runTtlMs
		const now = Date.now()

		const metadata: RunMetadata = {
			runId: options.runId,
			sessionKey: options.sessionKey,
			lane: options.globalLane || 'main',
			source: options.source || 'chat',
			startedAt: now,
			expiresAt: options.timeoutMs ? now + options.timeoutMs : now + ttlMs,
			controller: options.abortController,
			conversationId: options.conversationId,
			executionId: options.executionId,
			integrationId: options.integrationId,
			userId: options.userId,
			tenantId: options.tenantId
		}

		this.#runs.set(options.runId, metadata)

		// Index by sessionKey
		let sessionRuns = this.#sessionToRuns.get(options.sessionKey)
		if (!sessionRuns) {
			sessionRuns = new Set()
			this.#sessionToRuns.set(options.sessionKey, sessionRuns)
		}
		sessionRuns.add(options.runId)

		this.#logger.debug(`Registered run ${options.runId} for session ${options.sessionKey}`)
		return metadata
	}

	/**
	 * Complete (unregister) a run
	 */
	completeRun(runId: string): boolean {
		const meta = this.#runs.get(runId)
		if (!meta) {
			return false
		}

		this.#runs.delete(runId)

		// Remove from session index
		const sessionRuns = this.#sessionToRuns.get(meta.sessionKey)
		if (sessionRuns) {
			sessionRuns.delete(runId)
			if (sessionRuns.size === 0) {
				this.#sessionToRuns.delete(meta.sessionKey)
			}
		}

		this.#logger.debug(`Completed run ${runId}`)
		return true
	}

	/**
	 * Get run metadata by ID
	 */
	getRun(runId: string): RunMetadata | undefined {
		return this.#runs.get(runId)
	}

	/**
	 * Get all runs for a session
	 */
	getRunsBySession(sessionKey: string): RunMetadata[] {
		const runIds = this.#sessionToRuns.get(sessionKey)
		if (!runIds) return []

		return Array.from(runIds)
			.map(id => this.#runs.get(id))
			.filter((m): m is RunMetadata => m !== undefined)
	}

	/**
	 * Get all runs by conversationId
	 */
	getRunsByConversation(conversationId: string): RunMetadata[] {
		return Array.from(this.#runs.values())
			.filter(m => m.conversationId === conversationId)
	}

	/**
	 * Abort a run by ID
	 */
	abortByRunId(runId: string, reason?: string): boolean {
		const meta = this.#runs.get(runId)
		if (!meta) {
			return false
		}

		if (!meta.controller.signal.aborted) {
			this.#logger.log(`Aborting run ${runId}: ${reason || 'canceled'}`)
			meta.controller.abort(reason)
		}

		return this.completeRun(runId)
	}

	/**
	 * Abort all runs for a session
	 */
	abortBySessionKey(sessionKey: string, reason?: string): string[] {
		const runIds = this.#sessionToRuns.get(sessionKey)
		if (!runIds || runIds.size === 0) {
			return []
		}

		const aborted: string[] = []
		for (const runId of Array.from(runIds)) {
			if (this.abortByRunId(runId, reason)) {
				aborted.push(runId)
			}
		}

		this.#logger.log(`Aborted ${aborted.length} runs for session ${sessionKey}`)
		return aborted
	}

	/**
	 * Abort all runs for a conversation
	 */
	abortByConversation(conversationId: string, reason?: string): string[] {
		const runs = this.getRunsByConversation(conversationId)
		const aborted: string[] = []

		for (const meta of runs) {
			if (this.abortByRunId(meta.runId, reason)) {
				aborted.push(meta.runId)
			}
		}

		return aborted
	}

	/**
	 * Sweep expired runs
	 */
	sweepExpired(): number {
		const now = Date.now()
		let swept = 0

		for (const [runId, meta] of this.#runs) {
			if (meta.expiresAt && meta.expiresAt < now) {
				if (!meta.controller.signal.aborted) {
					meta.controller.abort('Run expired')
				}
				this.completeRun(runId)
				swept++
			}
		}

		if (swept > 0) {
			this.#logger.log(`Swept ${swept} expired runs`)
		}

		return swept
	}

	/**
	 * Get all active runs
	 */
	getAllRuns(): RunMetadata[] {
		return Array.from(this.#runs.values())
	}

	/**
	 * Get count of active runs
	 */
	getRunCount(): number {
		return this.#runs.size
	}

	/**
	 * Get count by lane
	 */
	getRunCountByLane(lane: LaneName): number {
		return Array.from(this.#runs.values()).filter(m => m.lane === lane).length
	}

	/**
	 * Get count by source
	 */
	getRunCountBySource(source: RunSource): number {
		return Array.from(this.#runs.values()).filter(m => m.source === source).length
	}
}
