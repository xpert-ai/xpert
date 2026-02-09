/**
 * Runtime module types for Two-Gate Execution Architecture
 *
 * Gate 1: Session Lane - ensures sequential execution within same session (maxConcurrent=1)
 * Gate 2: Global Lane - controls overall concurrency by lane type
 */

export type LaneName = 'main' | 'subagent' | 'cron' | 'nested'

export type RunSource = 'chat' | 'xpert' | 'lark' | 'analytics' | 'api'

export interface RunMetadata {
	runId: string
	sessionKey: string
	lane: LaneName
	source: RunSource
	startedAt: number
	expiresAt?: number
	controller: AbortController
	// Optional associations
	conversationId?: string
	executionId?: string
	integrationId?: string
	userId?: string
	tenantId?: string
}

export interface QueueEntry<T = unknown> {
	id: string
	task: () => Promise<T>
	enqueuedAt: number
	resolve: (value: T) => void
	reject: (error: unknown) => void
	signal?: AbortSignal
}

export interface LaneState {
	lane: string
	active: number
	maxConcurrent: number
	queue: QueueEntry[]
	draining: boolean
}

export interface LaneStats {
	lane: string
	active: number
	queued: number
	maxConcurrent: number
	draining: boolean
}

export interface RunOptions {
	runId: string
	sessionKey: string
	globalLane?: LaneName
	abortController: AbortController
	source?: RunSource
	// Optional metadata
	conversationId?: string
	executionId?: string
	integrationId?: string
	userId?: string
	tenantId?: string
	// Timeout
	timeoutMs?: number
}

export interface RuntimeConfig {
	lanes: Record<LaneName, number>
	runTtlMs: number
	queueWaitWarnMs: number
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
	lanes: {
		main: 8,
		subagent: 16,
		cron: 4,
		nested: 8
	},
	runTtlMs: 10 * 60 * 1000, // 10 minutes
	queueWaitWarnMs: 30 * 1000 // 30 seconds
}
