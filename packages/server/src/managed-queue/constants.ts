import type { ManagedQueueExecutionPool } from '@xpert-ai/plugin-sdk'
import type { ApiKeyBindingType, ApiPrincipalType, SecretTokenBindingType } from '@xpert-ai/contracts'

export const MANAGED_QUEUE_PHYSICAL_QUEUE_NAME = 'plugin-jobs'
export const MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME = 'plugin-jobs-sandbox-browser'
/**
 * BullMQ keys must be isolated when independent Xpert environments share Redis.
 * Replicas of one environment should use the same explicit prefix; local clones
 * can use different prefixes so a worker without that clone's plugin handlers
 * cannot consume its jobs.
 */
export const MANAGED_QUEUE_PHYSICAL_QUEUE_PREFIX = managedQueuePhysicalQueuePrefix()

export const MANAGED_QUEUE_NAMES: Record<ManagedQueueExecutionPool, string> = {
	default: MANAGED_QUEUE_PHYSICAL_QUEUE_NAME,
	'sandbox-browser': MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME
}

export function managedQueuePhysicalQueuePrefix(environment: NodeJS.ProcessEnv = process.env) {
	const value = environment.MANAGED_QUEUE_PREFIX?.trim()
	if (!value) return 'xpert:managed-queue'
	if (value.length > 160 || !/^[a-zA-Z0-9:_-]+$/.test(value)) {
		throw new Error(
			'MANAGED_QUEUE_PREFIX must contain only letters, numbers, colon, underscore, or hyphen and be at most 160 characters.'
		)
	}
	return value
}

/** Server-derived business actor captured when a plugin job is enqueued. */
export type ManagedQueueActorSnapshot = {
	userId: string
	tenantId: string
	organizationId?: string | null
	type: 'user' | 'delegated_user' | 'service'
}

/**
 * Server-derived, non-secret technical delegation captured separately from
 * the business actor. API key tokens are never persisted in BullMQ.
 */
export type ManagedQueueDelegationSnapshot = {
	tenantId: string
	organizationId?: string | null
	principalType: ApiPrincipalType
	ownerUserId?: string | null
	apiKeyUserId?: string | null
	requestedUserId?: string | null
	requestedOrganizationId?: string | null
	clientSecretBindingType?: SecretTokenBindingType | null
	clientSecretId?: string | null
	apiKey: {
		type?: ApiKeyBindingType
		entityId?: string | null
		tenantId: string
		organizationId?: string | null
		userId?: string | null
	}
}

/** @deprecated Compatibility shape for jobs enqueued before actor/delegation separation. */
export type ManagedQueuePrincipalSnapshot = ManagedQueueDelegationSnapshot & {
	id?: string | null
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
	actor?: ManagedQueueActorSnapshot
	delegation?: ManagedQueueDelegationSnapshot
	/** @deprecated Read-only compatibility for already queued jobs. */
	principal?: ManagedQueuePrincipalSnapshot
	executionPool?: ManagedQueueExecutionPool
	enqueuedAt: string
}
