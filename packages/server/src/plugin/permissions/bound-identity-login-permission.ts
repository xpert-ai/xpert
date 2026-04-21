import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import {
	BoundIdentityLoginInput,
	BoundIdentityLoginPermission,
	BoundIdentityLoginPermissionOperation,
	BoundIdentityLoginPermissionService,
	Permissions,
	RequirePermissionOperation
} from '@xpert-ai/plugin-sdk'
import { AccountBindingService } from '../../account-binding/account-binding.service'
import { AuthService } from '../../auth/auth.service'
import {
	createOperationGuardedPermissionService,
	resolvePermissionOperations
} from './service-permission-guard'

const BOUND_IDENTITY_LOGIN_ALL_OPERATIONS = ['create'] as const

function resolveBoundIdentityLoginOperations(
	permissions: Permissions
): Set<BoundIdentityLoginPermissionOperation> {
	return resolvePermissionOperations<BoundIdentityLoginPermissionOperation>(
		permissions,
		'bound_identity_login',
		BOUND_IDENTITY_LOGIN_ALL_OPERATIONS,
		(operation): operation is BoundIdentityLoginPermissionOperation => operation === 'create'
	)
}

function resolveAllowedProviders(permissions: Permissions): Set<string> | null {
	const permission = permissions.find(
		(item): item is BoundIdentityLoginPermission => item.type === 'bound_identity_login'
	)

	if (!permission || !Array.isArray(permission.providers) || permission.providers.length === 0) {
		return null
	}

	return new Set(
		permission.providers.filter(
			(provider): provider is string => typeof provider === 'string' && provider.length > 0
		)
	)
}

export function createGuardedBoundIdentityLoginPermissionService(
	pluginName: string,
	service: BoundIdentityLoginPermissionService,
	permissions: Permissions
): BoundIdentityLoginPermissionService {
	const operationGuardedService =
		createOperationGuardedPermissionService<
			BoundIdentityLoginPermissionOperation,
			BoundIdentityLoginPermissionService
		>(
			pluginName,
			'bound_identity_login',
			service,
			permissions,
			resolveBoundIdentityLoginOperations
		)
	const allowedProviders = resolveAllowedProviders(permissions)

	if (!allowedProviders || allowedProviders.size === 0) {
		return operationGuardedService
	}

	return new Proxy(operationGuardedService, {
		get(target, property, receiver) {
			const value = Reflect.get(target as object, property, receiver)
			if (typeof value !== 'function' || property !== 'loginWithBoundIdentity') {
				return value
			}

			return (...args: any[]) => {
				const provider = args[0]?.provider
				if (!provider || !allowedProviders.has(provider)) {
					throw new Error(
						`Plugin '${pluginName}' attempted bound_identity_login provider '${provider}' without declaring it in 'bound_identity_login.providers'.`
					)
				}

				return value.apply(target, args)
			}
		}
	}) as BoundIdentityLoginPermissionService
}

@Injectable()
export class PluginBoundIdentityLoginPermissionService
	implements BoundIdentityLoginPermissionService
{
	constructor(private readonly moduleRef: ModuleRef) {}

	@RequirePermissionOperation('bound_identity_login', 'create')
	async loginWithBoundIdentity(
		input: BoundIdentityLoginInput
	) {
		const accountBindingService = this.getAccountBindingService()
		const user = await accountBindingService.resolveUser({
			tenantId: input?.tenantId,
			provider: input?.provider,
			subjectId: input?.subjectId
		})

		if (!user?.id) {
			return null
		}

		const authService = this.getAuthService()
		return authService.issueTokensForUser(user.id)
	}

	private getAccountBindingService(): AccountBindingService {
		try {
			const service = this.moduleRef.get(AccountBindingService, {
				strict: false
			})
			if (!service) {
				throw new Error('AccountBindingService is not available.')
			}
			return service
		} catch {
			throw new Error('AccountBindingService is not available.')
		}
	}

	private getAuthService(): AuthService {
		try {
			const service = this.moduleRef.get(AuthService, {
				strict: false
			})
			if (!service) {
				throw new Error('AuthService is not available.')
			}
			return service
		} catch {
			throw new Error('AuthService is not available.')
		}
	}
}
