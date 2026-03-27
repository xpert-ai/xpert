import { IUser } from './user.model';
import { IBasePerTenantEntityModel } from './base-entity.model';
import { IRolePermission } from './role-permission.model';

export interface IRole extends IRoleCreateInput {
	isSystem?: boolean;
	rolePermissions?: IRolePermission[];
	users?: IUser[];
}

export interface IRoleCreateInput extends IBasePerTenantEntityModel {
	name: string
}

export enum RolesEnum {
	SUPER_ADMIN = 'SUPER_ADMIN',
	ADMIN = 'ADMIN',
	AI_BUILDER = 'AI_BUILDER',
	ANALYTICS_BUILDER = 'ANALYTICS_BUILDER',
	/**
	 * @deprecated
	 */
	DATA_ENTRY = 'DATA_ENTRY',
	/**
	 * @deprecated
	 */
	EMPLOYEE = 'EMPLOYEE',
	/**
	 * @deprecated
	 */
	CANDIDATE = 'CANDIDATE',
	/**
	 * @deprecated
	 */
	MANAGER = 'MANAGER',
	VIEWER = 'VIEWER',
	// Trial account
	TRIAL = 'TRIAL'
}

export const DEFAULT_SYSTEM_ROLES: RolesEnum[] = [
	RolesEnum.SUPER_ADMIN,
	RolesEnum.ADMIN,
	RolesEnum.TRIAL,
	RolesEnum.AI_BUILDER,
	RolesEnum.ANALYTICS_BUILDER,
	RolesEnum.VIEWER
]

export const LEGACY_DEFAULT_ROLES: RolesEnum[] = [
	RolesEnum.DATA_ENTRY,
	RolesEnum.EMPLOYEE,
	RolesEnum.CANDIDATE,
	RolesEnum.MANAGER
]

export interface IRoleMigrateInput extends IBasePerTenantEntityModel {
	name: string;
	isImporting: boolean;
	sourceId: string;
}
