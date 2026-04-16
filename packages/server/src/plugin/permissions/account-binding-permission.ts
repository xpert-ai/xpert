import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import {
	AccountBindingPermission,
	AccountBindingPermissionOperation,
	AccountBindingPermissionService,
	BindCurrentUserInput,
	Permissions,
	RequestContext,
	RequirePermissionOperation,
	ResolveBoundUserInput
} from '@xpert-ai/plugin-sdk'
import { AccountBindingService } from '../../account-binding/account-binding.service'
import {
	createOperationGuardedPermissionService,
	resolvePermissionOperations
} from './service-permission-guard'

const ACCOUNT_BINDING_ALL_OPERATIONS = ['read', 'write', 'delete'] as const

function resolveAccountBindingOperations(
	permissions: Permissions
): Set<AccountBindingPermissionOperation> {
	return resolvePermissionOperations<AccountBindingPermissionOperation>(
		permissions,
		'account_binding',
		ACCOUNT_BINDING_ALL_OPERATIONS,
		(operation): operation is AccountBindingPermissionOperation =>
			operation === 'read' || operation === 'write' || operation === 'delete'
	)
}

function resolveAllowedProviders(permissions: Permissions): Set<string> | null {
	const permission = permissions.find(
		(item): item is AccountBindingPermission => item.type === 'account_binding'
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

function resolveRequestedProvider(property: PropertyKey, args: any[]): string | undefined {
	if (property === 'bindCurrentUser' || property === 'resolveBoundUser') {
		return args[0]?.provider
	}

	if (property === 'unbindCurrentUser') {
		return args[0]
	}

	return undefined
}

export function createGuardedAccountBindingPermissionService(
	pluginName: string,
	service: AccountBindingPermissionService,
	permissions: Permissions
): AccountBindingPermissionService {
	const operationGuardedService =
		createOperationGuardedPermissionService<
			AccountBindingPermissionOperation,
			AccountBindingPermissionService
		>(
			pluginName,
			'account_binding',
			service,
			permissions,
			resolveAccountBindingOperations
		)
	const allowedProviders = resolveAllowedProviders(permissions)
	const methodCache = new Map<PropertyKey, unknown>()

	if (!allowedProviders || allowedProviders.size === 0) {
		return operationGuardedService
	}

	return new Proxy(operationGuardedService, {
		get(target, property, receiver) {
			const cached = methodCache.get(property)
			if (cached) {
				return cached
			}

			const value = Reflect.get(target as object, property, receiver)
			if (typeof value !== 'function') {
				return value
			}

			const guardedMethod = (...args: any[]) => {
				const provider = resolveRequestedProvider(property, args)
				if (!provider || !allowedProviders.has(provider)) {
					throw new Error(
						`Plugin '${pluginName}' attempted account_binding provider '${provider}' without declaring it in 'account_binding.providers'.`
					)
				}

				return value.apply(target, args)
			}

			methodCache.set(property, guardedMethod)
			return guardedMethod
		}
	}) as AccountBindingPermissionService
}

@Injectable()
export class PluginAccountBindingPermissionService implements AccountBindingPermissionService {
	constructor(private readonly moduleRef: ModuleRef) {}

	@RequirePermissionOperation('account_binding', 'write')
	async bindCurrentUser(input: BindCurrentUserInput) {
		const tenantId = RequestContext.getScope()?.tenantId ?? null
		const userId = RequestContext.currentUserId()

		if (!userId) {
			throw new UnauthorizedException('Unauthorized')
		}

		if (!tenantId) {
			throw new BadRequestException('Tenant scope is required.')
		}

		const accountBindingService = this.getAccountBindingService()
		const binding = await accountBindingService.bindUser({
			tenantId,
			userId,
			provider: input?.provider,
			subjectId: input?.subjectId,
			profile: input?.profile
		})

		return {
			provider: binding.provider,
			subjectId: binding.subjectId
		}
	}

	@RequirePermissionOperation('account_binding', 'read')
	async resolveBoundUser<TUser = any>(input: ResolveBoundUserInput): Promise<TUser | null> {
		const contextTenantId = RequestContext.getScope()?.tenantId ?? null
		const tenantId = input?.tenantId ?? contextTenantId

		if (!tenantId) {
			return null
		}

		const accountBindingService = this.getAccountBindingService()
		return (await accountBindingService.resolveUser({
			tenantId,
			provider: input?.provider,
			subjectId: input?.subjectId
		})) as TUser | null
	}

	@RequirePermissionOperation('account_binding', 'delete')
	async unbindCurrentUser(provider: string): Promise<void> {
		const tenantId = RequestContext.getScope()?.tenantId ?? null
		const userId = RequestContext.currentUserId()

		if (!userId) {
			throw new UnauthorizedException('Unauthorized')
		}

		if (!tenantId) {
			throw new BadRequestException('Tenant scope is required.')
		}

		const accountBindingService = this.getAccountBindingService()
		await accountBindingService.unbindUser({
			tenantId,
			userId,
			provider
		})
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
}
