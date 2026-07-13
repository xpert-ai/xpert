import type { ManagedQueueExecutionPool } from '@xpert-ai/plugin-sdk'

export const MANAGED_QUEUE_PHYSICAL_QUEUE_NAME = 'plugin-jobs'
export const MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME = 'plugin-jobs-sandbox-browser'
export const MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX = 'xpert:managed-queue'

export const MANAGED_QUEUE_NAMES: Record<ManagedQueueExecutionPool, string> = {
	default: MANAGED_QUEUE_PHYSICAL_QUEUE_NAME,
	'sandbox-browser': MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME
}

export type ManagedQueueEnvelope<TPayload = unknown> = {
	pluginName: string
	queueName: string
	jobName: string
	payload: TPayload
	tenantId?: string | null
	organizationId?: string | null
	scopeKey?: string | null
	userId?: string | null
	executionPool?: ManagedQueueExecutionPool
	enqueuedAt: string
}
