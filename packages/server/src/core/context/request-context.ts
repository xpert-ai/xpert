import { HttpException, HttpStatus } from '@nestjs/common';
import {
	IUser,
	PermissionsEnum,
	LanguagesEnum,
	RolesEnum
} from '@metad/contracts';
import cls from 'cls-hooked';
import { ExtractJwt } from 'passport-jwt';

/**
 * @deprecated use RequestContext from @xpert-ai/plugin-sdk
 */
export class RequestContext {
	readonly id: number;
	request: Request;
	response: Response;

	constructor(request: Request, response: Response) {
		this.id = Math.random();
		this.request = request;
		this.response = response;
	}

	static currentRequestContext(): RequestContext {
		const session = cls.getNamespace(RequestContext.name);
		if (session && session.active) {
			return session.get(RequestContext.name);
		}

		return null;
	}

	static currentRequest(): Request {
		const requestContext = RequestContext.currentRequestContext();

		if (requestContext) {
			return requestContext.request;
		}

		return null;
	}

	static currentTenantId(): string {
		const user: IUser = RequestContext.currentUser();
		if (user) {
			return user.tenantId;
		}

		return null;
	}

	static currentUserId(): string {
		const user: IUser = RequestContext.currentUser();
		if (user) {
			return user.id;
		}
		return null;
	}

	static currentRoleId(): string {
		const user: IUser = RequestContext.currentUser();
		if (user) {
			return user.roleId;
		}
		return null;
	}

	static currentUser(throwError?: boolean): IUser {
		const requestContext = RequestContext.currentRequestContext();

		if (requestContext) {
			// tslint:disable-next-line
			const user: IUser = requestContext.request['user'];

			if (user) {
				return user;
			}
		}

		if (throwError) {
			throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
		}

		return null;
	}

	static hasPermission(
		permission: PermissionsEnum | string,
		throwError?: boolean
	): boolean {
		return this.hasPermissions([permission], throwError);
	}

	/**
	 * Retrieves the language code from the headers of the current request.
	 * @returns The language code (LanguagesEnum) extracted from the headers, or the default language (ENGLISH) if not found.
	 */
	static getLanguageCode(): LanguagesEnum {
		// Retrieve the current request
		const req = RequestContext.currentRequest();

		// Variable to store the extracted language code
		let lang: LanguagesEnum;

		// Check if a request exists
		if (req) {
			// Check if the 'language' header exists in the request
			if (req.headers && req.headers['language']) {
				// If found, set the lang variable
				lang = req.headers['language'] as LanguagesEnum;
			}
		}

		// Return the extracted language code or the default language (ENGLISH) if not found
		return lang || LanguagesEnum.English;
	}

	static getOrganizationId(): string {
		const req = this.currentRequest();
		let organizationId: string;
		const keys = ['organization-id'];
		if (req) {
			for (const key of keys) {
				if (req.headers && req.headers[key]) {
					organizationId = req.headers[key];
					break;
				}
			}
		}

		return organizationId;
	}

	static hasPermissions(
		findPermissions: Array<PermissionsEnum | string>,
		throwError?: boolean
	): boolean {
		const permissions = this.currentPermissions();
		if (permissions.length > 0) {
			const found = permissions.filter(
				(value) => findPermissions.indexOf(value) >= 0
			);
			if (found.length === findPermissions.length) {
				return true;
			}
		}

		if (throwError) {
			throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
		}
		return false;
	}

	static hasAnyPermission(
		findPermissions: PermissionsEnum[],
		throwError?: boolean
	): boolean {
		const permissions = this.currentPermissions();
		if (permissions.length > 0) {
			const found = permissions.filter(
				(value) => findPermissions.indexOf(value as PermissionsEnum) >= 0
			);
			if (found.length > 0) {
				return true;
			}
		}

		if (throwError) {
			throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
		}
		return false;
	}

	static currentToken(throwError?: boolean): any {
		const requestContext = RequestContext.currentRequestContext();

		if (requestContext) {
			// tslint:disable-next-line
			return ExtractJwt.fromAuthHeaderAsBearerToken()(
				requestContext.request as any
			);
		}

		if (throwError) {
			throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
		}
		return null;
	}

	/**
	 * Checks if the current user has a specific role.
	 * @param {RolesEnum} role - The role to check.
	 * @param {boolean} throwError - Flag indicating whether to throw an error if the role is not granted.
	 * @returns {boolean} - True if the user has the role, otherwise false.
	 */
	static hasRole(role: RolesEnum, throwError?: boolean): boolean {
		return this.hasRoles([role], throwError);
	}

	/**
	 * Checks if the current request context has any of the specified roles.
	 *
	 * @param roles - An array of roles to check.
	 * @param throwError - Whether to throw an error if no roles are found.
	 * @returns True if any of the required roles are found, otherwise false.
	 */
	static hasRoles(roles: RolesEnum[], throwError?: boolean): boolean {
		const context = RequestContext.currentRequestContext();
		if (context) {
			const role = this.currentUser()?.role?.name;
			if (role) {
				return roles.includes(role as RolesEnum);
			}
		}
		if (throwError) {
			throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
		}
		return false;
	}

	private static currentPermissions(): Array<PermissionsEnum | string> {
		const rolePermissions = this.currentUser()?.role?.rolePermissions;
		if (!rolePermissions?.length) {
			return [];
		}

		return rolePermissions
			.filter((rolePermission) => rolePermission?.enabled)
			.map((rolePermission) => rolePermission?.permission)
			.filter((permission): permission is PermissionsEnum | string => !!permission);
	}
}
