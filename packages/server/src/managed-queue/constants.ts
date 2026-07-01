export const MANAGED_QUEUE_PHYSICAL_QUEUE_NAME = 'plugin-jobs'
export const MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX = 'xpert:managed-queue'

export type ManagedQueueEnvelope<TPayload = unknown> = {
	pluginName: string
	queueName: string
	jobName: string
	payload: TPayload
	tenantId?: string | null
	organizationId?: string | null
	scopeKey?: string | null
	userId?: string | null
	enqueuedAt: string
}
