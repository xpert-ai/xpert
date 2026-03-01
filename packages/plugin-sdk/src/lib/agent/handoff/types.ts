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


/**
 * Handoff message envelope (v1).
 * Using `type` with a string allows plugins to dynamically expand at runtime without needing to modify the core type definition.
 */
export interface HandoffMessage<TPayload extends Record<string, unknown> = Record<string, unknown>> {
	id: string
	/**
	 * Message type, used for processor resolution.
	 */
	type: string
	
	version: number

	tenantId: string

	sessionKey: string

	businessKey: string
	attempt: number
	maxAttempts: number
	enqueuedAt: number

	traceId: string
	parentMessageId?: string

	payload: TPayload
	headers?: HandoffMessageHeaders
}

export interface HandoffMessageHeaders extends Record<string, string> {
	organizationId?: string
	userId?: string
	language?: string
	threadId?: string
	conversationId?: string
	sourceAgent?: string
	targetAgent?: string
	source?: RunSource
	requestedLane?: LaneName
	integrationId?: string
}

/**
 * Processor execution policy: declared by the Processor, executed uniformly by the Dispatcher.
 */
export interface ProcessorPolicy {
	lane: LaneName
	timeoutMs?: number
}

export interface ProcessContext {
	runId: string
	traceId: string
	abortSignal: AbortSignal
	/**
	 * Optional local-process event channel for queue waiters (e.g. SSE connection awaiting this message).
	 * This is intentionally process-local and best-effort.
	 */
	emit?: (event: unknown) => void
}

export type ProcessResult =
	| {
		status: 'ok'
		outbound?: HandoffMessage[]
	}
	| {
		status: 'retry'
		delayMs: number
		reason?: string
	}
	| {
		status: 'dead'
		reason: string
	}
