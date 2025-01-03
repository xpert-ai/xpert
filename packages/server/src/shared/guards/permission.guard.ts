import { PermissionsEnum } from '@metad/contracts';
import { isEmpty, PERMISSIONS_METADATA, removeDuplicates } from '@metad/server-common';
import { environment as env } from '@metad/server-config';
import { CACHE_MANAGER, CanActivate, ExecutionContext, Inject, Injectable, Logger, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CommandBus } from '@nestjs/cqrs';
import { Cache } from 'cache-manager';
import { verify } from 'jsonwebtoken';
import { RequestContext } from './../../core/context';
import { CheckRolePermissionCommand } from '../../role-permission/commands/index';

@Injectable()
export class PermissionGuard implements CanActivate {
	readonly #logger = new Logger(PermissionGuard.name)

	constructor(
		@Inject(CACHE_MANAGER) private cacheManager: Cache,
		private readonly _reflector: Reflector,
		private readonly _commandBus: CommandBus
	) {}

	/**
	 * Checks if the user is authorized based on specified permissions.
	 * @param context The execution context.
	 * @returns A promise that resolves to a boolean indicating authorization status.
	 */
	async canActivate(context: ExecutionContext): Promise<boolean> {
		this.#logger.verbose('PermissionGuard canActivate called');

		// Retrieve permissions from metadata
		const targets: Array<Function | Type<any>> = [context.getHandler(), context.getClass()];
		const permissions =
			removeDuplicates(this._reflector.getAllAndOverride<PermissionsEnum[]>(PERMISSIONS_METADATA, targets)) || [];

		// If no specific permissions are required, consider it authorized
		if (isEmpty(permissions)) {
			return true;
		}

		// Check user authorization
		const token = RequestContext.currentToken();

		const { id, role } = verify(token, env.JWT_SECRET) as { id: string; role: string };

		// Retrieve current role ID and tenant ID from RequestContext
		const tenantId = RequestContext.currentTenantId();
		const roleId = RequestContext.currentRoleId();

		const cacheKey = `userPermissions_${tenantId}_${roleId}_${permissions.join('_')}`;

		this.#logger.verbose('Checking User Permissions from Cache with key:', cacheKey);

		let isAuthorized = false;

		const fromCache = await this.cacheManager.get<boolean | null>(cacheKey);

		if (fromCache == null) {
			this.#logger.verbose('User Permissions NOT loaded from Cache with key:', cacheKey);

			// Check if user has the required permissions
			isAuthorized = await this._commandBus.execute(new CheckRolePermissionCommand(tenantId, roleId, permissions, true))

			await this.cacheManager.set(
				cacheKey,
				isAuthorized,
				5 * 60 * 1000 // 5 minutes cache expiration time for User Permissions
			);
		} else {
			isAuthorized = fromCache;
			this.#logger.verbose(`User Permissions loaded from Cache with key: ${cacheKey}. Value: ${isAuthorized}`);
		}

		// Log unauthorized access attempts
		if (!isAuthorized) {
			// Log unauthorized access attempts
			this.#logger.verbose(
				`Unauthorized access blocked: User ID: ${id}, Role: ${role}, Tenant ID:', ${tenantId}, Permissions Checked: ${permissions.join(
					', '
				)}`
			);
		} else {
			this.#logger.verbose(
				`Access granted.  User ID: ${id}, Role: ${role}, Tenant ID:', ${tenantId}, Permissions Checked: ${permissions.join(
					', '
				)}`
			);
		}

		return isAuthorized;
	}
}
