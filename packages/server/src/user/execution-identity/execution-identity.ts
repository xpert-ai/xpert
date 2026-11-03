// Invariants: only host identity adapters mint execution identities. Serialized queue
// payloads are references, never authenticated principals. Both context stores share one scope.
import type { IUser } from '@xpert-ai/contracts'
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { runWithRequestContext as runWithPluginContext } from '@xpert-ai/plugin-sdk'
import { runWithRequestContext as runWithLegacyContext } from '../../core/context/request-context.middleware'
import { t } from 'i18next'

export type ExecutionActorRef = {
	tenantId: string
	userId: string
	organizationId?: string | null
	kind: 'user' | 'service'
}

const identities = new WeakSet<object>()
const identityBrand: unique symbol = Symbol('resolved-execution-identity')

export type ResolvedExecutionIdentity = {
	readonly [identityBrand]: true
	readonly user: IUser
	readonly scope: Readonly<ExecutionActorRef>
}

export function executionIdentityError(incomplete = false) {
	const body = incomplete
		? {
				code: 'execution_identity_incomplete',
				message: t('server-ai:Error.ExecutionIdentityIncomplete', {
					defaultValue: 'Execution identity permissions were not loaded.'
				})
			}
		: {
				code: 'execution_identity_unavailable',
				message: t('server-ai:Error.ExecutionIdentityUnavailable', {
					defaultValue: 'The execution identity is no longer available in this scope.'
				})
			}
	return incomplete ? new ServiceUnavailableException(body) : new ForbiddenException(body)
}

/** Host adapter boundary; business consumers use ResolveExecutionIdentityCommand. */
export function createExecutionIdentity(user: IUser, scope: ExecutionActorRef): ResolvedExecutionIdentity {
	if (
		!scope.tenantId ||
		!scope.userId ||
		user.id !== scope.userId ||
		user.tenantId !== scope.tenantId ||
		user.isActive === false
	)
		throw executionIdentityError()
	if ((user.roleId && !user.role) || (user.role && !Array.isArray(user.role.rolePermissions)))
		throw executionIdentityError(true)
	const identity: ResolvedExecutionIdentity = { [identityBrand]: true, user, scope: Object.freeze({ ...scope }) }
	identities.add(identity)
	return identity
}

export function runWithExecutionIdentity<T>(
	identity: ResolvedExecutionIdentity,
	task: () => T | Promise<T>
): Promise<T> {
	if (!identities.has(identity)) return Promise.reject(executionIdentityError(true))
	const { user, scope } = identity
	const request = {
		user,
		headers: {
			'tenant-id': scope.tenantId,
			'x-scope-level': scope.organizationId ? 'organization' : 'tenant',
			...(scope.organizationId ? { 'organization-id': scope.organizationId } : {}),
			...(user.preferredLanguage ? { language: user.preferredLanguage } : {})
		}
	}
	return new Promise<T>((resolve, reject) => {
		runWithPluginContext(request, {}, () =>
			runWithLegacyContext(request, () => {
				Promise.resolve().then(task).then(resolve, reject)
			})
		)
	})
}
