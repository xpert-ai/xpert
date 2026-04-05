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

export interface IRoleMigrateInput extends IBasePerTenantEntityModel {
	name: string;
	isImporting: boolean;
	sourceId: string;
}
