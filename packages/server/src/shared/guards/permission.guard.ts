import { PermissionsEnum } from '@xpert-ai/contracts'
import { isEmpty, PERMISSIONS_METADATA, removeDuplicates } from '@xpert-ai/server-common'
import { CanActivate, ExecutionContext, Injectable, Logger, Type } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from './../../core/context'
import { CheckRolePermissionCommand } from '../../role-permission/commands/index'

@Injectable()
export class PermissionGuard implements CanActivate {
	readonly #logger = new Logger(PermissionGuard.name)

	constructor(
		private readonly _reflector: Reflector,
		private readonly _commandBus: CommandBus
	) {}

	/**
	 * Checks if the user is authorized based on specified permissions.
	 * @param context The execution context.
	 * @returns A promise that resolves to a boolean indicating authorization status.
	 */
	async canActivate(context: ExecutionContext): Promise<boolean> {
		this.#logger.verbose('PermissionGuard canActivate called')

		// Retrieve permissions from metadata
		const targets: Array<Function | Type<any>> = [context.getHandler(), context.getClass()]
		const permissions =
			removeDuplicates(this._reflector.getAllAndOverride<PermissionsEnum[]>(PERMISSIONS_METADATA, targets)) || []

		// If no specific permissions are required, consider it authorized
		if (isEmpty(permissions)) {
			return true
		}

		// Check user authorization
		const currentUser = RequestContext.currentUser()
		const id = currentUser?.id
		const role = currentUser?.role?.name ?? currentUser?.roleId

		// Retrieve current role ID and tenant ID from RequestContext
		const tenantId = RequestContext.currentTenantId()
		const roleId = RequestContext.currentRoleId()
		if (!currentUser || !tenantId || !roleId) {
			this.#logger.warn(
				`Authorization context missing: userId=${id ?? 'unknown'}, tenantId=${tenantId ?? 'unknown'}, roleId=${roleId ?? 'unknown'}`
			)
			return false
		}

		// Authentication reloads grants for each request and applies token limits. An empty list denies access.
		// Only an unloaded relation (e.g. Basic authentication) needs a database lookup; never cache across requests.
		const grants = currentUser.role?.rolePermissions
		const isAuthorized =
			grants != null
				? grants.some(
						(grant) =>
							grant.tenantId === tenantId &&
							grant.roleId === roleId &&
							grant.enabled &&
							permissions.some((permission) => permission === grant.permission)
					)
				: await this._commandBus.execute<CheckRolePermissionCommand, boolean>(
						new CheckRolePermissionCommand(tenantId, roleId, permissions, true)
					)

		// Log unauthorized access attempts
		if (!isAuthorized) {
			// Log unauthorized access attempts
			this.#logger.verbose(
				`Unauthorized access blocked: User ID: ${id}, Role: ${role}, Tenant ID:', ${tenantId}, Permissions Checked: ${permissions.join(
					', '
				)}`
			)
		} else {
			this.#logger.verbose(
				`Access granted.  User ID: ${id}, Role: ${role}, Tenant ID:', ${tenantId}, Permissions Checked: ${permissions.join(
					', '
				)}`
			)
		}

		return isAuthorized
	}
}
