import { LaneName, RunSource } from '../types'

/**
 * Handoff 消息信封（v1）。
 * `type` 使用 string，便于插件在运行时动态扩展，而不需要改核心类型定义。
 */
export interface HandoffMessage {
	id: string
	type: string
	version: number

	tenantId: string
	organizationId?: string
	userId?: string

	sessionKey: string
	threadId?: string
	conversationId?: string
	sourceAgent?: string
	targetAgent?: string

	businessKey: string
	attempt: number
	maxAttempts: number
	enqueuedAt: number

	traceId: string
	parentMessageId?: string
	source?: RunSource
	requestedLane?: LaneName

	payload: Record<string, unknown>
	headers?: Record<string, string>
}

/**
 * Processor 执行策略：由 Processor 声明，Dispatcher 统一执行。
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

/**
 * Handoff Processor 标准接口。
 * - Processor 只处理业务
 * - 调度、重试、并发、取消由 Dispatcher + Queue 统一处理
 */
export interface IHandoffProcessor {
	process(message: HandoffMessage, ctx: ProcessContext): Promise<ProcessResult>
}

export interface HandoffProcessorMetadata {
	types: string[]
	policy: ProcessorPolicy
}

export interface ResolvedHandoffProcessor {
	type: string
	processor: IHandoffProcessor
	metadata: HandoffProcessorMetadata
}

export interface IHandoffProcessorRegistry {
	resolve(type: string, organizationId?: string): ResolvedHandoffProcessor
	list(organizationId?: string): ResolvedHandoffProcessor[]
}
