import { RolesEnum } from '@metad/contracts';
import { isEmpty, ROLES_METADATA } from '@metad/server-common';
import { Injectable, CanActivate, ExecutionContext, Type, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from './../../core/context';

@Injectable()
export class RoleGuard implements CanActivate {
	readonly #logger = new Logger(RoleGuard.name)
	
	constructor(private readonly _reflector: Reflector) {}

	/**
	 * Determines if the user associated with the request has the required roles.
	 * @param context The execution context of the request.
	 * @returns A boolean indicating whether the user has the required roles.
	 */
	async canActivate(context: ExecutionContext): Promise<boolean> {
		this.#logger.verbose('RoleGuard canActivate called');

		// Retrieve permissions from metadata
		const targets: Array<Function | Type<any>> = [context.getHandler(), context.getClass()];

		/*
		 * Retrieve metadata for a specified key for a specified set of roles
		 */
		const roles = this._reflector.getAllAndOverride<RolesEnum[]>(ROLES_METADATA, targets) || [];

		// Check if roles are empty or if the request context has the required roles
		const check = isEmpty(roles) || RequestContext.hasRoles(roles);

		this.#logger.verbose('Guard: Role', roles, check);

		return check;
	}
}