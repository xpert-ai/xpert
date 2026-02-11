/**
 * Handoff execution types.
 *
 * Note:
 * - Two-gate lane/session permit logic has been removed.
 * - Lane is now an execution tag for observability and soft policy only.
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
	conversationId?: string
	executionId?: string
	integrationId?: string
	userId?: string
	tenantId?: string
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
	sessionKey?: string
	globalLane?: LaneName
	abortController: AbortController
	source?: RunSource
	conversationId?: string
	executionId?: string
	integrationId?: string
	userId?: string
	tenantId?: string
	timeoutMs?: number
}

export interface ExecutionConfig {
	lanes: Record<LaneName, number>
	runTtlMs: number
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
	lanes: {
		main: 8,
		subagent: 16,
		cron: 4,
		nested: 8
	},
	runTtlMs: 10 * 60 * 1000
}
