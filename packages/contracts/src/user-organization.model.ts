import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model';
import { LanguagesEnum, IUser } from './user.model';

export interface IUserOrganizationPreferences {
	defaultWorkspaceId?: string | null;
}

export interface IUserOrganization
	extends IBasePerTenantAndOrganizationEntityModel {
	userId: string;
	isDefault: boolean;
	isActive: boolean;
	preferences?: IUserOrganizationPreferences | null;
	user?: IUser;
}

export interface IUserOrganizationFindInput
	extends IBasePerTenantAndOrganizationEntityModel {
	id?: string;
	userId?: string;
	isDefault?: boolean;
	isActive?: boolean;
}

export interface IUserOrganizationCreateInput
	extends IBasePerTenantAndOrganizationEntityModel {
	userId: string;
	isDefault?: boolean;
	isActive?: boolean;
}

export interface IUserOrganizationDeleteInput {
	userOrganizationId: string;
	requestingUser: IUser;
	language?: LanguagesEnum;
}
