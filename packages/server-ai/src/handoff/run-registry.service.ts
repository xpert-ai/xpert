import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_EXECUTION_CONFIG, LaneName, RunMetadata, RunOptions, RunSource } from './types'

/**
 * Tracks in-flight run controllers and indexes for local cancellation/lookups.
 * No lane/session gating is performed here.
 */
@Injectable()
export class RunRegistryService implements OnModuleDestroy {
	readonly #logger = new Logger(RunRegistryService.name)
	readonly #runs = new Map<string, RunMetadata>()
	readonly #sessionToRuns = new Map<string, Set<string>>()
	private sweepTimer?: NodeJS.Timeout

	constructor() {
		const ttlMs = parseInt(process.env.XPERT_RUN_TTL_MS || '', 10) || DEFAULT_EXECUTION_CONFIG.runTtlMs
		this.sweepTimer = setInterval(() => this.sweepExpired(), Math.max(1000, Math.floor(ttlMs / 2)))
		this.sweepTimer.unref?.()
	}

	onModuleDestroy() {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer)
		}
		for (const meta of this.#runs.values()) {
			if (!meta.controller.signal.aborted) {
				meta.controller.abort('Module destroyed')
			}
		}
		this.#runs.clear()
		this.#sessionToRuns.clear()
	}

	generateRunId(): string {
		return uuidv4()
	}

	registerRun(options: RunOptions): RunMetadata {
		const ttlMs = parseInt(process.env.XPERT_RUN_TTL_MS || '', 10) || DEFAULT_EXECUTION_CONFIG.runTtlMs
		const now = Date.now()
		const sessionKey = options.sessionKey ?? `run:${options.runId}`

		const metadata: RunMetadata = {
			runId: options.runId,
			sessionKey,
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

		let sessionRuns = this.#sessionToRuns.get(sessionKey)
		if (!sessionRuns) {
			sessionRuns = new Set()
			this.#sessionToRuns.set(sessionKey, sessionRuns)
		}
		sessionRuns.add(options.runId)

		this.#logger.debug(`Registered run ${options.runId} for session ${sessionKey}`)
		return metadata
	}

	completeRun(runId: string): boolean {
		const meta = this.#runs.get(runId)
		if (!meta) {
			return false
		}

		this.#runs.delete(runId)

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

	getRun(runId: string): RunMetadata | undefined {
		return this.#runs.get(runId)
	}

	getRunsBySession(sessionKey: string): RunMetadata[] {
		const runIds = this.#sessionToRuns.get(sessionKey)
		if (!runIds) return []

		return Array.from(runIds)
			.map((id) => this.#runs.get(id))
			.filter((m): m is RunMetadata => m !== undefined)
	}

	getRunsByConversation(conversationId: string): RunMetadata[] {
		return Array.from(this.#runs.values()).filter((m) => m.conversationId === conversationId)
	}

	getRunsByIntegration(integrationId: string): RunMetadata[] {
		return Array.from(this.#runs.values()).filter((m) => m.integrationId === integrationId)
	}

	abortByRunId(runId: string, reason?: string): boolean {
		const meta = this.#runs.get(runId)
		if (!meta) {
			return false
		}

		if (!meta.controller.signal.aborted) {
			this.#logger.log(`Aborting run ${runId}: ${reason || 'canceled'}`)
			meta.controller.abort(reason)
		}

		return true
	}

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

	abortByIntegration(integrationId: string, reason?: string): string[] {
		const runs = this.getRunsByIntegration(integrationId)
		const aborted: string[] = []
		for (const meta of runs) {
			if (this.abortByRunId(meta.runId, reason)) {
				aborted.push(meta.runId)
			}
		}
		return aborted
	}

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

	getAllRuns(): RunMetadata[] {
		return Array.from(this.#runs.values())
	}

	getRunCount(): number {
		return this.#runs.size
	}

	getRunCountByLane(lane: LaneName): number {
		return Array.from(this.#runs.values()).filter((m) => m.lane === lane).length
	}

	getRunCountBySource(source: RunSource): number {
		return Array.from(this.#runs.values()).filter((m) => m.source === source).length
	}

	getRunCountByIntegration(integrationId: string): number {
		return Array.from(this.#runs.values()).filter((m) => m.integrationId === integrationId).length
	}
}
